# 03 — Setup de l'Environnement de Développement

> **Bloc concerné** : Transversal — prérequis pour tous les blocs A → F **Prérequis** : Documents
> 00, 01, 02 lus et compris **Durée estimée** : 4 à 6 heures pour un étudiant seul (première
> installation complète) **Livrables de cette étape** :
>
> - Poste de travail Windows opérationnel avec tous les outils
> - Script de vérification automatique (`scripts/check-env.ps1` et `scripts/check-env.sh`)
> - Fichier `docs/adr/ADR-009-environnement-dev.md`
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

| Technologie    | Version détectée | Rôle                                                           | Documentation officielle                                 |
| -------------- | ---------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Node.js        | **24.11.1** LTS  | Runtime JavaScript/TypeScript pour NestJS et Next.js           | https://nodejs.org/en/download                           |
| pnpm           | **10.12.1**      | Gestionnaire de paquets rapide, workspaces monorepo            | https://pnpm.io/installation                             |
| TypeScript     | **6.0.2**        | Typage statique pour tout le code frontend et backend          | https://www.typescriptlang.org/                          |
| Turborepo      | **2.9.5**        | Orchestrateur de builds et tâches dans le monorepo             | https://turborepo.dev/                                   |
| Python         | **3.14.0**       | Runtime pour les services IA (FastAPI, XGBoost, spaCy)         | https://www.python.org/downloads/                        |
| Docker         | **29.2.1**       | Conteneurisation de l'infrastructure (PostgreSQL, Redis, etc.) | https://docs.docker.com/desktop/install/windows-install/ |
| Docker Compose | **v5.1.0**       | Orchestration multi-conteneurs en développement                | Inclus avec Docker Desktop                               |
| Git            | **2.53.0**       | Versionnement du code source                                   | https://git-scm.com/download/win                         |
| VS Code        | **1.115.0**      | Éditeur de code avec extensions                                | https://code.visualstudio.com/                           |

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
│  │  ├── citizen       :4000             ├── ai-service     :3003  │  │
│  │  ├── admin         :4001             └── anticorruption :3009  │  │
│  │  ├── governance    :4002                                       │  │
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
# Attendu : Docker Compose version v5.x.x
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

```powershell
# Se placer à la racine du monorepo
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform

# Copier le .env.example en .env (si pas déjà fait)
# cp .env.example .env  (déjà fait lors de la restructuration)

# Lancer toute l'infrastructure en arrière-plan
docker compose -f docker-compose.dev.yml up -d

# Vérifier que tous les conteneurs sont en "healthy" ou "running"
docker compose -f docker-compose.dev.yml ps
```

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

**Vérification individuelle de chaque service** :

```powershell
# PostgreSQL — connexion test
docker exec nina-postgres pg_isready -U nina -d nina_aes
# Attendu : /var/run/postgresql:5432 - accepting connections

# Redis — ping
docker exec nina-redis redis-cli -a nina_dev ping
# Attendu : PONG

# RabbitMQ — interface web
# Ouvrir http://localhost:15672 dans le navigateur
# Login : nina / nina_dev

# MinIO — console web
# Ouvrir http://localhost:9001 dans le navigateur
# Login : nina_minio / nina_minio_dev

# Elasticsearch — santé du cluster
curl -s http://localhost:9200/_cluster/health?pretty
# Attendu : "status" : "green" ou "yellow"

# Keycloak — page d'admin
# Ouvrir http://localhost:8080 dans le navigateur
# Login : admin / admin_dev

# Vault — statut
curl -s http://localhost:8200/v1/sys/health
# Attendu : {"initialized":true,"sealed":false,...}

# Maildev — interface web
# Ouvrir http://localhost:1080 dans le navigateur
```

---

### Étape 4.8 — Vérification des extensions PostgreSQL

Le script `init-db.sql` a normalement activé les extensions au premier démarrage. Vérifions.

```powershell
# Se connecter à PostgreSQL et lister les extensions
docker exec -it nina-postgres psql -U nina -d nina_aes -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
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
> docker exec -i nina-postgres psql -U nina -d nina_aes < scripts/init-db.sql
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
check "Docker Compose"  "docker compose version"    "v5.x.x"

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
EXTENSIONS=$(docker exec nina-postgres psql -U nina -d nina_aes -t -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp','pgcrypto','pg_trgm','unaccent') ORDER BY extname;" 2>/dev/null || echo "ERREUR")
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
for f in .env docker-compose.dev.yml package.json pnpm-workspace.yaml turbo.json Makefile .prettierrc .editorconfig commitlint.config.js; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ $f : MANQUANT"
    ERRORS=$((ERRORS + 1))
  fi
done

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
Check-Tool "Docker Compose" "docker compose version"

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
# Ouvrir http://localhost:4000 — la page par défaut doit s'afficher
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

### Fichier `docs/adr/ADR-009-environnement-dev.md`

```markdown
# ADR-009 — Infrastructure de développement conteneurisée

## Statut

Accepté — Avril 2026

## Contexte

Le projet nécessite 8 services d'infrastructure (PostgreSQL, Redis, RabbitMQ, MinIO, Elasticsearch,
Keycloak, Vault, Maildev). Les installer « en dur » sur le poste de développement serait fragile et
non reproductible.

## Décision

Toute l'infrastructure est conteneurisée via Docker Compose. Les microservices applicatifs (NestJS,
FastAPI) tournent en local hors Docker pour faciliter le debugging et le hot-reload.

## Conséquences

- Un seul `docker compose up -d` lance tout l'environnement
- `docker compose down` nettoie tout sans laisser de traces
- Les volumes Docker persistent les données entre les redémarrages
- Le hot-reload des services NestJS/FastAPI fonctionne nativement (pas de rebuild Docker)
```

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
- [ ] `docker compose -f docker-compose.dev.yml up -d` — 8 conteneurs running
- [ ] Extensions PostgreSQL vérifiées (uuid-ossp, pgcrypto, pg_trgm, unaccent)
- [ ] `scripts/check-env.sh` et `scripts/check-env.ps1` créés et exécutés avec succès
- [ ] `pnpm run dev:citizen` — portail citoyen accessible sur `http://localhost:4000`
- [ ] Commit Git : `chore(infra): add dev environment setup scripts and VS Code config`
- [ ] Mini-rapport rédigé
- [ ] Aucun secret en clair dans le code (le fichier `.env` est dans `.gitignore`)

---

## 10. Pour aller plus loin

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

_Document 03 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
