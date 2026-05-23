# 01 — Fondations Monorepo & Outillage DX

> **Bloc concerné** : A — NINA Mali (P0) **Prérequis** : Aucun (premier document de la série)
> **Durée estimée** : 4 à 6 heures pour un étudiant seul **Livrables de cette étape** :
>
> - Monorepo restructuré avec les dossiers `services/`, `infrastructure/`, `ai-models/`, `scripts/`,
>   `.github/workflows/`
> - `pnpm-workspace.yaml` étendu pour inclure `services/*`
> - `turbo.json` enrichi avec les tâches backend (`start:dev`, `test`, `db:migrate`, etc.)
> - Husky + lint-staged configurés (hooks pre-commit)
> - Makefile avec commandes courantes
> - `.env.example` documenté à la racine et par service
> - `.editorconfig` pour la cohérence cross-IDE
> - `package.json` racine mis à jour (pnpm 10, Node 24, scripts)
> - Pipeline CI GitHub Actions (lint + check-types + build)
> - Premier commit propre avec convention Conventional Commits

---

## 1. Objectif pédagogique

Avant d'écrire la moindre ligne de code métier, il faut **fonder correctement le monorepo**. Un
monorepo mal structuré dès le départ génère une dette technique qui ralentit chaque étape suivante.
Cette première étape pose les rails sur lesquels tout le reste roulera.

**Ce qu'on apprend :**

- Comment structurer un monorepo Turborepo pour un projet mixte (Next.js + NestJS + FastAPI)
- Pourquoi les hooks Git (Husky) empêchent les erreurs _avant_ qu'elles n'atteignent le dépôt
- Comment un Makefile simplifie la vie quotidienne du développeur
- Pourquoi les variables d'environnement ne doivent **jamais** être commitées en clair
- Comment GitHub Actions automatise la vérification du code à chaque push

**Ce qu'on construit :**

- La coquille vide mais solide de chaque futur microservice
- L'outillage de qualité (linting, formatting, hooks) qui protège le code
- Le pipeline CI qui vérifie automatiquement chaque contribution

---

## 2. Technologies utilisées (avec versions à jour)

| Technologie    | Version     | Rôle dans cette étape                                  | Documentation officielle                   |
| -------------- | ----------- | ------------------------------------------------------ | ------------------------------------------ |
| Node.js        | 24.14.1 LTS | Runtime JavaScript/TypeScript                          | https://nodejs.org/docs/latest-v24.x/api/  |
| pnpm           | 10.12.1     | Gestionnaire de paquets rapide, adapté monorepo        | https://pnpm.io/fr/                        |
| Turborepo      | 2.9.4       | Orchestrateur de tâches monorepo avec cache            | https://turbo.build/repo/docs              |
| TypeScript     | 5.9.2       | Typage statique                                        | https://www.typescriptlang.org/docs/       |
| Husky          | 9.1.7       | Hooks Git (pre-commit, commit-msg)                     | https://typicode.github.io/husky/          |
| lint-staged    | 16.1.0      | Exécute les linters uniquement sur les fichiers stagés | https://github.com/lint-staged/lint-staged |
| commitlint     | 19.8.1      | Valide le format des messages de commit                | https://commitlint.js.org/                 |
| Prettier       | 3.7.4       | Formatage automatique du code                          | https://prettier.io/docs/en/               |
| ESLint         | 9.39.1      | Analyse statique du code                               | https://eslint.org/docs/latest/            |
| GitHub Actions | N/A         | Pipeline CI/CD                                         | https://docs.github.com/en/actions         |
| Make (GNU)     | 4.x         | Automatisation des commandes courantes                 | https://www.gnu.org/software/make/manual/  |

---

## 3. Architecture / Schéma

```
nina-aes-platform-UQAR/                 ← RACINE MONOREPO
│
├── .github/workflows/                   ← CI/CD GitHub Actions
│   └── ci.yml                           ← Pipeline lint + types + build
│
├── .husky/                              ← Hooks Git
│   ├── pre-commit                       ← Lint-staged avant chaque commit
│   └── commit-msg                       ← Commitlint sur le message
│
├── apps/                                ← APPLICATIONS FRONTEND
│   ├── citizen/                         ← Portail citoyen (Next.js 16)
│   ├── admin/                           ← Dashboard admin (Next.js 16)
│   └── governance/                      ← Portail gouvernance (Next.js 16)
│
├── services/                            ← MICROSERVICES BACKEND
│   ├── identity-service/                ← Port 3001 (NestJS)
│   ├── auth-service/                    ← Port 3002 (NestJS)
│   ├── ai-service/                      ← Port 3003 (FastAPI)
│   ├── document-service/                ← Port 3004 (NestJS)
│   ├── notification-service/            ← Port 3005 (NestJS)
│   ├── interop-service/                 ← Port 3006 (NestJS)
│   ├── audit-service/                   ← Port 3007 (NestJS)
│   ├── appointment-service/             ← Port 3008 (NestJS)
│   ├── anticorruption-service/          ← Port 3009 (FastAPI)
│   ├── governance-service/              ← Port 3010 (NestJS)
│   └── vulnerability-service/           ← Port 3011 (NestJS)
│
├── packages/                            ← PACKAGES PARTAGÉS
│   ├── shared-types/                    ← Enums, interfaces, DTOs
│   ├── database/                        ← Prisma schema + client
│   ├── config/                          ← Validation Zod des env vars
│   ├── utils/                           ← Helpers NINA, Merkle hash
│   ├── ui/                              ← Composants React partagés
│   ├── eslint-config/                   ← Config ESLint partagée
│   └── typescript-config/               ← Config TypeScript partagée
│
├── infrastructure/                      ← INFRA-AS-CODE
│   ├── docker/                          ← Dockerfiles par service
│   ├── k3s/                             ← Manifests Kubernetes
│   ├── helm/                            ← Charts Helm
│   └── terraform/                       ← Terraform (cloud souverain)
│
├── ai-models/                           ← DONNÉES IA
│   ├── datasets/                        ← Datasets synthétiques
│   ├── models/                          ← Modèles entraînés (.pkl, .joblib)
│   └── notebooks/                       ← Jupyter notebooks d'exploration
│
├── docs/                                ← DOCUMENTATION TECHNIQUE
│   ├── architecture/                    ← ADRs, diagrammes
│   ├── api/                             ← Specs OpenAPI
│   └── guides/                          ← Guides pas-à-pas
│
├── scripts/                             ← SCRIPTS D'AUTOMATISATION
│   ├── setup.sh                         ← Setup initial (Bash/WSL)
│   └── setup.ps1                        ← Setup initial (PowerShell)
│
├── .editorconfig                        ← Cohérence cross-IDE
├── .env.example                         ← Template des variables d'env
├── .gitignore                           ← Mise à jour pour le projet complet
├── commitlint.config.js                 ← Config Conventional Commits
├── Makefile                             ← Commandes make courantes
├── package.json                         ← Racine monorepo
├── pnpm-workspace.yaml                  ← Workspaces pnpm
└── turbo.json                           ← Config Turborepo
```

---

## 4. Étapes d'implémentation (numérotées)

### Étape 4.1 — Créer l'arborescence des dossiers manquants

**Pourquoi** : Le repo actuel ne contient que `apps/web`, `apps/docs` et trois packages basiques. Il
faut créer la structure cible complète avant d'y installer quoi que ce soit.

**Commandes CLI à exécuter (dans l'ordre)** :

```bash
# Se placer à la racine du monorepo
cd C:\Users\lonel\Claude\nina-aes-platform-UQAR\nina-aes-platform-UQAR

# --- APPLICATIONS FRONTEND ---
# Renommer apps/web → apps/citizen (ce sera le portail citoyen)
mv apps/web apps/citizen

# Renommer apps/docs → apps/admin (ce sera le dashboard admin)
mv apps/docs apps/admin

# Créer l'app governance (on la scaffoldera plus tard)
mkdir -p apps/governance

# --- MICROSERVICES BACKEND ---
# Créer les 11 dossiers de services avec un fichier README chacun
mkdir -p services/identity-service
mkdir -p services/auth-service
mkdir -p services/ai-service
mkdir -p services/document-service
mkdir -p services/notification-service
mkdir -p services/interop-service
mkdir -p services/audit-service
mkdir -p services/appointment-service
mkdir -p services/anticorruption-service
mkdir -p services/governance-service
mkdir -p services/vulnerability-service

# --- PACKAGES PARTAGÉS MANQUANTS ---
mkdir -p packages/shared-types/src
mkdir -p packages/database/prisma
mkdir -p packages/config/src
mkdir -p packages/utils/src

# --- INFRASTRUCTURE ---
mkdir -p infrastructure/docker
mkdir -p infrastructure/k3s
mkdir -p infrastructure/helm
mkdir -p infrastructure/terraform

# --- IA ---
mkdir -p ai-models/datasets
mkdir -p ai-models/models
mkdir -p ai-models/notebooks

# --- DOCUMENTATION ---
mkdir -p docs/architecture
mkdir -p docs/api
mkdir -p docs/guides

# --- SCRIPTS ---
mkdir -p scripts

# --- GITHUB ACTIONS ---
mkdir -p .github/workflows
```

---

### Étape 4.2 — Mettre à jour le package.json racine

**Pourquoi** : Le `package.json` actuel utilise pnpm 9.0.0 et Node >=18. On cible pnpm 10 et Node 24
LTS. On ajoute aussi les scripts nécessaires pour le workflow quotidien.

**Fichier à modifier** : `package.json` (racine)

```json
{
  "name": "nina-aes-platform-uqar",
  "version": "0.1.0",
  "private": true,
  "description": "Système Sécurisé de Gestion d'Identité Numérique pour l'AES (Alliance des États du Sahel)",
  "author": "Étudiant UQAR",
  "license": "UNLICENSED",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "dev:citizen": "turbo run dev --filter=citizen",
    "dev:admin": "turbo run dev --filter=admin",
    "dev:governance": "turbo run dev --filter=governance",
    "dev:services": "turbo run start:dev --filter='./services/*'",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,css}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,css}\"",
    "check-types": "turbo run check-types",
    "test": "turbo run test",
    "test:cov": "turbo run test:cov",
    "db:migrate": "turbo run db:migrate --filter=@nina-aes/database",
    "db:generate": "turbo run db:generate --filter=@nina-aes/database",
    "db:seed": "turbo run db:seed --filter=@nina-aes/database",
    "clean": "turbo run clean && rm -rf node_modules",
    "prepare": "husky"
  },
  "devDependencies": {
    "@commitlint/cli": "^19.8.1",
    "@commitlint/config-conventional": "^19.8.1",
    "husky": "^9.1.7",
    "lint-staged": "^16.1.0",
    "prettier": "^3.7.4",
    "turbo": "^2.9.4",
    "typescript": "5.9.2"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,yml,yaml}": ["prettier --write"]
  },
  "packageManager": "pnpm@10.12.1",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=10.0.0"
  }
}
```

---

### Étape 4.3 — Mettre à jour pnpm-workspace.yaml

**Pourquoi** : Le workspace actuel ne connaît que `apps/*` et `packages/*`. Les microservices dans
`services/*` doivent aussi être des workspaces pnpm pour bénéficier du hoisting et des liens
symboliques.

**Fichier à modifier** : `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'services/*'
```

---

### Étape 4.4 — Enrichir turbo.json

**Pourquoi** : Le `turbo.json` actuel ne définit que `build`, `lint`, `check-types` et `dev`. Les
microservices NestJS ont besoin de `start:dev`, `test`, `test:cov`, `db:migrate`, etc.

**Fichier à modifier** : `turbo.json`

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "lint:fix": {
      "dependsOn": ["^lint:fix"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "start:dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "test/**", "*.config.*"],
      "outputs": ["coverage/**"]
    },
    "test:cov": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    },
    "db:seed": {
      "cache": false,
      "dependsOn": ["db:migrate"]
    }
  }
}
```

---

### Étape 4.5 — Mettre à jour le package.json de apps/citizen

**Pourquoi** : On a renommé `apps/web` → `apps/citizen`. Le `name` dans le `package.json` doit
refléter ce changement, et le port doit être 3000 (portail citoyen).

**Fichier à modifier** : `apps/citizen/package.json`

Modifier **uniquement** le champ `name` :

```json
{
  "name": "citizen",
  "...": "le reste ne change pas"
}
```

---

### Étape 4.6 — Mettre à jour le package.json de apps/admin

**Pourquoi** : On a renommé `apps/docs` → `apps/admin`. Le `name` doit refléter ce changement. Le
port reste 3001 temporairement (il sera changé quand on ajoutera l'identity-service qui utilise
aussi 3001 — on le résoudra au document 04).

**Fichier à modifier** : `apps/admin/package.json`

Modifier **uniquement** le champ `name` :

```json
{
  "name": "admin",
  "...": "le reste ne change pas"
}
```

> **Note** : Le port 3001 de l'app admin entrera en conflit avec l'identity-service plus tard. On le
> changera en 3100 au document 04. Pour l'instant, on garde la configuration existante.

---

### Étape 4.7 — Créer le .editorconfig

**Pourquoi** : Garantir que tous les éditeurs de texte (VS Code, Vim, IntelliJ) utilisent les mêmes
conventions : indentation par espaces (2 pour TS/JS, 4 pour Python), fin de ligne LF (Linux-style),
encodage UTF-8.

**Fichier à créer** : `.editorconfig` (racine)

```ini
# EditorConfig — Cohérence cross-IDE pour NINA-AES Platform
# https://editorconfig.org

root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.{py,pyi}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab

[*.{yml,yaml}]
indent_size = 2

[*.prisma]
indent_size = 2
```

---

### Étape 4.8 — Créer le .env.example

**Pourquoi** : Les variables d'environnement contiennent des secrets (mots de passe, clés API). On
ne commite **jamais** le fichier `.env` réel, mais on commite un `.env.example` qui documente toutes
les variables nécessaires avec des valeurs fictives. Chaque développeur copie ce fichier en `.env`
et y met ses vraies valeurs.

**Fichier à créer** : `.env.example` (racine)

```bash
# ============================================================================
# NINA-AES Platform — Variables d'environnement
# ============================================================================
# INSTRUCTIONS :
#   1. Copier ce fichier : cp .env.example .env
#   2. Remplacer les valeurs par vos propres secrets
#   3. NE JAMAIS commiter le fichier .env
# ============================================================================

# --- Base de données PostgreSQL ---
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=nina_admin
POSTGRES_PASSWORD=CHANGER_CE_MOT_DE_PASSE
POSTGRES_DB=nina_aes_db
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public

# --- Redis ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGER_CE_MOT_DE_PASSE_REDIS

# --- RabbitMQ ---
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_USER=nina_rabbit
RABBITMQ_PASSWORD=CHANGER_CE_MOT_DE_PASSE_RABBIT

# --- Keycloak ---
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=nina-aes
KEYCLOAK_CLIENT_ID=nina-platform
KEYCLOAK_CLIENT_SECRET=CHANGER_CE_SECRET_KEYCLOAK
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=CHANGER_CE_MOT_DE_PASSE_KEYCLOAK

# --- JWT ---
JWT_SECRET=CHANGER_CETTE_CLE_SECRETE_JWT_RS256
JWT_EXPIRATION=3600
JWT_REFRESH_EXPIRATION=86400

# --- Elasticsearch ---
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=CHANGER_CE_MOT_DE_PASSE_ELASTIC

# --- MinIO (Stockage objet) ---
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=nina_minio_admin
MINIO_SECRET_KEY=CHANGER_CE_MOT_DE_PASSE_MINIO
MINIO_BUCKET=nina-documents

# --- Africa's Talking (USSD / SMS) ---
AT_API_KEY=SANDBOX_KEY_POUR_TESTS
AT_USERNAME=sandbox
AT_USSD_CODE=*123*NINA#

# --- Services (ports) ---
IDENTITY_SERVICE_PORT=3001
AUTH_SERVICE_PORT=3002
AI_SERVICE_PORT=3003
DOCUMENT_SERVICE_PORT=3004
NOTIFICATION_SERVICE_PORT=3005
INTEROP_SERVICE_PORT=3006
AUDIT_SERVICE_PORT=3007
APPOINTMENT_SERVICE_PORT=3008
ANTICORRUPTION_SERVICE_PORT=3009
GOVERNANCE_SERVICE_PORT=3010
VULNERABILITY_SERVICE_PORT=3011

# --- Frontend (ports) ---
CITIZEN_PORT=3000
ADMIN_PORT=3100
GOVERNANCE_PORT=3200

# --- Environnement ---
NODE_ENV=development
LOG_LEVEL=debug
```

---

### Étape 4.9 — Mettre à jour le .gitignore

**Pourquoi** : Le `.gitignore` actuel est celui par défaut de `create-turbo`. Il faut l'enrichir
pour couvrir les fichiers Python (IA), les secrets, les artefacts Docker, les modèles ML, etc.

**Fichier à modifier** : `.gitignore` (racine)

```gitignore
# ============================================================================
# NINA-AES Platform — .gitignore
# ============================================================================

# --- Dépendances ---
node_modules/
.pnpm-store/
__pycache__/
*.pyc
.venv/
venv/

# --- Build ---
dist/
.next/
out/
build/
*.tsbuildinfo

# --- Environnement (SECRETS — NE JAMAIS COMMITER) ---
.env
.env.local
.env.*.local
!.env.example

# --- IDE ---
.idea/
.vscode/
*.swp
*.swo
*~
.DS_Store
Thumbs.db

# --- Tests ---
coverage/
.nyc_output/
*.lcov
htmlcov/
.pytest_cache/

# --- Docker ---
docker-compose.override.yml

# --- Turborepo ---
.turbo/

# --- IA / ML ---
ai-models/models/*.pkl
ai-models/models/*.joblib
ai-models/models/*.h5
ai-models/models/*.pt
*.onnx

# --- Logs ---
logs/
*.log
npm-debug.log*
pnpm-debug.log*

# --- OS ---
.DS_Store
Thumbs.db
Desktop.ini

# --- Prisma ---
packages/database/prisma/*.db
packages/database/prisma/migrations/*.sql.bak

# --- Certificates (NE JAMAIS COMMITER) ---
*.pem
*.key
*.crt
*.p12
!infrastructure/k3s/README.md
```

---

### Étape 4.10 — Installer et configurer Husky + lint-staged + commitlint

**Pourquoi** : Husky intercepte chaque `git commit` pour exécuter automatiquement :

1. **lint-staged** : vérifie et formate uniquement les fichiers modifiés (pas tout le repo)
2. **commitlint** : vérifie que le message de commit suit le format Conventional Commits (`feat:`,
   `fix:`, `docs:`, etc.)

Cela empêche les erreurs de code et les messages de commit incohérents d'entrer dans l'historique
Git.

**Commandes CLI à exécuter** :

```bash
# Se placer à la racine du monorepo
cd C:\Users\lonel\Claude\nina-aes-platform-UQAR\nina-aes-platform-UQAR

# Installer les dépendances dev (déjà dans package.json étape 4.2)
pnpm install

# Initialiser Husky (crée le dossier .husky/)
pnpm exec husky init
```

**Fichier à créer** : `.husky/pre-commit`

```bash
# Hook pre-commit — Exécute lint-staged sur les fichiers stagés
# Si un fichier ne passe pas le linting ou le formatage, le commit est bloqué
pnpm exec lint-staged
```

**Fichier à créer** : `.husky/commit-msg`

```bash
# Hook commit-msg — Vérifie le format du message de commit
# Format attendu : type(scope): description
# Exemples valides : feat(identity): ajouter endpoint de recherche NINA
#                    fix(auth): corriger expiration token JWT
#                    docs: mettre à jour le README
pnpm exec commitlint --edit $1
```

**Fichier à créer** : `commitlint.config.js` (racine)

```javascript
/**
 * @file        commitlint.config.js
 * @description Configuration de commitlint pour le projet NINA-AES Platform.
 *              Impose le format Conventional Commits sur tous les messages de commit.
 *              Voir : https://www.conventionalcommits.org/fr/v1.0.0/
 * @author      Étudiant UQAR
 * @date        2026
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types autorisés pour les messages de commit
    'type-enum': [
      2, // Niveau erreur (bloque le commit)
      'always',
      [
        'feat', // Nouvelle fonctionnalité
        'fix', // Correction de bug
        'docs', // Documentation uniquement
        'style', // Formatage, points-virgules manquants, etc. (pas de changement logique)
        'refactor', // Refactorisation du code (ni feat, ni fix)
        'perf', // Amélioration de performance
        'test', // Ajout ou correction de tests
        'build', // Changements au système de build ou dépendances externes
        'ci', // Changements aux fichiers de CI
        'chore', // Autres changements qui ne modifient pas src ou test
        'revert', // Annule un commit précédent
      ],
    ],
    // Scopes autorisés (noms des services et packages)
    'scope-enum': [
      1, // Niveau avertissement (ne bloque pas)
      'always',
      [
        'identity', // identity-service
        'auth', // auth-service
        'ai', // ai-service
        'document', // document-service
        'notification', // notification-service
        'interop', // interop-service
        'audit', // audit-service
        'appointment', // appointment-service
        'anticorruption', // anticorruption-service
        'governance', // governance-service
        'vulnerability', // vulnerability-service
        'citizen', // app citizen
        'admin', // app admin
        'gov', // app governance
        'mobile', // app mobile
        'kiosk', // app kiosk
        'shared-types', // package shared-types
        'database', // package database
        'config', // package config
        'utils', // package utils
        'ui', // package ui
        'infra', // infrastructure
        'ci', // CI/CD
        'deps', // dépendances
        'monorepo', // configuration monorepo
      ],
    ],
    // Le sujet ne doit pas dépasser 100 caractères
    'subject-max-length': [2, 'always', 100],
  },
};
```

---

### Étape 4.11 — Créer le Makefile

**Pourquoi** : Un Makefile permet de regrouper les commandes les plus fréquentes derrière des noms
courts. Au lieu de taper `pnpm --filter identity-service run start:dev`, on tape
`make dev-identity`. C'est plus rapide, plus lisible, et ça documente les commandes disponibles.

> **Note Windows** : `make` n'est pas installé par défaut sous Windows. Il est disponible via Git
> Bash (qui est installé avec Git pour Windows), via WSL, ou via `choco install make`. Les commandes
> ci-dessous fonctionnent dans Git Bash.

**Fichier à créer** : `Makefile` (racine)

```makefile
# ============================================================================
# NINA-AES Platform — Makefile
# ============================================================================
# Usage : make <commande>
# Exemples : make install, make dev, make dev-citizen, make lint
# ============================================================================

.PHONY: help install dev dev-citizen dev-admin dev-governance dev-services \
        build lint format test clean docker-up docker-down db-migrate db-seed

# Affiche l'aide (commande par défaut)
help: ## Afficher cette aide
	@echo ""
	@echo "  NINA-AES Platform — Commandes disponibles"
	@echo "  =========================================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# --- Installation ---
install: ## Installer toutes les dépendances (pnpm install)
	pnpm install

# --- Développement ---
dev: ## Lancer tout en mode dev (frontend + backend)
	pnpm run dev

dev-citizen: ## Lancer le portail citoyen (port 3000)
	pnpm run dev:citizen

dev-admin: ## Lancer le dashboard admin (port 3100)
	pnpm run dev:admin

dev-governance: ## Lancer le portail gouvernance (port 3200)
	pnpm run dev:governance

dev-services: ## Lancer tous les microservices backend
	pnpm run dev:services

# --- Build ---
build: ## Construire tous les packages et apps
	pnpm run build

# --- Qualité du code ---
lint: ## Vérifier le code avec ESLint
	pnpm run lint

lint-fix: ## Corriger automatiquement les erreurs ESLint
	pnpm run lint:fix

format: ## Formater le code avec Prettier
	pnpm run format

format-check: ## Vérifier le formatage sans modifier
	pnpm run format:check

check-types: ## Vérifier les types TypeScript
	pnpm run check-types

# --- Tests ---
test: ## Lancer tous les tests
	pnpm run test

test-cov: ## Lancer les tests avec couverture de code
	pnpm run test:cov

# --- Base de données ---
db-migrate: ## Exécuter les migrations Prisma
	pnpm run db:migrate

db-generate: ## Générer le client Prisma
	pnpm run db:generate

db-seed: ## Peupler la base de données avec les données initiales
	pnpm run db:seed

# --- Docker ---
docker-up: ## Démarrer l'infrastructure Docker (PostgreSQL, Redis, RabbitMQ, etc.)
	docker compose -f infrastructure/docker/docker-compose.yml up -d

docker-down: ## Arrêter l'infrastructure Docker
	docker compose -f infrastructure/docker/docker-compose.yml down

docker-logs: ## Voir les logs Docker
	docker compose -f infrastructure/docker/docker-compose.yml logs -f

# --- Nettoyage ---
clean: ## Supprimer tous les artefacts de build et caches
	pnpm run clean
	rm -rf node_modules/.cache
	rm -rf .turbo
```

---

### Étape 4.12 — Créer le fichier .prettierrc

**Pourquoi** : Prettier formate automatiquement le code pour garantir un style uniforme dans tout le
projet. Sans configuration explicite, chaque contributeur pourrait avoir ses propres préférences.

**Fichier à créer** : `.prettierrc` (racine)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "plugins": [],
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "printWidth": 120
      }
    }
  ]
}
```

**Fichier à créer** : `.prettierignore` (racine)

```
node_modules
.next
dist
build
coverage
.turbo
pnpm-lock.yaml
ai-models/models
infrastructure/terraform/.terraform
```

---

### Étape 4.13 — Créer le pipeline CI GitHub Actions

**Pourquoi** : GitHub Actions exécute automatiquement le linting, la vérification des types et le
build à chaque push ou pull request. Si le code ne passe pas ces vérifications, la PR est bloquée.
C'est un filet de sécurité qui fonctionne même quand le développeur oublie de lancer les
vérifications localement.

**Fichier à créer** : `.github/workflows/ci.yml`

```yaml
# ============================================================================
# NINA-AES Platform — Pipeline CI
# ============================================================================
# Déclenché à chaque push et pull request sur main et develop.
# Vérifie : lint, types TypeScript, build de toutes les apps et packages.
# ============================================================================

name: CI — Lint, Types & Build

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

# Annuler les exécutions en cours si un nouveau push arrive sur la même branche
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Qualité du code
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      # 1. Récupérer le code source
      - name: Checkout du dépôt
        uses: actions/checkout@v4

      # 2. Installer pnpm
      - name: Installer pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      # 3. Installer Node.js avec cache pnpm
      - name: Installer Node.js 24 LTS
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'

      # 4. Installer les dépendances
      - name: Installer les dépendances
        run: pnpm install --frozen-lockfile

      # 5. Vérifier le formatage Prettier
      - name: Vérifier le formatage
        run: pnpm run format:check

      # 6. Lancer ESLint
      - name: Lint (ESLint)
        run: pnpm run lint

      # 7. Vérifier les types TypeScript
      - name: Vérification des types
        run: pnpm run check-types

      # 8. Build complet
      - name: Build
        run: pnpm run build
```

---

### Étape 4.14 — Créer les fichiers README placeholder pour chaque service

**Pourquoi** : Git ne suit pas les dossiers vides. Chaque dossier de service a besoin d'au moins un
fichier pour exister dans le repo. Un `README.md` sert à la fois de marqueur et de documentation
future.

**Commande CLI** :

```bash
cd C:\Users\lonel\Claude\nina-aes-platform-UQAR\nina-aes-platform-UQAR

# Créer un README pour chaque service avec son nom, port et stack
for service in identity-service:3001:NestJS auth-service:3002:NestJS ai-service:3003:FastAPI \
  document-service:3004:NestJS notification-service:3005:NestJS interop-service:3006:NestJS \
  audit-service:3007:NestJS appointment-service:3008:NestJS anticorruption-service:3009:FastAPI \
  governance-service:3010:NestJS vulnerability-service:3011:NestJS; do
  IFS=':' read -r name port stack <<< "$service"
  cat > "services/$name/README.md" << EOF
# $name

> **Port** : $port
> **Stack** : $stack
> **Status** : À implémenter

## Description

Ce microservice fait partie de la NINA-AES Platform.
Voir la documentation complète dans \`docs/\`.
EOF
done
```

---

### Étape 4.15 — Créer les packages partagés manquants (placeholder)

**Pourquoi** : Les packages `shared-types`, `database`, `config` et `utils` seront développés au
Document 03. Pour l'instant, on crée leurs `package.json` minimaux pour que pnpm et Turborepo les
reconnaissent.

**Fichier à créer** : `packages/shared-types/package.json`

```json
{
  "name": "@nina-aes/shared-types",
  "version": "0.0.1",
  "private": true,
  "description": "Types TypeScript partagés — enums, interfaces, DTOs pour la NINA-AES Platform",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "check-types": "tsc --noEmit",
    "lint": "eslint ."
  },
  "devDependencies": {
    "typescript": "5.9.2"
  }
}
```

**Fichier à créer** : `packages/shared-types/src/index.ts`

```typescript
/**
 * @file        index.ts
 * @description Point d'entrée du package @nina-aes/shared-types.
 *              Exporte tous les types, enums et interfaces partagés
 *              entre les microservices et les applications frontend.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/shared-types
 */

// Les types seront ajoutés au Document 03
export {};
```

**Fichier à créer** : `packages/shared-types/tsconfig.json`

```json
{
  "extends": "@nina-aes/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Fichier à créer** : `packages/database/package.json`

```json
{
  "name": "@nina-aes/database",
  "version": "0.0.1",
  "private": true,
  "description": "Schema Prisma et client de base de données pour la NINA-AES Platform",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "check-types": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.9.2"
  }
}
```

**Fichier à créer** : `packages/config/package.json`

```json
{
  "name": "@nina-aes/config",
  "version": "0.0.1",
  "private": true,
  "description": "Validation Zod des variables d'environnement pour la NINA-AES Platform",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "check-types": "tsc --noEmit",
    "lint": "eslint ."
  },
  "devDependencies": {
    "typescript": "5.9.2"
  }
}
```

**Fichier à créer** : `packages/utils/package.json`

```json
{
  "name": "@nina-aes/utils",
  "version": "0.0.1",
  "private": true,
  "description": "Utilitaires partagés — validation NINA, Merkle hash, helpers divers",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "jest",
    "lint": "eslint ."
  },
  "devDependencies": {
    "typescript": "5.9.2"
  }
}
```

Mettre à jour aussi le `name` du package `ui` existant :

**Fichier à modifier** : `packages/ui/package.json`

Changer le `name` de `"@repo/ui"` à `"@nina-aes/ui"`.

De même pour `packages/eslint-config/package.json` : changer `"@repo/eslint-config"` à
`"@nina-aes/eslint-config"`.

Et `packages/typescript-config/package.json` : changer `"@repo/typescript-config"` à
`"@nina-aes/typescript-config"`.

> **Important** : Après avoir renommé les packages, il faut aussi mettre à jour toutes les
> références dans les fichiers qui les importent (`apps/citizen/package.json`,
> `apps/admin/package.json`, etc.).

---

### Étape 4.16 — Mettre à jour les références de packages dans les apps

**Pourquoi** : En renommant les packages de `@repo/*` à `@nina-aes/*`, toutes les dépendances qui
référencent `@repo/ui`, `@repo/eslint-config` ou `@repo/typescript-config` doivent être mises à
jour.

**Fichiers à modifier** :

Dans `apps/citizen/package.json`, remplacer :

- `"@repo/ui"` → `"@nina-aes/ui"`
- `"@repo/eslint-config"` → `"@nina-aes/eslint-config"`
- `"@repo/typescript-config"` → `"@nina-aes/typescript-config"`

Même chose dans `apps/admin/package.json`.

Dans `apps/citizen/tsconfig.json` et `apps/admin/tsconfig.json`, si `@repo/typescript-config` est
référencé dans `extends`, remplacer par `@nina-aes/typescript-config`.

Dans `apps/citizen/eslint.config.js` et `apps/admin/eslint.config.js`, remplacer les imports
`@repo/eslint-config` par `@nina-aes/eslint-config`.

Dans `packages/ui/package.json`, remplacer les références `@repo/*` par `@nina-aes/*`.

---

### Étape 4.17 — Exécuter pnpm install et vérifier

**Pourquoi** : Après tous ces changements, il faut réinstaller les dépendances pour que pnpm
recalcule les liens symboliques entre les workspaces.

**Commandes CLI** :

```bash
cd C:\Users\lonel\Claude\nina-aes-platform-UQAR\nina-aes-platform-UQAR

# Supprimer le node_modules et le lockfile pour repartir propre
rm -rf node_modules
rm -f pnpm-lock.yaml

# Réinstaller tout
pnpm install

# Vérifier que Turborepo voit bien tous les workspaces
pnpm turbo ls
```

**Sortie attendue** : La commande `pnpm turbo ls` devrait lister tous les packages :

- `citizen`, `admin`
- `@nina-aes/ui`, `@nina-aes/eslint-config`, `@nina-aes/typescript-config`
- `@nina-aes/shared-types`, `@nina-aes/database`, `@nina-aes/config`, `@nina-aes/utils`

---

## 5. Tests de validation

### Test 1 — Vérifier la structure des dossiers

```bash
# Depuis la racine du monorepo
ls apps/          # Doit afficher : admin  citizen  governance
ls services/      # Doit afficher : les 11 dossiers de services
ls packages/      # Doit afficher : config  database  eslint-config  shared-types  typescript-config  ui  utils
ls infrastructure/ # Doit afficher : docker  helm  k3s  terraform
ls ai-models/     # Doit afficher : datasets  models  notebooks
```

### Test 2 — Vérifier que Turborepo fonctionne

```bash
# Build des apps frontend
pnpm run build

# Sortie attendue : build réussi pour citizen et admin
```

### Test 3 — Vérifier Husky

```bash
# Tenter un commit avec un message invalide (doit échouer)
git add .
git commit -m "test invalide"
# Sortie attendue : erreur commitlint — le type est manquant

# Tenter un commit avec un message valide (doit réussir)
git commit -m "chore(monorepo): restructurer le monorepo NINA-AES Platform"
# Sortie attendue : lint-staged s'exécute, commitlint valide, commit créé
```

### Test 4 — Vérifier le formatage

```bash
# Vérifier que Prettier ne trouve rien à corriger
pnpm run format:check

# Si des fichiers ne sont pas formatés, les corriger :
pnpm run format
```

---

## 6. Pièges courants & dépannage

| Symptôme                                             | Cause probable                                     | Solution                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install` échoue avec "unsupported engine"      | Version de Node < 24                               | Installer Node.js 24 LTS via `nvm install 24` ou télécharger depuis nodejs.org                 |
| `pnpm install` échoue avec "packageManager" mismatch | pnpm global n'est pas en version 10                | Exécuter `corepack enable && corepack prepare pnpm@10.12.1 --activate`                         |
| Husky ne se déclenche pas au commit                  | Le hook n'est pas exécutable                       | Sur Git Bash : `chmod +x .husky/pre-commit .husky/commit-msg`                                  |
| `make` commande non trouvée                          | GNU Make non installé sous Windows                 | Installer via `choco install make` ou utiliser Git Bash (inclut make)                          |
| Les imports `@nina-aes/*` échouent                   | Les noms n'ont pas été mis à jour partout          | Vérifier chaque `package.json`, `tsconfig.json` et `eslint.config.js` des apps                 |
| `turbo ls` ne liste pas les services                 | `pnpm-workspace.yaml` ne contient pas `services/*` | Vérifier que la ligne `- "services/*"` est présente                                            |
| Le build de citizen ou admin échoue                  | Références à `@repo/*` subsistent                  | Chercher avec `grep -r "@repo/" apps/` et remplacer par `@nina-aes/`                           |
| `commitlint` rejette le message                      | Le type n'est pas dans la liste autorisée          | Utiliser un des types : feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert |

---

## 7. Documentation à produire après cette étape

Créer le fichier `docs/architecture/adr-001-structure-monorepo.md` :

```markdown
# ADR-001 — Structure du monorepo NINA-AES Platform

## Statut

Accepté — 2026-04-07

## Contexte

Le projet NINA-AES Platform est un système Full-Stack composé de 3 applications frontend, 11
microservices backend, et plusieurs packages partagés. Un seul développeur maintient l'ensemble du
code. La structure doit faciliter la navigation, le build incrémental, et la cohérence des
dépendances.

## Décision

Utilisation d'un monorepo Turborepo avec pnpm workspaces, organisé en 4 zones :

- `apps/` — Applications frontend (Next.js, React Native, Electron)
- `services/` — Microservices backend (NestJS, FastAPI)
- `packages/` — Code partagé (types, database, config, utils, UI, lint, TS config)
- `infrastructure/` — Docker, K3s, Helm, Terraform

## Conséquences

- (+) Un seul `pnpm install` pour tout le projet
- (+) Turborepo cache et parallélise les builds
- (+) Les packages partagés sont liés par symlinks (pas de publish npm)
- (+) Les changements dans `shared-types` invalident automatiquement les builds dépendants
- (-) Le `pnpm-lock.yaml` peut devenir volumineux
- (-) Le CI doit installer toutes les dépendances même pour un changement isolé (atténué par le
  cache Turborepo)

## Alternatives considérées

- Polyrepo (un repo par service) : rejeté car trop de overhead pour un développeur seul
- Nx au lieu de Turborepo : rejeté car Turborepo est plus léger et suffisant
```

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — 01 Fondations Monorepo — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Difficultés rencontrées** :
  - [Décrire ici les problèmes rencontrés]
- **Solutions trouvées** :
  - [Décrire ici comment ils ont été résolus]
- **Prochaines actions** :
  - Passer au Document 02 — Infrastructure Docker
- **Captures jointes** :
  - [ ] Capture de `pnpm turbo ls` montrant tous les workspaces
  - [ ] Capture d'un commit rejeté par commitlint
  - [ ] Capture d'un commit accepté après correction
```

---

## 9. Checklist de fin d'étape

- [ ] Dossiers `services/`, `infrastructure/`, `ai-models/`, `scripts/`, `.github/workflows/`,
      `docs/` créés
- [ ] `package.json` racine mis à jour (pnpm 10, Node 24, scripts)
- [ ] `pnpm-workspace.yaml` inclut `services/*`
- [ ] `turbo.json` enrichi avec tâches backend
- [ ] Apps renommées (`citizen`, `admin`) et packages renommés (`@nina-aes/*`)
- [ ] `.editorconfig` créé
- [ ] `.env.example` créé et documenté
- [ ] `.gitignore` enrichi
- [ ] `.prettierrc` et `.prettierignore` créés
- [ ] Husky + lint-staged + commitlint configurés et fonctionnels
- [ ] `Makefile` créé avec commandes documentées
- [ ] CI GitHub Actions (`ci.yml`) créé
- [ ] READMEs placeholder dans chaque dossier de service
- [ ] Packages partagés placeholder créés (`shared-types`, `database`, `config`, `utils`)
- [ ] `pnpm install` réussit sans erreur
- [ ] `pnpm run build` réussit pour citizen et admin
- [ ] `pnpm turbo ls` liste tous les workspaces
- [ ] ADR-001 rédigé dans `docs/architecture/`
- [ ] Premier commit : `chore(monorepo): restructurer le monorepo NINA-AES Platform`
- [ ] Aucun secret en clair dans le code

---

## 10. Pour aller plus loin

- **Turborepo** : [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching) —
  Partager le cache entre machines (utile si le professeur veut builder)
- **Conventional Commits** :
  [Spécification complète en français](https://www.conventionalcommits.org/fr/v1.0.0/)
- **pnpm Workspaces** : [Documentation officielle](https://pnpm.io/workspaces)
- **Husky** : [Guide de migration v8 → v9](https://typicode.github.io/husky/migrate-from-v8.html)
- **EditorConfig** : [Plugins par éditeur](https://editorconfig.org/#download)
- **Architecture Decision Records** : [Template ADR de Michael Nygard](https://adr.github.io/)
