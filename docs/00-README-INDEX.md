# 00 — Index de Navigation et Vue d'Ensemble

> **Projet** : NINA-AES Platform — Système Sécurisé de Gestion d'Identité Numérique pour l'AES
> **Auteur** : Étudiant en informatique, UQAR **Date de création** : Avril 2026 **Version** : 1.0
> **Statut** : CONFIDENTIEL — Document académique

---

## 1. Présentation du parcours d'implémentation

Ce répertoire `docs/` contient **27 documents numérotés** qui guident, pas à pas, l'implémentation
complète de la NINA-AES Platform. Chaque document est **autonome, exhaustif et exécutable** : un
étudiant seul peut suivre les instructions dans l'ordre, copier-coller les commandes CLI, et obtenir
un résultat vérifiable à chaque étape.

### Philosophie du parcours

Le parcours suit trois principes :

1. **Progressivité** — On ne code jamais un service sans avoir d'abord posé l'infrastructure qui le
   porte. On ne connecte jamais un frontend à un backend qui n'existe pas encore. Chaque document
   s'appuie sur les livrables des documents précédents.

2. **Bloc A d'abord** — Le cœur du système (NINA Mali : identité, authentification, audit,
   documents, IA, portail citoyen, mobile, USSD) est construit intégralement avant de toucher aux
   blocs B à F. C'est le MVP de soutenance.

3. **Vérification systématique** — Chaque document se termine par des tests de validation concrets
   (commandes `curl`, captures d'écran, sorties attendues) et une checklist de fin d'étape. Rien
   n'est considéré comme terminé tant que la checklist n'est pas cochée.

### État actuel du repo (mai 2026)

> ⚠️ **Pour les versions effectives, écarts et incidents résolus**, consulter en priorité
> **[`CHANGELOG.md`](./CHANGELOG.md)** — c'est la source de vérité qui surclasse les
> versions/commandes mentionnées dans les documents numérotés quand il y a contradiction.

| Élément                          | État                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Monorepo Turborepo 2.9.5         | ✅ Initialisé                                                                                           |
| pnpm                             | ✅ v10.12.1                                                                                             |
| `apps/web` + `apps/docs`         | ⚠️ Scaffolds par défaut Turborepo — à remplacer par `citizen`, `admin`, `governance`                    |
| `apps/citizen` (port 4001)       | ✅ **Sessions 1+2 livrées** — PC-01 à PC-06 + auth Keycloak BFF (mock mode actif)                       |
| `apps/admin` (port 4002)         | ✅ **Sessions 3+4 — foundation + AD-01/02/03** — Dashboard + DataGrid + SIGAC (mock)                    |
| `apps/governance` (port 4003)    | ❌ Scaffold Turborepo — prévu Session 5+                                                                |
| `packages/ui`                    | ✅ **Sessions 1+3+4** — design system + Sheet/Checkbox/DropdownMenu + 4 charts SVG                      |
| `packages/auth`                  | ✅ **Session 5 — BFF auth partagé** — session helpers + 4 OIDC handlers factory                         |
| Tests E2E (Playwright)           | ✅ **Session 5** — 11 tests dans `e2e/`, multi-app, mode mock NINA_AUTH_MODE                            |
| `packages/api-client`            | ✅ **Livré (Sessions 1+2)** — identity + correction + appointment + sigac (Zod)                         |
| `packages/i18n`                  | ✅ **Livré (Sessions 1+3, FR complet + namespace admin)** — fallback FR par-clé                         |
| `packages/eslint-config`         | ✅ Présent                                                                                              |
| `packages/typescript-config`     | ✅ Présent                                                                                              |
| `packages/shared-types`          | ✅ **Livré (PROMPT 1.2)** — 11 enums, 16 interfaces, DTOs Zod                                           |
| `packages/database` (Prisma 7.8) | ✅ **Livré (PROMPT 1.3)** — 16 modèles, schema validé, seed appliqué (371 locations)                    |
| `packages/config` (Zod)          | ✅ **Livré (PROMPT 1.4)** — schéma exhaustif + 9 tests Jest                                             |
| `packages/utils` (NINA helpers)  | ✅ **Livré (PROMPT 1.4)** — NINA + Merkle + crypto + sanitize, 44 tests Jest                            |
| `packages/logger`                | ⚠️ **Stub temporaire** — implémentation Pino + Loki à livrer doc 17                                     |
| `services/` (11 microservices)   | ⚠️ Scaffolds — corps des services aux docs 07 → 11                                                      |
| `infrastructure/docker/`         | ✅ `docker-compose.dev.yml` opérationnel (PostgreSQL+PostGIS), corrections en cours                     |
| `docs/diagrams/*.puml`           | ✅ **8 diagrammes UML livrés (PROMPT 1.5)** — 1 557 lignes                                              |
| `ai-models/` (datasets, modèles) | ❌ Inexistant — à créer                                                                                 |
| `.github/workflows/` (CI/CD)     | ✅ **Livré (mai 2026)** — 4 workflows (ci, cd-staging, release, codeql) + composite action + dependabot |
| `scripts/` (Bash + PowerShell)   | ✅ Init-db.sql + setup.ps1 + setup.sh + `typecheck.ts` (placeholder TS)                                 |
| Husky + hooks pre-commit         | ✅ **Livré (mai 2026)** — pre-commit + commit-msg + pre-push, commitlint 45 scopes, CONTRIBUTING.md     |
| Docker Compose local             | ✅ Postgres+PostGIS démarrable via `pnpm docker:up`                                                     |
| Schéma Prisma                    | ✅ 16 modèles, migration `init_v1` appliquée                                                            |
| Tests Jest (utils + config)      | ✅ **53 tests passants** (44 utils + 9 config)                                                          |
| Tests Vitest (database)          | ⚠️ Vitest 4.1.5 installé, suites à écrire                                                               |

---

## 2. Les 27 documents — Index détaillé

### Phase transversale — Conception et fondations (Documents 00 à 06)

| #      | Document                              | Description                                                                                                                                                                                                                                                       | Durée estimée | Bloc |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| **00** | `00-README-INDEX.md`                  | Ce document. Index de navigation, vue d'ensemble du parcours, jalons de soutenance.                                                                                                                                                                               | —             | —    |
| **01** | `01-CAHIER-DES-CHARGES.md`            | Spécifications fonctionnelles et non-fonctionnelles complètes. Exigences par objectif (O1–O9), cas d'utilisation principaux, contraintes techniques, critères d'acceptation mesurables.                                                                           | 8–12 h        | —    |
| **02** | `02-ARCHITECTURE-GLOBALE.md`          | Architecture technique détaillée avec diagrammes Mermaid : vue C4 (contexte, conteneurs, composants), flux de données inter-services, choix techniques justifiés avec ADR (Architecture Decision Records).                                                        | 6–10 h        | —    |
| **03** | `03-SETUP-ENVIRONNEMENT-DEV.md`       | Installation complète du poste de travail Windows : Node.js 24 LTS, pnpm 10, Docker Desktop, PostgreSQL 18, Python 3.14, Git, VS Code avec extensions recommandées, WSL2 si nécessaire. Vérification de chaque outil.                                             | 4–6 h         | —    |
| **04** | `04-MONOREPO-STRUCTURE.md`            | Restructuration du Turborepo starter vers l'arborescence cible. Création des workspaces `services/*`, `packages/*` manquants. Configuration Husky, commitlint, Makefile, scripts utilitaires.                                                                     | 6–10 h        | —    |
| **05** | `05-INFRASTRUCTURE-DOCKER-COMPOSE.md` | Fichier `docker-compose.yml` local complet avec PostgreSQL 18, Redis 8.6, RabbitMQ 4.2, MinIO, Keycloak 26.5, HashiCorp Vault, Elasticsearch 9.3. Healthchecks, volumes persistants, réseau dédié.                                                                | 8–12 h        | —    |
| **06** | `06-DATABASE-SCHEMA-PRISMA.md`        | Schéma Prisma unifié couvrant les 11 services. Modèles pour identités NINA, utilisateurs, sessions, audit, documents, rendez-vous, notifications, gouvernance, anti-corruption. Migrations initiales et seeds géographiques (régions, cercles, communes du Mali). | 12–16 h       | —    |

### Bloc A — NINA Mali : le cœur du système (Documents 07 à 14)

| #      | Document                             | Description                                                                                                                                                                                                                                                                   | Durée estimée | Bloc |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| **07** | `07-BACKEND-IDENTITY-SERVICE.md`     | Microservice `identity-service` (port 3001, NestJS) : CRUD complet des enregistrements NINA, recherche floue Elasticsearch, validation du format NINA (15 caractères), calcul de la lettre de contrôle, pagination, filtres. Code intégralement commenté.                     | 16–24 h       | A    |
| **08** | `08-BACKEND-AUTH-SERVICE.md`         | Microservice `auth-service` (port 3002, NestJS) : intégration Keycloak OAuth2/OIDC, émission JWT RS256, refresh tokens, MFA TOTP + SMS pour agents, RBAC 6 rôles (citoyen, agent, superviseur, admin, auditeur, inspecteur), guards NestJS.                                   | 16–24 h       | A    |
| **09** | `09-BACKEND-AUDIT-SERVICE.md`        | Microservice `audit-service` (port 3007, NestJS) : journal d'audit append-only, chaîne de hash Merkle (SHA-256), vérification d'intégrité, recherche par acteur/action/ressource, rétention 10 ans, endpoint de preuve cryptographique.                                       | 12–16 h       | A    |
| **10** | `10-BACKEND-DOCUMENT-SERVICE.md`     | Microservice `document-service` (port 3004, NestJS) : génération de la Fiche Descriptive Individuelle en PDF (Puppeteer + pdf-lib), QR code JWT RS256 signé (NINA + hash biométrique + timestamp + signature CTDEC), stockage MinIO, endpoint de vérification.                | 12–16 h       | A    |
| **11** | `11-AI-SERVICE-FASTAPI.md`           | Service IA (port 3003, FastAPI/Python) : pipeline de détection en 5 étapes (ingestion, normalisation, analyse, scoring XGBoost, soumission). Dataset synthétique de 10 000 enregistrements NINA avec erreurs intentionnelles. RapidFuzz, spaCy, Soundex, règles métier RAVEC. | 20–30 h       | A    |
| **12** | `12-FRONTEND-INTEGRATION-API.md`     | Connexion des 3 apps Next.js 16 (citizen, admin, governance) aux APIs backend. Client HTTP typé, gestion des tokens JWT, intercepteurs, pages dynamiques, formulaires de correction, tableau de bord IA, design system AES complet.                                           | 16–24 h       | A    |
| **13** | `13-MOBILE-APP-EXPO.md`              | Application React Native Expo (SDK 55+) : scan QR code de la Fiche Descriptive, vérification JWT, authentification biométrique locale (FaceID/empreinte), notifications push, mode offline partiel, navigation entre les écrans principaux.                                   | 16–20 h       | A    |
| **14** | `14-USSD-SERVICE-AFRICAS-TALKING.md` | Implémentation USSD complète via Africa's Talking. Menu `*123*NINA#` en 8 langues (français, bambara, songhaï, peul, tamasheq, haoussa, mooré, djerma). Sessions Redis avec TTL 5 min. 5 options : vérifier NINA, prendre RDV, suivre demande, signaler, changer langue.      | 12–16 h       | A    |

### Phase transversale — Qualité, sécurité, déploiement (Documents 15 à 20)

| #      | Document                          | Description                                                                                                                                                                                                                                            | Durée estimée | Bloc |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---- |
| **15** | `15-SECURITY-HARDENING.md`        | Durcissement sécuritaire complet : configuration mTLS entre services, rotation automatique des secrets via Vault (90 jours), correction des 20 failles identifiées, headers CSP/HSTS, rate limiting, CORS, scan OWASP ZAP, audit Trivy sur conteneurs. | 10–14 h       | A    |
| **16** | `16-CICD-GITHUB-ACTIONS.md`       | Workflows GitHub Actions : lint (ESLint + Prettier), tests unitaires (Jest + Pytest), build multi-apps Turborepo, scan de sécurité (Trivy + Snyk), déploiement staging automatique, badges de statut, matrice de tests.                                | 8–12 h        | —    |
| **17** | `17-MONITORING-OBSERVABILITY.md`  | Stack d'observabilité complète : Prometheus (métriques), Grafana (dashboards), Loki (logs centralisés), Jaeger (traces distribuées). Alerting sur latence, erreurs 5xx, saturation disque. Dashboards pré-configurés pour les 11 services.             | 8–12 h        | —    |
| **18** | `18-TESTING-STRATEGY.md`          | Stratégie de tests à 4 niveaux : unitaires (Jest pour TS, Pytest pour Python), intégration (Supertest + TestContainers), E2E (Playwright sur les 3 apps Next.js), charge (k6 avec scénarios réalistes de pic d'enrôlement). Couverture cible >= 80%.   | 12–16 h       | —    |
| **19** | `19-BACKUP-RECOVERY.md`           | Stratégie de sauvegarde : pg_dump quotidien chiffré (PostgreSQL), réplication MinIO, snapshots Redis, plan de reprise après sinistre (DRP), RTO < 4h, RPO < 1h. Scripts automatisés et tests de restauration.                                          | 6–8 h         | —    |
| **20** | `20-DEPLOYMENT-K3S-PRODUCTION.md` | Déploiement K3s (Kubernetes léger) : Helm charts pour les 11 services, Ingress Nginx, certificats TLS Let's Encrypt via cert-manager, configuration des namespaces, limites de ressources, rolling updates, stratégie blue-green.                      | 10–14 h       | —    |

### Blocs B à F — Extensions et vision long terme (Documents 21 à 25)

| #      | Document                               | Description                                                                                                                                                                                                                                                                                    | Durée estimée | Bloc |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| **21** | `21-BLOC-B-INTEROPERABILITE-AES.md`    | Plan d'implémentation détaillé du protocole BCID-AES : `interop-service` (port 3006), mTLS entre gateways nationaux, signatures Ed25519, modèle requête-réponse minimal, rate limiting 1000 req/h/pays, tables `aes_verification_logs`.                                                        | 8–12 h        | B    |
| **22** | `22-BLOC-C-MODULES-GOUVERNEMENTAUX.md` | Trois sous-modules : (1) `vulnerability-service` (port 3011) pour les personnes vulnérables — files prioritaires, agents mobiles, kits offline ; (2) SGOGT — messagerie officielle signée avec escalade automatique ; (3) Intégrité électorale — fichier dynamique, inscription auto à 18 ans. | 10–14 h       | C    |
| **23** | `23-BLOC-D-SIGAC-ANTICORRUPTION.md`    | `anticorruption-service` (port 3009, FastAPI) : Isolation Forest pour détection d'anomalies comportementales, LSTM pour analyse temporelle, BERT multilingue pour signalements, scoring d'intégrité 5 facteurs, canal `*123*ALERTE#`, chiffrement asymétrique des dénonciations.               | 10–14 h       | D    |
| **24** | `24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md` | Application Electron pour bornes interactives en mairie : interface simplifiée avec pictogrammes, mode kiosque verrouillé, lecteur QR intégré, impression de récépissés, synchronisation avec `appointment-service`.                                                                           | 6–8 h         | E    |
| **25** | `25-BLOC-F-BIOMETRIE.md`               | Plan d'intégration biométrique (en dernier, P3) : capture d'empreintes digitales, reconnaissance faciale, hachage irréversible, vérification 1:1 et 1:N, considérations éthiques et juridiques, conformité souveraineté numérique.                                                             | 6–8 h         | F    |

### Clôture du projet (Document 26)

| #      | Document                         | Description                                                                                                                                                                                                                                                | Durée estimée | Bloc |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| **26** | `26-RAPPORT-FINAL-SOUTENANCE.md` | Préparation de la soutenance : plan de présentation (20–30 min), script de démonstration live, métriques à présenter (couverture de tests, temps de réponse API, score IA), diapositives suggérées, questions anticipées du jury, rétrospective du projet. | 8–12 h        | —    |

---

## 3. Estimation de la durée totale

### Périmètre universitaire (Bloc A + transversal) — Documents 00 à 20

| Catégorie                      | Documents   | Heures estimées |
| ------------------------------ | ----------- | --------------- |
| Conception et fondations       | 00 à 06     | 45 – 66 h       |
| Backend core (4 microservices) | 07 à 10     | 56 – 80 h       |
| Service IA                     | 11          | 20 – 30 h       |
| Frontend + Mobile + USSD       | 12 à 14     | 44 – 60 h       |
| Qualité, sécurité, déploiement | 15 à 20     | 54 – 76 h       |
| **Sous-total Bloc A**          | **00 à 20** | **219 – 312 h** |

### Vision complète (Blocs B à F) — Documents 21 à 26

| Catégorie                 | Documents   | Heures estimées |
| ------------------------- | ----------- | --------------- |
| Extensions Blocs B à F    | 21 à 25     | 40 – 56 h       |
| Clôture et soutenance     | 26          | 8 – 12 h        |
| **Sous-total extensions** | **21 à 26** | **48 – 68 h**   |

### Total global

| Périmètre                        | Heures          | Semaines (à 25h/sem) |
| -------------------------------- | --------------- | -------------------- |
| **Bloc A seul (MVP soutenance)** | **219 – 312 h** | **9 – 13 semaines**  |
| **Projet complet (A → F)**       | **267 – 380 h** | **11 – 16 semaines** |

> **Note réaliste** : Ces estimations supposent un étudiant travaillant à temps plein sur le projet
> (~25h/semaine dédiées au code et à la documentation). Comptez un facteur 1.3× à 1.5× pour les
> imprévus (bugs d'installation, incompatibilités de versions, temps d'apprentissage de nouvelles
> technologies).

---

## 4. Jalons de soutenance

Le parcours est ponctué de **cinq jalons** qui correspondent à des moments où le projet est
démontrable devant un jury ou un professeur tuteur.

### Jalon 1 — Fondations (après document 06)

**Quand** : Semaine 3–4 **Ce qu'on peut montrer** :

- Cahier des charges validé
- Diagrammes d'architecture (Mermaid, C4)
- Environnement de développement fonctionnel
- Monorepo structuré avec tous les workspaces
- Docker Compose qui lance tous les services d'infrastructure
- Schéma Prisma compilé et migrations exécutées
- Base de données peuplée avec les seeds géographiques du Mali

**Valeur démontrée** : Rigueur de conception, maîtrise de l'outillage moderne, compréhension du
domaine métier.

---

### Jalon 2 — Backend fonctionnel (après document 11)

**Quand** : Semaine 7–9 **Ce qu'on peut montrer** :

- 4 microservices NestJS opérationnels (identity, auth, audit, document)
- Service IA FastAPI avec pipeline de détection fonctionnel
- Démonstration curl : créer un citoyen → détecter une erreur IA → générer un PDF signé → vérifier
  le QR code JWT
- Chaîne Merkle d'audit vérifiable
- Authentification Keycloak avec JWT RS256

**Valeur démontrée** : Maîtrise backend, architecture microservices, intégration IA, sécurité
applicative.

---

### Jalon 3 — MVP complet Bloc A (après document 14)

**Quand** : Semaine 10–12 **Ce qu'on peut montrer** :

- Portail citoyen Next.js connecté aux APIs
- Dashboard admin avec validation des corrections IA
- Application mobile avec scan QR
- Simulateur USSD fonctionnel en 8 langues
- Parcours utilisateur complet de bout en bout

**Valeur démontrée** : Full-stack opérationnel, inclusion numérique, expérience utilisateur.

---

### Jalon 4 — Production-ready (après document 20)

**Quand** : Semaine 12–14 **Ce qu'on peut montrer** :

- Pipeline CI/CD GitHub Actions fonctionnel
- Stack de monitoring (Grafana dashboards)
- Tests automatisés (couverture >= 80%)
- Sécurité durcie (scan OWASP, Trivy clean)
- Déploiement K3s avec certificats TLS

**Valeur démontrée** : Pratiques DevOps professionnelles, qualité logicielle, prêt pour la
production.

---

### Jalon 5 — Soutenance (après document 26)

**Quand** : Semaine 14–16 **Ce qu'on peut montrer** :

- Démonstration live complète du Bloc A
- Plans architecturaux détaillés pour les Blocs B à F
- Métriques de qualité (couverture, performance, sécurité)
- Rapport final structuré
- Rétrospective honnête (limites, questions ouvertes, perspectives)

**Valeur démontrée** : Vision systémique, maturité technique, capacité à concevoir au-delà du code
livré.

---

## 5. Rappel des Blocs et de leur priorité

```
┌─────────────────────────────────────────────────────────────────┐
│                    NINA-AES PLATFORM                            │
│                    Ordre d'implémentation                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─── BLOC A (P0 — DÉMARRER ICI) ───────────────────────────┐  │
│  │                                                           │  │
│  │  NINA Mali complet                                        │  │
│  │  ├── Backend : identity + auth + audit + document + IA    │  │
│  │  ├── Frontend : citizen + admin + governance (Next.js)    │  │
│  │  ├── Mobile : React Native Expo (scan QR, offline)        │  │
│  │  └── USSD : *123*NINA# (8 langues, Africa's Talking)     │  │
│  │                                                           │  │
│  │  Documents : 07 → 14                                      │  │
│  │  Durée : 6–8 semaines                                     │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│           │                                                     │
│           ▼                                                     │
│  ┌─── BLOC B (P1) ──────────────┐  ┌─── BLOC C (P1) ────────┐  │
│  │ Interopérabilité AES         │  │ Modules gouvernementaux │  │
│  │ interop-service (mTLS)       │  │ Vulnérables + SGOGT     │  │
│  │ Ed25519, BCID-AES            │  │ + Intégrité électorale  │  │
│  │ Document : 21                │  │ Document : 22           │  │
│  └──────────────────────────────┘  └─────────────────────────┘  │
│           │                                │                    │
│           ▼                                ▼                    │
│  ┌─── BLOC D (P2) ──────────────┐  ┌─── BLOC E (P2) ────────┐  │
│  │ SIGAC Anti-corruption        │  │ Bornes kiosque Electron │  │
│  │ Isolation Forest + LSTM      │  │ Interface simplifiée    │  │
│  │ Lanceurs d'alerte chiffrés   │  │ Mode kiosque verrouillé │  │
│  │ Document : 23                │  │ Document : 24           │  │
│  └──────────────────────────────┘  └─────────────────────────┘  │
│           │                                │                    │
│           └────────────┬───────────────────┘                    │
│                        ▼                                        │
│  ┌─── BLOC F (P3 — EN DERNIER) ─────────────────────────────┐  │
│  │ Biométrie complète                                        │  │
│  │ Empreintes + reconnaissance faciale + hash irréversible   │  │
│  │ Document : 25                                             │  │
│  │ ⚠️  NE PAS Y TOUCHER AVANT d'avoir terminé A → E        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Prérequis globaux

Avant de commencer le document 01, vérifier que les éléments suivants sont en place :

### Matériel et logiciel

| Prérequis                                                                        | Vérifié ? |
| -------------------------------------------------------------------------------- | --------- |
| PC Windows 10/11 avec au minimum 16 Go RAM et 50 Go d'espace disque libre        | ☐         |
| Connexion internet stable (pour téléchargement des dépendances et images Docker) | ☐         |
| Compte GitHub actif (de préférence GitHub Education pour les avantages gratuits) | ☐         |
| Docker Desktop installé et fonctionnel sous Windows                              | ☐         |
| Git installé et configuré (`git config user.name` et `user.email`)               | ☐         |
| Éditeur de code : VS Code recommandé (extensions détaillées dans le document 03) | ☐         |

### Connaissances préalables recommandées

| Domaine                             | Niveau attendu                                                 |
| ----------------------------------- | -------------------------------------------------------------- |
| TypeScript / JavaScript             | Intermédiaire — syntaxe ES2024+, async/await, types génériques |
| React / Next.js                     | Intermédiaire — App Router, Server Components, hooks           |
| Node.js                             | Intermédiaire — npm/pnpm, modules, EventEmitter                |
| SQL / PostgreSQL                    | Bases — SELECT, JOIN, CREATE TABLE, index                      |
| Python                              | Bases — fonctions, classes, pip, environnements virtuels       |
| Docker                              | Débutant avancé — Dockerfile, docker-compose, volumes          |
| Git                                 | Intermédiaire — branches, merge, rebase, conventional commits  |
| REST API                            | Intermédiaire — verbes HTTP, codes de statut, JSON             |
| Ligne de commande (Bash/PowerShell) | Bases — navigation, variables d'environnement, scripts         |

> **Note** : Le parcours est conçu pour être pédagogique. Chaque technologie nouvelle est expliquée
> au moment de son introduction. Cependant, un minimum de familiarité avec les fondamentaux accélère
> considérablement la progression.

---

## 7. Conventions utilisées dans tous les documents

### Conventions de code

| Convention                | Exemple                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| Noms de fichiers          | `kebab-case` : `identity-service.controller.ts`                     |
| Noms de classes           | `PascalCase` : `IdentityController`                                 |
| Noms de fonctions         | `camelCase` : `findByNina()`                                        |
| Noms de tables SQL        | `snake_case` : `nina_records`                                       |
| Variables d'environnement | `SCREAMING_SNAKE_CASE` : `DATABASE_URL`                             |
| Branches Git              | `type/description` : `feat/identity-service`, `fix/nina-validation` |
| Commits Git               | Conventional Commits : `feat(identity): add NINA search endpoint`   |

### Conventions de documentation

| Icône | Signification                                |
| ----- | -------------------------------------------- |
| ✅    | Étape terminée / validation réussie          |
| ⚠️    | Attention — point important à ne pas manquer |
| ❌    | Erreur courante / à éviter                   |
| 💡    | Astuce ou explication complémentaire         |
| 🔒    | Point de sécurité critique                   |
| 📋    | Checklist ou liste de vérification           |

### Ports réservés

| Port  | Service                       | Stack             |
| ----- | ----------------------------- | ----------------- |
| 3000  | API Gateway (futur)           | NestJS            |
| 3001  | identity-service              | NestJS            |
| 3002  | auth-service                  | NestJS            |
| 3003  | ai-service                    | FastAPI           |
| 3004  | document-service              | NestJS            |
| 3005  | notification-service          | NestJS            |
| 3006  | interop-service               | NestJS            |
| 3007  | audit-service                 | NestJS            |
| 3008  | appointment-service           | NestJS            |
| 3009  | anticorruption-service        | FastAPI           |
| 3010  | governance-service            | NestJS            |
| 3011  | vulnerability-service         | NestJS            |
| 4000  | Portail citoyen (Next.js)     | Next.js           |
| 4001  | Dashboard admin (Next.js)     | Next.js           |
| 4002  | Portail gouvernance (Next.js) | Next.js           |
| 5432  | PostgreSQL                    | PostgreSQL 18     |
| 6379  | Redis                         | Redis 8.6         |
| 5672  | RabbitMQ (AMQP)               | RabbitMQ 4.2      |
| 15672 | RabbitMQ (Management UI)      | RabbitMQ 4.2      |
| 8080  | Keycloak                      | Keycloak 26.5     |
| 8200  | HashiCorp Vault               | Vault             |
| 9200  | Elasticsearch                 | Elasticsearch 9.3 |
| 9000  | MinIO (API)                   | MinIO             |
| 9001  | MinIO (Console)               | MinIO             |
| 9090  | Prometheus                    | Prometheus        |
| 3100  | Grafana                       | Grafana           |
| 3200  | Loki                          | Loki              |
| 16686 | Jaeger                        | Jaeger            |

---

## 8. Comment utiliser ces documents

### Lecture séquentielle (recommandé pour la première fois)

```
00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14
                                                                              │
15 → 16 → 17 → 18 → 19 → 20 ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ┘
                              │
21 → 22 → 23 → 24 → 25 → 26 ┘
```

### Lecture ciblée (si un document spécifique est nécessaire)

Chaque document indique explicitement ses **prérequis** dans l'en-tête. Il est possible de sauter
directement à un document si tous ses prérequis sont satisfaits, mais ce n'est pas recommandé pour
un premier passage.

### Cadence de travail suggérée

| Rythme                   | Documents par semaine | Fin du Bloc A | Fin complète |
| ------------------------ | --------------------- | ------------- | ------------ |
| Intensif (30+ h/sem)     | 2–3 documents         | Semaine 7     | Semaine 11   |
| Régulier (20–25 h/sem)   | 1–2 documents         | Semaine 10    | Semaine 14   |
| Progressif (10–15 h/sem) | 1 document            | Semaine 16    | Semaine 22   |

---

## 9. Avertissements importants

### Sur la souveraineté numérique

Ce projet est conçu dans un contexte de **souveraineté numérique absolue**. Les choix techniques
privilégient systématiquement les solutions open source auto-hébergeables. Les services cloud
utilisés en développement (GitHub, Cloudflare) le sont par commodité et peuvent être remplacés par
des équivalents souverains en production (Gitea, Nginx avec gestion TLS propre).

### Sur la sécurité

Les documents de ce parcours contiennent des configurations de sécurité pour un **environnement de
développement**. Les secrets, mots de passe et certificats utilisés dans les exemples ne doivent
**jamais** être réutilisés en production. Le document 15 (Security Hardening) détaille les mesures
supplémentaires pour un déploiement réel.

### Sur les données

Aucune donnée réelle de citoyens maliens n'est utilisée dans ce projet. Le dataset IA (document 11)
est **entièrement synthétique**, généré algorithmiquement pour reproduire les caractéristiques
statistiques des erreurs documentées sans contenir aucune information personnelle réelle.

### Sur le cadre académique

Ce projet est un **exercice universitaire**. Les recommandations institutionnelles (CTDEC, DNEC,
AES) sont des propositions architecturales, pas des engagements contractuels. Le déploiement réel
nécessiterait une phase de validation terrain, un cadre juridique, et des ressources humaines et
financières qui dépassent le cadre du baccalauréat.

---

## 10. Versions technologiques de référence (avril 2026)

Ce tableau sert de **référence unique** pour les versions utilisées dans tous les documents.

| Technologie    | Version  | Vérification             |
| -------------- | -------- | ------------------------ |
| Node.js        | 24.x LTS | `node --version`         |
| pnpm           | 10.x     | `pnpm --version`         |
| TypeScript     | 6.0+     | `npx tsc --version`      |
| Turborepo      | 2.9+     | `npx turbo --version`    |
| Next.js        | 16+      | `package.json`           |
| React          | 19.x     | `package.json`           |
| NestJS         | 11.1+    | `package.json`           |
| Prisma         | 7.6+     | `npx prisma --version`   |
| Python         | 3.14+    | `python --version`       |
| FastAPI        | 0.135+   | `pip show fastapi`       |
| PostgreSQL     | 18.x     | `psql --version`         |
| Redis          | 8.6+     | `redis-server --version` |
| Elasticsearch  | 9.3+     | via Docker               |
| RabbitMQ       | 4.2+     | via Docker               |
| Keycloak       | 26.5+    | via Docker               |
| Docker         | 27+      | `docker --version`       |
| Docker Compose | 2.30+    | `docker compose version` |
| Git            | 2.53+    | `git --version`          |

---

---

## 11. Gouvernance IA et maintenance continue

Pour assurer la continuité entre sessions d'assistants IA:

- `AGENTS.md` : règles transversales de travail et de synchronisation docs/code
- `CLAUDE.md` : bootstrap et commandes de vérification
- `.github/copilot-instructions.md` : règles Copilot alignées sur le repo
- `.cursor/rules/graphify.mdc` + `.cursor/rules/ai-governance.mdc` : garde-fous Cursor persistants

Validation minimale avant PR:

- `pnpm run validate:data`
- `pnpm run validate:schemas`
- `pnpm run docs:sync:check`

_Document 00 — Version 1.1 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
