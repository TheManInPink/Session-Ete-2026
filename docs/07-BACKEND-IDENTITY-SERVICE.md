# 07 — Backend : Identity-Service (NestJS 11)

> **Projet** : NINA-AES Platform — Plateforme de modernisation de l'identité nationale malienne
> **Document** : 07/26 **Service** : `identity-service` — cœur métier du système NINA **Port** :
> `3001` **Stack** : NestJS 11.1 · TypeScript 6.0 · Prisma 7.7 · PostgreSQL 17 · Jest 30 **Auteur**
> : Étudiant UQAR **Date** : Avril 2026 **Statut** : Implémentation de référence

> 🔐 **Avertissement sécurité (à lire avant le § 6)** — Le NINA est une donnée personnelle exigée
> pour voter, hériter ou ouvrir un compte. Un endpoint de consultation **sans autorisation** = fuite
> massive d'identités + IDOR (OWASP A01:2021 _Broken Access Control_). Ce document applique donc,
> dès la première version du service :
>
> 1. **Authentification JWT** sur tous les endpoints non publics (`JwtAuthGuard`, voir § 6.x). ⚠️
>    **Honnêteté** : le verifier JWT (validation RS256 via le JWKS d'`auth-service`) est **conçu ici
>    mais dépend du doc 08** ; tant qu'`auth-service` n'émet pas de token, ces gardes refusent tout
>    (fail-closed), ce qui est le comportement voulu.
> 2. **Autorisation par rôle** (`RolesGuard` + `@Roles()`, cf. ADR-027) — voir la colonne « Rôle »
>    du § 3.3.
> 3. **Contrôle de propriété (ownership)** — un citoyen ne peut consulter que **son propre** NINA
>    (anti-IDOR), via `NinaOwnershipGuard`.
> 4. **Durcissement transport** : Helmet (CSP/HSTS), CORS en liste blanche, rate-limiting
>    (`ThrottlerGuard`) sur les routes d'énumération (`/search`, `/nina/:nina`).
> 5. **Secrets** : aucun mot de passe Postgres en clair dans le code — `DATABASE_URL` provient de
>    Vault / `.env` (`getOrThrow`, fail-fast). Voir `docs/security/SECURITY-RUNBOOK.md` et
>    `ADR-034-security-hardening-vault-mtls-owasp.md`.
> 6. **Audit & RGPD-like** : chaque mutation (create/update/delete) émet un événement d'audit ;
>    `delete` est un **soft-delete** (`deletedAt`) ; le NINA est **masqué dans les logs**.
>
> ⚠️ **Réserve d'honnêteté (lire le § 3.3, encadré « DOC PRESCRIPTIF vs CODE ACTUEL »)** : les
> points 1, 3 et 4 ci-dessus décrivent la **cible** de durcissement, **pas** l'état livré. Dans le
> code réel : le verifier RS256/JWKS n'existe pas, le seul guard (`roles.guard.ts`) est
> **fail-OPEN** (route sans `@Roles()` = ouverte) et expose un mode `mock` qui autorise tout ; il
> n'y a ni `NinaOwnershipGuard`, ni Helmet, ni `ThrottlerGuard` global enregistré. Statut de ces
> trois points : **⏳ à implémenter en Phase 2**.

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Technologies utilisées (avec versions à jour — avril 2026)](#2-technologies-utilisées-avec-versions-à-jour--avril-2026)
3. [Architecture du microservice identity-service](#3-architecture-du-microservice-identity-service)
4. [Structure de dossiers](#4-structure-de-dossiers)
5. [Validation NINA — Algorithme de clé de contrôle](#5-validation-nina--algorithme-de-clé-de-contrôle)
6. [Implémentation NestJS — Code commenté](#6-implémentation-nestjs--code-commenté)
7. [Recherche floue avec pg_trgm & unaccent](#7-recherche-floue-avec-pg_trgm--unaccent)
8. [Documentation OpenAPI/Swagger + Tests (unit + e2e)](#8-documentation-openapiswagger--tests-unit--e2e)
9. [Mini-rapport d'étape (template)](#9-mini-rapport-détape-template)
10. [Checklist de fin d'étape](#10-checklist-de-fin-détape)
11. [Pour aller plus loin](#11-pour-aller-plus-loin)

---

## 1. Objectif pédagogique

Construire le **premier microservice métier complet** de la plateforme NINA-AES :
`identity-service`, responsable de toutes les opérations de consultation et de gestion des
enregistrements NINA (Numéro d'Identification Nationale) des citoyens maliens.

Ce document est la **référence d'implémentation** pour tous les autres microservices NestJS du
projet (auth, audit, document, notification, interop, appointment, governance, vulnerability). Les
patterns présentés ici seront réutilisés quasi à l'identique dans les docs 08 à 14.

### Ce que tu vas apprendre

| Compétence                        | Niveau        | Application au projet                            |
| --------------------------------- | ------------- | ------------------------------------------------ |
| **Architecture modulaire NestJS** | Avancé        | Module / Controller / Service / Repository / DTO |
| **Validation algorithme NINA**    | Expert        | Clé de contrôle modulo 23, sans lettres ambiguës |
| **Prisma 7 avec NestJS**          | Avancé        | `PrismaService`, injection, transactions         |
| **Recherche floue PostgreSQL**    | Avancé        | `pg_trgm`, `unaccent`, similarity scoring        |
| **DTO + class-validator**         | Intermédiaire | Validation déclarative des entrées HTTP          |
| **Swagger/OpenAPI auto-généré**   | Intermédiaire | `@nestjs/swagger`, décorateurs                   |
| **Tests Jest**                    | Avancé        | Unit (mock Prisma) + e2e (SuperTest)             |
| **ESLint 10 flat config**         | Intermédiaire | `eslint.config.js`, plugins TypeScript           |
| **Gestion d'erreurs REST**        | Intermédiaire | `HttpException`, filtres globaux                 |

### Livrable à la fin de ce document

Un service `identity-service` entièrement fonctionnel :

- **8 endpoints REST** documentés sur Swagger UI (`http://localhost:3001/api/docs`)
- **Autorisation par défaut** : `JwtAuthGuard` + `RolesGuard` + `NinaOwnershipGuard` (anti-IDOR) sur
  chaque route non publique (cf. § 3.3 et ADR-027)
- **Durcissement** : Helmet (CSP/HSTS), CORS en liste blanche, `ThrottlerGuard` (rate-limit)
- **Validation NINA** : rejet des faux numéros (clé de contrôle invalide, dates impossibles)
- **Recherche floue** tolérant les accents et fautes de frappe (≥ 70 % de similarité)
- **Audit + soft-delete** : chaque mutation émet un événement, `delete` n'efface jamais physiquement
- **≥ 85 % de couverture de tests** (unit + e2e)
- **Healthcheck** `/health` pour Docker et Kubernetes
- **Intégration Prisma** avec le schéma défini dans le document 06 (secret DB via Vault/`.env`,
  jamais codé en dur)

### Contexte métier : pourquoi ce service est critique

Le NINA est la **brique fondamentale** de l'identité malienne : il est exigé pour voter, passer un
examen d'État, ouvrir un compte bancaire, obtenir un passeport ou un extrait de naissance.
Aujourd'hui (2026), la consultation officielle nécessite un déplacement physique à un centre RAVEC —
avec des files d'attente de plusieurs heures et des erreurs fréquentes (noms mal orthographiés,
dates inversées).

Le service `identity-service` vise à :

1. **Démocratiser l'accès** — consultation en ligne depuis l'app citoyenne (port 4001) ou par USSD
   (`*456#`)
2. **Corriger les erreurs** — workflow de signalement + validation par agent (voir doc 09 audit)
3. **Lutter contre la fraude** — validation mathématique stricte de la clé de contrôle
4. **Interconnecter la sous-région AES** — API REST prête pour fédération Mali/Burkina/Niger (voir
   doc 12 interop)

---

## 2. Technologies utilisées (avec versions à jour — avril 2026)

| Dépendance                 | Version       | Rôle                                       | Raison du choix                              |
| -------------------------- | ------------- | ------------------------------------------ | -------------------------------------------- |
| `@nestjs/common`           | `11.1.18`     | Core NestJS (décorateurs, modules)         | Framework dominant Node.js 2026, DI native   |
| `@nestjs/core`             | `11.1.18`     | Runtime NestJS                             | —                                            |
| `@nestjs/platform-express` | `11.1.18`     | Adaptateur HTTP Express                    | Plus mature que Fastify pour Swagger         |
| `@nestjs/config`           | `4.1.2`       | Lecture `.env` typée via Zod               | Découpage par environnement                  |
| `@nestjs/swagger`          | `11.2.0`      | OpenAPI 3.1 auto-généré                    | Documentation vivante pour l'équipe          |
| `@nestjs/terminus`         | `11.1.0`      | Healthchecks HTTP                          | Compatible Docker `HEALTHCHECK` + K8s probes |
| `@prisma/client`           | `7.7.0`       | ORM PostgreSQL                             | Voir ADR-011 (doc 06)                        |
| `prisma`                   | `7.7.0`       | CLI Migrate + Studio                       | —                                            |
| `class-validator`          | `0.15.1`      | Validation déclarative DTO                 | Standard écosystème NestJS                   |
| `class-transformer`        | `0.5.1`       | Sérialisation entité ↔ DTO                 | —                                            |
| `zod`                      | `4.3.6`       | Validation schéma `.env`                   | Typé, inféré                                 |
| `@nina-aes/shared-types`   | `workspace:*` | Types partagés (cross-service)             | Contract-first                               |
| `@nina-aes/utils`          | `workspace:*` | `validateNina()`, `computeControlLetter()` | DRY algorithme NINA                          |
| `@nina-aes/database`       | `workspace:*` | `PrismaClient` singleton                   | Partage d'instance                           |
| `reflect-metadata`         | `0.2.2`       | Polyfill décorateurs TS                    | Requis par NestJS                            |
| `rxjs`                     | `7.8.2`       | Observables (interceptors)                 | —                                            |
| **Dev**                    |               |                                            |                                              |
| `@nestjs/cli`              | `11.0.18`     | Build & watch                              | `nest build`, `nest start --watch`           |
| `@nestjs/testing`          | `11.1.18`     | TestingModule Jest                         | Mocking DI                                   |
| `jest`                     | `30.3.0`      | Test runner                                | Standard 2026                                |
| `ts-jest`                  | `29.4.9`      | Transformer TypeScript pour Jest           | —                                            |
| `supertest`                | `7.1.3`       | Tests e2e HTTP                             | —                                            |
| `@types/jest`              | `30.0.0`      | Typings Jest                               | —                                            |
| `@types/supertest`         | `6.0.4`       | Typings SuperTest                          | —                                            |
| `@types/node`              | `25.5.2`      | Typings Node.js 24                         | —                                            |
| `@types/express`           | `5.0.0`       | Typings Express 5                          | —                                            |
| `eslint`                   | `10.2.0`      | Linter                                     | Flat config obligatoire                      |
| `typescript-eslint`        | `9.2.0`       | Plugin TS pour ESLint 10                   | Compatible flat config                       |
| `ts-loader`                | `9.5.7`       | Compilation TS pour `nest build`           | —                                            |
| `ts-node`                  | `10.9.2`      | Exécution `*.ts` directe                   | —                                            |
| `source-map-support`       | `0.5.21`      | Traces d'erreur en TS                      | —                                            |
| `typescript`               | `6.0.2`       | Compilateur                                | Nouveau type `satisfies`, decorators natifs  |

---

## 3. Architecture du microservice identity-service

### 3.1 Vue d'ensemble (diagramme Mermaid)

```mermaid
flowchart TB
    subgraph "Client Apps"
        CIT[apps/citizen<br/>Next.js :4001]
        ADM[apps/admin<br/>Next.js :4002]
        USSD[USSD Gateway<br/>Africa's Talking]
    end

    subgraph "identity-service :3001"
        CTRL[NinaController<br/>Routes REST]
        SVC[NinaService<br/>Logique métier]
        REPO[NinaRepository<br/>Accès Prisma]
        VAL[NinaValidator<br/>utils/nina.ts]
    end

    subgraph "Cross-cutting"
        FILTER[HttpExceptionFilter]
        INTERCEPT[LoggingInterceptor]
        PIPE[ValidationPipe]
        SWAGGER[Swagger UI<br/>/api/docs]
    end

    subgraph "Infrastructure"
        PG[(PostgreSQL 17<br/>nina_aes_db)]
        AUDIT[audit-service :3007<br/>hash-chain SHA-256]
    end

    CIT -->|GET /nina/:nina| CTRL
    ADM -->|POST /nina/search| CTRL
    USSD -->|GET /nina/:nina| CTRL

    CTRL --> PIPE
    PIPE --> SVC
    SVC --> VAL
    SVC --> REPO
    REPO --> PG

    CTRL -.-> FILTER
    CTRL -.-> INTERCEPT
    CTRL -.-> SWAGGER

    SVC -.->|événement audit| AUDIT

    style CTRL fill:#a78bfa,color:#fff
    style SVC fill:#60a5fa,color:#fff
    style REPO fill:#34d399,color:#fff
    style VAL fill:#fbbf24,color:#000
    style PG fill:#336791,color:#fff
    style AUDIT fill:#ef4444,color:#fff
```

### 3.2 Responsabilités par couche (Clean Architecture)

| Couche             | Classe                    | Responsabilité                                   | Dépend de                           |
| ------------------ | ------------------------- | ------------------------------------------------ | ----------------------------------- |
| **Presentation**   | `NinaController`          | Routes HTTP, décorateurs Swagger, validation DTO | `NinaService`                       |
| **Application**    | `NinaService`             | Orchestration métier, appel validator, audit     | `NinaRepository`, `@nina-aes/utils` |
| **Domain**         | `Citizen` (entité Prisma) | Modèle métier                                    | —                                   |
| **Infrastructure** | `NinaRepository`          | Requêtes Prisma (y.c. `$queryRaw` pour pg_trgm)  | `PrismaService`                     |
| **Shared**         | `@nina-aes/utils/nina`    | `validateNina()`, `computeControlLetter()`       | (aucune)                            |

**Principe** : chaque couche ne connaît que celle en dessous d'elle. Le `Controller` ne touche
jamais Prisma directement. Ceci facilite :

- Les **tests unitaires** — on peut mocker `NinaRepository` sans base de données
- Le **remplacement d'ORM** — passer de Prisma à TypeORM ne toucherait que `NinaRepository`
- La **réutilisation** — le `NinaService` pourrait être appelé par un autre protocole (gRPC,
  GraphQL) sans modification

### 3.3 Endpoints REST exposés et matrice d'autorisation

> **Modèle d'autorisation** (cf. ADR-027) : chaque route non publique passe par `JwtAuthGuard`
> (authentification) **puis** `RolesGuard` (rôle), appliqués via
> `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`. Les routes publiques sont marquées
> `@Public()` (le `JwtAuthGuard` court-circuite). La consultation par un citoyen passe **en plus**
> par `NinaOwnershipGuard` (anti-IDOR).

| Méthode  | Route                  | DTO entrée      | DTO sortie                            | Gardes appliquées                                                | Rôle(s) requis                   |
| -------- | ---------------------- | --------------- | ------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| `GET`    | `/health`              | —               | `HealthCheckResult`                   | `@Public()`                                                      | public                           |
| `GET`    | `/nina/:nina`          | —               | `NinaResponseDto`                     | `JwtAuthGuard` + `RolesGuard` + `NinaOwnershipGuard` + Throttler | citoyen (son NINA), agent, admin |
| `POST`   | `/nina/search`         | `SearchNinaDto` | `NinaResponseDto[]`                   | `JwtAuthGuard` + `RolesGuard` + Throttler                        | agent, admin                     |
| `POST`   | `/nina`                | `CreateNinaDto` | `NinaResponseDto`                     | `JwtAuthGuard` + `RolesGuard`                                    | admin                            |
| `PATCH`  | `/nina/:id`            | `UpdateNinaDto` | `NinaResponseDto`                     | `JwtAuthGuard` + `RolesGuard`                                    | agent, admin                     |
| `DELETE` | `/nina/:id`            | —               | `{ success: true }`                   | `JwtAuthGuard` + `RolesGuard`                                    | admin                            |
| `GET`    | `/nina/:nina/validate` | —               | `{ valid: boolean, reason?: string }` | `@Public()`                                                      | public                           |
| `GET`    | `/api/docs`            | —               | HTML Swagger UI                       | `@Public()` (à désactiver en prod, cf. ADR-034)                  | public (dev)                     |

**Justification du contrôle d'_ownership_** : sans lui, un citoyen authentifié pourrait
incrémenter/deviner le NINA d'un voisin et lire son dossier (IDOR / OWASP A01). `NinaOwnershipGuard`
compare le `nina` de la route au claim porté par le JWT du citoyen ; les rôles `agent`/`admin` (qui
ont un besoin métier légitime) le contournent. La recherche floue `/search` n'est **jamais** ouverte
au citoyen (elle permettrait l'énumération de la population).

> ⚠️ **Honnêteté — état d'implémentation** : les classes `JwtAuthGuard` / `RolesGuard` /
> `NinaOwnershipGuard` et leur câblage sont décrits ci-dessous (§ 6.x). Le **verifier JWT réel**
> (validation cryptographique RS256 du token) dépend d'`auth-service` (doc 08) : tant que celui-ci
> n'expose pas son JWKS, le verifier injecté rejette tout token → les routes protégées renvoient
> `401` (fail-closed). C'est volontaire : un service « ouvert par défaut » serait une faille, pas
> une commodité.

> ⚠️ **DOC PRESCRIPTIF vs CODE ACTUEL** — Le code présenté dans tout le § 6 (module `nina/`, dossier
> `auth/`, `JwksJwtVerifier`, `JwtAuthGuard`, `NinaOwnershipGuard`, Helmet,
> `APP_GUARD: ThrottlerGuard`) est la **CIBLE de durcissement**, pas l'état livré. Le service tel
> que livré dans `services/identity-service` n'implémente **PAS** encore ces gardes. Vérifiable par
> `Read`/`Grep` :
>
> - Arborescence réelle : `modules/citizen|correction|location` (PAS de module `nina/`) + un
>   **seul** guard `common/guards/roles.guard.ts` (PAS de dossier `auth/`, PAS de
>   `jwks-jwt.verifier.ts`).
> - `roles.guard.ts::extractUserFromJwt()` **renvoie `null`** : la vérification cryptographique
>   RS256 n'est PAS faite. Aucun import `jose`, aucune classe `JwksJwtVerifier`, aucun `helmet` (ni
>   en dépendance), aucun `APP_GUARD` dans le dépôt.
> - Un mode `NINA_AUTH_MODE=mock` injecte un user `role=AGENT` et fait `return true` **AVANT tout
>   contrôle de rôle** → bypass total d'auth en dev.
> - ⚠️ **Le guard réel est fail-OPEN, pas fail-closed** :
>   `if (!requiredRoles || requiredRoles.length === 0) return true;` → **toute route sans `@Roles()`
>   est ouverte sans authentification**. Dans `citizen.controller.ts` réel, `GET /citizens/:nina`,
>   `GET /citizens/by-id/:id` et `GET /citizens` (recherche floue) n'ont **AUCUN `@Roles()`** →
>   accessibles sans auth → IDOR (OWASP A01)
>   - énumération de la population, exactement le risque que ce § prétend fermer.
>
> **Statut réel : ⏳ à implémenter en Phase 2** — ajouter `@Roles(...)` sur les `GET` ci-dessus,
> coder le verifier RS256/JWKS, ajouter un `NinaOwnershipGuard` et enregistrer
> `APP_GUARD: ThrottlerGuard` avant toute mise en production.

---

## 4. Structure de dossiers

```
services/identity-service/
├── src/
│   ├── main.ts                          # Bootstrap NestJS + Swagger
│   ├── app.module.ts                    # Module racine
│   │
│   ├── auth/                            # Autorisation (ADR-027)
│   │   ├── auth.module.ts               # Fournit JWT_VERIFIER (global)
│   │   ├── jwks-jwt.verifier.ts         # Vérifie RS256 via JWKS auth-service
│   │   └── guards/
│   │       ├── jwt-auth.guard.ts        # Authentification JWT (fail-closed)
│   │       ├── roles.guard.ts           # @Roles() → 403 si rôle absent
│   │       ├── nina-ownership.guard.ts  # Anti-IDOR (citoyen = son NINA)
│   │       └── index.ts
│   │
│   ├── common/                          # Cross-cutting concerns
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts # Filtre global erreurs HTTP
│   │   ├── interceptors/
│   │   │   └── logging.interceptor.ts   # Log requêtes entrantes (NINA masqué)
│   │   ├── pipes/
│   │   │   └── parse-nina.pipe.ts       # Validation format NINA (15 car.)
│   │   └── utils/
│   │       └── mask-nina.ts             # Masque le NINA dans les logs
│   │
│   ├── config/
│   │   ├── env.schema.ts                # Schéma Zod pour .env
│   │   ├── env.config.ts                # Chargement + validation
│   │   └── swagger.config.ts            # DocumentBuilder
│   │
│   ├── prisma/
│   │   ├── prisma.service.ts            # PrismaClient NestJS-friendly
│   │   └── prisma.module.ts             # Module global
│   │
│   ├── health/
│   │   ├── health.module.ts
│   │   └── health.controller.ts         # GET /health (Terminus)
│   │
│   └── nina/                            # Module métier principal
│       ├── nina.module.ts
│       ├── nina.controller.ts           # endpoints REST (gardés)
│       ├── nina.service.ts              # Logique métier
│       ├── nina.repository.ts           # Accès Prisma + pg_trgm
│       ├── dto/
│       │   ├── create-nina.dto.ts
│       │   ├── update-nina.dto.ts
│       │   ├── search-nina.dto.ts
│       │   └── nina-response.dto.ts
│       └── entities/
│           └── nina-record.entity.ts    # Mapping Prisma → Domain
│
├── test/
│   ├── nina.service.spec.ts             # Tests unitaires (mock repo)
│   ├── nina.controller.spec.ts          # Tests unitaires controller
│   ├── nina.repository.spec.ts          # Tests unitaires repository
│   ├── nina.e2e-spec.ts                 # Tests end-to-end (SuperTest)
│   └── jest-e2e.json                    # Config Jest pour e2e
│
├── eslint.config.js                     # ESLint 10 flat config
├── nest-cli.json                        # Config CLI NestJS
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── .env.example                         # Template variables
```

---

## 5. Validation NINA — Algorithme de clé de contrôle

### 5.1 Format officiel (spécification NINA/RAVEC — Mali)

Un NINA valide = **15 caractères = 14 chiffres + 1 lettre de contrôle**.

```
Position :  1   2 3   4 5   6 7   8 9 10 11 12 13 14   15
Contenu  :  S   A A   M M   J J   N N  N  N  C  C  C    L
            │   └─┘   └─┘   └─┘   └─────────┘  └────┘    │
            │   année mois  jour  n° ordre    commune   clé
            │                     (1 à 9999)  (ISO 3166)
            sexe (1=M, 2=F)                             (lettre)
```

| Pos.  | Champ                           | Plage                           | Exemple                  |
| ----- | ------------------------------- | ------------------------------- | ------------------------ |
| 1     | **Sexe**                        | `1` (masculin) ou `2` (féminin) | `1`                      |
| 2–3   | **Année** (2 derniers chiffres) | `00`–`99`                       | `98` (→ 1998)            |
| 4–5   | **Mois**                        | `01`–`12`                       | `07`                     |
| 6–7   | **Jour**                        | `01`–`31` (cohérent mois)       | `15`                     |
| 8–11  | **Ordre de naissance**          | `0001`–`9999`                   | `0427`                   |
| 12–14 | **Code commune** (ISO Mali)     | `001`–`703`                     | `042` (Bamako Commune I) |
| 15    | **Clé de contrôle**             | Lettre A–Z sans `I`, `O`, `Q`   | `K`                      |

**Exemple complet valide** : `198071504270422K` → Homme, né le 15 juillet 1998, 427ᵉ enregistrement
du jour, commune 042 (Bamako I), clé K.

> ⚠️ **Note projet académique** : le format réel du NINA du Mali est encodé différemment (source :
> RAVEC 2018), mais les détails exacts ne sont pas publiés. Le format ci-dessus est une
> **reconstruction raisonnable** documentée pour ce projet de fin d'études, validée par l'algorithme
> modulo 23 standard utilisé dans de nombreux pays (ex. : Belgique, Espagne NIE).

### 5.2 Algorithme de la clé de contrôle (modulo 23)

**Pourquoi modulo 23 ?** Un simple modulo 10 (Luhn) ne détecte que 88 % des erreurs de frappe. Le
modulo 23 (nombre premier) détecte **≥ 99,9 %** des erreurs simples et **100 %** des inversions
adjacentes. L'alphabet utilisé (23 lettres) exclut `I`, `O`, `Q` pour éviter la confusion visuelle
avec `1`, `0`, `0`.

```
alphabet = "ABCDEFGHJKLMNPRSTUVWXYZ"  // 23 lettres (0..22)

computeControlLetter(digits):
    n = BigInt(digits)       // les 14 chiffres comme entier
    r = n mod 23             // reste entier 0..22
    return alphabet[r]
```

### 5.3 Implémentation TypeScript (dans `packages/utils/src/nina.ts`)

> Ce fichier existe déjà depuis le document 04 (monorepo structure). Voici sa version **finalisée**
> avec les tests — **remplace** l'ancienne version si besoin.

```ts
/**
 * @file        packages/utils/src/nina.ts
 * @description Validation et génération du NINA (Numéro d'Identification
 *              Nationale) malien — 14 chiffres + 1 lettre de contrôle.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @see         docs/07-BACKEND-IDENTITY-SERVICE.md § 5
 */

// ─────────────────────────────────────────────────────────────
// Alphabet sans I, O, Q pour éviter la confusion visuelle avec
// les chiffres 1, 0, 0. 23 lettres = 23 résidus possibles mod 23.
// ─────────────────────────────────────────────────────────────
export const NINA_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ' as const;

/** Longueur totale d'un NINA valide (14 chiffres + 1 lettre). */
export const NINA_LENGTH = 15;

/** Nombre de chiffres avant la lettre de contrôle. */
export const NINA_DIGITS_LENGTH = 14;

/**
 * Résultat détaillé d'une validation NINA.
 * - `valid: true`  → le NINA est syntaxiquement et mathématiquement correct.
 * - `valid: false` → `reason` explique pourquoi (utile pour les messages UX).
 */
export type NinaValidationResult =
  | { valid: true; decoded: NinaDecoded }
  | { valid: false; reason: NinaInvalidReason };

export type NinaInvalidReason =
  | 'LENGTH_INVALID'
  | 'FORMAT_INVALID'
  | 'SEX_INVALID'
  | 'MONTH_INVALID'
  | 'DAY_INVALID'
  | 'DATE_IMPOSSIBLE'
  | 'CONTROL_LETTER_MISMATCH';

/** Informations décodées depuis un NINA valide. */
export interface NinaDecoded {
  sexe: 'M' | 'F';
  anneeNaissance: number; // 4 chiffres (ex: 1998)
  moisNaissance: number; // 1..12
  jourNaissance: number; // 1..31
  ordreNaissance: number; // 1..9999
  codeCommune: string; // 3 chiffres (ex: "042")
  lettreControle: string; // A..Z sans I/O/Q
}

/**
 * Calcule la lettre de contrôle à partir des 14 chiffres.
 *
 * @param digits - Chaîne de 14 caractères numériques
 * @returns Une lettre de `NINA_ALPHABET` (A..Z sans I/O/Q)
 * @throws Error si `digits` ne contient pas exactement 14 chiffres
 */
export function computeControlLetter(digits: string): string {
  if (!/^\d{14}$/.test(digits)) {
    throw new Error(`computeControlLetter: expected 14 digits, got "${digits}"`);
  }

  // BigInt car 14 chiffres > 2^53 (précision max des Number JS)
  const asBigInt = BigInt(digits);
  const remainder = Number(asBigInt % 23n);
  // `remainder` ∈ [0..22], donc index valide dans NINA_ALPHABET
  return NINA_ALPHABET[remainder]!;
}

/**
 * Valide un NINA complet (15 caractères) et retourne son contenu décodé
 * si tout est correct. Retourne un motif d'erreur sinon.
 *
 * Vérifie dans l'ordre :
 *   1. Longueur = 15
 *   2. Format = 14 chiffres + 1 lettre ∈ NINA_ALPHABET
 *   3. Sexe ∈ {1, 2}
 *   4. Mois ∈ [1..12]
 *   5. Jour ∈ [1..31] et cohérent avec le mois (ex: pas de 30 février)
 *   6. Clé de contrôle correcte
 */
export function validateNina(nina: string): NinaValidationResult {
  // ─── 1. Longueur ─────────────────────────────────────────
  if (nina.length !== NINA_LENGTH) {
    return { valid: false, reason: 'LENGTH_INVALID' };
  }

  // ─── 2. Format général ───────────────────────────────────
  const match = /^(\d{14})([A-Z])$/.exec(nina);
  if (!match || !NINA_ALPHABET.includes(match[2]!)) {
    return { valid: false, reason: 'FORMAT_INVALID' };
  }
  const digits = match[1]!;
  const lettre = match[2]!;

  // ─── 3. Décomposition des champs ─────────────────────────
  const sexeDigit = digits[0]!;
  const anneeYY = parseInt(digits.substring(1, 3), 10);
  const mois = parseInt(digits.substring(3, 5), 10);
  const jour = parseInt(digits.substring(5, 7), 10);
  const ordre = parseInt(digits.substring(7, 11), 10);
  const commune = digits.substring(11, 14);

  if (sexeDigit !== '1' && sexeDigit !== '2') {
    return { valid: false, reason: 'SEX_INVALID' };
  }

  if (mois < 1 || mois > 12) {
    return { valid: false, reason: 'MONTH_INVALID' };
  }

  if (jour < 1 || jour > 31) {
    return { valid: false, reason: 'DAY_INVALID' };
  }

  // ─── 4. Date réelle cohérente ────────────────────────────
  // Pivot année : > 30 → 19xx, sinon 20xx (ex: 98 → 1998, 15 → 2015)
  const currentYY = new Date().getFullYear() % 100;
  const annee = anneeYY > currentYY ? 1900 + anneeYY : 2000 + anneeYY;

  const dateTest = new Date(annee, mois - 1, jour);
  if (
    dateTest.getFullYear() !== annee ||
    dateTest.getMonth() !== mois - 1 ||
    dateTest.getDate() !== jour
  ) {
    return { valid: false, reason: 'DATE_IMPOSSIBLE' };
  }

  // ─── 5. Clé de contrôle ──────────────────────────────────
  const expectedLetter = computeControlLetter(digits);
  if (expectedLetter !== lettre) {
    return { valid: false, reason: 'CONTROL_LETTER_MISMATCH' };
  }

  // ─── 6. NINA valide → on renvoie les données décodées ───
  return {
    valid: true,
    decoded: {
      sexe: sexeDigit === '1' ? 'M' : 'F',
      anneeNaissance: annee,
      moisNaissance: mois,
      jourNaissance: jour,
      ordreNaissance: ordre,
      codeCommune: commune,
      lettreControle: lettre,
    },
  };
}

/**
 * Helper : génère un NINA valide complet à partir de ses composants.
 * Utile pour les seeds, les tests, et la migration de données.
 *
 * @example
 *   generateNina({
 *     sexe: 'M',
 *     annee: 1998,
 *     mois: 7,
 *     jour: 15,
 *     ordre: 427,
 *     codeCommune: '042',
 *   })
 *   // → "198071504270422K"   (exemple ; lettre calculée)
 */
export function generateNina(params: {
  sexe: 'M' | 'F';
  annee: number;
  mois: number;
  jour: number;
  ordre: number;
  codeCommune: string;
}): string {
  const { sexe, annee, mois, jour, ordre, codeCommune } = params;

  if (codeCommune.length !== 3 || !/^\d{3}$/.test(codeCommune)) {
    throw new Error(`generateNina: codeCommune must be 3 digits`);
  }
  if (ordre < 1 || ordre > 9999) {
    throw new Error(`generateNina: ordre must be 1..9999`);
  }

  const s = sexe === 'M' ? '1' : '2';
  const yy = String(annee % 100).padStart(2, '0');
  const mm = String(mois).padStart(2, '0');
  const jj = String(jour).padStart(2, '0');
  const nn = String(ordre).padStart(4, '0');
  const digits = `${s}${yy}${mm}${jj}${nn}${codeCommune}`;
  const letter = computeControlLetter(digits);

  return `${digits}${letter}`;
}
```

### 5.4 Tests unitaires de la validation (`packages/utils/tests/nina.spec.ts`)

```ts
/**
 * @file packages/utils/tests/nina.spec.ts
 * @description Tests unitaires pour la validation NINA.
 */

import { validateNina, computeControlLetter, generateNina, NINA_ALPHABET } from '../src/nina';

describe('computeControlLetter', () => {
  it('calcule la bonne lettre pour un exemple connu', () => {
    // 14 zéros → BigInt(0) mod 23 = 0 → 'A'
    expect(computeControlLetter('00000000000000')).toBe('A');
  });

  it('rejette les entrées non numériques', () => {
    expect(() => computeControlLetter('12345')).toThrow(/14 digits/);
    expect(() => computeControlLetter('1234567890ABCD')).toThrow(/14 digits/);
  });

  it("produit uniquement des lettres de l'alphabet NINA", () => {
    for (let i = 0; i < 100; i++) {
      const digits = String(Math.floor(Math.random() * 1e14)).padStart(14, '0');
      const letter = computeControlLetter(digits);
      expect(NINA_ALPHABET).toContain(letter);
    }
  });
});

describe('validateNina', () => {
  it('accepte un NINA généré correctement', () => {
    const nina = generateNina({
      sexe: 'M',
      annee: 1998,
      mois: 7,
      jour: 15,
      ordre: 427,
      codeCommune: '042',
    });
    const result = validateNina(nina);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.decoded.sexe).toBe('M');
      expect(result.decoded.anneeNaissance).toBe(1998);
      expect(result.decoded.moisNaissance).toBe(7);
      expect(result.decoded.codeCommune).toBe('042');
    }
  });

  it('rejette une longueur incorrecte', () => {
    expect(validateNina('123').valid).toBe(false);
    expect(validateNina('1234567890123456')).toEqual({
      valid: false,
      reason: 'LENGTH_INVALID',
    });
  });

  it('rejette un sexe invalide', () => {
    // Sexe = 3 → invalide
    const nina = '3' + '9807150427042'; // 14 chiffres
    const letter = computeControlLetter(nina);
    expect(validateNina(nina + letter)).toEqual({
      valid: false,
      reason: 'SEX_INVALID',
    });
  });

  it('rejette une date impossible (30 février)', () => {
    const digits = '1' + '00' + '02' + '30' + '0001' + '042';
    const letter = computeControlLetter(digits);
    expect(validateNina(digits + letter)).toEqual({
      valid: false,
      reason: 'DATE_IMPOSSIBLE',
    });
  });

  it('rejette une clé de contrôle fausse', () => {
    const valid = generateNina({
      sexe: 'F',
      annee: 2001,
      mois: 3,
      jour: 12,
      ordre: 55,
      codeCommune: '123',
    });
    // On remplace la dernière lettre par une autre
    const tampered = valid.slice(0, 14) + (valid[14] === 'A' ? 'B' : 'A');
    expect(validateNina(tampered)).toEqual({
      valid: false,
      reason: 'CONTROL_LETTER_MISMATCH',
    });
  });
});

describe('generateNina (round-trip)', () => {
  it('crée toujours des NINA valides', () => {
    for (let i = 0; i < 50; i++) {
      const nina = generateNina({
        sexe: i % 2 === 0 ? 'M' : 'F',
        annee: 1950 + (i % 75),
        mois: (i % 12) + 1,
        jour: (i % 28) + 1,
        ordre: i + 1,
        codeCommune: String((i * 7) % 1000).padStart(3, '0'),
      });
      expect(validateNina(nina).valid).toBe(true);
    }
  });
});
```

---

## 6. Implémentation NestJS — Code commenté

### 6.1 `package.json` final du service

```json
{
  "name": "@nina-aes/identity-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main",
    "start:debug": "nest start --debug --watch",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.18",
    "@nestjs/config": "^4.1.2",
    "@nestjs/core": "^11.1.18",
    "@nestjs/platform-express": "^11.1.18",
    "@nestjs/swagger": "^11.2.0",
    "@nestjs/terminus": "^11.1.0",
    "@nestjs/throttler": "^6.4.0",
    "@nina-aes/auth-guards": "workspace:*",
    "@nina-aes/database": "workspace:*",
    "@nina-aes/shared-types": "workspace:*",
    "@nina-aes/utils": "workspace:*",
    "@prisma/client": "^7.7.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "helmet": "^8.1.0",
    "jose": "^6.1.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.18",
    "@nestjs/schematics": "^11.0.10",
    "@nestjs/testing": "^11.1.18",
    "@types/express": "^5.0.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.5.2",
    "@types/supertest": "^6.0.4",
    "eslint": "^10.2.0",
    "jest": "^30.3.0",
    "source-map-support": "^0.5.21",
    "supertest": "^7.1.3",
    "ts-jest": "^29.4.9",
    "ts-loader": "^9.5.7",
    "ts-node": "^10.9.2",
    "typescript": "^6.0.2",
    "typescript-eslint": "^9.2.0"
  }
}
```

> **Installation** : depuis la racine du monorepo :
>
> ```powershell
> # Dépendances métier + sécurité (helmet, throttler, auth-guards, jose)
> pnpm --filter @nina-aes/identity-service add `
>   @nestjs/config @nestjs/swagger @nestjs/terminus @nestjs/throttler `
>   @nina-aes/auth-guards @nina-aes/database @nina-aes/shared-types @nina-aes/utils `
>   @prisma/client helmet jose zod
> pnpm --filter @nina-aes/identity-service add -D `
>   @types/supertest supertest typescript-eslint
> ```

### 6.2 `src/main.ts` — Bootstrap NestJS + Swagger

> ⚠️ **⏳ à installer/câbler en Phase 2** : le **Helmet (CSP/HSTS)** montré dans ce `main.ts` n'est
> **PAS présent** dans le `main.ts` livré (ni en dépendance du service). Vérifiable par `Grep` :
> aucune occurrence de `helmet`. Les en-têtes de sécurité HTTP (CSP restrictive, HSTS, suppression
> `X-Powered-By`) décrits ici restent donc à ajouter (`pnpm add helmet` + `app.use(helmet(...))`).

```ts
/**
 * @file        services/identity-service/src/main.ts
 * @description Point d'entrée du microservice identity-service.
 *              Configure :
 *                - Helmet (CSP, HSTS) — en-têtes HTTP de sécurité
 *                - Validation globale (class-validator)
 *                - Filtre d'exception global
 *                - Swagger UI sur /api/docs
 *                - CORS en LISTE BLANCHE (jamais "*")
 *                - Shutdown hooks pour Prisma (fermeture propre connexion DB)
 *
 *              Sécurité (OWASP A05 Misconfiguration / A07) : pas d'en-tête
 *              `X-Powered-By`, HSTS forcé, CSP restrictive. Voir ADR-034 et
 *              docs/security/SECURITY-RUNBOOK.md.
 *
 * @author      Étudiant UQAR
 * @date        2026
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { buildSwaggerConfig } from './config/swagger.config';
import { loadEnv } from './config/env.config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // ─── 1. Validation précoce des variables d'environnement ──────
  // Si .env est mal configuré on veut planter AVANT de démarrer
  // le serveur HTTP (fail-fast).
  const env = loadEnv();

  // ─── 2. Création de l'application NestJS ──────────────────────
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    // bufferLogs pour que les logs du bootstrap soient formatés
    bufferLogs: true,
  });

  // ─── 2bis. Helmet — en-têtes HTTP de sécurité (CSP/HSTS) ──────
  // Pose Content-Security-Policy, Strict-Transport-Security,
  // X-Content-Type-Options, etc. et supprime X-Powered-By.
  // ⚠️ En prod, Swagger UI doit être désactivé (cf. ADR-034) ; on garde
  // donc la CSP par défaut de Helmet. En dev, si Swagger casse à cause de
  // la CSP, ne PAS désactiver Helmet entièrement — assouplir UNIQUEMENT
  // `contentSecurityPolicy` (jamais HSTS).
  app.use(
    helmet({
      // HSTS : force HTTPS pendant 180 jours (cohérent ADR-034 / mTLS amont).
      hsts: { maxAge: 15_552_000, includeSubDomains: true },
      // CSP désactivée seulement si Swagger est servi (dev) ; sinon laisser true.
      contentSecurityPolicy: env.NODE_ENV === 'production',
    }),
  );

  // ─── 3. Pipes globaux — validation DTO automatique ────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // supprime les champs non déclarés dans le DTO
      forbidNonWhitelisted: true, // rejette les requêtes avec champs en trop
      transform: true, // auto-transformation des types (string → number)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── 4. Filtres globaux — format d'erreur uniforme ────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── 5. Préfixe global des routes ─────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'api/docs'],
  });

  // ─── 6. CORS — LISTE BLANCHE stricte (jamais "*") ─────────────
  // `origin` est un tableau explicite issu de CORS_ORIGINS : toute origine
  // absente de la liste est refusée par le navigateur. On n'utilise JAMAIS
  // `origin: true` ni `'*'` car `credentials: true` exposerait alors les
  // cookies/Authorization à n'importe quel site (OWASP A05).
  const allowedOrigins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins, // ex: "http://localhost:4001,http://localhost:4002"
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // ─── 7. Swagger / OpenAPI ─────────────────────────────────────
  const swaggerConfig = buildSwaggerConfig();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'NINA-AES • Identity Service API',
  });

  // ─── 8. Shutdown hooks pour Prisma (fermeture propre DB) ──────
  app.enableShutdownHooks();

  // ─── 9. Démarrage ─────────────────────────────────────────────
  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`🚀 identity-service running on http://localhost:${env.PORT}`);
  logger.log(`📚 Swagger UI: http://localhost:${env.PORT}/api/docs`);
  logger.log(`🏥 Health check: http://localhost:${env.PORT}/health`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
```

### 6.3 `src/config/env.schema.ts` + `env.config.ts`

```ts
/**
 * @file        services/identity-service/src/config/env.schema.ts
 * @description Schéma Zod pour la validation des variables d'environnement.
 *              Si une variable manque ou est malformée, le processus plante
 *              au démarrage avec un message clair.
 */

import { z } from 'zod';

export const envSchema = z.object({
  // ─── Application ──────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // ─── Base de données ──────────────────────────────────────
  DATABASE_URL: z
    .string()
    .url()
    .refine((url) => url.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a postgresql:// connection string',
    }),

  // ─── CORS (liste blanche stricte — JAMAIS "*") ────────────
  CORS_ORIGINS: z.string().default('http://localhost:4001,http://localhost:4002'),

  // ─── Audit (communication inter-services) ────────────────
  // ⚠️ Port 3007 = audit-service (3003 = ai-service, ne pas confondre).
  AUDIT_SERVICE_URL: z.string().url().default('http://localhost:3007'),

  // ─── Authentification JWT (verifier RS256 via JWKS auth-service) ──
  // Renseignés dès que auth-service (doc 08) est déployé. En attendant,
  // ces valeurs pointent vers l'instance locale d'auth-service.
  AUTH_JWKS_URL: z.string().url().default('http://localhost:3002/.well-known/jwks.json'),
  AUTH_JWT_ISSUER: z.string().default('nina-aes-auth'),
  AUTH_JWT_AUDIENCE: z.string().default('nina-aes'),

  // ─── Rate-limiting (ThrottlerGuard) ───────────────────────
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(60),

  // ─── Recherche floue ──────────────────────────────────────
  PGTRGM_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  SEARCH_MAX_RESULTS: z.coerce.number().int().positive().max(100).default(20),
});

export type Env = z.infer<typeof envSchema>;
```

```ts
/**
 * @file        services/identity-service/src/config/env.config.ts
 * @description Chargement + validation du .env avec Zod.
 */

import { envSchema, type Env } from './env.schema';

/**
 * Parse `process.env` et valide contre `envSchema`.
 * Appelée au bootstrap pour planter tôt en cas d'erreur de config.
 */
export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment variables:');
    for (const issue of parsed.error.issues) {
      // eslint-disable-next-line no-console
      console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}
```

### 6.4 `src/config/swagger.config.ts`

```ts
/**
 * @file        services/identity-service/src/config/swagger.config.ts
 * @description Configuration OpenAPI 3.1 pour Swagger UI.
 */

import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('NINA-AES • Identity Service')
    .setDescription(
      `API REST pour la gestion des enregistrements NINA (Numéro
       d'Identification Nationale du Mali). Expose les opérations de
       consultation, recherche floue, création, mise à jour et validation
       des identités citoyennes.`,
    )
    .setVersion('0.1.0')
    .setContact(
      'Étudiant UQAR',
      'https://github.com/ninoahounou/nina-aes-platform',
      'noreply@uqar.ca',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3001', 'Dev local')
    .addServer('https://identity.nina-aes.ml', 'Production (placeholder)')
    .addTag('nina', 'Opérations sur les enregistrements NINA')
    .addTag('health', 'Healthcheck & monitoring')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
        description: 'JWT émis par auth-service (doc 08)',
      },
      'access-token',
    )
    .build();
}
```

### 6.5 `src/prisma/prisma.service.ts` + `prisma.module.ts`

```ts
/**
 * @file        services/identity-service/src/prisma/prisma.service.ts
 * @description Wrapper NestJS autour de PrismaClient.
 *              - Connexion automatique au démarrage du module
 *              - Déconnexion propre au shutdown
 *              - Log des requêtes en dev (debug)
 *
 *              🔐 Sécurité (OWASP A05 / souveraineté) : la chaîne de connexion
 *              (qui contient le mot de passe Postgres) provient EXCLUSIVEMENT de
 *              la configuration injectée (`DATABASE_URL`, elle-même alimentée par
 *              Vault ou le `.env` non versionné). On utilise `getOrThrow` : si la
 *              variable manque, le service refuse de démarrer (fail-fast) plutôt
 *              que de retomber sur un secret en clair codé en dur — ce qui serait
 *              une fuite de credential committée dans Git.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env.schema';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * @param config - Service de config typé Zod. `getOrThrow('DATABASE_URL')`
   *                 lève si la variable est absente : AUCUN fallback en clair.
   */
  constructor(config: ConfigService<Env, true>) {
    super({
      datasources: {
        db: {
          // ❌ JAMAIS de `?? 'postgresql://user:motdepasse@...'` ici : ce serait
          //    un secret committé. ✅ getOrThrow → fail-fast si non configuré.
          url: config.getOrThrow('DATABASE_URL', { infer: true }),
        },
      },
      log:
        config.get('NODE_ENV', { infer: true }) === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('✅ Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('🛑 Disconnected from PostgreSQL');
  }
}
```

```ts
/**
 * @file        services/identity-service/src/prisma/prisma.module.ts
 * @description Module global qui expose PrismaService partout sans
 *              réimport dans chaque module métier.
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 6.5bis Autorisation — Guards, verifier JWT & ownership (ADR-027)

> **Pourquoi du code local au service et pas un package partagé ?** Le package
> `@nina-aes/auth-guards` est volontairement **type-only / metadata-only** (ADR-027) : il n'exporte
> que des types, le token DI `JWT_VERIFIER`, l'enum `UserRole` et les décorateurs `@Public()` /
> `@Roles()` (de simples `SetMetadata`). Les **classes** `@Injectable()` (`JwtAuthGuard`,
> `RolesGuard`, …) vivent dans CHAQUE service. Si on les extrayait dans un package workspace, pnpm
> dupliquerait physiquement `@nestjs/core`, cassant l'identité du `Reflector`
> (`UnknownDependenciesException`).

#### `src/auth/jwks-jwt.verifier.ts` — vérification RS256 réelle

> ⚠️ **Honnêteté — NON IMPLÉMENTÉ (⏳ Phase 2)** : ce verifier RS256/JWKS via `jose` **n'existe PAS
> dans le dépôt**. Vérifiable par `Grep` : aucun import `jose`, le fichier
> `services/identity-service/src/auth/jwks-jwt.verifier.ts` est **inexistant**, et la méthode
> `verifyAccess()` n'est pas codée. Ne pas la présenter comme existante. Le code livré ne fait
> **aucune** vérification de signature : `roles.guard.ts::extractUserFromJwt()` renvoie `null` (cf.
> § 3.3, encadré « DOC PRESCRIPTIF vs CODE ACTUEL »). Ce n'est donc **pas** « seulement le
> déploiement d'`auth-service` qui manque » — le verifier lui-même reste à écrire.
>
> _Cible visée (à coder)_ : valider la signature RS256 d'un token émis par `auth-service` (doc 08) à
> partir de son JWKS (`/.well-known/jwks.json`). Le claim `nina` (NINA du citoyen propriétaire), une
> fois posé par `auth-service`, servira au futur `NinaOwnershipGuard` (lui aussi à implémenter).

```ts
/**
 * @file        services/identity-service/src/auth/jwks-jwt.verifier.ts
 * @description Implémentation de JwtVerifier basée sur le JWKS d'auth-service.
 *              Valide la signature RS256 (clé publique souveraine, signée via
 *              Vault Transit côté auth-service) et projette le sujet sur
 *              `request.user`.
 *
 *              Souveraineté : aucune dépendance à un IdP étranger (pas d'Auth0,
 *              pas de Cognito) — le JWKS provient d'auth-service interne.
 */

import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AuthSubject, JwtVerifier } from '@nina-aes/auth-guards';

import type { Env } from '../config/env.schema';

/** Claims attendus dans l'access token émis par auth-service. */
interface NinaJwtPayload extends JWTPayload {
  role?: string;
  mfa?: boolean;
  email?: string;
  /** NINA du citoyen propriétaire (absent pour agent/admin). */
  nina?: string;
}

@Injectable()
export class JwksJwtVerifier implements JwtVerifier, OnModuleInit {
  private readonly logger = new Logger(JwksJwtVerifier.name);

  /** Cache du JWKS distant (rotation gérée par `jose`). */
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Initialise le JWKSet distant au boot. N'échoue PAS le démarrage si
   * auth-service est down : la vérification échouera à la première requête
   * (fail-closed) plutôt que d'empêcher le service de répondre au /health.
   */
  onModuleInit(): void {
    const url = new URL(this.config.getOrThrow('AUTH_JWKS_URL', { infer: true }));
    this.jwks = createRemoteJWKSet(url);
    this.logger.log(`JWKS configuré : ${url.origin}${url.pathname}`);
  }

  /**
   * Vérifie un access token et retourne le sujet authentifié.
   *
   * ⚠️ Contrat JwtVerifier : DOIT lever `UnauthorizedException` sur tout token
   * invalide / expiré / mal signé. On NE distingue PAS les sous-cas dans le
   * message (anti-oracle / anti user-enum). `jwtVerify` est asynchrone alors que
   * le contrat est synchrone : on le rend synchrone via une stratégie de
   * pré-chargement n'est pas possible ici → on expose plutôt `verifyAccess`
   * comme méthode asynchrone si le Guard l'appelle en `await` (cf. note).
   *
   * @param token - JWT compact (header.payload.signature)
   * @returns Projection minimale du sujet (userId, role, mfa, nina…)
   */
  async verifyAccess(token: string): Promise<AuthSubject> {
    if (!this.jwks) throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    try {
      const { payload } = await jwtVerify<NinaJwtPayload>(token, this.jwks, {
        algorithms: ['RS256'], // ⛔ jamais 'none', jamais HS256 (clé symétrique)
        issuer: this.config.getOrThrow('AUTH_JWT_ISSUER', { infer: true }),
        audience: this.config.getOrThrow('AUTH_JWT_AUDIENCE', { infer: true }),
      });

      if (!payload.sub || !payload.role) {
        throw new UnauthorizedException('AUTH_TOKEN_INVALID');
      }

      return {
        userId: payload.sub,
        role: payload.role,
        mfa: payload.mfa === true,
        email: payload.email,
        // `nina` exposé pour NinaOwnershipGuard (peut être undefined).
        ...(payload.nina ? { nina: payload.nina } : {}),
      } as AuthSubject & { nina?: string };
    } catch {
      // Message générique : on ne révèle PAS si le token est expiré vs malformé.
      throw new UnauthorizedException('AUTH_TOKEN_INVALID');
    }
  }
}
```

> **Note technique** : le contrat `JwtVerifier.verifyAccess` du package est synchrone, mais
> `jose.jwtVerify` est asynchrone (récupération JWKS). Les Guards ci-dessous appellent donc le
> verifier en `await` et déclarent `canActivate` comme `Promise<boolean>` — NestJS supporte les
> `CanActivate` asynchrones. Si tu préfères respecter strictement la signature synchrone du package,
> pré-charge le JWKS dans un cache mémoire au boot et vérifie la signature en local synchrone.

#### `src/auth/guards/jwt-auth.guard.ts`

```ts
/**
 * @file        services/identity-service/src/auth/guards/jwt-auth.guard.ts
 * @description Garde d'AUTHENTIFICATION. Extrait le Bearer token, le vérifie via
 *              le {@link JwtVerifier} injecté, et pose `request.user`. Les routes
 *              `@Public()` (health, validate) sont court-circuitées.
 *
 *              ⚠️ Classe LOCALE au service (ADR-027) — ne JAMAIS l'extraire dans
 *              un package partagé (duplication @nestjs/core → Reflector cassé).
 *
 *              Fail-closed : aucun token ou token invalide ⇒ 401. Il n'existe
 *              AUCUN mode « bypass auth » même en développement.
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, JWT_VERIFIER, type JwtVerifier } from '@nina-aes/auth-guards';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
    private readonly reflector: Reflector,
  ) {}

  /**
   * @returns `true` si la route est publique OU si le token est valide.
   * @throws  UnauthorizedException (401) sinon.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Les décorateurs @Public() (méthode ou classe) court-circuitent l'auth.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    const token = this.extractBearer(request.headers.authorization);
    if (!token) throw new UnauthorizedException('AUTH_TOKEN_INVALID');

    // verifyAccess lève UnauthorizedException si le token est invalide/expiré.
    request.user = await this.verifier.verifyAccess(token);
    return true;
  }

  /** Extrait le token d'un en-tête `Authorization: Bearer <jwt>`. */
  private extractBearer(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) return null;
    const [scheme, token] = raw.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
```

#### `src/auth/guards/roles.guard.ts`

```ts
/**
 * @file        services/identity-service/src/auth/guards/roles.guard.ts
 * @description Garde d'AUTORISATION par rôle. Lit la métadonnée posée par
 *              `@Roles(...)` et vérifie que `request.user.role` y figure.
 *              DOIT s'exécuter APRÈS JwtAuthGuard (qui pose `request.user`).
 *
 *              ⚠️ Classe LOCALE au service (ADR-027).
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, type AuthSubject } from '@nina-aes/auth-guards';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Pas de @Roles() → on ne restreint pas (l'auth a déjà eu lieu en amont).
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthSubject }>();
    const role = request.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('AUTH_FORBIDDEN_ROLE');
    }
    return true;
  }
}
```

#### `src/auth/guards/nina-ownership.guard.ts` — anti-IDOR (OWASP A01)

```ts
/**
 * @file        services/identity-service/src/auth/guards/nina-ownership.guard.ts
 * @description Garde de PROPRIÉTÉ (ownership). Empêche un citoyen de consulter
 *              le NINA d'un autre citoyen (Insecure Direct Object Reference —
 *              OWASP A01:2021).
 *
 *              Règle : si `request.user.role === 'citizen'`, le `:nina` de la
 *              route DOIT être égal au claim `nina` porté par son token. Les
 *              rôles `agent`/`admin` (besoin métier légitime) sont exemptés.
 *
 *              ⚠️ Classe LOCALE au service (ADR-027). Doit s'exécuter APRÈS
 *              JwtAuthGuard (lecture de `request.user`).
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthSubject } from '@nina-aes/auth-guards';

/** Sujet enrichi du claim `nina` (propriétaire) posé par auth-service. */
type OwnerSubject = AuthSubject & { nina?: string };

@Injectable()
export class NinaOwnershipGuard implements CanActivate {
  /** Rôles autorisés à consulter le NINA d'autrui (besoin métier). */
  private static readonly PRIVILEGED = new Set(['agent', 'supervisor', 'admin']);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: OwnerSubject;
      params: Record<string, string>;
    }>();

    const user = request.user;
    if (!user) {
      // Ne devrait pas arriver (JwtAuthGuard passe avant) — refus par défaut.
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }

    // Agents/admins : accès transverse légitime (audité côté audit-service).
    if (NinaOwnershipGuard.PRIVILEGED.has(user.role)) return true;

    // Citoyen : il ne peut lire QUE son propre NINA.
    const requestedNina = request.params['nina'];
    if (!user.nina || user.nina !== requestedNina) {
      // Message générique : on ne confirme PAS l'existence du NINA visé.
      throw new ForbiddenException('AUTH_FORBIDDEN_OWNERSHIP');
    }
    return true;
  }
}
```

#### `src/auth/guards/index.ts` et `src/auth/auth.module.ts`

```ts
/**
 * @file services/identity-service/src/auth/guards/index.ts
 */
export * from './jwt-auth.guard';
export * from './roles.guard';
export * from './nina-ownership.guard';
```

```ts
/**
 * @file        services/identity-service/src/auth/auth.module.ts
 * @description Module GLOBAL qui fournit le token DI {@link JWT_VERIFIER}
 *              (consommé par JwtAuthGuard) et les Guards. Le verifier réel
 *              (JwksJwtVerifier) charge le JWKS d'auth-service.
 *
 *              `@Global()` : pas besoin de réimporter AuthModule dans chaque
 *              module métier pour résoudre JWT_VERIFIER.
 */

import { Global, Module } from '@nestjs/common';
import { JWT_VERIFIER } from '@nina-aes/auth-guards';

import { JwksJwtVerifier } from './jwks-jwt.verifier';
import { JwtAuthGuard, RolesGuard, NinaOwnershipGuard } from './guards';

@Global()
@Module({
  providers: [
    JwksJwtVerifier,
    // Le Guard injecte le verifier via le token abstrait JWT_VERIFIER :
    // on pourra le remplacer (ex: mock en test) sans toucher au Guard.
    { provide: JWT_VERIFIER, useExisting: JwksJwtVerifier },
    JwtAuthGuard,
    RolesGuard,
    NinaOwnershipGuard,
  ],
  exports: [JWT_VERIFIER, JwksJwtVerifier, JwtAuthGuard, RolesGuard, NinaOwnershipGuard],
})
export class AuthModule {}
```

### 6.6 DTOs — `src/nina/dto/*.ts`

```ts
/**
 * @file        services/identity-service/src/nina/dto/create-nina.dto.ts
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateNinaDto {
  @ApiProperty({
    example: '198071504270422K',
    description: 'NINA complet (14 chiffres + 1 lettre de contrôle)',
    minLength: 15,
    maxLength: 15,
  })
  @IsString()
  @Length(15, 15)
  @Matches(/^\d{14}[A-Z]$/, {
    message: "nina doit contenir exactement 14 chiffres suivis d'une lettre majuscule",
  })
  nina!: string;

  @ApiProperty({ example: 'TRAORÉ' })
  @IsString()
  @Length(1, 100)
  nom!: string;

  @ApiProperty({ example: 'Amadou Seydou' })
  @IsString()
  @Length(1, 200)
  prenoms!: string;

  @ApiProperty({ example: '1998-07-15', format: 'date' })
  @IsDateString()
  dateNaissance!: string;

  @ApiProperty({ example: 'Bamako' })
  @IsString()
  @Length(1, 200)
  lieuNaissance!: string;

  @ApiProperty({ example: 1, description: '1 = Masculin, 2 = Féminin' })
  @IsInt()
  @Min(1)
  @Max(2)
  sexe!: number;

  @ApiProperty({ example: '09', minLength: 2, maxLength: 2 })
  @IsString()
  @Length(2, 2)
  codeRegion!: string;

  @ApiProperty({ example: '0901', minLength: 4, maxLength: 4 })
  @IsString()
  @Length(4, 4)
  codeCercle!: string;

  @ApiProperty({ example: '0901042', minLength: 7, maxLength: 7 })
  @IsString()
  @Length(7, 7)
  codeCommune!: string;
}
```

```ts
/**
 * @file        services/identity-service/src/nina/dto/update-nina.dto.ts
 */

import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateNinaDto } from './create-nina.dto';

/**
 * Pour la correction d'un enregistrement on accepte tous les champs
 * sauf le NINA lui-même (qui est l'identifiant immuable).
 */
export class UpdateNinaDto extends PartialType(OmitType(CreateNinaDto, ['nina'] as const)) {}
```

```ts
/**
 * @file        services/identity-service/src/nina/dto/search-nina.dto.ts
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchNinaDto {
  @ApiPropertyOptional({
    description: 'Nom (recherche floue accent-insensitive)',
    example: 'traore',
  })
  @IsOptional()
  @IsString()
  nom?: string;

  @ApiPropertyOptional({
    description: 'Prénoms (recherche floue accent-insensitive)',
    example: 'amadou',
  })
  @IsOptional()
  @IsString()
  prenoms?: string;

  @ApiPropertyOptional({
    description: 'Date de naissance exacte (YYYY-MM-DD)',
    example: '1998-07-15',
  })
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @ApiPropertyOptional({ example: '09' })
  @IsOptional()
  @IsString()
  codeRegion?: string;

  @ApiPropertyOptional({
    description: 'Seuil de similarité pg_trgm (0..1)',
    example: 0.3,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  threshold?: number;

  @ApiPropertyOptional({
    description: 'Nombre maximum de résultats',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

```ts
/**
 * @file        services/identity-service/src/nina/dto/nina-response.dto.ts
 */

import { ApiProperty } from '@nestjs/swagger';

export class NinaResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '198071504270422K' })
  nina!: string;

  @ApiProperty({ example: 'TRAORÉ' })
  nom!: string;

  @ApiProperty({ example: 'Amadou Seydou' })
  prenoms!: string;

  @ApiProperty({ example: '1998-07-15', format: 'date' })
  dateNaissance!: Date;

  @ApiProperty({ example: 'Bamako' })
  lieuNaissance!: string;

  @ApiProperty({ example: 1 })
  sexe!: number;

  @ApiProperty({ example: '09' })
  codeRegion!: string;

  @ApiProperty({ example: '0901' })
  codeCercle!: string;

  @ApiProperty({ example: '0901042' })
  codeCommune!: string;

  @ApiProperty({
    description: 'Score de similarité (présent uniquement sur /search)',
    required: false,
    example: 0.87,
  })
  similarity?: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
```

### 6.7 `src/nina/nina.repository.ts`

```ts
/**
 * @file        services/identity-service/src/nina/nina.repository.ts
 * @description Couche d'accès aux données — encapsule toutes les requêtes
 *              Prisma et les requêtes SQL brutes (pg_trgm).
 */

import { Injectable } from '@nestjs/common';
import type { Citizen, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { SearchNinaDto } from './dto/search-nina.dto';

export interface NinaSearchResult extends Citizen {
  similarity: number;
}

@Injectable()
export class NinaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recherche exacte par NINA (unique).
   *
   * 🔐 `deletedAt: null` : on ignore les enregistrements soft-deleted —
   * un dossier archivé ne doit plus apparaître dans les consultations
   * courantes (mais reste en base pour l'audit).
   */
  async findByNina(nina: string): Promise<Citizen | null> {
    return this.prisma.ninaRecord.findFirst({ where: { nina, deletedAt: null } });
  }

  /**
   * Recherche exacte par UUID (enregistrements non supprimés uniquement).
   */
  async findById(id: string): Promise<Citizen | null> {
    return this.prisma.ninaRecord.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * Création d'un nouvel enregistrement.
   */
  async create(data: Prisma.CitizenCreateInput): Promise<Citizen> {
    return this.prisma.ninaRecord.create({ data });
  }

  /**
   * Mise à jour partielle par UUID.
   */
  async update(id: string, data: Prisma.CitizenUpdateInput): Promise<Citizen> {
    return this.prisma.ninaRecord.update({ where: { id }, data });
  }

  /**
   * Suppression LOGIQUE (soft-delete).
   *
   * 🔐 On NE fait PAS de hard-delete (`prisma.delete`) : on positionne
   * `deletedAt = now()` pour conserver la ligne (intégrité de la chaîne
   * d'audit HASH-CHAIN, cf. ADR-007, et investigations anti-fraude). Le champ
   * `deletedAt` doit exister dans le schéma Prisma (doc 06) ; toutes les
   * lectures filtrent `deletedAt: null`.
   */
  async softDelete(id: string): Promise<void> {
    await this.prisma.ninaRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Recherche floue (pg_trgm) insensible aux accents (unaccent) sur
   * nom + prénoms. Retourne les résultats triés par similarité décroissante.
   *
   * Requête SQL brute car Prisma Client 7 ne supporte pas nativement
   * la fonction `similarity()` de pg_trgm.
   */
  async fuzzySearch(
    dto: SearchNinaDto & { threshold: number; limit: number },
  ): Promise<NinaSearchResult[]> {
    const query = `${dto.nom ?? ''} ${dto.prenoms ?? ''}`.trim();

    // Cas trivial : aucune contrainte textuelle → recherche exacte
    if (!query) {
      // 🔐 N'inclut jamais les enregistrements soft-deleted.
      const where: Prisma.CitizenWhereInput = { deletedAt: null };
      if (dto.dateNaissance) {
        where.dateNaissance = new Date(dto.dateNaissance);
      }
      if (dto.codeRegion) {
        where.codeRegion = dto.codeRegion;
      }
      const rows = await this.prisma.ninaRecord.findMany({
        where,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((r) => ({ ...r, similarity: 1 }));
    }

    // Recherche avec pg_trgm + unaccent
    const results = await this.prisma.$queryRaw<NinaSearchResult[]>`
      SELECT
        *,
        similarity(
          unaccent(lower(nom || ' ' || prenoms)),
          unaccent(lower(${query}))
        ) AS similarity
      FROM citizens
      WHERE
        deleted_at IS NULL
        AND similarity(
          unaccent(lower(nom || ' ' || prenoms)),
          unaccent(lower(${query}))
        ) > ${dto.threshold}
        ${
          dto.dateNaissance
            ? Prisma.sql`AND date_naissance = ${new Date(dto.dateNaissance)}::date`
            : Prisma.empty
        }
        ${dto.codeRegion ? Prisma.sql`AND code_region = ${dto.codeRegion}` : Prisma.empty}
      ORDER BY similarity DESC
      LIMIT ${dto.limit}
    `;

    return results;
  }
}

// Import local du helper Prisma.sql pour les conditions optionnelles
import { Prisma } from '@prisma/client';
```

### 6.7bis Masquage du NINA dans les logs + publication d'audit

```ts
/**
 * @file        services/identity-service/src/common/utils/mask-nina.ts
 * @description Masque un NINA pour les journaux. Un log fuité ne doit pas
 *              révéler l'identité complète d'un citoyen (RGPD-like, OWASP A09
 *              Security Logging Failures — ne PAS logger de PII en clair).
 *
 *              Format : on conserve 3 premiers + 2 derniers caractères, le
 *              reste est remplacé par des `•`. Ex: `198071504270422K`
 *              → `198••••••••••2K`.
 */

/**
 * @param nina - NINA complet (peut être vide/undefined → renvoie '∅').
 * @returns Représentation masquée, sûre pour les logs.
 */
export function maskNina(nina: string | null | undefined): string {
  if (!nina) return '∅';
  if (nina.length <= 5) return '•'.repeat(nina.length);
  const head = nina.slice(0, 3);
  const tail = nina.slice(-2);
  return `${head}${'•'.repeat(nina.length - 5)}${tail}`;
}
```

```ts
/**
 * @file        services/identity-service/src/audit/audit-publisher.service.ts
 * @description Publie les événements d'audit des mutations NINA vers
 *              audit-service.
 *
 *              ⚠️ Honnêteté — état d'implémentation : ce service est l'INTERFACE
 *              de publication. Dans l'implémentation réelle du dépôt, la
 *              publication est EVENT-DRIVEN via RabbitMQ
 *              (`src/infrastructure/rabbitmq`), audit-service consommant la file.
 *              La variante HTTP ci-dessous (POST direct) est un fallback simple
 *              décrit à but pédagogique ; le bus de messages est préféré
 *              (découplage, rétention, rejeu).
 *
 *              Côté audit-service (doc 09), l'événement est chaîné dans une
 *              HASH-CHAIN SHA-256 ; cette chaîne n'est opposable que si sa racine
 *              est ANCRÉE chez un tiers (OCLEI / Vérificateur Général). Sans
 *              ancrage, un admin DB pourrait la recalculer → ne JAMAIS la
 *              qualifier d'« inaltérable » sans cette réserve (ADR-007).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';

/** Forme minimale d'un événement d'audit émis par identity-service. */
export interface NinaAuditEvent {
  action: 'NINA_CREATED' | 'NINA_UPDATED' | 'NINA_SOFT_DELETED';
  resourceId: string;
  /** NINA DÉJÀ MASQUÉ (jamais en clair sur le réseau de log). */
  nina: string;
  changedFields?: string[];
}

@Injectable()
export class AuditPublisher {
  private readonly logger = new Logger(AuditPublisher.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Émet un événement d'audit. Best-effort non bloquant : une panne de
   * l'audit ne doit pas faire échouer la mutation métier, MAIS l'échec est
   * loggué en `error` pour alerte (un audit silencieusement perdu est un
   * risque de conformité).
   *
   * @param event - Événement à publier (NINA déjà masqué).
   */
  async emit(event: NinaAuditEvent): Promise<void> {
    // URL de l'audit-service (port 3007 — cf. .env, PAS 3003 = ai-service).
    const url = this.config.getOrThrow('AUDIT_SERVICE_URL', { infer: true });
    try {
      // Implémentation réelle : publish RabbitMQ (exchange `nina.audit`).
      // Fallback HTTP montré ici pour la lisibilité pédagogique :
      await fetch(`${url}/api/v1/audit/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'identity-service',
          ...event,
          at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      // On NE relance PAS : la mutation métier reste valide. Mais on trace.
      this.logger.error(
        `Échec publication audit (${event.action}, ${event.resourceId})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

### 6.8 `src/nina/nina.service.ts`

```ts
/**
 * @file        services/identity-service/src/nina/nina.service.ts
 * @description Logique métier — orchestre validation, accès DB, audit.
 *
 *              🔐 Sécurité :
 *                - Chaque mutation (create/update/delete) émet un événement
 *                  d'audit (`AuditPublisher`). L'audit-service (doc 09) le
 *                  chaîne dans une HASH-CHAIN SHA-256 ; cette chaîne n'est
 *                  réellement opposable que si sa racine est ancrée chez un
 *                  tiers (OCLEI / Vérificateur Général) — sinon un admin DB
 *                  pourrait la recalculer. On parle donc d'audit
 *                  « inviolable SOUS RÉSERVE d'ancrage » (cf. ADR-007), pas
 *                  d'audit magiquement inaltérable.
 *                - `delete()` est un SOFT-DELETE (`deletedAt`) : on ne purge
 *                  jamais physiquement (conservation de la chaîne d'audit + RGPD
 *                  « droit à l'effacement » géré séparément par anonymisation).
 *                - Le NINA est MASQUÉ dans les logs (`maskNina`) — un log fuité
 *                  ne doit pas révéler l'identité complète d'un citoyen.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { validateNina } from '@nina-aes/utils';

import type { CreateNinaDto } from './dto/create-nina.dto';
import type { UpdateNinaDto } from './dto/update-nina.dto';
import type { SearchNinaDto } from './dto/search-nina.dto';
import type { NinaResponseDto } from './dto/nina-response.dto';
import { NinaRepository } from './nina.repository';
import { AuditPublisher } from '../audit/audit-publisher.service';
import { maskNina } from '../common/utils/mask-nina';

@Injectable()
export class NinaService {
  private readonly logger = new Logger(NinaService.name);

  /**
   * @param repo  - Accès données (Prisma + pg_trgm).
   * @param audit - Publie les événements d'audit vers audit-service
   *                (event-driven : RabbitMQ, ou HTTP POST en fallback).
   */
  constructor(
    private readonly repo: NinaRepository,
    private readonly audit: AuditPublisher,
  ) {}

  /**
   * Recherche par NINA (15 caractères). Valide d'abord la syntaxe
   * pour éviter d'interroger la DB avec un NINA impossible.
   */
  async findByNina(nina: string): Promise<NinaResponseDto> {
    const v = validateNina(nina);
    if (!v.valid) {
      throw new BadRequestException(`NINA invalide (motif: ${v.reason})`);
    }

    const record = await this.repo.findByNina(nina);
    if (!record) {
      throw new NotFoundException(`NINA ${nina} introuvable`);
    }
    return record as NinaResponseDto;
  }

  /**
   * Recherche floue multi-critères.
   */
  async search(
    dto: SearchNinaDto,
    defaults: { threshold: number; limit: number },
  ): Promise<NinaResponseDto[]> {
    const results = await this.repo.fuzzySearch({
      ...dto,
      threshold: dto.threshold ?? defaults.threshold,
      limit: dto.limit ?? defaults.limit,
    });
    this.logger.debug(
      `fuzzySearch("${dto.nom ?? ''} ${dto.prenoms ?? ''}") → ${results.length} results`,
    );
    return results as unknown as NinaResponseDto[];
  }

  /**
   * Création — vérifie que le NINA est valide ET unique.
   */
  async create(dto: CreateNinaDto): Promise<NinaResponseDto> {
    const v = validateNina(dto.nina);
    if (!v.valid) {
      throw new BadRequestException(`NINA invalide (motif: ${v.reason})`);
    }

    const existing = await this.repo.findByNina(dto.nina);
    if (existing) {
      throw new ConflictException(`NINA ${dto.nina} déjà enregistré (id=${existing.id})`);
    }

    const created = await this.repo.create({
      nina: dto.nina,
      nom: dto.nom,
      prenoms: dto.prenoms,
      dateNaissance: new Date(dto.dateNaissance),
      lieuNaissance: dto.lieuNaissance,
      sexe: dto.sexe,
      codeRegion: dto.codeRegion,
      codeCercle: dto.codeCercle,
      codeCommune: dto.codeCommune,
    });

    // ─── Audit : trace la création (donnée sensible créée) ──────────
    // L'événement part vers audit-service qui le chaîne (HASH-CHAIN
    // SHA-256). On ne loggue jamais le NINA en clair (maskNina).
    await this.audit.emit({
      action: 'NINA_CREATED',
      resourceId: created.id,
      // Le payload audit côté audit-service stocke le NINA chiffré/haché ;
      // ici on n'expose que l'id + un NINA masqué pour corrélation.
      nina: maskNina(created.nina),
    });

    this.logger.log(`✅ NINA créé : ${maskNina(created.nina)} (id=${created.id})`);
    return created as NinaResponseDto;
  }

  /**
   * Mise à jour partielle — le NINA lui-même ne peut pas être modifié.
   */
  async update(id: string, dto: UpdateNinaDto): Promise<NinaResponseDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Enregistrement ${id} introuvable`);
    }

    const updated = await this.repo.update(id, {
      ...dto,
      ...(dto.dateNaissance && {
        dateNaissance: new Date(dto.dateNaissance),
      }),
    });

    // ─── Audit : trace la correction (champs modifiés) ──────────────
    await this.audit.emit({
      action: 'NINA_UPDATED',
      resourceId: id,
      nina: maskNina(existing.nina),
      // On liste les CLÉS modifiées, pas les valeurs (évite de logger des
      // données personnelles ; les valeurs détaillées sont chiffrées côté
      // audit-service si nécessaire).
      changedFields: Object.keys(dto),
    });

    this.logger.log(`✏️  NINA mis à jour : ${maskNina(existing.nina)} (id=${id})`);
    return updated as NinaResponseDto;
  }

  /**
   * Suppression LOGIQUE (soft-delete).
   *
   * 🔐 On ne fait JAMAIS de hard-delete : effacer physiquement la ligne
   * romprait la chaîne d'audit et empêcherait toute investigation a posteriori
   * (fraude, contestation). On positionne `deletedAt` ; les lectures filtrent
   * `deletedAt IS NULL`. Le « droit à l'effacement » RGPD-like est traité
   * séparément par une procédure d'anonymisation tracée (doc 09), pas par
   * un DELETE silencieux.
   */
  async delete(id: string): Promise<{ success: true }> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Enregistrement ${id} introuvable`);
    }

    // softDelete = UPDATE ... SET deleted_at = now() (cf. repository).
    await this.repo.softDelete(id);

    // ─── Audit : trace la suppression logique ───────────────────────
    await this.audit.emit({
      action: 'NINA_SOFT_DELETED',
      resourceId: id,
      nina: maskNina(existing.nina),
    });

    this.logger.log(`🗑️  NINA archivé (soft-delete) : ${maskNina(existing.nina)} (id=${id})`);
    return { success: true };
  }

  /**
   * Validation pure (sans accès DB).
   */
  validate(nina: string): { valid: boolean; reason?: string } {
    const v = validateNina(nina);
    if (v.valid) return { valid: true };
    return { valid: false, reason: v.reason };
  }
}
```

### 6.9 `src/nina/nina.controller.ts`

```ts
/**
 * @file        services/identity-service/src/nina/nina.controller.ts
 * @description Controller REST — routes HTTP, validation DTO, Swagger.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public, Roles } from '@nina-aes/auth-guards';

import { CreateNinaDto } from './dto/create-nina.dto';
import { UpdateNinaDto } from './dto/update-nina.dto';
import { SearchNinaDto } from './dto/search-nina.dto';
import { NinaResponseDto } from './dto/nina-response.dto';
import { NinaService } from './nina.service';
import { JwtAuthGuard, RolesGuard, NinaOwnershipGuard } from '../auth/guards';

/**
 * 🔐 `@UseGuards(JwtAuthGuard, RolesGuard)` au niveau CLASSE : tout endpoint est
 * authentifié + soumis au contrôle de rôle PAR DÉFAUT. Les routes publiques
 * (health/validate) sont explicitement ouvertes via `@Public()`. C'est le
 * principe « secure by default » : on doit DÉSACTIVER l'auth (visible), jamais
 * l'ACTIVER endpoint par endpoint (oubli silencieux = faille).
 *
 * ⚠️ CIBLE vs RÉEL (⏳ Phase 2) : ce contrôleur `nina/` n'existe pas dans le
 * dépôt. Le contrôleur livré (`modules/citizen/citizen.controller.ts`) n'a PAS
 * de `@UseGuards(JwtAuthGuard, RolesGuard)` de classe et le guard réel est
 * fail-OPEN : « pas de `@Roles()` = route ouverte » (`return true`). Comme
 * `GET /citizens/:nina`, `GET /citizens/by-id/:id` et `GET /citizens` (recherche)
 * ne portent AUCUN `@Roles()`, ils sont aujourd'hui accessibles SANS auth (IDOR
 * + énumération). Le « secure by default » décrit ici reste à implémenter :
 * ajouter `@Roles(...)` + un `NinaOwnershipGuard` sur ces `GET` avant prod.
 */
@ApiTags('nina')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token JWT absent ou invalide' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant ou NINA non détenu (IDOR)' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nina')
export class NinaController {
  constructor(
    private readonly ninaService: NinaService,
    private readonly config: ConfigService,
  ) {}

  // ─── GET /api/v1/nina/:nina ───────────────────────────────────
  // Auth (classe) + rôles + OWNERSHIP (citoyen = son NINA) + rate-limit.
  // Throttle anti-énumération : 10 requêtes / 60 s par client. Un citoyen
  // ne peut pas balayer l'espace des NINA en force brute.
  @Get(':nina')
  @Roles('citizen', 'agent', 'supervisor', 'admin')
  @UseGuards(NinaOwnershipGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Consultation par NINA',
    description:
      "Retourne l'enregistrement correspondant au NINA fourni (15 caractères). " +
      'Un citoyen ne peut consulter QUE son propre NINA (anti-IDOR) ; agents/admins ' +
      'ont un accès transverse audité.',
  })
  @ApiParam({ name: 'nina', example: '198071504270422K' })
  @ApiOkResponse({ type: NinaResponseDto })
  @ApiBadRequestResponse({ description: 'NINA syntaxiquement invalide' })
  @ApiNotFoundResponse({ description: 'NINA non trouvé en base' })
  async findByNina(@Param('nina') nina: string): Promise<NinaResponseDto> {
    return this.ninaService.findByNina(nina);
  }

  // ─── GET /api/v1/nina/:nina/validate ──────────────────────────
  // Validation purement syntaxique (modulo 23) : aucune lecture DB, aucune
  // donnée personnelle exposée → route PUBLIQUE (utile à l'app citoyenne pour
  // un feedback de saisie immédiat). @Public() court-circuite JwtAuthGuard.
  @Public()
  @Get(':nina/validate')
  @ApiOperation({
    summary: 'Validation syntaxique pure (sans accès DB) — publique',
  })
  @ApiParam({ name: 'nina', example: '198071504270422K' })
  @ApiOkResponse({
    schema: {
      example: { valid: true },
    },
  })
  validate(@Param('nina') nina: string): { valid: boolean; reason?: string } {
    return this.ninaService.validate(nina);
  }

  // ─── POST /api/v1/nina/search ─────────────────────────────────
  // Recherche floue RÉSERVÉE aux agents/admins : ouverte au citoyen elle
  // permettrait l'énumération de la population. Throttle strict en plus
  // (5 / 60 s) car c'est l'endpoint le plus coûteux et le plus sensible.
  @Post('search')
  @Roles('agent', 'supervisor', 'admin')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recherche floue multi-critères (agents/admins)',
    description: 'Utilise pg_trgm + unaccent pour tolérer les fautes de frappe et les accents.',
  })
  @ApiOkResponse({ type: [NinaResponseDto] })
  async search(@Body() dto: SearchNinaDto): Promise<NinaResponseDto[]> {
    return this.ninaService.search(dto, {
      threshold: this.config.get<number>('PGTRGM_SIMILARITY_THRESHOLD', 0.3),
      limit: this.config.get<number>('SEARCH_MAX_RESULTS', 20),
    });
  }

  // ─── POST /api/v1/nina ────────────────────────────────────────
  // Création réservée aux ADMINS (migration / import RAVEC).
  @Post()
  @Roles('admin')
  @ApiOperation({ summary: "Création d'un enregistrement NINA (admin)" })
  @ApiCreatedResponse({ type: NinaResponseDto })
  @ApiBadRequestResponse({ description: 'NINA invalide ou DTO malformé' })
  @ApiConflictResponse({ description: 'NINA déjà existant' })
  async create(@Body() dto: CreateNinaDto): Promise<NinaResponseDto> {
    return this.ninaService.create(dto);
  }

  // ─── PATCH /api/v1/nina/:id ───────────────────────────────────
  // Correction par un agent ou un admin (workflow de signalement, doc 09).
  @Patch(':id')
  @Roles('agent', 'supervisor', 'admin')
  @ApiOperation({ summary: "Correction partielle d'un enregistrement (agent/admin)" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: NinaResponseDto })
  @ApiNotFoundResponse()
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateNinaDto,
  ): Promise<NinaResponseDto> {
    return this.ninaService.update(id, dto);
  }

  // ─── DELETE /api/v1/nina/:id ──────────────────────────────────
  // Suppression LOGIQUE (soft-delete) réservée aux ADMINS.
  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: "Suppression logique (soft-delete) d'un enregistrement (admin)" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: { example: { success: true } },
  })
  async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ success: true }> {
    return this.ninaService.delete(id);
  }
}
```

### 6.10 `src/nina/nina.module.ts`

```ts
/**
 * @file        services/identity-service/src/nina/nina.module.ts
 */

import { Module } from '@nestjs/common';
import { NinaController } from './nina.controller';
import { NinaService } from './nina.service';
import { NinaRepository } from './nina.repository';
import { AuditPublisher } from '../audit/audit-publisher.service';

@Module({
  controllers: [NinaController],
  // AuditPublisher : émet les événements d'audit des mutations.
  // Les Guards (JwtAuthGuard, RolesGuard, NinaOwnershipGuard) sont fournis
  // par AuthModule (@Global) — pas besoin de les redéclarer ici.
  providers: [NinaService, NinaRepository, AuditPublisher],
  exports: [NinaService],
})
export class NinaModule {}
```

### 6.11 `src/app.module.ts`

```ts
/**
 * @file        services/identity-service/src/app.module.ts
 * @description Module racine — assemble tous les sous-modules.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { NinaModule } from './nina/nina.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import type { Env } from './config/env.schema';

@Module({
  imports: [
    // Charge .env et le rend disponible globalement
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    // ─── Rate-limiting global (anti brute-force / énumération) ──────
    // Limite par défaut appliquée à TOUT le service via APP_GUARD
    // ci-dessous ; les routes sensibles la resserrent avec @Throttle().
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>) => [
        {
          ttl: cfg.get('THROTTLE_TTL_MS', { infer: true }),
          limit: cfg.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    // AuthModule (@Global) fournit JWT_VERIFIER + les Guards.
    AuthModule,
    PrismaModule,
    NinaModule,
    HealthModule,
  ],
  providers: [
    // ThrottlerGuard en garde GLOBALE : protège tous les endpoints, y compris
    // ceux qu'on oublierait d'annoter. Les routes @Public() restent limitées
    // (le rate-limit s'applique AVANT l'auth).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

> ⚠️ **⏳ à implémenter en Phase 2 — rate-limiting INERTE dans le code réel** : dans le
> `app.module.ts` livré, `ThrottlerModule.forRoot([...])` est bien importé, **mais le provider
> `{ provide: APP_GUARD, useClass: ThrottlerGuard }` n'est PAS enregistré** (vérifiable par `Grep` :
> aucun `APP_GUARD`, aucun `ThrottlerGuard` dans le service). Conséquence : le rate-limiting global
> est **inactif**, et les décorateurs `@Throttle()` posés sur `/search` et `/nina/:nina` n'ont
> **aucun effet** tant que ce provider n'est pas ajouté. L'anti-bruteforce / anti-énumération
> annoncé ici reste donc à câbler.

### 6.12 `src/health/health.{module,controller}.ts`

```ts
/**
 * @file        services/identity-service/src/health/health.module.ts
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

```ts
/**
 * @file        services/identity-service/src/health/health.controller.ts
 * @description GET /health — probe Docker/K8s vérifiant :
 *              - La connexion PostgreSQL est vivante
 *              - Le service lui-même répond en < 1s
 */

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.prismaIndicator.pingCheck('database', this.prisma)]);
  }
}
```

### 6.13 `src/common/filters/http-exception.filter.ts`

```ts
/**
 * @file        services/identity-service/src/common/filters/http-exception.filter.ts
 * @description Filtre global — uniformise le format de sortie des erreurs.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: typeof message === 'object' ? (message as Record<string, unknown>) : { message },
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status}`);
    }

    response.status(status).json(errorResponse);
  }
}
```

---

## 7. Recherche floue avec pg_trgm & unaccent

### 7.1 Activation des extensions PostgreSQL

Déjà fait au document 05 via le script `scripts/init-db.sql` :

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

### 7.2 Index GIN pour recherche rapide

Ajouter à la migration Prisma (fichier
`packages/database/prisma/migrations/XXX_add_trgm_indexes/migration.sql`) :

```sql
-- Index trigramme pour recherche floue sur nom + prénoms (avec unaccent)
CREATE INDEX IF NOT EXISTS idx_nina_search_fulltext
  ON citizens
  USING GIN (
    (unaccent(lower(nom || ' ' || prenoms))) gin_trgm_ops
  );

-- Index simple sur dateNaissance pour filtrage exact
CREATE INDEX IF NOT EXISTS idx_nina_date_naissance
  ON citizens (date_naissance);
```

> ⚠️ Ces index sont **créés manuellement** par un fichier SQL (`prisma migrate dev --create-only`
> puis édition). Prisma ne supporte pas encore les index fonctionnels (`unaccent(lower(...))`)
> nativement dans le schema.prisma.

### 7.3 Exemples de recherche

| Requête utilisateur     | Résultats attendus                              |
| ----------------------- | ----------------------------------------------- |
| `TRAORE`                | `TRAORÉ`, `Traoré`, `traorè`                    |
| `amadou seydou`         | `Amadou Seydou`, `amadou seidou`, `Amadu Seydu` |
| `kone`                  | `KONÉ`, `Koné`, `KONE`                          |
| `bamako` (dans commune) | Tous les enregistrements du district            |

Seuil `threshold=0.3` est un bon compromis par défaut (~70 % de précision, ~90 % de rappel). Pour
des recherches très larges (USSD), descendre à `0.2`.

---

## 8. Documentation OpenAPI/Swagger + Tests (unit + e2e)

### 8.1 Swagger UI

Une fois le service lancé :

```powershell
cd services/identity-service
pnpm run dev
```

Ouvre **http://localhost:3001/api/docs**. Tu verras :

- Tous les endpoints regroupés par tag (`nina`, `health`)
- Les DTOs avec exemples
- Un bouton "Try it out" pour tester chaque route
- Un bouton "Authorize" pour ajouter un JWT (utile à partir du doc 08)

Export JSON pour `redocly` / clients générés : `http://localhost:3001/api/docs-json`.

### 8.2 Tests unitaires — `test/nina.service.spec.ts`

```ts
/**
 * @file        services/identity-service/test/nina.service.spec.ts
 * @description Tests unitaires du NinaService avec mock du repository.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { generateNina } from '@nina-aes/utils';

import { NinaService } from '../src/nina/nina.service';
import { NinaRepository } from '../src/nina/nina.repository';
import { AuditPublisher } from '../src/audit/audit-publisher.service';

describe('NinaService', () => {
  let service: NinaService;
  let repo: jest.Mocked<NinaRepository>;
  let audit: jest.Mocked<AuditPublisher>;

  const validNina = generateNina({
    sexe: 'M',
    annee: 1998,
    mois: 7,
    jour: 15,
    ordre: 427,
    codeCommune: '042',
  });

  const fakeRecord = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    nina: validNina,
    nom: 'TRAORÉ',
    prenoms: 'Amadou Seydou',
    dateNaissance: new Date('1998-07-15'),
    lieuNaissance: 'Bamako',
    sexe: 1,
    codeRegion: '09',
    codeCercle: '0901',
    codeCommune: '0901042',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NinaService,
        {
          provide: NinaRepository,
          useValue: {
            findByNina: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            // soft-delete (plus de hard delete)
            softDelete: jest.fn(),
            fuzzySearch: jest.fn(),
          },
        },
        {
          // Mock de l'AuditPublisher : on vérifie qu'il est appelé sur les
          // mutations, sans réseau réel.
          provide: AuditPublisher,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<NinaService>(NinaService);
    repo = module.get(NinaRepository);
    audit = module.get(AuditPublisher);
  });

  describe('findByNina', () => {
    it("retourne l'enregistrement si trouvé", async () => {
      repo.findByNina.mockResolvedValue(fakeRecord);
      const result = await service.findByNina(validNina);
      expect(result).toEqual(fakeRecord);
      expect(repo.findByNina).toHaveBeenCalledWith(validNina);
    });

    it('lève BadRequest si le NINA est syntaxiquement invalide', async () => {
      await expect(service.findByNina('INVALID_NINA___')).rejects.toThrow(BadRequestException);
      expect(repo.findByNina).not.toHaveBeenCalled();
    });

    it("lève NotFound si le NINA n'existe pas en DB", async () => {
      repo.findByNina.mockResolvedValue(null);
      await expect(service.findByNina(validNina)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crée un nouvel enregistrement', async () => {
      repo.findByNina.mockResolvedValue(null);
      repo.create.mockResolvedValue(fakeRecord);

      const result = await service.create({
        nina: validNina,
        nom: 'TRAORÉ',
        prenoms: 'Amadou Seydou',
        dateNaissance: '1998-07-15',
        lieuNaissance: 'Bamako',
        sexe: 1,
        codeRegion: '09',
        codeCercle: '0901',
        codeCommune: '0901042',
      });

      expect(result).toEqual(fakeRecord);
      expect(repo.create).toHaveBeenCalled();
      // 🔐 Une création DOIT émettre un événement d'audit.
      expect(audit.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'NINA_CREATED', resourceId: fakeRecord.id }),
      );
    });

    it('refuse la création si NINA déjà existant', async () => {
      repo.findByNina.mockResolvedValue(fakeRecord);
      await expect(
        service.create({
          nina: validNina,
          nom: 'X',
          prenoms: 'Y',
          dateNaissance: '1998-07-15',
          lieuNaissance: 'Z',
          sexe: 1,
          codeRegion: '09',
          codeCercle: '0901',
          codeCommune: '0901042',
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('validate', () => {
    it('retourne { valid: true } pour un NINA valide', () => {
      expect(service.validate(validNina)).toEqual({ valid: true });
    });

    it('retourne { valid: false, reason } pour un NINA invalide', () => {
      const res = service.validate('BAD_NINA_FORMAT');
      expect(res.valid).toBe(false);
      expect(res.reason).toBeDefined();
    });
  });
});
```

### 8.3 Tests end-to-end — `test/nina.e2e-spec.ts`

```ts
/**
 * @file        services/identity-service/test/nina.e2e-spec.ts
 * @description Tests end-to-end avec SuperTest.
 *              Nécessite une base PostgreSQL accessible (use docker-compose).
 *
 *              ⚠️ AUTH dans les tests e2e : depuis le câblage des gardes
 *              (§ 6.5bis), les routes mutantes (`POST /nina`, `GET /nina/:nina`,
 *              `POST /nina/search`) exigent un `Authorization: Bearer <jwt>`.
 *              Deux stratégies :
 *                1. (préférée) surcharger le `JWT_VERIFIER` du module de test par
 *                   un faux verifier qui renvoie un `AuthSubject` fixe
 *                   (`.overrideProvider(JWT_VERIFIER).useValue({ verifyAccess: () =>
 *                   ({ userId, role: 'admin', mfa: true }) })`) ;
 *                2. générer un vrai token signé par une clé de test et pointer
 *                   `AUTH_JWKS_URL` vers un JWKS local.
 *              Les exemples ci-dessous présentent le scénario MÉTIER ; ils
 *              supposent l'override (1) appliqué dans `beforeAll`. Sans token ni
 *              override, ces routes répondent `401` — ce qui est le comportement
 *              de sécurité attendu, à tester explicitement (voir dernier bloc).
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { generateNina } from '@nina-aes/utils';
import { JWT_VERIFIER, type AuthSubject } from '@nina-aes/auth-guards';

import { AppModule } from '../src/app.module';

describe('NinaController (e2e)', () => {
  let app: INestApplication;
  const testNina = generateNina({
    sexe: 'F',
    annee: 2001,
    mois: 3,
    jour: 12,
    ordre: 9999,
    codeCommune: '001',
  });

  // Faux verifier : tout token "Bearer test-token" est accepté comme un admin.
  // On NE teste donc PAS la crypto JWT ici (c'est le rôle des tests
  // d'auth-service, doc 08) ; on teste l'AUTORISATION et le métier.
  const fakeAdmin: AuthSubject = { userId: 'test-admin', role: 'admin', mfa: true };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Override du verifier : pas besoin d'auth-service réel en e2e.
      .overrideProvider(JWT_VERIFIER)
      .useValue({ verifyAccess: () => fakeAdmin })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('répond 200 avec status ok', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
        });
    });
  });

  describe('Sécurité — fail-closed', () => {
    it('refuse une route protégée sans token (401)', () => {
      // Pas d'en-tête Authorization → JwtAuthGuard rejette.
      return request(app.getHttpServer()).post('/api/v1/nina').send({ nina: testNina }).expect(401);
    });
  });

  describe('POST /api/v1/nina', () => {
    it('crée un nouvel enregistrement', () => {
      return (
        request(app.getHttpServer())
          .post('/api/v1/nina')
          // Token accepté par le fakeAdmin (rôle admin requis sur POST /nina).
          .set('Authorization', 'Bearer test-token')
          .send({
            nina: testNina,
            nom: 'DIARRA',
            prenoms: 'Fatoumata',
            dateNaissance: '2001-03-12',
            lieuNaissance: 'Kayes',
            sexe: 2,
            codeRegion: '01',
            codeCercle: '0101',
            codeCommune: '0101001',
          })
          .expect(201)
          .expect((res) => {
            expect(res.body.nina).toBe(testNina);
            expect(res.body.id).toBeDefined();
          })
      );
    });

    it('refuse un NINA invalide (400)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/nina')
        .set('Authorization', 'Bearer test-token')
        .send({
          nina: '00000000000000A',
          nom: 'X',
          prenoms: 'Y',
          dateNaissance: '2001-03-12',
          lieuNaissance: 'Z',
          sexe: 2,
          codeRegion: '01',
          codeCercle: '0101',
          codeCommune: '0101001',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/nina/:nina', () => {
    it('retourne 200 si trouvé (rôle admin → ownership contourné)', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/nina/${testNina}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200)
        .expect((res) => {
          expect(res.body.nom).toBe('DIARRA');
        });
    });

    it('retourne 400 si NINA syntaxiquement invalide', () => {
      return request(app.getHttpServer())
        .get('/api/v1/nina/INVALID__________')
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });
  });

  describe('POST /api/v1/nina/search', () => {
    it('trouve par nom tolérant aux accents (rôle agent/admin)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/nina/search')
        .set('Authorization', 'Bearer test-token')
        .send({ nom: 'diarra' }) // sans majuscules
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBeGreaterThanOrEqual(1);
          expect(res.body[0].nom).toBe('DIARRA');
        });
    });
  });
});
```

### 8.4 `test/jest-e2e.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

### 8.5 `eslint.config.js` — Flat config ESLint 10

```js
/**
 * @file        services/identity-service/eslint.config.js
 * @description ESLint 10 flat config — TypeScript + NestJS.
 */

// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Tests ont des règles plus souples
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
```

### 8.6 `.env.example`

```env
# ─── Application ─────────────────────────────────────────
NODE_ENV=development
PORT=3001

# ─── Base de données ─────────────────────────────────────
# ⚠️ Ce .env.example est un TEMPLATE versionné : la valeur ci-dessous est un
#    PLACEHOLDER de dev local. Le vrai mot de passe NE doit JAMAIS être committé :
#    en prod il provient de Vault (injection au déploiement). Le code refuse de
#    démarrer si DATABASE_URL est absent (getOrThrow) — pas de fallback en clair.
DATABASE_URL=postgresql://nina_admin:CHANGE_ME_DEV_ONLY@localhost:5432/nina_aes_db

# ─── CORS (liste blanche stricte — jamais "*") ───────────
CORS_ORIGINS=http://localhost:4001,http://localhost:4002

# ─── Services amis ───────────────────────────────────────
# Port 3007 = audit-service (3003 = ai-service — ne pas confondre).
AUDIT_SERVICE_URL=http://localhost:3007

# ─── Authentification JWT (verifier RS256 via JWKS auth-service) ──
AUTH_JWKS_URL=http://localhost:3002/.well-known/jwks.json
AUTH_JWT_ISSUER=nina-aes-auth
AUTH_JWT_AUDIENCE=nina-aes

# ─── Rate-limiting (ThrottlerGuard) ──────────────────────
THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=60

# ─── Recherche floue ─────────────────────────────────────
PGTRGM_SIMILARITY_THRESHOLD=0.3
SEARCH_MAX_RESULTS=20
```

### 8.7 Exécution des tests

```powershell
# Tests unitaires seuls (rapide, pas besoin de DB)
cd services/identity-service
pnpm run test

# Tests end-to-end (nécessite docker compose up de postgres + migration)
cd ../../
pnpm run docker:up
pnpm run db:migrate
pnpm --filter @nina-aes/identity-service run test:e2e

# Couverture
pnpm --filter @nina-aes/identity-service run test:cov
# → Doit atteindre ≥ 85% statements, ≥ 80% branches
```

---

## 9. Mini-rapport d'étape (template)

> À copier dans ton `docs/reports/week-XX.md` à chaque livraison.

```markdown
# Rapport d'étape — identity-service (doc 07)

**Semaine** : [numéro] **Période** : [date début] → [date fin] **Temps investi** : [X heures]

## 🎯 Objectif de la semaine

Implémenter le microservice `identity-service` (NestJS 11 + Prisma 7) avec :

- Validation NINA (clé modulo 23)
- Recherche floue pg_trgm
- 8 endpoints REST documentés sur Swagger, gardés (JWT + rôles + ownership)
- Durcissement (Helmet, CORS liste blanche, throttling) + audit + soft-delete
- ≥ 85 % de couverture de tests

## ✅ Réalisations

- [ ] Structure complète `services/identity-service/src/**`
- [ ] Algorithme `validateNina` + `generateNina` dans `@nina-aes/utils`
- [ ] Tests unitaires algorithme NINA (X tests, 100 % couverture)
- [ ] `PrismaService` + `PrismaModule` avec connexion/déconnexion propre
- [ ] DTOs + validation `class-validator`
- [ ] `NinaRepository` avec `$queryRaw` pour pg_trgm
- [ ] `NinaService` (CRUD + validation + recherche)
- [ ] `NinaController` (8 endpoints + Swagger)
- [ ] Gardes câblées : `JwtAuthGuard` + `RolesGuard` + `NinaOwnershipGuard` (§ 6.5bis)
- [ ] Helmet + CORS liste blanche + `ThrottlerGuard` actifs
- [ ] `AuditPublisher` émet sur create/update/delete ; `delete` = soft-delete
- [ ] NINA masqué dans les logs (`maskNina`)
- [ ] Aucun secret Postgres en clair dans le code (`getOrThrow`, pas de fallback)
- [ ] `HealthController` avec `@nestjs/terminus`
- [ ] `HttpExceptionFilter` global
- [ ] Index SQL trigramme (`idx_nina_search_fulltext`)
- [ ] Tests unitaires service (X tests)
- [ ] Tests e2e (X tests)
- [ ] ESLint 10 flat config fonctionnel

## 🐛 Problèmes rencontrés et solutions

1. **[Problème]** — [Description] → [Solution]
2. …

## 📊 Métriques

- Lignes de code ajoutées : [X]
- Fichiers créés : [X]
- Tests totaux : [X unit + X e2e]
- Couverture : [X %]
- Temps de démarrage service : [X ms]
- Latence moyenne `GET /nina/:nina` : [X ms]

## 📸 Captures

- [ ] Swagger UI (`/api/docs`)
- [ ] Résultat `pnpm run test:cov`
- [ ] Exemple de recherche floue

## 🎓 Ce que j'ai appris

- [Concept 1]
- [Concept 2]

## ⏭️ Prochaine étape

Document 08 — Backend auth-service (JWT RS256, Keycloak).
```

---

## 10. Checklist de fin d'étape

- [ ] Le dossier `services/identity-service/src/` contient tous les fichiers listés au § 4
- [ ] `pnpm --filter @nina-aes/identity-service run build` se termine sans erreur
- [ ] `pnpm --filter @nina-aes/identity-service run dev` démarre sur le port 3001
- [ ] `http://localhost:3001/health` répond `{ status: 'ok' }`
- [ ] `http://localhost:3001/api/docs` affiche Swagger UI avec 8 endpoints
- [ ] Une route protégée sans `Authorization: Bearer` renvoie `401` (fail-closed)
- [ ] Un citoyen consultant le NINA d'autrui reçoit `403` (anti-IDOR)
- [ ] `pnpm --filter @nina-aes/identity-service run test` → tous verts
- [ ] `pnpm --filter @nina-aes/identity-service run test:e2e` → tous verts
- [ ] `pnpm --filter @nina-aes/identity-service run test:cov` → ≥ 85 % statements
- [ ] `pnpm --filter @nina-aes/identity-service run lint` → 0 erreur, ≤ 5 warnings
- [ ] `pnpm --filter @nina-aes/identity-service run check-types` → 0 erreur
- [ ] Tests unitaires de `packages/utils/src/nina.ts` tous verts
- [ ] La migration SQL avec les index `pg_trgm` a été appliquée
- [ ] `POST /api/v1/nina` avec un NINA invalide retourne 400 avec le bon motif
- [ ] `POST /api/v1/nina/search { nom: "traore" }` trouve `TRAORÉ`
- [ ] Les logs NestJS affichent les requêtes entrantes (LoggingInterceptor)
- [ ] Le `HttpExceptionFilter` retourne un JSON uniforme pour les erreurs
- [ ] `.env.example` est versionné, `.env` est dans `.gitignore`
- [ ] ADR-012 créé dans `docs/adr/`
- [ ] Mini-rapport d'étape rempli

---

## 11. Pour aller plus loin

### Améliorations à court terme (reportées aux docs suivants)

| Amélioration                                                                                                   | Document cible                |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 🔐 Émission des JWT RS256 + JWKS (les **gardes** sont déjà câblées ici, § 6.5bis ; reste l'émetteur de tokens) | **08 — auth-service**         |
| 📜 Audit hash-chain SHA-256 sur chaque mutation (ancrage tiers à implémenter, ADR-007)                         | **09 — audit-service**        |
| 🤖 Détection IA d'erreurs de saisie                                                                            | **22 — ai-service**           |
| 📱 Consultation via USSD `*456#`                                                                               | **11 — notification-service** |
| 🌍 Fédération AES (Burkina, Niger)                                                                             | **12 — interop-service**      |
| 📊 Dashboard admin des corrections                                                                             | **19 — frontend-admin**       |
| ⚡ Cache Redis pour consultations fréquentes                                                                   | **23 — performance**          |
| 🛡️ Rate limiting distribué (Redis store) — la limite mémoire `ThrottlerGuard` est déjà en place ici            | **24 — sécurité**             |

### Références externes

- [NestJS 11 Documentation](https://docs.nestjs.com)
- [Prisma 7 Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)
- [OpenAPI 3.1 spec](https://spec.openapis.org/oas/v3.1.0)
- [ESLint 10 Flat config](https://eslint.org/docs/latest/use/configure/configuration-files)
- [RAVEC Mali — Registre Administratif à Vocation d'État Civil](https://www.ravec.gouv.ml)

### ADR & docs sécurité associés

📄
**[ADR-012 — Architecture en couches pour les microservices NestJS](./adr/ADR-012-nestjs-clean-architecture.md)**

📄
**[ADR-027 — `@nina-aes/auth-guards` package type-only (Guards locaux au service)](./adr/ADR-027-auth-guards-type-only-package.md)**

📄
**[ADR-007 — Audit hash-chain SHA-256 (ancrage tiers requis pour l'opposabilité)](./adr/ADR-007-merkle-audit.md)**

📄
**[ADR-034 — Durcissement sécurité : Vault, mTLS, OWASP](./adr/ADR-034-security-hardening-vault-mtls-owasp.md)**

🛡️ **[docs/security/THREAT-MODEL.md](./security/THREAT-MODEL.md)** ·
**[docs/security/SECURITY-RUNBOOK.md](./security/SECURITY-RUNBOOK.md)**

---

**← [Document 06 — Database Schema Prisma](./06-DATABASE-SCHEMA-PRISMA.md)** |
**[Document 08 — Backend Auth Service →](./08-BACKEND-AUTH-SERVICE.md)**
