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

## 10. Frontend Citoyen — Session 2 : PC-03 à PC-06 + auth Keycloak BFF (mai 2026)

Session 2 du chantier frontend `apps/citizen` (port 4001). Construit
au-dessus de la fondation Session 1 (packages `@nina-aes/ui`,
`@nina-aes/api-client`, `@nina-aes/i18n` ; PC-01 et PC-02 livrés).

### 10.1 Auth Keycloak — pattern BFF (Backend-for-Frontend)

Routes API internes `apps/citizen/app/api/auth/*` :

- **`/api/auth/login`** — initie OIDC Authorization Code + PKCE
  (`code_verifier` SHA-256, `state`, `nonce` ; cookies signés
  `oidc_state`/`oidc_nonce`/`oidc_code_verifier` httpOnly).
- **`/api/auth/callback`** — échange du code contre `access_token` +
  `id_token` + `refresh_token`. Vérification ID token via JWKS
  (`createRemoteJWKSet`, lib `jose@6.2.3`) : `iss`, `aud`, `exp`,
  `nonce`. Tokens posés en cookies `httpOnly + Secure + SameSite=Lax`,
  jamais exposés au JS navigateur.
- **`/api/auth/refresh`** — refresh silencieux (POST). En cas
  d'échec, suppression atomique des cookies pour forcer un re-login
  propre.
- **`/api/auth/logout`** — révoque le refresh token côté Keycloak
  (backchannel) puis redirige sur l'endpoint `end_session` (frontchannel).

**Mode mock** : `NINA_AUTH_MODE=mock` (défaut dev) renvoie une session
déterministe « Fatoumata Diallo » sans dépendance Keycloak — débloque
les écrans tant que `keycloak-realm-aes.json` n'est pas chargé.

`apps/citizen/lib/auth/session.ts` expose `getSession()`,
`requireSession()`, `isOwnerOf(nina)`, `isAgent()` — utilisables en
RSC (Server Components) comme en Server Actions.

### 10.2 `apps/citizen/middleware.ts` — i18n + auth guard

Middleware combiné next-intl + auth. Routes publiques (regex
`PUBLIC_PATTERNS`) : racine `/`, `/[locale]`, `/[locale]/login`,
`/[locale]/signalement/*`. Tout autre `/[locale]/...` exige une
session ; sinon redirection `/[locale]/login?return_to=…`.

### 10.3 Extensions `@nina-aes/api-client`

Trois nouveaux sous-clients (le réexport racine devient
`{ identity, correction, appointment, sigac }`) :

- **`CorrectionClient`** — soumission + liste + détail + annulation
  d'une demande de correction (9 champs corrigeables : `firstName`,
  `lastName`, `birthDate`, `birthPlace`, `residence_cercle`,
  `residence_commune`, `fatherName`, `motherName`, `profession`).
  Idempotency-key `corr-{nina}-{field}-{ts}`.
- **`AppointmentClient`** — créneaux disponibles, création RDV, liste
  de mes RDV, annulation. Supporte priorité P1/P2/P3 (file
  prioritaire pour citoyens vulnérables).
- **`SigacClient`** — signalement anonyme. **`skipAuth: true` sur
  tous les appels** : aucun header `Authorization`, aucun cookie
  envoyé. Soumission + consultation par `trackingToken` opaque
  (format `vault:v3:…`).

Tous les DTO et réponses sont validés par des schémas Zod
co-localisés (`*.schema.ts`), réexportés côté package racine.

### 10.4 Écrans citoyens livrés (PC-03 → PC-06)

- **PC-03 — Wizard correction** (`/[locale]/nina/[nina]/correction`).
  4 étapes (champ → valeur → justificatif placeholder → confirmation),
  stepper visuel, contrôle de rôle `isOwner || isAgent`.
- **PC-04 — Prise de RDV** (`/[locale]/appointments/new`).
  Sélection centre (CTDEC Bamako, RAVEC Kayes/Sikasso/Mopti — mocks
  en attendant l'API), créneau, motif libre. Badge « file prioritaire »
  affiché si la session est marquée vulnérable.
- **PC-05 — Dashboard citoyen** (`/[locale]/dashboard`).
  Salutation localisée, 3 actions (fiche / correction / RDV), liste
  des corrections en cours avec score IA, liste des RDV à venir,
  composant `StatusBadge` réutilisable.
- **PC-06 — Signalement anonyme** (`/[locale]/signalement`). Route
  **publique** (pas de cookie d'auth). Formulaire 6 catégories
  (BRIBERY / FORGERY / FAVORITISM / ABUSE_OF_POWER / PROCUREMENT /
  OTHER), description ≥ 50 caractères, localisation optionnelle,
  consentement. Aucune écriture localStorage/sessionStorage, aucun
  fingerprint navigateur. Reçu post-soumission avec token copiable.

### 10.5 i18n — `packages/i18n/messages/fr.json` enrichi

Ajout des namespaces `login`, `correction`, `appointments`,
`dashboard`, `signalement`. La traduction `bm.json` (bambara) reste
le périmètre Session 1 ; next-intl applique le fallback FR
automatiquement pour les clés manquantes (décision documentée :
ne pas fabriquer de traductions bambara sans relecture native).

### 10.6 Corrections de configuration

- **`next.config.ts`** — `experimental.ppr` fusionné dans
  `cacheComponents: true` (changement Next 16).
- **`tsconfig.json`** — suppression de `baseUrl` (déprécié TS 6.0,
  remplacé par `paths` relatifs `./*`).
- **`packages/api-client`** — override local du `tsconfig.json` :
  `module: ESNext` + `moduleResolution: Bundler`. Le package est
  consommé en source via `transpilePackages` côté Next, jamais publié
  comme ESM standalone — la résolution « bundler » évite d'avoir à
  écrire des extensions `.js` explicites dans les imports relatifs
  (que Turbopack ne sait pas remapper vers `.ts`).

### 10.7 Validation

- `pnpm --filter @nina-aes/api-client check-types` : 0 erreur.
- `pnpm --filter @nina-aes/citizen check-types` : 0 erreur
  (`next typegen` + `tsc --noEmit`).
- `pnpm run verify:repo` : ✅ validate-data + validate-schemas + docs-sync.

### 10.8 Reste à faire (Session 3+)

- Câblage `keycloak-realm-aes.json` réel + suppression du mode mock
  pour la pré-prod.
- ~~Composant `LanguageSwitcher` (8 langues, accessible clavier)~~ →
  livré commit `b7c1f5c` (dropdown autonyme + drapeau dans le header
  d'accueil, fallback FR par-clé via `deepMerge`).
- Relecture native des 6 skeletons i18n (SNK/FF/TMQ/HAU/MOS/DJE) ;
  bambara `bm.json` déjà fourni Session 1. À faire valider par
  CTDEC/DNEC avant production.
- Upload de justificatifs PC-03 — bloqué tant que `document-service`
  (port 3004) n'est pas livré (cf. doc 10).
- **Migration PC-04 slots → appointment-service** : quand
  `appointment-service` (port 3008, doc 09) sera livré, remplacer
  `generateMockSlots()` dans `apps/citizen/app/[locale]/appointments/
  new/_components/appointment-form.tsx` par un appel server-side
  `api.appointment.getAvailableSlots({ fromDate, toDate, centerId,
  isPriority })` exécuté dans le Server Component parent. Passer les
  slots en prop. La `<Suspense>` côté page reste pertinente comme
  frontière de streaming pour le fetch. Idéalement, déléguer
  uniquement la sélection à un sous-composant client minimal et
  retirer le `'use client'` du form principal.
- **Migration PC-04 centres → identity ou location service** :
  `MOCK_CENTERS` dans le même fichier doit être remplacé par un
  fetch `/api/v1/centers` (cercles/communes filtrables selon la
  région du citoyen via `session.user.residence_cercle`).
- Rename `middleware.ts → proxy.ts` (changement Next 16, warning
  actuel non-bloquant mais le convention sera obligatoire en Next 17).
