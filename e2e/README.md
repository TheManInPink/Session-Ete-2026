# Tests E2E Playwright

Parcours critiques user-facing — citizen + admin — en mode `NINA_AUTH_MODE=mock` (pas de Keycloak
nécessaire).

## Première utilisation

```powershell
# Installer Playwright + télécharger Chromium (~150 MB, une seule fois)
pnpm run test:e2e:install

# Démarrer les dev servers OU laisser Playwright le faire
pnpm run test:e2e

# Mode interactif (recommandé pour debugger)
pnpm run test:e2e:ui
```

## Structure

```
e2e/
├── citizen/
│   ├── home.spec.ts        # PC-01 accueil + LanguageSwitcher + redirect /
│   └── nina-flow.spec.ts   # PC-02 fiche + PC-03 wizard correction
└── admin/
    ├── dashboard.spec.ts   # AD-01 dashboard + sidebar nav
    └── corrections.spec.ts # AD-02 DataGrid + drawer + filtres
```

## Variables d'env

| Variable          | Défaut                  | Effet                                    |
| ----------------- | ----------------------- | ---------------------------------------- |
| `E2E_CITIZEN_URL` | `http://localhost:4001` | URL base pour le projet `citizen`        |
| `E2E_ADMIN_URL`   | `http://localhost:4002` | URL base pour le projet `admin`          |
| `NINA_AUTH_MODE`  | `mock` (forcé par PW)   | Session déterministe sans Keycloak       |
| `CI`              | (non set en local)      | Si set : retries=2, workers=1, fail fast |

## Filtrer un sous-ensemble

```powershell
# Juste citizen
pnpm run test:e2e --project=citizen

# Juste un fichier
pnpm run test:e2e e2e/admin/corrections.spec.ts

# Avec UI debugger
pnpm run test:e2e:ui --project=admin
```

## Limites connues

- **Pas de tests data API** : les services backend (correction-service, identity-service, etc.) ne
  sont pas requis. Tout est en mock.
- **Pas de tests visuels (snapshot)** : on assert sur le DOM et les rôles ARIA. Les snapshots seront
  ajoutés Session 6+ quand les écrans seront stables.
- **Pas de CI GitHub Actions** : la config root supporte le mode CI (`workers=1`, `reporter=github`)
  mais aucun workflow `.github/workflows/` n'est encore présent.
