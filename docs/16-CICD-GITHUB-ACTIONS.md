# 16 — CI/CD (GitHub Actions, caches, scans, déploiement staging)

> **Bloc concerné** : Transversal (tous les blocs A → F) — pipeline outillé en parallèle du
> développement, durci en même temps que la sécurité (doc 15). **Prérequis** : documents 00 → 15
> complétés ; repository GitHub initialisé ; chaîne `pnpm run verify:repo` opérationnelle en local.
> **Durée estimée** : 8 à 12 heures pour un étudiant seul. **Livrables de cette étape** :
>
> - 5 workflows GitHub Actions canoniques sous `.github/workflows/` :
>   - `verify.yml` (chaîne `verify:repo` + lint + typecheck) — bloquant PR
>   - `test.yml` (Jest Node + Pytest Python + matrice services)
>   - `e2e.yml` (Playwright sur les 3 apps Next.js, mode mock)
>   - `build.yml` (Turborepo cache distant + images Docker + SBOM syft + cosign sign/attest/verify)
>   - `security.yml` (Trivy + Semgrep + gitleaks + pnpm audit + Bandit + OWASP ZAP DAST — ADR-034)
> - 1 workflow `deploy-staging.yml` (push `main`, **OIDC GitHub → K3s** sans kubeconfig, Helm)
> - 1 workflow réutilisable `_setup-node-pnpm.yml` (composable action)
> - Caches : pnpm store, Turborepo remote cache (S3 / MinIO interne), pip wheel, Playwright
>   browsers, Docker buildx
> - Branch protection sur `main` : `verify` + `test` + `security` requis
> - Renovate auto-merge sur dépendances mineures et patchs
> - Badges README : Build · Tests · Coverage · Security
> - `docs/adr/ADR-016-cicd-github-actions.md`

---

## 1. Objectif pédagogique

Un projet d'identité d'État ne peut pas survivre à un développement « heureux côté local mais cassé
en CI ». Trois principes structurent ce document :

1. **Le pipeline reflète exactement la chaîne locale**. Tout ce qui doit passer avant un commit doit
   aussi passer en CI : `pnpm run verify:repo`, lint, typecheck, tests unitaires, tests E2E mock,
   scans sécurité. Si la CI valide ce que le pre-commit ne valide pas (ou inversement), un dev finit
   par livrer du code rouge.

2. **Coût maîtrisé** = caches partout. Sans cache, un run prend ~20 min (install pnpm + Prisma
   generate + Turbo build + Pytest + Trivy). Avec pnpm store + Turbo remote cache + pip wheel cache,
   on tombe sous **5 min sur un PR moyen**. GitHub Actions est facturé à la minute (gratuit jusqu'à
   2 000 min/mois sur compte étudiant) — la frugalité est un objectif pédagogique en soi.

3. **Bloquant sans être paralysant**. Les jobs `verify` + `test` + `security` sont **required
   checks** sur `main`. Les jobs `e2e` et `build` Docker tournent sur PR mais ne bloquent que sur
   `main` (où ils sont indispensables pour staging). Renovate fait passer les bumps mineurs/patches
   sans intervention humaine quand toute la matrice est verte.

> 💡 **Pourquoi GitHub Actions et pas GitLab CI / Drone / Jenkins ?** Trois raisons documentées dans
> `ADR-016` : (1) repo déjà sur GitHub, pas de fric à monter une infra CI séparée pour un projet
> universitaire, (2) marketplace très riche d'actions officielles (`pnpm/action-setup`,
> `actions/setup-node`, `aquasecurity/trivy-action`), (3) intégration native avec les
> branch-protection rules, sans plugin tiers. La souveraineté est préservée car on peut **rejouer
> localement** chaque workflow via `act` ou réécrire les 5 fichiers vers GitLab CI en quelques
> heures si nécessaire.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                           | Version                       | Rôle                                                                   |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| **GitHub Actions runners**          | `ubuntu-24.04`                | Runner par défaut — Ubuntu 24.04 LTS                                   |
| **actions/checkout**                | `v4` → **digest SHA**         | Checkout du repo (avec `fetch-depth: 0` pour gitleaks)                 |
| **pnpm/action-setup**               | `v4` → **digest SHA**         | Installation pnpm pinned via `packageManager`                          |
| **actions/setup-node**              | `v4` → **digest SHA**         | Node 24 LTS + cache pnpm store automatique                             |
| **actions/setup-python**            | `v5` → **digest SHA**         | Python 3.14 + cache pip                                                |
| **actions/cache**                   | `v4` → **digest SHA**         | Cache Turbo + Playwright browsers + Docker buildx                      |
| **docker/setup-buildx-action**      | `v3` → **digest SHA**         | Buildx pour images multi-stage + cache distant                         |
| **docker/build-push-action**        | `v6` → **digest SHA**         | Build + push vers GHCR (`ghcr.io/<org>/<image>`)                       |
| **aquasecurity/trivy-action**       | ~~`master`~~ → **digest SHA** | Scan FS + images Docker — `severity: CRITICAL,HIGH` (jamais `@master`) |
| **returntocorp/semgrep-action**     | `v1` → **digest SHA**         | Static analysis OWASP + secrets accidentels                            |
| **gitleaks/gitleaks-action**        | `v2` → **digest SHA**         | Détection de secrets dans l'historique git                             |
| **pypa/gh-action-pip-audit**        | `v1` → **digest SHA**         | Audit deps Python (vs requirements.txt)                                |
| **sigstore/cosign-installer**       | `v3` → **digest SHA**         | Install `cosign` (signature + attestation images)                      |
| **anchore/sbom-action** (`syft`)    | `v0` → **digest SHA**         | Génère le SBOM CycloneDX/SPDX par image                                |
| **codecov/codecov-action**          | `v5` → **digest SHA**         | Upload couverture (optionnel — sinon artefact)                         |
| **peter-evans/create-pull-request** | `v7` → **digest SHA**         | PRs automatiques (Renovate fallback, etc.)                             |
| **Turborepo Remote Cache**          | self-hosted                   | Cache Turbo `.turbo/` sur MinIO interne (souverain)                    |
| **Renovate**                        | `app`                         | Bumps dépendances automatisés (alternative Dependabot)                 |
| **act (CLI)**                       | `0.2.66+`                     | Rejoue les workflows en local (Docker)                                 |

> 🔒 Tous les outils sont open-source / souverains. Codecov reste optionnel (Codecov est US) —
> fallback : artefact `coverage-final.json` dans l'onglet Actions.

> 🎯 **Pinning par digest SHA — règle non négociable (cible).** Une référence mutable (`@v4`,
> `@master`, `@main`) résout, **à chaque run**, vers le `HEAD` courant du tag : si l'action est
> compromise (compromission de mainteneur, supply-chain), le code malveillant s'exécute avec les
> permissions du workflow (et l'accès aux `secrets`). Le pinning par **digest immuable** ferme cette
> porte. Forme canonique : `uses: owner/action@<sha40> # vX.Y.Z`.
>
> ```yaml
> # ❌ MUTABLE — proscrit (l'arbre derrière le tag peut changer sans préavis)
> - uses: actions/checkout@v4
> - uses: aquasecurity/trivy-action@master # le pire : branche mouvante
>
> # ✅ CIBLE — digest SHA immuable + commentaire de version lisible
> - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
> - uses: aquasecurity/trivy-action@18f2510ce396bb8e5f17ff86a32cb43f88f2e4ee # v0.29.0
> ```
>
> Les digests ci-dessus sont **illustratifs** — le digest réel se résout au moment du pinning
> (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`, ou l'outil `pin-github-action` /
> `ratchet`). Renovate (§4.9) **maintient à jour** un pin par digest tout en gardant le commentaire
> de version : activer le preset `helpers:pinGitHubActionDigests`. La règle Semgrep
> `p/github-actions` et un `actionlint` en CI rejettent toute référence mutable résiduelle.

> ⚠️ **HONNÊTETÉ — réel vs cible.** Les workflows **réellement présents** dans `.github/workflows/`
> à ce jour sont `ci.yml`, `cd-staging.yml`, `codeql.yml`, `release.yml`, `train-models.yml`,
> `version-check.yml` (la composite action `.github/actions/setup-node-pnpm/` existe). Ils **pinnent
> encore par tag mutable** (`actions/checkout@v4`, `azure/setup-helm@v4`,
> `aquasecurity/trivy-action@master`, `returntocorp/semgrep-action@v1`,
> `gitleaks/gitleaks-action@v2`, `docker/*@v3..v6`, `github/codeql-action/*@v3` — vérifiable par
> `grep -rE 'uses:.*@(v[0-9]+|master|main)' .github/workflows/`). Le découpage en 5 fichiers
> canoniques (`verify/test/e2e/security/build` + `deploy-staging`) et le pinning par digest décrits
> ci-dessous sont la **cible Phase 2** ⏳ — pas l'état committé. Tout extrait YAML de ce document
> est un **gabarit pédagogique**, pas un dump du réel.

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_CICD
title CI/CD GitHub Actions — vue d'ensemble

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam rectangle {
  BackgroundColor #EEF2FF
  BorderColor #4F46E5
}
skinparam cloud {
  BackgroundColor #ECFDF5
  BorderColor #059669
}

actor "Dev étudiant" as Dev
rectangle "Pre-commit local\n(Husky)\n• lint-staged\n• verify:repo" as Local

cloud "GitHub" {
  rectangle "Branche `feat/*`\nPR vers `develop` ou `main`" as PR
  rectangle "Workflow: verify.yml\n• lint + typecheck\n• verify:repo\n(BLOQUANT)" as Verify
  rectangle "Workflow: test.yml\n• Jest (Node)\n• Pytest (FastAPI)\n• Couverture artefact\n(BLOQUANT)" as Test
  rectangle "Workflow: e2e.yml\n• Playwright mock\n• 3 apps Next.js" as E2E
  rectangle "Workflow: security.yml\n• Trivy · Semgrep\n• gitleaks · pip-audit\n• Bandit\n(BLOQUANT)" as Security
  rectangle "Workflow: build.yml\n• Turbo build (cache)\n• Docker buildx\n• Push GHCR" as Build
  rectangle "Workflow: deploy-staging.yml\n• Helm upgrade --install\n• Smoke test API" as Deploy
}

cloud "Infra MinIO interne\n(souverain)" as MinIO {
  rectangle "Turbo Remote Cache\n.turbo/* (.tgz)" as TurboCache
  rectangle "GHCR mirror\nimages Docker" as Registry
}

cloud "K3s staging\n(CTDEC sandbox)" as K3s

Dev --> Local : git commit
Local --> PR : git push
PR --> Verify
PR --> Test
PR --> E2E : non-bloquant sauf main
PR --> Security
Verify --> Build : si main
Test --> Build : si main
Security --> Build : si main
Build --> Registry : push image\ntag = git-sha
Build --> Deploy
Deploy --> K3s : helm upgrade

TurboCache <.. Build : pull/push cache

note bottom of Verify
  Required check : verify
end note
note bottom of Test
  Required check : test
end note
note bottom of Security
  Required check : security
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Action réutilisable : setup Node + pnpm

**Pourquoi** : on duplique 4 fois la même séquence (`checkout` → `setup-pnpm` → `setup-node` →
`install`) dans `verify`, `test`, `e2e`, `build`. Factoriser via une **composite action** locale
(pas une reusable workflow — plus simple) réduit la maintenance.

**Fichier(s) à créer/modifier** :

```yaml
# .github/actions/setup-node-pnpm/action.yml
name: Setup Node + pnpm
description: |
  Composite action : checkout (déjà fait par caller), pnpm, node 24, install
  avec cache pnpm store.

inputs:
  install:
    description: 'Run pnpm install --frozen-lockfile'
    required: false
    default: 'true'

runs:
  using: composite
  steps:
    - name: Setup pnpm (from package.json packageManager)
      # 🎯 CIBLE : pin par digest SHA (le commentaire conserve la version lisible)
      uses: pnpm/action-setup@a3252b78c470c02df07e9d59298aecedc3ccdd6d # v3.0.0
      with:
        run_install: false

    - name: Setup Node ${{ env.NODE_VERSION }}
      uses: actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a # v4.2.0
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'

    - name: Install deps
      if: inputs.install == 'true'
      shell: bash
      run: pnpm install --frozen-lockfile
```

```text
# .nvmrc (créer à la racine)
24
```

> 💡 La version pnpm est lue depuis `package.json` → `packageManager: "pnpm@10.12.1"` (déjà
> présent). Pas besoin de variable d'env.

---

### Étape 4.2 — Workflow `verify.yml` (bloquant)

**Pourquoi** : c'est le check minimal — il replique exactement le pre-commit local. Si `verify:repo`
passe en local mais pas en CI, c'est un dérive d'environnement à corriger immédiatement.

```yaml
# .github/workflows/verify.yml
name: verify

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Lint · Typecheck · verify:repo
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      # 🎯 actions tierces pinnées par digest ; action locale (./…) pinnée par le commit du repo
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - uses: ./.github/actions/setup-node-pnpm

      - name: Lint (ESLint + Prettier check)
        run: pnpm run lint

      - name: Format check
        run: pnpm run format:check

      - name: Typecheck (Turbo)
        run: pnpm run check-types

      - name: verify:repo (data + schemas + docs sync)
        run: pnpm run verify:repo
```

**Validation** :

```powershell
# Rejoue le workflow en local via `act` (nécessite Docker)
act -W .github/workflows/verify.yml pull_request
```

---

### Étape 4.3 — Workflow `test.yml` (Jest Node + Pytest Python)

**Pourquoi** : sépare les tests unitaires du `verify` pour parallélisme et diagnostic clair (un
échec test ne masque pas un échec lint).

```yaml
# .github/workflows/test.yml
name: test

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ── Tests Node (Jest) ─────────────────────────────────────────────
  test-node:
    name: Jest (Node packages + services)
    runs-on: ubuntu-24.04
    timeout-minutes: 15

    services:
      postgres:
        image: postgis/postgis:18-3.6
        env:
          POSTGRES_USER: nina_admin
          POSTGRES_PASSWORD: ci-test-password-do-not-reuse
          POSTGRES_DB: nina_aes_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U nina_admin -d nina_aes_test" --health-interval 10s
          --health-timeout 5s --health-retries 10

      redis:
        image: redis:8.6.3-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5

    env:
      DATABASE_URL: postgresql://nina_admin:ci-test-password-do-not-reuse@localhost:5432/nina_aes_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: ci-test-jwt-secret-minimum-32-characters-long-padding
      NODE_ENV: test

    # 📌 RAPPEL pinning : dans les snippets ci-dessous les `@v4`/`@v5`/`@v3` sont gardés LISIBLES pour
    # la pédagogie, mais la cible §2 impose le digest SHA (`uses: owner/action@<sha40> # vX.Y.Z`)
    # pour TOUTE action tierce. Idem dans e2e.yml et security.yml.
    steps:
      - uses: actions/checkout@v4 # 🎯 → digest SHA en cible (cf. §2)
      - uses: ./.github/actions/setup-node-pnpm

      - name: Activate PostGIS extension
        run: |
          PGPASSWORD=ci-test-password-do-not-reuse psql -h localhost -U nina_admin \
            -d nina_aes_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"

      - name: Generate Prisma client
        run: pnpm --filter @nina-aes/database db:generate

      - name: Apply Prisma migrations
        run: pnpm --filter @nina-aes/database exec prisma migrate deploy

      - name: Run Jest (root + all packages)
        run: pnpm test -- --coverage

      - name: Upload coverage artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: jest-coverage
          path: '**/coverage/coverage-final.json'
          retention-days: 14

  # ── Tests Python (Pytest) ─────────────────────────────────────────
  test-python:
    name: Pytest (FastAPI services)
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    strategy:
      fail-fast: false
      matrix:
        service: [ai-service, anticorruption-service]
    defaults:
      run:
        working-directory: services/${{ matrix.service }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.14'
          cache: 'pip'
          cache-dependency-path: services/${{ matrix.service }}/requirements.txt

      - name: Install deps
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov httpx

      - name: Run pytest
        run: pytest tests/ -v --cov=app --cov-report=xml --cov-report=term

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: pytest-coverage-${{ matrix.service }}
          path: services/${{ matrix.service }}/coverage.xml
          retention-days: 14
```

> ⚠️ **Sur les credentials CI** : le mot de passe Postgres est volontairement visible en clair dans
> le YAML (pattern `ci-test-password-do-not-reuse`). C'est une **string contextualisée** qui ne
> donne accès qu'au container postgres éphémère du runner — il ne s'agit pas d'un secret. La règle
> reste : aucun secret réel n'apparaît dans un workflow ; ils passent par `${{ secrets.* }}` qui
> pointent vers GitHub Actions Secrets.

---

### Étape 4.4 — Workflow `e2e.yml` (Playwright, mode mock)

**Pourquoi** : les 11 tests Playwright (livrés Session 5, mode `NINA_AUTH_MODE=mock`) valident le
parcours frontend bout-en-bout sans dépendre des microservices NestJS. Idéal pour PR : pas besoin de
provisionner Keycloak/identity-service en CI.

```yaml
# .github/workflows/e2e.yml
name: e2e

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  playwright:
    name: Playwright (mock auth)
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    env:
      NINA_AUTH_MODE: mock
      CI: 'true'

    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Build apps (Turbo)
        run: pnpm run build --filter=@nina-aes/citizen --filter=@nina-aes/admin

      - name: Run Playwright tests
        run: pnpm exec playwright test --reporter=html

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

---

### Étape 4.5 — Workflow `security.yml` (Trivy + Semgrep + gitleaks + audits deps)

**Pourquoi** : c'est la matérialisation des scans de la doc 15 dans le pipeline. Bloque le merge si
une CVE CRITICAL/HIGH apparaît, un secret est commité, ou une règle Semgrep OWASP est violée.

> 🔗 **Renvoi sécurité (ADR-034).** Le détail des outils, seuils et exceptions de la chaîne de scan
> est tenu dans la doc 15 et **ADR-034** (mTLS strict + PKI + rotation clés/JWKS + OWASP + scans
> CI). Couverture cible : **Trivy** (CVE FS + images), **Semgrep** (`p/owasp-top-ten` + langages),
> **gitleaks** (secrets dans l'historique), **Bandit** (statique Python), **pnpm/pip-audit** (deps),
> et **OWASP ZAP** en DAST sur l'API staging (baseline scan, cf. §4.7 / doc 15). Toute divergence de
> seuils se réconcilie côté ADR-034 — ce document ne fait que **câbler** ces scans en CI.

```yaml
# .github/workflows/security.yml
name: security

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
  schedule:
    # Re-scan nocturne à 03:00 UTC pour capter les nouvelles CVEs
    - cron: '0 3 * * *'

permissions:
  contents: read
  security-events: write # nécessaire pour push SARIF vers Security tab

jobs:
  trivy-fs:
    name: Trivy (filesystem)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
      - name: Trivy fs scan
        # 🎯 jamais @master : pin par digest immuable (l'action Trivy avait justement publié sur master)
        uses: aquasecurity/trivy-action@18f2510ce396bb8e5f17ff86a32cb43f88f2e4ee # v0.29.0
        with:
          scan-type: fs
          scan-ref: .
          severity: CRITICAL,HIGH
          exit-code: 1
          format: sarif
          output: trivy-fs.sarif
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-fs.sarif

  semgrep:
    name: Semgrep (OWASP rules)
    runs-on: ubuntu-24.04
    container:
      image: returntocorp/semgrep:1.110
    steps:
      - uses: actions/checkout@v4
      - run:
          semgrep ci --config p/owasp-top-ten --config p/javascript --config p/typescript --config
          p/python --error

  gitleaks:
    name: gitleaks (secrets)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # historique complet requis
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  pnpm-audit:
    name: pnpm audit (Node deps)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm
        with:
          install: 'false'
      - run: pnpm audit --audit-level=high --prod
        continue-on-error: false

  pip-audit:
    name: pip-audit (Python deps)
    runs-on: ubuntu-24.04
    strategy:
      matrix:
        service: [ai-service, anticorruption-service]
    steps:
      - uses: actions/checkout@v4
      - uses: pypa/gh-action-pip-audit@v1
        with:
          inputs: services/${{ matrix.service }}/requirements.txt

  bandit:
    name: Bandit (Python static)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.14'
      - run: pip install bandit[toml]
      - run: bandit -r services/ai-service/app services/anticorruption-service/app -ll

  # ── DAST OWASP ZAP (post-déploiement staging) ─────────────────────
  # ⏳ Cible Phase 2 : ne se déclenche que sur `main` après `deploy-staging` (besoin d'une cible live).
  # Reste un baseline scan passif (non bloquant au départ pour éviter le bruit), géré côté ADR-034.
  zap-baseline:
    name: OWASP ZAP (DAST baseline — staging)
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
      - name: ZAP baseline scan
        uses: zaproxy/action-baseline@5f5e1f2eda1e8fd9da0b0a3a7e1c8b3b1e8d9f0a # v0.12.0 (digest illustratif)
        with:
          target: 'https://staging.nina-aes.uqar.ca'
          # règles/seuils gérés par .zap/rules.tsv ; voir doc 15 + ADR-034
```

---

### Étape 4.6 — Workflow `build.yml` (Turbo cache + Docker buildx)

**Pourquoi** : sur `main`, on construit toutes les images Docker et on les pousse vers GHCR (GitHub
Container Registry) avec tag = `git-sha`. Le job exploite un **Turbo remote cache** auto-hébergé
(MinIO interne) pour ne pas re-builder ce que `verify` a déjà compilé.

```yaml
# .github/workflows/build.yml
name: build

on:
  push:
    branches: [main]
  workflow_call: {} # appelable par deploy-staging.yml

permissions:
  contents: read
  packages: write # push GHCR
  id-token: write # 🎯 OIDC : keyless cosign (Fulcio/Rekor) — pas de clé privée en secret
  #   ⚠️ Fulcio/Rekor = Sigstore public-good (Linux Foundation, hors souveraineté CTDEC) ;
  #      pour le cœur prod, viser une instance Sigstore privée — cf. §10 / ADR-034.
  attestations: write # provenance/SBOM attestations

env:
  TURBO_API: ${{ secrets.TURBO_REMOTE_CACHE_URL }} # ex. https://turbo-cache.aes.internal
  TURBO_TOKEN: ${{ secrets.TURBO_REMOTE_CACHE_TOKEN }}
  TURBO_TEAM: nina-aes
  REGISTRY: ghcr.io

jobs:
  turbo-build:
    name: Turbo build (with remote cache)
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-node-pnpm
      - name: Build all
        run: pnpm run build

  docker-images:
    name: Docker · ${{ matrix.service }}
    runs-on: ubuntu-24.04
    needs: turbo-build
    strategy:
      fail-fast: false
      matrix:
        service:
          - identity-service
          - auth-service
          - audit-service
          - document-service
          - ai-service
          - anticorruption-service
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - uses: docker/setup-buildx-action@988b5a0280414f521da01fcc63a27aeeb4b104db # v3.6.1

      - uses: docker/login-action@9780b0c442fbb1117ed29e0efdff1e18412f7567 # v3.3.0
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # 🎯 cosign keyless (OIDC) : aucune clé privée stockée en secret
      - uses: sigstore/cosign-installer@dc72c7d5c4d10cd6bcb8cf6e3fd625a9e5e537da # v3.7.0

      - name: Determine Dockerfile
        id: dockerfile
        run: |
          if [[ "${{ matrix.service }}" == *"-service" && \
                ( "${{ matrix.service }}" == "ai-service" || \
                  "${{ matrix.service }}" == "anticorruption-service" ) ]]; then
            echo "path=infrastructure/docker/Dockerfile.fastapi" >> $GITHUB_OUTPUT
          else
            echo "path=infrastructure/docker/Dockerfile.nestjs" >> $GITHUB_OUTPUT
          fi

      - name: Build & push image
        id: build
        uses: docker/build-push-action@5176d81f87c23d6fc96624dfdbcd9f3830bbe445 # v6.5.0
        with:
          context: .
          file: ${{ steps.dockerfile.outputs.path }}
          build-args: SERVICE=${{ matrix.service }}
          push: true
          # provenance + SBOM attestés directement par buildx (SLSA)
          provenance: mode=max
          sbom: true
          tags: |
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}:main
          cache-from: type=gha,scope=${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=${{ matrix.service }}

      - name: Trivy scan image
        uses: aquasecurity/trivy-action@18f2510ce396bb8e5f17ff86a32cb43f88f2e4ee # v0.29.0
        with:
          image-ref:
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}:${{
            github.sha }}
          severity: CRITICAL,HIGH
          exit-code: 1

      # ── Chaîne d'approvisionnement : SBOM → signature → attestation → vérif ──
      - name: Generate SBOM (syft, CycloneDX)
        uses: anchore/sbom-action@61119d458adab75f756bc0b9e4bde25725f86a7a # v0.17.2
        with:
          image:
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}:${{
            github.sha }}
          format: cyclonedx-json
          output-file: sbom-${{ matrix.service }}.cdx.json

      - name: cosign sign (keyless, OIDC)
        env:
          IMG:
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}@${{
            steps.build.outputs.digest }}
        run: |
          # signe par DIGEST (jamais par tag mutable) ; identité Fulcio = le repo+workflow GitHub
          cosign sign --yes "$IMG"

      - name: cosign attest SBOM (CycloneDX)
        env:
          IMG:
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}@${{
            steps.build.outputs.digest }}
        run: |
          cosign attest --yes \
            --type cyclonedx \
            --predicate sbom-${{ matrix.service }}.cdx.json \
            "$IMG"

      - name: cosign verify (gate avant publication "main")
        env:
          IMG:
            ${{ env.REGISTRY }}/${{ github.repository_owner }}/nina-aes-${{ matrix.service }}@${{
            steps.build.outputs.digest }}
        run: |
          # le déploiement (Kyverno/policy admission côté K3s) DOIT rejeter une image non signée
          cosign verify "$IMG" \
            --certificate-identity-regexp \
              "https://github.com/${{ github.repository_owner }}/nina-aes-platform/.github/workflows/.+@refs/heads/main" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com"

      - name: Upload SBOM artifact
        if: always()
        uses: actions/upload-artifact@v4 # 🎯 à pinner par digest comme les autres
        with:
          name: sbom-${{ matrix.service }}
          path: sbom-${{ matrix.service }}.cdx.json
          retention-days: 30
```

> 🔐 **cosign keyless (OIDC), pas de clé privée en secret.** `cosign sign`/`attest` utilisent le
> token OIDC `id-token: write` du workflow : Fulcio émet un certificat éphémère lié à l'identité
> `repo:…/nina-aes-platform:ref:refs/heads/main`, la signature est journalisée dans Rekor
> (transparence). Aucune `COSIGN_PRIVATE_KEY` à stocker/roter. Le déploiement (§4.7) **vérifie** la
> signature avant rollout : un attaquant qui pousserait une image non signée sur GHCR serait rejeté
> à l'admission K3s (policy Kyverno/`cosign verify`). On signe et on attest **par digest**
> (`@${{ steps.build.outputs.digest }}`), jamais par tag, pour que la signature couvre exactement le
> bit-for-bit déployé.
>
> ⚠️ **Réserve de souveraineté.** Fulcio (CA éphémère) et Rekor (log de transparence) sont des
> services **Sigstore public-good** opérés par la **Linux Foundation** (hors souveraineté CTDEC) :
> la chaîne de signature n'est donc **pas 100 % souveraine** par défaut. Pour le cœur production,
> viser une **instance Sigstore privée** (Fulcio + Rekor self-hosted) — cf. §10 / ADR-034.

---

### Étape 4.7 — Workflow `deploy-staging.yml` (Helm K3s)

**Pourquoi** : après un build vert sur `main`, on déploie automatiquement sur le cluster K3s staging
(CTDEC sandbox). Le workflow consomme le tag `git-sha` produit par `build.yml`.

```yaml
# .github/workflows/deploy-staging.yml
name: deploy-staging

on:
  push:
    branches: [main]

concurrency:
  group: deploy-staging
  cancel-in-progress: false # ne jamais annuler un déploiement en cours

# 🎯 OIDC : le job demande un token d'identité GitHub ; AUCUN kubeconfig long-lived en secret
permissions:
  contents: read
  id-token: write # token OIDC pour s'authentifier auprès de l'API K3s

jobs:
  build:
    uses: ./.github/workflows/build.yml
    secrets: inherit

  deploy:
    name: Helm upgrade staging
    runs-on: ubuntu-24.04
    needs: build
    environment:
      name: staging
      url: https://staging.nina-aes.uqar.ca
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - name: Setup kubectl + helm
        uses: azure/setup-helm@b9e51907a09c216f16ebe8536097933489208112 # v4.3.0
        with:
          version: '3.16.4'

      - uses: sigstore/cosign-installer@dc72c7d5c4d10cd6bcb8cf6e3fd625a9e5e537da # v3.7.0

      # ── Auth API K3s via OIDC (pas de kubeconfig persistant) ──────────
      # GitHub émet un JWT court (≈ exécution du job) ; l'API server K3s est configuré en OIDC
      # (--oidc-issuer-url=https://token.actions.githubusercontent.com) et un RoleBinding mappe le
      # claim sub `repo:<org>/nina-aes-platform:ref:refs/heads/main` → Role limité au namespace
      # nina-aes-staging (jamais cluster-admin). Voir infrastructure/k3s/staging-oidc-rbac.yaml.
      - name: Get GitHub OIDC token & build kubeconfig (ephemeral, in-memory)
        run: |
          OIDC_TOKEN="$(curl -fsSL \
            -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
            "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=k3s-staging" | jq -r .value)"
          # kubeconfig sans credential persistant : seul le bearer-token OIDC éphémère est posé
          kubectl config set-cluster k3s-staging \
            --server="${{ vars.K3S_STAGING_API }}" \
            --certificate-authority=<(echo "${{ vars.K3S_STAGING_CA }}")
          kubectl config set-credentials gha-oidc --token="$OIDC_TOKEN"
          kubectl config set-context staging \
            --cluster=k3s-staging --user=gha-oidc --namespace=nina-aes-staging
          kubectl config use-context staging

      # ── Gate sécurité : refuser de déployer une image non signée (cosign) ──
      - name: Verify image signatures before rollout
        run: |
          for svc in identity-service auth-service audit-service document-service ai-service anticorruption-service; do
            cosign verify \
              "${REGISTRY:-ghcr.io}/${{ github.repository_owner }}/nina-aes-$svc:${{ github.sha }}" \
              --certificate-identity-regexp \
                "https://github.com/${{ github.repository_owner }}/nina-aes-platform/.github/workflows/.+@refs/heads/main" \
              --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
          done

      - name: Helm upgrade
        run: |
          helm upgrade --install nina-aes ./infrastructure/helm/nina-aes \
            --namespace nina-aes-staging \
            --create-namespace \
            --set image.tag=${{ github.sha }} \
            --set ingress.host=staging.nina-aes.uqar.ca \
            --wait --timeout 10m

      - name: Smoke test API
        run: |
          # ⚠️ Route /health (PAS /api/health) : les services NestJS EXCLUENT `health` du préfixe
          # api/v1 (setGlobalPrefix exclude) pour matcher la sonde Docker `curl /health`.
          curl -fsSL --retry 5 --retry-delay 10 \
            https://staging.nina-aes.uqar.ca/health \
            | grep '"status":"ok"'
```

> 🔒 **Plus de `K3S_STAGING_KUBECONFIG` long-lived.** Le déploiement s'authentifie via **OIDC** :
> GitHub émet un token court, l'API server K3s vérifie l'émetteur
> (`token.actions.githubusercontent.com`) et le claim `sub`
> (`repo:<org>/nina-aes-platform:ref:refs/heads/main`), mappé par RoleBinding à un Role **limité au
> namespace** `nina-aes-staging` (jamais cluster-admin). Aucun credential persistant ne traîne dans
> les secrets → rien à roter, rien à exfiltrer. RBAC et trust OIDC :
> `infrastructure/k3s/staging-oidc-rbac.yaml`. Le **gate cosign** garantit en plus qu'aucune image
> non signée par ce repo ne sera déployée (souveraineté de la chaîne d'appro).
>
> ⏳ **Phase 2 (honnêteté).** Le workflow réel `cd-staging.yml` utilise encore `azure/setup-helm@v4`
>
> - `azure/setup-kubectl@v4` (tags mutables) et un kubeconfig en secret ; la bascule OIDC + cosign
>   verify ci-dessus est **conçue, à implémenter**, pas l'état committé.

---

### Étape 4.8 — Branch protection sur `main`

**Configuration UI GitHub** (Settings → Branches → Branch protection rules) :

| Réglage                                          | Valeur                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Require a pull request before merging            | ✅ + 1 reviewer (tuteur ou co-étudiant)                                 |
| Require status checks to pass before merging     | ✅                                                                      |
| → Required checks                                | `verify`, `test-node`, `test-python`, `gitleaks`, `trivy-fs`, `semgrep` |
| Require branches to be up to date before merging | ✅                                                                      |
| Require conversation resolution before merging   | ✅                                                                      |
| Require linear history                           | ✅ (rebase-and-merge uniquement)                                        |
| Require signed commits                           | ✅ **OBLIGATOIRE** — gitsign (Sigstore keyless) ou GPG/SSH signing      |
| Include administrators                           | ✅ (même l'étudiant ne peut pas bypass)                                 |
| Allow force pushes                               | ❌                                                                      |
| Allow deletions                                  | ❌                                                                      |

> 💡 Pour un projet solo universitaire, le « 1 reviewer » est levé (sinon personne ne peut merger).
> Compromis : exiger qu'un test de relecture minimal soit fait par soi-même via
> `gh pr review --approve` après une nuit de recul.

> 🔏 **Commits signés obligatoires.** « Require signed commits » est activé : tout commit non signé
> est **refusé au merge**. Deux options (avec réserve de souveraineté) :
>
> ```bash
> # Option A — gitsign (Sigstore keyless, cohérent avec cosign : pas de clé à gérer)
> #   identité = OIDC ; signature journalisée dans Rekor.
> git config --global commit.gpgsign true
> git config --global gpg.x509.program gitsign
> git config --global gpg.format x509
>
> # Option B — GPG/SSH classique (clé privée locale, à protéger par passphrase)
> git config --global commit.gpgsign true
> git config --global gpg.format ssh
> git config --global user.signingkey ~/.ssh/id_ed25519.pub
> ```
>
> Cohérence d'ensemble : **commits signés** (gitsign) + **images signées** (cosign) = même racine de
> confiance Sigstore, aucune clé privée long-lived à stocker (cf. CANON sécurité : pas de secret en
> clair, OIDC partout). ⏳ Activation = réglage UI GitHub + config locale, pas un fichier de ce
> repo.
>
> ⚠️ **Réserve de souveraineté (honnêteté soutenance).** L'option A (gitsign keyless) **comme** la
> signature d'images cosign keyless reposent sur l'infrastructure **Sigstore public-good** —
> **Fulcio** (autorité de certification éphémère) et **Rekor** (log de transparence) — opérée par la
> **Linux Foundation** (infra majoritairement US). Ce n'est donc **pas** une racine de confiance «
> 100 % souveraine » : c'est la même catégorie de dépendance que celle pour laquelle le doc rejette
> Codecov (l. 79, « car US ») et qu'ADR-034 écarte pour les SaaS US sur le cœur. Deux mitigations
> réellement souveraines :
>
> - **Sigstore privé self-hosted** : déployer **Fulcio + Rekor** sur l'infra CTDEC (instance privée,
>   racine de confiance nationale) — cible Phase 2, cf. §10 / ADR-034.
> - **GPG/SSH classique (option B)** : clé gérée **on-premise** (HSM ou passphrase locale), aucune
>   dépendance Sigstore. C'est le chemin **réellement souverain** disponible **dès aujourd'hui**
>   pour le cœur production ; la commodité keyless est alors échangée contre la gestion locale d'une
>   clé.

---

### Étape 4.9 — Renovate (bumps automatisés)

**Fichier(s) à créer** :

```json
// renovate.json (racine du repo)
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":semanticCommits",
    ":separateMajorReleases",
    ":automergeMinor",
    ":automergePatch"
  ],
  "timezone": "America/Toronto",
  "schedule": ["after 1am and before 5am every weekday"],
  "labels": ["dependencies", "renovate"],
  "prHourlyLimit": 4,
  "prConcurrentLimit": 8,
  "packageRules": [
    {
      "matchManagers": ["npm"],
      "matchUpdateTypes": ["major"],
      "addLabels": ["needs-manual-review"]
    },
    {
      "matchPackagePatterns": ["^@prisma/", "^prisma$"],
      "groupName": "prisma",
      "addLabels": ["needs-manual-review"]
    },
    {
      "matchPackagePatterns": ["^next$", "^react$"],
      "groupName": "next-react",
      "addLabels": ["needs-manual-review"]
    },
    {
      "matchManagers": ["pip_requirements"],
      "rangeStrategy": "bump"
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security", "urgent"]
  }
}
```

L'app Renovate s'installe via GitHub Marketplace (`Settings → Integrations → Renovate`).
Configuration validée au prochain run nocturne.

---

### Étape 4.10 — Badges README

**Fichier(s) à modifier** : `README.md` (haut du fichier).

```markdown
[![verify](https://github.com/<org>/nina-aes-platform/actions/workflows/verify.yml/badge.svg)](https://github.com/<org>/nina-aes-platform/actions/workflows/verify.yml)
[![test](https://github.com/<org>/nina-aes-platform/actions/workflows/test.yml/badge.svg)](https://github.com/<org>/nina-aes-platform/actions/workflows/test.yml)
[![e2e](https://github.com/<org>/nina-aes-platform/actions/workflows/e2e.yml/badge.svg)](https://github.com/<org>/nina-aes-platform/actions/workflows/e2e.yml)
[![security](https://github.com/<org>/nina-aes-platform/actions/workflows/security.yml/badge.svg)](https://github.com/<org>/nina-aes-platform/actions/workflows/security.yml)
```

---

## 5. Validation locale (act)

Avant de pousser, rejouer **chaque** workflow en local via [act](https://nektosact.com/) :

```powershell
# Installation Windows : scoop install act ; ou : choco install act-cli
# Sur Linux/macOS : brew install act

# Rejoue le workflow verify
act -W .github/workflows/verify.yml pull_request

# Rejoue test (avec services PostGIS/Redis via Docker)
act -W .github/workflows/test.yml pull_request --container-architecture linux/amd64

# Rejoue security (avec un secret factice GITHUB_TOKEN)
act -W .github/workflows/security.yml pull_request -s GITHUB_TOKEN=fake-token-for-act
```

> 💡 `act` est un outil souverain (Go, MIT) qui simule GitHub Actions en local. Il est ~85 % fidèle
> — quelques actions (notamment celles qui dépendent de l'API GitHub comme `gh`) ne marchent qu'en
> CI réelle.

---

## 6. Pièges courants & dépannage

| Symptôme                                                       | Cause probable                                                                 | Solution                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` lent (~3 min) à chaque run                      | Cache pnpm non hit                                                             | Vérifier que `cache: 'pnpm'` est bien dans `setup-node@v4` et que `pnpm-lock.yaml` est commité                                         |
| `verify:repo` passe en local mais échoue en CI                 | Locale `fr-FR.UTF-8` absente du runner Ubuntu                                  | Ajouter `LC_ALL: en_US.UTF-8` dans `env:` du job                                                                                       |
| Postgres CI : `database "nina_aes_test" does not exist`        | L'image `postgis/postgis:18` ne crée pas la DB tant que `POSTGRES_DB` non posé | Vérifier `env: POSTGRES_DB: nina_aes_test` dans `services.postgres`                                                                    |
| Playwright : `Error: browserType.launch: ... missing X server` | Browsers installés sans `--with-deps`                                          | `pnpm exec playwright install --with-deps chromium`                                                                                    |
| `gitleaks` faux positif sur exemples (ex. `JWT_SECRET=foo`)    | Patterns par défaut trop larges                                                | Ajouter `.gitleaks.toml` avec `[allowlist]` et un commentaire ticket                                                                   |
| `Trivy` failed: `unable to find vulnerability database`        | DB Trivy down (rare)                                                           | Retry — DB hostée chez Aqua (dépendance externe acceptée hors cœur ; mirroring possible via registre OCI interne pour la souveraineté) |
| Turbo remote cache MISS systématique                           | Token / URL mal configurés                                                     | Vérifier `TURBO_API` + `TURBO_TOKEN` dans secrets ; `turbo run build --dry=json` pour debug                                            |
| Push GHCR : `denied: installation not allowed to upload`       | Permissions du `GITHUB_TOKEN` du workflow trop faibles                         | Ajouter `permissions: packages: write` au niveau workflow                                                                              |
| Deploy staging : `helm upgrade` timeout                        | Image pas encore poussée quand deploy démarre                                  | Ajouter `needs: docker-images` ou `wait` sur tous les builds                                                                           |
| `act` : `ENOSPC: no space left on device`                      | Cache Docker local plein                                                       | `docker system prune -af --volumes`                                                                                                    |

---

## 7. Documentation à produire

- `docs/adr/ADR-016-cicd-github-actions.md` — décision GitHub Actions vs alternatives, plus design
  des 5 workflows.
- `docs/CHANGELOG.md` §14 (ajout) : liste des workflows livrés + corrections appliquées sur l'ancien
  `ci.yml`.
- `MAINTENANCE.md` §10 : retirer la mention « CI/CD (doc 16) ajoutera... » et la remplacer par une
  référence à ce document maintenant qu'il existe.
- `README.md` (racine) : ajouter les 4 badges en tête de fichier.
- `infrastructure/helm/nina-aes/` (si Helm chart pas encore livré — sinon référence vers doc 20).

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — CI/CD GitHub Actions — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Workflows livrés** : verify ✅ · test ✅ · e2e ✅ · security ✅ · build ✅ · deploy-staging ✅
- **Caches actifs** : pnpm store ✅ · Playwright browsers ✅ · pip ✅ · Turbo remote ⏳ · Docker
  buildx ✅
- **Branch protection** : ✅ activée sur `main` (6 required checks)
- **Renovate** : ✅ app installée, 1er run nocturne ok
- **Temps moyen run PR** : X min (cible < 5 min)
- **Badges README** : ✅ 4 badges affichés et verts
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** : doc 17 (Monitoring) — pipeline alimente Prometheus via webhook GitHub →
  Alertmanager
- **Captures jointes** : github-actions-overview.png, branch-protection.png, renovate-pr.png
```

---

## 9. Checklist de fin d'étape

- [ ] `.github/actions/setup-node-pnpm/action.yml` créé et testé localement (act)
- [ ] `.nvmrc` créé à la racine, contenu = `24`
- [ ] `verify.yml` livré, vert sur PR test
- [ ] `test.yml` livré (Node + Python matrix), vert sur PR test
- [ ] `e2e.yml` livré, Playwright HTML report en artefact
- [ ] `security.yml` livré, 6 jobs (trivy-fs, semgrep, gitleaks, pnpm-audit, pip-audit, bandit),
      tous verts
- [ ] Toutes les actions tierces **pinnées par digest SHA** (zéro `@v*`/`@master`/`@main` ;
      `grep -rE 'uses:.*@(v[0-9]+|master|main)' .github/workflows/` doit être vide) ⏳ Phase 2
- [ ] `build.yml` livré, 6 images Docker poussées sur GHCR avec tag `git-sha`
- [ ] SBOM `syft` (CycloneDX) généré + `cosign attest` par image ⏳ Phase 2
- [ ] `cosign sign` (keyless OIDC) + `cosign verify` gate avant déploiement ⏳ Phase 2
- [ ] `deploy-staging.yml` livré, **OIDC GitHub → K3s** (pas de kubeconfig en secret) ⏳ Phase 2,
      smoke test sur `/health` (PAS `/api/health`)
- [ ] Commits signés obligatoires (gitsign/GPG) activés sur `main` ⏳ Phase 2
- [ ] OWASP ZAP baseline (DAST) câblé sur staging (renvoi ADR-034) ⏳ Phase 2
- [ ] Branch protection `main` configurée (6 required checks)
- [ ] `renovate.json` mergé, app Renovate installée
- [ ] Badges ajoutés au README
- [ ] `ADR-016` rédigé
- [ ] `docs/CHANGELOG.md` §14 ajouté
- [ ] `MAINTENANCE.md` §10 mis à jour (retirer mention prospective)
- [ ] Aucun secret réel commité (`gitleaks detect --no-git` clean)
- [ ] Tag Git `cicd-mvp` posé après validation tutorat
- [ ] Commit conventionnel : `feat(ci): pipelines verify+test+e2e+security+build+deploy + ADR-016`

---

## 10. Pour aller plus loin

- **Self-hosted runners** : pour réduire les coûts en cas de scale (et garder le contrôle sur
  l'environnement d'exécution). Image runner = Debian 12 + Docker + pnpm pre-installé. Provisionner
  via Ansible sur 2 VMs CTDEC ou un cluster Hetzner souverain (datacenter EU).
- **OIDC GitHub → K3s** : ✅ désormais **cible du cœur** (cf. §4.7), pas un « plus tard » — GitHub
  émet un token court, le cluster K3s vérifie le claim
  `repo:<org>/nina-aes-platform:ref:refs/heads/main`, zéro secret persistant. ⏳ encore à câbler
  dans le `cd-staging.yml` réel. Souveraineté : on vise **K3s** (pas AWS/Azure KMS US) ; l'OIDC
  trust se pose côté API server K3s, sans dépendance cloud US.
- **Pipeline preview env** : déployer chaque PR sur un sous-domaine éphémère
  (`pr-<NN>.nina-aes.uqar.ca`) via un namespace K3s temporaire. Très utile pour la revue UX. Coût :
  ~1 GB RAM × N PRs ouvertes.
- **Mergify ou Kodiak** : automerge conditionnel (« si tous les checks passent ET 1 reviewer
  approuve ET pas de label `do-not-merge` »). Évite les merges manuels à 2 h du matin avant
  soutenance.
- **SBOM + signature/attestation** : ✅ désormais **dans le build du cœur** (§4.6) — `syft` génère
  un SBOM CycloneDX par image, `cosign attest` l'**attache et la signe** (keyless OIDC),
  `cosign verify` fait office de gate avant déploiement. SLSA provenance via `provenance: mode=max`
  de buildx. Exigence croissante des audits gouvernementaux (cf. doc 15 §10).
- **Sigstore privé souverain (Fulcio + Rekor self-hosted)** : ⏳ **cible Phase 2**. La signature
  keyless actuelle (commits gitsign + images cosign) repose sur le Sigstore **public-good** de la
  Linux Foundation (Fulcio = CA, Rekor = log de transparence, infra US). Déployer une **instance
  Sigstore privée** sur l'infra CTDEC retire cette dépendance US de la **racine de confiance** des
  signatures et aligne la chaîne d'approvisionnement sur **ADR-034 §Note souveraineté** (rejet des
  SaaS US sur le cœur). Chemin alternatif déjà souverain dès aujourd'hui : signature **GPG/SSH** à
  clé gérée on-premise (cf. §4.8).
- **Lectures recommandées** :
  - <https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions>
  - <https://turbo.build/repo/docs/core-concepts/remote-caching>
  - <https://docs.renovatebot.com/configuration-options/>
  - <https://nektosact.com/usage/index.html> (act)
  - SLSA framework (<https://slsa.dev/>) pour la chaîne d'approvisionnement

---

_Document 16 — Version 1.2 (harden : pinning digest SHA · cosign sign/attest/verify · SBOM syft ·
OIDC GitHub→K3s · commits signés · route smoke `/health` · renvoi ADR-034 ZAP · réserve de
souveraineté Sigstore/Fulcio/Rekor + cible Sigstore privé Phase 2 · note Trivy DB Aqua) — Juin 2026_
_NINA-AES Platform — UQAR — CONFIDENTIEL_
