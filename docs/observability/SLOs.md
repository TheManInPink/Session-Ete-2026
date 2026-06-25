# SLOs — Objectifs de niveau de service (Service Level Objectives) NINA-AES

> **Bloc concerné** : Transversal (référence pour tous les blocs A → F, chiffré d'abord sur le Bloc
> A). **Prérequis** : documents 00 → 18 lus ; stack observabilité (doc 17) et stratégie de tests +
> scénarios k6 (doc 18) compris. **Audience** : étudiant UQAR (soutenance), futurs mainteneurs
> CTDEC/AES, assistants IA opérant sur le repo. **Statut global de ce document : conçu / cible Phase
> 2** — la stack LGTM (doc 17) et les scénarios k6 (doc 18) ne sont **pas encore déployés/mesurés**.
> Les chiffres ci-dessous sont donc des **objectifs de conception** (⏳ « conçu, Phase 2 ») et non
> des mesures réelles. Aucune valeur présentée ici ne doit être annoncée en soutenance comme «
> atteinte » tant qu'un run k6 contre staging et un dashboard Grafana ne sont pas joints.
>
> **Référencé par** : doc 17 (alertes Alertmanager → seuils de cette page), doc 18 (`thresholds` k6
> → seuils de cette page). **Source de vérité** : ce fichier + `docs/deployment/OPS-RUNBOOK.md` (à
> venir) sont les **deux seules sources chiffrées** des SLO. Toute divergence entre une règle
> Alertmanager (doc 17), un `threshold` k6 (doc 18) et ce document est un **drift à corriger**.

---

## 1. Objectif pédagogique — pourquoi des SLO chiffrés (le POURQUOI avant le COMMENT)

Un système d'identité d'État qui promet « haute disponibilité » sans **chiffre** ne promet rien
d'opposable. Un SLO est un **contrat numérique interne** : il transforme une intention floue (« le
service doit être rapide ») en une cible mesurable (« P99 de `GET /citizens/:nina` < 200 ms sur 30
jours glissants »). Trois raisons rendent cet exercice indispensable ici :

1. **Défendabilité devant un audit.** Comme l'observabilité (doc 17), un SLO est une **preuve**.
   Sans cible chiffrée + mesure, on ne peut pas démontrer qu'un service d'enrôlement RAVEC tenait la
   charge un jour donné, ni qu'une lenteur observée violait un engagement.

2. **Arbitrage vélocité vs fiabilité (error budget).** Le SLO définit un **budget d'erreur** : la
   quantité d'indisponibilité/lenteur _tolérée_. Tant qu'il reste du budget, on peut livrer vite ;
   quand il est épuisé, on **gèle les releases** et on stabilise. C'est la mécanique qui empêche un
   étudiant seul (ou une équipe) de pousser des features par-dessus un service déjà fragile.

3. **Alignement code ↔ alertes ↔ tests.** Les mêmes chiffres vivent à **trois endroits** et doivent
   rester synchronisés : les seuils `thresholds` dans les scénarios k6 (doc 18), les `expr` des
   règles Alertmanager (doc 17), et le présent tableau. Un seul registre canonique évite la dérive
   silencieuse.

> 💡 **Distinction fondamentale SLI / SLO / SLA** (détaillée au §8) :
>
> - **SLI** (_Service Level Indicator_) = la **mesure** (« P99 latence observée »).
> - **SLO** (_Service Level Objective_) = la **cible interne** sur cette mesure (« P99 < 200 ms à 99
>   % du temps »). C'est l'objet de ce document.
> - **SLA** (_Service Level Agreement_) = l'**engagement contractuel externe** avec pénalité.
>   NINA-AES en V1 **n'a pas de SLA contractuel signé** (⏳ relève d'une convention CTDEC/AES
>   Phase 2) ; on définit donc des SLO internes **plus stricts** qu'un futur SLA, pour garder une
>   marge.

---

## 2. Périmètre — quels services, quel niveau d'exigence

L'effort SLO est **gradué** : on chiffre fort le Bloc A (cœur identité, exposé citoyen), et on
documente des cibles indicatives pour les blocs B → F (encore en spec/scaffold, cf.
`DOCUMENTATION-MAP.md`).

### 2.1 Classes de criticité

| Classe                   | Définition                                              | Services (port)                                                                                                                 |          Dispo cible | Error budget / 30 j |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------: | ------------------: |
| **CRITIQUE (Tier 1)**    | Cœur identité, chemin citoyen/USSD, intégrité de preuve | `identity-service` (3001), `auth-service` (3002), `audit-service` (3007), `api-gateway` (3000)                                  |           **99.5 %** |          3 h 39 min |
| **ESSENTIEL (Tier 2)**   | Fonctions de support directes au parcours               | `document-service` (3004), `ai-service` (3003), `ussd-service` (3014)                                                           |           **99.5 %** |          3 h 39 min |
| **STANDARD (Tier 3)**    | Support asynchrone, tolérant à une dégradation courte   | `notification-service` (3005), `appointment-service` (3008)                                                                     |           **99.0 %** |          7 h 18 min |
| **DIFFÉRÉ (Bloc B → F)** | Interop AES, gouvernance, SIGAC, biométrie, kiosque     | `interop` (3006), `governance` (3010), `anticorruption` (3009), `biometric` (3012), `enrollment` (3013), `vulnerability` (3011) | ⏳ à définir Phase 2 |                  ⏳ |

> 🔎 **Lecture du tableau** : un SLO de disponibilité de **99.5 % par service du Bloc A** signifie
> qu'au plus **0,5 %** d'un mois de 30 jours peut être « non conforme » (down ou dégradé au-delà des
> seuils de latence/erreur du §4). Soit **≈ 3 h 39 min** de budget d'indisponibilité mensuel par
> service. Le calcul exact est au §6.2.

### 2.2 Pourquoi 99.5 % (et pas 99.9 % ni 99.99 %)

Choisir un SLO trop ambitieux est une **erreur de débutant** : chaque « neuf » supplémentaire coûte
exponentiellement plus cher (redondance multi-AZ, bascule automatique, astreinte 24/7). Pour un
projet souverain mono-cluster K3s opéré par un étudiant/une petite équipe CTDEC :

| Dispo      | Indispo / mois | Indispo / an | Coût opérationnel réaliste                                                 |
| ---------- | -------------- | ------------ | -------------------------------------------------------------------------- |
| 99.0 %     | 7 h 18 min     | 3 j 15 h     | Atteignable sans astreinte nuit                                            |
| **99.5 %** | **3 h 39 min** | **1 j 19 h** | **Cible Bloc A** — exige restart rapide + observabilité, pas de HA stricte |
| 99.9 %     | 43 min 50 s    | 8 h 46 min   | Exige bascule auto + astreinte ; ⏳ cible Phase 2 production               |
| 99.99 %    | 4 min 23 s     | 52 min 36 s  | Hors de portée mono-cluster ; nécessite multi-site                         |

> 💡 **Honnêteté soutenance** : 99.5 % est une cible **crédible et défendable** pour un MVP étatique
> mono-cluster. On documente 99.9 % comme **trajectoire** (quand la HA K3s, le DRP doc 19 et le
> déploiement doc 20 seront effectifs), **pas** comme acquis V1.

---

## 3. Disponibilité (SLO de dispo)

### 3.1 Définition de « disponible »

La disponibilité n'est **pas** « le process tourne » mais « le service répond correctement ». On la
mesure par le **taux de succès des requêtes** sur la sonde et le trafic réel :

```promql
# SLI de disponibilité (sur 30 jours glissants), par service.
# « Bonne » requête = réponse non-5xx ET sous le budget de latence (cf. §4).
# On EXCLUT les 4xx légitimes (400/401/403/404/409/429) : une erreur client
# n'est PAS une indisponibilité du service.
sum(rate(http_requests_total{service="identity-service", status!~"5.."}[30d]))
/
sum(rate(http_requests_total{service="identity-service"}[30d]))
```

> ⚠️ **Piège classique** : compter un `429 Too Many Requests` (rate-limit, cf. doc 18 §4.11.3) ou un
> `403` (IDOR refusé, doc 18 §4.11.1) comme une indisponibilité **fausserait** le SLO à la baisse.
> Ces codes sont le **comportement attendu** d'un contrôle de sécurité, pas une panne. Le SLI ne
> pénalise que les **5xx** et les **timeouts**.

### 3.2 Cibles de disponibilité par service

| Service                | Classe    | SLO dispo (30 j) | Sonde / signal de mesure                               | Alerte liée (doc 17)                   |
| ---------------------- | --------- | ---------------: | ------------------------------------------------------ | -------------------------------------- |
| `api-gateway`          | CRITIQUE  |       **99.5 %** | `up{job="nina-services"}` + ratio non-5xx              | `ServiceDown`                          |
| `identity-service`     | CRITIQUE  |       **99.5 %** | `/health` Docker + ratio non-5xx                       | `ServiceDown`, `HighError5xxRate`      |
| `auth-service`         | CRITIQUE  |       **99.5 %** | `/health` + ratio non-5xx                              | `ServiceDown`                          |
| `audit-service`        | CRITIQUE  |       **99.5 %** | `/health` + **intégrité hash-chain** (cf. §3.3)        | `ServiceDown`, `AuditChainBreak`       |
| `document-service`     | ESSENTIEL |       **99.5 %** | `/health` + ratio non-5xx (signature QR Vault Transit) | `ServiceDown`                          |
| `ai-service`           | ESSENTIEL |       **99.5 %** | `/health` + ratio non-5xx (FastAPI)                    | `ServiceDown`, `AIInferenceLatencyP99` |
| `ussd-service`         | ESSENTIEL |       **99.5 %** | `/health` + délai réponse session USSD (cf. §4.4)      | `ServiceDown`                          |
| `notification-service` | STANDARD  |       **99.0 %** | `/health` + backlog RabbitMQ                           | `RabbitMQQueueBacklog`                 |
| `appointment-service`  | STANDARD  |       **99.0 %** | `/health` + ratio non-5xx                              | `ServiceDown`                          |

> 🔒 **Convention sonde** (cf. mémoire projet _Health route prefix convention_) : chaque service
> NestJS exclut `health` du préfixe `api/v1` afin que la sonde Docker `curl /health` matche. Le SLI
> de dispo combine cette sonde (liveness) avec le ratio non-5xx (succès applicatif réel).

### 3.3 Cas particulier `audit-service` — disponibilité ET intégrité

Pour l'audit, « disponible » ne suffit pas : le service peut répondre 200 tout en ayant une **chaîne
de preuve rompue**. On ajoute donc un **SLO d'intégrité** distinct, aligné sur le CANON sécurité.

| Aspect                   | SLI                                                   | SLO                         | Source                                |
| ------------------------ | ----------------------------------------------------- | --------------------------- | ------------------------------------- |
| Disponibilité écriture   | ratio écritures append-only réussies                  | 99.5 % / 30 j               | doc 09, §3.2                          |
| **Intégrité hash-chain** | `increase(audit_hashchain_break_total[30d])`          | **= 0 (zéro toléré)**       | ADR-007/014, doc 17 `AuditChainBreak` |
| Scellement horaire       | signatures Ed25519 in-process émises à l'heure prévue | 100 % des fenêtres scellées | doc 09 (Ed25519 @noble)               |

> 🔒 **CANON (ne pas régresser)** : l'audit NINA-AES est une **HASH-CHAIN SHA-256 linéaire**,
> **pas** un arbre de Merkle ; le scellement horaire est **Ed25519 in-process** (`@noble/ed25519`),
> car Vault Transit **ne supporte pas Ed25519** (ADR-026/034). Une rupture de hash-chain est traitée
> comme un **incident sécurité critique** (budget d'erreur = 0), pas comme un simple SLO dégradé.
> L'intégrité n'est _opposable_ que si la **racine périodique est ancrée chez un tiers** (OCLEI /
> Vérificateur Général — ADR-007/014).

---

## 4. Latence API (SLO de latence)

### 4.1 Pourquoi P50 ET P99 (et pas la moyenne)

La **moyenne** est trompeuse : une API à 50 ms de moyenne peut faire souffrir 5 % des citoyens à 3
secondes. On raisonne donc en **percentiles** :

- **P50 (médiane)** = expérience « typique ». La moitié des requêtes est plus rapide.
- **P99** = expérience « pire cas raisonnable ». 1 % des requêtes dépasse ce seuil — au pic
  d'enrôlement, ce 1 % représente des centaines de citoyens.

On exclut volontairement le P100 (max absolu) : un seul GC pause ou un cold start ne doit pas
définir le SLO.

### 4.2 Cible directrice : USSD / web < 500 ms

La contrainte produit forte est : **un parcours citoyen (web ou USSD) doit répondre en < 500 ms au
P99** côté API, pour rester fluide même sur réseau mobile malien dégradé. C'est la cible reprise
telle quelle dans le `threshold` k6 `http_req_duration: ['p(95)<500']` (doc 18 §4.7) et dans
l'alerte `HighLatencyP95` (doc 17, `> 0.5` s).

### 4.3 Tableau des SLO de latence par classe d'endpoint

| Endpoint / opération                        | Service          | SLO P50  | SLO P95      | SLO P99      | Aligné k6 (doc 18)                    | Aligné alerte (doc 17)             |
| ------------------------------------------- | ---------------- | -------- | ------------ | ------------ | ------------------------------------- | ---------------------------------- |
| `GET /citizens/:nina` (lecture)             | identity-service | < 60 ms  | < 120 ms     | **< 200 ms** | `nina-search.js` p95<120/p99<200      | `HighLatencyP95` (>500 ms)         |
| `POST /citizens` (écriture, pic enrôlement) | identity-service | < 150 ms | **< 500 ms** | < 1 500 ms   | `enrollment-peak.js` p95<500/p99<1500 | `HighLatencyP95`                   |
| Auth (login / refresh token)                | auth-service     | < 100 ms | < 300 ms     | < 600 ms     | (à ajouter Phase 2)                   | `HighLatencyP95`                   |
| Génération / signature QR (Vault Transit)   | document-service | < 120 ms | < 350 ms     | < 800 ms     | (à ajouter Phase 2)                   | `HighLatencyP95`                   |
| Détection IA (batch 100 records)            | ai-service       | < 2 s    | **< 5 s**    | **< 8 s**    | `ai-detection.js` p95<5s/p99<8s       | `AIInferenceLatencyP99` (>2 s/req) |
| Écriture audit chaînée (insert + hash)      | audit-service    | < 20 ms  | **< 50 ms**  | < 100 ms     | `audit-chain-write.js` p95<50ms       | —                                  |
| **Session USSD** (réponse menu, _cf. §4.4_) | ussd-service     | < 200 ms | **< 500 ms** | < 800 ms     | (à ajouter Phase 2)                   | `HighLatencyP95`                   |

> ⚠️ **Cohérence des deux percentiles k6/alerte** : l'alerte `HighLatencyP95` (doc 17) surveille le
> **P95** (`> 0.5 s`), tandis que plusieurs `thresholds` k6 (doc 18) imposent **P95 ET P99**. Ce
> sont deux fenêtres complémentaires : k6 valide en **test de charge** (avant déploiement),
> Alertmanager surveille en **production continue**. Les seuils P95 doivent rester **identiques**
> des deux côtés (500 ms pour les chemins citoyen). Le P99 ajoute une marge surveillée en charge.

```promql
# SLI de latence P99 — recalculé depuis l'histogramme Prometheus exposé par
# nestjs-prometheus / prometheus-fastapi-instrumentator (doc 17 §4.2-4.3).
# Identique à l'expr de l'alerte HighLatencyP95 (doc 17) au percentile près.
histogram_quantile(
  0.99,
  sum by (le, service) (rate(http_request_duration_seconds_bucket{service="identity-service"}[5m]))
)
```

### 4.4 Particularité USSD — la latence inclut l'opérateur

> ⏳ **Honnêteté (CANON)** : le SLO USSD ci-dessus mesure la **latence applicative interne**
> (`ussd-service` reçoit le webhook Africa's Talking → renvoie la réponse de menu). Il **n'inclut
> pas** la latence du réseau opérateur (GSM, Africa's Talking), qui échappe au cluster CTDEC et au
> SLO interne. Le risque résiduel opérateur (CDR Africa's Talking) est documenté côté sécurité
> (lanceur d'alerte / anti-corrélation). On chiffre donc ce qu'on **maîtrise** : le temps de
> traitement serveur, pas le bout-en-bout perçu sur le combiné.

---

## 5. Taux d'erreur (SLO d'erreurs)

### 5.1 Définition — distinguer 5xx (nous) de 4xx (le client)

Le **taux d'erreur SLO** ne compte que les fautes du **service** : `5xx` et timeouts. Les `4xx` sont
soit des erreurs client (mauvais NINA → 400), soit des **contrôles de sécurité fonctionnant
correctement** (401/403/409/429). Les confondre détruit le SLO.

| Code            | Compte dans le SLO d'erreur ? | Raison                                                      |
| --------------- | ----------------------------- | ----------------------------------------------------------- |
| `5xx` (500-599) | ✅ **Oui**                    | Faute serveur — c'est notre budget d'erreur                 |
| `timeout`       | ✅ **Oui**                    | Le service n'a pas répondu à temps                          |
| `400` / `422`   | ❌ Non                        | Entrée client invalide (NINA mal formé)                     |
| `401` / `403`   | ❌ Non                        | Auth/autorisation refusée — contrôle attendu (doc 18 §4.11) |
| `404`           | ❌ Non                        | Ressource inexistante (NINA inconnu)                        |
| `409`           | ❌ Non                        | Conflit métier (NINA dupliqué)                              |
| `429`           | ❌ Non                        | Rate-limit — contrôle anti-abus attendu (doc 18 §4.11.3)    |

### 5.2 Cibles de taux d'erreur

| Service / chemin           | SLO taux 5xx (30 j)   | k6 `http_req_failed` (doc 18) | Alerte (doc 17)                 |
| -------------------------- | --------------------- | ----------------------------- | ------------------------------- |
| Bloc A — chemin citoyen    | **< 1 %**             | `rate<0.01` (enrollment-peak) | `HighError5xxRate` (>1 % / 5 m) |
| `nina-search` (lecture)    | **< 0,5 %**           | `rate<0.005`                  | `HighError5xxRate`              |
| `ai-service` (inférence)   | **< 2 %**             | `rate<0.02` (ai-detection)    | —                               |
| `audit-service` (écriture) | **0 % (zéro toléré)** | `rate==0` (audit-chain-write) | `AuditChainBreak`               |

```promql
# SLI taux d'erreur 5xx — strictement la même expr que l'alerte HighError5xxRate (doc 17).
sum by (service) (rate(http_requests_total{status=~"5..", service="identity-service"}[5m]))
/
sum by (service) (rate(http_requests_total{service="identity-service"}[5m]))
```

> 🔒 **Audit = 0 % d'erreur toléré** : une écriture d'audit perdue est une **preuve perdue**. Le
> scénario k6 `audit-chain-write.js` impose `0 %` d'erreur et **0 rupture de hash-chain**. C'est le
> seul service avec un budget d'erreur nul (cf. §3.3).

---

## 6. Error budget et politique de gel des releases

### 6.1 Le concept — vélocité financée par la fiabilité

L'**error budget** est le complément du SLO : `budget = 100 % − SLO`. Pour 99.5 %, le budget est de
**0,5 %** du mois. Tant qu'il reste du budget, **on a le droit de prendre des risques** (livrer,
migrer, expérimenter). Quand il est épuisé, on **bascule en mode stabilisation** : plus aucune
release non corrective jusqu'à ce que le budget se reconstitue sur la fenêtre glissante.

> 💡 **Pourquoi c'est vertueux** : sans budget d'erreur, le débat « livrer vite vs rester stable »
> devient politique/émotionnel. Avec un budget chiffré, c'est **arithmétique** : on regarde le
> solde, il décide. Pour un étudiant seul, c'est aussi un garde-fou contre la tentation de pousser
> une feature de plus la veille d'une démo.

### 6.2 Calcul du budget (Bloc A, 99.5 %, fenêtre 30 j)

```text
Fenêtre              = 30 jours          = 43 200 minutes
SLO disponibilité    = 99.5 %
Error budget         = 0.5 %  × 43 200    = 216 minutes  ≈ 3 h 39 min / mois / service

Pour 99.0 % (Tier 3) : 1.0 % × 43 200     = 432 minutes  ≈ 7 h 18 min / mois / service
Pour 99.9 % (cible ⏳ Phase 2 prod) :        43.2 minutes ≈ 43 min 50 s / mois
```

Le **« burn rate »** (vitesse de consommation) déclenche les alertes : consommer le budget _trop
vite_ est aussi grave que le dépasser.

| Burn rate | Signification                                     | Budget mensuel consommé en | Action                             |
| --------- | ------------------------------------------------- | -------------------------- | ---------------------------------- |
| **14,4×** | Brûlure très rapide (multi-burn-rate court terme) | ~2 h                       | Alerte **critique** → page on-call |
| **6×**    | Brûlure rapide                                    | ~6 h                       | Alerte **warning**                 |
| **1×**    | Consommation nominale (on tient pile le SLO)      | 30 j                       | Surveillance normale               |
| **< 1×**  | Marge confortable                                 | > 30 j                     | Fenêtre de livraison ouverte       |

> ⏳ **Phase 2** : les alertes _multi-burn-rate_ (14,4× / 6×) sont **conçues** mais pas encore
> codées en règles Prometheus (la doc 17 livre `HighLatencyP95`, `HighError5xxRate`, `ServiceDown`…
> mais pas encore de règle `ErrorBudgetBurn`). Spécification de la règle à ajouter dans
> `infrastructure/observability/rules/nina-aes-slo.yml` :

```yaml
# ⏳ Phase 2 — règle d'error budget à AJOUTER (cf. doc 17 §4.6 rules/nina-aes-slo.yml).
# Détecte une brûlure rapide du budget d'erreur (fenêtre courte 1h + longue 5m).
- alert: ErrorBudgetBurnFast
  expr: |
    (
      sum by (service) (rate(http_requests_total{status=~"5.."}[1h]))
      / sum by (service) (rate(http_requests_total[1h]))
    ) > (14.4 * 0.005)          # 14,4× le budget 0,5 % (SLO 99,5 %)
  for: 2m
  labels: { severity: critical, domain: slo }
  annotations:
    summary: "Burn rate 14,4× du budget d'erreur sur {{ $labels.service }} — gel releases"
    runbook: 'docs/observability/RUNBOOK.md#error-budget-burn'
```

### 6.3 Politique de gel des releases (release freeze)

| État du budget (fenêtre 30 j)          | Niveau           | Politique de release                                                           |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| **> 50 % restant**                     | 🟢 Vert          | Livraison normale. Features + refactors autorisés.                             |
| **10 % – 50 % restant**                | 🟡 Orange        | Livraison prudente : revue PR renforcée, pas de migration risquée le vendredi. |
| **< 10 % restant**                     | 🔴 Rouge         | **Gel partiel** : seuls correctifs de fiabilité/sécurité. Features bloquées.   |
| **Budget épuisé (SLO violé)**          | ⛔ Gel total     | **Release freeze complet** : uniquement hotfix + post-mortem obligatoire.      |
| **Rupture hash-chain audit (≠ dispo)** | 🚨 Incident sécu | Hors budget : déclenchement immédiat `AuditChainBreak` + runbook sécurité.     |

> 💡 **Articulation CI/CD (doc 16)** : le gel se traduit concrètement par un **garde-fou en
> pipeline** (⏳ Phase 2) — un job CI lit le solde de budget (requête Prometheus) et **échoue les
> déploiements non-`fix:`** quand l'état est 🔴/⛔. Tant que ce garde-fou n'est pas câblé, le gel
> est **manuel** : l'opérateur décide sur la base du dashboard Grafana « SLO / Error budget » (à
> provisionner, doc 17 §4.7).

> 🔒 **Exception sécurité (CANON)** : un correctif de sécurité (patch CVE, durcissement auth/audit,
> fix anti-corrélation lanceur d'alerte) **n'est jamais gelé**. La politique de gel protège la
> fiabilité, elle ne doit jamais retarder un correctif d'intégrité ou de confidentialité.

---

## 7. Alignement avec k6 (doc 18) et Alertmanager (doc 17) — registre anti-drift

Ce paragraphe est le **point de synchronisation unique**. Tout chiffre ci-dessous doit être
identique dans les trois lieux (ce doc / `thresholds` k6 / `expr` Prometheus).

| Grandeur surveillée         | SLO (ce doc)             | `threshold` k6 (doc 18 §4.7)      | Règle Alertmanager (doc 17 §4.6)    |
| --------------------------- | ------------------------ | --------------------------------- | ----------------------------------- |
| Latence P95 chemin citoyen  | < 500 ms                 | `http_req_duration: p(95)<500`    | `HighLatencyP95` (`> 0.5`)          |
| Latence P99 écriture enrôl. | < 1 500 ms               | `p(99)<1500`                      | (surveillé via P95 ; P99 en charge) |
| Taux d'erreur 5xx (citoyen) | < 1 %                    | `http_req_failed: rate<0.01`      | `HighError5xxRate` (`> 0.01`)       |
| Latence P99 inférence IA    | < 8 s (req) / 2 s alerte | `ai-detection p(99)<8s`           | `AIInferenceLatencyP99` (`> 2.0`)   |
| Latence P95 écriture audit  | < 50 ms                  | `audit-chain-write p(95)<50ms`    | —                                   |
| Intégrité hash-chain audit  | 0 rupture                | 0 rupture (`previousHash` chaîné) | `AuditChainBreak` (`increase > 0`)  |
| Service up (dispo)          | 99.5 % / 30 j            | `status 201` check                | `ServiceDown` (`up == 0`)           |
| Disque libre                | > 10 %                   | —                                 | `DiskSpaceLow` (`< 0.10`)           |
| Pool Postgres               | < 80 %                   | —                                 | `PostgresConnectionsHigh` (`> 0.8`) |
| Backlog RabbitMQ            | < 1 000 msgs             | —                                 | `RabbitMQQueueBacklog` (`> 1000`)   |

> ⚠️ **Honnêteté (doc 18 §4.7)** : `nina-search` à 1 000 req/s et `audit-chain-write` à 500 writes/s
> sont des **cibles conçues**, à **mesurer réellement** contre staging avant de les présenter comme
> acquises. Tant qu'aucun run k6 n'est joint, ces SLO restent marqués **⏳ Phase 2 — à mesurer**.

---

## 8. Tableau récapitulatif SLI / SLO / SLA

C'est la synthèse exigée : pour chaque dimension, l'**indicateur mesuré (SLI)**, la **cible interne
(SLO)** et l'**engagement externe (SLA)**.

| Dimension            | SLI (ce qu'on mesure)                               | SLO (cible interne, Bloc A)             | SLA (engagement externe)                            |
| -------------------- | --------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| **Disponibilité**    | ratio requêtes non-5xx + sonde `up` / 30 j          | **99.5 %** (Tier 1/2) · 99.0 % (Tier 3) | ⏳ Aucun SLA signé V1 (convention CTDEC Phase 2)    |
| **Latence lecture**  | `histogram_quantile(0.99, …)` `GET /citizens/:nina` | P99 **< 200 ms**                        | ⏳ non engagé V1                                    |
| **Latence écriture** | P95/P99 `POST /citizens`                            | P95 **< 500 ms** · P99 < 1 500 ms       | ⏳ non engagé V1                                    |
| **Latence USSD/web** | P99 réponse applicative (hors réseau opérateur)     | P99 **< 500 ms**                        | ⏳ non engagé (réseau GSM hors périmètre)           |
| **Taux d'erreur**    | ratio 5xx / total (4xx exclus)                      | **< 1 %** (citoyen) · < 0,5 % (lecture) | ⏳ non engagé V1                                    |
| **Latence IA**       | P99 inférence batch                                 | P99 < 8 s (alerte à 2 s)                | ⏳ non engagé V1                                    |
| **Intégrité audit**  | `increase(audit_hashchain_break_total[30d])`        | **= 0** (zéro toléré)                   | Exigence réglementaire (ADR-007/014, ancrage tiers) |
| **Error budget**     | `100 % − dispo observée` + burn rate                | 0,5 % / 30 j (≈ 3 h 39 min)             | n/a (mécanique interne de gel)                      |

> 💡 **Pourquoi pas de SLA V1** : un SLA est un **engagement contractuel avec pénalité** envers un
> tiers (ministère, partenaire AES). Le signer suppose une **mesure historique fiable** (plusieurs
> mois de données SLI) et une gouvernance de l'astreinte. NINA-AES V1 (MVP étudiant, stack
> observabilité non encore déployée) ne peut **honnêtement** pas s'y engager. On construit d'abord
> les SLO + l'historique de mesure ; le SLA viendra avec la mise en production opérée (doc 20) et la
> convention CTDEC/AES. **Marquer ainsi en soutenance : SLO = oui (cibles), SLA = ⏳ Phase 2.**

---

## 9. Méthode de mesure et reporting

### 9.1 D'où viennent les chiffres

| SLI                 | Source de mesure                                                            | Statut                                |
| ------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| Disponibilité / 5xx | Prometheus (`http_requests_total`) via `nestjs-prometheus` / FastAPI instr. | ⏳ Phase 2 (doc 17 non déployé)       |
| Latence P50/P95/P99 | Prometheus histogrammes (`http_request_duration_seconds_bucket`)            | ⏳ Phase 2                            |
| Intégrité audit     | métrique `audit_hashchain_break_total` (audit-service)                      | ⏳ Phase 2                            |
| Charge / capacité   | k6 (`thresholds`, export Prometheus remote-write) contre **staging**        | ⏳ Phase 2 (à mesurer)                |
| Error budget / burn | requête PromQL dérivée + dashboard Grafana « SLO »                          | ⏳ Phase 2 (dashboard à provisionner) |

### 9.2 Cadence de revue

| Revue                       | Fréquence            | Livrable                                                                 |
| --------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Solde error budget          | Continue (dashboard) | Panel Grafana « SLO / Error budget » (⏳ doc 17 §4.7)                    |
| Revue SLO                   | Mensuelle            | Statut vert/orange/rouge par service + décisions de gel                  |
| Recalibrage des cibles      | Trimestrielle        | Ajuster les SLO selon l'historique réel (ni trop laxiste ni trop strict) |
| Post-mortem (budget épuisé) | À chaque violation   | Analyse de cause racine, sans blâme, action corrective tracée            |

> 💡 **Anti-fétichisme** (en écho à la doc 18 §1) : un SLO n'est pas une fin. S'il est **toujours**
> vert sans effort, il est trop laxiste (on pourrait livrer plus vite). S'il est **toujours** rouge,
> il est irréaliste (on démoralise et on ignore les alertes). La revue trimestrielle existe pour
> garder les cibles **tendues mais atteignables**.

---

## 10. Honnêteté et limites (récapitulatif des marqueurs ⏳)

Pour la soutenance, voici l'inventaire clair de ce qui est **conçu** vs **mesuré** :

| Élément                                     | Statut                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| Cibles SLO chiffrées (dispo/latence/erreur) | ✅ **Définies** (ce document)                           |
| Mesure réelle des SLI (Prometheus/Grafana)  | ⏳ **Phase 2** — stack LGTM doc 17 non déployée         |
| Runs k6 contre staging                      | ⏳ **Phase 2** — scénarios écrits (doc 18), non mesurés |
| Règle Prometheus `ErrorBudgetBurn`          | ⏳ **Phase 2** — spécifiée §6.2, non codée              |
| Gel des releases automatisé en CI           | ⏳ **Phase 2** — manuel via dashboard en attendant      |
| SLA contractuel externe                     | ⏳ **Phase 2** — aucune convention signée V1            |
| SLO Bloc A intégrité audit (hash-chain = 0) | ✅ **Défini + aligné CANON** (ADR-007/014)              |
| SLO Blocs B → F                             | ⏳ **À définir Phase 2** (services en spec/scaffold)    |

> 🔒 **Règle d'or de présentation** : ne jamais dire « le service tient 99.5 % » mais « le SLO
> **cible** est 99.5 %, **à mesurer** une fois l'observabilité (doc 17) déployée et les runs k6
> (doc 18) joints ». La crédibilité d'une soutenance d'ingénierie tient à cette distinction.

---

## 11. Références croisées

| Document                              | Lien                                                             |
| ------------------------------------- | ---------------------------------------------------------------- |
| Monitoring & observabilité (alertes)  | `docs/17-MONITORING-OBSERVABILITY.md` §4.6 (règles Alertmanager) |
| Stratégie de tests (scénarios k6)     | `docs/18-TESTING-STRATEGY.md` §4.7 (`thresholds` SLO chiffrés)   |
| Runbook de triage par alerte          | `docs/observability/RUNBOOK.md` (⏳ à créer, doc 17)             |
| Source de vérité SLO (ops)            | `docs/deployment/OPS-RUNBOOK.md` §SLO (⏳ à créer, doc 18 §7)    |
| Audit hash-chain (intégrité)          | `docs/09-BACKEND-AUDIT-SERVICE.md` + ADR-007 / ADR-014           |
| CI/CD (gate de gel)                   | `docs/16-CICD-GITHUB-ACTIONS.md` §4.3                            |
| Backup / DRP (RTO/RPO, distincts SLO) | `docs/19-BACKUP-RECOVERY.md` + ADR-019                           |
| Déploiement prod (HA → 99.9 %)        | `docs/20-DEPLOYMENT-K3S-PRODUCTION.md` + ADR-020                 |
| ADR observabilité                     | `docs/adr/ADR-017-observabilite-lgtm-stack.md`                   |
| ADR sécurité (PKI, mTLS, ancrage)     | ADR-034 + `docs/security/THREAT-MODEL.md`, `SECURITY-RUNBOOK.md` |

---

_Document SLOs — Version 1.0 (cibles conçues, mesure Phase 2) — Juin 2026_ _NINA-AES Platform — UQAR
— CONFIDENTIEL_
