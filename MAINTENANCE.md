# MAINTENANCE.md — Guide opérationnel NINA-AES

> Compagnon de [`AGENTS.md`](./AGENTS.md) et [`CLAUDE.md`](./CLAUDE.md).
> Ce document décrit **comment maintenir** le monorepo au quotidien : commandes
> courantes, contrôles automatisés, gestion des dérives, rotation des données.

**Dernière mise à jour** : 3 mai 2026 · **Audience** : étudiant UQAR + futurs
mainteneurs + assistants IA.

---

## 1. Carte mentale en 30 secondes

```text
┌──────────────────┐         ┌───────────────────────┐
│  docs/CHANGELOG  │ ◄────── │  Source de vérité     │ ◄── tous les écarts
│  (mai 2026 v8)   │         │  pour l'état réel     │
└──────────────────┘         └───────────────────────┘
        ▲
        │ référencé par
        │
┌───────┴─────────────────────────────────────┐
│  AGENTS.md · CLAUDE.md · copilot · cursor    │ ◄── règles persistantes IA
└─────────────────────────────────────────────┘
        ▲
        │ enforcé par
        │
┌───────┴─────────────────────────────────────┐
│  pnpm verify:repo                            │ ◄── chaîne CI/pre-commit
│   ├─ validate:data    (invariants Mali)      │
│   ├─ validate:schemas (Ajv vs JSON Schema)   │
│   └─ docs:sync:check  (cross-références)     │
└─────────────────────────────────────────────┘
```

---

## 2. Commandes quotidiennes

### 2.1 Vérification rapide (1 minute)

```powershell
# Lance toute la chaîne de validation (data + schemas + docs)
pnpm run verify:repo

# Ou un sous-ensemble :
pnpm run validate:data       # Invariants Mali (cf. scripts/validate-mali-data.mjs)
pnpm run validate:schemas    # Ajv contre les JSON Schemas (cf. schemas/)
pnpm run docs:sync:check     # Cross-références README ↔ CHANGELOG ↔ index
```

Sortie attendue après un commit propre :

```text
✅ Tous les invariants sont respectés. (20 régions, 64 cercles)
✅ All schema checks passed.
✅ Documentation sync checks passed.
```

### 2.2 Démarrage de la stack locale

```powershell
# Démarre PostgreSQL+PostGIS (avec --env-file .env automatique)
pnpm docker:up

# Migrations + seed
pnpm --filter @nina-aes/database exec prisma migrate deploy
pnpm --filter @nina-aes/database db:seed
```

### 2.3 Typage et tests à la racine

```powershell
# Typecheck tous les workspaces en parallèle (turbo)
pnpm check-types

# Tests Jest (utils + config)
pnpm test

# Lint + format
pnpm lint
pnpm format
```

---

## 3. Quand modifier quoi

Quand vous changez **ceci** → vous **devez** mettre à jour **cela** :

| Modification                                       | Action obligatoire                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Versions d'un package (`package.json`)              | `docs/CHANGELOG.md` §1 (tableau versions effectives)                                 |
| Schéma Prisma (`schema.prisma`)                    | Migration Prisma + `docs/06-DATABASE-SCHEMA-PRISMA.md` + ADR-011                     |
| Variable d'environnement (`@nina-aes/config`)       | `.env.example` + `docs/05-INFRASTRUCTURE-DOCKER-COMPOSE.md`                          |
| Données Mali (`data/mali/*.json`)                  | `pnpm run validate:data` + bump `metadata.version` (`YYYY.MM.DD`)                   |
| JSON Schema (`schemas/*.schema.json`)              | `pnpm run validate:schemas` + section §3 dans `docs/data/mali-divisions.md`         |
| Conventions IA (CLAUDE/AGENTS/copilot/cursor)      | Synchroniser les 4 fichiers (cf. §4 ci-dessous)                                     |
| Diagrammes UML (`docs/diagrams/*.puml`)            | Mention dans `docs/CHANGELOG.md` §3 + lien depuis `docs/02-ARCHITECTURE-GLOBALE.md` |
| Nouveau script `pnpm run <X>`                      | `MAINTENANCE.md` §2.1 + bandeau dans `docs/03-SETUP-ENVIRONNEMENT-DEV.md`           |
| Image Docker (`docker-compose.dev.yml`)             | `docs/CHANGELOG.md` §1 + `docs/05-INFRASTRUCTURE-DOCKER-COMPOSE.md` bandeau         |
| Endpoint API (NestJS controller)                    | `docs/api/<service>.md` (à créer si absent) + ADR si décision structurante           |

> 🔁 **Règle d'or** : si vous ouvrez une PR qui touche une de ces zones sans
> mettre à jour le compagnon documentaire, `pnpm verify:repo` doit échouer
> (au minimum `docs:sync:check`).

---

## 4. Cohérence des 4 fichiers IA

Les conventions persistantes vivent dans 4 fichiers qui doivent dire **la même
chose** (avec des syntaxes adaptées à chaque outil) :

| Fichier                             | Cible                  | Format                                  |
| ----------------------------------- | ---------------------- | --------------------------------------- |
| `AGENTS.md`                         | Tous (universel)       | Markdown plain                          |
| `CLAUDE.md`                         | Claude Code            | Markdown (référencé automatiquement)    |
| `.github/copilot-instructions.md`   | GitHub Copilot         | Markdown avec sections numérotées       |
| `.cursor/rules/ai-governance.mdc`   | Cursor                 | MDC avec front-matter `alwaysApply: true` |

**Invariants partagés** que ces 4 fichiers doivent tous porter :

- Lecture obligatoire de `docs/CHANGELOG.md` avant suggestion
- `pnpm` uniquement, jamais `npm`
- Synchronisation docs ↔ code dans le même change set
- Validation systématique : `pnpm run validate:data`, `pnpm run validate:schemas`
- Pas de secret commité, pas de dégradation des contrôles d'identité/audit

Si vous modifiez une règle dans l'un, modifiez-la dans les 3 autres. Le test
manuel rapide est de lire les 4 et de chercher l'invariant.

---

## 5. Données Mali — workflow de mise à jour

### 5.1 Modification incrémentale

```powershell
# 1. Éditer data/mali/regions.json ou cercles.json
# 2. Bumper la version dans metadata.version (YYYY.MM.DD)
# 3. Valider
pnpm run verify:repo

# 4. Re-seeder (idempotent — upsert par code unique)
pnpm --filter @nina-aes/database db:seed

# 5. Vérifier les compteurs en base
docker exec nina-postgres psql -U nina_admin -d nina_aes_db -c \
  "SELECT level, COUNT(*) FROM locations GROUP BY level ORDER BY level;"

# 6. Commit conventionnel
git add data/mali/ docs/data/
git commit -m "data(mali): enrichit X (v2026.MM.DD)"
```

### 5.2 Enrichissement futur (94 cercles manquants)

Cf. `docs/data/mali-divisions.md` §3.2 — le script `scripts/enrich-cercles.py`
(à créer) doit :

1. Parser `https://fr.wikipedia.org/wiki/Cercles_du_Mali` (BeautifulSoup4)
2. Aligner sur `region_code` post-2023
3. Renseigner les centroïdes via GeoNames API
4. Merger non-destructif avec les 64 entrées existantes
5. Marquer `"confiance": "basse"` pour tout cercle sans coordonnée vérifiée

### 5.3 Polygones HDX OCHA

```powershell
# Cf. docs/data/mali-divisions.md §6.3
# 1) Télécharger le shapefile officiel (CC BY)
# 2) Convertir avec mapshaper -> GeoJSON simplifié
# 3) Pousser dans data/mali/mali-regions-polygons.geojson
```

---

## 6. Dérive et nettoyage

### 6.1 Symptômes de dérive

| Symptôme                                                    | Diagnostic                                | Remède                                              |
| ----------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `pnpm verify:repo` échoue sur `docs:sync:check`             | Référence cassée README ↔ CHANGELOG ↔ index | Lire la liste manquante, ajouter les renvois        |
| `pnpm verify:repo` échoue sur `validate:data`               | Cercle pointe sur région inexistante       | Vérifier `region_code` dans `cercles.json`         |
| `pnpm verify:repo` échoue sur `validate:schemas`             | Champ obligatoire absent dans JSON         | Ajuster le JSON ou le schéma selon intention        |
| `prisma migrate dev` se plaint d'une drift                  | Schéma modifié sans migration              | `prisma migrate dev --create-only` puis revue       |
| Compteurs DB ≠ JSON                                         | Seed non re-exécuté après modif JSON       | `pnpm --filter @nina-aes/database db:seed`         |
| `pnpm check-types` échoue dans un workspace                 | Changement de contrat partagé              | Sync `@nina-aes/shared-types` + workspaces consom.   |

### 6.2 Reset complet (dernier recours)

```powershell
# ⚠️ Détruit toute donnée locale, à utiliser uniquement en dev
docker compose -f infrastructure/docker/docker-compose.dev.yml down -v
docker volume rm nina-postgres-data
pnpm docker:up
pnpm --filter @nina-aes/database exec prisma migrate deploy
pnpm --filter @nina-aes/database db:seed
pnpm run verify:repo
```

---

## 7. Rotation des secrets et données sensibles

| Élément                                  | Cadence    | Procédure                                              |
| ---------------------------------------- | ---------- | ------------------------------------------------------ |
| `JWT_SECRET`                              | 90 jours   | Régénérer 32+ chars · Vault Transit · `pnpm docker:up` |
| Clé publique CTDEC (mobile)              | 90 jours   | Mettre à jour `embedded-keys.ts` + OTA Expo            |
| `POSTGRES_PASSWORD`                       | 30 jours   | Vault Database secrets engine (cf. doc 15)             |
| Refresh tokens utilisateur                | 7 jours    | TTL dans `JWT_REFRESH_EXPIRATION` (cf. config)         |
| Token anonyme SIGAC (rapporteur)         | À création | Vault Transit ; rotation clé v3 ↦ v4 (doc 23)          |

---

## 8. Releases et versionnement

### 8.1 Numérotation

Le monorepo suit **SemVer 2.0.0** au niveau package :

- `0.x.y` = phase d'amorçage (état actuel)
- `1.0.0` = premier MVP soutenance (Bloc A complet)
- `2.0.0` = ajout interopérabilité AES (Bloc B livré)

Chaque PR modifiant un package incrémente sa version dans son propre
`package.json`. Pas de release globale du monorepo.

### 8.2 Tags Git

```powershell
# Tagger après chaque jalon majeur
git tag -a v0.5.0-bloc-A-data-seed -m "Référentiel Mali loi 2023 + 20 régions"
git push origin v0.5.0-bloc-A-data-seed
```

---

## 9. Liens canoniques

| Sujet                              | Fichier                                          |
| ---------------------------------- | ------------------------------------------------ |
| Vue d'ensemble du parcours          | `docs/00-README-INDEX.md`                        |
| État réel courant                   | `docs/CHANGELOG.md`                              |
| Conventions assistants IA           | `AGENTS.md` · `CLAUDE.md`                        |
| Référentiel Mali                    | `docs/data/mali-divisions.md`                    |
| Intégration des données Mali        | `docs/data/integration-guide.md`                 |
| Design System                       | `docs/design-system/design-system.md`            |
| Diagrammes UML                      | `docs/diagrams/*.puml`                           |
| ADR (décisions architecturales)     | `docs/adr/ADR-*.md`                              |
| Cahier des charges                  | `docs/01-CAHIER-DES-CHARGES.md`                  |
| Sécurité / hardening                | `docs/15-SECURITY-HARDENING.md`                  |
| CI/CD GitHub Actions                | `docs/16-CICD-GITHUB-ACTIONS.md`                 |
| Monitoring & observabilité          | `docs/17-MONITORING-OBSERVABILITY.md`            |

---

## 10. Pour aller plus loin

- **CI/CD** : la spec complète vit dans
  [`docs/16-CICD-GITHUB-ACTIONS.md`](./docs/16-CICD-GITHUB-ACTIONS.md) +
  [`docs/adr/ADR-016-cicd-github-actions.md`](./docs/adr/ADR-016-cicd-github-actions.md)
  (5 workflows séparés ; `verify:repo` est l'un des required checks bloquants
  sur `main`). Implémentation YAML : à appliquer en bonus de la doc 15.
- **Renovate / Dependabot** : à activer pour automatiser les bumps mineurs ;
  garder les majeurs en revue manuelle (avec test d'invariants après merge).
- **Documentation sites statique** : possibilité de générer `docusaurus` à
  partir de `docs/` pour navigation enrichie (lien externe étudiant ↔ tuteur).
- **Backup données seed** : `pg_dump` quotidien de `nina_aes_db` après seed
  réussi → `infrastructure/backups/` (doc 19).
