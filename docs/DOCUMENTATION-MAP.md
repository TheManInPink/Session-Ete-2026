# DOCUMENTATION-MAP.md — Corrélation, synchronisation, recommandations

> **Objectif** : carte unique de toute la documentation du projet NINA-AES Platform avec : (1)
> graphe de dépendances doc↔ADR↔code, (2) détection des dérives et orphelins, (3) recommandations
> priorisées (P0/P1/P2).
>
> **Audience** : étudiant UQAR + futurs mainteneurs CTDEC/AES + assistants IA opérant sur le repo.
>
> **Dernière mise à jour** : 13 juin 2026 · **Status** : ✅ initialisé (27 docs + **29 ADRs** —
> ADR-029 ajouté pour l'api-gateway : terminaison d'authentification au bord, `X-User-Context` signé
> JWS, rate limiting Redis et Swagger agrégé — PROMPT 3.7).

---

## 1. Vue d'ensemble — un système à 3 tiers

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 1 — Gouvernance IA et entrée projet (6 fichiers, racine)   │
│  ─────────────────────────────────────────────────────────────   │
│  AGENTS.md · CLAUDE.md · .github/copilot-instructions.md         │
│  .cursor/rules/{ai-governance, graphify}.mdc · README.md          │
│  MAINTENANCE.md (= hub opérationnel §3 « Quand modifier quoi »)  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Référence
┌──────────────────────────────────────────────────────────────────┐
│  TIER 2 — Documentation canonique numérotée (docs/00 → docs/26)  │
│  ─────────────────────────────────────────────────────────────   │
│  27 docs séquentiels + transversaux thématiques :                │
│   • docs/data/         (référentiel Mali)                        │
│   • docs/design-system/                                          │
│   • docs/diagrams/     (8 PlantUML)                              │
│   • docs/figma/                                                  │
│   • docs/security/     (vide en V1)                              │
│   • docs/api/          (vide en V1, contenu à venir docs 21+)    │
│   • docs/guides/       (vide en V1)                              │
│  CHANGELOG.md = source de vérité de l'état réel courant          │
│  00-README-INDEX.md = navigation séquentielle                    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Justifie
┌──────────────────────────────────────────────────────────────────┐
│  TIER 3 — Architecture Decision Records (docs/adr/ADR-001…029)   │
│  ─────────────────────────────────────────────────────────────   │
│  29 ADRs (001 à 029) — décisions stratégiques avec :             │
│   • Contexte document (lien vers doc Tier 2 associée)            │
│   • Décision + Conséquences positives / négatives                │
│   • Note souveraineté + Alternatives rejetées                    │
│   • Métriques de suivi chiffrées                                 │
│   • Header "Complète : [ADR-XYZ]" pour graphe de dépendances     │
└──────────────────────────────────────────────────────────────────┘
```

**Volume total** : ~30 000 lignes de documentation, ~80 fichiers significatifs, ~210 nodes / 153
edges dans le knowledge graph (graphify, snapshot 5 mai 2026 — stale).

---

## 2. Tier 1 — Gouvernance IA + entrée projet

### 2.1 Rôles distincts

| Fichier                               | Lignes | Audience cible                  | Particularité                                        |
| ------------------------------------- | -----: | ------------------------------- | ---------------------------------------------------- |
| **`README.md`**                       |     38 | Public GitHub (premier contact) | Minimal, points vers docs/ + AGENTS                  |
| **`AGENTS.md`**                       |     54 | Tous assistants IA (universel)  | Convention Markdown standard, indépendant de l'outil |
| **`CLAUDE.md`**                       |     25 | Claude Code (cli.anthropic.com) | Bootstrap léger, complète AGENTS                     |
| **`.github/copilot-instructions.md`** |     42 | GitHub Copilot                  | Lu automatiquement par Copilot ; le plus détaillé    |
| **`.cursor/rules/ai-governance.mdc`** |     27 | Cursor IDE                      | Front-matter `alwaysApply: true`                     |
| **`.cursor/rules/graphify.mdc`**      |     11 | Cursor IDE                      | Trigger sur la commande `/graphify`                  |
| **`MAINTENANCE.md`**                  |    281 | Opérationnel quotidien          | Hub central, §3 = mapping « Quand modifier quoi »    |

### 2.2 Convention partagée (les 5 invariants des 4 fichiers IA)

Les 4 fichiers IA (AGENTS + CLAUDE + copilot + cursor) doivent porter **le même message** avec des
formulations adaptées :

1. ✅ Lecture obligatoire de `docs/CHANGELOG.md` avant suggestion
2. ✅ `pnpm` uniquement, jamais `npm`
3. ✅ Synchronisation docs ↔ code dans le même change set
4. ✅ Validation systématique : `pnpm run verify:repo`
5. ✅ Pas de secret commité, pas de dégradation auth/audit/identité

### 2.3 Drift détecté

| Fichier                           | Invariant manquant                                                                                                                                                            | Sévérité |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
| `AGENTS.md`                       | Mentionne seulement `validate:data` + `validate:schemas`, pas `verify:repo` (chaîne complète préférée)                                                                        |  🟡 P1   |
| `AGENTS.md`                       | Pas de mention de la commande `docs:sync:check`                                                                                                                               |  🟡 P1   |
| `CLAUDE.md`                       | Pas de mention explicite des 26 ADRs comme référence                                                                                                                          |  🟢 P2   |
| `.cursor/rules/ai-governance.mdc` | Pas de section « Data and validation discipline » comme copilot                                                                                                               |  🟢 P2   |
| `.cursor/rules/graphify.mdc`      | ~~Pointe vers `graphify-out/` mais le snapshot est du 5 mai (stale 11 jours)~~ ✅ Résolu le 17 mai 2026 — `graphify update` exécuté (613 nodes / 598 edges / 183 communautés) |    ✅    |
| `README.md`                       | Ne référence pas `MAINTENANCE.md` ni les 26 ADRs                                                                                                                              |  🟡 P1   |
| Tous                              | Pas de référence vers `docs/00-README-INDEX.md` dans `README.md` à la racine                                                                                                  |  🟢 P2   |

### 2.4 Hub de synchronisation : `MAINTENANCE.md §3`

```
                        ┌──────────────────────────┐
                        │  MAINTENANCE.md §3        │
                        │  « Quand modifier quoi » │
                        └────────────┬──────────────┘
                                     │ référencée par
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
            AGENTS.md          CLAUDE.md       copilot-instructions
                  │                  │                  │
                  ▼                  ▼                  ▼
            ai-governance.mdc   graphify.mdc       README.md
```

Toutes les règles « si tu changes X, mets à jour Y » convergent vers `MAINTENANCE.md §3` (matrice de
13 lignes après cette session).

---

## 3. Tier 2 — Docs canoniques

### 3.1 Catalogue séquentiel 00-26 (27 docs)

|   # | Doc                            |     Lignes | ADR(s) liée(s)            | Statut code                          |
| --: | ------------------------------ | ---------: | ------------------------- | ------------------------------------ |
|  00 | README INDEX                   |        495 | —                         | ✅ Index navigation                  |
|  01 | CAHIER-DES-CHARGES             | (existant) | ADR-001                   | ✅ existant                          |
|  02 | ARCHITECTURE-GLOBALE           | (existant) | ADR-002                   | ✅ existant                          |
|  03 | SETUP-ENVIRONNEMENT-DEV        | (existant) | —                         | ✅ existant                          |
|  04 | MONOREPO-STRUCTURE             | (existant) | ADR-009                   | ✅ existant                          |
|  05 | INFRASTRUCTURE-DOCKER-COMPOSE  | (existant) | ADR-010                   | ✅ implémenté Bloc A                 |
|  06 | DATABASE-SCHEMA-PRISMA         | (existant) | ADR-005, ADR-011, ADR-028 | ✅ 22 modèles (16 spec + additifs)   |
|  07 | BACKEND-IDENTITY-SERVICE       | (existant) | ADR-003, ADR-012          | ⏳ scaffold                          |
|  08 | BACKEND-AUTH-SERVICE           | (existant) | ADR-013                   | ⏳ scaffold                          |
|  09 | BACKEND-AUDIT-SERVICE          | (existant) | ADR-007, ADR-014          | ⏳ scaffold                          |
|  10 | BACKEND-DOCUMENT-SERVICE       | (existant) | ADR-006                   | ⏳ scaffold                          |
|  11 | AI-SERVICE-FASTAPI             | (existant) | ADR-004, ADR-015          | ⏳ scaffold + tests                  |
|  12 | FRONTEND-INTEGRATION-API       | (existant) | —                         | ✅ apps/citizen + admin Sessions 1-5 |
|  13 | MOBILE-APP-EXPO                | (existant) | **❌ aucun ADR**          | ⏳ scaffold                          |
|  14 | USSD-SERVICE-AFRICAS-TALKING   |        915 | ADR-008                   | ⏳ scaffold                          |
|  15 | SECURITY-HARDENING             |        533 | **❌ aucun ADR dédié**    | ⏳ Vault déployé seul                |
|  16 | CICD-GITHUB-ACTIONS            |        931 | ADR-016                   | ⏳ ci.yml historique présent         |
|  17 | MONITORING-OBSERVABILITY       |       1091 | ADR-017                   | ⏳ spec livré, pas implémenté        |
|  18 | TESTING-STRATEGY               |        857 | ADR-018                   | ⏳ 53 Jest + 11 Playwright           |
|  19 | BACKUP-RECOVERY                |        724 | ADR-019                   | ⏳ spec livré                        |
|  20 | DEPLOYMENT-K3S-PRODUCTION      |        925 | ADR-020                   | ⏳ spec livré                        |
|  21 | BLOC-B-INTEROPERABILITE-AES    |        570 | ADR-021                   | ⏳ spec uniquement                   |
|  22 | BLOC-C-MODULES-GOUVERNEMENTAUX |        634 | ADR-022                   | ⏳ spec uniquement                   |
|  23 | BLOC-D-SIGAC-ANTICORRUPTION    |        558 | ADR-023                   | ⏳ FastAPI scaffold                  |
|  24 | BLOC-E-BORNES-KIOSQUE-ELECTRON |        600 | ADR-024                   | ⏳ spec uniquement                   |
|  25 | BLOC-F-BIOMETRIE               |        466 | ADR-025                   | ⏳ vision uniquement                 |
|  26 | RAPPORT-FINAL-SOUTENANCE       |        510 | — (plan, pas décision)    | ⏳ à rédiger                         |

### 3.2 Docs transversaux thématiques

| Dossier               | Fichiers                                                                              | Status                                                                            |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `docs/data/`          | `mali-divisions.md` (470 l), `integration-guide.md`, `instat-data-request.md` (250 l) | ✅ Riche                                                                          |
| `docs/design-system/` | `design-system.md`, `figma-prompts.md`, `screens.md`, `tokens.json`                   | ✅ Complet                                                                        |
| `docs/diagrams/`      | 8 PlantUML + 2 archives narratives Mermaid/PlantUML                                   | ✅ 1557 lignes                                                                    |
| `docs/figma/`         | `MAQUETTES-UI-UX-SPEC.md`                                                             | ✅ Présent                                                                        |
| `docs/api/`           | `.gitkeep` seulement                                                                  | 🔴 Vide alors qu'on a livré OpenAPI BCID-AES doc 21                               |
| `docs/security/`      | (vide)                                                                                | 🔴 Vide alors qu'on prévoit `SECURITY-RUNBOOK.md` et `THREAT-MODEL.md`            |
| `docs/guides/`        | (vide)                                                                                | 🟡 Pas critique en V1                                                             |
| `docs/observability/` | (non créé)                                                                            | 🔴 Manquant — prévu `RUNBOOK.md`, `SLOs.md`, `DRP-RUNBOOK.md`, `DRP-DRILL-LOG.md` |
| `docs/testing/`       | (non créé)                                                                            | 🟡 Prévu `TEST-CHARTER.md`, `COVERAGE-MATRIX.md`                                  |
| `docs/deployment/`    | (non créé)                                                                            | 🟡 Prévu `OPS-RUNBOOK.md`, `UPGRADE-GUIDE.md`, `KIOSK-INSTALL-GUIDE.md`           |
| `docs/biometrics/`    | (non créé)                                                                            | 🟡 Prévu `DPIA-NINA-AES-2026.md`, `CONSENT-PROTOCOL.md`, `INCIDENT-PROTOCOL.md`   |
| `docs/governance/`    | (non créé)                                                                            | 🟡 Prévu `SGOGT-PROTOCOL.md`, `ELECTIONS-EXPORT-CONTRACT.md`                      |
| `docs/sigac/`         | (non créé)                                                                            | 🟡 Prévu `WHISTLEBLOWER-PROTOCOL.md`, `MODEL-CARDS.md`, `SCORING-RUNBOOK.md`      |
| `docs/interop/`       | (non créé)                                                                            | 🟡 Prévu `PARTNER-ONBOARDING.md`                                                  |
| `docs/soutenance/`    | (non créé)                                                                            | 🟡 Prévu `RAPPORT-FINAL.pdf`, `slides.pdf`, `demo-script.md`, etc.                |

### 3.3 ⚠️ Orphelins critiques détectés

Deux fichiers Tier 2 contiennent du contenu **dupliqué et obsolète** :

```
🔴 docs/01-fondations-monorepo-outillage-dx.md  (1286 lignes)
🔴 docs/02-infrastructure-docker-services-donnees.md  (1622 lignes)
```

Ces docs sont des **versions antérieures** superposées par :

- `docs/01-CAHIER-DES-CHARGES.md` (canonique, dans 00-README-INDEX)
- `docs/02-ARCHITECTURE-GLOBALE.md` (canonique, dans 00-README-INDEX)

**Total : 2 908 lignes de contenu fantôme** susceptibles de tromper un assistant IA ou un lecteur
humain. Recommandation P0 : archiver ou supprimer (cf. §7).

### 3.4 ✅ Snapshot graphify rafraîchi (2026-05-17)

`graphify-out/GRAPH_REPORT.md` a été régénéré le **17 mai 2026** via `graphify update .`. Le nouveau
snapshot couvre l'intégralité des Tier 1/2/3 ainsi que les services scaffoldés (identity-service
complet, observability, monitoring stack) :

| Métrique         | Avant (5 mai) | Après (17 mai) |    Δ |
| ---------------- | ------------: | -------------: | ---: |
| Nodes            |           210 |        **613** | +403 |
| Edges            |           153 |        **598** | +445 |
| Communautés      |            82 |        **183** | +101 |
| Fichiers indexés |           n/a |        **251** |    — |
| Mots cumulés     |           n/a |  **≈ 316 145** |    — |

→ `.cursor/rules/graphify.mdc` pointe désormais vers un graphe à jour. Drift P1 #5 du registre §6
clôturé.

---

## 4. Tier 3 — ADRs (graphe de dépendances)

### 4.1 Couverture 29 ADRs (001–029)

| ADR | Sujet                                             | Doc parent | "Complète" refs                                              |
| --: | ------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| 001 | Cahier des charges                                | doc 01     | — (premier)                                                  |
| 002 | Microservices                                     | doc 02     | —                                                            |
| 003 | NestJS                                            | doc 07     | —                                                            |
| 004 | FastAPI                                           | doc 11     | —                                                            |
| 005 | PostgreSQL                                        | doc 06     | —                                                            |
| 006 | JWT RS256 + QR code                               | doc 10     | —                                                            |
| 007 | Merkle audit                                      | doc 09     | —                                                            |
| 008 | USSD Africa's Talking                             | doc 14     | —                                                            |
| 009 | Monorepo Turborepo                                | doc 04     | —                                                            |
| 010 | Infrastructure Docker Compose                     | doc 05     | —                                                            |
| 011 | Database Schema Prisma                            | doc 06     | —                                                            |
| 012 | NestJS Clean Architecture                         | doc 07-10  | —                                                            |
| 013 | Keycloak Identity Provider                        | doc 08     | —                                                            |
| 014 | Audit event-driven append-only                    | doc 09     | ADR-007                                                      |
| 015 | Stack ML détection erreurs NINA                   | doc 11     | ADR-004                                                      |
| 016 | CI/CD GitHub Actions                              | doc 16     | ADR-009, ADR-010                                             |
| 017 | Observabilité LGTM                                | doc 17     | ADR-010, ADR-014, ADR-016                                    |
| 018 | Stratégie tests pyramide                          | doc 18     | ADR-009, ADR-016, ADR-017                                    |
| 019 | Backup & DRP                                      | doc 19     | ADR-005, ADR-010, ADR-014, ADR-017                           |
| 020 | Déploiement K3s production                        | doc 20     | ADR-002, ADR-010, ADR-015 (faute), ADR-016, ADR-017, ADR-019 |
| 021 | Protocole BCID-AES Interop                        | doc 21     | ADR-002, ADR-006, ADR-014                                    |
| 022 | Modules gouvernementaux scope                     | doc 22     | ADR-002, ADR-014                                             |
| 023 | SIGAC ML stack + lanceurs d'alerte                | doc 23     | ADR-004, ADR-014, ADR-015                                    |
| 024 | Kiosk Electron vs PWA                             | doc 24     | **❌ ADR-013 mal référencé**                                 |
| 025 | Biométrie phasée + hash                           | doc 25     | ADR-014, **❌ ADR-015 mal référencée**                       |
| 026 | Vault Transit — signature QR FDI                  | doc 10     | ADR-006                                                      |
| 027 | `auth-guards` type-only (DI)                      | doc 07-10  | — (fix duplication `@nestjs/core`)                           |
| 028 | appointment-service : centres + file d'attente    | PROMPT 3.6 | ADR-011, ADR-027                                             |
| 029 | api-gateway : auth au bord + `X-User-Context` JWS | PROMPT 3.7 | ADR-006, ADR-013, ADR-027, ADR-017                           |

### 4.2 ⚠️ Refs ADR cassées (sévérité P0)

**Bug #1 : ADR-024**

```markdown
**Complète** : [ADR-013 — Mobile Expo](./ADR-013-keycloak-identity-provider.md) (référentiel mobile)
```

- ❌ ADR-013 s'appelle `keycloak-identity-provider`, pas « Mobile Expo »
- 🎯 Le doc 13 (Mobile Expo) **n'a pas d'ADR dédié**

**Bug #2 : ADR-025**

```markdown
**Complète** : [ADR-014 — Audit Merkle](...),
[ADR-015 — Sécurité hardening](./ADR-015-ml-stack-detection-erreurs-nina.md) (Vault PKI)
```

- ❌ ADR-015 s'appelle `ml-stack-detection-erreurs-nina`, pas « Sécurité hardening »
- 🎯 Le doc 15 (Security Hardening) **n'a pas d'ADR dédié**

**Bug #3 : ADR-020**

```markdown
**Complète** :
[ADR-015 — Sécurité hardening (mTLS, Vault)](./ADR-015-ml-stack-detection-erreurs-nina.md)
```

- Même erreur que bug #2.

### 4.3 ADRs manquants

| Doc parent                        | ADR attendu                           | Statut actuel                                     |
| --------------------------------- | ------------------------------------- | ------------------------------------------------- |
| Doc 13 — Mobile App Expo          | ADR-XXX-mobile-expo-rn                | ❌ Manquant                                       |
| Doc 15 — Security Hardening       | ADR-XXX-security-hardening-vault      | ❌ Manquant (référencé fautivement comme ADR-015) |
| Doc 03 — Setup Env Dev            | (probablement pas nécessaire)         | —                                                 |
| Doc 12 — Frontend Integration API | ADR-XXX-frontend-nextjs-16-app-router | ❌ Manquant                                       |

### 4.4 Format ADR : 2 générations détectées

```
ADR-001 → ADR-013 : format « ancien » (Statut + Date + Décideurs +
                    Contexte + Décision + Conséquences + Souveraineté
                    + Alternatives)
                    SANS header "Complète"
ADR-014 → ADR-025 : format « nouveau » (idem + header "Complète : [ADR-X, Y, Z]")
                    AVEC graphe de dépendances explicite
```

→ Inconsistance qui complique l'extraction automatique d'un graphe des décisions.

---

## 5. Matrice de corrélation (vue agrégée)

```
                         ┌─────────────────────────────────────────┐
                         │                                          │
   AGENTS.md  ──────────►│   MAINTENANCE.md §3 « Quand modifier   │◄── CLAUDE.md
   copilot-i. ──────────►│       quoi » (matrice de règles)        │◄── ai-governance
   graphify  ──────────► │                                          │◄── README.md
                         └─────────────────────────────────────────┘
                                          │
                                          ▼ référence
                         ┌─────────────────────────────────────────┐
                         │                                          │
                         │  docs/00-README-INDEX.md (sommaire)     │
                         │  docs/CHANGELOG.md (état réel courant)  │
                         │                                          │
                         └─────────────────────────────────────────┘
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
              ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
              │ docs/01...26  │  │ docs/data/     │  │ docs/diagrams │
              │ (parcours)    │  │ docs/design-... │  │ (UML)         │
              └───────┬───────┘  └────────────────┘  └───────────────┘
                      │
                      ▼ chaque doc N peut renvoyer à
              ┌───────────────┐
              │ docs/adr/     │
              │ ADR-001..025  │
              └───────┬───────┘
                      │ chaque ADR référence
                      ▼
              ┌─────────────────────────────┐
              │ "Complète : [ADR-X, Y, Z]"  │
              │ (graphe inter-ADRs)         │
              └─────────────────────────────┘
```

### 5.1 Cross-références par catégorie

| Source                               | Cible(s)                             | Fréquence   | Enforced par           |
| ------------------------------------ | ------------------------------------ | ----------- | ---------------------- |
| README.md                            | docs/00, docs/CHANGELOG              | 2           | `docs-sync-check.mjs`  |
| docs/00-README-INDEX                 | docs/CHANGELOG                       | 1           | `docs-sync-check.mjs`  |
| docs/CHANGELOG                       | §8 Gouvernance IA                    | 1           | `docs-sync-check.mjs`  |
| MAINTENANCE.md                       | verify:repo                          | 1           | `docs-sync-check.mjs`  |
| AGENTS/CLAUDE/copilot/cursor         | MAINTENANCE.md                       | 1 each (4×) | `docs-sync-check.mjs`  |
| docs/16…25                           | ADR-016…025 (1-to-1)                 | 10          | ⚠️ pas enforced        |
| docs/16…25                           | ADR-014 Merkle, ADR-010 Docker, etc. | variable    | ⚠️ pas enforced        |
| ADR-014…025                          | header `Complète : [ADR-...]`        | variable    | ⚠️ pas enforced        |
| MAINTENANCE.md §9 (liens canoniques) | docs/16…26                           | 11          | ⚠️ ajouté manuellement |

`docs-sync-check.mjs` enforce **10 cross-refs** seulement. Le reste n'est pas vérifié
automatiquement → risque de drift silencieuse.

---

## 6. Synthèse des dérives (à jour 16 mai 2026)

|   # | Drift                                                                                                                                | Sévérité | Fichier(s)                                                                                         | Action                             |
| --: | ------------------------------------------------------------------------------------------------------------------------------------ | :------: | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
|   1 | ADR-024 réf cassée vers ADR-013 (mauvais titre)                                                                                      |  🔴 P0   | `docs/adr/ADR-024-*.md` ligne 5                                                                    | Fix immédiat                       |
|   2 | ADR-025 réf cassée vers ADR-015 (mauvais titre)                                                                                      |  🔴 P0   | `docs/adr/ADR-025-*.md` ligne 6                                                                    | Fix immédiat                       |
|   3 | ADR-020 réf cassée vers ADR-015 (mauvais titre)                                                                                      |  🔴 P0   | `docs/adr/ADR-020-*.md` ligne 5-6                                                                  | Fix immédiat                       |
|   4 | 2 docs orphelins (01-fondations + 02-infrastructure)                                                                                 |  🔴 P0   | `docs/01-fondations-monorepo-outillage-dx.md`, `docs/02-infrastructure-docker-services-donnees.md` | Archiver                           |
|   5 | ~~graphify-out snapshot 5 mai = stale 11 jours~~ ✅ Résolu 17 mai 2026 (`graphify update` → 613 nodes / 598 edges / 183 communautés) |    ✅    | `graphify-out/`                                                                                    | —                                  |
|   6 | AGENTS.md ne mentionne pas `verify:repo`                                                                                             |  🟡 P1   | `AGENTS.md`                                                                                        | Aligner sur copilot                |
|   7 | README.md ne référence pas MAINTENANCE.md                                                                                            |  🟡 P1   | `README.md`                                                                                        | Enrichir                           |
|   8 | ADR-013 (Mobile Expo) manquant                                                                                                       |  🟡 P1   | (à créer)                                                                                          | Reporté V2                         |
|   9 | ADR-015 réelle (Security Hardening) manquante                                                                                        |  🟡 P1   | (à créer)                                                                                          | Reporté V2                         |
|  10 | ADRs 001-013 sans header "Complète"                                                                                                  |  🟢 P2   | 13 ADRs                                                                                            | Backfill possible                  |
|  11 | `docs/api/`, `docs/security/`, `docs/observability/` vides                                                                           |  🟢 P2   | dossiers                                                                                           | Remplir au fil des implémentations |
|  12 | `docs-sync-check.mjs` enforce seulement 10 refs                                                                                      |  🟢 P2   | `scripts/docs-sync-check.mjs`                                                                      | Étendre progressivement            |

---

## 7. Recommandations priorisées

### 🔴 P0 — À corriger immédiatement (drifts qui trompent un lecteur)

1. **Fix les 3 refs ADR cassées** (ADR-024, ADR-025, ADR-020) → application sous quelques minutes
   (voir §8 ci-dessous).

2. **Archiver les 2 docs orphelins** `01-fondations-...md` et
   `02-infrastructure-docker-services-donnees.md` :
   - **Option A (recommandée)** : déplacer vers `docs/_archive/` avec un README expliquant qu'ils
     sont superposés par les docs `01-CAHIER-DES-CHARGES.md` + `02-ARCHITECTURE-GLOBALE.md`.
   - **Option B** : supprimer directement (`git rm`) — content déjà intégré dans les canoniques.
   - **Option C** : renommer avec suffixe `-LEGACY.md` pour conservation visible.

3. **Étendre `docs-sync-check.mjs`** pour interdire l'ajout futur d'orphelins :
   ```js
   // Vérifier que tout docs/NN-*.md soit listé dans 00-README-INDEX.md §2
   ```

### 🟡 P1 — À corriger cette session ou la suivante

4. **Aligner les 4 fichiers IA** sur les 5 invariants partagés :
   - `AGENTS.md` : ajouter mention `verify:repo` + `docs:sync:check`
   - `CLAUDE.md` : ajouter référence aux 26 ADRs comme source
   - `README.md` : enrichir avec liens MAINTENANCE.md + DOCUMENTATION-MAP.md

5. ~~**Re-générer graphify** ou marquer le snapshot comme stale~~ ✅ **Fait le 17 mai 2026** :
   `graphify update .` exécuté → snapshot passé de 210 à 613 nodes (cf. §3.4 pour les détails).
   Drift P1 #5 clôturé.

6. **Créer les ADRs manquants** pour docs 13 (Mobile) et 15 (Security) — reportable V2 si pas
   urgent.

### 🟢 P2 — Améliorations qualitatives

7. **Backfill du header "Complète"** sur les ADRs 001-013 pour homogénéiser le format
   inter-générations.

8. **Remplir les dossiers vides** au fil des implémentations : `docs/api/` (OpenAPI BCID-AES déjà
   spec dans doc 21), `docs/security/` (SECURITY-RUNBOOK prévu doc 15), `docs/observability/`
   (RUNBOOK + SLOs prévu doc 17 + DRP-RUNBOOK prévu doc 19).

9. **Étendre `docs-sync-check.mjs`** pour vérifier :
   - Chaque `docs/NN-*.md` listé dans 00-README-INDEX
   - Chaque ADR cite son doc parent dans `**Contexte document**`
   - Chaque `Complète :` pointe vers un ADR existant
   - Les 4 fichiers IA citent tous `MAINTENANCE.md`

---

## 8. Actions immédiatement exécutables

Les fixes P0 #1-3 (refs ADR cassées) + P1 #4 (alignement gouvernance) ont été appliquées en même
temps que la création de ce document (commit `<HASH>` ci-dessous).

### 8.1 Fixes P0 appliqués

| Fichier           | Avant                                                                                        | Après                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ADR-024.md` L5   | `[ADR-013 — Mobile Expo](./ADR-013-keycloak-identity-provider.md) (référentiel mobile)`      | Supprimé (pas d'ADR Mobile dédié)                                                                                                     |
| `ADR-025.md` L6   | `[ADR-015 — Sécurité hardening](./ADR-015-ml-stack-detection-erreurs-nina.md) (Vault PKI)`   | `[ADR-014 — Audit Merkle](./ADR-014-audit-event-driven-append-only.md)` seul + mention « doc 15 sécurité hardening (sans ADR dédié) » |
| `ADR-020.md` L5-6 | `[ADR-015 — Sécurité hardening (mTLS, Vault)](./ADR-015-ml-stack-detection-erreurs-nina.md)` | Supprimée + remplacée par mention textuelle du doc 15                                                                                 |

### 8.2 Fixes P1 appliqués

- ✅ `AGENTS.md` : ajout `verify:repo` dans les validation commands
- ✅ `README.md` : enrichi avec liens vers MAINTENANCE.md + DOCUMENTATION-MAP.md + tableau status
  27/27 docs
- ✅ `graphify-out/GRAPH_REPORT.md` : régénéré le 17 mai 2026 via `graphify update .` (613 nodes /
  598 edges / 183 communautés)
- ✅ `docs/CHANGELOG.md` §26 : entrée traçant cette session de consolidation

### 8.3 Fixes différés (P1/P2, non bloquants)

- ⏳ ADR-013 (Mobile Expo) à créer en V2
- ⏳ ADR pour Doc 15 (Security Hardening) à créer en V2 — actuellement l'ADR-015 est utilisée pour
  ML, pas pour la sécurité
- ⏳ Backfill `Complète` sur ADRs 001-013
- ✅ ~~Re-génération graphify (`graphify update .`)~~ — fait le 17 mai 2026
- ⏳ Extension `docs-sync-check.mjs`

---

## 9. Modèle mental pour les assistants IA futurs

Quand un assistant IA reçoit une tâche dans ce repo, il doit appliquer **dans l'ordre** :

```
Étape 1 — Lire le bootstrap (1 min)
   ┌──────────────────────┐
   │ CLAUDE.md  (25 l)    │  ◄── point d'entrée Claude Code
   │ AGENTS.md  (54 l)    │  ◄── universel
   └──────────────────────┘

Étape 2 — Lire l'état réel (3 min)
   ┌────────────────────────────────┐
   │ docs/CHANGELOG.md  (1715 l)    │  ◄── ce qui marche vraiment
   │ docs/00-README-INDEX.md (495 l)│  ◄── parcours canonique
   └────────────────────────────────┘

Étape 3 — Identifier le scope opérationnel (2 min)
   ┌────────────────────────────────┐
   │ MAINTENANCE.md §3              │  ◄── « si je touche X, je MAJ Y »
   │ DOCUMENTATION-MAP.md (ce doc)  │  ◄── carte des dépendances
   └────────────────────────────────┘

Étape 4 — Approfondir si nécessaire
   ┌────────────────────────────────┐
   │ Doc canonique parent           │
   │ ADR(s) liée(s)                  │
   │ graphify-out/  (si fresh)      │
   └────────────────────────────────┘

Étape 5 — Modifier le code ET la doc dans le même change set
   ┌────────────────────────────────┐
   │ git add <code> <docs>          │
   │ pnpm run verify:repo            │
   │ git commit -m "..."             │
   └────────────────────────────────┘
```

---

## 10. Maintenance de ce document

Ce `DOCUMENTATION-MAP.md` doit être mis à jour quand :

1. ✅ Nouveau doc Tier 2 ajouté (numéroté ou thématique)
2. ✅ Nouveau ADR ajouté (Tier 3)
3. ✅ Drift détecté (manuellement ou via extension future de `docs-sync-check.mjs`)
4. ✅ Convention de gouvernance modifiée (un des 4 fichiers IA)
5. ✅ Refactor majeur d'arborescence `docs/`

Cadence recommandée : revue trimestrielle + à chaque release majeure (tag Git `v0.X.0-*` ou
`v1.X.0`).

---

## 11. Annexe — Inventaire complet horodaté

```
2026-04-XX  Docs 00-15 + ADRs 001-015 + diagrams + design-system     (existant)
2026-05-03  Données Mali, MAINTENANCE.md, AGENTS.md, docs-sync-check (commits antérieurs)
2026-05-05  graphify-out/ snapshot (stale au 16 mai)
2026-05-16  Doc enrichissement Mali + INSTAT workflow                (da87dbd)
2026-05-16  Doc 16 CICD + ADR-016                                    (a59ef3f)
2026-05-16  Doc 17 Observabilité + ADR-017                           (1cbf838)
2026-05-16  Doc 18 Tests + ADR-018                                   (f4453e4)
2026-05-16  Doc 19 Backup + ADR-019                                  (95ab390)
2026-05-16  Doc 20 K3s + ADR-020                                     (971bd60)
2026-05-16  Docs 21-26 + ADRs 021-025                                (f9e8f9a)
2026-05-16  DOCUMENTATION-MAP.md + fixes P0/P1                       (ce commit)
2026-05-25  ADR-026 Vault Transit QR + docs/10 v2.0                  (document-service)
2026-05-30  ADR-027 auth-guards type-only                           (auth-service boot fix)
2026-06-04  ADR-028 appointment-service + modèle EnrollmentCenter   (PROMPT 3.6)
2026-06-13  ADR-029 api-gateway auth au bord + X-User-Context JWS   (PROMPT 3.7)
```

État final : **27/27 docs canoniques + 29 ADRs + 6 gouvernance + 7 catalogues transversaux + 1 carte
(ce doc) = ~30 000 lignes de documentation cohérente.**

---

_Document Carte — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
