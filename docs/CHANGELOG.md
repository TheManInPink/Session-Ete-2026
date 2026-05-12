# CHANGELOG documentation — NINA-AES Platform

> Journal des écarts entre la documentation initiale (rédigée à l'ouverture du
> projet) et l'état réel du code après les sessions PROMPT 1.2 → 1.5 et les
> incidents d'exécution résolus en chemin.
>
> **Dernière mise à jour** : 1ᵉʳ mai 2026

Quand un document `.md` numéroté contredit le code, **le code fait foi** et ce
CHANGELOG renvoie à la commande / au fichier qui matérialise la décision.

---

## 1. Stack technique — versions effectives (avril–mai 2026)

| Composant | Doc initiale | **Réel courant** |
|---|---|---|
| Prisma + `@prisma/client` | 7.7.0 (PROMPT 1.3) | **7.8.0** |
| Moteur Prisma | « library » binaire embarqué | **« client » + driver adapter** (`@prisma/adapter-pg` + `pg`) |
| Image PostgreSQL | `postgres:18.3-alpine3.22` | **`postgis/postgis:18-3.6`** (intègre `postgis` + ext. requises) |
| Locale Postgres | `--locale=fr_FR.UTF-8` | **`--locale-provider=icu --icu-locale=fr-FR --encoding=UTF8`** |
| Volume Postgres | `nina-postgres-data:/var/lib/postgresql/data` | **`nina-postgres-data:/var/lib/postgresql`** (parent — exigence Postgres 18) |
| Compose & .env | implicite | **`docker compose --env-file .env -f …`** (script `docker:up` mis à jour) |
| Vitest (`packages/database`) | `^2.2.0` | **`^4.1.5`** (la 2.2 n'existait pas) |
| TypeScript root tsconfig | `moduleResolution: node`, `baseUrl` | **`NodeNext`**, `baseUrl` retiré, placeholder `scripts/typecheck.ts` |

## 2. Packages monorepo — état effectif

| Package | Statut | Notes |
|---|---|---|
| `@nina-aes/shared-types` | ✅ aligné PROMPT 1.2 | 11 enums, 16 interfaces (Location 10 champs, Citizen + fingerprintHash + vulnerabilityCategory, AuditLog + entityType/entityId/oldValue/newValue/ipAddress/merkleHash, etc.), DTOs Zod synchronisés |
| `@nina-aes/database` | ✅ aligné PROMPT 1.3 | 16 modèles Prisma, 10 enums, GIN trigram, soft-delete (callback `defineExtension`), `previewFeatures = ["driverAdapters", "postgresqlExtensions", "relationJoins"]` |
| `@nina-aes/config` | ✅ aligné PROMPT 1.4 | Schéma Zod exhaustif, singleton paresseux via Proxy, `dotenv-expand` pour `${VAR}`, 9 tests Jest |
| `@nina-aes/utils` | ✅ aligné PROMPT 1.4 | `nina.ts` (normalize/format/mask/validateNinaChecksum), `merkle.ts` (+ `generateMerkleHash` alias), `crypto.ts` (RS256/Ed25519/hashBiometric), `date.ts` (`calculateAge`), `sanitize.ts` (`sanitizeForLog`), 44 tests Jest |
| `@nina-aes/logger` | ⚠️ **stub** | Stub temporaire console-backed (4 services référençaient un package inexistant qui bloquait `pnpm install`). Implémentation Pino + transport Loki à livrer au document 17 |
| `@nina-aes/ui` | inchangé | `tsconfig.json` durci avec `rootDir: "./src"` |

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

> Les fichiers `99-DIAGRAMMES-MERMAID.md` et `99-DIAGRAMMES-PLANTUML.md` sont
> conservés comme **archives narratives** (texte expliquant chaque diagramme),
> mais les sources canoniques sont désormais les `.puml`.

## 4. Incidents d'exécution résolus (utiles pour la documentation Bloc A)

| Symptôme | Fix appliqué |
|---|---|
| `invalid interpolation format` (×11) dans `docker-compose.dev.yml` | Espaces parasites supprimés, typo `ELASTIC_PASSWORDELASTIC_PASSWORD` corrigée |
| `Conflict. The container name "/nina-postgres" is already in use` | `docker rm -f nina-postgres` + `docker volume rm nina-postgres-data` |
| Postgres en restart loop (Postgres 18 layout) | Mount `/var/lib/postgresql` (parent), pas `/data` |
| `P1000: Authentication failed for nina_admin` | Ajout `--env-file .env` dans le script `docker:up` |
| `initdb: invalid locale name "fr_FR.UTF-8"` | Bascule sur ICU : `--locale-provider=icu --icu-locale=fr-FR` |
| `Using engine type 'client' requires either 'adapter' or 'accelerateUrl'` | Installation `@prisma/adapter-pg` + `pg` ; `previewFeatures = ["driverAdapters", …]` ; `new PrismaPg({ connectionString })` dans `src/index.ts` |
| `prisma not recognized` (CMD) | Toujours préfixer par `pnpm --filter @nina-aes/database exec prisma …` ou utiliser les scripts `db:*` |
| `npm i prisma@latest` casse (workspace pnpm) | Utiliser **uniquement** `pnpm` dans ce monorepo |
| `TS18003: No inputs were found` (root tsconfig) | Placeholder `scripts/typecheck.ts` + utiliser `pnpm check-types` (turbo) au lieu de `tsc` racine |

## 5. Règles opérationnelles à retenir

- **Jamais** `npm` dans ce monorepo — **toujours** `pnpm`.
- Pour les binaires de workspace : `pnpm --filter <pkg> exec <bin>` ou `pnpm --filter <pkg> <script>`.
- Pour la base de données :
  - PostgreSQL doit être démarré avec `pnpm docker:up` (qui inclut `--env-file .env`).
  - Migrations : `pnpm --filter @nina-aes/database exec prisma migrate dev --name <nom>`.
  - Seed : `pnpm --filter @nina-aes/database db:seed`.
  - Reset : `pnpm --filter @nina-aes/database exec prisma migrate reset --force`.
- Pour le typage : `pnpm check-types` à la racine (Turborepo dispatch).

## 6. État de la base après seed (référence)

| Table | Lignes attendues |
|---|---:|
| `locations` | **371** (1 pays + 10 régions + ~52 cercles/communes Bamako + ~308 communes échantillon) |
| `institutions` | **5** (CTDEC, DNEC, MAT, Mairie Comm. IV, Gouv. Kayes) |
| `users` | **6** (1 par rôle `UserRole`) |

## 7. Documents canoniques par sujet

| Sujet | Document de référence |
|---|---|
| Vue d'ensemble | `00-README-INDEX.md` |
| Cahier des charges | `01-CAHIER-DES-CHARGES.md` |
| Architecture globale | `02-ARCHITECTURE-GLOBALE.md` + `diagrams/07-deployment.puml` + `diagrams/08-components.puml` |
| Setup Windows | `03-SETUP-ENVIRONNEMENT-DEV.md` |
| Monorepo (Turborepo + pnpm) | `04-MONOREPO-STRUCTURE.md` |
| Infra Docker locale | `05-INFRASTRUCTURE-DOCKER-COMPOSE.md` |
| Prisma + schéma DB | `06-DATABASE-SCHEMA-PRISMA.md` + `packages/database/prisma/schema.prisma` |
| Microservices NestJS | `07` → `10` |
| Service IA Python | `11-AI-SERVICE-FASTAPI.md` |
| Frontend → API | `12-FRONTEND-INTEGRATION-API.md` |
| ADR (Architecture Decision Records) | `adr/ADR-001` → `ADR-015` |

## 8. Gouvernance assistants IA et maintenance (mai 2026)

Objectif: rendre les conventions persistantes et homogènes entre Cursor, Claude et Copilot.

- Ajout de `AGENTS.md` (règles transversales de collaboration et synchronisation docs/code).
- Ajout de `CLAUDE.md` (bootstrap session + commandes de validation).
- Renforcement de `.github/copilot-instructions.md` pour aligner Copilot sur les conventions réelles du projet.
- Ajout d'une règle Cursor persistante: `.cursor/rules/ai-governance.mdc`.
- Remplacement du `README.md` template par une version projet orientée exploitation.

Validation automatique ajoutée:

- Schémas JSON sous `schemas/` pour `data/mali/regions.json` et `data/mali/cercles.json`.
- Script `scripts/validate-json-schemas.mjs` (validation via Ajv).
- Script `scripts/docs-sync-check.mjs` (contrôle de cross-références critiques docs/README/changelog).
- Scripts `package.json`:
  - `validate:schemas`
  - `docs:sync:check`
  - `verify:repo`

Impact maintenance:

- Réduction du drift documentaire entre sessions.
- Contrôles rapides intégrables en local, hook et CI.
- Préparation à une gouvernance documentaire plus stricte sur les 250+ éléments du monorepo.

## 9. Phase 2 — Infrastructure & DevOps (mai 2026)

Conformément à **PROMPT 2.1**, l'infrastructure de développement a été
consolidée :

### 9.1 Dockerfiles génériques réutilisables

- **`infrastructure/docker/Dockerfile.nestjs`** — Multi-stage Node 24-alpine
  + pnpm 10 + Turborepo pruning (`turbo prune`). Réutilisable par les 9+
  services NestJS via `--build-arg SERVICE=<nom>`. Utilisateur non-root UID
  1001, HEALTHCHECK `/health`, `tini` pour SIGTERM, labels OCI.
- **`infrastructure/docker/Dockerfile.fastapi`** — Multi-stage Python 3.14
  slim + `uv` 0.5 (gestionnaire de paquets Rust, 10-100× plus rapide que
  pip). Inclut Tesseract OCR + libgomp1 pour XGBoost. Réutilisable par
  `ai-service` et `anticorruption-service`.

Les Dockerfiles par-service (`services/<X>/Dockerfile`) restent disponibles
en mode legacy mais ont été modernisés (Node 24, utilisateur non-root,
HEALTHCHECK). Le build CI/CD doit privilégier le générique :

```powershell
make build-service SERVICE=identity-service
```

### 9.2 Pas de `seed-locations.sql` séparé (décision documentée)

Le PROMPT 2.1 suggérait un script SQL exhaustif des 19 régions / 159
cercles / 819 communes / 12 712 villages. **Décision : non créé** car le
référentiel canonique est `data/mali/*.json` + Prisma seed. Détails dans
`docs/data/mali-divisions.md` §3bis.

### 9.3 Makefile enrichi (44 cibles)

Cibles ajoutées au Makefile racine :

- `verify` / `validate-data` / `validate-schemas` / `docs-sync` — chaîne
  de vérification du repo
- `build-service SERVICE=<X>` — paramétrable, utilise le Dockerfile
  générique
- `vault-init` / `vault-unseal` / `vault-status` — gestion des secrets
- `certs-generate` / `certs-clean` — certificats mTLS dev pour les 3
  pays AES (CA RSA 4096 + 3 certs clients RSA 2048 / 90 jours)
- `db-validate` — `prisma validate` rapide
- `dev-sigac` / `dev-governance` — services manquants
- `clean-deep` — purge totale (.venv inclus)

Validation : `make help` liste les 44 cibles documentées.

### 9.4 Stack Docker Compose : état effectif

`infrastructure/docker/docker-compose.dev.yml` reste la source de vérité
pour les 9+ services d'infrastructure (PostgreSQL+PostGIS, Redis, RabbitMQ,
MinIO, Elasticsearch, Kibana, Keycloak, Vault, MailDev). Corrections déjà
appliquées (cf. §4 « Incidents résolus »).
