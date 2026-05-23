# ADR-017 — Observabilité : stack LGTM (Loki + Grafana + Tempo + Prometheus/Mimir) + OpenTelemetry + Pino

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [17 — Monitoring & Observabilité](../17-MONITORING-OBSERVABILITY.md) **Complète** :
[ADR-010 — Infrastructure Docker Compose](./ADR-010-infrastructure-docker-compose.md),
[ADR-014 — Audit event-driven append-only](./ADR-014-audit-event-driven-append-only.md),
[ADR-016 — CI/CD GitHub Actions](./ADR-016-cicd-github-actions.md)

---

## Contexte

NINA-AES Platform comprend 11 microservices (NestJS + FastAPI) qui manipulent des **données
d'identité d'État** : émission de NINA, validation biométrique, audit append-only Merkle-chaîné,
signalements SIGAC chiffrés. Trois exigences fondamentales pour l'observabilité :

1. **Démontrabilité d'audit** : reconstruire ce qu'a fait n'importe quel service à n'importe quelle
   minute pendant les 30 derniers jours. Devant un auditeur ANSSI / OCLEI, l'absence de logs
   structurés exploitables = perte de l'agrément.

2. **Détection précoce de dégradation** : SLO 99.5 % sur `/api/nina/*`, latence p95 < 500 ms. Toute
   dérive doit être alertée < 10 min.

3. **Souveraineté numérique absolue** : aucune donnée d'identité ne doit transiter par un SaaS
   américain (Datadog, New Relic, Splunk Cloud, Sumologic, Grafana Cloud). La stack d'observabilité
   doit être 100 % auto-hébergeable sur infra AES.

Contraintes pratiques :

- **PII jamais en clair** : les NINA (15 chars), les hashs biométriques, les dates de naissance
  doivent être caviardés **automatiquement** côté logger, pas par discipline humaine (qui sera
  oubliée).
- **Performance** : émission de log < 5 µs par appel (sinon impact mesurable sur p95 des endpoints).
  Élimine d'office les loggers synchrones.
- **Coût léger en dev** : étudiant solo avec Docker Compose, 16 GB RAM poste de travail.

---

## Décision

La stack **LGTM** de Grafana Labs est retenue :

- **L**oki 3.5 — stockage de logs indexés par labels (TSDB-like, économe en cardinalité, retention
  30j)
- **G**rafana 12.3 — UI unifiée dashboards + alerting + datasource manager
- **T**empo 2.7 — stockage de traces distribuées OTLP (retention 7j)
- **M**imir (futur — pour rétention longue Prometheus) — pas en V1
- **Prometheus 3.4** — collecte des métriques (TSDB local, retention 15j)
- **Promtail 3.5** — agent ship logs containers → Loki
- **OpenTelemetry Collector 0.119** — **routeur** OTLP unique entre les services applicatifs et les
  3 backends (Prometheus / Loki / Tempo)
- **Alertmanager 0.28** — routing notif (email/Slack/PagerDuty mock)

Côté code applicatif :

- **Pino 9** (Node) + **structlog 25** (Python) — loggers structurés JSON performants
- **`@nina-aes/logger`** — package shared qui embarque la configuration Pino + transport Loki HTTP +
  **redaction PII automatique** (NINA, fingerprintHash, dateNaissance, password, token, …)
- **OpenTelemetry SDK Node** + **opentelemetry-instrumentation-fastapi** — auto-instrumentation
  HTTP/Prisma/ioredis/SQLAlchemy → traces OTLP
- **nestjs-prometheus** (NestJS) + **prometheus-fastapi-instrumentator** (FastAPI) — endpoint
  `/metrics` + histogrammes HTTP par défaut

Tout le flux applicatif passe par un **unique endpoint OTLP** (le Collector local,
`otel-collector:4317`). Le Collector éclate ensuite vers les 3 backends. Conséquence : changer Loki
en ElasticSearch, ou Tempo en Jaeger, demande de **modifier 1 fichier YAML** sans toucher au code
des 11 services.

---

## Conséquences positives

- **Souveraineté garantie** : tous les composants sont AGPL/Apache 2.0, installés via Docker images
  officielles. Aucun ping vers un SaaS.
- **3 piliers unifiés** : Grafana sert métriques, logs et traces avec **corrélation native** (clic «
  TraceID » dans un log Loki ouvre la trace Tempo correspondante).
- **PII safe by construction** : `@nina-aes/logger` redact les 12 champs sensibles dans Pino même
  avant transport. Test unitaire `redacts nina field` garantit la non-régression.
- **OpenTelemetry-first** : standard CNCF, neutre vis-à-vis du backend. Bascule vers
  Mimir/Coroot/eBPF triviale.
- **Performance Pino** : ~1 µs/log en mode JSON brut, ~5 µs avec redact — négligeable devant les
  latences applicatives.
- **Coût en dev** : profile Compose `--profile observability` séparé. On le démarre uniquement quand
  on en a besoin (~1 GB RAM supplémentaire).
- **Provisioning déclaratif** : datasources + dashboards + alerting rules sont des fichiers
  YAML/JSON commités — versionnés, revus par PR, immutables entre déploiements.

---

## Conséquences négatives

- **6 nouveaux containers** à comprendre (OTel Collector, Prometheus, Loki, Tempo, Promtail,
  Grafana, Alertmanager). Courbe d'apprentissage pour un étudiant solo : ~3 jours pour maîtriser
  l'essentiel.
- **Cardinality risk Prometheus** : un label de haute cardinalité (ex. `user_id`) peut faire
  exploser la RAM. Discipline nécessaire + audit régulier via
  `count by (__name__)({__name__=~".+"})`.
- **Tempo retention courte (7j)** : les traces ne sont pas adaptées pour audit légal long-terme
  (l'audit est dans la table `audit_logs` Postgres, ADR-014). Pas un défaut, mais une limite à
  connaître.
- **Stack pas adaptée à très haute charge** : Loki single-binary mode tient ~10 GB logs/jour.
  Au-delà : passer en mode microservices Loki + S3 storage. Hors scope V1.
- **Grafana auth basique** : en dev, admin/password local. En prod, il faudra brancher Keycloak OIDC
  sur Grafana (cf. doc 15).

---

## Note sur la souveraineté numérique

Le risque principal de la stack LGTM est la **tentation Grafana Cloud** : quand on aime l'UI
Grafana, on est aspiré vers la version SaaS. Le projet NINA-AES interdit cette bascule :

1. **Grafana auto-hébergé** sur `grafana.aes.internal` derrière le reverse proxy interne. Les
   snapshots de dashboards restent dans le namespace `observability` du cluster K3s — jamais
   exportés.
2. **Pas de Grafana Agent connecté à Grafana Cloud**. On utilise Promtail + OTel Collector
   self-hosted.
3. **Datasource Tempo/Loki locale uniquement** : aucune connexion sortante vers les domaines
   `grafana.net` ou `prometheus.io` n'est configurée.

Pour un déploiement gouvernemental réel, la stack est portable vers tout provider open-source
équivalent (VictoriaMetrics + ClickHouse + Vector si les volumes l'exigent — cf. §10 doc 17).

---

## Alternatives rejetées

- **Datadog** : SaaS US (Boston). Excellent produit, intégration triviale, mais (a) coûteux à
  l'échelle (~$23/host/mois × 11 services × 3 envs = $759/mois), (b) données souveraines transitant
  aux États-Unis = exclu.

- **New Relic** : même profil que Datadog. Rejeté pour les mêmes raisons.

- **ELK Stack (Elasticsearch + Logstash + Kibana)** : open-source mais consommation RAM très lourde
  (Elasticsearch 2+ GB par nœud minimum, Logstash JVM 1 GB). Performant mais sur-dimensionné pour 11
  microservices dev. Justifiable en prod >100 services. Aussi : licensing Elastic 2.0 ambigu (pas
  vraiment open-source depuis 2021).

- **Graylog** : alternative ELK plus légère. Moins riche en intégrations qu'ELK ou LGTM, communauté
  plus petite. Pas de remplaçant Tempo natif.

- **VictoriaMetrics + ClickHouse + Vector** : stack performante (10× moins RAM que LGTM à charge
  égale) mais courbe d'apprentissage abrupte + documentation moins didactique. Pertinent en
  optimisation Phase 2 quand les volumes l'exigent. Trop spécialisé pour un étudiant solo en
  apprentissage.

- **Jaeger** (vs Tempo) : excellent produit, UI native pour les traces. Rejeté car (a) Tempo
  s'intègre nativement à Grafana (1 datasource, 1 UI, corrélation logs↔traces gratuite), (b) Jaeger
  demande Cassandra ou Elasticsearch comme backend — bagage opérationnel additionnel.

- **OpenSearch** (fork open-source Elasticsearch) : alternative pour les logs. Même problème de
  consommation que Elastic. Pas de Tempo équivalent.

- **Sentry** (errors) : excellent pour le tracking d'erreurs frontend, mais ne couvre pas
  métriques/traces/logs systèmes. Complément pertinent en Phase 2 si l'équipe veut un view dédié
  erreurs applicatives.

- **Pas d'observabilité** (« on regardera les logs Docker en cas de problème ») : option « rapide »
  au début, **catastrophique** quand un incident arrive sur un système d'identité d'État. Rejeté
  sans hésitation.

---

## Suivi

Métriques à observer pendant les 4 semaines suivant l'activation :

| Métrique                                      | Cible               | Outil de mesure                                 |
| --------------------------------------------- | ------------------- | ----------------------------------------------- | -------------------- |
| Latence ingestion Loki                        | p95 < 500 ms        | `loki_distributor_lines_received_total`         |
| Volume logs / jour                            | < 5 GB en dev       | `du -sh /var/lib/docker/volumes/nina-loki-data` |
| Cardinality série Prometheus                  | < 50 000            | `prometheus_tsdb_head_series`                   |
| Taux de fuite NINA dans Loki                  | **= 0**             | `logcli query '{}                               | ~ "189\d{12}[A-Z]"'` |
| Taux d'alertes triées via runbook             | > 80 %              | manuel — feedback étudiant tuteur               |
| Temps moyen de résolution d'une alerte (MTTR) | < 30 min            | manuel — labels Jira `obs-*`                    |
| Couverture instrumentation OTel               | 100 % services HTTP | onglet Tempo → service map                      |
| Taux faux positifs alertes / semaine          | < 3                 | manuel                                          |

Si la **cardinality Prometheus** dépasse 50 000 séries, ou si un NINA est trouvé dans Loki (test
attendu = 0), déclencher une revue ADR (créer ADR-017-bis ou amender celle-ci avec « Révision
YYYY-MM-DD »).
