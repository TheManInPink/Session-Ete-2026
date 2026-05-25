# Versions stables des technologies — Mai 2026

> **Date du recensement** : 23 mai 2026 **Statut** : Référence canonique pour la refonte PROMPT v3.0
> **Méthode** : recherche web (WebSearch) sur les pages officielles de release des projets concernés

---

## 1. Tableau canonique

| Technologie         | Version stable mai 2026            | Notes                                                                                            |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Node.js**         | 24.x Active LTS (Current = 26.2.0) | Rester sur 24 LTS jusqu'à oct. 2026 (entrée LTS de 26). 22.x en Maintenance.                     |
| **pnpm**            | 11.1.3                             | Migration majeure d'avril 2026 : pur ESM, requiert Node 22+, Minimum Release Age 24h par défaut. |
| **Turborepo**       | 2.9.14                             | —                                                                                                |
| **Next.js**         | 16.2.6                             | LTS. Turbopack stable par défaut depuis v16.                                                     |
| **React**           | 19.2.6                             | Server Components et Actions standardisés.                                                       |
| **Tailwind CSS**    | 4.3.0                              | v3.4 maintenu jusqu'à fév. 2027.                                                                 |
| **NestJS**          | 11.1.23                            | v12 (ESM) prévue Q3 2026 — ne pas migrer encore.                                                 |
| **TypeScript**      | 6.0.3                              | TS 7 (port Go) en beta — ne PAS utiliser en prod.                                                |
| **FastAPI**         | 0.136.1                            | Pydantic v1 deprecated.                                                                          |
| **Python**          | 3.14.5                             | Free-threaded officiel + JIT expérimental.                                                       |
| **Pydantic**        | 2.13.4                             | `pydantic-core` fusionné dans le repo principal.                                                 |
| **Prisma**          | 7.3.0                              | `7.6.0` n'existe qu'en `-dev.7`. Prisma Next en early access.                                    |
| **Zod**             | 4.4.3                              | —                                                                                                |
| **PostgreSQL**      | 18.1.x                             | **TDE NON natif** upstream — fourni par Percona (18.1.1).                                        |
| **Redis**           | 8.6.3                              | —                                                                                                |
| **Elasticsearch**   | 9.4.1                              | FIPS 140-3 GA.                                                                                   |
| **RabbitMQ**        | 4.3.0                              | Khepri seul metadata store en 4.3.                                                               |
| **Keycloak**        | 26.6.2                             | —                                                                                                |
| **HashiCorp Vault** | 2.0.1                              | **Saut majeur 1.21 → 2.0** (alignement IBM) en avril 2026.                                       |
| **Docker Engine**   | 29.5.2                             | containerd image store par défaut.                                                               |
| **K3s**             | v1.36.1+k3s1                       | 1.35 reste un choix défensif pour edge (zones rurales AES).                                      |
| **Helm**            | 4.2.0                              | v3 en bugfix jusqu'à juillet 2026.                                                               |
| **Electron**        | 42.1.0                             | Décalage de 3 majeurs vs prompt v2.0 (qui citait 39.2.7).                                        |
| **Expo SDK**        | 56.0.3                             | RN 0.85.2 + React 19.2.3.                                                                        |
| **React Native**    | 0.85.2                             | Nouveau backend animation.                                                                       |
| **Prometheus**      | 3.11.3                             | **EOS 14 mai 2026** — migrer vers 3.12 immédiatement.                                            |
| **Grafana**         | 13.0.1+security-01                 | —                                                                                                |
| **Loki**            | 3.7.2                              | —                                                                                                |
| **Jaeger**          | 2.18.0                             | v1 EOL 31 déc. 2025 — v2 base OpenTelemetry Collector.                                           |
| **Trivy**           | 0.69.3 (épingler par SHA)          | Attaque supply chain mars 2026 ; éviter 0.70 sans pinning fort.                                  |
| **scikit-learn**    | 1.8.0                              | —                                                                                                |
| **XGBoost**         | 3.2.0                              | —                                                                                                |
| **RapidFuzz**       | 3.14.5                             | —                                                                                                |
| **spaCy**           | 3.8.14                             | —                                                                                                |
| **Tesseract OCR**   | 5.5.2                              | —                                                                                                |
| **MLflow**          | 3.11.1 (stable)                    | `3.11.0rc0` cité dans v2.0 est un release candidate.                                             |
| **Jest**            | 30.4.2                             | Le prompt v2.0 cite `0.3.0` — typo manifeste.                                                    |
| **Pytest**          | 9.0.3                              | —                                                                                                |
| **Playwright**      | 1.60.0                             | —                                                                                                |
| **k6**              | 2.0 (k6 Operator 1.0 GA)           | TypeScript natif depuis 1.0.                                                                     |

---

## 2. Drapeaux rouges du PROMPT v2.0

Versions inventées, gonflées ou peu probables qui doivent être corrigées :

| Annoncé v2.0                | Réalité mai 2026       | Sévérité                                   |
| --------------------------- | ---------------------- | ------------------------------------------ |
| Jest 0.3.0                  | 30.4.2                 | **Critique** — typo                        |
| Next.js 16.6+               | 16.2.6                 | **Critique** — version inventée            |
| Prisma 7.6.0                | 7.3.0 stable           | **Critique** — 7.6 n'existe qu'en `-dev.7` |
| MLflow 3.11.0rc0            | 3.11.1 stable          | **Élevée** — RC non prod                   |
| PostgreSQL 18 « TDE natif » | TDE Percona uniquement | **Élevée** — risque juridique/audit        |
| HashiCorp Vault 1.21        | 2.0.1                  | **Critique** — saut majeur ignoré          |
| Electron 39.2.7             | 42.1.0                 | **Élevée** — 3 majeurs de retard           |
| Tailwind 4.2                | 4.3.0                  | Mineure — obsolète                         |
| Zod 4.3                     | 4.4.3                  | Mineure                                    |
| NestJS 11.1.18              | 11.1.23                | Mineure                                    |
| Redis 8.6.2                 | 8.6.3                  | Mineure                                    |
| Elasticsearch 9.3.3         | 9.4.1                  | Mineure                                    |
| RabbitMQ 4.2.5              | 4.3.0                  | Mineure                                    |
| Keycloak 26.5               | 26.6.2                 | Mineure                                    |
| Docker 28.5                 | 29.5.2                 | Mineure                                    |
| Helm 4.1                    | 4.2.0                  | Mineure                                    |
| Expo SDK 55                 | 56.0.3                 | Mineure                                    |
| React Native 0.84.1         | 0.85.2                 | Mineure                                    |
| Playwright 1.58             | 1.60.0                 | Mineure                                    |
| Grafana 12.4                | 13.0.1                 | Mineure                                    |
| Loki 3.6.10                 | 3.7.2                  | Mineure                                    |
| Jaeger 2.17                 | 2.18.0                 | Mineure                                    |
| Pydantic 2.12.5             | 2.13.4                 | Mineure                                    |
| FastAPI 0.135.3             | 0.136.1                | Mineure                                    |

**Bilan** : sur 41 technos auditées, **~30 sont obsolètes ou inventées** dans le prompt v2.0.

---

## 3. Recommandations pragmatiques pour la v3.0

### 3.1 Runtime / langage

- **Node.js 24 LTS** — rester. Migrer vers 26 quand il passera LTS (oct. 2026).
- **TypeScript 6.0.3** — adopter. **NE PAS** migrer vers TS 7 beta en prod identité.
- **Python 3.14.5** — adopter (free-threaded officiel + JIT expérimental).
- **pnpm 11.1.3** — adopter. Documenter le **Minimum Release Age 24h** : impact CI/CD pour rebuilds
  urgents, prévoir un mirror local en contexte AES (bande passante coûteuse).

### 3.2 Framework / DB

- **NestJS 11.1.23** — pin partout. v12 ESM trop fraîche.
- **Prisma 7.3.0** — épingler. NE PAS écrire `7.6` (n'existe pas en stable).
- **PostgreSQL 18** + soit **Percona 18.1.1** pour TDE, soit **LUKS + pgcrypto** si on reste
  upstream. La formulation « TDE natif » est à bannir.

### 3.3 Sécurité / observabilité

- **Vault 2.0.1** — saut critique à intégrer dans toute la doc et les scripts.
- **Jaeger 2.18** — obligatoire (v1 EOL).
- **Prometheus 3.11.3** — planifier migration 3.12 (EOS du 14 mai 2026).
- **Trivy 0.69.3** — épingler **par SHA commit**, pas par tag mutable. Documenter dans
  `MAINTENANCE.md`.

### 3.4 Mobile / desktop

- **Expo SDK 56 + RN 0.85** — nouvelle archi obligatoire, prévoir migration des modules natifs
  custom.
- **Electron 42** — refonte complète du chapitre Bloc E (3 majeurs de retard à rattraper).

### 3.5 Tests

- **Jest 30.4.2** — corriger l'erreur (« 0.3.0 ») dans toute la doc.
- **k6 2.0** — TypeScript natif, scripts à migrer.

---

**Document généré le 23 mai 2026 — référence pour la refonte PROMPT v3.0**
