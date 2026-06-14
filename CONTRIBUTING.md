# CONTRIBUTING — NINA-AES Platform

> Guide pratique pour contribuer au monorepo (étudiant solo + futurs mainteneurs CTDEC/AES +
> assistants IA).
>
> **Audience principale** : l'étudiant UQAR + son tuteur. **Audience secondaire** : Claude Code /
> Cursor / GitHub Copilot (lire en complément des fichiers `AGENTS.md`, `CLAUDE.md`,
> `.github/copilot-instructions.md`, `.cursor/rules/ai-governance.mdc`).
>
> **Avant de commencer** : lire impérativement [`docs/CHANGELOG.md`](./docs/CHANGELOG.md),
> [`docs/00-README-INDEX.md`](./docs/00-README-INDEX.md), [`MAINTENANCE.md`](./MAINTENANCE.md) et
> [`docs/DOCUMENTATION-MAP.md`](./docs/DOCUMENTATION-MAP.md).

---

## 1. Setup initial (5 min)

```powershell
# 1) Vérifier les prérequis
node --version           # ≥ 24.0
pnpm --version           # ≥ 10.0
git --version            # ≥ 2.50

# 2) Cloner + installer
git clone <repo-url>
cd nina-aes-platform
pnpm install             # déclenche `prepare` → installe les hooks Husky

# 3) Vérifier que les hooks sont actifs
git config core.hooksPath
# → doit retourner : .husky/_

# 4) Démarrer l'infrastructure Docker
pnpm docker:up

# 5) Lancer la chaîne de validation
pnpm run verify:repo
```

Si `prepare` ne s'exécute pas automatiquement (rare) :

```powershell
pnpm exec husky
```

---

## 2. Hooks Git installés

| Hook             | Déclencheur    | Étapes                                                    | Cible perf |
| ---------------- | -------------- | --------------------------------------------------------- | ---------- |
| **`pre-commit`** | `git commit`   | lint-staged + typecheck filtré + pnpm audit + verify:repo | < 30 s     |
| **`commit-msg`** | message commit | commitlint (Conventional Commits)                         | < 1 s      |
| **`pre-push`**   | `git push`     | Jest + build Turborepo filtrés `[HEAD~1]`                 | < 3 min    |

**Bypass exceptionnel** (à éviter, justifier dans le commit body) :

```bash
git commit --no-verify -m "..."
git push --no-verify
```

---

## 3. Conventional Commits (commitlint)

### Grammaire imposée

```
type(scope): description en français < 100 caractères

[corps optionnel — 1 ligne vide après le sujet, max 100 chars/ligne]

[footer optionnel — BREAKING CHANGE: ..., Refs #N, Co-Authored-By: ...]
```

### Types autorisés (12)

| Type       | Quand l'utiliser                                                     |
| ---------- | -------------------------------------------------------------------- |
| `feat`     | Nouvelle fonctionnalité utilisateur                                  |
| `fix`      | Correction de bug                                                    |
| `docs`     | Documentation uniquement (`.md`, JSDoc, README)                      |
| `style`    | Formatage, points-virgules, indentation (zéro changement de logique) |
| `refactor` | Réorganisation du code sans changer son comportement                 |
| `perf`     | Optimisation de performance                                          |
| `test`     | Ajout / correction de tests                                          |
| `build`    | Système de build, dépendances externes (rare)                        |
| `ci`       | Workflows GitHub Actions, Husky, Dependabot                          |
| `chore`    | Tâches diverses (config, outils internes)                            |
| `revert`   | Annule un commit précédent (`git revert`)                            |
| `data`     | Mise à jour des données (`data/mali/`, `schemas/`, seeds)            |

### Scopes autorisés (~45)

Voir [`commitlint.config.js`](./commitlint.config.js) pour la liste exhaustive. Quatre familles :

- **Services** (12) : `identity`, `auth`, `ai`, `document`, `notification`, `interop`, `audit`,
  `appointment`, `sigac`, `sgogt`, `governance`, `vulnerability`
- **Apps** (6) : `citizen`, `admin`, `gov`, `mobile`, `kiosk`, `ussd`
- **Packages** (10) : `shared-types`, `database`, `config`, `utils`, `ui`, `auth-pkg`, `api-client`,
  `i18n`, `logger`, `test-fixtures`
- **Transverse** (15) : `infra`, `docker`, `k3s`, `ci`, `deps`, `biometrics`, `monorepo`, `data`,
  `mali`, `security`, `observability`, `testing`, `backup`, `docs`

### Exemples valides

```text
feat(identity): ajoute endpoint /citizens/search avec pagination cursor
fix(auth): corrige expiration refresh token JWT après rotation Vault
docs(ci): met à jour doc 16 avec les 13 corrections du ci.yml historique
data(mali): enrichit cercles 64 → 142 via Wikipedia + Nominatim géocode
test(utils): ajoute 12 tests pour validateNinaChecksum
perf(ai): optimise BERT inference batch (5 000 → 800 ms p95)
refactor(audit): extrait MerkleHasher dans @nina-aes/utils
chore(deps): bump prisma 7.8.0 → 7.8.2
ci(security): ajoute Trivy scan images Docker post-build
build(database): migre vers Prisma 7.8 driver adapter
revert: revert "feat(identity): bypass NINA validation pour debug"
```

### Exemples invalides → rejetés par `commit-msg`

```text
update stuff                  # ❌ pas de type
feat: stuff.                  # ❌ point final interdit
FEAT(identity): xxx           # ❌ type doit être lower-case
feat(blabla): xxx             # ❌ scope "blabla" inconnu
feat(identity):xxx            # ❌ espace manquant après ":"
feat(identity): un sujet bien plus long que 100 caractères qui va dépasser la limite imposée
                              # ❌ header-max-length 100
```

---

## 4. Lint-staged — quoi se passe sur les fichiers stagés

| Pattern                                                | Outil(s) appliqué(s)                                         |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`     | `eslint --fix --max-warnings=0` puis `prettier --write`      |
| `*.py`                                                 | `ruff check --fix --exit-non-zero-on-fix` puis `ruff format` |
| `*.json`, `*.md`, `*.yml`, `*.yaml`, `*.css`, `*.scss` | `prettier --write`                                           |
| `*.prisma`                                             | `prettier --write --plugin=prisma`                           |

> ⚠️ **Ruff doit être installé** sur le PATH pour les fichiers Python. Si vous éditez
> `services/ai-service/` ou `services/anticorruption-service/`, assurez-vous d'avoir activé votre
> venv :
>
> ```powershell
> cd services/ai-service
> python -m venv .venv
> .\.venv\Scripts\Activate.ps1
> pip install -r requirements.txt
> pip install -e ".[dev]"   # ruff + pytest (extra dev)
> ```

---

## 5. Workflow type d'une feature (Bloc A)

```powershell
# 1) Créer une branche feature
git checkout -b feat/identity-search-endpoint develop

# 2) Coder + tester localement
pnpm --filter @nina-aes/identity-service dev
pnpm --filter @nina-aes/identity-service test --watch

# 3) Stager les changements (idéalement par feature, pas en bloc)
git add services/identity-service/src/citizen/

# 4) Commit (déclenche pre-commit + commit-msg)
git commit -m "feat(identity): ajoute endpoint /citizens/search"
#   → lint-staged formate les fichiers stagés
#   → typecheck filtré sur identity-service + ses dépendants
#   → pnpm audit (CVEs CRITICAL/HIGH bloquant)
#   → verify:repo (data + schemas + docs sync)
#   → commit-msg valide la grammaire Conventional Commits

# 5) Push (déclenche pre-push)
git push -u origin feat/identity-search-endpoint
#   → turbo test --filter=...[HEAD~1] (workspaces affectés)
#   → turbo build --filter=...[HEAD~1] (compilation)

# 6) Ouvrir PR vers develop
gh pr create --base develop --title "feat(identity): /citizens/search"
```

---

## 6. Conventions de code

### TypeScript

- **JSDoc obligatoire** sur chaque fonction/classe/type publique
- **Zod pour la validation** runtime (jamais `any`, jamais `unknown` non documenté)
- **Pas de `console.log`** en production — utiliser `@nina-aes/logger` (Pino)
- **Imports absolus via workspace** : `import { x } from '@nina-aes/utils'`
- **Pas de re-export en barrel** si non nécessaire (perf bundler)

### Python

- **PEP 484 type hints** sur toutes les fonctions publiques
- **Docstrings** Google-style (`Args`, `Returns`, `Raises`)
- **`ruff check` + `ruff format`** appliqués automatiquement (lint-staged)
- **Aucun `print`** en production — `structlog` (logging structuré JSON)

### Markdown

- Une ligne par phrase quand possible (diff plus propre)
- Tableaux : alignement automatique par Prettier
- Liens relatifs préférés (`./docs/...`) aux liens absolus

---

## 7. Tests — ce qu'on attend par PR

| Niveau                                       | Quand obligatoire                            | Localisation                    |
| -------------------------------------------- | -------------------------------------------- | ------------------------------- |
| **Unitaire (Jest/Pytest)**                   | Toute nouvelle fonction publique             | `__tests__/` ou `*.spec.ts`     |
| **Intégration (Supertest + Testcontainers)** | Nouveau endpoint ou query Prisma             | `services/X/test/*.e2e-spec.ts` |
| **E2E (Playwright)**                         | Nouveau parcours utilisateur frontend        | `e2e/citizen/` ou `e2e/admin/`  |
| **Charge (k6)**                              | Endpoints critiques (NINA search, AI detect) | `tests/load/scenarios/`         |

Couverture **bloquante en CI ≥ 80 %** sur les packages `utils`, `config`, `database`. Cible globale
80 % (cf. [`docs/18-TESTING-STRATEGY.md`](./docs/18-TESTING-STRATEGY.md)).

---

## 8. Documentation — quoi mettre à jour avec quoi

Voir [`MAINTENANCE.md §3`](./MAINTENANCE.md) (matrice « Quand modifier quoi »). Résumé des
principaux mappings :

| Tu touches…                         | Tu mets à jour…                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `package.json` version d'un package | `docs/CHANGELOG.md §1` (versions effectives)                                        |
| `schema.prisma`                     | Migration + `docs/06-DATABASE-SCHEMA-PRISMA.md` + ADR-011 si breaking               |
| Une variable d'env                  | `.env.example` + `docs/05-INFRASTRUCTURE-DOCKER-COMPOSE.md`                         |
| `data/mali/*.json`                  | `pnpm run validate:data` + bump `metadata.version`                                  |
| `schemas/*.schema.json`             | `pnpm run validate:schemas` + `docs/data/mali-divisions.md §3`                      |
| `AGENTS.md` ou équiv. IA            | Synchroniser les 4 fichiers gouvernance (cf. `DOCUMENTATION-MAP.md §2`)             |
| Nouveau `.github/workflows/*.yml`   | Mention dans `docs/16-CICD-GITHUB-ACTIONS.md`                                       |
| Nouvel ADR                          | Header `**Contexte document** : [doc N]` + ajouter dans `DOCUMENTATION-MAP.md §4.1` |

> 🔁 **Règle d'or** : si vous ouvrez une PR qui touche une de ces zones sans mettre à jour le
> compagnon documentaire, `pnpm verify:repo` doit échouer (au minimum `docs:sync:check`).

---

## 9. Sécurité — règles non négociables

1. **Jamais de secret en clair** dans le code, les commits, les issues, les PR ou les logs. Utiliser
   `@nina-aes/config` (Zod) + Vault.
2. **Jamais de NINA brut dans les logs** — `@nina-aes/logger` redact automatiquement, mais ne
   dépendez pas du logger pour ça : ne loguez pas le champ `nina` du tout (utilisez `***` ou
   `${nina.slice(0,4)}…`).
3. **Audit Merkle obligatoire** pour toute mutation d'une entité sensible (citoyen, document,
   audit_log, biométrie, signalement SIGAC).
4. **Pas de bypass** des contrôles d'auth en mode mock sans `NINA_AUTH_MODE=mock` explicite dans
   l'env.
5. **PR sécurité bloquante** : si CodeQL ou Trivy détecte un finding HIGH/CRITICAL, le merge est
   bloqué.

---

## 10. Bypass d'urgence (à utiliser TRÈS rarement)

```powershell
# Bypass pre-commit (mauvais — préférer corriger le hook)
git commit --no-verify -m "fix(emergency): hotfix prod"

# Bypass pre-push (pareil)
git push --no-verify

# Bypass branch protection main (impossible sans admin GitHub)
# → si tu te retrouves dans cette situation, arrête et appelle le tuteur
```

Chaque bypass DOIT être :

- Justifié dans le body du commit (`# bypass-reason: ...`)
- Compensé par un commit de re-validation dans les 24 h
- Mentionné dans `docs/CHANGELOG.md §4` (incidents d'exécution résolus)

---

## 11. Pour aller plus loin

- [`docs/16-CICD-GITHUB-ACTIONS.md`](./docs/16-CICD-GITHUB-ACTIONS.md) — pipeline complet
- [`docs/18-TESTING-STRATEGY.md`](./docs/18-TESTING-STRATEGY.md) — pyramide de tests
- [`docs/DOCUMENTATION-MAP.md`](./docs/DOCUMENTATION-MAP.md) — carte des 27 docs + 25 ADRs
- [Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/)
- [Husky 9 docs](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/lint-staged/lint-staged)
- [Turborepo `--filter` syntax](https://turbo.build/repo/docs/reference/run#--filter-string)

---

_Document — Mai 2026 · NINA-AES Platform · UQAR · CONFIDENTIEL_
