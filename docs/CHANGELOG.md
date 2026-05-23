# CHANGELOG documentation — NINA-AES Platform

> Journal des écarts entre la documentation initiale (rédigée à l'ouverture du projet) et l'état
> réel du code après les sessions PROMPT 1.2 → 1.5 et les incidents d'exécution résolus en chemin.
>
> **Dernière mise à jour** : 1ᵉʳ mai 2026

Quand un document `.md` numéroté contredit le code, **le code fait foi** et ce CHANGELOG renvoie à
la commande / au fichier qui matérialise la décision.

---

## 1. Stack technique — versions effectives (avril–mai 2026)

| Composant                    | Doc initiale                                  | **Réel courant**                                                             |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Prisma + `@prisma/client`    | 7.7.0 (PROMPT 1.3)                            | **7.8.0**                                                                    |
| Moteur Prisma                | « library » binaire embarqué                  | **« client » + driver adapter** (`@prisma/adapter-pg` + `pg`)                |
| Image PostgreSQL             | `postgres:18.3-alpine3.22`                    | **`postgis/postgis:18-3.6`** (intègre `postgis` + ext. requises)             |
| Locale Postgres              | `--locale=fr_FR.UTF-8`                        | **`--locale-provider=icu --icu-locale=fr-FR --encoding=UTF8`**               |
| Volume Postgres              | `nina-postgres-data:/var/lib/postgresql/data` | **`nina-postgres-data:/var/lib/postgresql`** (parent — exigence Postgres 18) |
| Compose & .env               | implicite                                     | **`docker compose --env-file .env -f …`** (script `docker:up` mis à jour)    |
| Vitest (`packages/database`) | `^2.2.0`                                      | **`^4.1.5`** (la 2.2 n'existait pas)                                         |
| TypeScript root tsconfig     | `moduleResolution: node`, `baseUrl`           | **`NodeNext`**, `baseUrl` retiré, placeholder `scripts/typecheck.ts`         |

## 2. Packages monorepo — état effectif

| Package                  | Statut               | Notes                                                                                                                                                                                                                      |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nina-aes/shared-types` | ✅ aligné PROMPT 1.2 | 11 enums, 16 interfaces (Location 10 champs, Citizen + fingerprintHash + vulnerabilityCategory, AuditLog + entityType/entityId/oldValue/newValue/ipAddress/merkleHash, etc.), DTOs Zod synchronisés                        |
| `@nina-aes/database`     | ✅ aligné PROMPT 1.3 | 16 modèles Prisma, 10 enums, GIN trigram, soft-delete (callback `defineExtension`), `previewFeatures = ["driverAdapters", "postgresqlExtensions", "relationJoins"]`                                                        |
| `@nina-aes/config`       | ✅ aligné PROMPT 1.4 | Schéma Zod exhaustif, singleton paresseux via Proxy, `dotenv-expand` pour `${VAR}`, 9 tests Jest                                                                                                                           |
| `@nina-aes/utils`        | ✅ aligné PROMPT 1.4 | `nina.ts` (normalize/format/mask/validateNinaChecksum), `merkle.ts` (+ `generateMerkleHash` alias), `crypto.ts` (RS256/Ed25519/hashBiometric), `date.ts` (`calculateAge`), `sanitize.ts` (`sanitizeForLog`), 44 tests Jest |
| `@nina-aes/logger`       | ⚠️ **stub**          | Stub temporaire console-backed (4 services référençaient un package inexistant qui bloquait `pnpm install`). Implémentation Pino + transport Loki à livrer au document 17                                                  |
| `@nina-aes/ui`           | inchangé             | `tsconfig.json` durci avec `rootDir: "./src"`                                                                                                                                                                              |

## 3. Diagrammes UML — disponibles

8 fichiers PlantUML standalone dans `docs/diagrams/` (PROMPT 1.5, 1 557 lignes au total) :

1. `01-use-cases.puml` — 9 acteurs, 8 packages, 26 cas d'utilisation
2. `02-classes.puml` — 13 entités, 8 enums, méthodes métier, cardinalités
3. `03-sequence-correction-nina-ia.puml` — flux correction NINA + IA + audit + FDI signée
4. `04-sequence-aes-verification.puml` — vérification transfrontalière mTLS + JWS Ed25519
5. `05-sequence-vulnerable-person.puml` — USSD bambara → file P1 → livraison à domicile
6. `06-sequence-sigac-report.puml` — signalement anonyme + classif NLP + recalcul score
7. `07-deployment.puml` — K3s on-premise CTDEC, 5 namespaces, gateways AES BFA/NER
8. `08-components.puml` — frontend, services core/IA/gouv, packages, infrastructure

> Les fichiers `99-DIAGRAMMES-MERMAID.md` et `99-DIAGRAMMES-PLANTUML.md` sont conservés comme
> **archives narratives** (texte expliquant chaque diagramme), mais les sources canoniques sont
> désormais les `.puml`.

## 4. Incidents d'exécution résolus (utiles pour la documentation Bloc A)

| Symptôme                                                                  | Fix appliqué                                                                                                                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid interpolation format` (×11) dans `docker-compose.dev.yml`        | Espaces parasites supprimés, typo `ELASTIC_PASSWORDELASTIC_PASSWORD` corrigée                                                                   |
| `Conflict. The container name "/nina-postgres" is already in use`         | `docker rm -f nina-postgres` + `docker volume rm nina-postgres-data`                                                                            |
| Postgres en restart loop (Postgres 18 layout)                             | Mount `/var/lib/postgresql` (parent), pas `/data`                                                                                               |
| `P1000: Authentication failed for nina_admin`                             | Ajout `--env-file .env` dans le script `docker:up`                                                                                              |
| `initdb: invalid locale name "fr_FR.UTF-8"`                               | Bascule sur ICU : `--locale-provider=icu --icu-locale=fr-FR`                                                                                    |
| `Using engine type 'client' requires either 'adapter' or 'accelerateUrl'` | Installation `@prisma/adapter-pg` + `pg` ; `previewFeatures = ["driverAdapters", …]` ; `new PrismaPg({ connectionString })` dans `src/index.ts` |
| `prisma not recognized` (CMD)                                             | Toujours préfixer par `pnpm --filter @nina-aes/database exec prisma …` ou utiliser les scripts `db:*`                                           |
| `npm i prisma@latest` casse (workspace pnpm)                              | Utiliser **uniquement** `pnpm` dans ce monorepo                                                                                                 |
| `TS18003: No inputs were found` (root tsconfig)                           | Placeholder `scripts/typecheck.ts` + utiliser `pnpm check-types` (turbo) au lieu de `tsc` racine                                                |

## 5. Règles opérationnelles à retenir

- **Jamais** `npm` dans ce monorepo — **toujours** `pnpm`.
- Pour les binaires de workspace : `pnpm --filter <pkg> exec <bin>` ou
  `pnpm --filter <pkg> <script>`.
- Pour la base de données :
  - PostgreSQL doit être démarré avec `pnpm docker:up` (qui inclut `--env-file .env`).
  - Migrations : `pnpm --filter @nina-aes/database exec prisma migrate dev --name <nom>`.
  - Seed : `pnpm --filter @nina-aes/database db:seed`.
  - Reset : `pnpm --filter @nina-aes/database exec prisma migrate reset --force`.
- Pour le typage : `pnpm check-types` à la racine (Turborepo dispatch).

## 6. État de la base après seed (référence)

| Table          |                                                                        Lignes attendues |
| -------------- | --------------------------------------------------------------------------------------: |
| `locations`    | **371** (1 pays + 10 régions + ~52 cercles/communes Bamako + ~308 communes échantillon) |
| `institutions` |                                  **5** (CTDEC, DNEC, MAT, Mairie Comm. IV, Gouv. Kayes) |
| `users`        |                                                           **6** (1 par rôle `UserRole`) |

## 7. Documents canoniques par sujet

| Sujet                               | Document de référence                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Vue d'ensemble                      | `00-README-INDEX.md`                                                                         |
| Cahier des charges                  | `01-CAHIER-DES-CHARGES.md`                                                                   |
| Architecture globale                | `02-ARCHITECTURE-GLOBALE.md` + `diagrams/07-deployment.puml` + `diagrams/08-components.puml` |
| Setup Windows                       | `03-SETUP-ENVIRONNEMENT-DEV.md`                                                              |
| Monorepo (Turborepo + pnpm)         | `04-MONOREPO-STRUCTURE.md`                                                                   |
| Infra Docker locale                 | `05-INFRASTRUCTURE-DOCKER-COMPOSE.md`                                                        |
| Prisma + schéma DB                  | `06-DATABASE-SCHEMA-PRISMA.md` + `packages/database/prisma/schema.prisma`                    |
| Microservices NestJS                | `07` → `10`                                                                                  |
| Service IA Python                   | `11-AI-SERVICE-FASTAPI.md`                                                                   |
| Frontend → API                      | `12-FRONTEND-INTEGRATION-API.md`                                                             |
| ADR (Architecture Decision Records) | `adr/ADR-001` → `ADR-015`                                                                    |

## 8. Gouvernance assistants IA et maintenance (mai 2026)

Objectif: rendre les conventions persistantes et homogènes entre Cursor, Claude et Copilot.

- Ajout de `AGENTS.md` (règles transversales de collaboration et synchronisation docs/code).
- Ajout de `CLAUDE.md` (bootstrap session + commandes de validation).
- Renforcement de `.github/copilot-instructions.md` pour aligner Copilot sur les conventions réelles
  du projet.
- Ajout d'une règle Cursor persistante: `.cursor/rules/ai-governance.mdc`.
- Remplacement du `README.md` template par une version projet orientée exploitation.

Validation automatique ajoutée:

- Schémas JSON sous `schemas/` pour `data/mali/regions.json` et `data/mali/cercles.json`.
- Script `scripts/validate-json-schemas.mjs` (validation via Ajv).
- Script `scripts/docs-sync-check.mjs` (contrôle de cross-références critiques
  docs/README/changelog).
- Scripts `package.json`:
  - `validate:schemas`
  - `docs:sync:check`
  - `verify:repo`

Impact maintenance:

- Réduction du drift documentaire entre sessions.
- Contrôles rapides intégrables en local, hook et CI.
- Préparation à une gouvernance documentaire plus stricte sur les 250+ éléments du monorepo.

## 9. Phase 2 — Infrastructure & DevOps (mai 2026)

Conformément à **PROMPT 2.1**, l'infrastructure de développement a été consolidée :

### 9.1 Dockerfiles génériques réutilisables

- **`infrastructure/docker/Dockerfile.nestjs`** — Multi-stage Node 24-alpine
  - pnpm 10 + Turborepo pruning (`turbo prune`). Réutilisable par les 9+ services NestJS via
    `--build-arg SERVICE=<nom>`. Utilisateur non-root UID 1001, HEALTHCHECK `/health`, `tini` pour
    SIGTERM, labels OCI.
- **`infrastructure/docker/Dockerfile.fastapi`** — Multi-stage Python 3.14 slim + `uv` 0.5
  (gestionnaire de paquets Rust, 10-100× plus rapide que pip). Inclut Tesseract OCR + libgomp1 pour
  XGBoost. Réutilisable par `ai-service` et `anticorruption-service`.

Les Dockerfiles par-service (`services/<X>/Dockerfile`) restent disponibles en mode legacy mais ont
été modernisés (Node 24, utilisateur non-root, HEALTHCHECK). Le build CI/CD doit privilégier le
générique :

```powershell
make build-service SERVICE=identity-service
```

### 9.2 `seed-locations.sql` — décision révisée mai 2026

**État initial** : le PROMPT 2.1 suggérait un SQL exhaustif des 19 régions / 159 cercles / 819
communes / 12 712 villages, maintenu à la main. Décision contraire avait été prise : pas de SQL
séparé, source unique JSON + Prisma seed.

**Révision (mai 2026)** : le besoin réel infra-first (tests d'intégration BDD-only, scripts de DR,
vues matérialisées sans Prisma) a justifié le retour du SQL — mais **généré automatiquement** depuis
les JSON canoniques, pas écrit à la main.

**Architecture finale** :

- **Source de vérité** : `data/mali/regions.json` + `cercles.json` (inchangé).
- **Générateur** : `scripts/generate-seed-sql.mjs` (Node, ~210 lignes). Lit les JSON, émet le SQL
  avec INSERT idempotents (`ON CONFLICT DO UPDATE`).
- **Artefact dérivé** : `infrastructure/scripts/seed-locations.sql` (~200 lignes, 44 KB). Commité
  pour reproductibilité Docker.
- **Schéma isolé** : `geo_ref.regions / cercles / communes / arrondissements` — distinct de
  `public.locations` (Prisma). Pas de drift bidirectionnel.
- **Mount Postgres** : monté en `/docker-entrypoint-initdb.d/02-seed-locations.sql`, exécuté
  automatiquement au premier `pnpm docker:up`.
- **Cible Makefile** : `make seed-locations-generate` régénère le SQL.

**Contenu effectif** (vs cible exhaustive du prompt) :

- ✅ 20 régions (19 + District de Bamako)
- ✅ 64 cercles confirmés (sur 159 attendus — enrichissement V2 via Wikipedia/INSTAT)
- ⚠️ 10 communes échantillon (6 Bamako + 4 chefs-lieux) — sur 819 attendues
- ❌ 0 arrondissements (sur 466) — V2 INSTAT
- ❌ 0 villages (sur 12 712) — hors scope V1, dataset requis

Détails dans `docs/data/mali-divisions.md §3bis` et `docs/data/integration-guide.md §2.1bis`.

### 9.3 Makefile enrichi (44 cibles)

Cibles ajoutées au Makefile racine :

- `verify` / `validate-data` / `validate-schemas` / `docs-sync` — chaîne de vérification du repo
- `build-service SERVICE=<X>` — paramétrable, utilise le Dockerfile générique
- `vault-init` / `vault-unseal` / `vault-status` — gestion des secrets
- `certs-generate` / `certs-clean` — certificats mTLS dev pour les 3 pays AES (CA RSA 4096 + 3 certs
  clients RSA 2048 / 90 jours)
- `db-validate` — `prisma validate` rapide
- `dev-sigac` / `dev-governance` — services manquants
- `clean-deep` — purge totale (.venv inclus)

Validation : `make help` liste les 44 cibles documentées.

### 9.4 Stack Docker Compose : état effectif

`infrastructure/docker/docker-compose.dev.yml` reste la source de vérité pour les 9+ services
d'infrastructure (PostgreSQL+PostGIS, Redis, RabbitMQ, MinIO, Elasticsearch, Kibana, Keycloak,
Vault, MailDev). Corrections déjà appliquées (cf. §4 « Incidents résolus »).

### 9.5 Audit infrastructure (mai 2026 — re-passage PROMPT 2.1)

Re-passage complet du PROMPT 2.1 d'infrastructure : audit + alignement des versions sur les
dernières stables mai 2026 + complétion des livrables manquants. Aucune régression — Dockerfiles +
Makefile sont déjà au niveau, seuls docker-compose et init-db.sql ont été modifiés.

**docker-compose.dev.yml** : - Versions alignées : Redis `8.6-alpine` (était 8.4.2), RabbitMQ
`4.2-management-alpine` (était `latest` non-épinglé), Elasticsearch `9.3.2` (était 8.19.14),
Keycloak `26.5` (était 26.2.4), Vault `1.20` (était 1.18). - **Kibana 9.3.2 ajouté** (port 5601)
avec dépendance `service_healthy` sur Elasticsearch + login `kibana_system`. Healthcheck via
`/api/status` check du JSON `"level":"available"`. - **minio-init** : nouveau job one-shot
`minio/mc` qui attend MinIO healthy puis crée le bucket `nina-documents` (idempotent via
`mc mb --ignore-existing`) + active le versionning pour faciliter les rollbacks en dev. Évite
l'étape manuelle « créer le bucket via la console » au premier boot. - `VAULT_DEV_ROOT_TOKEN_ID`
aligné sur `nina-dev` (au lieu de `dev-root-token`), surchargeable via `.env`. - Cleanup des volumes
commentés (résidus draft initial).

**scripts/init-db.sql** : - **`CREATE EXTENSION postgis`** ajouté sur `nina_aes_db` et
`nina_aes_test` (l'image `postgis/postgis:18-3.6` fournit le binaire mais l'extension doit être
activée dans chaque DB). - **Utilisateur `app_user`** créé avec privilèges minimaux : login
autorisé, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, connection limit 50. Droits DML uniquement
(SELECT/INSERT/UPDATE/DELETE) sur les 9 schémas DDD + `public` + héritage automatique pour les
futures tables via `ALTER DEFAULT PRIVILEGES`. Les migrations Prisma continuent d'utiliser
`nina_admin` (owner) via une connection string distincte (séparation des privilèges runtime vs
DDL). - Création conditionnelle (`SELECT ... WHERE NOT EXISTS \gexec`) des bases `keycloak` et
`nina_aes_test` — remplace le doublon `CREATE DATABASE` initial qui levait une erreur au 2ème run. -
Collations passées à **ICU `fr-FR`** (au lieu de `LC_COLLATE       fr_FR.UTF-8` qui dépendait d'une
locale système non garantie dans l'image).

**Décisions reconduites** (déjà documentées) : - `seed-locations.sql` séparé : **NON créé** (§9.2).
Source de vérité = `data/mali/*.json` + Prisma seed, validés par `scripts/validate-mali-data.mjs`. -
`Dockerfile.nestjs` + `Dockerfile.fastapi` : **AUCUNE modification** — déjà multi-stage propre,
turbo prune, uv pour Python, non-root UID 1001, tini, HEALTHCHECK, labels OCI. - `Makefile` racine :
**AUCUNE modification** — les 45 cibles présentes couvrent toutes les attentes du PROMPT 2.1.

**Validation** : - `docker compose -f infrastructure/docker/docker-compose.dev.yml config --quiet` →
exit 0 (syntaxe valide, variables résolues). - `pnpm run verify:repo` → ✅ data + schemas + docs
sync.

### 9.6 Enrichissement référentiel Mali — geoBoundaries ADM2 + Wikipedia scraper + INSTAT workflow (mai 2026)

Suite à la question utilisateur « JSON canoniques vs SQL — que faut-il utiliser, et INSTAT comme
référence ? » : choix « Restructurer + enrichir maximum disponible ». Les 3 phases ont été livrées :

- **Phase 1** — polygones geoBoundaries ADM2 + script d'audit
- **Phase 2** — scraper Python Wikipedia + Nominatim (64 → 142 cercles)
- **Phase 3** — template demande INSTAT formelle

**Livrables** :

- **`data/mali/mali-cercles-polygons.json`** (~517 KB, 50 features) : ajout des polygones officiels
  au niveau ADM2 (cercles) issus de
  [geoBoundaries gbOpen release 2023-12-12](https://www.geoboundaries.org/), licence CC BY 4.0.
  Couvre 50 cercles de la structure pré-loi 2023 (les 11 cercles des nouvelles régions post-2023 + 6
  communes urbaines de Bamako restent hors couverture polygonale).

- **`scripts/enrich-cercles.py`** (~340 lignes) + `scripts/requirements-enrich.txt` : scraper Python
  qui complète `cercles.json` de 64 à 142 entrées en un run.

  _Pipeline_ :
  1. Fetch Wikipedia FR `Cercles_du_Mali` (cache HTML 24 h dans `.cache/`).
  2. Parse BeautifulSoup4 (lxml si dispo, sinon html.parser builtin Python — pas de prérequis build
     natif sur Windows).
  3. Strip préfixe « Cercle de … » + normalisation NFD/lowercase pour aligner avec la convention du
     JSON.
  4. Géocode Nominatim (OpenStreetMap), `countrycodes=ml`, 1 req/s (politique OSM officielle),
     User-Agent identifiable. Pas de clé API requise.
  5. Merge non destructif (les 64 entrées initiales sont intouchées) + codes `ML-{region}-{NN}`
     incrémentaux.
  6. Les cercles non géocodés sont **exclus du JSON** et listés dans le rapport stdout pour
     enrichissement manuel ultérieur (évite de polluer la bbox du schema).

  _Run mai 2026_ : 129 cercles extraits / 44 déjà connus / 85 nouveaux candidats / **78 géocodés (92
  %)** / 7 sans géocode listés. Total `cercles.json` : **142 / 159 attendus (89 %)**.

  _Confiance_ : les nouvelles entrées sont `confiance: "moyenne"` + `centroide.estime: true` +
  `source_enrichissement: "wikipedia+nominatim"`. Les 64 entrées initiales restent
  `confiance: "haute"`.

  _Makefile_ : `make enrich-cercles` (dry-run, défaut), `make enrich-cercles-write` (applique +
  régénère le SQL).

- **`scripts/audit-cercles-coverage.mjs`** + cible Makefile `make audit-cercles` : audit de
  cohérence entre `cercles.json` (maintenant 142 entrées) et `mali-cercles-polygons.json` (50
  polygones) via normalisation NFD + lowercase + suppression tirets/apostrophes. Run final : **48
  correspondances**, 2 polygones orphelins (Bamako + Nioro/Nioro du Sahel), 94 cercles JSON sans
  polygone (essentiellement les 78 ajouts Wikipedia hors couverture geoBoundaries ADM2 pré-2023).

- **`docs/data/instat-data-request.md`** (~250 lignes) : template complet de demande officielle à
  l'INSTAT Mali (`direction@instat.ml`) pour obtenir les 159 cercles + 466 arrondissements + 819
  communes + 12 712 villages avec coordonnées RGPH. Inclut : matrice coverage par niveau admin,
  points de contact (email/téléphone/microdata.instat.ml), workflow d'intégration en 4 phases une
  fois les données reçues, sources alternatives (Wikipedia/Overpass/HDX) pendant l'attente, tableau
  de suivi de la demande.

- **`data/mali/cercles.json`** : 64 → 142 entrées (`metadata.version` bumped à `2026.05.16`,
  `total_dans_ce_fichier` actualisé). Nouveau champ optionnel `source_enrichissement` sur les 78
  nouvelles entrées.

- **`infrastructure/scripts/seed-locations.sql`** régénéré : 20 régions + **142 cercles** + 10
  communes (74 KB, 279 lignes vs 200 avant).

- **`data/mali/README.md`** : section ajoutée pour `mali-cercles-polygons.json` (provenance, stats
  coverage, licence, commande d'audit).

- **`docs/data/mali-divisions.md §3.2`** : refonte en 4 sous-sections (3.2.1 noms / 3.2.2 polygones
  / 3.2.3 audit / 3.2.4 enrichissement Wikipedia+Nominatim) reflétant le nouvel artefact et les
  chiffres réels (142 cercles, 7 cercles encore à enrichir manuellement).

**Architecture renforcée** : les JSON canoniques (`regions.json` + `cercles.json`) restent **source
unique de vérité**. Les polygones (`mali-regions-polygons.json` admin1 +
`mali-cercles-polygons.json` admin2) sont des **artefacts auxiliaires** alignés par audit
automatique, jamais utilisés pour reconstruire les noms officiels. Le SQL généré
(`seed-locations.sql` §9.2) ne consomme pas les polygones — ils sont uniquement chargés côté
frontend (`MaliHeatmap`) pour le rendu choroplèthe.

**Validation** :

- `python scripts/enrich-cercles.py` → 92 % géocode hit rate, exit 0.
- `node scripts/audit-cercles-coverage.mjs` → exit 0.
- `pnpm run verify:repo` → ✅ data (142 cercles, bbox OK) + schemas (cercles.schema valide) + docs
  sync.

**Reste à faire (V2)** :

- Enrichir manuellement les 7 cercles sans géocode (Toguéré-Coumbé, Achibogho, Anétif, Timétrine,
  Takalote, Inlamawane, Dialassagou)
  - 10 cercles manquants pour atteindre 159/159.
- Envoyer la demande INSTAT formelle (cf. template) — délai incompressible 4-12 semaines, données
  authoritatives.
- Mode zoom cercles dans `MaliHeatmap` (couche choroplèthe ADM2 avec les 50 polygones) — refactor
  frontend ~4h.

### 9.7 Stabilisation healthchecks + Kibana Fleet encryption keys (23 mai 2026)

Audit `docker compose ps` après reboot stack : 4 services en `unhealthy` malgré application
opérationnelle. Diagnostic et correctifs appliqués dans
`infrastructure/docker/docker-compose.dev.yml` et `.env` :

- **rabbitmq** : healthcheck `["CMD","rabbitmq-diagnostics","-q","ping","check_running"]` invalide —
  `ping` et `check_running` sont deux sous-commandes mutuellement exclusives, l'appel renvoyait
  exit 64. → Corrigé en `["CMD","rabbitmq-diagnostics","-q","check_running"]` (Erlang OK pour
  RabbitMQ 4.x).
- **vault** : `vault status` parle HTTPS par défaut alors que `start-dev` écoute en HTTP →
  `http: server gave HTTP response to HTTPS client`. → Corrigé en
  `["CMD-SHELL","VAULT_ADDR=http://127.0.0.1:8200 vault status"]`.
- **keycloak** : healthcheck sondait `:8080/health/ready` mais KC 25+ a déplacé tous les endpoints
  management (`/health`, `/metrics`) sur le port **9000**. Port 8080 reste l'API/UI. → Corrigé
  `/dev/tcp/localhost/8080` → `/dev/tcp/localhost/9000`.
- **kibana** : `"level":"unavailable"` réel (pas un bug healthcheck) — `kibana_system` ne pouvait
  pas s'authentifier auprès d'Elasticsearch (`security_exception`). Mot de passe ES réinitialisé via
  `POST /_security/user/kibana_system/_password` en utilisant `elastic:$ELASTIC_PASSWORD`.
- **kibana — boucle Fleet** : après réauth ES, le plugin Fleet bouclait sur
  `FleetEncryptedSavedObjectEncryptionKeyRequired`. → Ajout dans `.env` de 3 clés stables (≥32
  chars) `KIBANA_ENCRYPTION_KEY`, `KIBANA_SECURITY_ENCRYPTION_KEY`,
  `KIBANA_REPORTING_ENCRYPTION_KEY`, exposées au conteneur via
  `XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY`, `XPACK_SECURITY_ENCRYPTIONKEY`,
  `XPACK_REPORTING_ENCRYPTIONKEY`. Documentation propagée à `.env.example` (avec placeholders) et
  `docs/05-INFRASTRUCTURE-DOCKER-COMPOSE.md`.

**État final** : 9/9 services `healthy`. Aucune régression observée (`docker compose ps`,
`pnpm run docs:sync:check`).

**Note ops** : les 3 clés Kibana doivent rester stables entre redémarrages. Toute rotation casse les
objets sauvegardés chiffrés (intégrations Fleet, règles d'alerting, planifications de rapports).

## 10. Frontend Citoyen — Session 2 : PC-03 à PC-06 + auth Keycloak BFF (mai 2026)

Session 2 du chantier frontend `apps/citizen` (port 4001). Construit au-dessus de la fondation
Session 1 (packages `@nina-aes/ui`, `@nina-aes/api-client`, `@nina-aes/i18n` ; PC-01 et PC-02
livrés).

### 10.1 Auth Keycloak — pattern BFF (Backend-for-Frontend)

Routes API internes `apps/citizen/app/api/auth/*` :

- **`/api/auth/login`** — initie OIDC Authorization Code + PKCE (`code_verifier` SHA-256, `state`,
  `nonce` ; cookies signés `oidc_state`/`oidc_nonce`/`oidc_code_verifier` httpOnly).
- **`/api/auth/callback`** — échange du code contre `access_token` + `id_token` + `refresh_token`.
  Vérification ID token via JWKS (`createRemoteJWKSet`, lib `jose@6.2.3`) : `iss`, `aud`, `exp`,
  `nonce`. Tokens posés en cookies `httpOnly + Secure + SameSite=Lax`, jamais exposés au JS
  navigateur.
- **`/api/auth/refresh`** — refresh silencieux (POST). En cas d'échec, suppression atomique des
  cookies pour forcer un re-login propre.
- **`/api/auth/logout`** — révoque le refresh token côté Keycloak (backchannel) puis redirige sur
  l'endpoint `end_session` (frontchannel).

**Mode mock** : `NINA_AUTH_MODE=mock` (défaut dev) renvoie une session déterministe « Fatoumata
Diallo » sans dépendance Keycloak — débloque les écrans tant que `keycloak-realm-aes.json` n'est pas
chargé.

`apps/citizen/lib/auth/session.ts` expose `getSession()`, `requireSession()`, `isOwnerOf(nina)`,
`isAgent()` — utilisables en RSC (Server Components) comme en Server Actions.

### 10.2 `apps/citizen/middleware.ts` — i18n + auth guard

Middleware combiné next-intl + auth. Routes publiques (regex `PUBLIC_PATTERNS`) : racine `/`,
`/[locale]`, `/[locale]/login`, `/[locale]/signalement/*`. Tout autre `/[locale]/...` exige une
session ; sinon redirection `/[locale]/login?return_to=…`.

### 10.3 Extensions `@nina-aes/api-client`

Trois nouveaux sous-clients (le réexport racine devient
`{ identity, correction, appointment, sigac }`) :

- **`CorrectionClient`** — soumission + liste + détail + annulation d'une demande de correction (9
  champs corrigeables : `firstName`, `lastName`, `birthDate`, `birthPlace`, `residence_cercle`,
  `residence_commune`, `fatherName`, `motherName`, `profession`). Idempotency-key
  `corr-{nina}-{field}-{ts}`.
- **`AppointmentClient`** — créneaux disponibles, création RDV, liste de mes RDV, annulation.
  Supporte priorité P1/P2/P3 (file prioritaire pour citoyens vulnérables).
- **`SigacClient`** — signalement anonyme. **`skipAuth: true` sur tous les appels** : aucun header
  `Authorization`, aucun cookie envoyé. Soumission + consultation par `trackingToken` opaque (format
  `vault:v3:…`).

Tous les DTO et réponses sont validés par des schémas Zod co-localisés (`*.schema.ts`), réexportés
côté package racine.

### 10.4 Écrans citoyens livrés (PC-03 → PC-06)

- **PC-03 — Wizard correction** (`/[locale]/nina/[nina]/correction`). 4 étapes (champ → valeur →
  justificatif placeholder → confirmation), stepper visuel, contrôle de rôle `isOwner || isAgent`.
- **PC-04 — Prise de RDV** (`/[locale]/appointments/new`). Sélection centre (CTDEC Bamako, RAVEC
  Kayes/Sikasso/Mopti — mocks en attendant l'API), créneau, motif libre. Badge « file prioritaire »
  affiché si la session est marquée vulnérable.
- **PC-05 — Dashboard citoyen** (`/[locale]/dashboard`). Salutation localisée, 3 actions (fiche /
  correction / RDV), liste des corrections en cours avec score IA, liste des RDV à venir, composant
  `StatusBadge` réutilisable.
- **PC-06 — Signalement anonyme** (`/[locale]/signalement`). Route **publique** (pas de cookie
  d'auth). Formulaire 6 catégories (BRIBERY / FORGERY / FAVORITISM / ABUSE_OF_POWER / PROCUREMENT /
  OTHER), description ≥ 50 caractères, localisation optionnelle, consentement. Aucune écriture
  localStorage/sessionStorage, aucun fingerprint navigateur. Reçu post-soumission avec token
  copiable.

### 10.5 i18n — `packages/i18n/messages/fr.json` enrichi

Ajout des namespaces `login`, `correction`, `appointments`, `dashboard`, `signalement`. La
traduction `bm.json` (bambara) reste le périmètre Session 1 ; next-intl applique le fallback FR
automatiquement pour les clés manquantes (décision documentée : ne pas fabriquer de traductions
bambara sans relecture native).

### 10.6 Corrections de configuration

- **`next.config.ts`** — `experimental.ppr` fusionné dans `cacheComponents: true` (changement Next
  16).
- **`tsconfig.json`** — suppression de `baseUrl` (déprécié TS 6.0, remplacé par `paths` relatifs
  `./*`).
- **`packages/api-client`** — override local du `tsconfig.json` : `module: ESNext` +
  `moduleResolution: Bundler`. Le package est consommé en source via `transpilePackages` côté Next,
  jamais publié comme ESM standalone — la résolution « bundler » évite d'avoir à écrire des
  extensions `.js` explicites dans les imports relatifs (que Turbopack ne sait pas remapper vers
  `.ts`).

### 10.7 Validation

- `pnpm --filter @nina-aes/api-client check-types` : 0 erreur.
- `pnpm --filter @nina-aes/citizen check-types` : 0 erreur (`next typegen` + `tsc --noEmit`).
- `pnpm run verify:repo` : ✅ validate-data + validate-schemas + docs-sync.

### 10.8 Reste à faire (Session 3+)

- Câblage `keycloak-realm-aes.json` réel + suppression du mode mock pour la pré-prod.
- ~~Composant `LanguageSwitcher` (8 langues, accessible clavier)~~ → livré commit `b7c1f5c`
  (dropdown autonyme + drapeau dans le header d'accueil, fallback FR par-clé via `deepMerge`).
- Relecture native des 6 skeletons i18n (SNK/FF/TMQ/HAU/MOS/DJE) ; bambara `bm.json` déjà fourni
  Session 1. À faire valider par CTDEC/DNEC avant production.
- Upload de justificatifs PC-03 — bloqué tant que `document-service` (port 3004) n'est pas livré
  (cf. doc 10).
- **Migration PC-04 slots → appointment-service** : quand `appointment-service` (port 3008, doc 09)
  sera livré, remplacer `generateMockSlots()` dans
  `apps/citizen/app/[locale]/appointments/ new/_components/appointment-form.tsx` par un appel
  server-side `api.appointment.getAvailableSlots({ fromDate, toDate, centerId, isPriority })`
  exécuté dans le Server Component parent. Passer les slots en prop. La `<Suspense>` côté page reste
  pertinente comme frontière de streaming pour le fetch. Idéalement, déléguer uniquement la
  sélection à un sous-composant client minimal et retirer le `'use client'` du form principal.
- **Migration PC-04 centres → identity ou location service** : `MOCK_CENTERS` dans le même fichier
  doit être remplacé par un fetch `/api/v1/centers` (cercles/communes filtrables selon la région du
  citoyen via `session.user.residence_cercle`).
- ~~Rename `middleware.ts → proxy.ts`~~ → fait. API identique
  (`NextRequest`/`NextResponse`/`config.matcher` inchangés), seul le nom de fichier et la fonction
  par défaut sont renommés (`middleware` → `proxy`). L'import `next-intl/middleware` reste valide
  (next-intl garde son propre nom).

## 11. Frontend Admin — Session 3 : foundation + AD-02 corrections (mai 2026)

Console agents CTDEC `apps/admin` (port 4002) — scaffolding initial + écran AD-02 « Gestion des
corrections IA » fonctionnel de bout en bout en mode mock. AD-01 (Dashboard complet) et AD-03
(SIGAC) prévus Session 4. Périmètre choisi avec le mainteneur : « Foundation + AD-02 prioritaire »
(le DataGrid est l'outil le plus utile au quotidien CTDEC).

### 11.1 Foundation `apps/admin`

Refonte complète du scaffold Turborepo par défaut sur le pattern citizen Session 2 :

- **Auth BFF** (4 route handlers `/api/auth/{login,callback,refresh, logout}`) avec client Keycloak
  `nina-admin`. Mode `NINA_AUTH_MODE= mock` par défaut : session déterministe « Modibo Konaté »,
  matricule CTDEC-2024-0156, rôles `[AGENT, SUPERVISOR]`, centre `ctdec-bamako`.
- **`lib/auth/session.ts`** : `getSession()`, `requireSession()`, `requireRole(roles: AdminRole[])`,
  `hasRole(roles)` — nouveau contrôle d'accès par rôle (AGENT / SUPERVISOR / AUDITOR / ADMIN).
- **Layouts** alignés Next 16 + cacheComponents : `app/layout.tsx` STATIQUE + `<HtmlLangSetter />`
  client, `app/[locale]/layout.tsx` IntlBoundary dans `<Suspense>`,
  `app/[locale]/(authenticated)/layout.tsx` applique
  `requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN'])` et rend `<AdminSidebar>` (route group
  invisible dans l'URL).
- **`components/admin-sidebar.tsx`** : sidebar fixe 240px, fond `hsl 220° 30 % 12 %`, 5 items nav
  (Dashboard / Corrections / RDV / SIGAC / Paramètres), footer profil agent + logout.
- **`proxy.ts`** : i18n routing + auth guard ; routes publiques `/[locale]` et `/[locale]/login`.
- **i18n namespace `admin.*`** (FR complet) — sidebar, dashboard, login, corrections (filters,
  columns, status, field, actions, drawer, timeline, pagination, toast). Les 6 skeletons SNK/FF/
  TMQ/HAU/MOS/DJE héritent automatiquement via le deepMerge déjà en place (Session 2 commit
  b7c1f5c).

### 11.2 Nouvelles primitives `@nina-aes/ui`

Trois wrappers Radix pour alimenter AD-02 (et les futurs écrans) :

- **Sheet** (`./components/sheet`) — Drawer latéral avec variants `side` (top/bottom/left/right).
  Compose Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle,
  SheetDescription. Focus trap, animation slide-in/out, overlay backdrop-blur, `aria-modal` natif.
- **Checkbox** (`./components/checkbox`) — Radix Checkbox stylé AES, supporte `indeterminate` (utile
  pour la sélection partielle de colonne du DataGrid).
- **DropdownMenu** (`./components/dropdown-menu`) — Surface complète Radix (Trigger, Content, Item,
  CheckboxItem, RadioItem, Label, Separator, Sub, Group, Shortcut). Préparé pour menus d'actions par
  ligne et filtres compacts.

Dépendances : `@radix-ui/react-dialog ^1.1.0`, `@radix-ui/   react-checkbox ^1.1.0`,
`@radix-ui/react-dropdown-menu ^2.1.0`.

### 11.3 AD-02 — Gestion des corrections IA

**`app/[locale]/(authenticated)/corrections/page.tsx`** (server) : Charge `MOCK_CORRECTIONS` (50
fixtures déterministes) + délègue à `<CorrectionsClient>` enveloppé dans `<Suspense>` avec skeleton
fallback.

**`_components/corrections-client.tsx`** (client) — Le DataGrid complet basé sur **TanStack Table
8.20** : - 11 colonnes : sélection multi, NINA (mono), citoyen, champ, avant, après, score IA
(coloré HIGH/MEDIUM/LOW), statut (StatusBadge), région, soumis le, actions (DropdownMenu). - **Tri**
sur 9 colonnes (clic header → ascending → descending → reset) avec icônes ArrowUp/ArrowDown. -
**Filtres** : • Recherche full-text (debounced via React state) sur NINA + nom citoyen ; •
Multi-select statut (UNDER_REVIEW, APPROVED, REJECTED, AWAITING_DOCUMENT) ; • Multi-select région
(Bamako, Sikasso, Kayes, Mopti) ; • Bouton « Réinitialiser » si filtres actifs. - **Sélection
multiple** : checkbox header (avec état `indeterminate` si sélection partielle de la page courante),
checkbox par ligne. Bouton « Approuver (N) » apparaît à droite de la toolbar si N ≥ 1. -
**Pagination** : pageSize 10, indicateur page X / Y, ChevronLeft/Right pour naviguer. - **Click
ligne** ouvre le drawer ; click sur checkbox ou DropdownMenu d'actions n'ouvre PAS le drawer
(`stopPropagation`).

**`_components/correction-drawer.tsx`** : Drawer right (Sheet side=right, max-w-xl) avec : - Header
: titre `Correction #{id}` + StatusBadge. - Citoyen (nom + NINA mono). - Modification du champ :
carte « avant » barrée + flèche + carte « après » en `bg-primary-50/40`. Motif de la demande en
italique. - **`<AiScorePanel />`** : gauge SVG inline (cercle radius 28, stroke 6, dasharray
dynamique) coloré HIGH/MEDIUM/LOW, 3 sous-scores (fuzzyMatch, consistency, agentHistory) en barres
horizontales. - Justificatif : preview placeholder « PDF · 1.4 Mo » (le vrai preview viendra avec
document-service Session 4+). - **`<CorrectionTimeline />`** : timeline verticale avec ligne
gauche + pastilles colorées (Send, Sparkles, UserCheck, FileQuestion, FileCheck, Check, X selon le
`kind` de l'événement). - Footer sticky avec actions : « Rejeter » (variant destructive) → toggle un
sous-formulaire avec textarea « motif de rejet (visible par le citoyen) » + submit ; « Approuver » →
mutation immédiate. Le drawer se ferme et un toast vert confirme l'action.

**Mutation mock approve/reject** : `decide(id, decision, reason?)` dans `corrections-client.tsx`
mute le state local avec `useTransition`. La timeline est appendée avec un événement `APPROVED` ou
`REJECTED` daté ISO. Un toast 4 s apparaît en bas-droite (`role="status"` `aria-live="polite"`).

### 11.4 Mock fixtures (`apps/admin/lib/mock-corrections.ts`)

Générateur déterministe Mulberry32 produisant 50 corrections : - 20 prénoms × 20 noms maliens
(combinaisons réalistes). - 9 champs `field` représentés équitablement (firstName, lastName,
birthDate, birthPlace, residence_cercle, residence_commune, fatherName, motherName, profession). -
Échantillons d'erreurs typiques par champ (Sikaso → Sikasso, Toure → Touré, Bla → Blá, 1995-13-02 →
1995-12-02). - 4 statuts pondérés : UNDER_REVIEW (60 %), APPROVED (20 %), REJECTED (15 %),
AWAITING_DOCUMENT (5 %). - 4 régions : Bamako, Sikasso, Kayes, Mopti. - Score IA 30-98 + verdict
HIGH/MEDIUM/LOW dérivé. - 3 sous-scores (fuzzyMatch, consistency, agentHistory). - Timeline réaliste
SUBMITTED → AI_SCORED → AGENT_REVIEW → APPROVED/REJECTED ou → DOCUMENT_REQUESTED.

À supprimer Session 4+ quand correction-service exposera `GET /api/v1/admin/corrections?filters`
côté agent.

### 11.5 Validation

- `pnpm --filter @nina-aes/admin check-types` : ✅ 0 erreur.
- `pnpm --filter @nina-aes/citizen check-types` : ✅ 0 erreur (citizen n'a pas régressé).
- `pnpm run verify:repo` : ✅ validate-data + validate-schemas + docs-sync.

### 11.6 Reste à faire (Session 4+)

- **AD-01 Dashboard** complet : 4 KPI cards avec sparkline SVG inline + AreaChart Recharts
  corrections/jour + MaliHeatmap activité régionale + feed temps réel alertes (SSE mock).
- **AD-03 SIGAC** : MaliHeatmap alertes par région + top 10 agents intégrité (IntegrityScoreGauge
  ×10) + feed alertes temps réel + drill-down par région.
- **MaliHeatmap** réutilisable dans `@nina-aes/ui` (SVG inline
  - GeoJSON `data/mali/regions.geojson`, 55 features déjà validées par `validate:data`).
- **Extraction `@nina-aes/auth`** : factoriser `lib/auth/session.ts`
  - routes API auth communes à citizen et admin (et bientôt governance). Aujourd'hui : 2 copies.
    Threshold de 3 copies déclenche l'extraction.
- **Câblage `correction-service`** : remplacer `MOCK_CORRECTIONS` par fetch server-side + mutations
  TanStack Query avec optimistic update + invalidation cache.
- **PDF preview justificatif** : bloqué tant que `document-service` (port 3004) n'expose pas les
  URLs signées.
- **Drawer mobile** : actuellement w-full sur xs, OK mais le DataGrid est inutilisable sur xs (10
  colonnes). Ajouter une vue « cards » alternative ou figer les 3 premières colonnes en overflow-x.
- **Tests E2E Playwright** : parcours agent (login mock → DataGrid → filtre → approbation → toast →
  ligne mise à jour).

## 12. Frontend Admin — Session 4 : AD-01 Dashboard + AD-03 SIGAC (mai 2026)

Finalisation du périmètre `apps/admin` initial — les deux écrans restants de
docs/design-system/screens.md §AD-01/AD-03 sont livrés en mode mock, l'app est complète bout-en-bout
(Dashboard → Corrections → SIGAC + RDV/Paramètres en placeholder).

### 12.1 Nouvelles primitives chart `@nina-aes/ui`

4 composants SVG inline, **zéro dépendance lib chart** (pas de recharts, victory, etc.). Le choix :
la complexité reste linéaire, le bundle reste mince, et le rendu SSR est trivial.

**MaliHeatmap** (`./components/charts/mali-heatmap`) Bubble map des 20 régions Mali (centroïdes
`data/mali/mali.geo     json` level=1). Props `data: MaliHeatmapDatum[]` (régionCode + valeur),
`tone: 'sequential' | 'severity'` (palette HSL interpolée vert→jaune→rouge pour severity, bleu
progressif pour sequential). `onRegionClick` optionnel pour drill-down, accessibilité clavier
complète (`tabIndex` + Enter/Space). Projection lon/lat → viewBox 100×75 avec bbox Mali (-12 à +3
lon, 10.5 à 23 lat).

    Note : le GeoJSON disponible ne contient que des Point
    centroïdes, pas de polygones. Le bubble map est une variante
    valide de heatmap (densité par lieu) et garde le coût zéro lib.
    Si un GeoJSON polygonal est ajouté plus tard, ré-évaluer.

**Sparkline** (`./components/charts/sparkline`) Courbe minimal viewBox `0 0 100 30`, area fill
optionnel, highlight du dernier point. 5 tones AES (primary / success / warning / danger / muted).
Utilisée dans les KPI cards AD-01.

**AreaChart** (`./components/charts/area-chart`) Area chart avec axes Y left (labels) + X bottom
(labels tous les N points), gridlines pointillées, points interactifs avec `<title>` natif au hover.
ViewBox 400×200, padding intelligent. Utilisé pour « Corrections / jour 30j ».

**IntegrityGauge** (`./components/charts/integrity-gauge`) Composite : icône check/x (≥70 / <70) +
nom (truncate w-32) + barre horizontale colorée + score. Couleur sémantique : ≥80 success, 50-79
warning, <50 destructive. Utilisé pour le Top 10 agents AD-03.

### 12.2 AD-01 — Dashboard agent CTDEC

**`apps/admin/app/[locale]/(authenticated)/dashboard/page.tsx`** (server) — Remplace le placeholder
Session 3. Layout : - 4 KPI cards en grid 1/2/4 col (mobile/sm/lg) : NINA actifs (12 489, +2.4 % vs
sem.), Corrections en attente (84, -12.5 %), Alertes SIGAC (17, +6.3 %), RDV aujourd'hui (326, +1.8
%). Chaque card : titre uppercase, valeur tabular-nums, delta % avec ArrowUpRight/DownRight + tone
success/danger selon « positiveIsGood » (correctionsPending et alertsOpen sont des KPIs où la baisse
est bonne), sparkline 30j. - Section 2 col (lg) : AreaChart corrections/jour 30j (tone warning) sur
2/3, AlertsFeed live sur 1/3. - Section pleine largeur : MaliHeatmap activité régionale (tone
sequential, 10 régions échantillonnées).

**`_components/kpi-card.tsx`** — Composite KpiCard avec drill-down optionnel (Link Next vers
`./corrections`, `./appointments`, `./sigac`). `tabular-nums` pour aligner visuellement les chiffres
entre cards.

**`_components/alerts-feed.tsx`** — Client component avec mock SSE. `setInterval` jitter 12-20 s
ajoute une nouvelle alerte en tête de liste (capée à `maxItems=12`). Badge LIVE pulse 800 ms à
chaque nouveau message (`animate-pulse`). Liste scrollable avec `divide-y`, severity badge coloré,
relative time via next-intl `useFormatter().relativeTime`.

### 12.3 AD-03 — Dashboard SIGAC

**`apps/admin/app/[locale]/(authenticated)/sigac/page.tsx`** (server) : - Contrôle d'accès renforcé
: `requireRole(['SUPERVISOR',       'AUDITOR', 'ADMIN'])` — exclut les simples AGENT (le SIGAC est
réservé aux superviseurs/auditeurs). - Layout 2 sections principales : • Grid 2 col : MaliHeatmap
alertes par région (tone severity) + Top 10 agents (IntegrityGauge ×10 avec bouton « Investiguer »
si score < 70). • SigacClient (feed filtrable temps réel).

**`_components/sigac-client.tsx`** — Client component avec : - Multi-filtres : recherche full-text
(description + lieu), multi-select severity (CRITICAL/HIGH/MEDIUM/LOW), période (today / week /
month). - Mock SSE identique à AlertsFeed AD-01 (12-20 s jitter, badge LIVE pulse). - Liste
scrollable avec bouton « Investiguer » par alerte (`/[locale]/sigac/[id]`, page à implémenter
Session 5+). - Counter `filtered.length / alerts.length` dans le header.

### 12.4 Mock data (`apps/admin/lib/mock-dashboard.ts`)

Toutes les données Session 4 dans un fichier unique, déterministes (PRNG Mulberry32 seed fixe) : -
`KPI_SNAPSHOTS` : 4 KPIs avec history 30j générée (tendance ascendante + bruit ±15 %). -
`CORRECTIONS_PER_DAY` : 30 points (date au format dd/mm, volume 65-90 + spikes occasionnels). -
`ACTIVITY_BY_REGION` : 10 régions principales avec volumes réalistes (Bamako 487 → Kidal 12). -
`ALERTS_BY_REGION` : 6 régions avec alertes actives. - `TOP_AGENTS` : 10 agents (Modibo 97 →
Boubacar 31), 4 en-dessous de 70 (à investiguer). - `INITIAL_ALERTS` : 8 alertes échantillons
(CRITICAL forgery, HIGH bribery, MEDIUM favoritism, etc.). - `generateNewAlert(prevCount)` :
générateur déterministe pour le mock SSE.

À supprimer Session 5+ quand audit-service (port 3007), correction-service (port 3005) et
anticorruption-service (port 3009) exposeront les agrégations réelles.

### 12.5 i18n

packages/i18n/messages/fr.json — Extensions : - `admin.dashboard.kpis.*` : titres + delta strings -
`admin.dashboard.{correctionsChartTitle, activityMapTitle,       alertsFeedTitle, alertsFeedLive, alertsFeedEmpty}` -
`admin.sigac.*` (nouveau namespace) : pageTitle/Subtitle, filters (severity, period,
all/today/week/month, reset), severity {LOW/MEDIUM/HIGH/CRITICAL}, category (6 catégories),
alertsMap, topAgents (investigate), feed (live, investigate, empty).

### 12.6 Validation

- `pnpm --filter @nina-aes/admin check-types` : ✅
- `pnpm run verify:repo` : ✅ data + schemas + docs sync.

### 12.7 Reste à faire (Session 5+)

- **Câblage backends réels** : audit-service (KPIs + activité régionale agrégée), correction-service
  (DataGrid + decide mutation), anticorruption-service (SSE alerts stream + filtres côté API). Tous
  nécessitent les services NestJS/FastAPI prêts.
- **GOV-01 à GOV-03** : 3ème app `apps/governance` (port 4003) — messagerie signée Ed25519, Kanban
  directives, timeline officielle. Déclencherait l'extraction `@nina-aes/auth` (3ème consommateur).
- ~~**MaliHeatmap polygonale**~~ → livré (cf. §12.8 ci-dessous).
- **AD-02 mobile** : DataGrid 11 colonnes inutilisable sur xs. Vue alternative « cards » à
  implémenter, ou freeze 3 premières colonnes en overflow-x.
- **Tests E2E Playwright** : parcours agent login mock → dashboard KPIs visibles → click drill-down
  corrections → filtre statut UNDER_REVIEW → drawer → approve → toast → retour dashboard avec KPI
  corrections décrémenté.

### 12.8 MaliHeatmap choroplèthe — polygones admin1 (post-Session 4)

Suite à un retour utilisateur (les bulles centroïdes manquaient de contexte géographique),
`<MaliHeatmap>` supporte désormais un **mode choroplèthe** avec polygones réels :

data/mali/mali-regions-polygons.json (nouveau, 295 KB) : Téléchargé depuis geoBoundaries gbOpen Mali
ADM1 simplified (open data, licence permissive). 9 polygones : Bamako + 8 régions historiques
pré-2016 (Kayes, Koulikoro, Sikasso, Ségou, Mopti, Tombouctou, Gao, Kidal). Bbox lon -12.24/+4.25,
lat 10.14/25.00. Couvre 100 % du territoire.

data/mali/README.md (nouveau) : Documente toutes les sources data/mali/ (regions.json, cercles.json,
mali.geojson, mali-regions-polygons.json) avec provenance, licence, mapping codes shapeISO → ML-NN,
et procédure de mise à jour.

packages/ui/src/components/charts/mali-heatmap.tsx : - Nouvelle prop optionnelle
`geojson?: FeatureCollection`. - Si fournie → rendu choroplèthe (polygones SVG remplis selon la
valeur, mapping LEGACY_CODE_MAP ML-1 → ML-01, etc.). - Si absente → fallback bubble map
(comportement v1). - Marqueurs centroïdes pour les 11 régions post-2016 (Taoudénit, Ménaka,
Bandiagara, etc.) qui n'ont pas de polygones séparés dans le dataset historique. Petits points
colorés par-dessus. - ViewBox aspect ratio recalibré (100 × 90) pour matcher la forme réelle du Mali
(légèrement plus large que haut). - Étiquettes régions enrichies (7 majeures) avec stroke paintOrder
pour rester lisibles par-dessus la choroplèthe.

apps/admin/app/[locale]/(authenticated)/dashboard/page.tsx +
apps/admin/app/[locale]/(authenticated)/sigac/page.tsx : Import du JSON polygones + pass-through à
MaliHeatmap via prop `geojson`. Cast TypeScript explicite vers `MaliHeatmapProps     ['geojson']`
(le JSON Module est typé `any` par Next).

Limite connue (documentée README.md) : 11 régions post-2016 sans polygone propre — affichées comme
marqueurs centroïdes. Pour upgrader aux 20 régions actuelles, sourcer un dataset plus récent (INSTAT
Mali ou OCHA HDX).

## 13. Refactor — Session 5 : `@nina-aes/auth` + tests E2E Playwright (mai 2026)

Session de **refactor + qualité** : élimination de la duplication d'auth entre les apps (citizen +
admin, futur governance) et mise en place d'une suite Playwright E2E sur les parcours critiques. Pas
de nouvelle feature utilisateur — gain pur en maintenabilité + confiance.

### 13.1 Extraction `@nina-aes/auth` (Phase 1+2)

**Avant** : 884 lignes dupliquées entre `apps/citizen/lib/auth/` et `apps/admin/lib/auth/` (8
fichiers × 2 copies : session.ts + login/callback/refresh/logout route handlers). Différences
réelles entre les 2 copies : 3 strings (`clientId`, `appPublicUrl`, `mockProfile`).

**Après** : 757 lignes dans `packages/auth/src/` + 2 wrappers app de ~50 lignes chacun = 757 + 100 =
857 lignes au total (économie de 27 LOC nettes, mais surtout **un seul endroit pour évoluer le flow
OIDC**, un seul cycle de revue sécurité, et le 3ème consommateur (`apps/governance`) Session 6+ aura
un coût d'intégration ~zéro).

packages/auth — Structure : src/types.ts Role union (CITIZEN, AGENT, AUDITOR, MINISTER, ...),
UserProfile superset (NINA + matricule + centerId), Session, AuthMode, AuthConfig (clientId +
appPublicUrl + mockProfile).

    src/session.ts     getSession / requireSession / requireRole /
                       hasRole / isOwnerOf — tous paramétrés par
                       AuthConfig. JWKS caché module-level par issuer.
                       `cookies()` lu inconditionnellement en première
                       instruction (cacheComponents requirement Next 16).

    src/handlers/      Factories pour les 4 route handlers OIDC PKCE :
                       buildLoginHandler, buildCallbackHandler,
                       buildRefreshHandler, buildLogoutHandler.

    package.json       Deps : jose ^6.2.3, zod ^4.3.6. Peer : next ^16.
                       Bundler resolution.

apps/citizen + apps/admin — Migrations : lib/auth/session.ts (wrappers) : définissent AUTH_CONFIG
(client `nina-citizen` vs `nina-admin`, mock Fatoumata Diallo vs Modibo Konaté) et ré-exportent les
helpers déjà paramétrés. Aucun changement d'API pour les consommateurs (Server Components + Server
Actions).

    app/api/auth/*/route.ts : devenus des shims one-liner :
                         import + factory + export.

    next.config.ts : `@nina-aes/auth` ajouté à `transpilePackages`.
    package.json   : workspace dep ajoutée.

### 13.2 Tests Playwright E2E (Phase 3)

Setup multi-app au niveau root (config unique pilotant 2 projets) + 11 tests couvrant les parcours
critiques de chaque app.

playwright.config.ts — Multi-projects : - Projects `citizen` (port 4001) + `admin` (port 4002), un
par app Next. testMatch par regex pour isolation. - 2 webServers démarrés par Playwright (mode dev),
réutilisés s'ils tournent déjà en local (`reuseExistingServer`). - Trace + screenshots + video au
premier retry (debug-friendly). - Mode CI : retries=2, workers=1, reporter github+list (prêt pour
GitHub Actions Session 6+).

e2e/ — 11 tests dans 4 fichiers : citizen/home.spec.ts (3 tests) : PC-01 home charge, `/` → `/fr`
redirect, LanguageSwitcher change URL. citizen/nina-flow.spec.ts (3 tests) : PC-02 fiche pour NINA
mock, not-found gracieux, PC-03 wizard étape 1 avec 9 champs radio. admin/dashboard.spec.ts (2
tests) : AD-01 greeting agent + sidebar 5 nav items. admin/corrections.spec.ts (3 tests) : AD-02
datagrid ≥1 ligne, filtre statut, click ligne → drawer avec AiScorePanel + Approuver/Rejeter.

e2e/README.md — Documentation usage (commandes, env vars, filtrage, limites connues : pas de tests
data API, pas de snapshots, pas encore de CI GitHub Actions).

Root package.json — Scripts : pnpm run test:e2e # lance les 11 tests pnpm run test:e2e:ui # mode
interactif Playwright UI pnpm run test:e2e:install # télécharge Chromium (~150 MB, une fois)

Dev dep : @playwright/test ^1.50 → 1.60.0 effectif. .gitignore : test-results/, playwright-report/,
playwright/.cache/.

### 13.3 Validation

- `pnpm --filter @nina-aes/auth check-types` : ✅
- `pnpm --filter @nina-aes/citizen check-types` : ✅
- `pnpm --filter @nina-aes/admin check-types` : ✅
- `npx playwright test --list` : 11 tests dans 4 fichiers, config Playwright valide.

Tests pas exécutés dans la session car nécessitent les browsers Chromium téléchargés
(`pnpm run test:e2e:install`). Le code est prêt — à lancer quand on veut valider.

### 13.4 Reste à faire (Session 6+)

- **Lancer les 11 tests E2E une première fois** : valider qu'ils passent, corriger les sélecteurs si
  écart avec le DOM réel.
- **CI GitHub Actions** : workflow `.github/workflows/e2e.yml` qui lance
  `pnpm run test:e2e:install && pnpm run test:e2e` sur chaque PR. Cache des browsers Playwright pour
  gagner du temps.
- **GOV-01 à GOV-03** (apps/governance) : 3ème consommateur de `@nina-aes/auth` (validation du
  design factory).
- **Tests data API** : quand les services backend NestJS seront réels, ajouter des tests qui
  frappent les vraies APIs (séparation `e2e/integration/` vs `e2e/ui/`).
- **Snapshots visuels** : Playwright `expect.toHaveScreenshot()` une fois les écrans stabilisés
  (Session 7+).

## 14. CI/CD — Doc 16 + ADR-016 (mai 2026)

Première livraison documentaire de la phase transversale **Qualité, sécurité, déploiement** (docs 15
→ 20). La doc 16 et l'ADR associée formalisent la stack CI/CD GitHub Actions et identifient les
écarts à corriger sur le `ci.yml` historique.

### 14.1 Livrables documentaires

- `docs/16-CICD-GITHUB-ACTIONS.md` (~610 lignes) : guide complet d'implémentation du pipeline cible
  (5 workflows : verify, test, e2e, security, build + 1 deploy-staging + composite action
  `setup-node-pnpm` + Renovate + branch protection + badges README).
- `docs/adr/ADR-016-cicd-github-actions.md` (~155 lignes) : décision GitHub Actions vs alternatives
  (GitLab CI SaaS/auto-hébergé, Drone, Jenkins, CircleCI, monolithique `ci.yml`), note souveraineté,
  plan de migration Forgejo Actions pour gouvernance AES.

### 14.2 Écarts identifiés sur `.github/workflows/ci.yml` actuel

L'unique workflow présent (`ci.yml`, monolithique) présente plusieurs dérives par rapport aux
décisions infra (cf. §9.5) qui seront corrigées lors de l'implémentation effective du doc 16 :

| Composant CI actuel             | Décision projet (§9.5)              | Action       |
| ------------------------------- | ----------------------------------- | ------------ |
| `postgres:16-alpine`            | `postgis/postgis:18-3.6`            | À corriger   |
| `redis:7-alpine`                | `redis:8.6-alpine`                  | À corriger   |
| `rabbitmq:3.13-alpine`          | `rabbitmq:4.2-management-alpine`    | À corriger   |
| `PYTHON_VERSION: "3.12"`        | Python 3.14                         | À corriger   |
| `POSTGRES_USER: nina_user`      | `nina_admin` (cf. `init-db.sql`)    | À corriger   |
| `pnpm db:push`                  | `prisma migrate deploy` (canonique) | À corriger   |
| Tests Python : ai-service seul  | + anticorruption-service            | À étendre    |
| 0 cache Playwright              | `actions/cache@v4` keyed pnpm-lock  | À ajouter    |
| 0 SARIF upload                  | `github/codeql-action/upload-sarif` | À ajouter    |
| 1 fichier `ci.yml` monolithique | 5 workflows séparés                 | À refactorer |
| 0 Renovate                      | `renovate.json` documenté           | À installer  |

### 14.3 Architecture cible (résumé)

- **5 workflows PR/push** : `verify` (lint + typecheck + `verify:repo`), `test` (Jest Node + Pytest
  Python matrix), `e2e` (Playwright mock 3 apps), `security` (Trivy + Semgrep + gitleaks +
  pnpm-audit + pip-audit
  - Bandit), `build` (Turbo + Docker buildx + push GHCR).
- **1 workflow déploiement** : `deploy-staging` (Helm upgrade sur K3s staging CTDEC, déclenché sur
  `main`).
- **1 composite action** : `.github/actions/setup-node-pnpm` factorise checkout + pnpm + node +
  install.
- **Caches** : pnpm store (natif setup-node), Playwright browsers (actions/cache), pip wheels (natif
  setup-python), Docker buildx (cache-from: gha), Turborepo remote cache **self-hosted MinIO**
  (souverain — pas Vercel).
- **Branch protection main** : 6 required checks (verify, test-node, test-python, gitleaks,
  trivy-fs, semgrep). Linear history, signed commits recommandés, no force push.
- **Renovate** : `automergeMinor` + `automergePatch`, schedule nocturne (after 1am, before 5am,
  America/Toronto), grouping Prisma + Next/React + flag manual-review sur majeurs.
- **Cible perf** : < 5 min par PR moyen (après chauffe caches), < 1 200 min runners / mois.

### 14.4 Reste à faire (implémentation effective)

L'implémentation des workflows YAML est planifiée comme Phase 3 post-doc-15 (Sécurité). Doc 16 livre
la spec, pas encore le code :

- Créer `.github/actions/setup-node-pnpm/action.yml` + `.nvmrc`
- Splitter `ci.yml` → `verify.yml` + `test.yml` + `e2e.yml` + `security.yml` + `build.yml`
- Créer `deploy-staging.yml` + provisionner ServiceAccount K3s (kubeconfig dans
  `K3S_STAGING_KUBECONFIG`)
- Activer Turbo remote cache MinIO (URL + token dans secrets)
- Installer Renovate app + commiter `renovate.json`
- Configurer branch protection rules (UI GitHub)
- Ajouter les 4 badges au README
- Tagger `cicd-mvp` après validation tutorat

### 14.5 Mise à jour cross-références

- `MAINTENANCE.md §10` : la mention prospective « CI/CD (doc 16) ajoutera `pnpm run verify:repo`
  comme step bloquant » est remplacée par un lien direct vers `docs/16-CICD-GITHUB-ACTIONS.md`.
- `docs/00-README-INDEX.md §2` : doc 16 conserve son entrée originale ; l'estimation reste 8-12 h
  (spec livrée + ~6 h pour l'implémentation YAML).

## 15. Observabilité — Doc 17 + ADR-017 (mai 2026)

Deuxième livraison documentaire de la phase transversale (docs 15 → 20). La doc 17 et l'ADR-017
formalisent la stack d'observabilité LGTM et l'instrumentation OpenTelemetry des 11 services Bloc A.

### 15.1 Livrables documentaires

- `docs/17-MONITORING-OBSERVABILITY.md` (~960 lignes) : guide d'implémentation complet — réécriture
  `@nina-aes/logger` Pino + Loki + redact PII, endpoints `/metrics` NestJS + FastAPI, OTel SDK
  auto-instru, ajout profil `observability` à `docker-compose.dev.yml` (7 containers : Prometheus,
  Grafana, Loki, Tempo, Promtail, OTel Collector, Alertmanager), provisioning Grafana (3
  datasources + 6 dashboards), 12 règles d'alerting Prometheus avec runbook associé.

- `docs/adr/ADR-017-observabilite-lgtm-stack.md` (~205 lignes) : décision LGTM vs 9 alternatives
  (Datadog, NewRelic, ELK, Graylog, VictoriaMetrics, Jaeger, OpenSearch, Sentry, no-op), note
  souveraineté avec interdiction explicite de Grafana Cloud, plan de migration vers
  VictoriaMetrics + ClickHouse + Vector si volumes l'exigent en Phase 2.

### 15.2 Stack cible (LGTM + OTel + Pino + Alertmanager)

| Composant                    | Version    | Rôle                           |
| ---------------------------- | ---------- | ------------------------------ |
| Prometheus                   | 3.4.1      | Métriques, retention 15j       |
| Grafana                      | 12.3.0     | Dashboards + alerting unifié   |
| Loki                         | 3.5.0      | Logs structurés, retention 30j |
| Tempo                        | 2.7.1      | Traces OTLP, retention 7j      |
| Promtail                     | 3.5.0      | Ship logs containers → Loki    |
| OTel Collector               | 0.119.0    | Routeur OTLP → 3 backends      |
| Alertmanager                 | 0.28.1     | Routing notif + dédoublonnage  |
| Pino (Node) + structlog (Py) | 9.6 / 25.1 | Loggers JSON structurés        |

### 15.3 PII safe by construction

Le nouveau `@nina-aes/logger` (réécrit en Pino) embarque un **redact array** de 12 champs (`nina`,
`ninaRaw`, `fingerprintHash`, `faceEmbedding`, `dateNaissance`, `password`, `token`, etc.). Le test
`packages/logger/src/__tests__/redact.test.ts` valide qu'aucun NINA brut ne traverse jamais le
transport Loki. Cette propriété est suivie par la métrique d'ADR-017 :
`logcli query '{} |~ "189\d{12}[A-Z]"'` doit retourner **0 résultat**.

### 15.4 Alertes critiques

Sur les 12 règles d'alerting livrées, deux sont explicitement marquées **CRITICAL sans tolérance** :

- `AuditChainBreak` (rupture chaîne Merkle audit, cf. ADR-014) → procédure d'isolation immédiate +
  CISO CTDEC + ANSSI Mali (cf. RUNBOOK §9).
- `LokiIngestionDown` (perte de traçabilité observabilité) → trail forensic compromis.

Les 10 autres alertes (latence p95, taux 5xx, queue RabbitMQ, etc.) incluent une référence runbook
obligatoire (`runbook: docs/observability/RUNBOOK.md#<anchor>`).

### 15.5 Substitut `@nina-aes/logger` stub → Pino

Le tableau §2 de ce CHANGELOG est mis à jour : `@nina-aes/logger` passe de **stub temporaire
console-backed** à **Pino 9 + transport Loki + redact PII** dès l'implémentation effective de la
doc 17.

### 15.6 Reste à faire (implémentation effective)

L'implémentation pratique est planifiée comme Phase 3 post-doc-15 :

- Réécrire `packages/logger/src/index.ts` (Pino 9 + redact + transport Loki)
- Ajouter test `redacts nina field` dans `__tests__/`
- Ajouter `MetricsModule` aux 6 AppModule NestJS Bloc A
- Ajouter `instrument(app)` aux 2 FastAPI services
- Ajouter `startOtel()` en première ligne de chaque main.ts/main.py
- Créer 11 fichiers config dans `infrastructure/observability/` (prometheus.yml, loki.yml,
  tempo.yml, promtail.yml, otel-collector.yml, alertmanager.yml, rules/nina-aes-slo.yml,
  grafana/provisioning/datasources/all.yml, grafana/provisioning/dashboards/nina-aes.yml, 6
  dashboards JSON)
- Étendre `docker-compose.dev.yml` avec profil `observability`
- Rédiger `docs/observability/RUNBOOK.md` (12 entrées) + `docs/observability/SLOs.md`
- Tagger `observability-mvp` après validation tutorat

### 15.7 Cross-références

- `MAINTENANCE.md §9` : ligne « Monitoring & observabilité » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md §2` : doc 17 conserve son entrée originale ; l'estimation est révisée à
  16-22 h (vs 8-12 h initial — la stack LGTM
  - instrumentation OTel sur 11 services demande plus que prévu).

## 16. Stratégie de tests — Doc 18 + ADR-018 (mai 2026)

Troisième livraison documentaire de la phase transversale (docs 15 → 20). La doc 18 et l'ADR-018
formalisent la pyramide de tests à 4 niveaux et les conventions associées.

### 16.1 Livrables documentaires

- `docs/18-TESTING-STRATEGY.md` (~960 lignes) : guide d'implémentation complet — conventions
  nommage/AAA, factories Faker centralisées dans `packages/test-fixtures`, Jest unitaires NestJS +
  Pytest unitaires FastAPI, intégration Supertest + Testcontainers, extension Playwright (Session 5
  → 30 tests), 4 scénarios k6 avec output Prometheus, configuration coverage threshold 80 %, Stryker
  P2 manuel sur `@nina-aes/utils`.

- `docs/adr/ADR-018-strategie-tests-pyramide.md` (~215 lignes) : décision pyramide 4-niveaux vs 8
  alternatives (tout-en-E2E, mock-driven, Cypress+Cloud, Vitest partout, JMeter, Locust, SonarQube,
  SaaS synthetic), note souveraineté (interdiction Cypress Cloud / Sauce Labs / BrowserStack /
  Datadog Synthetics / Codecov), 10 métriques de suivi chiffrées.

### 16.2 Pyramide cible

| Niveau          | Volume      | Outils                                                   | Couverture         |
| --------------- | ----------- | -------------------------------------------------------- | ------------------ |
| **Unitaires**   | ~800 tests  | Jest 30 (TS) · Pytest 8 (Py) · Vitest 4                  | **≥ 80 %**         |
| **Intégration** | ~150 tests  | Supertest 7 + Testcontainers 10 · httpx + pytest-asyncio | ≥ 60 % services    |
| **E2E**         | ~30 tests   | Playwright 1.50 (mock auth)                              | parcours critiques |
| **Charge**      | 4 scénarios | k6 0.55 + output Prometheus (cf. doc 17)                 | SLO validation     |

### 16.3 Décisions structurelles

- **Pyramide stricte, pas glace au chocolat** : ratio ~800/150/30/4. PR qui livre 1 E2E sans
  unitaires = rejeté.
- **Factories Faker centralisées** : nouveau package `packages/test-fixtures` (factory
  `make<Entity>(overrides?)`). Aucune donnée de test à la main.
- **Testcontainers pour intégration** : chaque suite spin-up son propre `postgis/postgis:18-3.6`,
  applique migrations Prisma, exécute, nettoie. Coût ~30 s warmup × N suites — acceptable jusqu'à
  ~10 suites.
- **MSW pour tests frontend** : pas de `jest.mock('fetch')`. Handlers réutilisés en E2E et
  unitaires, compatibles Server Components Next.js 16.
- **k6 contre staging uniquement** : output Prometheus remote-write vers doc 17, dashboards Grafana
  réutilisables. Manuel + nightly CI.
- **Stryker P2 manuel** : score mutation seulement sur `@nina-aes/utils`, exécuté avant chaque
  release majeure. Pas en CI bloquante.
- **Coverage 80 % bloquante en CI** : `jest --coverage` + `pytest --cov-fail-under=80` retournent
  exit 1 si seuil non respecté.

### 16.4 Souveraineté

Interdiction explicite dans ADR-018 :

- Cypress Cloud (SaaS US)
- Sauce Labs / BrowserStack (SaaS US)
- Datadog Synthetics (SaaS US)
- Codecov (SaaS US) — fallback artefact `coverage-final.json` Actions
- Grafana Cloud Synthetic Monitoring

Stack 100 % open-source self-hostable : Jest/Pytest/Playwright/ Testcontainers/k6/Stryker/Faker/MSW
(MIT/Apache 2.0).

### 16.5 Reste à faire (implémentation effective)

L'implémentation pratique est planifiée comme Phase 4 post-doc-17. Doc 18 livre la spec ; le code
suit :

- Créer `packages/test-fixtures` (workspace pnpm)
- Factories : `makeCitizen`, `makeNina`, `makeFdi`, `makeAppointment`, `makeSigacReport`,
  `makeAuditLog`
- Étendre Jest sur 6 services NestJS Bloc A (controller.spec.ts + e2e-spec.ts avec Testcontainers)
- Étendre Pytest unitaires + intégration sur 2 FastAPI services
- Étendre Playwright de 11 → 30 tests (correction, RDV, USSD mock, GOV-01..03 quand
  `apps/governance` livré)
- Créer 4 scénarios k6 dans `tests/load/scenarios/`
- Intégrer MSW dans `apps/citizen` + `apps/admin`
- Activer `coverageThreshold: 80%` dans tous les `jest.config.cjs`
- Documenter exclusions légitimes dans `docs/testing/COVERAGE-MATRIX.md`
- Rédiger `docs/testing/TEST-CHARTER.md`
- Tagger `testing-mvp` après validation tutorat

### 16.6 Cross-références

- `MAINTENANCE.md §9` : ligne « Stratégie de tests » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md §2` : doc 18 conserve son entrée ; l'estimation reste 12-16 h (spec) + ~6
  h (implémentation factories
  - premiers tests).
- `docs/16-CICD-GITHUB-ACTIONS.md §4.3` : seuil `--cov-fail-under=80` documenté (référence
  circulaire entre doc 16 et doc 18 — assumée).

## 17. Backup & DRP — Doc 19 + ADR-019 (mai 2026)

Quatrième livraison documentaire de la phase transversale (docs 15 → 20). La doc 19 et l'ADR-019
formalisent la stratégie de sauvegarde 3-2-1 et le plan de reprise après sinistre avec cibles
RTO/RPO chiffrées.

### 17.1 Livrables documentaires

- `docs/19-BACKUP-RECOVERY.md` (~870 lignes) : guide d'implémentation complet — pgBackRest 2.55
  (full quotidien + diff hebdo + WAL archive flush 60s), Redis RDB+AOF, MinIO replication
  active-passive, cold storage chiffré age (XChaCha20) vers Scaleway/OVH souverain, script
  `restore-test.sh` testé mensuellement via CronJob K3s, DRP-RUNBOOK avec 4 scénarios, DRP-DRILL
  trimestriel + chaos engineering, section dépannage 12 pièges.

- `docs/adr/ADR-019-backup-recovery-strategy.md` (~225 lignes) : décision pgBackRest + MinIO
  replication + age cold storage vs 9 alternatives (AWS RDS, Backblaze, Wasabi, Veeam, Bareos,
  pg_dump simple, Restic seul, snapshots LVM/ZFS, no off-site), note souveraineté avec liste blanche
  cold storage (Scaleway Paris / OVH Strasbourg / Cellar / MinIO secondaire AES), 10 métriques de
  suivi chiffrées.

### 17.2 Cibles chiffrées

- **RTO** (Recovery Time Objective) : **< 4 h** (testé mensuellement)
- **RPO** (Recovery Point Objective) : **< 1 h** (WAL archive flush 60s)
- **Rétention** : 7 daily + 4 weekly + 12 monthly + 7 yearly (grand-père/père/fils)
- **Lag réplication MinIO** : < 5 min p95
- **Restore test mensuel** : RTO mesuré < 30 min sur staging

### 17.3 Stack cible

| Composant       | Version    | Rôle                                        |
| --------------- | ---------- | ------------------------------------------- |
| pgBackRest      | 2.55.x     | Backup Postgres full+diff+WAL               |
| MinIO           | 2025-09-07 | Object storage S3-compat + replication      |
| Redis           | 8.6        | RDB snapshot + AOF append-only              |
| HashiCorp Vault | 1.20       | Transit pour clé chiffrement (rotation 90j) |
| age             | 1.2.0      | Chiffrement XChaCha20 cold storage          |
| K3s CronJob     | 1.33       | Orchestration jobs backup quotidiens        |

### 17.4 Souveraineté (interdictions explicites ADR-019)

- AWS S3 / RDS (US, CLOUD Act)
- Backblaze B2 (US Californie)
- Wasabi (US)
- Veeam Backup SaaS (éditeur US)
- Acronis Cyber Backup (US)
- Google Cloud Storage / Azure Blob (US)

Liste blanche autorisée : **Scaleway Paris (FR), OVH Strasbourg (FR), Cellar Clever Cloud (FR),
MinIO secondaire AES (BFA/NER)**. Chiffrement double-couche (pgBackRest AES-256-CBC + age
XChaCha20) + clé privée distribuée en Shamir 3/5 aux admins CTDEC.

### 17.5 Décisions structurelles

- **3-2-1 rule stricte** : 3 copies, 2 supports, 1 off-site.
- **pgBackRest plutôt que pg_dump simple** : full+diff+WAL + PITR fin natif → RPO < 1h impossible
  avec pg_dump nightly seul.
- **MinIO replication active-passive** : écritures sur DC primaire, miroir async sur DC secondaire
  AES (Ouagadougou/Niamey).
- **age plutôt que GPG** : crypto moderne X25519 + UX simple (1 fichier de clé). GPG trop complexe
  pour Shamir + rotation.
- **Test restore mensuel automatique** : un backup non testé n'est pas un backup. CronJob
  `restore-test.sh` exit ≠ 0 → alerte critique.
- **DRP drill trimestriel chaos engineering** : 4 scénarios par an (crash node Postgres, corruption
  WAL, perte MinIO, perte cluster K3s entière) avec RTO mesuré et consigné.

### 17.6 Alertes Prometheus ajoutées (extension doc 17)

3 nouvelles règles à ajouter dans `rules/nina-aes-slo.yml` :

- `BackupJobFailed` (severity: critical)
- `RestoreTestFailed` (severity: critical)
- `MinIOReplicationLag` (severity: warning, threshold > 5 min)

### 17.7 Reste à faire (implémentation effective)

- Activer WAL archive Postgres (`postgresql.conf` ajouts)
- Configurer pgBackRest 2 repos (local + MinIO interne)
- Créer 3 CronJobs K3s : backup-postgres-daily, backup-postgres-weekly, backup-redis-snapshot,
  restore-test-monthly
- Provisionner buckets MinIO + activer replication active-passive
- Sélectionner cold storage souverain + bucket
- Générer clé age + distribuer Shamir 3/5
- Rédiger `docs/observability/DRP-RUNBOOK.md` (4 scénarios)
- Initialiser `docs/observability/DRP-DRILL-LOG.md`
- Exécuter 1er drill trimestriel (crash node Postgres)
- Tagger `backup-mvp` après validation tutorat

### 17.8 Cross-références

- `MAINTENANCE.md §9` : ligne « Backup & DRP » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md §2` : doc 19 conserve son entrée originale ; l'estimation est révisée à
  10-14 h (vs 6-8 h initial — pgBackRest + Shamir + drill trimestriel demandent plus que prévu).
- `docs/17-MONITORING-OBSERVABILITY.md §4.6` : 3 nouvelles règles d'alerting backup à ajouter à
  `rules/nina-aes-slo.yml`.

## 18. Déploiement K3s — Doc 20 + ADR-020 (mai 2026) — CLÔTURE PHASE TRANSVERSALE

Cinquième et dernière livraison documentaire de la phase transversale **Qualité / Sécurité /
Déploiement** (docs 15 → 20). La doc 20 et l'ADR-020 formalisent le passage de `docker compose`
(dev) à K3s (production), bouclant la chaîne de docs nécessaires au déploiement réel du Bloc A.

### 18.1 Livrables documentaires

- `docs/20-DEPLOYMENT-K3S-PRODUCTION.md` (~1080 lignes) : guide d'implémentation complet —
  installation K3s 1.33 (control-plane + agents), Ingress Nginx 4.12 en DaemonSet hostNetwork,
  cert-manager 1.18 avec ClusterIssuer Let's Encrypt (DNS-01 Cloudflare V1, acme-dns V2 air-gap),
  Helm chart umbrella `nina-aes` (11 services
  - 3 frontends + sous-charts Bitnami), Argo Rollouts 1.8 pour blue-green sur `identity-service`,
    Sealed Secrets 0.27, NetworkPolicy default-deny, HPA Prometheus custom metrics, smoke tests
    post-install via Helm hooks, section dépannage 12 pièges.

- `docs/adr/ADR-020-deployment-k3s-production.md` (~235 lignes) : décision K3s on-premise vs 9
  alternatives (EKS/AKS/GKE managed, OpenShift, vanilla kubeadm, microk8s, Nomad, Docker Swarm,
  plain Compose en prod), note souveraineté avec mode air-gap-ready + Harbor souverain + acme-dns
  self-hosted, 10 métriques de suivi chiffrées (RTO rollback < 1 min, cert validity ≥ 30j, etc.).

### 18.2 Stack cible

| Composant        | Version      | Rôle                                      |
| ---------------- | ------------ | ----------------------------------------- |
| K3s              | v1.33.4+k3s1 | Distribution K8s légère on-premise        |
| Helm             | 3.16.4       | Package manager + chart umbrella          |
| Ingress Nginx    | 4.12.0       | Reverse proxy + TLS termination           |
| cert-manager     | 1.18.0       | Émission/renouvellement Let's Encrypt     |
| Argo Rollouts    | 1.8.0        | Blue-green identity-service               |
| Sealed Secrets   | 0.27.0       | Secrets chiffrés commitables Git          |
| Calico ou Cilium | 3.30 / 1.17  | CNI avec NetworkPolicy (remplace Flannel) |
| MetalLB (V2)     | 0.14.x       | LoadBalancer on-premise                   |

### 18.3 Décisions structurelles

- **K3s vs vanilla K8s** : 60 MB binaire, SQLite par défaut, démarre < 30 s. Idéal CTDEC sans équipe
  SRE 10+ ETP.
- **Helm chart umbrella unique** : 1 `helm install` déploie tout — upgrade/rollback en 1 commande,
  traçables via `helm history`.
- **Blue-green seulement pour identity-service** : c'est le service le plus critique (validation
  NINA pour 11M citoyens). Les 10 autres
  - frontends sont en RollingUpdate (`maxSurge: 25%`, `maxUnavailable: 0`).
- **Argo Rollouts AnalysisTemplate** : smoke test HTTP + query Prometheus error-rate < 1 % avant
  promotion auto. Impossible de pousser une version cassée en prod.
- **Sealed Secrets > External Secrets Operator (V1)** : plus simple, pas de SPOF Vault au startup.
  ESO documenté pour V2.
- **NetworkPolicy default-deny + allow ciblé** : zero-trust intra-cluster.
- **3 namespaces séparés** : `nina-aes` (services métier), `observability` (LGTM doc 17), `infra`
  (Postgres/Redis/RabbitMQ/MinIO/ Vault/Keycloak).
- **Helm values multi-env** : `values-staging.yaml` + `values-production. yaml`, déployable depuis
  CI (doc 16 `deploy-staging.yml`).

### 18.4 Souveraineté (interdictions explicites ADR-020)

- AWS EKS, Azure AKS, Google GKE (managed cloud US)
- OpenShift SaaS (Red Hat = filiale IBM US)
- Docker Hub public en production (utiliser GHCR + Harbor V2)
- Cloudflare DNS si air-gap exigé (alternative : acme-dns self-hosted)

Stack 100 % open-source, K3s par SUSE (Allemagne CNCF), aucune télémétrie cloud par défaut.

### 18.5 Cibles chiffrées

- RTO rollback Helm : **< 1 min** (drill mensuel)
- Cert TLS validity : **≥ 30 jours** sur 100 % endpoints
- Disponibilité cluster nodes : **100 % Ready**
- Pods en CrashLoopBackOff : **< 5/semaine**
- HPA scaling events tracking only (pas de seuil bloquant)
- Argo Rollouts pre-promotion success rate : **> 95 %**
- Helm upgrade temps moyen : **< 5 min**
- Sealed Secret décryption échecs : **0**

### 18.6 Reste à faire (implémentation effective)

- Installer K3s sur 1 VM Ubuntu 24.04 (V1 staging)
- Installer CNI compatible NetworkPolicy (Calico 3.30 ou Cilium 1.17)
- Déployer Ingress Nginx + cert-manager
- Configurer ClusterIssuer Let's Encrypt (token Cloudflare ou acme-dns)
- Créer le Helm chart `infrastructure/helm/nina-aes/` (Chart.yaml + values + templates pour 11
  services + 3 frontends)
- Installer Argo Rollouts + Sealed Secrets
- Configurer NetworkPolicy default-deny + allow ciblées
- Premier `helm install` sur namespace `nina-aes-staging`
- Smoke test post-install + drill rollback mensuel
- Rédiger `docs/deployment/OPS-RUNBOOK.md` + `UPGRADE-GUIDE.md`
- Tag `production-mvp` après validation tutorat

### 18.7 Cross-références

- `MAINTENANCE.md §9` : ligne « Déploiement K3s » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md` : doc 20 livré, **clôture phase transversale 15-20** ; l'estimation est
  révisée à 14-20 h (vs 10-14 h initial — Helm chart umbrella complet + Argo Rollouts demandent
  plus).

### 18.8 État global phase transversale 15→20

| Doc | Sujet                             | Statut      | Commit      |
| --- | --------------------------------- | ----------- | ----------- |
| 15  | Security Hardening (Vault, mTLS)  | ✅ Existant | (avant)     |
| 16  | CI/CD GitHub Actions              | ✅ Livré    | `a59ef3f`   |
| 17  | Monitoring & Observabilité (LGTM) | ✅ Livré    | `1cbf838`   |
| 18  | Stratégie de tests (pyramide)     | ✅ Livré    | `f4453e4`   |
| 19  | Backup & DRP (pgBackRest + age)   | ✅ Livré    | `95ab390`   |
| 20  | Déploiement K3s production        | ✅ Livré    | (ce commit) |

**5 docs + 5 ADR livrés** sur la session phase transversale, totalisant ~5 700 lignes
documentaires + ~1 100 lignes ADR. Toutes les chaînes `verify:repo` passent vertes après chaque
livraison.

## 19. Bloc B Interopérabilité AES — Doc 21 + ADR-021 (mai 2026)

Première livraison **Blocs B → F** (extensions post-Bloc-A).

### 19.1 Livrables

- `docs/21-BLOC-B-INTEROPERABILITE-AES.md` (~620 lignes) : spec complète protocole **BCID-AES v1**
  (Border Citizen Identity — Alliance des États du Sahel), microservice `interop-service` NestJS
  port 3006, mTLS + JWS Ed25519, rate limiting 1000/h/pays via Redis sliding window, tables Prisma
  `aes_partner_keys` + `aes_verification_logs`, onglet « Interop AES » dans `apps/governance`,
  OpenAPI 3.1 publié pour partenaires BFA + NER.

- `docs/adr/ADR-021-protocole-bcid-aes-interop.md` (~225 lignes) : décision protocole custom
  BCID-AES vs 9 alternatives (eIDAS, OAuth Federation, SAML, W3C VC+DID, INTERPOL I-24/7, CEDEAO,
  gRPC, mTLS seul, JWE), note souveraineté avec position **anti-eIDAS** (refus supervision UE), 10
  métriques de suivi.

### 19.2 Décisions clés

- REST sur HTTPS + mTLS (pas gRPC, simplicité debug)
- Double couche auth : mTLS pour gateway + JWS Ed25519 pour payload
- Schéma réponse **minimaliste** `{exists, valid, vulnerable, lastUpdated}` — privacy by design,
  impossible de reconstruire base citoyens
- Versionnage explicite par path `/v1/`, `/v2/`
- Audit Merkle 10 ans compatible ADR-014

## 20. Bloc C Modules gouvernementaux — Doc 22 + ADR-022 (mai 2026)

### 20.1 Livrables

- `docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md` (~580 lignes) : 3 sous-modules consolidés — **C1
  vulnerability-service** (port 3011, catégories grossesse/handicap/65+/mineur/IDP/chronique, file
  prioritaire RDV, agent mobile offline 5j, BullMQ), **C2 SGOGT** (messagerie officielle JWS
  Ed25519, escalade TTL 4h/24h), **C3 Élections** (inscription auto à 18 ans via cron quotidien
  Africa/Bamako, export delta DGE signé SHA-256 + JWS, pseudonyme via sel rotated 5 ans).

- `docs/adr/ADR-022-modules-gouvernementaux-scope.md` (~145 lignes) : décision **2 microservices**
  (`vulnerability-service` autonome + `governance-service` contenant SGOGT + Élections) vs 3 séparés
  ou 1 monolithique, 8 alternatives rejetées, 8 métriques de suivi.

### 20.2 Décisions clés

- vulnerability-service autonome (cache offline + BullMQ spécifique)
- SGOGT + Élections consolidés dans governance-service (RBAC + UI partagés)
- Pseudonyme électeurs = SHA-256(NINA + sel-élection-rotated-5y)
- Aucun NINA en clair dans export DGE

## 21. Bloc D SIGAC Anti-corruption — Doc 23 + ADR-023 (mai 2026)

### 21.1 Livrables

- `docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md` (~680 lignes) : `anticorruption-service` FastAPI port
  3009 (scaffold existant étendu), 3 modèles ML (**Isolation Forest** scikit-learn 1.7 pour
  anomalies agents, **LSTM** PyTorch 2.5 séries temporelles, **BERT AfroXLMR**
  `Davlan/afro-xlmr-base` pour classif signalements multilingue bambara/peul), scoring intégrité 5
  facteurs hebdo (0-100), canal USSD `*123*ALERTE#` chiffré Vault Transit Ed25519 (numéro téléphone
  JAMAIS enregistré), workflow lanceur d'alerte, MLflow self-hosted pour tracking.

- `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md` (~230 lignes) : décision stack 3 modèles
  complémentaires vs 8 alternatives (GPT-4 SaaS, Llama 3, autoencoder seul, règles uniquement, Tor,
  PGP), distinction explicite avec ADR-015 (erreurs NINA vs comportements agents), interdiction
  Datadog APM / SageMaker / Vertex AI.

### 21.2 Décisions clés

- **Le ML ne décide pas, il flagge** — RGPD art. 22 compliance
- Anonymat lanceur d'alerte mathématiquement garanti (chiffrement asymétrique côté serveur, clé
  privée Vault non exportable)
- AfroXLMR pré-entraîné langues africaines (vs `bert-multilingual-cased`)
- Dataset synthétique pour fine-tuning (zero leak NINA réels)

## 22. Bloc E Bornes kiosque — Doc 24 + ADR-024 (mai 2026)

### 22.1 Livrables

- `docs/24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md` (~620 lignes) : app Electron 31 LTS `apps/kiosk`, mode
  kiosque verrouillé Win+Linux, preload sécurisé (contextIsolation + sandbox), 4 écrans pictogrammes
  (Scan / Book / Print / Report), lecteur QR via `@zxing/browser`, imprimante thermique ESC/POS via
  `node-thermal-printer`, cache local SQLite + queue offline 24h, auto-update signé Ed25519 depuis
  serveur souverain interne, télémétrie heartbeat 5 min vers `apps/admin`.

- `docs/adr/ADR-024-kiosk-electron-vs-pwa.md` (~190 lignes) : décision Electron 31 vs 7 alternatives
  (PWA, Win32 C#, native Qt/GTK, tablette Android, LineageOS, Tauri, Wails, pas de borne du tout),
  note souveraineté avec auto-update interne uniquement (pas GitHub release public), migration Tauri
  envisagée V3.

### 22.2 Décisions clés

- Réutilisation 80 % du code citizen-app
- contextIsolation + sandbox + CSP strict obligatoires
- Auto-update signé Ed25519, jamais GitHub release
- Mode offline 24h gracieux (queue SQLite)

## 23. Bloc F Biométrie — Doc 25 + ADR-025 (mai 2026, vision V1)

### 23.1 Livrables

- `docs/25-BLOC-F-BIOMETRIE.md` (~580 lignes) : **plan progressif V1 (vision sans implémentation)**,
  phasage P3a (empreintes 1:1) → P3b (face 1:1) → P3c (1:N restreint), pipeline hash irréversible
  HMAC-SHA-256 + salt Vault rotated 5y, format ISO/IEC 19794-\* (pas de vendor lock-in),
  consentement signé JWS Ed25519 obligatoire, audit Merkle de chaque opération biométrique, DPIA
  modèle, critères go/no-go chiffrés entre phases (FAR < 0.01 %, FRR < 1 %).

- `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md` (~230 lignes) : décision phasage
  strict + hash irréversible obligatoire vs 8 alternatives (no biometrics, templates clair
  encrypted, images brutes, match-on-card Estonie, Aadhaar centralisé clear, algos propriétaires,
  fingerprint smartphone TouchID/FaceID, pas de phasage), note souveraineté avec interdiction
  Microsoft Face / AWS Rekognition / Google Vision.

### 23.2 Décisions clés

- **Statut V1 = vision seulement** — implémentation conditionnée à cadre juridique malien
  stabilisé + validation OCLEI + pen-test ANSSI
- Hash HMAC-SHA-256(template, salt Vault) — irréversible
- Aucune image brute persistée (RAM only < 200 ms)
- Salt rotation 5y = défense ultime (force re-enrôlement si Vault compromis)
- 1:N uniquement avec mandat judiciaire + double validation procureur

## 24. Rapport final soutenance — Doc 26 (mai 2026)

### 24.1 Livrables

- `docs/26-RAPPORT-FINAL-SOUTENANCE.md` (~580 lignes) : plan d'écriture du rapport final 60-80 pages
  structure UQAR, plan présentation soutenance 20-30 min (intro / démo live 12 min / architecture /
  qualité / blocs B-F / conclusion), script démonstration live minute par minute avec plan B en cas
  de panne, tableau métriques chiffrées consolidées, top 30 questions anticipées + réponses
  préparées, rétrospective honnête (ce qui a marché / pas marché / referait autrement), checklist
  J-15 à J-jour J.

### 24.2 Pas d'ADR

Le doc 26 est un **plan de soutenance**, pas une décision architecturale → pas d'ADR-026 associée.
Les 25 ADRs (001-025) couvrent l'intégralité des décisions techniques du projet.

### 24.3 Rétrospective honnête livrée

5 succès assumés + 5 échecs assumés + 5 « ce qu'on referait autrement » + 5 leçons personnelles.
Volonté explicite de transparence pédagogique pour le jury.

## 25. État global docs (00-26) — CLÔTURE COMPLÈTE

| Doc | Sujet                          | Statut      | Commit      |
| --- | ------------------------------ | ----------- | ----------- |
| 00  | README Index                   | ✅ Existant | (avant)     |
| 01  | Cahier des charges             | ✅ Existant | (avant)     |
| 02  | Architecture globale           | ✅ Existant | (avant)     |
| 03  | Setup environnement dev        | ✅ Existant | (avant)     |
| 04  | Monorepo Structure             | ✅ Existant | (avant)     |
| 05  | Infrastructure Docker Compose  | ✅ Existant | (avant)     |
| 06  | Database Schema Prisma         | ✅ Existant | (avant)     |
| 07  | Backend Identity Service       | ✅ Existant | (avant)     |
| 08  | Backend Auth Service           | ✅ Existant | (avant)     |
| 09  | Backend Audit Service          | ✅ Existant | (avant)     |
| 10  | Backend Document Service       | ✅ Existant | (avant)     |
| 11  | AI Service FastAPI             | ✅ Existant | (avant)     |
| 12  | Frontend Integration API       | ✅ Existant | (avant)     |
| 13  | Mobile App Expo                | ✅ Existant | (avant)     |
| 14  | USSD Service Africa's Talking  | ✅ Existant | (avant)     |
| 15  | Security Hardening             | ✅ Existant | (avant)     |
| 16  | CI/CD GitHub Actions           | ✅ Livré    | `a59ef3f`   |
| 17  | Monitoring & Observabilité     | ✅ Livré    | `1cbf838`   |
| 18  | Stratégie de tests             | ✅ Livré    | `f4453e4`   |
| 19  | Backup & DRP                   | ✅ Livré    | `95ab390`   |
| 20  | Déploiement K3s                | ✅ Livré    | `971bd60`   |
| 21  | Bloc B Interop AES             | ✅ Livré    | (ce commit) |
| 22  | Bloc C Modules gouvernementaux | ✅ Livré    | (ce commit) |
| 23  | Bloc D SIGAC                   | ✅ Livré    | (ce commit) |
| 24  | Bloc E Bornes kiosque          | ✅ Livré    | (ce commit) |
| 25  | Bloc F Biométrie (vision V1)   | ✅ Livré    | (ce commit) |
| 26  | Rapport final soutenance       | ✅ Livré    | (ce commit) |

**27/27 documents livrés** + **25 ADRs livrés** (001-025). Le doc 26 n'a pas d'ADR (c'est un plan,
pas une décision archi).

Volume total session Blocs B→F + soutenance (ce commit) :

- 5 docs Blocs : ~3 080 lignes
- 1 doc soutenance : ~580 lignes
- 5 ADRs : ~1 020 lignes
- **Total : ~4 680 lignes documentaires**

Volume total docs 16-26 (phase transversale + extensions) :

- 11 docs : ~8 360 lignes
- 10 ADRs : ~2 100 lignes
- **Grand total : ~10 460 lignes documentaires sur la session**

`pnpm run verify:repo` ✅ vert.

## 26. Corrélation documentaire — DOCUMENTATION-MAP.md + fixes drifts (mai 2026)

Après la clôture 27/27 docs + 25/25 ADRs, audit complet du système documentaire et création d'une
**carte unique de corrélation** avec correction des dérives détectées.

### 26.1 Livrable principal

- **`docs/DOCUMENTATION-MAP.md`** (~610 lignes) : carte des 3 tiers documentaires (gouvernance /
  canonique / ADRs), matrice de corrélation cross-références, registre des **12 drifts identifiés**,
  recommandations priorisées **P0/P1/P2** avec actions exécutables.

### 26.2 Drifts P0 corrigés immédiatement

3 références ADR cassées (titres / fichiers cibles incohérents) :

| ADR     | Bug avant                                                                                                 | Fix appliqué                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ADR-020 | `[ADR-015 — Sécurité hardening (mTLS, Vault)](./ADR-015-ml-stack-detection-erreurs-nina.md)` (titre faux) | Retiré du header « Complète » ; remplacé par bandeau « **Cf. aussi** : doc 15 » |
| ADR-024 | `[ADR-013 — Mobile Expo](./ADR-013-keycloak-identity-provider.md)` (titre faux, fichier = Keycloak)       | Retiré ; remplacé par « **Cf. aussi** : doc 13 Mobile Expo (pas d'ADR dédié) »  |
| ADR-025 | `[ADR-015 — Sécurité hardening](./ADR-015-ml-stack-detection-erreurs-nina.md)` (idem)                     | Idem                                                                            |

**Cause racine** : confusion entre numéro ADR et numéro doc. ADR-013 existe (Keycloak Identity
Provider) mais ne couvre pas le doc 13 (Mobile Expo) — il n'y a PAS d'ADR Mobile dédié. Idem ADR-015
existe (ML Stack) mais ne couvre pas le doc 15 (Security Hardening).

### 26.3 Drifts P1 corrigés (alignement gouvernance)

- **`AGENTS.md`** : ajout `verify:repo` + `docs:sync:check` dans validation commands ; ajout
  référence `DOCUMENTATION-MAP.md` en étape 4 mandatory reading order (graphify devient étape 5 avec
  mention « may be stale »).
- **`CLAUDE.md`** : ajout référence `DOCUMENTATION-MAP.md` étape 5 first checks.
- **`.github/copilot-instructions.md`** : ajout `DOCUMENTATION-MAP.md` étape 4 mandatory context ;
  mention « check date in header — may be stale » pour graphify.
- **`.cursor/rules/ai-governance.mdc`** : ajout `DOCUMENTATION-MAP.md` dans source-of-truth docs.
- **`README.md`** : enrichi (+30 lignes) avec lien direct vers carte, MAINTENANCE, ADRs, section
  souveraineté numérique explicite, statut 27/27 docs livrés.
- **`graphify-out/GRAPH_REPORT.md`** : bandeau **STALE** en en-tête documentant les 7 commits
  postérieurs au snapshot 2026-05-05.
- **`MAINTENANCE.md` §9** : `DOCUMENTATION-MAP.md` ajoutée **en tête** du tableau « Liens canoniques
  » (sujet : « Carte de toute la doc »).

### 26.4 Drifts P0 à arbitrer (orphelins non encore traités)

**2 docs orphelins de 2 908 lignes** :

- `docs/01-fondations-monorepo-outillage-dx.md` (1 286 lignes)
- `docs/02-infrastructure-docker-services-donnees.md` (1 622 lignes)

Superposés par `01-CAHIER-DES-CHARGES.md` et `02-ARCHITECTURE-GLOBALE.md` (canoniques dans
00-README-INDEX). 3 options documentées dans `DOCUMENTATION-MAP.md` §7 (P0 #2) :

- **A.** Déplacer vers `docs/_archive/` avec README explicatif
- **B.** Supprimer (`git rm`)
- **C.** Renommer en `*-LEGACY.md` pour conservation visible

→ **À arbitrer avec l'utilisateur** avant action — non bloquant pour la chaîne verify:repo.

### 26.5 Drifts P1/P2 différés (V2 ou plus tard)

- **ADR-013 Mobile Expo** manquant → à créer V2
- **ADR pour doc 15 Security Hardening** manquant → à créer V2 (actuellement le slot ADR-015 est
  utilisé pour ML, pas sécurité)
- **Backfill `Complète :` sur ADRs 001-013** (format ancien sans graphe explicite) → reporté V2
- **Re-génération graphify** (`graphify update .`) → à exécuter manuellement
- **Extension `docs-sync-check.mjs`** pour vérifier plus de refs (chaque ADR cite son doc parent,
  chaque doc 16-26 référencé, format ADR uniforme, etc.) → reporté V2

### 26.6 État final post-corrélation

- ✅ 27/27 docs canoniques livrés
- ✅ 25/25 ADRs livrés (2 ADRs manquants identifiés et documentés — mobile + security — non
  bloquants V1)
- ✅ 6 fichiers gouvernance alignés sur les **5 invariants partagés** (cf. `DOCUMENTATION-MAP.md`
  §2.2)
- ✅ 1 carte centrale `DOCUMENTATION-MAP.md`
- ⚠️ 2 orphelins identifiés mais conservés (décision utilisateur requise pour suppression/archive)
- ⚠️ graphify snapshot stale 11 jours mais signalé en en-tête

### 26.7 Cross-références

- `MAINTENANCE.md §9` : `DOCUMENTATION-MAP.md` en tête liens canoniques
- `README.md` : lien direct + statut 27/27 docs
- 4 fichiers gouvernance IA : tous référencent `DOCUMENTATION-MAP.md` dans leur mandatory reading
  order
- Ce document devient le **6ᵉ point d'entrée obligatoire** pour tout assistant IA opérant sur le
  repo (après CHANGELOG, 00-README-INDEX, MAINTENANCE, AGENTS, et lui-même).

`pnpm run verify:repo` ✅ vert.

## 27. CI/CD — Implémentation effective des workflows (PROMPT 2.2, mai 2026)

Première **implémentation YAML** de la spec CI/CD documentée doc 16

- ADR-016. Les 13 corrections identifiées au CHANGELOG §14.2 sont appliquées, et 4 nouveaux
  workflows livrés en complément de `ci.yml`.

### 27.1 Livrables

| Fichier                                      | Type             | Rôle                                                         |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `.nvmrc`                                     | racine           | Pin Node 24 (lu par setup-node-pnpm)                         |
| `.github/actions/setup-node-pnpm/action.yml` | composite action | Factorisation checkout+pnpm+node+install (40 lignes)         |
| `.github/workflows/ci.yml`                   | workflow         | **Pipeline principal — 7 jobs parallèles** (rewrite complet) |
| `.github/workflows/cd-staging.yml`           | workflow         | Déploiement K3s staging (sur succès CI sur main)             |
| `.github/workflows/release.yml`              | workflow         | Build + GitHub Release sur tag v*.*.\*                       |
| `.github/workflows/codeql.yml`               | workflow         | Analyse statique CodeQL TS/JS + Python                       |
| `.github/dependabot.yml`                     | config           | 7 écosystèmes (npm/pip×3/docker/gh-actions×2)                |

### 27.2 ci.yml — 7 jobs parallèles

1. **`lint`** — ESLint + Prettier + Typecheck + `verify:repo` (10 min)
2. **`test-backend`** — Jest + services `postgis/postgis:18-3.6`, `redis:8.6-alpine`,
   `rabbitmq:4.2-management-alpine` (15 min)
3. **`test-ai`** — Pytest matrix [ai-service, anticorruption-service], Python 3.14 (10 min)
4. **`test-frontend`** — Jest + RTL sur citizen + admin + governance + packages/ui (12 min)
5. **`test-e2e`** — Playwright mock auth, cache browsers, build citizen
   - admin avant tests (20 min)
6. **`build`** — Docker matrix 11 services → GHCR (push main uniquement, 20 min)
7. **`security`** — Trivy + Semgrep + gitleaks + pnpm audit + Bandit (15 min)

**Cache multi-niveaux** : pnpm store (natif setup-node), Playwright browsers (actions/cache keyed
pnpm-lock), pip wheels (natif setup-python), Docker buildx (`cache-from: type=gha`).

### 27.3 Décision souveraineté : pas de Snyk

Le PROMPT 2.2 initial mentionnait « Snyk packages » dans le job security. **Remplacé par stack
open-source équivalente** conforme à ADR-016 (qui interdit explicitement Snyk SaaS US) :

| Couverture            | Outil retenu                                | Remplace         |
| --------------------- | ------------------------------------------- | ---------------- |
| CVEs filesystem       | Trivy (Aqua, Apache 2.0)                    | Snyk Code        |
| Static analysis OWASP | Semgrep (returntocorp, LGPL 2.1)            | Snyk Code        |
| Secrets git history   | gitleaks (MIT)                              | Snyk Code        |
| CVEs npm deps         | `pnpm audit` (built-in)                     | Snyk Open Source |
| CVEs pip deps         | Bandit + (pip-audit dans workflow security) | Snyk Open Source |

Couverture équivalente, 0 dépendance SaaS US, 0 coût.

### 27.4 13 corrections appliquées (cf. CHANGELOG §14.2)

|   # | Avant                                | Après                                             |
| --: | ------------------------------------ | ------------------------------------------------- |
|   1 | `postgres:16-alpine`                 | `postgis/postgis:18-3.6`                          |
|   2 | `redis:7-alpine`                     | `redis:8.6-alpine`                                |
|   3 | `rabbitmq:3.13-alpine`               | `rabbitmq:4.2-management-alpine`                  |
|   4 | `PYTHON_VERSION: "3.12"`             | Python 3.14                                       |
|   5 | `POSTGRES_USER: nina_user`           | `nina_admin` (aligné `init-db.sql`)               |
|   6 | `pnpm db:push`                       | `prisma migrate deploy`                           |
|   7 | Tests Python : ai-service seul       | + anticorruption-service (matrix)                 |
|   8 | 0 cache Playwright                   | `actions/cache@v4` keyed pnpm-lock                |
|   9 | 0 SARIF upload                       | `github/codeql-action/upload-sarif`               |
|  10 | 1 fichier `ci.yml` monolithique      | 7 jobs propres + 4 workflows annexes              |
|  11 | 0 Dependabot                         | `.github/dependabot.yml` 7 écosystèmes + grouping |
|  12 | 0 composite action (duplication × 4) | `.github/actions/setup-node-pnpm`                 |
|  13 | 0 CodeQL                             | `.github/workflows/codeql.yml` (TS + Python)      |

### 27.5 cd-staging.yml — déploiement K3s

- Déclencheur : `workflow_run` succès du CI sur `main`
- Concurrence : `cancel-in-progress: false` (jamais annuler un déploiement)
- Environnement GitHub : `staging` avec URL `vars.STAGING_DOMAIN`
- Helm upgrade `--install` `nina-aes/values-staging.yaml` (atomic, wait, 15 min timeout)
- Smoke test `/api/health` avec retry 10× 15s
- Détection automatique « chart absent » → message d'erreur explicite vers doc 20

### 27.6 release.yml — SemVer automatisé

- Déclencheur : `push` tag `v*.*.*`
- Job 1 : build matrix 11 services → ghcr.io avec tags
  `version + version-major.minor + major + stable`
- Job 2 : génération CHANGELOG depuis le tag précédent (git log oneline) + création GitHub Release
  via `gh release create`
- Détection auto pré-release pour `v0.*` ou `-alpha/-beta/-rc`

### 27.7 codeql.yml — analyse sémantique

- Déclencheurs : push main + PR main + cron hebdomadaire (lundi 03:00 UTC)
- Matrix : `javascript-typescript` + `python`
- Querysets : `security-extended` + `security-and-quality`
- Paths-ignore : node_modules, .turbo, dist, build, coverage, playwright-report, graphify-out,
  data/\_raw, docs
- Upload SARIF vers Security tab GitHub (require Advanced Security payant pour les repos privés —
  fallback artefact sinon)

### 27.8 dependabot.yml — 7 écosystèmes

| Eco            | Path                               | Limit | Groupes                                                |
| -------------- | ---------------------------------- | ----: | ------------------------------------------------------ |
| npm            | `/`                                |     8 | prisma, next-react, nestjs, opentelemetry, dev-tooling |
| pip            | `/services/ai-service`             |     4 | ml-stack, fastapi-stack                                |
| pip            | `/services/anticorruption-service` |     4 | —                                                      |
| pip            | `/scripts`                         |     2 | —                                                      |
| docker         | `/infrastructure/docker`           |     4 | —                                                      |
| github-actions | `/`                                |     4 | actions-core, docker-actions, security-actions         |
| github-actions | `/.github/actions/setup-node-pnpm` |     2 | —                                                      |

- Schedule weekly lundi 06:00 `Africa/Bamako`
- Ignore majeurs Prisma + Next/React + PostGIS (review manuelle)
- Commit prefix `deps(scope)`
- Labels automatiques `dependencies` + écosystème

### 27.9 Validation locale

```powershell
# Linter les workflows
docker run --rm -v ${PWD}:/repo rhysd/actionlint -color

# Rejouer un workflow en local via act
act -W .github/workflows/ci.yml pull_request

# Vérifier le yaml de dependabot
docker run --rm -v ${PWD}:/repo node:24-alpine \
  sh -c "npm i -g yaml && yaml /repo/.github/dependabot.yml"
```

### 27.10 Reste à faire (gating réel)

L'implémentation est livrée mais le **gating effectif** demande :

- ⏳ Provisionner les secrets GitHub `K3S_STAGING_KUBECONFIG` + variable `STAGING_DOMAIN`
- ⏳ Créer environnement `staging` dans Settings → Environments
- ⏳ Activer branch protection main avec required checks (lint, test-backend, test-ai,
  test-frontend, security)
- ⏳ Activer GitHub Advanced Security pour upload SARIF (repo privé) OU fallback artefact (repo
  public)
- ⏳ Premier déploiement K3s staging nécessite le Helm chart (doc 20)
- ⏳ Activer Dependabot dans Settings → Security → Code security

### 27.11 Validation

- `pnpm run verify:repo` : ✅ data + schemas + docs sync.
- `actionlint` : à exécuter avant merge (pas dans `verify:repo`).
- `.github/workflows/ci.yml` ancien (200+ lignes monolithiques) : remplacé in-place.

### 27.12 Cross-références

- `docs/16-CICD-GITHUB-ACTIONS.md` reste la spec architecturale ; ce commit livre l'implémentation
  correspondante.
- `docs/adr/ADR-016-cicd-github-actions.md` reste la décision ; aucune modification (souveraineté
  Snyk → Trivy+Semgrep+gitleaks déjà actée).
- `docs/CHANGELOG.md §14.2` : les 13 écarts ci.yml historique sont désormais corrigés (tableau §27.4
  ci-dessus).

## 28. Hooks Git + Conventional Commits (PROMPT 2.3, mai 2026)

Complétion de la configuration Husky qui était à l'état partiel (pre-commit + commit-msg basiques
mais sans lint-staged, sans pre-push, sans Python, prepare script bogué). Ferme le gap CHANGELOG §2
« Husky non configuré ».

### 28.1 Livrables

| Fichier                    | Type            | Rôle                                                               |
| -------------------------- | --------------- | ------------------------------------------------------------------ |
| `.husky/pre-commit`        | hook (rewrite)  | lint-staged + typecheck filtered + pnpm audit + verify:repo        |
| `.husky/commit-msg`        | hook (refactor) | commitlint avec messages d'aide enrichis                           |
| `.husky/pre-push`          | hook (nouveau)  | turbo test + build filtered `[HEAD~1]`                             |
| `commitlint.config.js`     | config (extend) | +30 scopes (sigac, sgogt, data, mali, etc.) + type `data`          |
| `package.json` lint-staged | config          | +Python (ruff) +Prisma +CSS/SCSS, séparation mjs/cjs               |
| `package.json` prepare     | script (fix)    | `husky` simple (avant : `cd .. && husky nina-aes-platform/.husky`) |
| `CONTRIBUTING.md`          | doc (nouveau)   | guide contribution complet 11 sections                             |

### 28.2 Hook pre-commit — 4 étapes < 30 s

```
1. 🧹 lint-staged       → eslint --fix + prettier --write + ruff (stagés seulement)
2. 🔍 typecheck         → turbo run check-types --filter=...[HEAD]
3. 🔒 pnpm audit        → CVEs CRITICAL/HIGH sur deps prod
4. 📋 verify:repo       → invariants Mali + JSON Schemas + cross-refs docs
```

**Décision** : `pnpm audit signatures` n'existe pas (spécifique npm). Remplacé par
`pnpm audit --audit-level=high --prod` + integrity hashes natifs de `pnpm-lock.yaml`. Couverture
équivalente.

### 28.3 Hook pre-push — 2 étapes < 3 min

```
1. 🧪 turbo run test --filter=...[HEAD~1]
2. 🏗️  turbo run build --filter=...[HEAD~1]
```

**Décision** : pas de Playwright E2E en pre-push (lent, tourne en CI uniquement). Filter `[HEAD~1]`
cible les workspaces ayant changé depuis l'avant-dernier commit local.

### 28.4 commitlint.config.js — extension complète

- **Types autorisés** : +`data` (pour `data/mali/`, `schemas/`, seeds)
- **Scopes services** (12) : ajout `sigac`, `sgogt` (alias pour anticorruption-service + module
  SGOGT du governance-service)
- **Scopes apps** (6) : `citizen`, `admin`, `gov`, `mobile`, `kiosk`, `ussd`
- **Scopes packages** (10) : ajout `auth-pkg`, `api-client`, `i18n`, `logger`, `test-fixtures`
- **Scopes transverse** (15) : ajout `docker`, `k3s`, `biometrics`, `data`, `mali`, `security`,
  `observability`, `testing`, `backup`, `docs`
- **Règles** : `type-case` lower-case strict, `header-max-length` 100, `body-max-line-length` 100
  warning, `subject-empty` interdit, `subject-full-stop` interdit, `scope-empty` autorisé

Total : **45 scopes** + 12 types autorisés.

### 28.5 lint-staged — 4 patterns

| Pattern                         | Outils                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `*.{ts,tsx,js,jsx,mjs,cjs}`     | `eslint --fix --max-warnings=0` + `prettier --write`      |
| `*.py`                          | `ruff check --fix --exit-non-zero-on-fix` + `ruff format` |
| `*.{json,md,yml,yaml,css,scss}` | `prettier --write`                                        |
| `*.prisma`                      | `prettier --write --plugin=prisma`                        |

**Prérequis Python** : ruff doit être sur le PATH (installé via venv des services FastAPI).
Documenté dans `CONTRIBUTING.md §4`.

### 28.6 prepare script — fix critique

Avant (bogué) :

```json
"prepare": "cd .. && husky nina-aes-platform/.husky"
```

Après (Husky 9 standard) :

```json
"prepare": "husky"
```

L'ancienne forme supposait un parent layout invalide. Husky 9 trouve automatiquement `.husky/` dans
le cwd.

### 28.7 CONTRIBUTING.md — 11 sections

1. Setup initial (5 min)
2. Hooks Git installés (tableau)
3. Conventional Commits (grammaire + types + scopes + exemples)
4. Lint-staged (quoi se passe par pattern)
5. Workflow type d'une feature (PR steps)
6. Conventions de code (TS / Python / Markdown)
7. Tests — quoi attendre par PR
8. Documentation — quoi mettre à jour avec quoi (lien MAINTENANCE §3)
9. Sécurité — règles non négociables
10. Bypass d'urgence (à éviter)
11. Pour aller plus loin

### 28.8 Cross-références

- `MAINTENANCE.md §3` : reste hub central pour « Quand modifier quoi » (CONTRIBUTING.md §8 y
  renvoie)
- `docs/DOCUMENTATION-MAP.md §2.2` : 5 invariants partagés (CONTRIBUTING reste plus opérationnel,
  DOCUMENTATION-MAP reste plus structurel)
- `docs/16-CICD-GITHUB-ACTIONS.md` : workflows GitHub Actions référencés depuis CONTRIBUTING.md §5 «
  workflow type »

### 28.9 Reste à faire (activation)

- ⏳ Première installation : `pnpm install` (déclenche `prepare → husky`)
- ⏳ Vérifier `git config core.hooksPath` retourne `.husky/_`
- ⏳ Tester un commit invalide en local pour valider que commit-msg bloque correctement
- ⏳ Si prettier-plugin-prisma manque : `pnpm add -Dw prettier-plugin-prisma`
- ⏳ Si ruff manque : activer venv `services/ai-service/.venv` ou installer globalement
  (`pip install ruff` sur le PATH)

### 28.10 Validation

- `pnpm run verify:repo` : ✅ data + schemas + docs sync.
- Les hooks sont effectivement réécrits (lecture des fichiers confirme).
- `commitlint.config.js` reste valide (extends conventional + rules).

Ce commit ferme le gap connu **« Husky non configuré »** documenté dans CHANGELOG §2 /
00-README-INDEX §1 dernière ligne du tableau « Husky + hooks pre-commit ⚠️ Présent mais à configurer
fully ».

## 29. HashiCorp Vault — Setup complet + clients TS/Python (PROMPT 2.4, mai 2026)

Implémentation effective de la couche secrets management documentée doc 15 §4 (existante) + ADR-019
§17.4 (rotation). Vault 1.20 était déjà actif en dev mode dans docker-compose (cf. §9.5) mais sans
policies, sans seed, sans client applicatif.

### 29.1 Livrables

| Fichier                                              | Type               | Rôle                                                                                                  |
| ---------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `infrastructure/vault/vault-init.sh`                 | shell (idempotent) | Active 5 engines, applique 5 policies, configure AppRole pour 3 services                              |
| `infrastructure/vault/policies/identity-service.hcl` | HCL policy         | Lecture kv/database/identity-app + lookup-self                                                        |
| `infrastructure/vault/policies/auth-service.hcl`     | HCL policy         | Lecture jwt/private + transit/sign/jwt-signing-rs256                                                  |
| `infrastructure/vault/policies/ai-service.hcl`       | HCL policy         | Lecture kv/ai + database/creds/ai-readonly UNIQUEMENT                                                 |
| `infrastructure/vault/policies/admin.hcl`            | HCL policy         | R/W kv + database + transit (sauf sigac-whistleblower)                                                |
| `infrastructure/vault/policies/auditor.hcl`          | HCL policy         | READ-ONLY metadata + audit logs, deny tout secret                                                     |
| `infrastructure/vault/seed-secrets.sh`               | shell (dev)        | Pré-remplit 10 secrets : JWT RS256, DB×11, Africa's Talking, Keycloak, MinIO, SIGAC, BCID-AES, backup |
| `infrastructure/vault/rotate-secrets.sh`             | shell              | Rotation Transit + Postgres root + AppRole secret_id                                                  |
| `infrastructure/k8s/cronjobs/vault-rotation.yaml`    | K8s CronJob        | Schedule trimestriel (jan/avr/jul/oct) + rollout restart services                                     |
| `packages/vault-client/`                             | TS workspace       | Client NestJS — AppRole/token/k8s + cache TTL + auto-renew                                            |
| `packages/vault-client/src/__tests__/client.test.ts` | tests              | Mocks fetch — login, cache, sign/verify                                                               |
| `services/ai-service/src/vault.py`                   | Python module      | Client hvac équivalent — context manager, thread renew, hash thread-safe                              |
| `services/ai-service/requirements.txt`               | deps               | +`hvac>=2.4.1`                                                                                        |
| `services/anticorruption-service/requirements.txt`   | deps               | +`hvac>=2.4.1` (réutilise vault.py)                                                                   |
| `docs/security/vault-usage.md`                       | doc                | Guide opérationnel 9 sections + cheatsheet                                                            |
| `Makefile`                                           | cibles             | +`vault-seed`, +`vault-rotate`, +`vault-bootstrap`, refonte `vault-init`                              |

### 29.2 Décisions clés

**Vault 1.20** (pas 1.18 comme dans PROMPT 2.4) pour rester aligné avec docker-compose.dev.yml +
CHANGELOG §9.5.

**5 engines activés** :

- `kv-v2` (`kv/`) — secrets génériques avec versioning
- `pki` (`pki/`) — CA interne mTLS (cf. doc 15 §4.2)
- `database` (`database/`) — credentials Postgres dynamiques 24h
- `transit` (`transit/`) — chiffrement/signature avec clé in-Vault
- `totp` (`totp/`) — MFA agents CTDEC

**5 policies HCL** avec **deny explicites** (defense-in-depth) :

| Policy             | Audience    | Privilèges clés                                        |
| ------------------ | ----------- | ------------------------------------------------------ |
| `identity-service` | service     | read kv/identity + database/identity-app               |
| `auth-service`     | service     | read jwt/private + transit/sign/jwt-rs256              |
| `ai-service`       | service     | read kv/ai + database/ai-readonly (deny tout autre)    |
| `admin`            | humain MFA  | R/W kv + database + transit (sauf sigac-whistleblower) |
| `auditor`          | OCLEI/ANSSI | metadata only + audit logs (deny data)                 |

**3 méthodes auth** supportées :

- `token` (dev avec `nina-dev` ou production root one-shot)
- `approle` (recommandé services, TTL 24h max 72h)
- `kubernetes` (ServiceAccount mapping pour K3s prod)

**Auto-renew à 80 % TTL** : les clients TS et Python renouvellent automatiquement leur token avant
expiration via thread daemon (Python) ou setTimeout unref (TS).

**Cache mémoire TTL 5 min par défaut** sur `getSecret()` : configurable via `cacheTtlSeconds`.
`clearCache()` exposé pour invalidation post-rotation.

**Refus explicite de sigac-whistleblower decrypt** dans `admin.hcl` : seul le rôle `prosecutor`
(créé manuellement) peut déchiffrer les signalements lanceurs d'alerte (cf. ADR-023 §Note
souveraineté).

### 29.3 Rotation automatique trimestrielle (4×/an)

CronJob K3s `vault-rotation` :

- **Schedule** : `0 3 1 1,4,7,10 *` (1ᵉʳ jan/avr/jul/oct, 03:00 UTC)
- **3 actions** :
  1. Rotation `transit/keys/jwt-signing-rs256` et `aes-interop-mli`
  2. Rotation root password Postgres (`database/rotate-root/nina-postgres`)
  3. Émission nouveaux `secret_id` AppRole + rollout restart des 5 services principaux
- **NE TOUCHE PAS** à `sigac-whistleblower` (rotation manuelle par procureur pour préserver les
  signalements en attente, cf. ADR-023)
- **Alerting** : `VaultRotationFailed` via Alertmanager (cf. doc 17)

### 29.4 Souveraineté

- Stack 100 % open-source HashiCorp Vault (MPL 2.0)
- Mode air-gap-ready (pas d'appel vers vaultproject.io ou HashiCorp Cloud Platform)
- HCL policies versionnées en Git (audit ANSSI trivial)
- Sealed Secrets recommandé pour les K8s Secrets contenant les AppRole secret_id (cf. doc 20 §4.5)
- Toutes les commandes documentées avec valeurs PowerShell Windows (poste de travail étudiant)

### 29.5 Activation locale

```powershell
# 1) Vault doit tourner
pnpm docker:up

# 2) Bootstrap complet (engines + policies + AppRoles + seed)
make vault-bootstrap

# 3) Vérifier
docker exec nina-vault vault kv list kv/
docker exec nina-vault vault policy list
```

### 29.6 Reste à faire (V2)

- ⏳ Installer prettier-plugin-prisma (lint-staged glob `*.prisma`)
- ⏳ Configurer `auth/kubernetes` quand K3s prod opérationnel (doc 20)
- ⏳ Activer audit file `/vault/logs/audit.log` + Promtail shipping vers Loki (cf. doc 17 §4.5)
- ⏳ Provisionner Sealed Secret pour `vault-rotator-token` dans K8s (actuellement
  `PLACEHOLDER_REPLACE_AVEC_SEALED_SECRET`)
- ⏳ Helm chart `nina-aes` doit monter le ConfigMap `vault-rotate-script` avec le contenu réel de
  `rotate-secrets.sh` (sync CI)
- ⏳ Documenter procédure de génération + distribution Shamir 3/5 en prod (cf.
  `vault operator init -key-shares=5 -key-threshold=3`)

### 29.7 Cross-références

- `docs/15-SECURITY-HARDENING.md §4` : architecture Vault (existant)
- `docs/security/vault-usage.md` : guide opérationnel (nouveau)
- `docs/adr/ADR-019-backup-recovery-strategy.md §17.4` : rotation intégrée au DRP
- `docs/00-README-INDEX.md` : tableau état Vault passe de partiel à ✅
- `Makefile` : 6 cibles `vault-*` (vs 3 avant)

`pnpm run verify:repo` ✅ vert.

## 30. Stack monitoring complète — Prometheus + Grafana + Loki + Jaeger + Alertmanager (PROMPT 2.5, mai 2026)

Implémentation effective de la stack d'observabilité documentée doc 17

- ADR-017. La spec était architecturale ; ce commit livre les fichiers de configuration, les modules
  instrumentation NestJS + FastAPI, et 6 dashboards Grafana opérationnels.

### 30.1 Livrables

| Catégorie    | Fichier                                                   | Rôle                                                                                                            |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Compose      | `infrastructure/monitoring/docker-compose.monitoring.yml` | 10 services (Prometheus, Grafana, Loki, Promtail, Jaeger, Alertmanager, node/cadvisor/postgres/redis exporters) |
| Prometheus   | `prometheus/prometheus.yml`                               | Scrape config 11 services NestJS/FastAPI + 4 exporters infra                                                    |
| Prometheus   | `prometheus/rules/nina-aes-slo.yml`                       | **14 règles** d'alerting (SLO, capacité, sécurité, backup)                                                      |
| Loki         | `loki/loki-config.yml`                                    | Single-binary TSDB v13, retention 30j                                                                           |
| Promtail     | `promtail/promtail-config.yml`                            | Tail Docker containers `nina-*`, parse JSON Pino, redact label `nina`                                           |
| Alertmanager | `alertmanager/alertmanager.yml`                           | Routing critical→email+Slack, warning→Slack, inhibitions anti-spam                                              |
| Alertmanager | `alertmanager/templates/nina.tmpl`                        | Templates FR pour email + Slack                                                                                 |
| Grafana      | `grafana/provisioning/datasources/all.yml`                | Prometheus + Loki + Jaeger + Alertmanager avec dérived fields trace_id                                          |
| Grafana      | `grafana/provisioning/dashboards/nina.yml`                | Provider qui charge dashboards/\*.json                                                                          |
| Grafana      | `grafana/dashboards/01-overview.json`                     | Vue d'ensemble plateforme (UP/DOWN, RPS, p95, 5xx, alertes, logs)                                               |
| Grafana      | `02-identity-service.json`                                | identity-service (CRUD NINA, latences, heap, logs)                                                              |
| Grafana      | `03-ai-service.json`                                      | ai-service (corrections, score moyen, inférence p95)                                                            |
| Grafana      | `04-sigac.json`                                           | SIGAC (top 10 agents flaggés, signalements BERT, severity)                                                      |
| Grafana      | `05-postgres.json`                                        | Postgres (connexions, cache hit, tx/s, top tables)                                                              |
| Grafana      | `06-business-kpis.json`                                   | KPIs métier (corrections/jour, RDV, USSD par langue, BCID-AES)                                                  |
| Package TS   | `packages/observability/`                                 | NestJS module + Pino-Loki + OTel SDK + BusinessMetrics                                                          |
| Module Py    | `services/ai-service/src/observability.py`                | structlog + prometheus + OTel pour FastAPI                                                                      |
| Deps Py      | `services/ai-service/requirements.txt`                    | +prometheus-client, OTel SDK + instrumentations, structlog                                                      |
| Makefile     | `monitoring-{up,down,logs,reload,status}`                 | 5 nouvelles cibles                                                                                              |

### 30.2 Révision ADR-017 — Jaeger au lieu de Tempo

**Décision PROMPT 2.5** : utiliser **Jaeger all-in-one 1.62** comme backend de traces, au lieu de
**Tempo 2.7** spécifié dans ADR-017.

Cette révision est CONSCIENTE et documentée :

| Critère                    | Tempo (ADR-017 V1)   | Jaeger (PROMPT 2.5 = V2)                         |
| -------------------------- | -------------------- | ------------------------------------------------ |
| Intégration Grafana native | ✅ datasource Tempo  | ⚠️ datasource Jaeger (présent mais moins fluide) |
| Storage backend en dev     | TSDB local           | In-memory (50k spans max)                        |
| Storage backend en prod    | TSDB local ou S3     | Cassandra ou Elasticsearch requis                |
| UI dédiée                  | ❌ via Grafana Tempo | ✅ UI Jaeger riche (search, dependencies)        |
| Simplicité dev mode        | All-in-one Tempo     | All-in-one Jaeger (mémoire, démarrage 5s)        |
| OTLP gRPC ingest           | ✅ port 4317         | ✅ port 4317                                     |
| Empreinte mémoire          | ~150 MB              | ~120 MB                                          |

**Argumentaire** : pour le dev/staging, Jaeger all-in-one est plus simple (zéro storage à
provisionner, UI dédiée pour explorer). En production, Tempo reste préférable (intégration Grafana
native + storage S3-compatible souverain via MinIO). Migration prévue V3 quand le volume de traces
dépasse 50k spans/h.

**Ajout à ADR-017 V2** (à formaliser dans un commit séparé si nécessaire) : Jaeger en dev/staging,
Tempo en prod. Les 2 sont OTLP-compatibles donc le code applicatif ne change pas.

### 30.3 Instrumentation TypeScript — `@nina-aes/observability`

Nouveau workspace package qui exporte 4 primitives :

- **`ObservabilityModule.forRoot({ serviceName, env })`** — module NestJS global. À importer dans
  chaque `AppModule`. Active `nestjs-prometheus` avec defaultMetrics + labels uniformes.
- **`startOtelTracing(serviceName)`** — DOIT être appelé en première ligne de `main.ts`, AVANT tout
  import applicatif, sinon les auto-instrumentations Prisma/ioredis/http ne s'attachent pas.
- **`createPinoLogger({ serviceName, transport })`** — factory Pino structuré JSON avec **redact PII
  25 chemins** (nina, biométrie, dateNaissance, password, token, cookie, authorization). Transport
  configurable : `pretty` (dev), `loki` (staging/prod), `both` (debug local avec Loki réel).
- **`BusinessMetrics`** — service injectable exposant 19 métriques métier prédéfinies
  (`identity_citizens_validated_total`, `ai_nina_errors_detected_total`, `sigac_*`, `audit_*`,
  `correction_requests_total`, `appointments_created_total`, `vulnerability_profiles_total`,
  `ussd_sessions_total`, `aes_verify_nina_total`, `vault_rotation_failed_total`,
  `audit_merkle_chain_break_total`).

### 30.4 Instrumentation Python — `services/ai-service/src/observability.py`

Équivalent pour FastAPI :

- **`init_tracing(service_name)`** — OTel SDK + OTLP gRPC exporter + auto-instrumentations
  Requests + SQLAlchemy
- **`instrument(app)`** — `/metrics` + FastAPI middleware + traces
- **`get_logger(service_name)`** — structlog JSON avec **redact PII** récursif sur 14 champs
  (équivalent fonctionnel du Pino TS)
- **`AI_METRICS` + `SIGAC_METRICS`** — dicts de Counter/Histogram/ Gauge alignés avec les métriques
  TS pour partage des dashboards

### 30.5 14 règles d'alerting Prometheus

Groupées en 4 familles :

| Groupe                | Règles                                                                                                          | Sévérités              |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **nina-aes-slo**      | ServiceDown, HighLatencyP95, HighErrorRate5xx, NinaValidationFailureSpike, AIInferenceLatencyP99                | 2 critical + 3 warning |
| **nina-aes-capacity** | NodeHeapPressure, EventLoopLag, PostgresConnectionsHigh, PostgresSlowQueries, RedisMemoryPressure, DiskSpaceLow | 5 warning + 1 info     |
| **nina-aes-security** | AuditChainBreak, LokiIngestionDown, VaultRotationFailed                                                         | 3 critical             |
| **nina-aes-backup**   | BackupJobFailed, MinIOReplicationLag                                                                            | 1 critical + 1 warning |

Chaque règle référence un `runbook` dans `docs/observability/RUNBOOK.md` (à rédiger ; doc 17 §4.8
fournit le template).

### 30.6 Alertmanager — routing par sévérité (3 destinations)

- **critical** → email `ops@nina-aes.uqar.ca` + `ciso.ctdec@gouv.ml` + Slack `#nina-alerts` (HTML
  email + Slack avec runbook lien)
- **security/backup** → email CISO + DPO direct (séparé du flux op)
- **warning** → Slack seul (`#nina-alerts`)
- **info** → null receiver (tracking dashboard only)

**Inhibitions** : `ServiceDown` inhibe `HighLatencyP95` et `HighErrorRate5xx` du même service (cause
racine). `LokiIngestionDown` inhibe les warnings dépendants. Templates en français dans
`templates/nina.tmpl`.

### 30.7 Souveraineté

Tout open-source, mode air-gap-ready :

- Stack LGTM Grafana Labs (AGPL/Apache 2.0)
- Jaeger CNCF (Apache 2.0)
- Alertmanager Prometheus (Apache 2.0)
- AUCUN ping vers Grafana Cloud / Datadog / NewRelic (rejetés ADR-017)
- `analytics.reporting_enabled: false` dans loki-config.yml (pas de télémétrie vers Grafana Labs)

### 30.8 Activation locale

```powershell
# Le réseau nina-network doit exister (créé par pnpm docker:up)
make docker-up
make monitoring-up

# Vérifier les targets Prometheus
make monitoring-status

# Ouvrir Grafana
Start-Process http://localhost:3001  # admin / nina-dev-only
```

### 30.9 Reste à faire

- Instrumenter les 11 services réels (chaque AppModule doit importer `ObservabilityModule.forRoot()`
  et `main.ts` appeler `startOtelTracing()`). À faire au fil du Bloc A.
- Rédiger `docs/observability/RUNBOOK.md` (14 entrées une par alerte)
- Rédiger `docs/observability/SLOs.md` (cibles chiffrées formelles)
- Provisionner le webhook Slack réel (placeholder dans alertmanager.yml)
- En prod : remplacer Jaeger all-in-one par Jaeger Collector + Cassandra OU revenir à Tempo (cf.
  ADR-017 V2 à formaliser)

### 30.10 Cross-références

- `docs/17-MONITORING-OBSERVABILITY.md` : reste la spec architecturale
- `docs/adr/ADR-017-observabilite-lgtm-stack.md` : à amender pour Jaeger dev/staging vs Tempo prod
- `docs/00-README-INDEX.md` : tableau état monitoring passe de spec à ✅
- `Makefile` : 5 nouvelles cibles `monitoring-*`

`pnpm run verify:repo` ✅ vert.
