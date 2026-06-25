# 04 — Structure du Monorepo Turborepo

> ⚠️ **Mise à jour mai 2026** — voir [`CHANGELOG.md`](./CHANGELOG.md) §2. Packages effectivement
> présents (au-delà de la liste initiale) :
>
> - `packages/shared-types` ✅ aligné PROMPT 1.2 (11 enums, 16 interfaces)
> - `packages/database` ✅ aligné PROMPT 1.3 (Prisma 7.8 + adapter-pg)
> - `packages/config` ✅ aligné PROMPT 1.4 (Zod + dotenv-expand, 9 tests)
> - `packages/utils` ✅ aligné PROMPT 1.4 (NINA + Merkle + crypto + sanitize, 44 tests)
> - `packages/logger` ⚠️ **stub temporaire** créé pour débloquer l'install (4 services le
>   référençaient avant qu'il existe). Implémentation Pino + transport Loki à livrer au document 17.
> - `scripts/typecheck.ts` — placeholder permettant à `tsc --noEmit` à la racine de ne pas erroreur
>   `TS18003` (le vrai typage utilise `pnpm check-types` via Turborepo).
> - Configuration TypeScript racine modernisée : `module/moduleResolution` à `NodeNext`, `baseUrl`
>   retiré (TS 6 deprecation).

> **Bloc concerné** : Transversal (tous les blocs A → F) **Prérequis** : Documents 00, 01, 02 et 03
> complétés **Durée estimée** : 6 à 10 heures pour un étudiant seul **Livrables de cette étape** :
>
> - Monorepo restructuré : 3 apps Next.js + 15 microservices + 14 packages partagés
> - 32 workspaces pnpm fonctionnels (`pnpm install` sans erreur)
>
> ⚠️ **Réconciliation des comptes (juin 2026)** — la liste initiale parlait de « 11 services / 22
> workspaces ». Le dépôt en compte aujourd'hui **15 services** (ajout de `api-gateway`,
> `enrollment-service`, `biometric-service`, `ussd-service`), **14 packages** et **3 apps**, soit
> **32 workspaces**. Les diagrammes et tableaux ci-dessous sont alignés sur cet état réel
> (vérifiable par `ls services/ packages/ apps/`).
>
> - Configuration Turborepo (`turbo.json`) avec orchestration des tâches
> - Husky + commitlint (Conventional Commits) opérationnels
> - Makefile avec raccourcis pour toutes les opérations courantes
> - Docker Compose de développement avec 8 conteneurs d'infrastructure
> - Scripts utilitaires (vérification d'environnement, initialisation BDD)
> - Fichier `docs/adr/ADR-009-monorepo-turborepo.md` dans le repo

---

## 1. Objectif pédagogique

Un monorepo (mono-repository) est un dépôt Git unique contenant **tous les projets** d'un système —
frontend, backend, bibliothèques partagées, infrastructure. C'est l'approche utilisée par Google,
Meta, Microsoft et Uber pour des systèmes de grande envergure. Dans le monde open source, Next.js,
React et Babel utilisent tous un monorepo.

Dans cette étape, on apprend à :

- **Organiser un projet multi-services** — 15 microservices + 3 frontends + 14 packages dans un seul
  dépôt, avec des dépendances internes claires entre eux. Chaque workspace a son propre
  `package.json` mais partage les mêmes conventions.

- **Utiliser Turborepo pour l'orchestration** — Turborepo analyse le graphe de dépendances entre
  workspaces et parallélise les tâches (build, lint, test) intelligemment. Il met en cache les
  résultats pour éviter de refaire un travail déjà fait.

- **Configurer des packages partagés** — Au lieu de dupliquer la logique de validation NINA dans 11
  services, on l'écrit une seule fois dans `packages/utils` et on l'importe partout (15 services).
  C'est le principe DRY (Don't Repeat Yourself) appliqué à l'architecture.

- **Mettre en place la qualité de code** — Husky intercepte chaque commit Git pour vérifier le
  formatage (Prettier) et le lint (ESLint). Commitlint impose le format Conventional Commits. Ces
  outils garantissent un historique Git propre et des messages de commit exploitables.

- **Créer un environnement de développement reproductible** — Docker Compose lance toute
  l'infrastructure en une commande. Le Makefile fournit des raccourcis mnémoniques. Le fichier
  `.env.example` documente chaque variable. Un nouveau développeur peut être opérationnel en 30
  minutes.

💡 **Pourquoi un monorepo et pas un multi-repo ?** Avec 15 microservices dans 15 dépôts séparés,
chaque modification d'un type partagé (`Citizen`, `AuditLogEntry`) nécessiterait de publier un
package npm, puis de mettre à jour la dépendance dans chaque repo. En monorepo, un seul commit met à
jour le type et tous ses consommateurs — cohérence garantie.

---

## 2. Technologies utilisées (avec versions à jour — avril 2026)

| Technologie        | Version | Rôle dans cette étape                                        | Documentation officielle             |
| ------------------ | ------- | ------------------------------------------------------------ | ------------------------------------ |
| **pnpm**           | 10.12.1 | Gestionnaire de paquets avec workspaces natifs               | https://pnpm.io/workspaces           |
| **Turborepo**      | 2.9.5   | Orchestrateur de monorepo (build, dev, test parallèles)      | https://turborepo.dev/docs           |
| **TypeScript**     | 6.0.2   | Typage statique pour 13 services NestJS + 3 apps Next.js     | https://www.typescriptlang.org/docs/ |
| **NestJS**         | 11.1.18 | Framework backend pour 13 microservices TypeScript           | https://docs.nestjs.com/             |
| **FastAPI**        | 0.135+  | Framework backend pour 2 microservices Python (IA + SIGAC)   | https://fastapi.tiangolo.com/        |
| **Next.js**        | 16.2.2  | Framework frontend React avec SSR/SSG                        | https://nextjs.org/docs              |
| **Prisma**         | 7.7+    | ORM TypeScript pour PostgreSQL                               | https://www.prisma.io/docs           |
| **Zod**            | 3.24+   | Validation de schémas TypeScript (variables d'environnement) | https://zod.dev/                     |
| **Husky**          | 9.1.7   | Git hooks automatisés (pre-commit, commit-msg)               | https://typicode.github.io/husky/    |
| **commitlint**     | 20.5.0  | Validation du format Conventional Commits                    | https://commitlint.js.org/           |
| **Prettier**       | 3.8.1   | Formatage de code automatique (TS, JSON, MD)                 | https://prettier.io/docs/            |
| **ESLint**         | 10.2.0  | Linter JavaScript/TypeScript                                 | https://eslint.org/docs/             |
| **Docker Compose** | 2.35+   | Orchestration des conteneurs d'infrastructure locale         | https://docs.docker.com/compose/     |
| **GNU Make**       | 4.x     | Automatisation des commandes répétitives                     | https://www.gnu.org/software/make/   |
| **EditorConfig**   | —       | Configuration d'indentation multi-éditeurs                   | https://editorconfig.org/            |

---

## 3. Architecture du monorepo — Vue d'ensemble

### 3.1 Diagramme d'arborescence cible

L'arborescence ci-dessous montre la structure complète du monorepo après la restructuration. Chaque
dossier de premier niveau a un rôle précis :

```
nina-aes-platform/                          ← Racine du monorepo
│
├── apps/                                   ← 3 applications frontend (Next.js 16)
│   ├── citizen/                            ← Portail citoyen (port 4001)
│   │   ├── src/app/                        ← App Router Next.js
│   │   ├── package.json                    ← @nina-aes/citizen
│   │   └── tsconfig.json
│   ├── admin/                              ← Dashboard administrateur (port 4002)
│   │   ├── src/app/
│   │   ├── package.json                    ← @nina-aes/admin
│   │   └── tsconfig.json
│   └── governance/                         ← Portail gouvernance (port 4003)
│       ├── src/app/
│       ├── package.json                    ← @nina-aes/governance
│       └── tsconfig.json
│
├── services/                               ← 15 microservices backend
│   ├── api-gateway/                        ← Point d'entrée unique (port 3000, NestJS)
│   ├── identity-service/                   ← CRUD NINA (port 3001, NestJS)
│   │   ├── src/
│   │   │   ├── main.ts                     ← Bootstrap + ValidationPipe
│   │   │   ├── app.module.ts               ← Module racine NestJS
│   │   │   └── app.controller.ts           ← Endpoint /health
│   │   ├── package.json                    ← @nina-aes/identity-service
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   └── nest-cli.json
│   ├── auth-service/                       ← Authentification JWT (port 3002, NestJS)
│   ├── ai-service/                         ← Pipeline IA erreurs (port 3003, FastAPI)
│   │   ├── app/
│   │   │   ├── main.py                     ← FastAPI + CORS + /health
│   │   │   └── config.py                   ← pydantic-settings
│   │   ├── tests/
│   │   │   └── test_health.py
│   │   ├── pyproject.toml
│   │   └── requirements.txt
│   ├── document-service/                   ← Fiches descriptives PDF (port 3004, NestJS)
│   ├── notification-service/               ← Email/SMS/Push (port 3005, NestJS)
│   ├── interop-service/                    ← Interopérabilité AES (port 3006, NestJS)
│   ├── audit-service/                      ← Journal hash-chain SHA-256 (port 3007, NestJS — ADR-007)
│   ├── appointment-service/                ← Rendez-vous (port 3008, NestJS)
│   ├── anticorruption-service/             ← SIGAC (port 3009, FastAPI)
│   ├── governance-service/                 ← Gouvernance (port 3010, NestJS)
│   ├── vulnerability-service/              ← Personnes vulnérables (port 3011, NestJS)
│   ├── biometric-service/                 ← Biométrie / déduplication (port 3012, NestJS)
│   ├── enrollment-service/                ← Enrôlement RAVEC (port 3013, NestJS)
│   └── ussd-service/                      ← Passerelle USSD/SMS (port 3014, NestJS — ADR-008)
│
├── packages/                               ← Bibliothèques internes partagées (14)
│   ├── shared-types/                       ← Enums, interfaces, DTOs
│   │   └── src/index.ts                    ← Citizen, UserRole, AuditLogEntry...
│   ├── database/                           ← Client Prisma + schéma PostgreSQL
│   │   ├── src/index.ts                    ← Singleton Prisma (globalThis)
│   │   └── prisma/schema.prisma            ← Modèle Citizen initial
│   ├── config/                             ← Validation Zod des variables d'env
│   │   └── src/index.ts                    ← baseEnvSchema + validateEnv<T>()
│   ├── utils/                              ← Fonctions utilitaires métier
│   │   └── src/
│   │       ├── nina.ts                     ← validateNina, parseNina, computeControlLetter
│   │       ├── merkle.ts                   ← computeMerkleHash, verifyMerkleChain
│   │       └── cn.ts                       ← CSS class merger (clsx léger)
│   ├── ui/                                 ← Composants React partagés (design system)
│   ├── auth/                               ← Helpers session BFF (scope: auth-pkg)
│   ├── auth-guards/                        ← Guards RBAC NestJS partagés (cf. §7.3.1)
│   ├── api-client/                         ← Client REST + DTOs typés
│   ├── i18n/                               ← Internationalisation (8 langues)
│   ├── logger/                             ← Logger Pino → Loki (cf. note d'en-tête)
│   ├── observability/                      ← Traces/metrics OpenTelemetry
│   ├── vault-client/                       ← Client Vault (secrets, Transit)
│   ├── eslint-config/                      ← Configuration ESLint partagée
│   └── typescript-config/                  ← tsconfig.json partagés (base, nextjs, react)
│
├── infrastructure/                         ← Configuration de déploiement
│   ├── docker/                             ← Dockerfiles par service
│   ├── helm/                               ← Charts Helm pour K3s
│   ├── k3s/                                ← Manifestes Kubernetes K3s
│   └── terraform/                          ← Infrastructure as Code
│
├── ai-models/                              ← Assets du module IA
│   ├── datasets/                           ← Datasets synthétiques
│   ├── scripts/                            ← Scripts d'entraînement
│   └── trained/                            ← Modèles entraînés (gitignored)
│
├── scripts/                                ← Scripts utilitaires
│   └── init-db.sql                         ← Extensions PostgreSQL + BDD de test
│
├── docs/                                   ← Documentation du projet (vous êtes ici)
│   ├── 00-README-INDEX.md
│   ├── 01-CAHIER-DES-CHARGES.md
│   ├── 02-ARCHITECTURE-GLOBALE.md
│   ├── 03-SETUP-ENVIRONNEMENT-DEV.md
│   ├── 04-MONOREPO-STRUCTURE.md            ← CE DOCUMENT
│   └── adr/                                ← Architecture Decision Records
│       ├── ADR-001 à ADR-008
│       └── ADR-009-monorepo-turborepo.md
│
├── .husky/                                 ← Git hooks (pre-commit, commit-msg)
├── .github/                                ← Workflows CI/CD GitHub Actions
│
├── package.json                            ← Workspace racine (scripts globaux)
├── pnpm-workspace.yaml                     ← Définition des workspaces pnpm
├── turbo.json                              ← Orchestration Turborepo
├── docker-compose.dev.yml                  ← Infrastructure locale (8 conteneurs)
├── Makefile                                ← Raccourcis CLI
├── .env.example                            ← Template des variables d'environnement
├── .editorconfig                           ← Conventions d'indentation
├── .prettierrc                             ← Configuration Prettier
├── .gitignore                              ← Fichiers exclus de Git
└── commitlint.config.js                    ← Validation Conventional Commits
```

### 3.2 Diagramme du graphe de dépendances internes

Ce diagramme montre comment les workspaces dépendent les uns des autres. Les flèches vont du
consommateur vers la dépendance.

```mermaid
graph TB
    subgraph "apps/ (Next.js 16)"
        CITIZEN["citizen<br/>:4001"]
        ADMIN["admin<br/>:4002"]
        GOV_APP["governance<br/>:4003"]
    end

    subgraph "services/ (NestJS 11)"
        GATEWAY["api-gateway<br/>:3000"]
        IDENTITY["identity-service<br/>:3001"]
        AUTH["auth-service<br/>:3002"]
        DOC["document-service<br/>:3004"]
        NOTIF["notification-service<br/>:3005"]
        INTEROP["interop-service<br/>:3006"]
        AUDIT["audit-service<br/>:3007"]
        APPT["appointment-service<br/>:3008"]
        GOV_SVC["governance-service<br/>:3010"]
        VULN["vulnerability-service<br/>:3011"]
        BIOMETRIC["biometric-service<br/>:3012"]
        ENROLLMENT["enrollment-service<br/>:3013"]
        USSD["ussd-service<br/>:3014"]
    end

    subgraph "services/ (FastAPI)"
        AI["ai-service<br/>:3003"]
        SIGAC["anticorruption-service<br/>:3009"]
    end

    subgraph "packages/"
        TYPES["shared-types"]
        DB["database"]
        CONFIG["config"]
        UTILS["utils"]
        UI["ui"]
        ESLINT["eslint-config"]
        TSCONFIG["typescript-config"]
    end

    %% Les apps dépendent des packages partagés
    CITIZEN --> UI
    CITIZEN --> TYPES
    ADMIN --> UI
    ADMIN --> TYPES
    GOV_APP --> UI
    GOV_APP --> TYPES

    %% Les services NestJS dépendent des packages partagés
    IDENTITY --> TYPES
    IDENTITY --> DB
    IDENTITY --> CONFIG
    IDENTITY --> UTILS
    AUTH --> TYPES
    AUTH --> CONFIG
    AUDIT --> TYPES
    AUDIT --> DB
    AUDIT --> UTILS
    DOC --> TYPES
    DOC --> DB
    DOC --> UTILS

    %% Le package database dépend de config
    DB --> CONFIG

    %% Tous utilisent eslint-config et typescript-config (implicite)
```

### 3.3 Concept de workspace pnpm

Un **workspace** est un dossier avec son propre `package.json` qui fait partie du monorepo. pnpm
gère tous les workspaces depuis un seul `node_modules` à la racine, en utilisant des liens
symboliques (symlinks) pour que chaque workspace voit ses propres dépendances.

```
pnpm-workspace.yaml          ← Déclare quels dossiers sont des workspaces
  ├── "apps/*"                ← citizen, admin, governance (3)
  ├── "packages/*"            ← shared-types, database, config, utils, ui, auth, auth-guards, api-client, i18n, logger, observability, vault-client, eslint-config, typescript-config (14)
  └── "services/*"            ← api-gateway, identity-service, ... (13 NestJS + 2 FastAPI = 15)
```

Pour référencer un package interne depuis un autre workspace :

```json
// Dans services/identity-service/package.json
{
  "dependencies": {
    "@nina-aes/shared-types": "workspace:*",
    "@nina-aes/database": "workspace:*",
    "@nina-aes/config": "workspace:*"
  }
}
```

La notation `"workspace:*"` indique à pnpm de résoudre cette dépendance vers le workspace local, pas
vers le registre npm.

---

## 4. Fichiers de configuration racine — Code commenté

### 4.1 `package.json` — Workspace racine

Le `package.json` racine ne contient **aucune dépendance de production** — il sert uniquement à
orchestrer les workspaces et à définir les scripts globaux.

```json
{
  "name": "nina-aes-platform",
  "private": true,
  "scripts": {
    // ── Développement ──
    "build": "turbo run build",
    "dev": "turbo run dev",
    "dev:citizen": "turbo run dev --filter=@nina-aes/citizen",
    "dev:admin": "turbo run dev --filter=@nina-aes/admin",
    "dev:governance": "turbo run dev --filter=@nina-aes/governance",
    "dev:identity": "turbo run dev --filter=@nina-aes/identity-service",
    "dev:auth": "turbo run dev --filter=@nina-aes/auth-service",
    "dev:ai": "cd services/ai-service && uvicorn app.main:app --reload --port 3003",
    "dev:sigac": "cd services/anticorruption-service && uvicorn app.main:app --reload --port 3009",

    // ── Qualité ──
    "lint": "turbo run lint",
    "test": "turbo run test",
    "test:cov": "turbo run test:cov",
    "check-types": "turbo run check-types",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",

    // ── Nettoyage ──
    "clean": "turbo run clean && rm -rf node_modules .turbo",

    // ── Base de données Prisma ──
    "db:generate": "turbo run db:generate --filter=@nina-aes/database",
    "db:migrate": "turbo run db:migrate --filter=@nina-aes/database",
    "db:seed": "turbo run db:seed --filter=@nina-aes/database",
    "db:studio": "turbo run db:studio --filter=@nina-aes/database",

    // ── Docker ──
    "docker:up": "docker compose -f docker-compose.dev.yml up -d",
    "docker:down": "docker compose -f docker-compose.dev.yml down",
    "docker:logs": "docker compose -f docker-compose.dev.yml logs -f",

    // ── Husky (hooks Git) ──
    "prepare": "cd .. && husky nina-aes-platform/.husky"
  },
  "devDependencies": {
    "@commitlint/cli": "^20.5.0",
    "@commitlint/config-conventional": "^20.5.0",
    "husky": "^9.1.7",
    "prettier": "^3.8.1",
    "turbo": "^2.9.5",
    "typescript": "6.0.2"
  },
  "packageManager": "pnpm@10.12.1",
  "engines": {
    "node": ">=24.0.0"
  }
}
```

**Points d'attention** :

| Champ                               | Explication                                               |
| ----------------------------------- | --------------------------------------------------------- |
| `"private": true`                   | Empêche la publication accidentelle sur npm               |
| `"packageManager": "pnpm@10.12.1"`  | Corepack utilise cette version exacte de pnpm             |
| `"engines": { "node": ">=24.0.0" }` | Refuse l'exécution sur Node.js < 24                       |
| `"prepare": "cd .. && husky ..."`   | Le `.git` est dans le dossier parent (voir section 6.1)   |
| `--filter=@nina-aes/citizen`        | Turborepo exécute la commande uniquement sur ce workspace |

### 4.2 `pnpm-workspace.yaml` — Déclaration des workspaces

```yaml
# ═══════════════════════════════════════════════════
# Définition des workspaces pnpm
# Chaque pattern glob correspond à un ensemble de packages
# ═══════════════════════════════════════════════════

packages:
  - 'apps/*' # 3 applications Next.js (citizen, admin, governance)
  - 'packages/*' # 14 bibliothèques partagées (shared-types, database, config, utils, ui, auth, auth-guards, ...)
  - 'services/*' # 15 microservices (13 NestJS + 2 FastAPI ont un package.json pour pnpm)
```

⚠️ **Note FastAPI** : Les services Python (`ai-service`, `anticorruption-service`) ont un
`package.json` minimal pour que pnpm les reconnaisse comme workspaces. Leurs dépendances Python sont
gérées par `pip` via `requirements.txt`, pas par pnpm.

### 4.3 `turbo.json` — Orchestration des tâches

Turborepo analyse le graphe de dépendances entre workspaces pour déterminer l'ordre d'exécution
optimal. Par exemple, si `identity-service` dépend de `shared-types`, Turborepo sait qu'il faut
builder `shared-types` avant `identity-service`.

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "test/**", "tests/**"],
      "cache": false
    },
    "test:cov": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "test/**", "tests/**"],
      "cache": false
    },
    "clean": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:seed": {
      "cache": false
    },
    "db:studio": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Explication des propriétés clés** :

| Propriété                 | Signification                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"dependsOn": ["^build"]` | Le `^` signifie : **d'abord builder les dépendances internes** de ce workspace. Si `identity-service` dépend de `shared-types`, alors `shared-types` sera buildé en premier. |
| `"inputs"`                | Fichiers à surveiller pour le cache. Si ces fichiers n'ont pas changé depuis le dernier run, Turborepo réutilise le résultat en cache.                                       |
| `"outputs"`               | Dossiers à mettre en cache. `.next/**` pour Next.js, `dist/**` pour NestJS.                                                                                                  |
| `"cache": false`          | Désactive le cache pour cette tâche. Indispensable pour `dev`, `test`, `db:migrate`.                                                                                         |
| `"persistent": true`      | Indique que la tâche ne se termine pas (serveur de dev). Turborepo ne la considère pas comme bloquante.                                                                      |

### 4.4 `.editorconfig` — Conventions d'indentation

L'EditorConfig est lu automatiquement par VS Code (avec l'extension), WebStorm, Vim, Sublime, etc.
Il garantit que tous les éditeurs utilisent les mêmes conventions.

```ini
# ═══════════════════════════════════════════════
# NINA-AES Platform — Configuration éditeur
# Compatible VS Code, WebStorm, Vim, etc.
# ═══════════════════════════════════════════════

root = true                    # Cet .editorconfig est le fichier racine

[*]                            # Règles par défaut (TypeScript, JSON, YAML, etc.)
charset = utf-8                # Encodage Unicode
end_of_line = lf               # Fin de ligne Unix (même sous Windows)
indent_style = space           # Espaces, pas de tabulations
indent_size = 2                # 2 espaces (standard TypeScript/JavaScript)
insert_final_newline = true    # Toujours terminer par une ligne vide
trim_trailing_whitespace = true

[*.md]                         # Markdown : conserver les espaces en fin de ligne
trim_trailing_whitespace = false  # Les doubles espaces = saut de ligne en Markdown

[*.py]                         # Python : PEP 8 impose 4 espaces
indent_size = 4

[Makefile]                     # Make exige des tabulations (pas d'espace !)
indent_style = tab

[*.sql]                        # SQL : 4 espaces pour la lisibilité
indent_size = 4

[*.yml]                        # YAML : 2 espaces (convention standard)
indent_size = 2

[*.yaml]
indent_size = 2
```

### 4.5 `.prettierrc` — Configuration Prettier

Prettier formate automatiquement le code TypeScript, JSON et Markdown à chaque sauvegarde (via VS
Code) ou via la commande `pnpm run format`.

```json
{
  "semi": true, // Point-virgule obligatoire en fin de ligne
  "trailingComma": "all", // Virgule finale (facilite les diffs Git)
  "singleQuote": true, // Guillemets simples (convention TypeScript)
  "printWidth": 90, // Largeur max de ligne (90 = bon compromis)
  "tabWidth": 2, // Indentation de 2 espaces
  "useTabs": false, // Espaces, jamais de tabulations
  "bracketSpacing": true, // Espaces dans les objets : { a: 1 } et non {a: 1}
  "arrowParens": "always", // Parenthèses autour du paramètre : (x) => x
  "endOfLine": "lf", // Fin de ligne Unix (même sous Windows)
  "plugins": [],
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "printWidth": 100, // Lignes plus larges pour le Markdown
        "proseWrap": "always" // Retour à la ligne automatique dans la prose
      }
    }
  ]
}
```

---

## 5. Packages partagés — Code source commenté

Les packages partagés (`packages/*`) sont le cœur de la stratégie DRY du monorepo. Chaque package
est importable par n'importe quel autre workspace via la notation `@nina-aes/nom-du-package`.

### 5.1 `packages/shared-types` — Types TypeScript partagés

Ce package centralise **tous les enums, interfaces et DTOs** utilisés à la fois par les
microservices NestJS et les applications frontend. Un seul point de vérité pour les types.

```typescript
// packages/shared-types/src/index.ts

/**
 * @file        index.ts
 * @description Types partagés entre tous les services de la NINA-AES Platform.
 *              Ce package centralise les enums, interfaces et DTOs réutilisés
 *              par les microservices NestJS et les applications frontend.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      shared-types
 */

// ═══════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════

/** Sexe encodé dans le premier chiffre du NINA */
export enum NinaSexe {
  MASCULIN = 1, // Le premier chiffre du NINA est 1 pour les hommes
  FEMININ = 2, // Le premier chiffre du NINA est 2 pour les femmes
}

/**
 * Rôles RBAC du système — 6 niveaux d'accès.
 * Chaque rôle est configuré dans Keycloak et vérifié par les Guards NestJS.
 */
export enum UserRole {
  CITOYEN = 'citoyen', // Accès lecture seule à ses propres données
  AGENT = 'agent', // Agent CTDEC : lecture + saisie + correction
  SUPERVISEUR = 'superviseur', // Valide les corrections des agents
  ADMIN = 'admin', // Administration technique du système
  AUDITEUR = 'auditeur', // Lecture seule sur les journaux d'audit
  INSPECTEUR = 'inspecteur', // Accès SIGAC anti-corruption
}

/** Statut d'une demande de correction NINA (cycle de vie) */
export enum CorrectionStatus {
  SOUMISE = 'soumise', // L'IA ou un citoyen a soumis une correction
  EN_REVUE = 'en_revue', // Un agent examine la correction
  APPROUVEE = 'approuvee', // Un superviseur a validé
  REJETEE = 'rejetee', // La correction est refusée
  APPLIQUEE = 'appliquee', // La correction est appliquée à la BDD
}

/** Niveau de confiance d'une correction proposée par l'IA */
export enum AiConfidenceLevel {
  HAUTE = 'haute', // Score >= 85% — correction auto proposée
  MOYENNE = 'moyenne', // Score 60-84% — revue manuelle requise
  BASSE = 'basse', // Score < 60% — log seul, pas d'action
}

/** Catégories de personnes vulnérables (Bloc C) */
export enum VulnerabilityCategory {
  PERSONNE_AGEE = 'personne_agee',
  HANDICAP = 'handicap',
  FEMME_ENCEINTE = 'femme_enceinte',
  MALADIE_CHRONIQUE = 'maladie_chronique',
  ANALPHABETE = 'analphabete',
  DIASPORA = 'diaspora',
}

/** Pays membres de l'Alliance des États du Sahel (code ISO 3166-1 alpha-3) */
export enum AesCountry {
  MALI = 'MLI',
  BURKINA_FASO = 'BFA',
  NIGER = 'NER',
}

/** Actions d'audit traçables dans le journal hash-chain (ADR-007) */
export enum AuditAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXPORT = 'EXPORT',
  VERIFY = 'VERIFY',
  CORRECT = 'CORRECT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

// ═══════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════

/** Structure complète d'un enregistrement NINA */
export interface Citizen {
  id: string; // UUID v4 interne (clé primaire)
  nina: string; // Numéro NINA — 15 caractères (14 chiffres + 1 lettre)
  nom: string; // Nom de famille
  prenoms: string; // Prénoms (séparés par des espaces)
  dateNaissance: string; // Date au format ISO 8601
  lieuNaissance: string; // Texte libre
  sexe: NinaSexe; // Encodé dans le premier chiffre du NINA
  codeRegion: string; // Code région RAVEC (ex: "1" = Kayes)
  codeCercle: string; // Code cercle RAVEC (ex: "01" = Kayes cercle)
  codeCommune: string; // Code commune RAVEC (ex: "001")
  createdAt: string; // Timestamp ISO 8601
  updatedAt: string; // Timestamp ISO 8601
}

/** Entrée du journal d'audit (chaîne de hash SHA-256 linéaire, ADR-007) */
export interface AuditLogEntry {
  id: string;
  actorId: string; // userId ou serviceAccount
  actorRole: UserRole; // Rôle au moment de l'action
  action: AuditAction; // Type d'action effectuée
  resource: string; // Table/entité concernée
  resourceId: string; // ID de la ressource
  ipAddress: string; // Adresse IP de l'acteur
  before: Record<string, unknown> | null; // État avant modification
  after: Record<string, unknown> | null; // État après modification
  hash: string; // SHA-256 de cette entrée
  previousHash: string; // SHA-256 de l'entrée précédente
  timestamp: string; // ISO 8601
}

/** Réponse standard de l'API — enveloppe générique */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

/** Réponse paginée — étend ApiResponse avec les métadonnées de pagination */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number; // Page actuelle (1-indexée)
    pageSize: number; // Nombre d'éléments par page
    total: number; // Nombre total d'éléments
    totalPages: number; // Nombre total de pages
  };
}
```

### 5.2 `packages/config` — Validation Zod des variables d'environnement

Ce package définit un **schéma de base** des variables d'environnement communes à tous les
microservices. Chaque service peut étendre ce schéma avec ses propres variables.

````typescript
// packages/config/src/index.ts

/**
 * @file        index.ts
 * @description Validation centralisée des variables d'environnement via Zod.
 *              Chaque microservice importe et étend ce schéma de base.
 *
 *              Exemple d'utilisation dans un service :
 *              ```
 *              import { baseEnvSchema, validateEnv, z } from '@nina-aes/config';
 *              const envSchema = baseEnvSchema.extend({
 *                AI_AUTO_THRESHOLD: z.coerce.number().default(85.0),
 *              });
 *              const env = validateEnv(envSchema);
 *              ```
 * @module      config
 */

import { z } from 'zod';

/**
 * Schéma de base — variables communes à TOUS les services.
 * Chaque service l'étend via `.extend({})` pour ajouter ses propres variables.
 */
export const baseEnvSchema = z.object({
  /** Environnement d'exécution */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** URL de connexion PostgreSQL (Prisma) */
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db'),

  /** URL de connexion Redis (cache + sessions USSD) */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  /** URL du broker RabbitMQ (messages inter-services) */
  RABBITMQ_URL: z.string().default('amqp://nina_rabbit:rabbit_dev_2026!@localhost:5672'),

  /**
   * Clé secrète JWT (HS256) — JAMAIS de valeur par défaut.
   *
   * ⚠️ ANTI-PATTERN à NE PAS copier : `.default('dev-secret-…')`.
   *    Un défaut codé en dur dans le schéma finit invariablement déployé
   *    en production (le développeur oublie de le surcharger). Tout porteur
   *    du secret peut alors forger des JWT valides → escalade de privilèges.
   *
   * ✅ Pas de `.default` : si `JWT_SECRET` est absent, `validateEnv()` lève
   *    une exception au démarrage (fail-fast) au lieu de booter avec un
   *    secret connu. En dev, on le fournit via `.env` (gitignoré) ; en prod,
   *    il est injecté depuis Vault (KV/Transit), jamais commité.
   *
   * ⏳ DRIFT À CORRIGER : le `packages/config/src/index.ts` réel conserve
   *    encore `.default('dev-jwt-secret-…')` (idem `VAULT_TOKEN: .default('dev-root-token')`).
   *    Ce sont les anti-patterns à supprimer côté code — l'extrait ci-dessus
   *    est la cible. Retirer les `.default` sur tout secret avant la mise en prod.
   *
   * NOTE souveraineté : pour la signature des tokens d'accès, auth-service
   * utilise RS256 (clé Vault Transit, voir doc 09) ; ce HS256 ne sert qu'aux
   * usages internes/dev. Dans les deux cas, aucun secret en dur.
   */
  JWT_SECRET: z.string().min(32),

  /** Durée de validité du JWT en secondes (15 min par défaut) */
  JWT_EXPIRATION: z.coerce.number().default(900),
});

/** Type inféré du schéma — utilisable pour le typage TypeScript */
export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Valide les variables d'environnement avec un schéma Zod.
 * Affiche une erreur détaillée et lance une exception si la validation échoue.
 *
 * @param schema - Schéma Zod (baseEnvSchema ou une extension)
 * @returns Les variables d'environnement validées et correctement typées
 * @throws {Error} Si des variables obligatoires sont manquantes ou invalides
 */
export function validateEnv<T extends z.ZodType>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error("❌ Variables d'environnement invalides :");
    console.error(JSON.stringify(formatted, null, 2));
    throw new Error('Configuration invalide — vérifiez votre fichier .env');
  }

  return result.data;
}

// Réexporter z pour que les services n'aient pas besoin d'importer zod séparément
export { z };
````

### 5.3 `packages/utils` — Fonctions utilitaires métier

#### 5.3.1 Validation NINA (`nina.ts`)

L'algorithme de validation du numéro NINA est critique : il doit être identique dans tous les
services qui manipulent des numéros NINA. En le plaçant dans `packages/utils`, on garantit une seule
implémentation.

```typescript
// packages/utils/src/nina.ts

/**
 * @file        nina.ts
 * @description Fonctions de validation et de parsing du format NINA malien.
 *
 *              Format NINA : 15 caractères = 14 chiffres + 1 lettre de contrôle
 *              Structure :   X  YY  ZZ  Z  ZZ  ZZZ  ZZZ  A
 *                            │  │   │   │  │   │    │    └─ Lettre de contrôle
 *                            │  │   │   │  │   │    └────── Séquentiel (001-999)
 *                            │  │   │   │  │   └─────────── Code commune
 *                            │  │   │   │  └─────────────── Code cercle
 *                            │  │   │   └────────────────── Code région
 *                            │  │   └────────────────────── Mois de naissance
 *                            │  └────────────────────────── Année de naissance
 *                            └───────────────────────────── Sexe (1=M, 2=F)
 *
 * @module      utils
 */

/** Regex : premier chiffre 1 ou 2, puis 13 chiffres, puis 1 lettre majuscule */
const NINA_REGEX = /^[12]\d{13}[A-Z]$/;

/** Structure décomposée d'un numéro NINA */
export interface ParsedNina {
  full: string; // Numéro complet (15 caractères)
  sexe: number; // 1 = Masculin, 2 = Féminin
  anneeNaissance: string; // Année (2 chiffres)
  moisNaissance: string; // Mois (2 chiffres, 01-12)
  region: string; // Code région RAVEC (1 chiffre)
  cercle: string; // Code cercle RAVEC (2 chiffres)
  commune: string; // Code commune RAVEC (3 chiffres)
  sequentiel: string; // Numéro séquentiel (3 chiffres)
  lettreControle: string; // Lettre de contrôle calculée
}

/**
 * Calcule la lettre de contrôle d'un NINA.
 *
 * Algorithme :
 * 1. Chaque chiffre est multiplié par sa position (1 à 14)
 * 2. La somme pondérée est calculée
 * 3. Le modulo 23 de cette somme donne un index dans l'alphabet de 23 lettres
 *    (les lettres I et O sont exclues pour éviter la confusion avec 1 et 0)
 *
 * @param digits - Les 14 premiers chiffres du NINA
 * @returns La lettre de contrôle (A-Z sauf I et O)
 */
export function computeControlLetter(digits: string): string {
  if (!/^\d{14}$/.test(digits)) {
    throw new Error(`Les 14 premiers caractères doivent être des chiffres. Reçu : "${digits}"`);
  }

  // 23 lettres (A-Z sans I ni O) — même alphabet que le NINA officiel
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  // Somme pondérée : chiffre[i] × (i + 1)
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    sum += parseInt(digits[i]!, 10) * (i + 1);
  }

  return alphabet[sum % 23]!;
}

/**
 * Valide un numéro NINA complet (format + lettre de contrôle).
 *
 * @param nina - Le numéro NINA à valider (15 caractères)
 * @returns true si le NINA est valide (format correct ET lettre de contrôle cohérente)
 */
export function validateNina(nina: string): boolean {
  if (!nina || nina.length !== 15) return false;
  if (!NINA_REGEX.test(nina)) return false;

  const digits = nina.substring(0, 14);
  const expectedLetter = computeControlLetter(digits);

  return nina[14] === expectedLetter;
}

/**
 * Décompose un numéro NINA en ses composants structurels.
 *
 * @param nina - Le numéro NINA à parser (15 caractères)
 * @returns L'objet ParsedNina avec chaque segment extrait
 * @throws {Error} Si le format du NINA est invalide
 */
export function parseNina(nina: string): ParsedNina {
  if (!NINA_REGEX.test(nina)) {
    throw new Error(`Format NINA invalide : "${nina}"`);
  }

  return {
    full: nina,
    sexe: parseInt(nina[0]!, 10), // Position 0 : sexe
    anneeNaissance: nina.substring(1, 3), // Positions 1-2 : année
    moisNaissance: nina.substring(3, 5), // Positions 3-4 : mois
    region: nina.substring(5, 6), // Position 5 : région
    cercle: nina.substring(6, 8), // Positions 6-7 : cercle
    commune: nina.substring(8, 11), // Positions 8-10 : commune
    sequentiel: nina.substring(11, 14), // Positions 11-13 : séquentiel
    lettreControle: nina[14]!, // Position 14 : lettre contrôle
  };
}
```

#### 5.3.2 Chaîne de hash (hash-chain) SHA-256 (`merkle.ts`)

Le journal d'audit utilise une **chaîne de hash SHA-256 linéaire** (hash-chain), **pas** un arbre de
Merkle : chaque entrée chaîne le hash de la précédente (ADR-007). C'est suffisant pour détecter
toute falsification a posteriori, mais l'inviolabilité forte exige en plus d'**ancrer périodiquement
la racine** chez un tiers indépendant (OCLEI / Vérificateur Général) — sinon un acteur disposant
d'un accès en écriture pourrait recalculer toute la chaîne. ⏳ Cet ancrage reste **à implémenter**
(cf. doc audit). Le nom de fichier historique `merkle.ts` est conservé pour ne pas casser les
imports.

```typescript
// packages/utils/src/merkle.ts

/**
 * @file        merkle.ts
 * @description Fonctions de hachage pour le journal d'audit immuable.
 *
 *              Principe : chaque entrée d'audit contient un hash calculé à partir
 *              de son contenu ET du hash de l'entrée précédente.
 *
 *              hash(N) = SHA-256( hash(N-1) + serialize(entry(N)) )
 *
 *              Si un attaquant modifie une entrée passée, son hash change,
 *              ce qui invalide en cascade TOUS les hash suivants.
 *
 *              ⚠️ Hash-chain LINÉAIRE, pas un arbre de Merkle. L'intégrité
 *                 forte suppose l'ancrage périodique de la racine chez un
 *                 tiers (OCLEI / Vérificateur Général) — ⏳ à implémenter.
 *
 * @see         ADR-007 — Chaîne de hash SHA-256 (hash-chain) pour l'audit immuable
 * @module      utils
 */

import { createHash } from 'crypto';

/**
 * Calcule le hash SHA-256 d'une entrée en la chaînant au hash précédent.
 *
 * @param data         - Contenu sérialisé de l'entrée (JSON.stringify du payload)
 * @param previousHash - Hash SHA-256 de l'entrée précédente (vide pour la première)
 * @returns Hash SHA-256 hexadécimal (64 caractères)
 */
export function computeMerkleHash(data: string, previousHash: string): string {
  return createHash('sha256')
    .update(previousHash + data) // Concaténation : hash précédent + données
    .digest('hex'); // Sortie en hexadécimal (64 caractères)
}

/**
 * Vérifie l'intégrité d'une chaîne d'audit complète.
 * Parcours linéaire O(n) — recalcule chaque hash et vérifie le chaînage.
 *
 * @param entries - Tableau d'entrées ordonnées chronologiquement
 * @returns true si la chaîne est intègre, false si une falsification est détectée
 */
export function verifyMerkleChain(
  entries: Array<{ data: string; hash: string; previousHash: string }>,
): boolean {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    // 1. Recalculer le hash à partir des données et du hash précédent
    const expectedHash = computeMerkleHash(entry.data, entry.previousHash);

    // 2. Comparer avec le hash stocké
    if (entry.hash !== expectedHash) {
      return false; // Falsification détectée !
    }

    // 3. Vérifier le chaînage : previousHash(N) === hash(N-1)
    if (i > 0) {
      const prevEntry = entries[i - 1]!;
      if (entry.previousHash !== prevEntry.hash) {
        return false; // Chaîne brisée !
      }
    }
  }

  return true; // Chaîne intègre ✅
}
```

### 5.4 `packages/database` — Client Prisma singleton

```typescript
// packages/database/src/index.ts

/**
 * @file        index.ts
 * @description Client Prisma singleton pour tous les microservices.
 *
 *              Problème : en développement, le hot-reload de NestJS crée une
 *              nouvelle instance de PrismaClient à chaque rechargement. Avec
 *              10 rechargements, on a 10 connexions ouvertes vers PostgreSQL.
 *
 *              Solution : stocker l'instance sur `globalThis` (objet global JS).
 *              Le hot-reload recrée les modules mais ne touche pas `globalThis`.
 *
 * @module      database
 */

import { PrismaClient } from '@prisma/client';

/** Typage de l'objet global pour TypeScript */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Client Prisma singleton.
 * - En développement : réutilise l'instance existante sur globalThis
 * - En production : crée une nouvelle instance (pas de hot-reload)
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error'] // Logs complets en dev
        : ['error'], // Erreurs seulement en prod
  });

// Stocker l'instance sur globalThis (sauf en production)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export default prisma;
```

**Schéma Prisma** (`packages/database/prisma/schema.prisma`) :

Le schéma complet (modèle `Citizen` enrichi, corrections, audit, géographie RAVEC, etc.) est défini
et commenté dans le document **06-DATABASE-SCHEMA-PRISMA.md** — c'est lui qui fait foi. Pour éviter
toute dérive (un modèle « initial » figé ici diverge vite du vrai schéma), on ne reproduit ici que
le **squelette generator/datasource** servant à valider le setup du package :

```prisma
// ═══════════════════════════════════════════════════════════════
// Schéma Prisma — NINA-AES Platform (squelette de structure)
// ⚠️ Les MODÈLES (Citizen, corrections, audit…) sont définis dans
//    06-DATABASE-SCHEMA-PRISMA.md, qui est la source de vérité.
// ═══════════════════════════════════════════════════════════════

generator client {
  provider = "prisma-client-js"   // Génère le client TypeScript
}

datasource db {
  provider = "postgresql"          // PostgreSQL 18 (image postgis 18-3.6, cf. §8.1)
  url      = env("DATABASE_URL")   // Variable d'environnement validée par @nina-aes/config
}

// Les modèles métier (Citizen, Correction, AuditLog, géographie RAVEC…)
// sont décrits dans le document 06. Ne pas les dupliquer ici.
```

> 💡 **Pourquoi pas de modèle complet ici ?** Ce document décrit la _structure du monorepo_, pas le
> _schéma de données_. Recopier un modèle `Citizen` « initial » créerait deux définitions
> concurrentes ; à la première migration réelle, ce document mentirait. La règle MAINTENANCE.md est
> respectée : un seul fichier (06) porte le schéma.

---

## 6. Qualité de code — Husky, commitlint, hooks Git

### 6.1 Configuration Husky — Cas particulier du `.git` parent

Dans notre projet, le dossier `.git` est dans le répertoire **parent** du monorepo :

```
C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\       ← .git est ICI
└── nina-aes-platform\                                         ← Le monorepo est ICI
    ├── .husky\
    │   ├── pre-commit
    │   └── commit-msg
    └── package.json
```

C'est pourquoi le script `prepare` dans `package.json` fait `cd ..` avant d'initialiser Husky :

```json
"prepare": "cd .. && husky nina-aes-platform/.husky"
```

Cela indique à Husky : « les hooks Git sont dans `nina-aes-platform/.husky/`, mais le dossier `.git`
est un niveau au-dessus. »

### 6.2 Hook `pre-commit` — Vérification du formatage et du lint

Ce hook s'exécute **avant** chaque `git commit`. Si le code n'est pas correctement formaté ou
contient des erreurs de lint, le commit est refusé.

```bash
#!/usr/bin/env sh
# .husky/pre-commit

# Changer vers le répertoire du monorepo
# (nécessaire car .git est dans le dossier parent)
cd nina-aes-platform || exit 0

# Vérifier le formatage (Prettier)
pnpm run format:check || {
  echo "❌ Formatage incorrect. Exécutez : pnpm run format"
  exit 1
}

# Vérifier le lint (ESLint)
pnpm run lint || {
  echo "❌ Erreurs de lint. Corrigez-les avant de commiter."
  exit 1
}
```

### 6.3 Hook `commit-msg` — Validation Conventional Commits

Ce hook s'exécute **après** la saisie du message de commit. Il vérifie que le message suit le format
Conventional Commits.

```bash
#!/usr/bin/env sh
# .husky/commit-msg

# Changer vers le répertoire du monorepo
cd nina-aes-platform || exit 0

# Vérifier le format du message de commit via commitlint
pnpm exec commitlint --edit "$1" || {
  echo "❌ Format de commit invalide."
  echo "   Format attendu : type(scope): description"
  echo "   Exemple : feat(identity): add NINA search endpoint"
  exit 1
}
```

### 6.4 `commitlint.config.js` — Scopes autorisés

```javascript
// commitlint.config.js

/**
 * Configuration commitlint — impose le format Conventional Commits.
 *
 * Format attendu :
 *   type(scope): description
 *
 * Exemples valides :
 *   feat(identity): add NINA search endpoint
 *   fix(auth): correct JWT expiration calculation
 *   docs(monorepo): add 04-MONOREPO-STRUCTURE.md
 *   chore(deps): update NestJS to 11.1.18
 *   test(audit): add Merkle chain verification tests
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // scope-enum niveau 2 = ERREUR : un scope hors liste bloque le commit.
    // ⚠️ Tenir cette liste alignée sur les workspaces réels : ajouter le scope
    //    AVANT de committer un nouveau service (sinon le commit-msg échoue).
    'scope-enum': [
      2, // Niveau 2 = erreur (bloque le commit)
      'always',
      [
        // ── Microservices (ports 3000..3014) ──
        'api-gateway', // api-gateway (3000)
        'identity', // identity-service (3001)
        'auth', // auth-service (3002)
        'ai', // ai-service (3003, FastAPI)
        'document', // document-service (3004)
        'notification', // notification-service (3005)
        'interop', // interop-service (3006)
        'audit', // audit-service (3007)
        'appointment', // appointment-service (3008)
        'sigac', // anticorruption-service (3009, FastAPI)
        'sgogt', // module SGOGT (governance-service)
        'governance', // governance-service (3010)
        'vulnerability', // vulnerability-service (3011)
        // biometric-service (3012) → scope 'biometrics'
        // enrollment-service (3013) → scope 'identity'/'data' selon le contexte
        // ── Apps / canaux ──
        'citizen', // apps/citizen
        'admin', // apps/admin
        'gov', // apps/governance
        'mobile', // apps/mobile (Expo)
        'kiosk', // apps/kiosk (Electron)
        'ussd', // ussd-service (3014) + simulateur USSD
        // ── Packages partagés ──
        'shared-types',
        'database',
        'config',
        'utils',
        'ui',
        'auth-pkg', // packages/auth
        'api-client',
        'logger',
        'observability',
        'test-fixtures',
        // ── Transversal / infra ──
        'infra',
        'docker',
        'ci',
        'deps',
        'biometrics', // biometric-service + module biométrie
        'security',
        'testing',
        'backup',
        'data',
        'mali',
        'monorepo',
        'docs',
      ],
    ],
    'scope-empty': [0], // Le scope est optionnel
    'header-max-length': [2, 'always', 100], // Max 100 caractères dans le header
  },
};
```

> ⚠️ **Source de vérité** : la liste exacte vit dans `commitlint.config.cjs` à la racine. L'extrait
> ci-dessus est représentatif mais le fichier réel peut en ajouter (`i18n`, `auth-guards`,
> `vault-client`…) au fil des nouveaux workspaces. En cas de doute, lire le fichier réel.

**Tableau des types de commit** :

| Type       | Signification                               | Exemple                                            |
| ---------- | ------------------------------------------- | -------------------------------------------------- |
| `feat`     | Nouvelle fonctionnalité                     | `feat(identity): add NINA search by region`        |
| `fix`      | Correction de bug                           | `fix(nina): correct control letter for edge case`  |
| `docs`     | Documentation seule                         | `docs(monorepo): add 04-MONOREPO-STRUCTURE.md`     |
| `style`    | Formatage, pas de changement de logique     | `style(auth): reformat with Prettier`              |
| `refactor` | Restructuration sans changement fonctionnel | `refactor(audit): extract Merkle logic to utils`   |
| `perf`     | Amélioration de performance                 | `perf(identity): add GIN index for trigram search` |
| `test`     | Ajout ou correction de tests                | `test(ai): add XGBoost scoring unit tests`         |
| `build`    | Changement du build system                  | `build(monorepo): upgrade Turborepo to 2.9.5`      |
| `ci`       | Changement CI/CD                            | `ci: add GitHub Actions lint workflow`             |
| `chore`    | Maintenance technique                       | `chore(deps): update all NestJS packages`          |
| `revert`   | Annulation d'un commit précédent            | `revert: revert "feat(auth): add MFA"`             |

---

## 7. Microservices — Structure des scaffolds

### 7.1 Service NestJS — Pattern commun (13 services)

Les 13 microservices NestJS suivent exactement la même structure de base. Voici le pattern complet
illustré avec `identity-service` :

```
services/identity-service/
├── src/
│   ├── main.ts               ← Bootstrap + ValidationPipe + prefix /api/v1
│   ├── app.module.ts          ← Module racine NestJS
│   └── app.controller.ts      ← Endpoint /health (probe de santé)
├── test/
│   └── app.e2e-spec.ts        ← Tests end-to-end (à implémenter doc 18)
├── package.json               ← @nina-aes/identity-service
├── tsconfig.json              ← Extends du typescript-config du monorepo
├── tsconfig.build.json        ← Config build (exclut les tests)
└── nest-cli.json              ← Configuration NestJS CLI
```

**`main.ts`** — Point d'entrée :

```typescript
// services/identity-service/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet'; // En-têtes de sécurité HTTP (CSP, HSTS, …)
import { AppModule } from './app.module';

const PORT = process.env.PORT || 3001;

// Liste blanche d'origines CORS, lue depuis l'env (jamais "*" avec credentials)
const CORS_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ??
  'http://localhost:4001,http://localhost:4002,http://localhost:4003'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

async function bootstrap(): Promise<void> {
  const logger = new Logger('identity-service');
  const app = await NestFactory.create(AppModule);

  // ── En-têtes de sécurité (helmet) ──
  // CSP : bloque l'injection de scripts tiers ; HSTS : force HTTPS côté navigateur.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"], // anti-clickjacking
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    }),
  );

  // Validation automatique des DTOs entrants (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Supprime les propriétés non décorées
      forbidNonWhitelisted: true, // Rejette les propriétés inconnues (sécurité)
      transform: true, // Transforme les payloads en instances de classe
    }),
  );

  // Préfixe global : toutes les routes commencent par /api/v1
  // `health` est exclu pour matcher la sonde Docker `curl /health`.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // ⚠️ ANTI-PATTERN : `app.enableCors()` sans argument autorise TOUTES les
  //    origines. Acceptable au mieux en dev local, jamais en production.
  // ✅ CORS restreint à la liste blanche + credentials explicitement gérés.
  app.enableCors({
    origin: CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  await app.listen(PORT);
  logger.log(`identity-service démarré sur le port ${PORT}`);
}

bootstrap();
```

> 🔒 **Rappel** : `helmet` est un middleware Express ; il s'installe via `pnpm add helmet` dans
> chaque service NestJS. La CSP ci-dessus est volontairement stricte (API JSON, pas de HTML rendu
> côté serveur) — un service qui sert une UI devra l'assouplir au cas par cas, jamais en désactivant
> `helmet` globalement.
>
> ⏳ **État réel (juin 2026)** : ce `main.ts` est le **pattern cible**. À ce jour seuls 5 des 13
> services NestJS appliquent `helmet` et le CORS restreint ; certains (`governance`, `interop`,
> `vulnerability`) utilisent encore `app.enableCors()` nu et n'ont pas `helmet`. L'uniformisation
> sur ce scaffold est **à finaliser** (vérifiable par `grep -L helmet services/*/src/main.ts`). Ne
> pas considérer ces garde-fous comme acquis sur l'ensemble du parc tant que ce drift n'est pas
> résorbé.

**Tableau récapitulatif des 13 services NestJS** :

| Service               | Package name                      | Port | Rôle principal                |
| --------------------- | --------------------------------- | ---- | ----------------------------- |
| api-gateway           | `@nina-aes/api-gateway`           | 3000 | Entrée unique, rate-limit     |
| identity-service      | `@nina-aes/identity-service`      | 3001 | CRUD NINA, recherche floue    |
| auth-service          | `@nina-aes/auth-service`          | 3002 | JWT RS256, Keycloak, MFA      |
| document-service      | `@nina-aes/document-service`      | 3004 | PDF, QR code signé, MinIO     |
| notification-service  | `@nina-aes/notification-service`  | 3005 | Email, SMS, Push              |
| interop-service       | `@nina-aes/interop-service`       | 3006 | mTLS inter-pays AES           |
| audit-service         | `@nina-aes/audit-service`         | 3007 | Journal hash-chain SHA-256    |
| appointment-service   | `@nina-aes/appointment-service`   | 3008 | Prise de rendez-vous          |
| governance-service    | `@nina-aes/governance-service`    | 3010 | Workflows gouvernance         |
| vulnerability-service | `@nina-aes/vulnerability-service` | 3011 | Personnes vulnérables         |
| biometric-service     | `@nina-aes/biometric-service`     | 3012 | Biométrie / déduplication     |
| enrollment-service    | `@nina-aes/enrollment-service`    | 3013 | Enrôlement RAVEC              |
| ussd-service          | `@nina-aes/ussd-service`          | 3014 | Passerelle USSD/SMS (ADR-008) |

### 7.2 Service FastAPI — Pattern commun (2 services)

Les 2 services Python (IA + anti-corruption) suivent cette structure :

```
services/ai-service/
├── app/
│   ├── main.py               ← FastAPI + CORS + /health
│   └── config.py             ← pydantic-settings (seuils IA)
├── tests/
│   └── test_health.py        ← Test Pytest du /health
├── pyproject.toml             ← Configuration projet Python
├── requirements.txt           ← Dépendances pip
└── package.json               ← Minimal (pour pnpm workspace)
```

**`app/main.py`** — Point d'entrée FastAPI :

```python
# services/ai-service/app/main.py

"""
Point d'entrée du service IA (ai-service) — port 3003.

Ce service expose un pipeline de détection d'erreurs en 5 étapes :
1. Ingestion des données NINA
2. Normalisation et préparation
3. Analyse (Jaro-Winkler, Soundex, NER, règles métier)
4. Scoring (XGBoost)
5. Soumission des corrections

Auteur  : Étudiant UQAR
Date    : 2026
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="NINA-AES AI Service",
    description="Module IA de détection et correction des erreurs de saisie NINA",
    version="0.1.0",
    docs_url="/api/v1/ai/docs",          # Swagger UI
    openapi_url="/api/v1/ai/openapi.json",
)

# ═══════════════════════════════════════════════════════════════
# CORS — origines EXPLICITES, jamais le wildcard avec credentials
# ═══════════════════════════════════════════════════════════════
#
# ⚠️ ANTI-PATTERN à NE PAS copier :
#       allow_origins=["*"], allow_credentials=True
#    C'est une vraie vulnérabilité. La combinaison « wildcard + cookies/
#    Authorization » est interdite par la spec CORS : Starlette l'ignore
#    silencieusement et reflète l'Origin de l'appelant, ce qui revient à
#    autoriser TOUT site tiers à émettre des requêtes authentifiées vers
#    l'API au nom de l'utilisateur (CSRF / vol de session).
#
# ✅ Liste blanche d'origines, lue depuis l'environnement (.env / Vault).
#    `allow_methods`/`allow_headers` sont également restreints au strict
#    nécessaire plutôt qu'à "*".
_default_origins = "http://localhost:4001,http://localhost:4002,http://localhost:4003"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,          # citizen/admin/governance uniquement
    allow_credentials=True,                 # OK car les origines sont explicites
    allow_methods=["GET", "POST"],          # verbes réellement exposés par l'IA
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/v1/ai/health")
async def health_check():
    """Endpoint de santé — vérifie que le service IA est opérationnel."""
    from datetime import datetime, timezone

    return {
        "status": "ok",
        "service": "ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

**Tableau récapitulatif des 2 services FastAPI** :

| Service                | Port | Stack IA                     | Rôle                     |
| ---------------------- | ---- | ---------------------------- | ------------------------ |
| ai-service             | 3003 | XGBoost, RapidFuzz, spaCy    | Détection d'erreurs NINA |
| anticorruption-service | 3009 | Isolation Forest, LSTM, BERT | SIGAC intégrité          |

### 7.3 Sécurité transversale du monorepo

Les extraits `main.ts` / `main.py` ci-dessus montrent les garde-fous **par service**. Mais la
sécurité d'une plateforme d'identité souveraine se joue surtout au niveau **transversal** : un seul
service mal câblé suffit à exposer toute la fédération AES. Cette sous-section liste les contrôles
qui doivent être identiques d'un workspace à l'autre. Le détail opérationnel vit dans
[`docs/security/THREAT-MODEL.md`](./security/THREAT-MODEL.md) et
[`docs/security/SECURITY-RUNBOOK.md`](./security/SECURITY-RUNBOOK.md) ; l'**ADR-034** est l'ADR de
sécurité dédié (mTLS strict Linkerd + PKI Vault + rotation clés/JWKS + scans CI).

#### 7.3.1 Garde RBAC obligatoire (deny-by-default)

POURQUOI : la `ValidationPipe` valide la _forme_ d'une requête, jamais le _droit_ de l'émettre. Sans
Guard, un citoyen authentifié pourrait appeler un endpoint réservé à un superviseur.

- Chaque contrôleur exposant des données est protégé par un Guard d'authentification **et** un Guard
  RBAC vérifiant le `UserRole` (voir l'enum `UserRole` en §5.1). Posture **deny-by-default** : une
  route sans rôle déclaré est refusée, pas ouverte.
- Les rôles proviennent du JWT émis par auth-service (Keycloak, ADR-013) ; ils ne sont jamais
  déduits d'un champ du body modifiable par le client.
- Le package partagé `@nina-aes/auth-guards` centralise ces Guards pour éviter 15 implémentations
  divergentes. ⏳ Câblage complet à finaliser en Phase 2 — aujourd'hui le package existe mais tous
  les services ne l'appliquent pas encore (vérifiable par `grep -r "auth-guards" services/`).

#### 7.3.2 mTLS pour l'interopérabilité inter-services et inter-pays

POURQUOI : entre microservices et surtout entre pays AES (Mali ↔ Burkina ↔ Niger), un simple JWT ne
prouve pas l'identité _de la machine_ appelante.

- Maillage interne : mTLS **strict** via Linkerd (ADR-034) — chaque pod présente un certificat émis
  par la PKI Vault ; le trafic en clair est rejeté.
- Interop transfrontalier (`interop-service`) : mTLS avec certificats par pays (`AES_MLI_CERT_PATH`,
  `AES_BFA_CERT_PATH`, `AES_NER_CERT_PATH`, cf. §8.3). Souveraineté : pas d'autorité de
  certification externe sur le cœur — PKI Vault interne, registry miroir CTDEC.
- ⏳ Linkerd + PKI Vault sont **conçus, non déployés** dans ce document de structure ; ils sont
  documentés et livrés au bloc infrastructure.

#### 7.3.3 Rate-limiting à la passerelle (`api-gateway`)

POURQUOI : exposer 15 services directement à Internet multiplie la surface d'attaque (brute-force
JWT, scraping de NINA, déni de service).

- `api-gateway` (port 3000) est le **point d'entrée unique** : les services métier ne sont pas
  exposés publiquement. C'est là que vivent le rate-limiting (throttling par IP/utilisateur), la
  terminaison TLS et la validation préliminaire des tokens.
- Endpoints sensibles (login, recherche NINA, USSD) : quotas plus stricts pour limiter
  l'énumération.
- ⏳ Politiques de quota concrètes à définir au document infrastructure / gateway.

#### 7.3.4 Mini threat model (STRIDE) + correspondance OWASP

| Menace (STRIDE)            | Scénario concret NINA-AES                                 | Contrôle transversal                    | OWASP API/Top 10          |
| -------------------------- | --------------------------------------------------------- | --------------------------------------- | ------------------------- |
| **S**poofing               | Token forgé avec un `JWT_SECRET` deviné/codé en dur       | RS256 + secret hors-code (§5.2)         | API2 Broken Auth          |
| **T**ampering              | Modification a posteriori d'une entrée d'audit            | Hash-chain SHA-256 (ADR-007, §5.3)      | A08 Data Integrity        |
| **R**epudiation            | Un agent nie une correction NINA                          | Journal d'audit + `actorId`/`actorRole` | A09 Logging Failures      |
| **I**nformation Disclosure | CORS `*` + credentials → fuite de session vers site tiers | Origines explicites (§7.1/§7.2)         | API8 Misconfiguration     |
| **D**enial of Service      | Brute-force login / scraping NINA                         | Rate-limiting gateway (§7.3.3)          | API4 Resource Consumption |
| **E**levation of Privilege | Citoyen accédant à un endpoint superviseur                | Guard RBAC deny-by-default (§7.3.1)     | API1 BOLA / API5 BFLA     |

> 🔒 **Honnêteté** : ce tableau décrit la posture _cible_. À l'étape « structure du monorepo »,
> seuls les contrôles in-process (validation, CORS restreint, helmet, hash-chain) sont présents dans
> les scaffolds — et **pas encore uniformément** : `helmet`/CORS restreint ne couvrent que 5/13
> services NestJS, `anticorruption-service` (`app/main.py`) garde un `allow_origins=["*"]` à
> corriger, et `packages/config` conserve un `.default` sur `JWT_SECRET`/`VAULT_TOKEN`. RBAC
> complet, mTLS, rate-limiting et ancrage de la racine d'audit chez un tiers (OCLEI / Vérificateur
> Général) sont marqués ⏳ et livrés aux documents dédiés. Ces drifts code↔doc doivent être résorbés
> avant prod.

---

## 8. Infrastructure Docker et scripts utilitaires

### 8.1 Docker Compose — 8 conteneurs d'infrastructure

Le fichier `docker-compose.dev.yml` lance toute l'infrastructure nécessaire **sauf** les
microservices eux-mêmes (qui tournent en local pour le hot-reload).

| Conteneur         | Image                                                 | Port(s)     | Healthcheck                          | Volume                    |
| ----------------- | ----------------------------------------------------- | ----------- | ------------------------------------ | ------------------------- |
| **postgres**      | `postgis/postgis:18-3.6`                              | 5432        | `pg_isready`                         | `nina-postgres-data`      |
| **redis**         | `redis:8.6.3-alpine`                                  | 6379        | `redis-cli ping`                     | `nina-redis-data`         |
| **rabbitmq**      | `rabbitmq:4.2.4-management-alpine`                    | 5672, 15672 | `rabbitmq-diagnostics check_running` | `nina-rabbitmq-data`      |
| **minio** ⚠️      | `minio/minio:RELEASE.2025-09-07T16-13-09Z`            | 9000, 9001  | `curl /minio/health/live`            | `nina-minio-data`         |
| **elasticsearch** | `docker.elastic.co/elasticsearch/elasticsearch:9.4.1` | 9200        | `curl cluster/health` (auth)         | `nina-elasticsearch-data` |
| **kibana**        | `docker.elastic.co/kibana/kibana:9.4.1`               | 5601        | `curl /api/status`                   | —                         |
| **keycloak**      | `quay.io/keycloak/keycloak:26.6.2`                    | 8080        | TCP `:9000/health/ready`             | — (via PostgreSQL)        |
| **vault**         | `hashicorp/vault:2.0.1`                               | 8200        | `VAULT_ADDR=http://… vault status`   | — (mode dev)              |
| **maildev**       | `maildev/maildev:2.2.1`                               | 1080, 1025  | `wget /healthz`                      | —                         |

**Commandes essentielles** :

```powershell
# ── Démarrer toute l'infrastructure ──
pnpm run docker:up
# Équivalent : docker compose -f docker-compose.dev.yml up -d

# ── Vérifier que tous les conteneurs sont sains ──
docker compose -f docker-compose.dev.yml ps
# Tous doivent afficher "healthy" dans la colonne STATUS

# ── Voir les logs en temps réel ──
pnpm run docker:logs
# Ou un seul conteneur : docker compose -f docker-compose.dev.yml logs -f postgres

# ── Arrêter tout ──
pnpm run docker:down

# ── Arrêter et supprimer les volumes (reset complet) ──
docker compose -f docker-compose.dev.yml down -v
```

### 8.2 Script SQL d'initialisation (`scripts/init-db.sql`)

Ce script est monté automatiquement dans le conteneur PostgreSQL via `docker-entrypoint-initdb.d/`.
Il s'exécute **une seule fois** au premier démarrage.

```sql
-- scripts/init-db.sql

-- ═══════════════════════════════════════════════════
-- NINA-AES Platform — Initialisation PostgreSQL
-- Exécuté automatiquement au premier démarrage du conteneur
-- ═══════════════════════════════════════════════════

-- Se connecter à la base principale
\c nina_aes_db;

-- uuid-ossp : UUID v4 pour les clés primaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto : fonctions cryptographiques (gen_random_uuid, crypt, etc.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm : index trigrams pour la recherche floue
-- Permet : SELECT * FROM citizens WHERE nom % 'Mamadu' (trouve "Mamadou")
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- unaccent : normalisation sans accents
-- Permet : SELECT unaccent('Sékou') → 'Sekou'
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Créer la base de données de test (isolée du dev)
SELECT 'CREATE DATABASE nina_aes_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'nina_aes_test'
)\gexec

-- Mêmes extensions sur la base de test
\c nina_aes_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Retour sur la base principale
\c nina_aes_db;

DO $$
BEGIN
  RAISE NOTICE '✅ NINA-AES — Extensions activées : uuid-ossp, pgcrypto, pg_trgm, unaccent';
END $$;
```

### 8.3 Variables d'environnement (`.env.example`)

Le fichier `.env.example` documente **toutes** les variables d'environnement du projet. Il doit être
copié vers `.env` au premier setup.

```bash
# Copier le template
copy .env.example .env # cmd
Copy-Item .env.example .env # PowerShell
cp .env.example .env # Git Bash
```

Les variables sont organisées par catégorie :

| Catégorie        | Variables clés                                                | Exemple                                                             |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| PostgreSQL       | `DATABASE_URL`, `POSTGRES_USER/PASSWORD/DB`                   | `postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db` |
| Redis            | `REDIS_URL`, `REDIS_PASSWORD`                                 | `redis://:redis_dev_2026!@localhost:6379`                           |
| RabbitMQ         | `RABBITMQ_URL`, `RABBITMQ_USER/PASSWORD`                      | `amqp://nina_rabbit:rabbit_dev_2026!@localhost:5672`                |
| MinIO            | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY/SECRET_KEY`               | `localhost:9000`                                                    |
| Elasticsearch    | `ELASTICSEARCH_URL`                                           | `http://localhost:9200`                                             |
| Keycloak         | `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_*`         | `http://localhost:8080`                                             |
| Vault            | `VAULT_ADDR`, `VAULT_TOKEN`                                   | `http://localhost:8200`                                             |
| JWT              | `JWT_SECRET`, `JWT_EXPIRATION`, `JWT_*_KEY_PATH`              | 900 secondes (15 min)                                               |
| Africa's Talking | `AT_API_KEY`, `AT_USERNAME`, `AT_USSD_SHORTCODE`              | `*123*NINA#`                                                        |
| Module IA        | `AI_AUTO_THRESHOLD`, `AI_REVIEW_THRESHOLD`                    | 85.0 / 60.0                                                         |
| SIGAC            | `SIGAC_INTEGRITY_CRITICAL/WARNING`                            | 40.0 / 60.0                                                         |
| mTLS AES         | `AES_MLI_CERT_PATH`, `AES_BFA_CERT_PATH`, `AES_NER_CERT_PATH` | `./secrets/aes/mali.crt`                                            |

🔒 **Règle de sécurité absolue** : Le fichier `.env` est dans le `.gitignore`. Il ne doit **jamais**
être commité. Seul `.env.example` (sans vrais secrets) est versionné.

### 8.4 Makefile — Raccourcis CLI

Le Makefile fournit des commandes courtes et mémorisables. Sur Windows, il nécessite `make` via
Chocolatey (`choco install make`) ou Git Bash.

```makefile
# ═══════════════════════════════════════════════════
# NINA-AES Platform — Makefile
# Usage : make <cible>
# ═══════════════════════════════════════════════════

.PHONY: help install dev build test lint format clean \
        docker-up docker-down db-migrate db-seed db-studio ai-dev

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Installation ──
install: ## Installe toutes les dépendances (pnpm + Python)
	pnpm install
	cd services/ai-service && pip install -r requirements.txt
	cd services/anticorruption-service && pip install -r requirements.txt

# ── Développement ──
dev: ## Lance tous les services en mode développement
	pnpm run dev

dev-citizen: ## Lance uniquement le portail citoyen (port 4001)
	pnpm run dev:citizen

dev-admin: ## Lance uniquement le dashboard admin (port 4002)
	pnpm run dev:admin

dev-identity: ## Lance uniquement identity-service (port 3001)
	pnpm run dev:identity

dev-ai: ## Lance le service IA FastAPI (port 3003)
	cd services/ai-service && uvicorn app.main:app --reload --port 3003

# ── Build + Qualité ──
build: ## Build tous les packages et applications
	pnpm run build

test: ## Lance tous les tests (Jest + Pytest)
	pnpm run test
	cd services/ai-service && pytest
	cd services/anticorruption-service && pytest

lint: ## Vérifie le code (ESLint + Ruff)
	pnpm run lint
	cd services/ai-service && ruff check .
	cd services/anticorruption-service && ruff check .

format: ## Formate le code (Prettier + Ruff)
	pnpm run format
	cd services/ai-service && ruff format .
	cd services/anticorruption-service && ruff format .

# ── Docker ──
docker-up: ## Démarre l'infrastructure Docker
	docker compose -f docker-compose.dev.yml up -d

docker-down: ## Arrête l'infrastructure Docker
	docker compose -f docker-compose.dev.yml down

docker-logs: ## Affiche les logs Docker en temps réel
	docker compose -f docker-compose.dev.yml logs -f

docker-ps: ## Liste les conteneurs en cours d'exécution
	docker compose -f docker-compose.dev.yml ps

# ── Base de données ──
db-generate: ## Génère le client Prisma
	pnpm run db:generate

db-migrate: ## Exécute les migrations Prisma
	pnpm run db:migrate

db-seed: ## Peuple la base (géographie Mali)
	pnpm run db:seed

db-studio: ## Ouvre Prisma Studio (interface visuelle BDD)
	pnpm run db:studio

db-reset: ## Remet la base à zéro (⚠️ supprime tout)
	cd packages/database && pnpm exec prisma migrate reset

# ── Nettoyage ──
clean: ## Supprime node_modules, dist, .next, .turbo
	pnpm run clean

# ── Initialisation complète ──
init: install docker-up db-migrate db-seed ## Setup complet : install → docker → migrations → seeds
	@echo "✅ NINA-AES Platform initialisée avec succès"
```

---

## 8bis. Tests de validation du monorepo (`verify:repo`)

POURQUOI : un monorepo de 32 workspaces dérive vite — un compte de services faux dans un doc, un
schéma JSON cassé, une donnée géographique Mali invalide. Plutôt que de relire à la main, on
**automatise la cohérence** avec une chaîne de validation unique, exécutable en local et en CI.

```powershell
# ── Chaîne complète (préférée) ──
pnpm run verify:repo
# Équivalent : validate:data → validate:schemas → docs:sync:check

# ── Maillons individuels (debug ciblé) ──
pnpm run validate:data      # données géographiques Mali (régions/cercles/communes RAVEC)
pnpm run validate:schemas   # schémas JSON du dépôt (fail-fast si un schéma est invalide)
pnpm run docs:sync:check    # cohérence docs ↔ code (ports, comptes de services, scopes…)
```

| Script             | Fichier source                      | Vérifie quoi                                                     |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| `validate:data`    | `scripts/validate-mali-data.mjs`    | Intégrité des données géographiques Mali (codes RAVEC cohérents) |
| `validate:schemas` | `scripts/validate-json-schemas.mjs` | Tous les schémas JSON du dépôt sont valides et se compilent      |
| `docs:sync:check`  | `scripts/docs-sync-check.mjs`       | La doc ne ment pas sur le code (drift ports / comptes / scopes)  |
| `verify:repo`      | (orchestre les trois ci-dessus)     | Porte d'entrée unique — **à lancer avant chaque commit/PR**      |

> 💡 **Lien avec ce document** : c'est `docs:sync:check` qui aurait dû signaler le drift « 11
> services vs 15 réels » corrigé dans cette passe. Après toute modification de structure (ajout de
> service, nouveau port, nouveau scope commitlint), relancer `pnpm run verify:repo` **et** mettre à
> jour ce `.md` dans le même commit (règle `MAINTENANCE.md`).

Les tests applicatifs (Jest pour NestJS, Pytest pour FastAPI) restent orchestrés par Turborepo
(`pnpm run test`) et sont décrits aux documents dédiés (18). `verify:repo` couvre la cohérence
**structurelle/documentaire**, pas la logique métier.

---

## 9. Mini-rapport d'étape (template)

```markdown
### Rapport — 04 Structure du Monorepo — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Nombre de workspaces pnpm** : 32 (3 apps + 15 services + 14 packages)
- **Commande `pnpm install`** : ✅ Sans erreur / ❌ Erreurs
- **Commande `pnpm run check-types`** : ✅ Passe / ❌ Échoue
- **Docker Compose** : ✅ 8/8 conteneurs healthy
- **Difficultés rencontrées** :
  - [ex: Husky ne trouvait pas le .git car il est dans le dossier parent]
  - [ex: eslint-plugin-react demande ESLint 9 mais on a ESLint 10]
- **Solutions trouvées** :
  - [ex: script prepare modifié : cd .. && husky nina-aes-platform/.husky]
  - [ex: warning ignoré — pas de breaking change constaté]
- **Décisions prises** :
  - [ex: les services FastAPI ont un package.json minimal pour pnpm]
- **Prochaines actions** :
  - Passer au document 05-INFRASTRUCTURE-DOCKER-COMPOSE.md
  - Ou au document 06-DATABASE-SCHEMA-PRISMA.md si Docker fonctionne déjà
```

---

## 10. Checklist de fin d'étape

### Structure du monorepo

- [ ] Le dossier `apps/` contient 3 applications : `citizen`, `admin`, `governance`
- [ ] Le dossier `services/` contient 15 microservices (13 NestJS + 2 FastAPI), dont `api-gateway`,
      `biometric-service`, `enrollment-service`, `ussd-service`
- [ ] Le dossier `packages/` contient au minimum : `shared-types`, `database`, `config`, `utils`,
      `ui`, `eslint-config`, `typescript-config`
- [ ] `pnpm-workspace.yaml` inclut `"apps/*"`, `"packages/*"`, `"services/*"`
- [ ] `pnpm install` s'exécute sans erreur et résout les 32 workspaces (3 apps + 15 services + 14
      packages)

### Configuration Turborepo

- [ ] `turbo.json` définit les tâches : `build`, `dev`, `lint`, `check-types`, `test`, `clean`,
      `db:*`
- [ ] `pnpm run check-types` passe sur au moins l'app `citizen`
- [ ] `pnpm run dev:citizen` lance le serveur de dev sur le port 4001

### Qualité de code

- [ ] `.husky/pre-commit` vérifie le formatage et le lint
- [ ] `.husky/commit-msg` valide le format Conventional Commits
- [ ] `commitlint.config.cjs` contient tous les scopes (api-gateway, biometrics, ussd, … alignés sur
      les workspaces réels)
- [ ] `.editorconfig` définit les conventions (2 espaces TS, 4 espaces Python, tab Makefile)
- [ ] `.prettierrc` configure : single quotes, trailing commas, 90 chars, LF

### Infrastructure

- [ ] `docker-compose.dev.yml` lance 8 conteneurs (postgres, redis, rabbitmq, minio, elasticsearch,
      keycloak, vault, maildev)
- [ ] `docker compose -f docker-compose.dev.yml ps` affiche tous les conteneurs en état « healthy »
- [ ] `scripts/init-db.sql` active les 4 extensions PostgreSQL (uuid-ossp, pgcrypto, pg_trgm,
      unaccent)
- [ ] `.env.example` est présent et documenté (70+ variables)
- [ ] `.env` est créé à partir de `.env.example` et est dans le `.gitignore`

### Packages partagés

- [ ] `packages/shared-types` exporte : `NinaSexe`, `UserRole`, `CorrectionStatus`,
      `AiConfidenceLevel`, `VulnerabilityCategory`, `AesCountry`, `AuditAction`, `Citizen`,
      `AuditLogEntry`, `ApiResponse<T>`, `PaginatedResponse<T>`
- [ ] `packages/config` exporte : `baseEnvSchema`, `validateEnv<T>()`, `z`
- [ ] `packages/utils` exporte : `validateNina()`, `parseNina()`, `computeControlLetter()`,
      `computeMerkleHash()`, `verifyMerkleChain()`, `cn()`
- [ ] `packages/database` exporte le client Prisma singleton

### Microservices scaffolds

- [ ] Chaque service NestJS a : `main.ts` (bootstrap + ValidationPipe), `app.module.ts`,
      `app.controller.ts` (/health)
- [ ] Chaque service NestJS écoute sur son port assigné (3001 à 3011)
- [ ] Les 2 services FastAPI ont : `app/main.py` (FastAPI + CORS + /health), `app/config.py`
- [ ] Le `Makefile` contient au minimum 20 cibles (help, install, dev, build, test, lint, format,
      clean, docker-_, db-_, init)

### Documentation

- [ ] Fichier `docs/adr/ADR-009-monorepo-turborepo.md` créé
- [ ] Commit Git : `docs(monorepo): add 04-MONOREPO-STRUCTURE.md`
- [ ] Mini-rapport rédigé
- [ ] `pnpm run verify:repo` passe (validate:data + validate:schemas + docs:sync:check)
- [ ] Aucun secret en clair dans les fichiers commités (pas de `JWT_SECRET` codé en dur, pas de CORS
      `*` + credentials)

---

## 11. Pour aller plus loin

### Lectures recommandées

- **Turborepo Handbook** (https://turborepo.dev/docs/crafting-your-repository) — Guide officiel de
  structuration d'un monorepo. Explique les concepts de task graph, caching, et remote cache.
- **pnpm Workspaces** (https://pnpm.io/workspaces) — Documentation officielle des workspaces pnpm.
  Détaille les protocoles `workspace:*` et `catalog:`.
- **Conventional Commits Specification** (https://www.conventionalcommits.org/) — La spécification
  complète du format de commit utilisé dans ce projet.
- **Monorepo Tools** (https://monorepo.tools/) — Comparatif des outils monorepo (Turborepo, Nx,
  Lerna, Rush). Explique pourquoi Turborepo est le meilleur choix pour un projet TypeScript.

### Alternatives techniques considérées

| Alternative                           | Pourquoi elle n'a pas été retenue                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nx** au lieu de Turborepo           | Nx est plus puissant (generators, affected graph, distributed task execution) mais plus complexe à configurer. Turborepo est plus simple, mieux intégré à Vercel, et suffisant pour un projet universitaire.   |
| **Multi-repo** (un dépôt par service) | Cohérence inter-services impossible sans publication npm. Chaque modification de `Citizen` nécessiterait un cycle publish → update dans 11 repos. Overhead opérationnel disproportionné pour un étudiant seul. |
| **Lerna**                             | Historiquement populaire mais moins performant que Turborepo (pas de cache de tâches intelligent, pas de parallélisation basée sur le graphe de dépendances). Lerna est désormais maintenu par Nx.             |
| **npm workspaces** au lieu de pnpm    | npm workspaces fonctionnent mais sont plus lents et consomment plus d'espace disque. pnpm utilise un content-addressable store qui déduplique les dépendances au niveau du disque dur.                         |
| **yarn workspaces**                   | Performant mais Corepack favorise pnpm pour les projets Node.js modernes. L'écosystème pnpm est mieux intégré à Turborepo.                                                                                     |

### ADR-009 — Monorepo Turborepo

L'Architecture Decision Record de cette étape est créé dans
`docs/adr/ADR-009-monorepo-turborepo.md`.

---

_Document 04 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
