# 03 — Setup de l'Environnement de Développement

> ⚠️ **Mise à jour mai 2026** — voir [`CHANGELOG.md`](./CHANGELOG.md) §5. Règles opérationnelles à
> appliquer dans tout ce document :
>
> - **Jamais `npm` dans ce monorepo — toujours `pnpm`.** Les commandes `npm i …` cassent le
>   workspace pnpm avec `Cannot read properties of null (reading 'matches')`.
> - Pour exécuter un binaire qui n'est pas global (ex. `prisma`) : préfixer par
>   `pnpm --filter <pkg> exec <bin>` ou utiliser le script du package
>   (`pnpm --filter @nina-aes/database db:validate`).
> - Pour le typage du monorepo : `pnpm check-types` (turbo) — **pas** `tsc --noEmit` à la racine (le
>   tsconfig racine n'a pas de fichiers à compiler par design ; un placeholder
>   `scripts/typecheck.ts` empêche l'erreur `TS18003`).
> - Chemin local utilisé pendant les sessions :
>   `C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform` (sans suffixe `-uqar`
>   — adapter si vous avez cloné sous un autre nom).

> **Bloc concerné** : Transversal — prérequis pour tous les blocs A → F **Prérequis** : Documents
> 00, 01, 02 lus et compris **Durée estimée** : 4 à 6 heures pour un étudiant seul (première
> installation complète) **Livrables de cette étape** :
>
> - Poste de travail Windows opérationnel avec tous les outils
> - Script de vérification automatique (`scripts/check-env.ps1` et `scripts/check-env.sh`)
> - (pas de nouvel ADR : l'environnement de dev est couvert par ADR-009 monorepo + ADR-010 infra ;
>   la CI/scan de sécurité par ADR-016)
> - Infrastructure Docker lancée et vérifiée (PostgreSQL, Redis, RabbitMQ, etc.)

---

## 1. Objectif pédagogique

Avant d'écrire la première ligne de code métier, il faut un **environnement de développement
reproductible**. Un code qui fonctionne sur une machine mais pas sur une autre n'a aucune valeur. Ce
document garantit que chaque outil est installé à la bonne version, configuré correctement, et
vérifié.

Dans cette étape, on apprend à :

- **Maîtriser sa chaîne d'outils** — Node.js, pnpm, Python, Docker, Git ne sont pas des boîtes
  noires. Comprendre leurs versions, leurs configurations et leurs interactions est fondamental.
- **Conteneuriser l'infrastructure** — PostgreSQL, Redis, RabbitMQ et les autres ne s'installent pas
  « en dur » sur le poste. Ils tournent dans Docker, isolés, reproductibles, et supprimables en une
  commande.
- **Documenter l'environnement** — Quand le professeur tuteur ou un futur collaborateur clone le
  repo, il doit pouvoir être opérationnel en suivant ce document sans rien deviner.
- **Vérifier avant de coder** — Un script de vérification automatique (`check-env`) évite les heures
  perdues sur des problèmes d'installation.

---

## 2. Technologies utilisées (avec versions à jour)

Versions **réellement détectées** sur le poste de travail actuel (avril 2026) :

| Technologie    | Version détectée | Rôle                                                                      | Documentation officielle                                 |
| -------------- | ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Node.js        | **24.11.1** LTS  | Runtime JavaScript/TypeScript pour NestJS et Next.js                      | https://nodejs.org/en/download                           |
| pnpm           | **10.12.1**      | Gestionnaire de paquets rapide, workspaces monorepo                       | https://pnpm.io/installation                             |
| TypeScript     | **6.0.2**        | Typage statique pour tout le code frontend et backend                     | https://www.typescriptlang.org/                          |
| Turborepo      | **2.9.5**        | Orchestrateur de builds et tâches dans le monorepo                        | https://turborepo.dev/                                   |
| Python         | **3.14.0**       | Runtime pour les services IA (FastAPI, XGBoost, spaCy)                    | https://www.python.org/downloads/                        |
| Docker         | **29.x**         | Conteneurisation de l'infrastructure (PostgreSQL, Redis, etc.)            | https://docs.docker.com/desktop/install/windows-install/ |
| Docker Compose | **v2.3x**        | Orchestration multi-conteneurs en développement (plugin `docker compose`) | Inclus avec Docker Desktop                               |
| Git            | **2.53.0**       | Versionnement du code source                                              | https://git-scm.com/download/win                         |
| VS Code        | **1.115.0**      | Éditeur de code avec extensions                                           | https://code.visualstudio.com/                           |

> ⚠️ **Versions à re-vérifier sur VOTRE poste — ne pas copier aveuglément.** Les chaînes ci-dessus
> sont des repères, pas un contrat. En particulier :
>
> - **Docker Compose** suit son propre versionnement (`v2.x`, distinct de Docker Engine). La plus
>   récente publiée est de la famille **`v2.3x`**. Il n'existe **pas** de Docker Compose « v5 » :
>   une sortie `v5.x` est le signe d'un environnement émulé/sandbox, pas d'une vraie install.
>   Vérifiez la vôtre avec `docker compose version` et alignez le doc si besoin.
> - **TypeScript** est épinglé à **`6.0.2`** dans le `package.json` racine (champ
>   `devDependencies.typescript`). C'est la version qui fait foi pour le monorepo ;
>   `npx tsc --version` doit la refléter.
> - **Docker Engine** vise la famille **29.x** ; le numéro mineur exact dépend de votre Docker
>   Desktop.

---

## 3. Architecture / Schéma

### Vue d'ensemble de l'environnement de développement

```
┌───────────────────────────────────────────────────────────────────────┐
│                    POSTE DE TRAVAIL WINDOWS                          │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  DOCKER DESKTOP                                                 │  │
│  │  ┌──────────┐ ┌───────┐ ┌──────────┐ ┌───────┐ ┌───────────┐  │  │
│  │  │PostgreSQL│ │ Redis │ │ RabbitMQ │ │ MinIO │ │Elasticsea.│  │  │
│  │  │  :5432   │ │ :6379 │ │:5672     │ │ :9000 │ │   :9200   │  │  │
│  │  └──────────┘ └───────┘ │:15672    │ │ :9001 │ └───────────┘  │  │
│  │  ┌──────────┐ ┌───────┐ └──────────┘ └───────┘                │  │
│  │  │ Keycloak │ │ Vault │ ┌──────────┐                          │  │
│  │  │  :8080   │ │ :8200 │ │ Maildev  │                          │  │
│  │  └──────────┘ └───────┘ │:1080/:25 │                          │  │
│  │                          └──────────┘                          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  PROCESSUS LOCAUX (hors Docker)                                 │  │
│  │                                                                 │  │
│  │  Node.js 24.11.1                     Python 3.14.0             │  │
│  │  ├── citizen       :4001             ├── ai-service     :3003  │  │
│  │  ├── admin         :4002             └── anticorruption :3009  │  │
│  │  ├── governance    :4003                                       │  │
│  │  ├── identity-svc  :3001                                       │  │
│  │  ├── auth-svc      :3002                                       │  │
│  │  ├── document-svc  :3004                                       │  │
│  │  ├── notif-svc     :3005                                       │  │
│  │  ├── interop-svc   :3006                                       │  │
│  │  ├── audit-svc     :3007                                       │  │
│  │  ├── appoint-svc   :3008                                       │  │
│  │  ├── gouv-svc      :3010                                       │  │
│  │  └── vuln-svc      :3011                                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  VS Code 1.115.0 + Extensions recommandées                           │
│  Git 2.53.0 + Husky + commitlint                                     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Installation de Node.js 24 LTS

Node.js est le runtime qui fait tourner NestJS (backend) et Next.js (frontend). La version 24.x LTS
est requise.

**Option A — Installation via fnm (recommandé pour gérer plusieurs versions)** :

```powershell
# Installer fnm (Fast Node Manager) via winget
winget install Schniz.fnm

# Relancer le terminal puis installer Node.js 24 LTS
fnm install 24
fnm use 24
fnm default 24

# Vérifier
node --version
# Attendu : v24.x.x
```

**Option B — Installation directe (si une seule version suffit)** :

```powershell
# Télécharger depuis https://nodejs.org/en/download
# Choisir "LTS" → Windows Installer (.msi) → 64-bit
# Suivre l'assistant d'installation

# Vérifier après installation
node --version
# Attendu : v24.x.x
```

> 💡 **Pourquoi Node.js 24 ?** — C'est la version LTS (Long Term Support) active en avril 2026. LTS
> signifie que cette version reçoit des correctifs de sécurité pendant 30 mois. Les versions
> impaires (23, 25) sont des versions « Current » non recommandées pour la production.

---

### Étape 4.2 — Installation de pnpm 10

pnpm est le gestionnaire de paquets du monorepo. Il est plus rapide que npm et supporte nativement
les workspaces Turborepo.

```powershell
# Installer pnpm via corepack (inclus avec Node.js 24)
corepack enable
corepack prepare pnpm@latest --activate

# Vérifier
pnpm --version
# Attendu : 10.x.x
```

> 💡 **Pourquoi pnpm et pas npm ou yarn ?** — pnpm utilise un store global de paquets et des liens
> symboliques, ce qui réduit l'espace disque (~60% d'économie) et accélère les installations. Son
> support natif des workspaces est le plus mature des trois gestionnaires.

---

### Étape 4.3 — Installation de Python 3.14

Python est nécessaire pour les services FastAPI (ai-service et anticorruption-service).

```powershell
# Option A — via winget
winget install Python.Python.3.14

# Option B — via le site officiel
# Télécharger depuis https://www.python.org/downloads/
# ⚠️ COCHER "Add Python to PATH" pendant l'installation

# Vérifier
python --version
# Attendu : Python 3.14.x

# Vérifier pip
pip --version
# Attendu : pip 25.x.x

# Créer un environnement virtuel pour le projet
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
python -m venv .venv

# Activer l'environnement virtuel (PowerShell)
.\.venv\Scripts\Activate.ps1

# Activer l'environnement virtuel (Git Bash)
# source .venv/Scripts/activate

# Installer les dépendances IA
pip install -r services/ai-service/requirements.txt
pip install -r services/anticorruption-service/requirements.txt
```

> ⚠️ **Attention** : sur Windows, si `python` n'est pas reconnu mais `py` l'est, utilisez `py -3.14`
> au lieu de `python`. Vérifiez que Python est dans votre `PATH`.

---

### Étape 4.4 — Installation de Docker Desktop

Docker fait tourner toute l'infrastructure (PostgreSQL, Redis, RabbitMQ, etc.) dans des conteneurs
isolés.

```powershell
# Installer Docker Desktop via winget
winget install Docker.DockerDesktop

# Après installation, relancer le PC
# Docker Desktop démarre automatiquement

# Vérifier
docker --version
# Attendu : Docker version 29.x.x

docker compose version
# Attendu : Docker Compose version v2.3x.x  (PAS v5 — voir l'avertissement §2 sur les versions)
```

**Configuration recommandée de Docker Desktop** :

1. Ouvrir Docker Desktop → Settings → Resources
2. **Memory** : 6 Go minimum (8 Go recommandé) — nos 8 conteneurs consomment ~4 Go au total
3. **CPU** : 4 cœurs minimum
4. **Disk** : 30 Go minimum
5. Settings → General → cocher « Use Docker Compose V2 »

> 💡 **WSL2 vs Hyper-V** : Docker Desktop sur Windows utilise WSL2 par défaut (Windows Subsystem for
> Linux 2). C'est la configuration recommandée. Si WSL2 n'est pas activé, Docker Desktop proposera
> de l'installer.

---

### Étape 4.5 — Configuration de Git

Git est déjà installé. Vérifions et configurons-le.

```powershell
# Vérifier la version
git --version
# Attendu : git version 2.53.x

# Configurer l'identité (si pas déjà fait)
git config --global user.name "Votre Nom"
git config --global user.email "votre.email@uqar.ca"

# Configurer les fins de ligne pour Windows
git config --global core.autocrlf input

# Configurer l'éditeur par défaut (VS Code)
git config --global core.editor "code --wait"

# Configurer le merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd "code --wait --merge $REMOTE $LOCAL $BASE $MERGED"

# Vérifier la configuration
git config --global --list
```

---

### Étape 4.6 — Configuration de VS Code

**Extensions obligatoires** — installer via la ligne de commande :

```powershell
# TypeScript / JavaScript
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode

# NestJS
code --install-extension ashinzekene.nestjs

# Prisma (coloration syntaxique + IntelliSense pour .prisma)
code --install-extension Prisma.prisma

# Python
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension charliermarsh.ruff

# Docker
code --install-extension ms-azuretools.vscode-docker

# Git
code --install-extension eamodio.gitlens

# Mermaid (prévisualisation des diagrammes dans les .md)
code --install-extension bierner.markdown-mermaid

# Tailwind CSS (IntelliSense pour les classes)
code --install-extension bradlc.vscode-tailwindcss

# REST Client (tester les APIs sans Postman)
code --install-extension humao.rest-client

# Colorisation des paires de brackets
# (intégré à VS Code depuis v1.67, activé par défaut)
```

**Configuration VS Code recommandée** — créer `.vscode/settings.json` dans le monorepo :

```powershell
# Créer le dossier .vscode à la racine du monorepo
mkdir -p C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform\.vscode
```

**Fichier `.vscode/settings.json`** :

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "editor.tabSize": 2,
  "files.eol": "\n",
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true,

  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.updateImportsOnFileMove.enabled": "always",

  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/Scripts/python.exe",
  "python.analysis.typeCheckingMode": "basic",

  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.tabSize": 4
  },

  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  },

  "eslint.workingDirectories": [
    "apps/citizen",
    "apps/admin",
    "apps/governance",
    "services/identity-service",
    "services/auth-service",
    "services/document-service",
    "services/notification-service",
    "services/interop-service",
    "services/audit-service",
    "services/appointment-service",
    "services/governance-service",
    "services/vulnerability-service",
    "packages/ui",
    "packages/shared-types",
    "packages/utils"
  ],

  "files.exclude": {
    "**/node_modules": true,
    "**/.turbo": true,
    "**/dist": true,
    "**/.next": true,
    "**/__pycache__": true
  },

  "search.exclude": {
    "**/node_modules": true,
    "**/pnpm-lock.yaml": true,
    "**/.turbo": true,
    "**/dist": true,
    "**/.next": true
  }
}
```

**Fichier `.vscode/extensions.json`** (recommandations pour l'équipe) :

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ashinzekene.nestjs",
    "Prisma.prisma",
    "ms-python.python",
    "ms-python.vscode-pylance",
    "charliermarsh.ruff",
    "ms-azuretools.vscode-docker",
    "eamodio.gitlens",
    "bierner.markdown-mermaid",
    "bradlc.vscode-tailwindcss",
    "humao.rest-client"
  ]
}
```

---

### Étape 4.7 — Lancement de l'infrastructure Docker

C'est le moment de vérité : on lance tous les conteneurs définis dans `docker-compose.dev.yml`.

> 🔐 **P0 — OBJECTIF : aucun secret en clair dans ce document.** Les valeurs de mots de passe
> (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, etc.) doivent ne vivre **que** dans un fichier `.env`
> **local et non versionné** (`.env` est dans `.gitignore`). CE document n'imprime **jamais** un
> secret réel : les exemples lisent toujours la variable d'environnement (`$env:POSTGRES_PASSWORD`,
> `${REDIS_PASSWORD}`…).
>
> ⚠️ **DETTE CONNUE (à purger en Phase 2).** À date, des secrets de dev en clair (`nina_dev_2026!`
> et consorts : `redis_dev_2026!`, `rabbit_dev_2026!`, `minio_dev_2026!`, `elastic_dev_2026!`)
> subsistent dans le dépôt **tracké** : `.env.example`,
> `infrastructure/docker/docker-compose.dev.yml` (l.57 `POSTGRES_PASSWORD`, l.312 `KC_DB_PASSWORD`,
>
> - Redis/RabbitMQ/MinIO/Elastic), `packages/config/src/index.ts` (l.92/l.94),
>   `services/anticorruption-service/app/config.py` (l.11), `services/*/.env.example`. Ils sont à
>   remplacer par des **placeholders de dev** + lecture depuis **Vault dev**. L'affirmation « zéro
>   secret en clair dans le dépôt » n'est donc **pas encore acquise** : c'est l'état cible.
>
> Le `.env.example` versionné **DOIT à terme** ne contenir que des placeholders de dev (`change-me`,
> `replace-with-…`) ; **aujourd'hui** seules les 5 clés Kibana le sont, les mots de passe
> Postgres/Redis/RabbitMQ/MinIO/Elastic restent **en clair** et sont à remplacer (Phase 2).
>
> **Source de vérité des secrets = Vault dev**, pas un fichier copié à la main. Après le démarrage
> des conteneurs, `pnpm vault:bootstrap` (câblé dans `pnpm docker:up`) sème les secrets dans Vault
> dev (kv-v2 + transit) ; les services les lisent ensuite via AppRole/lease — **jamais** un
> `VAULT_TOKEN` long-lived (voir CANON sécurité et `docs/15-SECURITY-HARDENING.md`).

```powershell
# Se placer à la racine du monorepo
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform

# 1) Générer le .env LOCAL non versionné à partir du gabarit de placeholders.
#    (Ne contient que des placeholders de dev — à remplacer ; jamais commité.)
#    PowerShell :
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
#    Git Bash :   [ -f .env ] || cp .env.example .env

# 2) Lancer toute l'infrastructure + amorcer Vault dev en une commande.
#    `pnpm docker:up` = `docker compose ... up -d` PUIS `pnpm vault:bootstrap`
#    PUIS `pnpm minio:bootstrap` (voir package.json). Préférez-la au `docker compose` nu :
pnpm docker:up

#    (Équivalent bas niveau, si vous voulez piloter à la main :)
# docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml up -d
# pnpm vault:bootstrap        # sème kv/transit dans Vault dev (idempotent)

# 3) Vérifier que tous les conteneurs sont en "healthy" ou "running"
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

> ⚠️ **Vault dev perd ses secrets à chaque restart du conteneur.** Le serveur Vault de dev tourne en
> mode mémoire (storage non persistant) et se **re-scelle** (sealed) au redémarrage. Après chaque
> `docker compose restart nina-vault` (ou reboot machine), **ré-exécutez `pnpm vault:bootstrap`**
> pour ré-semer kv/transit — sinon les services démarrent sans leurs secrets (erreurs
> `permission denied` / clé transit absente). `vault:bootstrap` est **idempotent** : le relancer ne
> casse rien. Pour vérifier l'état : `curl -s http://127.0.0.1:8200/v1/sys/health` →
> `"sealed":false`.

**Sortie attendue** (après ~30-60 secondes de démarrage) :

```
NAME                 STATUS                   PORTS
nina-postgres        Up (healthy)             0.0.0.0:5432->5432/tcp
nina-redis           Up (healthy)             0.0.0.0:6379->6379/tcp
nina-rabbitmq        Up (healthy)             0.0.0.0:5672->5672/tcp, 0.0.0.0:15672->15672/tcp
nina-minio           Up (healthy)             0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
nina-elasticsearch   Up (healthy)             0.0.0.0:9200->9200/tcp
nina-keycloak        Up (healthy)             0.0.0.0:8080->8080/tcp
nina-vault           Up (healthy)             0.0.0.0:8200->8200/tcp
nina-maildev         Up                       0.0.0.0:1025->1025/tcp, 0.0.0.0:1080->1080/tcp
```

> ⚠️ **Binding réseau : préférez `127.0.0.1:PORT` à `0.0.0.0:PORT`.** Un mapping `0.0.0.0:5432`
> expose PostgreSQL (Redis, RabbitMQ…) sur **toutes** les interfaces de la machine — donc
> potentiellement au réseau Wi-Fi local / VPN. Sur un poste de dev avec un PostgreSQL en `pg_hba`
> `trust` (voir ci-dessous), cela revient à offrir un accès **sans mot de passe** à quiconque
> partage le réseau. Pour le dev local, **liez sur la loopback** en préfixant l'hôte dans le mapping
> de ports du `docker-compose.dev.yml` :
>
> ```yaml
> # ⏳ à appliquer dans infrastructure/docker/docker-compose.dev.yml (Phase 2 — DOCS-ONLY ici)
> ports:
>   - '127.0.0.1:5432:5432' # au lieu de '5432:5432' (qui équivaut à 0.0.0.0:5432)
> ```
>
> Le service reste joignable depuis le poste (`localhost`) mais **invisible** depuis le réseau.
>
> ⚠️ **`pg_hba.conf` en mode `trust` = aucun mot de passe vérifié.** Le conteneur PostgreSQL de dev
> utilise `trust` (commodité : pas de mot de passe demandé en local). C'est **intentionnel en dev**
> mais **inacceptable hors loopback** et **interdit en prod** (durcir vers `scram-sha-256`). Tant
> que `pg_hba` est en `trust`, le binding loopback ci-dessus n'est pas optionnel : c'est la seule
> barrière qui empêche un accès anonyme à la base.

**Vérification individuelle de chaque service** :

```powershell
# ⚠️ AUCUN secret n'est écrit en clair ci-dessous : on lit toujours la variable
#    d'environnement définie dans le .env LOCAL (non versionné). Chargez-le d'abord :
#    PowerShell : Get-Content .env | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
#                   $k,$v = $_ -split '=',2 ; Set-Item "env:$($k.Trim())" $v.Trim() }
#    Git Bash   : set -a; source .env; set +a

# PostgreSQL — connexion test (round-trip SQL réel)
# Note : pg_isready ne fait qu'un check TCP+startup et répond "accepting connections"
# même avec un user/db inexistants — d'où ce test plus solide qui vérifie en plus
# que le rôle existe, que la DB existe et qu'un query roundtrip fonctionne.
# ⚠️ Le mot de passe n'est PAS validé : le conteneur dev utilise pg_hba trust auth
# (intentionnel pour la commodité dev). En prod, cette config doit être durcie (scram-sha-256).
docker exec -e PGPASSWORD="$env:POSTGRES_PASSWORD" nina-postgres psql -U "$env:POSTGRES_USER" -d "$env:POSTGRES_DB" -tAc "SELECT 'OK';"
# (Git Bash : remplacer $env:VAR par $VAR)
# Attendu : OK

# Redis — ping (le mot de passe vient de $REDIS_PASSWORD, jamais écrit en dur)
docker exec nina-redis redis-cli -a "$env:REDIS_PASSWORD" ping
# Attendu : PONG

# RabbitMQ — interface web
# Ouvrir http://localhost:15672 dans le navigateur
# Login : $RABBITMQ_USER / $RABBITMQ_PASSWORD (valeurs dans votre .env local)

# MinIO — console web
# Ouvrir http://localhost:9001 dans le navigateur
# Login : $MINIO_ACCESS_KEY / $MINIO_SECRET_KEY (valeurs dans votre .env local)

# Elasticsearch — santé du cluster (auth requise, xpack.security activé)
curl -s -u "$env:ELASTICSEARCH_USER:$env:ELASTICSEARCH_PASSWORD" http://127.0.0.1:9200/_cluster/health?pretty
# Attendu : "status" : "green" ou "yellow"

# Keycloak — page d'admin
# Ouvrir http://localhost:8080 dans le navigateur
# Login : $KEYCLOAK_ADMIN / $KEYCLOAK_ADMIN_PASSWORD (valeurs dans votre .env local)

# Vault — statut (loopback : pas besoin d'exposer 8200 sur le réseau)
curl -s http://127.0.0.1:8200/v1/sys/health
# Attendu : {"initialized":true,"sealed":false,...}
# Si "sealed":true → Vault s'est re-scellé au restart : relancer `pnpm vault:bootstrap`.

# Maildev — interface web
# Ouvrir http://localhost:1080 dans le navigateur
```

---

### Étape 4.8 — Vérification des extensions PostgreSQL

Le script `init-db.sql` a normalement activé les extensions au premier démarrage. Vérifions.

```powershell
# Se connecter à PostgreSQL et lister les extensions
docker exec -it nina-postgres psql -U nina_admin -d nina_aes_db -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
```

**Sortie attendue** :

```
  extname   | extversion
------------+------------
 pgcrypto   | 1.3
 pg_trgm    | 1.6
 plpgsql    | 1.0
 unaccent   | 1.1
 uuid-ossp  | 1.1
```

> Si des extensions manquent, le script `init-db.sql` ne s'est pas exécuté au démarrage. Relancer
> avec :
>
> ```powershell
> docker exec -i nina-postgres psql -U nina_admin -d nina_aes_db < scripts/init-db.sql
> ```

---

### Étape 4.9 — Création du script de vérification automatique

Ce script vérifie que tout l'environnement est correctement installé en une seule commande.

**Fichier `scripts/check-env.sh`** (Git Bash / Linux / macOS) :

```bash
#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# NINA-AES Platform — Vérification de l'environnement
# Usage : bash scripts/check-env.sh
# ═══════════════════════════════════════════════════

set -e
ERRORS=0

echo "═══════════════════════════════════════════════"
echo " NINA-AES — Vérification de l'environnement"
echo "═══════════════════════════════════════════════"
echo ""

# Fonction de vérification
check() {
  local name="$1"
  local cmd="$2"
  local expected="$3"

  if version=$($cmd 2>/dev/null); then
    echo "  ✅ $name : $version"
  else
    echo "  ❌ $name : NON TROUVÉ (attendu : $expected)"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "── Outils de développement ──"
check "Node.js"         "node --version"           "v24.x.x"
check "pnpm"            "pnpm --version"           "10.x.x"
check "TypeScript"      "npx tsc --version"        "6.0.x"
check "Python"          "python --version"          "3.14.x"
check "Git"             "git --version"             "2.53.x"
check "Docker"          "docker --version"          "29.x.x"
check "Docker Compose"  "docker compose version"    "v2.3x.x"
# Trivy est optionnel en local mais utilisé en CI (Job 7 sécurité). On l'amorce :
# si absent, on n'incrémente PAS ERRORS (non bloquant), juste un rappel d'install.
if command -v trivy >/dev/null 2>&1; then
  echo "  ✅ Trivy : $(trivy --version | head -n1)"
else
  echo "  ⚠️  Trivy : non installé (optionnel en local) — voir §10 « Amorcer Trivy »"
fi

echo ""
echo "── Conteneurs Docker ──"
for container in nina-postgres nina-redis nina-rabbitmq nina-minio nina-elasticsearch nina-keycloak nina-vault nina-maildev; do
  if docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null | grep -q "running"; then
    echo "  ✅ $container : running"
  else
    echo "  ❌ $container : NON DÉMARRÉ"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "── Extensions PostgreSQL ──"
EXTENSIONS=$(docker exec nina-postgres psql -U nina_admin -d nina_aes_db -t -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp','pgcrypto','pg_trgm','unaccent') ORDER BY extname;" 2>/dev/null || echo "ERREUR")
for ext in pgcrypto pg_trgm unaccent uuid-ossp; do
  if echo "$EXTENSIONS" | grep -q "$ext"; then
    echo "  ✅ $ext"
  else
    echo "  ❌ $ext : MANQUANTE"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "── Fichiers de configuration ──"
for f in .env infrastructure/docker/docker-compose.dev.yml package.json pnpm-workspace.yaml turbo.json Makefile .prettierrc .editorconfig commitlint.config.js; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ $f : MANQUANT"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "── Hygiène des secrets (P0) ──"
# Le .env LOCAL doit exister ET ne JAMAIS être suivi par Git.
if [ -f ".env" ]; then
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo "  ❌ .env est SUIVI par Git — secrets exposés ! Exécuter : git rm --cached .env"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✅ .env présent et non versionné (ignoré par Git)"
  fi
else
  echo "  ❌ .env absent — créer depuis le gabarit : cp .env.example .env"
  ERRORS=$((ERRORS + 1))
fi
# Vault dev doit être unsealed (sinon les services n'ont pas leurs secrets).
VAULT_SEALED=$(curl -s http://127.0.0.1:8200/v1/sys/health 2>/dev/null | grep -o '"sealed":[a-z]*' || echo "?")
if [ "$VAULT_SEALED" = '"sealed":false' ]; then
  echo "  ✅ Vault dev unsealed"
elif [ "$VAULT_SEALED" = '"sealed":true' ]; then
  echo "  ⚠️  Vault dev SEALED — relancer : pnpm vault:bootstrap"
else
  echo "  ⚠️  Vault dev injoignable sur 127.0.0.1:8200 (conteneur démarré ?)"
fi

echo ""
echo "── Workspaces pnpm ──"
WORKSPACES=$(pnpm ls -r --depth -1 2>/dev/null | grep -c "@nina-aes" || echo "0")
echo "  Workspaces @nina-aes détectés : $WORKSPACES"
if [ "$WORKSPACES" -ge 15 ]; then
  echo "  ✅ Nombre suffisant (>= 15)"
else
  echo "  ⚠️  Nombre insuffisant (attendu >= 15)"
fi

echo ""
echo "═══════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo " ✅ ENVIRONNEMENT OK — Prêt à coder !"
else
  echo " ❌ $ERRORS ERREUR(S) DÉTECTÉE(S)"
  echo "    Corrigez les problèmes ci-dessus avant de continuer."
fi
echo "═══════════════════════════════════════════════"

exit $ERRORS
```

**Fichier `scripts/check-env.ps1`** (PowerShell natif Windows) :

```powershell
# ═══════════════════════════════════════════════════
# NINA-AES Platform — Vérification de l'environnement
# Usage : powershell -ExecutionPolicy Bypass -File scripts\check-env.ps1
# ═══════════════════════════════════════════════════

$errors = 0

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " NINA-AES — Vérification de l'environnement"   -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

function Check-Tool {
    param([string]$Name, [string]$Command)
    try {
        $version = Invoke-Expression $Command 2>&1
        Write-Host "  ✅ ${Name} : $version" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ ${Name} : NON TROUVÉ" -ForegroundColor Red
        $script:errors++
    }
}

Write-Host "── Outils de développement ──"
Check-Tool "Node.js"        "node --version"
Check-Tool "pnpm"           "pnpm --version"
Check-Tool "Python"         "python --version"
Check-Tool "Git"            "git --version"
Check-Tool "Docker"         "docker --version"
Check-Tool "Docker Compose" "docker compose version"   # attendu v2.3x — PAS v5
Check-Tool "TypeScript"     "npx tsc --version"          # doit refléter 6.0.2 (package.json)
# Trivy : optionnel en local, utilisé en CI (Job 7 sécurité). Non bloquant.
if (Get-Command trivy -ErrorAction SilentlyContinue) {
    Write-Host "  ✅ Trivy : $((trivy --version)[0])" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Trivy : non installé (optionnel local) — voir §10 « Amorcer Trivy »" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "── Conteneurs Docker ──"
$containers = @("nina-postgres","nina-redis","nina-rabbitmq","nina-minio",
                "nina-elasticsearch","nina-keycloak","nina-vault","nina-maildev")
foreach ($c in $containers) {
    $status = docker inspect --format='{{.State.Status}}' $c 2>$null
    if ($status -eq "running") {
        Write-Host "  ✅ ${c} : running" -ForegroundColor Green
    } else {
        Write-Host "  ❌ ${c} : NON DÉMARRÉ" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
Write-Host "── Hygiène des secrets (P0) ──"
# Le .env LOCAL doit exister ET ne JAMAIS être suivi par Git.
if (Test-Path ".env") {
    git ls-files --error-unmatch .env 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ❌ .env est SUIVI par Git — secrets exposés ! git rm --cached .env" -ForegroundColor Red
        $errors++
    } else {
        Write-Host "  ✅ .env présent et non versionné (ignoré par Git)" -ForegroundColor Green
    }
} else {
    Write-Host "  ❌ .env absent — créer depuis le gabarit : Copy-Item .env.example .env" -ForegroundColor Red
    $errors++
}
# Vault dev doit être unsealed (sinon les services n'ont pas leurs secrets).
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8200/v1/sys/health" -TimeoutSec 3 -ErrorAction Stop
    if (-not $health.sealed) {
        Write-Host "  ✅ Vault dev unsealed" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Vault dev SEALED — relancer : pnpm vault:bootstrap" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Vault dev injoignable sur 127.0.0.1:8200 (conteneur démarré ?)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host " ✅ ENVIRONNEMENT OK — Prêt à coder !" -ForegroundColor Green
} else {
    Write-Host " ❌ $errors ERREUR(S) DÉTECTÉE(S)" -ForegroundColor Red
}
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
```

---

## 5. Tests de validation

Après avoir suivi toutes les étapes, exécuter le script de vérification :

```powershell
# Depuis Git Bash
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
bash scripts/check-env.sh

# OU depuis PowerShell
powershell -ExecutionPolicy Bypass -File scripts\check-env.ps1
```

**Vérifications manuelles supplémentaires** :

```powershell
# 1. Vérifier que le portail citoyen se lance (Next.js)
pnpm run dev:citizen
# Ouvrir http://localhost:4001 — la page par défaut doit s'afficher
# Ctrl+C pour arrêter

# 2. Vérifier que le service IA se lance (FastAPI)
cd services/ai-service
python -m uvicorn app.main:app --port 3003
# Ouvrir http://localhost:3003/api/v1/ai/health — doit retourner {"status":"ok",...}
# Ctrl+C pour arrêter

# 3. Vérifier que Turborepo reconnaît tous les workspaces
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
pnpm ls -r --depth -1 | findstr "@nina-aes" # (Windows equivalent)
pnpm ls -r --depth -1 | Select-String "@nina-aes" # PowerShell
pnpm ls -r --depth -1 | grep "@nina-aes" # Git Bash
# Doit lister au minimum 15 packages @nina-aes/*
```

---

## 6. Pièges courants et dépannage

| Symptôme                                                           | Cause probable                             | Solution                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `node: command not found`                                          | Node.js pas dans le PATH                   | Relancer le terminal après installation. Vérifier `$env:PATH` sous PowerShell               |
| `pnpm: command not found`                                          | corepack pas activé                        | Exécuter `corepack enable` puis relancer le terminal                                        |
| `python: command not found` mais `py` fonctionne                   | Alias Windows par défaut                   | Utiliser `py -3.14` ou ajouter Python au PATH via l'installeur (cocher « Add to PATH »)     |
| Docker : `error during connect: ... Is the docker daemon running?` | Docker Desktop pas démarré                 | Lancer Docker Desktop, attendre que l'icône dans la barre des tâches devienne verte         |
| Docker : Elasticsearch crash avec `vm.max_map_count`               | Configuration WSL2 manquante               | Exécuter dans PowerShell admin : `wsl -d docker-desktop sysctl -w vm.max_map_count=262144`  |
| Docker : `port already in use :5432`                               | Un PostgreSQL local tourne déjà            | Arrêter le PostgreSQL local : `net stop postgresql-x64-17` ou changer le port dans `.env`   |
| `error TS6053: File not found` dans un service NestJS              | Dépendances pas installées                 | Exécuter `pnpm install` à la racine du monorepo                                             |
| Keycloak : page blanche sur `localhost:8080`                       | Keycloak prend ~30-60s à démarrer          | Attendre et rafraîchir. Vérifier : `docker logs nina-keycloak`                              |
| `ENOSPC: System limit for number of file watchers reached`         | Limite Linux de watchers trop basse (WSL2) | `echo fs.inotify.max_user_watches=524288 \| sudo tee -a /etc/sysctl.conf && sudo sysctl -p` |
| Les conteneurs consomment trop de RAM (>8 Go)                      | Tous les 8 conteneurs lancés simultanément | Démarrer seulement ce dont vous avez besoin : `docker compose up postgres redis -d`         |

---

## 7. Documentation à produire après cette étape

### Note de décision — Environnement de dev conteneurisé (PAS de nouvel ADR)

> ⚠️ **Aucun nouvel ADR à créer ici.** Le numéro `ADR-009` est **déjà pris** par
> `docs/adr/ADR-009-monorepo-turborepo.md` (sujet différent). L'environnement de développement est
> couvert par les ADR **existants** — ne pas inventer un doublon :
>
> - **ADR-009 (monorepo/Turborepo)** + **ADR-010 (infrastructure)** : structure et orchestration.
> - **ADR-016 (CI/CD, scans de sécurité, souveraineté)** : Trivy/gitleaks, exclusion des SaaS.
>
> La décision ci-dessous est consignée comme **simple note** dans ce document, pas comme ADR.

**Décision (rappel).** Toute l'infrastructure (PostgreSQL, Redis, RabbitMQ, MinIO, Elasticsearch,
Keycloak, Vault, Maildev) est conteneurisée via Docker Compose ; les microservices applicatifs
(NestJS, FastAPI) tournent en local **hors Docker** pour faciliter le debugging et le hot-reload.

**Conséquences.**

- Un seul `pnpm docker:up` (= `docker compose up -d` + `vault:bootstrap` + `minio:bootstrap`) lance
  tout l'environnement.
- `docker compose down` nettoie tout sans laisser de traces.
- Les volumes Docker persistent les données entre les redémarrages.
- Le hot-reload des services NestJS/FastAPI fonctionne nativement (pas de rebuild Docker).

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — 03 Setup Environnement Dev — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Outils installés** :
  - [ ] Node.js 24.x LTS
  - [ ] pnpm 10.x
  - [ ] Python 3.14.x
  - [ ] Docker Desktop 29.x
  - [ ] Git 2.53.x
  - [ ] VS Code + 12 extensions
- **Infrastructure Docker** :
  - [ ] PostgreSQL : running + extensions OK
  - [ ] Redis : running + PONG
  - [ ] RabbitMQ : running + UI accessible
  - [ ] MinIO : running + console accessible
  - [ ] Elasticsearch : running + cluster health OK
  - [ ] Keycloak : running + admin accessible
  - [ ] Vault : running + unsealed
  - [ ] Maildev : running + UI accessible
- **Scripts de vérification** :
  - [ ] check-env.sh fonctionne
  - [ ] check-env.ps1 fonctionne
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** :
```

---

## 9. Checklist de fin d'étape

- [ ] Node.js 24.x LTS installé et vérifié (`node --version`)
- [ ] pnpm 10.x installé et vérifié (`pnpm --version`)
- [ ] Python 3.14.x installé et vérifié (`python --version`)
- [ ] Docker Desktop installé, démarré, et configuré (6 Go RAM, 4 CPU)
- [ ] Git configuré (user.name, user.email, core.autocrlf)
- [ ] VS Code + 12 extensions installées
- [ ] `.vscode/settings.json` et `.vscode/extensions.json` créés
- [ ] `.env` LOCAL créé depuis `.env.example` (placeholders) — **non versionné**, jamais commité
- [ ] `pnpm docker:up` — 8 conteneurs running **+** `vault:bootstrap` exécuté (Vault dev semé)
- [ ] Vault dev **unsealed** (`curl 127.0.0.1:8200/v1/sys/health` → `"sealed":false`) ; après chaque
      restart du conteneur Vault → ré-exécuter `pnpm vault:bootstrap`
- [ ] Ports d'infra liés en **loopback** (`127.0.0.1:PORT`), pas `0.0.0.0` (cf. avertissement §4.7)
- [ ] Extensions PostgreSQL vérifiées (uuid-ossp, pgcrypto, pg_trgm, unaccent)
- [ ] `scripts/check-env.sh` et `scripts/check-env.ps1` créés et exécutés avec succès
- [ ] `pnpm run dev:citizen` — portail citoyen accessible sur `http://localhost:4001`
- [ ] Commit Git : `chore(infra): add dev environment setup scripts and VS Code config`
- [ ] Mini-rapport rédigé
- [ ] **Hygiène secrets (P0 — À FAIRE)** : purger les secrets en clair restants (`nina_dev_2026!` et
      consorts) de `.env.example`, `infrastructure/docker/docker-compose.dev.yml`,
      `packages/config/src/index.ts`, `services/*/.env.example` et
      `services/anticorruption-service/app/config.py` vers des **placeholders** (`change-me`,
      `replace-with-…`) + lecture depuis **Vault dev**. Les secrets ne doivent vivre que dans le
      `.env` local (ignoré par Git) et dans Vault dev. **Tant que `gitleaks detect` /
      `trivy fs --scanners secret` ne sont pas verts, cet item N'EST PAS coché.**

---

## 10. Pour aller plus loin

### Amorcer Trivy en local (scan de vulnérabilités, parité avec la CI)

La CI lance déjà **Trivy** (`.github/workflows/ci.yml`, Job 7 sécurité —
`aquasecurity/trivy-action`, scan-type `fs`, gate sur `exit-code: '1'`). L'installer en local permet
de **reproduire le gate avant de pousser** et d'éviter un échec de pipeline. Trivy est **souverain**
(binaire open-source, pas de SaaS — cohérent avec ADR-016 qui exclut Snyk).

```powershell
# Installer Trivy (Windows)
winget install AquaSecurity.Trivy
# (Alternatives : scoop install trivy  |  choco install trivy)

# Vérifier
trivy --version

# Scan du dépôt en local — SURENSEMBLE de la CI.
# La CI (ci.yml l.400) ne fait qu'un scan `vuln` (scan-type fs, severity CRITICAL,HIGH,
# ignore-unfixed). Le scan local ci-dessous AJOUTE `secret` + `misconfig` en plus du `vuln`
# de la CI — ce n'est donc PAS une parité stricte mais un filet plus large.
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL .
# `--scanners secret` agit comme un filet anti-fuite : il échoue si un secret
# en clair traîne dans le code/les docs (complète gitleaks de la CI). NB : avec la
# dette connue (§4.7), ce scan remontera encore `nina_dev_2026!` & co tant que
# `.env.example` / `docker-compose.dev.yml` ne sont pas nettoyés (Phase 2).
```

> 💡 `check-env.sh` / `check-env.ps1` détectent la présence de Trivy mais **ne bloquent pas** s'il
> est absent (outil optionnel en local). Le vrai gate reste la CI.

### Outils optionnels mais recommandés

| Outil                    | Rôle                                                                       | Installation                                                  |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Postman** ou **Bruno** | Tester les APIs manuellement avec des collections sauvegardées             | `winget install Postman.Postman` ou https://www.usebruno.com/ |
| **DBeaver**              | Client SQL graphique pour explorer PostgreSQL                              | `winget install dbeaver.dbeaver`                              |
| **Lazydocker**           | TUI (Terminal UI) pour gérer Docker sans quitter le terminal               | `winget install jesseduffield.lazydocker`                     |
| **Windows Terminal**     | Terminal moderne avec onglets, profils, et thèmes                          | `winget install Microsoft.WindowsTerminal`                    |
| **Oh My Posh**           | Prompt de terminal enrichi (affiche la branche git, la version node, etc.) | https://ohmyposh.dev/docs/installation/windows                |

### Raccourcis VS Code essentiels

| Raccourci       | Action                                |
| --------------- | ------------------------------------- |
| `Ctrl+Shift+P`  | Palette de commandes                  |
| `Ctrl+P`        | Recherche rapide de fichiers          |
| `Ctrl+Shift+F`  | Recherche dans tout le projet         |
| `Ctrl+`` `      | Ouvrir/fermer le terminal intégré     |
| `F12`           | Aller à la définition                 |
| `Shift+F12`     | Trouver toutes les références         |
| `Ctrl+Shift+M`  | Voir les erreurs et avertissements    |
| `Ctrl+K Ctrl+S` | Raccourcis clavier (personnalisation) |

---

_Document 03 — Version 1.1 (durcissement sécurité : secrets via .env non versionné + Vault dev,
binding loopback, avertissement pg_hba trust, versions corrigées, amorçage Trivy) — Juin 2026_
_NINA-AES Platform — UQAR — CONFIDENTIEL_
