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
- ~~Rename `middleware.ts → proxy.ts`~~ → fait. API identique
  (`NextRequest`/`NextResponse`/`config.matcher` inchangés), seul le
  nom de fichier et la fonction par défaut sont renommés (`middleware`
  → `proxy`). L'import `next-intl/middleware` reste valide (next-intl
  garde son propre nom).

## 11. Frontend Admin — Session 3 : foundation + AD-02 corrections (mai 2026)

Console agents CTDEC `apps/admin` (port 4002) — scaffolding initial +
écran AD-02 « Gestion des corrections IA » fonctionnel de bout en bout
en mode mock. AD-01 (Dashboard complet) et AD-03 (SIGAC) prévus
Session 4. Périmètre choisi avec le mainteneur : « Foundation +
AD-02 prioritaire » (le DataGrid est l'outil le plus utile au
quotidien CTDEC).

### 11.1 Foundation `apps/admin`

Refonte complète du scaffold Turborepo par défaut sur le pattern
citizen Session 2 :
  - **Auth BFF** (4 route handlers `/api/auth/{login,callback,refresh,
    logout}`) avec client Keycloak `nina-admin`. Mode `NINA_AUTH_MODE=
    mock` par défaut : session déterministe « Modibo Konaté »,
    matricule CTDEC-2024-0156, rôles `[AGENT, SUPERVISOR]`, centre
    `ctdec-bamako`.
  - **`lib/auth/session.ts`** : `getSession()`, `requireSession()`,
    `requireRole(roles: AdminRole[])`, `hasRole(roles)` — nouveau
    contrôle d'accès par rôle (AGENT / SUPERVISOR / AUDITOR / ADMIN).
  - **Layouts** alignés Next 16 + cacheComponents :
    `app/layout.tsx` STATIQUE + `<HtmlLangSetter />` client,
    `app/[locale]/layout.tsx` IntlBoundary dans `<Suspense>`,
    `app/[locale]/(authenticated)/layout.tsx` applique
    `requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN'])` et
    rend `<AdminSidebar>` (route group invisible dans l'URL).
  - **`components/admin-sidebar.tsx`** : sidebar fixe 240px,
    fond `hsl 220° 30 % 12 %`, 5 items nav (Dashboard / Corrections /
    RDV / SIGAC / Paramètres), footer profil agent + logout.
  - **`proxy.ts`** : i18n routing + auth guard ; routes publiques
    `/[locale]` et `/[locale]/login`.
  - **i18n namespace `admin.*`** (FR complet) — sidebar, dashboard,
    login, corrections (filters, columns, status, field, actions,
    drawer, timeline, pagination, toast). Les 6 skeletons SNK/FF/
    TMQ/HAU/MOS/DJE héritent automatiquement via le deepMerge déjà
    en place (Session 2 commit b7c1f5c).

### 11.2 Nouvelles primitives `@nina-aes/ui`

Trois wrappers Radix pour alimenter AD-02 (et les futurs écrans) :

  - **Sheet** (`./components/sheet`) — Drawer latéral avec variants
    `side` (top/bottom/left/right). Compose Sheet, SheetTrigger,
    SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle,
    SheetDescription. Focus trap, animation slide-in/out, overlay
    backdrop-blur, `aria-modal` natif.
  - **Checkbox** (`./components/checkbox`) — Radix Checkbox stylé
    AES, supporte `indeterminate` (utile pour la sélection partielle
    de colonne du DataGrid).
  - **DropdownMenu** (`./components/dropdown-menu`) — Surface
    complète Radix (Trigger, Content, Item, CheckboxItem, RadioItem,
    Label, Separator, Sub, Group, Shortcut). Préparé pour menus
    d'actions par ligne et filtres compacts.

  Dépendances : `@radix-ui/react-dialog ^1.1.0`, `@radix-ui/
  react-checkbox ^1.1.0`, `@radix-ui/react-dropdown-menu ^2.1.0`.

### 11.3 AD-02 — Gestion des corrections IA

  **`app/[locale]/(authenticated)/corrections/page.tsx`** (server) :
    Charge `MOCK_CORRECTIONS` (50 fixtures déterministes) + délègue
    à `<CorrectionsClient>` enveloppé dans `<Suspense>` avec
    skeleton fallback.

  **`_components/corrections-client.tsx`** (client) — Le DataGrid
    complet basé sur **TanStack Table 8.20** :
    - 11 colonnes : sélection multi, NINA (mono), citoyen, champ,
      avant, après, score IA (coloré HIGH/MEDIUM/LOW), statut
      (StatusBadge), région, soumis le, actions (DropdownMenu).
    - **Tri** sur 9 colonnes (clic header → ascending → descending →
      reset) avec icônes ArrowUp/ArrowDown.
    - **Filtres** :
      • Recherche full-text (debounced via React state) sur
        NINA + nom citoyen ;
      • Multi-select statut (UNDER_REVIEW, APPROVED, REJECTED,
        AWAITING_DOCUMENT) ;
      • Multi-select région (Bamako, Sikasso, Kayes, Mopti) ;
      • Bouton « Réinitialiser » si filtres actifs.
    - **Sélection multiple** : checkbox header (avec état
      `indeterminate` si sélection partielle de la page courante),
      checkbox par ligne. Bouton « Approuver (N) » apparaît à droite
      de la toolbar si N ≥ 1.
    - **Pagination** : pageSize 10, indicateur page X / Y,
      ChevronLeft/Right pour naviguer.
    - **Click ligne** ouvre le drawer ; click sur checkbox ou
      DropdownMenu d'actions n'ouvre PAS le drawer
      (`stopPropagation`).

  **`_components/correction-drawer.tsx`** : Drawer right (Sheet
    side=right, max-w-xl) avec :
    - Header : titre `Correction #{id}` + StatusBadge.
    - Citoyen (nom + NINA mono).
    - Modification du champ : carte « avant » barrée + flèche +
      carte « après » en `bg-primary-50/40`. Motif de la demande
      en italique.
    - **`<AiScorePanel />`** : gauge SVG inline (cercle radius 28,
      stroke 6, dasharray dynamique) coloré HIGH/MEDIUM/LOW, 3
      sous-scores (fuzzyMatch, consistency, agentHistory) en barres
      horizontales.
    - Justificatif : preview placeholder « PDF · 1.4 Mo » (le vrai
      preview viendra avec document-service Session 4+).
    - **`<CorrectionTimeline />`** : timeline verticale avec ligne
      gauche + pastilles colorées (Send, Sparkles, UserCheck,
      FileQuestion, FileCheck, Check, X selon le `kind` de
      l'événement).
    - Footer sticky avec actions : « Rejeter » (variant destructive)
      → toggle un sous-formulaire avec textarea « motif de rejet
      (visible par le citoyen) » + submit ; « Approuver » →
      mutation immédiate. Le drawer se ferme et un toast vert
      confirme l'action.

  **Mutation mock approve/reject** : `decide(id, decision, reason?)`
    dans `corrections-client.tsx` mute le state local avec
    `useTransition`. La timeline est appendée avec un événement
    `APPROVED` ou `REJECTED` daté ISO. Un toast 4 s apparaît en
    bas-droite (`role="status"` `aria-live="polite"`).

### 11.4 Mock fixtures (`apps/admin/lib/mock-corrections.ts`)

  Générateur déterministe Mulberry32 produisant 50 corrections :
    - 20 prénoms × 20 noms maliens (combinaisons réalistes).
    - 9 champs `field` représentés équitablement (firstName,
      lastName, birthDate, birthPlace, residence_cercle,
      residence_commune, fatherName, motherName, profession).
    - Échantillons d'erreurs typiques par champ (Sikaso → Sikasso,
      Toure → Touré, Bla → Blá, 1995-13-02 → 1995-12-02).
    - 4 statuts pondérés : UNDER_REVIEW (60 %), APPROVED (20 %),
      REJECTED (15 %), AWAITING_DOCUMENT (5 %).
    - 4 régions : Bamako, Sikasso, Kayes, Mopti.
    - Score IA 30-98 + verdict HIGH/MEDIUM/LOW dérivé.
    - 3 sous-scores (fuzzyMatch, consistency, agentHistory).
    - Timeline réaliste SUBMITTED → AI_SCORED → AGENT_REVIEW →
      APPROVED/REJECTED ou → DOCUMENT_REQUESTED.

  À supprimer Session 4+ quand correction-service exposera
  `GET /api/v1/admin/corrections?filters` côté agent.

### 11.5 Validation

  - `pnpm --filter @nina-aes/admin check-types` : ✅ 0 erreur.
  - `pnpm --filter @nina-aes/citizen check-types` : ✅ 0 erreur
    (citizen n'a pas régressé).
  - `pnpm run verify:repo` : ✅ validate-data + validate-schemas +
    docs-sync.

### 11.6 Reste à faire (Session 4+)

  - **AD-01 Dashboard** complet : 4 KPI cards avec sparkline SVG
    inline + AreaChart Recharts corrections/jour + MaliHeatmap
    activité régionale + feed temps réel alertes (SSE mock).
  - **AD-03 SIGAC** : MaliHeatmap alertes par région + top 10
    agents intégrité (IntegrityScoreGauge ×10) + feed alertes
    temps réel + drill-down par région.
  - **MaliHeatmap** réutilisable dans `@nina-aes/ui` (SVG inline
    + GeoJSON `data/mali/regions.geojson`, 55 features déjà
    validées par `validate:data`).
  - **Extraction `@nina-aes/auth`** : factoriser `lib/auth/session.ts`
    + routes API auth communes à citizen et admin (et bientôt
    governance). Aujourd'hui : 2 copies. Threshold de 3 copies
    déclenche l'extraction.
  - **Câblage `correction-service`** : remplacer `MOCK_CORRECTIONS`
    par fetch server-side + mutations TanStack Query avec
    optimistic update + invalidation cache.
  - **PDF preview justificatif** : bloqué tant que `document-service`
    (port 3004) n'expose pas les URLs signées.
  - **Drawer mobile** : actuellement w-full sur xs, OK mais le
    DataGrid est inutilisable sur xs (10 colonnes). Ajouter une vue
    « cards » alternative ou figer les 3 premières colonnes en
    overflow-x.
  - **Tests E2E Playwright** : parcours agent (login mock → DataGrid
    → filtre → approbation → toast → ligne mise à jour).

## 12. Frontend Admin — Session 4 : AD-01 Dashboard + AD-03 SIGAC (mai 2026)

Finalisation du périmètre `apps/admin` initial — les deux écrans
restants de docs/design-system/screens.md §AD-01/AD-03 sont livrés en
mode mock, l'app est complète bout-en-bout (Dashboard → Corrections →
SIGAC + RDV/Paramètres en placeholder).

### 12.1 Nouvelles primitives chart `@nina-aes/ui`

4 composants SVG inline, **zéro dépendance lib chart** (pas de
recharts, victory, etc.). Le choix : la complexité reste linéaire,
le bundle reste mince, et le rendu SSR est trivial.

  **MaliHeatmap** (`./components/charts/mali-heatmap`)
    Bubble map des 20 régions Mali (centroïdes `data/mali/mali.geo
    json` level=1). Props `data: MaliHeatmapDatum[]` (régionCode +
    valeur), `tone: 'sequential' | 'severity'` (palette HSL
    interpolée vert→jaune→rouge pour severity, bleu progressif pour
    sequential). `onRegionClick` optionnel pour drill-down,
    accessibilité clavier complète (`tabIndex` + Enter/Space).
    Projection lon/lat → viewBox 100×75 avec bbox Mali (-12 à +3 lon,
    10.5 à 23 lat).

    Note : le GeoJSON disponible ne contient que des Point
    centroïdes, pas de polygones. Le bubble map est une variante
    valide de heatmap (densité par lieu) et garde le coût zéro lib.
    Si un GeoJSON polygonal est ajouté plus tard, ré-évaluer.

  **Sparkline** (`./components/charts/sparkline`)
    Courbe minimal viewBox `0 0 100 30`, area fill optionnel,
    highlight du dernier point. 5 tones AES (primary / success /
    warning / danger / muted). Utilisée dans les KPI cards AD-01.

  **AreaChart** (`./components/charts/area-chart`)
    Area chart avec axes Y left (labels) + X bottom (labels tous
    les N points), gridlines pointillées, points interactifs avec
    `<title>` natif au hover. ViewBox 400×200, padding intelligent.
    Utilisé pour « Corrections / jour 30j ».

  **IntegrityGauge** (`./components/charts/integrity-gauge`)
    Composite : icône check/x (≥70 / <70) + nom (truncate w-32) +
    barre horizontale colorée + score. Couleur sémantique :
    ≥80 success, 50-79 warning, <50 destructive. Utilisé pour le
    Top 10 agents AD-03.

### 12.2 AD-01 — Dashboard agent CTDEC

  **`apps/admin/app/[locale]/(authenticated)/dashboard/page.tsx`**
    (server) — Remplace le placeholder Session 3. Layout :
    - 4 KPI cards en grid 1/2/4 col (mobile/sm/lg) : NINA actifs
      (12 489, +2.4 % vs sem.), Corrections en attente (84, -12.5 %),
      Alertes SIGAC (17, +6.3 %), RDV aujourd'hui (326, +1.8 %).
      Chaque card : titre uppercase, valeur tabular-nums, delta %
      avec ArrowUpRight/DownRight + tone success/danger selon
      « positiveIsGood » (correctionsPending et alertsOpen sont des
      KPIs où la baisse est bonne), sparkline 30j.
    - Section 2 col (lg) : AreaChart corrections/jour 30j (tone
      warning) sur 2/3, AlertsFeed live sur 1/3.
    - Section pleine largeur : MaliHeatmap activité régionale (tone
      sequential, 10 régions échantillonnées).

  **`_components/kpi-card.tsx`** — Composite KpiCard avec
    drill-down optionnel (Link Next vers `./corrections`,
    `./appointments`, `./sigac`). `tabular-nums` pour aligner
    visuellement les chiffres entre cards.

  **`_components/alerts-feed.tsx`** — Client component avec mock SSE.
    `setInterval` jitter 12-20 s ajoute une nouvelle alerte en tête
    de liste (capée à `maxItems=12`). Badge LIVE pulse 800 ms à
    chaque nouveau message (`animate-pulse`). Liste scrollable avec
    `divide-y`, severity badge coloré, relative time via next-intl
    `useFormatter().relativeTime`.

### 12.3 AD-03 — Dashboard SIGAC

  **`apps/admin/app/[locale]/(authenticated)/sigac/page.tsx`** (server) :
    - Contrôle d'accès renforcé : `requireRole(['SUPERVISOR',
      'AUDITOR', 'ADMIN'])` — exclut les simples AGENT (le SIGAC est
      réservé aux superviseurs/auditeurs).
    - Layout 2 sections principales :
      • Grid 2 col : MaliHeatmap alertes par région (tone severity)
        + Top 10 agents (IntegrityGauge ×10 avec bouton
        « Investiguer » si score < 70).
      • SigacClient (feed filtrable temps réel).

  **`_components/sigac-client.tsx`** — Client component avec :
    - Multi-filtres : recherche full-text (description + lieu),
      multi-select severity (CRITICAL/HIGH/MEDIUM/LOW), période
      (today / week / month).
    - Mock SSE identique à AlertsFeed AD-01 (12-20 s jitter, badge
      LIVE pulse).
    - Liste scrollable avec bouton « Investiguer » par alerte
      (`/[locale]/sigac/[id]`, page à implémenter Session 5+).
    - Counter `filtered.length / alerts.length` dans le header.

### 12.4 Mock data (`apps/admin/lib/mock-dashboard.ts`)

  Toutes les données Session 4 dans un fichier unique, déterministes
  (PRNG Mulberry32 seed fixe) :
    - `KPI_SNAPSHOTS` : 4 KPIs avec history 30j générée (tendance
      ascendante + bruit ±15 %).
    - `CORRECTIONS_PER_DAY` : 30 points (date au format dd/mm,
      volume 65-90 + spikes occasionnels).
    - `ACTIVITY_BY_REGION` : 10 régions principales avec volumes
      réalistes (Bamako 487 → Kidal 12).
    - `ALERTS_BY_REGION` : 6 régions avec alertes actives.
    - `TOP_AGENTS` : 10 agents (Modibo 97 → Boubacar 31), 4
      en-dessous de 70 (à investiguer).
    - `INITIAL_ALERTS` : 8 alertes échantillons (CRITICAL forgery,
      HIGH bribery, MEDIUM favoritism, etc.).
    - `generateNewAlert(prevCount)` : générateur déterministe pour
      le mock SSE.

  À supprimer Session 5+ quand audit-service (port 3007),
  correction-service (port 3005) et anticorruption-service
  (port 3009) exposeront les agrégations réelles.

### 12.5 i18n

  packages/i18n/messages/fr.json — Extensions :
    - `admin.dashboard.kpis.*` : titres + delta strings
    - `admin.dashboard.{correctionsChartTitle, activityMapTitle,
      alertsFeedTitle, alertsFeedLive, alertsFeedEmpty}`
    - `admin.sigac.*` (nouveau namespace) : pageTitle/Subtitle,
      filters (severity, period, all/today/week/month, reset),
      severity {LOW/MEDIUM/HIGH/CRITICAL}, category (6 catégories),
      alertsMap, topAgents (investigate), feed (live, investigate,
      empty).

### 12.6 Validation

  - `pnpm --filter @nina-aes/admin check-types` : ✅
  - `pnpm run verify:repo` : ✅ data + schemas + docs sync.

### 12.7 Reste à faire (Session 5+)

  - **Câblage backends réels** : audit-service (KPIs + activité
    régionale agrégée), correction-service (DataGrid + decide
    mutation), anticorruption-service (SSE alerts stream + filtres
    côté API). Tous nécessitent les services NestJS/FastAPI prêts.
  - **GOV-01 à GOV-03** : 3ème app `apps/governance` (port 4003)
    — messagerie signée Ed25519, Kanban directives, timeline
    officielle. Déclencherait l'extraction `@nina-aes/auth` (3ème
    consommateur).
  - **MaliHeatmap polygonale** : si un GeoJSON polygons du Mali est
    intégré (admin level 1 boundaries), passer le bubble map à un
    vrai choropleth. Données potentielles : Natural Earth 1:10m
    admin_1 ou OCHA Mali Common Operational Datasets.
  - **AD-02 mobile** : DataGrid 11 colonnes inutilisable sur xs.
    Vue alternative « cards » à implémenter, ou freeze 3 premières
    colonnes en overflow-x.
  - **Tests E2E Playwright** : parcours agent login mock → dashboard
    KPIs visibles → click drill-down corrections → filtre statut
    UNDER_REVIEW → drawer → approve → toast → retour dashboard avec
    KPI corrections décrémenté.
