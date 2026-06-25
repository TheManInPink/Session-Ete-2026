# RUNBOOK — Procédures de triage des alertes (Observabilité NINA-AES)

> **Statut global : conçu / cible Phase 2 — ⏳ la stack LGTM n'est pas encore déployée** (ni
> Prometheus, ni Alertmanager, ni les règles d'alerting). Ce runbook est le **livret de bord
> opérationnel** qui sera utilisé dès que l'observabilité passera en intégration. Il est rédigé pour
> être **autonome** : un opérateur d'astreinte CTDEC doit pouvoir l'ouvrir à 3h du matin et savoir
> exactement quoi faire, sans connaître le code.
>
> **Document de référence** :
> [`docs/17-MONITORING-OBSERVABILITY.md`](../17-MONITORING-OBSERVABILITY.md) (étape 4.6 — règles
> d'alerting). **Chaque** règle Alertmanager définie au doc 17 porte une annotation `runbook:` qui
> pointe vers une **ancre** de ce fichier. La table de correspondance ci-dessous garantit qu'aucune
> alerte ne pointe vers le vide.

---

## 0. Pourquoi ce runbook existe (le POURQUOI avant le COMMENT)

Une alerte qui ne demande **rien** à personne est du bruit ; un opérateur qui reçoit du bruit finit
par ignorer **toutes** les alertes, y compris la seule qui comptait (la fatigue d'alerte). La règle
canonique de l'étape (doc 17 §1, leçon 3) est donc : **pas de protocole = pas d'alerte**. Ce fichier
_est_ l'ensemble des protocoles.

Trois principes structurent chaque procédure :

1. **Symptôme → Diagnostic → Remédiation → Escalade → Post-mortem.** Toujours dans cet ordre. On ne
   remédie jamais avant d'avoir diagnostiqué (sauf alerte sécurité critique où l'isolation précède
   le diagnostic, cf. [`#audit-chain-break`](#audit-chain-break)).
2. **Aucune requête de diagnostic n'expose de NINA en clair.** Les requêtes Loki/PromQL de ce
   runbook sont écrites pour ne **jamais** afficher d'identifiant souverain. Un NINA ne doit jamais
   devenir un label Prometheus (cardinalité + fuite) ni apparaître dans un résultat de query partagé
   en incident. Si un diagnostic exige de corréler un citoyen précis, on le fait par
   `correlation-id` (UUID de requête), **jamais** par NINA.
3. **Souveraineté.** Aucune escalade ne route vers un SaaS US (Slack/PagerDuty/Opsgenie). Les canaux
   sont : email SMTP on-prem (`ops@ctdec.gov.ml`), Matrix/Synapse souverain (SOC), webhook interne
   (SIEM/bridge d'incidents). Cf. doc 17 §4.6 (`alertmanager.yml`).

> ⚠️ **Sécurité des requêtes de diagnostic** : ne **jamais** copier-coller un résultat brut de Loki
> dans un ticket sans l'avoir relu. Le hook Pino + le filet collector `transform/redact-nina`
> caviardent les NINA (`\b\d{14}[A-Z]\b` → `***NINA-REDACTED***`), mais un opérateur reste
> responsable de ne pas réintroduire de PII dans un canal moins protégé (Jira, email). En cas de
> doute : caviarder à la main.

---

## 1. Table de correspondance alerte → ancre runbook

Cette table doit rester **synchronisée** avec les annotations `runbook:` du doc 17 (étape 4.6,
fichier `rules/nina-aes-slo.yml`). Toute alerte ajoutée au doc 17 doit recevoir ici une ancre.

| Alerte Prometheus            | Sévérité   | Domaine       | Ancre runbook                                              |
| ---------------------------- | ---------- | ------------- | ---------------------------------------------------------- |
| `AuditChainBreak`            | `critical` | security      | [`#audit-chain-break`](#audit-chain-break)                 |
| `HighError5xxRate`           | `critical` | —             | [`#error-rate-5xx`](#error-rate-5xx)                       |
| `ServiceDown`                | `critical` | —             | [`#service-down`](#service-down)                           |
| `LokiIngestionDown`          | `critical` | observability | [`#loki-ingestion-down`](#loki-ingestion-down)             |
| `HighLatencyP95`             | `warning`  | —             | [`#high-latency-p95`](#high-latency-p95)                   |
| `AIInferenceLatencyP99`      | `warning`  | —             | [`#ai-inference-latency-p99`](#ai-inference-latency-p99)   |
| `NinaValidationFailureSpike` | `warning`  | business      | [`#nina-validation-spike`](#nina-validation-spike)         |
| `DiskSpaceLow`               | `warning`  | —             | [`#disk-space-low`](#disk-space-low)                       |
| `PostgresConnectionsHigh`    | `warning`  | —             | [`#postgres-connections-high`](#postgres-connections-high) |
| `RabbitMQQueueBacklog`       | `warning`  | —             | [`#rabbitmq-queue-backlog`](#rabbitmq-queue-backlog)       |
| `NodeHeapPressure`           | `warning`  | —             | [`#node-heap-pressure`](#node-heap-pressure)               |
| `EventLoopLag`               | `warning`  | —             | [`#event-loop-lag`](#event-loop-lag)                       |
| `MinIOReplicationLag` ⏳     | `warning`  | backup        | [`#minio-replication-lag`](#minio-replication-lag)         |

> 💡 `MinIOReplicationLag` n'est pas encore dans `rules/nina-aes-slo.yml` (doc 17 en compte 12) ; il
> est **conçu en coordination avec** [`docs/19-BACKUP-RECOVERY.md`](../19-BACKUP-RECOVERY.md)
> (réplication active-active MinIO inter-sites). La section est fournie ici pour que la règle puisse
> être ajoutée sans créer d'ancre orpheline. **Statut : conçu, Phase 2.**

---

## 2. Procédure générique de prise en charge (à appliquer AVANT toute section)

Pour **toute** alerte, dans l'ordre :

1. **Accuser réception** dans le canal d'astreinte (Matrix SOC) — éviter le double-traitement.
2. **Confirmer que l'alerte est réelle** (pas un flap) : ouvrir Prometheus
   `http://localhost:9090/alerts` → l'alerte est-elle toujours `firing` ?
3. **Mesurer le rayon d'impact** : 1 service ? 1 zone ? tout le cluster ? Dashboard Grafana « Golden
   Signals ».
4. **Silence si nécessaire** (maintenance connue) :
   ```bash
   # Silence 2h d'une alerte connue/planifiée (évite le spam pendant une migration).
   amtool silence add alertname="HighLatencyP95" --duration=2h \
     --comment="migration DB planifiée — ticket obs-NN" --author="$USER"
   ```
5. Ouvrir la **section dédiée** ci-dessous et suivre le pas-à-pas.
6. **Ouvrir un ticket** `obs-<NN>` (Jira on-prem) si l'incident dure > 15 min ou est `critical`.
7. À la résolution : remplir le **post-mortem** (cf. [§4](#4-modèle-de-post-mortem)).

> 📌 Convention : `<service>` ci-dessous désigne la valeur du label `service` de l'alerte
> (`identity-service`, `auth-service`, `audit-service`, `document-service`, `ai-service`,
> `anticorruption-service`, …). Toutes les commandes `kubectl` supposent le contexte K3s de prod ;
> en dev local, remplacer par l'équivalent `docker compose`.

---

## Alertes critiques

### `audit-chain-break`

**Alerte** : `AuditChainBreak` · **Sévérité** : `critical` · **Domaine** : `security` **Expression**
: `increase(audit_hashchain_break_total[1h]) > 0`

#### Symptôme

Le compteur `audit_hashchain_break_total` a augmenté : au moins un maillon de la **hash-chain
SHA-256** de l'audit (ADR-007/ADR-014) ne vérifie plus `hash(n) == H(entrée_n || hash(n-1))`.
Concrètement : **quelqu'un (ou quelque chose) a altéré, supprimé ou réordonné un enregistrement
d'audit**, ou la chaîne a divergé d'un défaut d'intégrité.

> 🔒 **CANON (ADR-007)** : l'audit NINA-AES est une **hash-chain SHA-256 linéaire**, **PAS** un
> arbre de Merkle. Ne jamais renommer la métrique ou parler de « merkle » dans l'incident. La chaîne
> n'a de valeur probante que si sa **racine est ancrée chez un tiers** (OCLEI / Vérificateur
> Général) et **scellée** périodiquement en Ed25519 in-process (`@noble/ed25519`, doc 09). Une
> rupture de chaîne = soit compromission, soit bug d'écriture — les deux sont traités comme
> **incident de sécurité** jusqu'à preuve du contraire.

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Confirmer l'ampleur : combien de ruptures, sur quelle fenêtre ?
#    (PromQL — aucune donnée personnelle, juste un compteur)
increase(audit_hashchain_break_total[6h])

# 2) Localiser dans les logs SANS afficher le contenu des entrées d'audit.
#    On filtre sur le mot-clé technique "hashchain" ; les NINA éventuels sont
#    déjà caviardés par le hook Pino + le filet collector transform/redact-nina.
{service="audit-service"} |= "hashchain" |= "break" | json | line_format "{{.ts}} seq={{.seq}} expected={{.expectedHash}} got={{.actualHash}}"
```

```sql
-- 3) Identifier le PREMIER maillon rompu en base, par numéro de séquence.
--    On NE sélectionne PAS le payload (peut contenir des refs NINA) : seulement
--    les colonnes d'intégrité. Lecture seule.
SELECT seq, created_at, prev_hash, curr_hash
FROM audit.audit_logs
WHERE seq BETWEEN :suspected_start AND :suspected_end
ORDER BY seq ASC;
-- Le maillon rompu = première ligne où curr_hash != SHA256(payload || prev_hash).
-- Comparer prev_hash(n) avec curr_hash(n-1) : la rupture est là où ils divergent.
```

#### Remédiation pas-à-pas

> 🚨 **CRITIQUE — INTERVENTION IMMÉDIATE. L'isolation PRÉCÈDE le diagnostic approfondi.**

1. **Isoler** le service d'audit pour figer l'état (stopper toute écriture supplémentaire) :
   ```bash
   kubectl scale deploy/audit-service --replicas=0 -n nina-services
   ```
2. **Préserver les preuves** — dump des tables d'audit avant toute action (chaîne de conservation) :
   ```bash
   # Snapshot horodaté, conservé hors du nœud potentiellement compromis.
   pg_dump --schema=audit nina_aes_db > /backup/audit-incident-$(date +%s).sql
   sha256sum /backup/audit-incident-*.sql >> /backup/incident-evidence.sha256
   ```
3. **Vérifier l'ancrage tiers** : la dernière **racine ancrée** chez OCLEI / Vérificateur Général
   est-elle antérieure à la rupture ? Si oui, on dispose d'un point de vérité externe pour borner la
   falsification.
4. **Vérifier le dernier scellement Ed25519** (doc 09) : signature horaire valide jusqu'à quelle
   séquence ? Tout ce qui est postérieur au dernier scellé valide est suspect.
5. **NE PAS redéployer** `audit-service` ni « réparer » la chaîne sans **go formel du CISO**.
   Réécrire la chaîne détruirait la preuve.

#### Escalade

| Délai    | Action                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Immédiat | Notifier **CISO CTDEC** (email + appel) + canal Matrix SOC `#nina-sec-crit`. |
| < 30 min | Notifier l'**ANSSI Mali** (point de contact incident d'État).                |
| < 1 h    | Geler les déploiements sur tout le périmètre audit (freeze CI/CD).           |

> Récepteurs : `severity="critical"` → Matrix SOC + email ; `domain="security"` → webhook SOC (cf.
> `alertmanager.yml`, doc 17 §4.6). **Aucun** canal US.

#### Post-mortem

Obligatoire (incident sécurité). Cf. [§4](#4-modèle-de-post-mortem). Questions clés : vecteur
d'altération (accès DB direct ? bug d'écriture concurrente ? compromission de credential Vault ?),
fenêtre temporelle bornée par l'ancrage tiers, et durcissement (révocation AppRole/SA, rotation
secrets, append-only renforcé). Lien CANON : ADR-007, ADR-014, ADR-034 ;
`docs/security/THREAT-MODEL.md`, `docs/security/SECURITY-RUNBOOK.md`.

---

### `error-rate-5xx`

**Alerte** : `HighError5xxRate` · **Sévérité** : `critical` **Expression** :
`sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m])) > 0.01`

#### Symptôme

Plus de **1 %** des réponses HTTP d'un service sont des 5xx sur 5 minutes. Les citoyens/agents
voient des erreurs serveur (enrôlement qui échoue, validation NINA en 500, etc.).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Quel statut exact domine (500 vs 502/503/504) et sur quelle route ?
#    Le label `path` est TEMPLATISÉ (/nina/{id}), donc PAS de NINA dedans.
topk(5, sum by (service, status, path) (rate(http_requests_total{status=~"5.."}[5m])))

# 2) Corréler avec une trace lente/échouée dans Tempo (par service, pas par NINA).
#    Grafana → Tempo → Search → service.name=<service> status=error

# 3) Logs d'erreur — on s'appuie sur le niveau, pas sur le contenu citoyen.
{service="<service>"} | json | level="error" | line_format "{{.ts}} {{.err.type}} {{.err.message}}"
```

#### Remédiation pas-à-pas

1. **502/503/504** → le service est saturé ou down en aval : vérifier
   [`#service-down`](#service-down) et la santé des dépendances (DB, Redis, RabbitMQ, MinIO).
2. **500** → erreur applicative : identifier l'exception dominante (étape diag #3). Si elle coïncide
   avec un déploiement récent :
   ```bash
   # Corréler avec le dernier déploiement.
   kubectl rollout history deploy/<service> -n nina-services
   # Rollback si la régression est confirmée.
   kubectl rollout undo deploy/<service> -n nina-services
   ```
3. **Mitigation de capacité** (si pic de charge, pas de bug) :
   ```bash
   kubectl scale deploy/<service> --replicas=4 -n nina-services
   ```

#### Escalade

`critical` → Matrix SOC + email ops. Si le service est `identity-service`/`auth-service` (parcours
citoyen bloqué à l'échelle) ou si rollback ne résout pas en < 30 min → escalade au lead backend +
CISO si suspicion d'attaque (corréler avec WAF, doc 15).

#### Post-mortem

Requis si > 30 min ou impact parcours citoyen. Cf. [§4](#4-modèle-de-post-mortem).

---

### `service-down`

**Alerte** : `ServiceDown` · **Sévérité** : `critical` **Expression** :
`up{job="nina-services"} == 0`

#### Symptôme

Prometheus ne parvient plus à scraper `/metrics` d'un service depuis ≥ 2 min : le service est
considéré **indisponible** (crash, OOM, déploiement raté, réseau coupé).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Quel(s) instance(s) sont DOWN ?
up{job="nina-services"} == 0

# 2) État des pods.
kubectl get pods -n nina-services -l app=<service>
kubectl describe pod <pod> -n nina-services   # Events: OOMKilled ? CrashLoopBackOff ?

# 3) Derniers logs avant la chute (50 dernières lignes, pas de contenu citoyen ciblé).
kubectl logs <pod> -n nina-services --previous --tail=50
```

#### Remédiation pas-à-pas

1. **OOMKilled** → relever la limite mémoire ou corriger la fuite (cf.
   [`#node-heap-pressure`](#node-heap-pressure)) :
   ```bash
   kubectl set resources deploy/<service> -n nina-services --limits=memory=1Gi
   ```
2. **CrashLoopBackOff** → cause dans les logs `--previous`. Souvent : secret Vault manquant (lease
   expiré, `VAULT_TOKEN` jamais en clair — vérifier l'AppRole/SA), migration DB échouée, ou config
   invalide. **Piège connu** : en dev, Vault perd ses secrets au restart → relancer
   `pnpm vault:bootstrap`.
3. **Faux positif Prometheus** : le service tourne mais écoute `127.0.0.1` au lieu de `0.0.0.0`
   (piège doc 17 §6) → forcer `app.listen(port, '0.0.0.0')`.
4. **Health endpoint** : vérifier que `/health` est exclu du préfixe `api/v1` (convention projet)
   sinon la sonde Docker échoue et le pod redémarre en boucle.

#### Escalade

`critical` → Matrix SOC + email ops. Si plusieurs services DOWN simultanément → suspecter l'infra
partagée (Postgres, réseau, nœud K3s) → escalade infra/lead immédiate.

#### Post-mortem

Requis. Cf. [§4](#4-modèle-de-post-mortem).

---

### `loki-ingestion-down`

**Alerte** : `LokiIngestionDown` · **Sévérité** : `critical` · **Domaine** : `observability`
**Expression** : `rate(loki_distributor_lines_received_total[5m]) == 0`

#### Symptôme

Loki ne reçoit **plus aucune ligne de log** depuis 5 min. **Perte de traçabilité** : pendant ce
trou, on est aveugle. C'est `critical` car une attaque pourrait exploiter cette cécité, et parce que
l'absence de logs d'audit/accès est un risque de conformité.

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Loki est-il vivant et prêt ?
curl -fsS http://localhost:3100/ready          # attendu: "ready"
kubectl get pods -n observability -l app=loki

# 2) Le problème est-il l'ingestion (Promtail/pino-loki) ou Loki lui-même ?
rate(loki_distributor_lines_received_total[5m])   # 0 = rien n'arrive
#    Piège classique (doc 17 §6) : "entry too far behind" = horloge désynchro (NTP).

# 3) Promtail / transport pino-loki côté services.
kubectl logs -n observability -l app=promtail --tail=50 | grep -i error
```

#### Remédiation pas-à-pas

1. **Loki down** → redémarrer ; vérifier le volume (`nina-loki-data`) non plein (cf.
   [`#disk-space-low`](#disk-space-low)).
2. **`entry too far behind`** → resynchroniser l'horloge (NTP/chrony actif sur les hôtes).
3. **Transport `pino-loki` en `ECONNREFUSED`** → Loki pas prêt au boot du service ; le retry
   built-in absorbe les flaps, mais si persistant ajouter
   `depends_on: { condition: service_healthy }`.
4. **Backpressure** : si Loki rejette pour quota, vérifier `loki.yml` (limites ingestion,
   `compactor.retention_enabled`).

#### Escalade

`critical` + `domain=observability` → Matrix SOC + webhook SOC. Comme c'est une perte de visibilité,
**prévenir le SOC** que les détections log-based sont dégradées pendant la panne.

#### Post-mortem

Requis (perte de traçabilité). Documenter la **durée du trou** de logs. Cf.
[§4](#4-modèle-de-post-mortem).

---

## Alertes warning

### `high-latency-p95`

**Alerte** : `HighLatencyP95` · **Sévérité** : `warning` **Expression** :
`histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))) > 0.5`

#### Symptôme

La latence **p95** d'un service dépasse **500 ms** sur 10 min : 1 requête sur 20 est lente. Viole le
SLO « p95 < 500 ms sur tous les endpoints publics » (doc 17 §7, `SLOs.md`).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Latence p95 par route (path templatisé → pas de NINA).
topk(5, histogram_quantile(0.95, sum by (le, service, path) (rate(http_request_duration_seconds_bucket[5m]))))

# 2) 1 endpoint ou tous ? Si 1 → trace la plus lente dans Tempo.
#    Grafana → panel → "View traces" → trier par durée décroissante.

# 3) Dépendance lente ? (DB pool, cache miss, appel inter-service)
histogram_quantile(0.95, sum by (le, db_system) (rate(db_client_operation_duration_seconds_bucket[5m])))
```

#### Remédiation pas-à-pas

1. **Une route précise lente** → ouvrir la trace Tempo correspondante. Causes fréquentes : N+1
   Prisma, pool DB saturé (cf. [`#postgres-connections-high`](#postgres-connections-high)), appel
   aval lent.
2. **Toutes les routes lentes** → saturation globale : CPU/heap (cf.
   [`#node-heap-pressure`](#node-heap-pressure), [`#event-loop-lag`](#event-loop-lag)).
3. **Mitigation immédiate** (capacité) :
   ```bash
   kubectl scale deploy/<service> --replicas=4 -n nina-services
   ```
4. **Suivi** : ticket `obs-<NN>` avec lien dashboard + trace.

#### Escalade

`warning` → email ops (pas de réveil nocturne sauf dégradation continue > 1h ou bascule en 5xx). Si
la latence dégrade vers des 5xx → traiter comme [`#error-rate-5xx`](#error-rate-5xx).

#### Post-mortem

Optionnel sauf récurrence. Cf. [§4](#4-modèle-de-post-mortem).

---

### `ai-inference-latency-p99`

**Alerte** : `AIInferenceLatencyP99` · **Sévérité** : `warning` **Expression** :
`histogram_quantile(0.99, sum by (le) (rate(ai_inference_duration_seconds_bucket[5m]))) > 2.0`

#### Symptôme

La latence **p99** de l'inférence IA (`ai-service`, FastAPI) dépasse **2 s** sur 10 min : modèle
dégradé, file d'inférence pleine, ou ressources GPU/CPU saturées.

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Distribution de latence (p50/p95/p99) — agrégats, aucune donnée citoyen.
histogram_quantile(0.99, sum by (le) (rate(ai_inference_duration_seconds_bucket[5m])))
histogram_quantile(0.50, sum by (le) (rate(ai_inference_duration_seconds_bucket[5m])))

# 2) Le débit a-t-il explosé (backlog) ?
rate(ai_inference_duration_seconds_count[5m])

# 3) Erreurs/timeouts d'inférence ?
{service="ai-service"} | json | level="error" |= "inference"
```

#### Remédiation pas-à-pas

1. **Backlog (débit en hausse)** → scaler `ai-service` ou augmenter la concurrence du worker
   d'inférence.
2. **p50 normal mais p99 haut** → quelques requêtes pathologiques (gros documents) : vérifier les
   limites de taille d'entrée.
3. **Tout est lent** → ressources : CPU/RAM (ou GPU si applicable). Vérifier le chargement du modèle
   (cold start après redéploiement).
4. **Modèle dégradé** → vérifier la version de modèle servie (`ai-models/exported/metadata.json`) et
   rollback vers la version stable si une mise à jour récente coïncide.

#### Escalade

`warning` → email ops. Si l'IA bloque un parcours métier critique (validation d'enrôlement) →
escalade au lead IA.

#### Post-mortem

Optionnel sauf si lié à un déploiement de modèle. Cf. [§4](#4-modèle-de-post-mortem).

---

### `nina-validation-spike`

**Alerte** : `NinaValidationFailureSpike` · **Sévérité** : `warning` · **Domaine** : `business`
**Expression** : `rate(identity_citizens_validated_total{result="failure"}[5m]) > 1`

#### Symptôme

Pic d'**échecs de validation NINA** (> 1/s sur 5 min). Deux hypothèses opposées : **attaque**
(énumération / brute-force d'identifiants) ou **bug applicatif** récent (régression de validation).

> 🔒 **Diagnostic sans NINA** : on raisonne sur des **agrégats** (taux par IP, par route) et des
> `correlation-id`, **jamais** sur des NINA individuels. Le label `path` est templatisé
> (`/nina/validate`), il ne contient pas l'identifiant. Ne jamais ajouter le NINA comme label.

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Source concentrée ou dispersée ? (par IP — métadonnée réseau, pas un NINA)
sum by (ip) (rate(http_requests_total{path="/nina/validate",status="400"}[5m]))

# 2) Classe d'échec dominante (checksum invalide, NINA inexistant, format) —
#    on lit la CLASSE d'erreur, jamais la valeur.
sum by (error_class) (rate(identity_citizens_validated_total{result="failure"}[5m]))

# 3) Régression récente ? Corréler avec le dernier déploiement.
kubectl rollout history deploy/identity-service -n nina-services
```

#### Remédiation pas-à-pas

1. **Une IP dominante** → attaque ciblée : blocage WAF (doc 15) + rate-limit serré (ex. 5
   req/min/IP).
2. **Dispersé + déploiement récent** → suspecter un bug : `git log --since="1 hour"` → rollback
   `identity-service` si la régression est confirmée.
3. **Attaque distribuée** (botnet) → **alerter le SOC** + rate-limit global + envisager défi
   (captcha/PoW) sur l'endpoint de validation.

#### Escalade

`warning` + `domain=business`. Si l'analyse penche vers une **attaque** → re-qualifier en incident
sécurité et notifier le SOC (Matrix). Si bug → lead backend.

#### Post-mortem

Requis si attaque confirmée (lien `docs/security/THREAT-MODEL.md`). Cf.
[§4](#4-modèle-de-post-mortem).

---

### `disk-space-low`

**Alerte** : `DiskSpaceLow` · **Sévérité** : `warning` **Expression** :
`(node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.10`

#### Symptôme

Un point de montage a **< 10 %** d'espace libre sur 5 min. Risque imminent : crash des écritures
(Postgres, Loki, MinIO), et — piège connu du projet — une écriture sous `ENOSPC` peut **tronquer un
fichier à 0 octet** (cache Turbo, doc mémoire projet).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Quel volume, quel nœud ?
(node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.10

# 2) Sur le nœud concerné : qui consomme ?
kubectl debug node/<node> -it --image=busybox -- df -h
#    Suspects fréquents : .turbo (peut atteindre ~26 GB), volumes Loki/Tempo/Prometheus,
#    dumps pg_dump oubliés dans /backup, logs containers Docker.
```

#### Remédiation pas-à-pas

1. **Cache de build** (`.turbo`) saturé → purger (restaurer via git tout fichier tronqué à 0 octet,
   cf. mémoire projet « Turbo cache sature le disque »).
2. **Volumes observabilité** → vérifier que les rétentions sont appliquées : Prometheus 15j, Loki
   30j (`compactor.retention_enabled: true`, `retention_period: 720h`), Tempo 7j.
3. **Dumps oubliés** → archiver les `audit-incident-*.sql` / `pg_dump` hors du nœud.
4. **Urgence** → étendre le volume (PVC resize) si la cause est légitime (croissance de données).

> ⚠️ Ne jamais supprimer un dump d'**incident audit** sans confirmation : c'est une preuve.

#### Escalade

`warning` → email ops. Si le volume Postgres ou audit est concerné → escalade infra **avant**
saturation totale (sinon corruption → bascule possible vers `critical`).

#### Post-mortem

Optionnel sauf si saturation a causé une perte/corruption. Cf. [§4](#4-modèle-de-post-mortem).

---

### `postgres-connections-high`

**Alerte** : `PostgresConnectionsHigh` · **Sévérité** : `warning` **Expression** :
`sum by (datname) (pg_stat_activity_count) / pg_settings_max_connections > 0.8`

#### Symptôme

Le pool de connexions Postgres dépasse **80 %** de `max_connections` sur une base, sur 5 min. Risque
: nouvelles connexions refusées → cascade de 5xx.

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Quelle base, quel taux ?
sum by (datname) (pg_stat_activity_count) / pg_settings_max_connections

# 2) Connexions idle-in-transaction (fuite de pool fréquente) ?
sum by (state) (pg_stat_activity_count)
```

```sql
-- 3) Top consommateurs par application/état (PAS de payload, donc pas de NINA).
SELECT datname, usename, application_name, state, count(*)
FROM pg_stat_activity
GROUP BY 1,2,3,4
ORDER BY count(*) DESC;
```

#### Remédiation pas-à-pas

1. **`idle in transaction` élevé** → fuite applicative : transaction non `COMMIT`/`ROLLBACK`.
   Identifier le service (`application_name`) et corriger / rollback.
2. **Trop de réplicas × pool size** → réduire la taille de pool par instance ou introduire un
   **pooler** (PgBouncer) en transaction pooling.
3. **Mitigation immédiate** — terminer les sessions idle anciennes (avec prudence) :
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND state_change < now() - interval '10 minutes';
   ```

#### Escalade

`warning` → email ops. Si saturation imminente (> 95 %) → escalade infra immédiate (risque
indisponibilité multi-services).

#### Post-mortem

Optionnel sauf fuite de pool récurrente. Cf. [§4](#4-modèle-de-post-mortem).

---

### `rabbitmq-queue-backlog`

**Alerte** : `RabbitMQQueueBacklog` · **Sévérité** : `warning` **Expression** :
`rabbitmq_queue_messages_ready > 1000`

#### Symptôme

Une file RabbitMQ accumule **> 1000** messages prêts (non consommés) sur 10 min : les consumers sont
en panne, trop lents, ou absents. Risque métier : **événements d'audit en retard** (cf. canon :
`document-service` publie sur `audit.events`, `audit-service` consomme `nina.audit` + `nina.events`
— un drift de topologie peut laisser des events non captés).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Quelle file, combien de consumers ?
topk(5, rabbitmq_queue_messages_ready)
rabbitmq_queue_consumers                     # 0 consumer = personne ne lit

# 2) Le service consumer est-il vivant ?
kubectl get pods -n nina-services -l app=audit-service

# 3) Drift de topologie ? Vérifier que routing keys publishers == bindings consumers.
#    (cf. mémoire projet "Audit RabbitMQ topology drift")
```

#### Remédiation pas-à-pas

1. **0 consumer** → le service consumer est down ([`#service-down`](#service-down)) → le relancer ;
   le backlog se résorbe.
2. **Consumers présents mais lents** → scaler le consumer ou augmenter le prefetch :
   ```bash
   kubectl scale deploy/audit-service --replicas=3 -n nina-services
   ```
3. **Drift de topologie** (messages publiés sur une routing key sans binding) → réconcilier côté
   **publishers** (exchange/routing key) ; ne pas perdre les events déjà en DLQ.
4. **Empoisonnement** (message qui fait crasher le consumer en boucle) → router vers la DLQ et
   inspecter (sans logger le payload citoyen).

#### Escalade

`warning` → email ops. Si la file est `audit.*` (intégrité/traçabilité) → escalade prioritaire, car
un retard d'audit affaiblit la valeur probante.

#### Post-mortem

Requis si events d'audit perdus. Cf. [§4](#4-modèle-de-post-mortem).

---

### `node-heap-pressure`

**Alerte** : `NodeHeapPressure` · **Sévérité** : `warning` **Expression** :
`nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.9`

#### Symptôme

Un service Node (NestJS) utilise **> 90 %** de son heap V8 sur 10 min : **risque d'OOM** imminent
(le pod sera `OOMKilled`, cf. [`#service-down`](#service-down)).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Tendance du heap : pic ponctuel ou croissance monotone (= fuite) ?
nodejs_heap_size_used_bytes{service="<service>"}

# 2) GC sous pression ?
rate(nodejs_gc_duration_seconds_sum[5m])

# 3) Corréler avec le trafic : croissance heap proportionnelle à la charge,
#    ou indépendante (fuite) ?
rate(http_requests_total{service="<service>"}[5m])
```

#### Remédiation pas-à-pas

1. **Croissance monotone même à charge constante** → **fuite mémoire** : capturer un heap snapshot
   (`--inspect`) hors prod, identifier la rétention. Rollback si lié à un déploiement.
2. **Pic lié à la charge** → augmenter la limite mémoire / `--max-old-space-size`, ou scaler.
3. **Mitigation immédiate** → redémarrage glissant pour éviter l'OOM brutal :
   ```bash
   kubectl rollout restart deploy/<service> -n nina-services
   ```

#### Escalade

`warning` → email ops. Si OOMKilled répété (CrashLoopBackOff) → bascule en `critical` via
[`#service-down`](#service-down) → escalade lead backend.

#### Post-mortem

Requis si fuite mémoire confirmée. Cf. [§4](#4-modèle-de-post-mortem).

---

### `event-loop-lag`

**Alerte** : `EventLoopLag` · **Sévérité** : `warning` **Expression** :
`nodejs_eventloop_lag_seconds > 0.1`

#### Symptôme

L'event loop d'un service Node est bloqué **> 100 ms** sur 5 min : du travail **synchrone** (CPU)
gèle la boucle, dégradant **toutes** les requêtes (cf. corrélation avec
[`#high-latency-p95`](#high-latency-p95)).

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Lag dans le temps : continu ou par à-coups ?
nodejs_eventloop_lag_seconds{service="<service>"}

# 2) Corréler avec CPU et latence p95.
rate(process_cpu_seconds_total{service="<service>"}[5m])

# 3) Quelle opération synchrone ? Tempo : spans longs sans I/O dans le service.
```

#### Remédiation pas-à-pas

1. **Travail CPU synchrone** (crypto lourde, parsing JSON géant, boucle bloquante) → déporter sur un
   **worker thread** ou rendre asynchrone.
2. **Sérialisation/hashing en masse** (ex. recalcul de hash-chain) → batcher / streamer.
3. **Mitigation immédiate** → scaler horizontalement pour diluer la charge :
   ```bash
   kubectl scale deploy/<service> --replicas=4 -n nina-services
   ```

#### Escalade

`warning` → email ops. Souvent symptôme d'un autre problème (heap, CPU) ; corréler avant
d'escalader.

#### Post-mortem

Optionnel sauf récurrence ou cause systémique. Cf. [§4](#4-modèle-de-post-mortem).

---

### `minio-replication-lag`

**Alerte** : `MinIOReplicationLag` ⏳ · **Sévérité** : `warning` · **Domaine** : `backup`
**Expression (cible)** : `minio_bucket_replication_latency_seconds > 300`

> ⏳ **Conçu, Phase 2.** Cette règle n'est pas encore dans `rules/nina-aes-slo.yml` (doc 17 en liste
> 12). Elle est définie ici en **coordination avec**
> [`docs/19-BACKUP-RECOVERY.md`](../19-BACKUP-RECOVERY.md) (réplication MinIO inter-sites). La
> section existe pour que la règle puisse être ajoutée sans ancre orpheline. La métrique exacte
> dépend de l'exporter MinIO retenu.

#### Symptôme

Le **retard de réplication** d'un bucket MinIO (documents/images d'enrôlement chiffrés) dépasse le
seuil (~5 min) : le site secondaire diverge du primaire → **objectif RPO** (doc 19) menacé. En cas
de sinistre du primaire, les derniers objets non répliqués seraient perdus.

#### Diagnostic (sans exposer de NINA)

```bash
# 1) Retard de réplication par bucket (agrégat technique, aucun contenu d'objet).
minio_bucket_replication_latency_seconds

# 2) File de réplication en attente.
minio_bucket_replication_pending_count

# 3) Statut côté client mc (lecture seule).
mc replicate status nina/<bucket>
```

> 🔒 Les objets MinIO sont **chiffrés** (les images biométriques ne sont jamais stockées en clair,
> et aucune image brute n'est conservée — canon biométrie ISO 24745). Le diagnostic porte sur la
> **métadonnée de réplication** (latence, file), **jamais** sur le contenu des objets.

#### Remédiation pas-à-pas

1. **Lien réseau inter-sites saturé/coupé** → vérifier la connectivité primaire↔secondaire ;
   réamorcer la réplication une fois le lien rétabli.
2. **Site secondaire down/plein** → vérifier sa santé et son espace disque
   ([`#disk-space-low`](#disk-space-low)).
3. **Backlog de réplication** → augmenter la bande passante/parallélisme de réplication MinIO ;
   forcer une resynchronisation :
   ```bash
   mc replicate resync start nina/<bucket> --remote-bucket <site-secondaire>/<bucket>
   ```
4. Vérifier l'alignement avec les objectifs **RPO/RTO** de
   [`docs/19-BACKUP-RECOVERY.md`](../19-BACKUP-RECOVERY.md).

#### Escalade

`warning` + `domain=backup` → email ops + responsable continuité (PCA/PRA). Si le retard dépasse le
**RPO contractuel**, escalade prioritaire (risque de perte de données en cas de sinistre).

#### Post-mortem

Requis si RPO dépassé. Cf. [§4](#4-modèle-de-post-mortem). Lien : ADR-019.

---

## 3. Commandes utiles (aide-mémoire)

```bash
# Lister les alertes actives.
amtool alert query

# Mettre/lever un silence.
amtool silence add <matcher> --duration=1h --comment="..." --author="$USER"
amtool silence expire <silence-id>

# Vérifier qu'une expression de règle pointe bien vers une ancre existante de ce fichier
# (toute valeur runbook: doit correspondre à un titre ## ci-dessus).
grep -o 'RUNBOOK.md#[a-z0-9-]*' docs/17-MONITORING-OBSERVABILITY.md | sort -u
```

> ✅ **Invariant de cohérence** : chaque ancre `#…` référencée par une annotation `runbook:` du doc
> 17 **doit** exister comme titre `###` dans ce fichier (voir
> [§1](#1-table-de-correspondance-alerte--ancre-runbook)). Les 12 alertes du doc 17 sont couvertes ;
> `minio-replication-lag` est en avance de phase (⏳).

---

## 4. Modèle de post-mortem

Tout incident `critical`, ou tout `warning` dépassant 1h / impactant le parcours citoyen, donne lieu
à un post-mortem **sans blâme** (blameless). Modèle :

```markdown
### Post-mortem — <alertname> — JJ/MM/AAAA

- **Sévérité** : critical / warning
- **Durée** : début (détection) → fin (résolution)
- **Impact** : services touchés, parcours citoyen affecté ? perte de données ?
- **Détection** : alerte Prometheus / signalement manuel
- **Chronologie** : horodatage des actions clés (sans NINA en clair)
- **Cause racine** : (5 pourquoi)
- **Remédiation appliquée** :
- **Actions de durcissement** : (tickets obs-<NN> / sec-<NN>)
- **Leçons** :
- **Lien CANON / ADR** : ADR-007/014 (audit), ADR-019 (backup), ADR-034 (sécurité),
  docs/security/THREAT-MODEL.md, docs/security/SECURITY-RUNBOOK.md
```

> 🔒 **Hygiène PII dans le post-mortem** : ne jamais coller un NINA, une image biométrique, un
> MSISDN ou une donnée d'état civil. Utiliser des `correlation-id` (UUID) et des agrégats. Un
> post-mortem est un document partagé : il doit rester sûr à diffuser en interne.

---

## 5. Références

- [`docs/17-MONITORING-OBSERVABILITY.md`](../17-MONITORING-OBSERVABILITY.md) — stack LGTM, étape 4.6
  (règles d'alerting) et étape 4.8 (ce runbook).
- [`docs/19-BACKUP-RECOVERY.md`](../19-BACKUP-RECOVERY.md) — réplication MinIO, RPO/RTO
  (`minio-replication-lag`).
- `docs/adr/ADR-007-*` / `docs/adr/ADR-014-*` — audit **hash-chain SHA-256** (jamais Merkle).
- `docs/adr/ADR-017-observabilite-lgtm-stack.md` — choix LGTM vs ELK vs SaaS.
- `docs/adr/ADR-019-backup-recovery-strategy.md` — stratégie sauvegarde/réplication.
- `docs/adr/ADR-034-*` — ADR sécurité (PKI interne, mTLS export OTLP).
- `docs/security/THREAT-MODEL.md` · `docs/security/SECURITY-RUNBOOK.md`.

---

_RUNBOOK Observabilité — NINA-AES Platform — UQAR — CONFIDENTIEL — conçu, cible Phase 2_
