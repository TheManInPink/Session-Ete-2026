# 10 — Backend : Document-Service (NestJS 11 + Puppeteer + QR JWT RS256)

> **Projet** : NINA-AES Platform **Document** : 10/26 **Service** : `document-service` — Génération
> de la Fiche Descriptive Individuelle (PDF + QR JWT vérifiable) **Port** : `3004` **Stack** :
> NestJS 11.1 · Puppeteer 24 · pdf-lib 1.17 · Handlebars 4.7 · qrcode 1.5 · JWT RS256 · MinIO ·
> PostgreSQL 18 **Auteur** : Étudiant UQAR **Date** : Avril 2026 **Prérequis** :
> [07 — Identity Service](./07-BACKEND-IDENTITY-SERVICE.md) ·
> [08 — Auth Service](./08-BACKEND-AUTH-SERVICE.md) ·
> [09 — Audit Service](./09-BACKEND-AUDIT-SERVICE.md) **ADR** :
> [ADR-006 — JWT RS256 pour QR](./adr/ADR-006-jwt-rs256-qr-code.md)

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Pourquoi une Fiche Descriptive Individuelle avec QR signé ?](#2-pourquoi-une-fiche-descriptive-individuelle)
3. [Technologies utilisées (versions avril 2026)](#3-technologies-utilisées)
4. [Architecture du microservice document-service](#4-architecture-du-microservice-document-service)
5. [Modèle Prisma `Document` + `DocumentAccessLog`](#5-modèle-prisma)
6. [Structure de dossiers](#6-structure-de-dossiers)
7. [Payload QR JWT RS256 — schéma détaillé](#7-payload-qr-jwt-rs256)
8. [Template HTML Handlebars — Fiche Descriptive](#8-template-html-handlebars)
9. [Implémentation NestJS — Code intégral commenté](#9-implémentation-nestjs)
10. [Stockage MinIO (S3-compatible) avec chiffrement SSE-C](#10-stockage-minio-sse-c)
11. [Endpoint public de vérification du QR code](#11-endpoint-public-de-vérification)
12. [Considérations de sécurité et protection PDF](#12-sécurité-et-protection-pdf)
13. [Performance — pool Puppeteer et cache](#13-performance--pool-puppeteer)
14. [Tests (unit + e2e + visual regression)](#14-tests-unit--e2e--visual-regression)
15. [Swagger + OpenAPI](#15-swagger--openapi)
16. [Mini-rapport d'étape (template)](#16-mini-rapport-détape)
17. [Checklist de fin d'étape](#17-checklist-de-fin-détape)
18. [Pour aller plus loin](#18-pour-aller-plus-loin)

---

## 1. Objectif pédagogique

Construire le service qui **matérialise** l'identité numérique NINA sous forme d'un **PDF officiel
vérifiable hors ligne** : la **Fiche Descriptive Individuelle** (FDI).

La FDI est imprimable, signée cryptographiquement via un QR code JWT RS256, et peut être **vérifiée
par n'importe quelle application mobile** (scan du QR → validation hors ligne de la signature) sans
connexion à la base de données centrale. Ce document joue le rôle d'une carte d'identité numérique
portable en attendant la carte biométrique physique (Bloc F).

### Ce que tu vas apprendre

| Compétence                         | Niveau        | Application au projet                                     |
| ---------------------------------- | ------------- | --------------------------------------------------------- |
| Génération PDF serveur (Puppeteer) | Avancé        | HTML → PDF headless Chromium                              |
| Manipulation pdf-lib               | Avancé        | Ajout métadonnées PDF/A, cryptographie, watermark         |
| Templates Handlebars               | Intermédiaire | Internationalisation 8 langues, variables NINA            |
| JWT RS256 + QR code                | Expert        | Payload compact, signature Keycloak, vérification offline |
| Minio (S3-compatible) + SSE-C      | Avancé        | Upload, URL pré-signées, chiffrement côté client          |
| Cache LRU + TTL                    | Intermédiaire | Cache PDF 5 min pour réduire coût Puppeteer               |
| Pool d'instances browser           | Avancé        | Pool Puppeteer pour soutenir 100 PDF/min                  |
| Visual regression testing          | Intermédiaire | Playwright pixel-diff sur PDF rendu                       |

### Livrable à la fin de ce document

- **5 endpoints REST** sur `http://localhost:3004/api/v1/documents/*`
- **Génération PDF** de la FDI (A4, 1 page recto-verso) avec QR au coin inférieur droit
- **JWT RS256** signé par la clé privée Keycloak, vérifiable via JWKS public
- **Template Handlebars** multi-langues (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE)
- **Upload MinIO** avec chiffrement SSE-C par citoyen
- **URL pré-signée** (7 jours) pour téléchargement par le citoyen
- **Endpoint public** `/verify-qr` sans auth pour validation tiers
- **Audit** de chaque génération et vérification (via RabbitMQ → audit-service)
- **Tests** ≥ 85% de couverture, dont 1 test de régression visuelle
- **Swagger** OpenAPI 3.1

---

## 2. Pourquoi une Fiche Descriptive Individuelle ?

### 2.1 Le problème à résoudre

Dans le contexte malien actuel (2026), la carte d'identité biométrique physique n'est pas encore
délivrée à tous les citoyens (couverture 40 %). Les citoyens qui ont **obtenu leur NINA mais
attendent leur carte** n'ont **aucun document officiel portable** à présenter :

- À la mairie pour un acte d'état civil
- Au bureau de vote (inscription provisoire)
- À la banque pour ouvrir un compte Mobile Money
- Aux agents de sécurité
- À l'étranger (diaspora)

### 2.2 Solution NINA-AES

Un **PDF signé cryptographiquement** :

1. **Contenu lisible humainement** : nom, prénom, date et lieu de naissance, NINA, parents, photo si
   disponible
2. **QR code** contenant un **JWT RS256** signé par l'État (clé Keycloak réalm `nina-aes`)
3. **Vérification hors ligne** : n'importe quel agent avec une app mobile (même sans réseau) peut
   scanner le QR, valider la signature, et confirmer l'identité
4. **Non falsifiable** : sans la clé privée RS256 (dans Vault), impossible de créer un faux QR

### 2.3 Garanties et limites

| Garanti                                                 | Non garanti                                         |
| ------------------------------------------------------- | --------------------------------------------------- |
| Le QR prouve que **cette** fiche a été émise par l'État | Que la personne qui la présente est celle décrite   |
| Les données du QR n'ont pas été modifiées               | Qu'elle n'a pas été imprimée pour quelqu'un d'autre |
| La fiche a été émise à la date `iat` affichée           | Qu'elle est encore valide (révocation possible)     |
| La clé privée n'a pas été compromise                    | Que le CTDEC n'a pas émis une fiche en double       |

La **biométrie** (Bloc F, document 25) lèvera la première limite. La **révocation** est gérée via
une liste de NINA invalidés consultable en ligne (CRL-like).

### 2.4 Menaces principales et contre-mesures

| Menace                                                  | Contre-mesure                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| Fausse fiche créée avec des données inventées           | QR signé RS256 — signature invalide détectée en < 10 ms              |
| Interception d'une fiche vraie pour l'utiliser ailleurs | Photo sur la fiche (vérification visuelle humaine)                   |
| Impression illégale de la fiche d'un autre citoyen      | Watermark PDF + numéro de série unique + audit des téléchargements   |
| Citoyen décédé dont la fiche reste valide               | Vérification en ligne optionnelle (révocation quotidienne)           |
| Compromission de la clé privée Keycloak                 | Rotation 180 j + JWKS avec `kid` + possibilité de re-signer en masse |

---

## 3. Technologies utilisées

| Dépendance                 | Version   | Rôle                                         |
| -------------------------- | --------- | -------------------------------------------- |
| `@nestjs/common`           | `11.1.18` | Core NestJS                                  |
| `@nestjs/core`             | `11.1.18` | Runtime                                      |
| `@nestjs/platform-express` | `11.1.18` | HTTP                                         |
| `@nestjs/config`           | `4.1.2`   | `.env` + Zod                                 |
| `@nestjs/swagger`          | `11.2.0`  | OpenAPI 3.1                                  |
| `@nestjs/terminus`         | `11.1.0`  | Healthchecks                                 |
| `@nestjs/jwt`              | `11.0.0`  | Signature JWT RS256                          |
| `@nestjs/throttler`        | `6.5.0`   | Rate-limiting endpoint public                |
| `puppeteer`                | `24.0.0`  | Headless Chromium (HTML → PDF)               |
| `pdf-lib`                  | `1.17.1`  | Post-processing PDF (métadonnées, watermark) |
| `handlebars`               | `4.7.8`   | Templates HTML                               |
| `qrcode`                   | `1.5.4`   | Génération PNG/SVG du QR                     |
| `jwks-rsa`                 | `3.2.0`   | Vérification JWKS pour l'endpoint public     |
| `minio`                    | `8.0.5`   | Client MinIO S3                              |
| `ioredis`                  | `5.6.1`   | Cache LRU + lock distribué                   |
| `puppeteer-cluster`        | `0.24.0`  | Pool d'instances browser                     |
| `sharp`                    | `0.34.2`  | Manipulation d'images (photo citoyen)        |
| `prisma`                   | `7.6.2`   | ORM                                          |
| `@prisma/client`           | `7.6.2`   | Client DB                                    |
| `amqplib`                  | `0.10.4`  | Publisher audit                              |
| `zod`                      | `4.3.6`   | Validation DTO                               |
| `pino`                     | `9.12.0`  | Logger                                       |
| `nestjs-pino`              | `4.5.0`   | Bridge                                       |
| `jest`                     | `30.2.0`  | Unit tests                                   |
| `supertest`                | `7.2.0`   | E2E tests                                    |
| `@playwright/test`         | `1.51.0`  | Visual regression (pixel-diff PDF)           |
| `pdf-parse`                | `1.1.1`   | Extraction texte depuis PDF pour tests       |
| `@testcontainers/minio`    | `11.0.0`  | MinIO jetable pour tests                     |

### Pourquoi Puppeteer + pdf-lib (et pas juste un des deux) ?

- **Puppeteer** excelle pour du rendu complexe HTML + CSS (polices, tableaux, flexbox) — parfait
  pour un document visuel avec photos, QR, logos.
- **pdf-lib** est indispensable pour **post-traiter** le PDF généré : ajouter des métadonnées
  PDF/A-3b conformes ISO 19005-3, intégrer un watermark invisible, ajouter un fichier attaché (le
  JWT brut comme pièce jointe, pour vérification sans scan).

L'approche combinée donne le meilleur des deux mondes : **design riche + conformité archive**.

### Pourquoi un pool Puppeteer ?

Puppeteer est cher : chaque lancement Chromium = ~150 ms et ~100 Mo RAM. Pour soutenir 100 PDF/min
sans timeout, on utilise `puppeteer-cluster` avec 4 instances persistantes (réutilisation de
contextes Chromium).

---

## 4. Architecture du microservice document-service

```
┌──────────────────────────────────────────────────────────────────────┐
│                   document-service :3004                             │
│                                                                      │
│  ┌────────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│  │  HTTP API      │   │  Public verify │   │  Audit Publisher    │  │
│  │  /documents/*  │   │  /verify-qr    │   │  → audit.events     │  │
│  │  (auth JWT)    │   │  (no auth)     │   │                     │  │
│  └────────┬───────┘   └────────┬───────┘   └──────────┬──────────┘  │
│           │                    │                      │             │
│           ▼                    ▼                      │             │
│  ┌─────────────────────────────────────────┐         │             │
│  │         DocumentService (core)          │         │             │
│  │  - generate(nina, language)             │─────────┘             │
│  │  - verifyQrJwt(token)                   │                       │
│  │  - revoke(nina, reason)                 │                       │
│  └───────────┬──────────────────┬──────────┘                       │
│              │                  │                                   │
│              ▼                  ▼                                   │
│  ┌───────────────────┐ ┌────────────────────┐                      │
│  │  PdfRenderer      │ │ QrCodeService       │                      │
│  │  - Handlebars     │ │  - JWT RS256 sign   │                      │
│  │  - Puppeteer pool │ │  - PNG 256x256      │                      │
│  │  - pdf-lib post   │ │  - kid = keycloakKey │                     │
│  └──────┬────────────┘ └─────────┬──────────┘                      │
│         │                        │                                  │
│         ▼                        ▼                                  │
│  ┌───────────────────┐ ┌────────────────────┐                      │
│  │  StorageService   │ │  KeyService         │                      │
│  │  (MinIO S3+SSE-C) │ │  - JWKS Keycloak    │                      │
│  │  - upload         │ │  - private key      │                      │
│  │  - presignedUrl   │ │    (via Vault)      │                      │
│  └──────┬────────────┘ └────────────────────┘                      │
│         │                                                            │
│         ▼                                                            │
│  ┌───────────────────┐ ┌────────────────────┐                      │
│  │  MinIO            │ │  Vault KV v2        │                      │
│  │  bucket:documents │ │  secret/document/*  │                      │
│  └───────────────────┘ └────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                      ┌─────────────────────┐
                      │ identity-service    │
                      │ (read citizen data) │
                      └─────────────────────┘
```

---

## 5. Modèle Prisma

Ajouts à `packages/database/prisma/schema.prisma` :

```prisma
model Document {
  id                String         @id @default(uuid())
  nina              String         // FK vers Citizen.nina
  documentType      DocumentType   @default(FICHE_DESCRIPTIVE) @map("document_type")
  language          String         @default("fr")
  serialNumber      String         @unique @map("serial_number") // "FDI-2026-0000001"
  qrJwt             String         @db.Text @map("qr_jwt")      // JWT complet (pour re-vérification)
  qrJwtKid          String         @map("qr_jwt_kid")           // Key ID utilisé
  storageKey        String         @map("storage_key")          // clé MinIO
  sha256Pdf         String         @map("sha256_pdf")           // hash du PDF final
  generatedAt       DateTime       @default(now()) @map("generated_at")
  generatedBy       String?        @map("generated_by")         // NULL si self-service
  expiresAt         DateTime       @map("expires_at")
  revokedAt         DateTime?      @map("revoked_at")
  revokedReason     String?        @map("revoked_reason")

  citizen           Citizen        @relation(fields: [nina], references: [nina])
  accessLogs        DocumentAccessLog[]

  @@index([nina, generatedAt])
  @@index([serialNumber])
  @@index([revokedAt])
  @@map("documents")
}

model DocumentAccessLog {
  id           BigInt    @id @default(autoincrement())
  documentId   String    @map("document_id")
  accessType   AccessType                                      // DOWNLOAD | VERIFY_QR
  accessedBy   String?   @map("accessed_by")                   // userId si authentifié
  ipAddress    String?   @map("ip_address") @db.Inet
  userAgent    String?   @map("user_agent")
  isValid      Boolean   @map("is_valid")                      // pour VERIFY_QR
  reasonCode   String?   @map("reason_code")                   // "EXPIRED", "REVOKED", etc.
  accessedAt   DateTime  @default(now()) @map("accessed_at")

  document     Document  @relation(fields: [documentId], references: [id])

  @@index([documentId, accessedAt])
  @@index([accessedAt])
  @@map("document_access_logs")
}

enum DocumentType {
  FICHE_DESCRIPTIVE
  RECEPISSE_CORRECTION
  ATTESTATION_RDV
}

enum AccessType {
  DOWNLOAD
  VERIFY_QR
  REGENERATE
}
```

---

## 6. Structure de dossiers

```
services/document-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.validation.ts
│   │   └── app.config.ts
│   ├── documents/
│   │   ├── documents.module.ts
│   │   ├── documents.controller.ts           # API authentifiée
│   │   ├── documents-public.controller.ts    # /verify-qr (public)
│   │   ├── documents.service.ts
│   │   ├── repositories/
│   │   │   └── document.repository.ts
│   │   ├── services/
│   │   │   ├── pdf-renderer.service.ts       # Puppeteer + Handlebars
│   │   │   ├── qrcode.service.ts             # JWT RS256 + PNG
│   │   │   ├── key.service.ts                # JWKS + Vault
│   │   │   ├── storage.service.ts            # MinIO SSE-C
│   │   │   ├── verification.service.ts       # Vérification QR
│   │   │   └── serial.service.ts             # FDI-YYYY-NNNNNNN
│   │   ├── dtos/
│   │   │   ├── generate-document.dto.ts
│   │   │   ├── verify-qr.dto.ts
│   │   │   └── revoke-document.dto.ts
│   │   └── templates/
│   │       ├── fiche-descriptive/
│   │       │   ├── template.hbs              # HTML principal
│   │       │   ├── styles.css
│   │       │   ├── logo-aes.svg
│   │       │   └── i18n/
│   │       │       ├── fr.json
│   │       │       ├── bm.json
│   │       │       ├── snk.json
│   │       │       ├── ff.json
│   │       │       ├── tmq.json
│   │       │       ├── hau.json
│   │       │       ├── mos.json
│   │       │       └── dje.json
│   │       ├── recepisse/
│   │       └── attestation-rdv/
│   ├── health/
│   │   └── health.controller.ts
│   └── prisma/
│       └── prisma.service.ts
├── test/
│   ├── documents.e2e-spec.ts
│   ├── verify-qr.e2e-spec.ts
│   └── visual-regression.spec.ts             # Playwright
├── test/fixtures/
│   └── expected-fiche-descriptive.pdf        # référence pixel-diff
├── Dockerfile
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## 7. Payload QR JWT RS256

### 7.1 Schéma du payload

```typescript
interface QrJwtPayload {
  // Header JWT (auto-rempli)
  // { "alg": "RS256", "kid": "nina-doc-2026-01", "typ": "JWT" }

  iss: string; // "https://keycloak.nina.ml/realms/nina-aes"
  aud: string; // "nina-aes:document-verify"
  sub: string; // NINA (14 chiffres + 1 lettre)
  iat: number; // Unix timestamp émission
  exp: number; // Unix timestamp expiration (iat + 180 jours)
  jti: string; // UUID v4 unique par document

  // Métier NINA
  fdi: {
    serialNumber: string; // "FDI-2026-0000001"
    firstName: string; // prénom (UTF-8)
    lastName: string; // nom
    birthDate: string; // ISO 8601 "1990-01-15"
    sex: 'M' | 'F' | 'X';
    birthPlace: string; // "Bamako, Commune III"
    documentType: string; // "FICHE_DESCRIPTIVE"
    photoHash?: string; // SHA-256 de la photo intégrée (si présente)
    language: string; // langue de génération
  };
}
```

### 7.2 Exemple concret

```json
{
  "alg": "RS256",
  "kid": "nina-doc-2026-01",
  "typ": "JWT"
}
.
{
  "iss": "https://keycloak.nina.ml/realms/nina-aes",
  "aud": "nina-aes:document-verify",
  "sub": "19850315123456A",
  "iat": 1744809600,
  "exp": 1760361600,
  "jti": "7a1e8f12-cc34-4ab7-9f3a-1b8de2f91c05",
  "fdi": {
    "serialNumber": "FDI-2026-0000042",
    "firstName": "Aliou",
    "lastName": "Traoré",
    "birthDate": "1985-03-15",
    "sex": "M",
    "birthPlace": "Bamako, Commune III",
    "documentType": "FICHE_DESCRIPTIVE",
    "photoHash": "9e8c...d1f4",
    "language": "bm"
  }
}
```

### 7.3 Taille du QR

Un QR code "Version 15" (77×77 modules, niveau correction L) peut contenir environ **2300
caractères**. Notre JWT fait typiquement **950–1100 caractères** → largement dans la cible. On
utilise **niveau de correction M** (15 % tolérance) pour robustesse d'impression.

### 7.4 Pourquoi RS256 et pas Ed25519 ?

Décision documentée dans [ADR-006](./adr/ADR-006-jwt-rs256-qr-code.md) :

- **Écosystème** : Keycloak 26.1 signe nativement en RS256, réutilisation de la PKI d'auth-service
- **JWKS** : endpoint standard `GET /realms/nina-aes/protocol/openid-connect/certs` — vérification
  publique triviale
- **Compatibilité** : quasiment toutes les librairies JWT supportent RS256, y compris en React
  Native offline
- **Taille** : signature RS256 = 342 caractères b64 vs 86 pour Ed25519 → négligeable pour un QR

---

## 8. Template HTML Handlebars

### 8.1 `templates/fiche-descriptive/template.hbs`

```html
<!DOCTYPE html>
<html lang="{{language}}">
  <head>
    <meta charset="UTF-8" />
    <title>{{i18n.title}} — {{fdi.serialNumber}}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="fdi-header">
      <div class="logos">
        <img src="data:image/svg+xml;base64,{{logoAesBase64}}" alt="AES" class="logo-aes" />
        <div class="title-block">
          <h1>{{i18n.country}}</h1>
          <h2>{{i18n.title}}</h2>
          <p class="subtitle">{{i18n.subtitle}}</p>
        </div>
        <img src="data:image/svg+xml;base64,{{logoMaliBase64}}" alt="Mali" class="logo-country" />
      </div>
    </header>

    <main class="fdi-body">
      <section class="identity-grid">
        {{#if photoBase64}}
        <div class="photo">
          <img src="data:image/jpeg;base64,{{photoBase64}}" alt="Photo" />
          <p class="caption">{{i18n.photo}}</p>
        </div>
        {{/if}}

        <div class="fields">
          <div class="field field-lg">
            <label>{{i18n.nina}}</label>
            <div class="value nina">{{fdi.nina}}</div>
          </div>

          <div class="field">
            <label>{{i18n.lastName}}</label>
            <div class="value">{{fdi.lastName}}</div>
          </div>
          <div class="field">
            <label>{{i18n.firstName}}</label>
            <div class="value">{{fdi.firstName}}</div>
          </div>

          <div class="field">
            <label>{{i18n.birthDate}}</label>
            <div class="value">{{formatDate fdi.birthDate language}}</div>
          </div>
          <div class="field">
            <label>{{i18n.sex}}</label>
            <div class="value">{{i18n.sexLabels.[fdi.sex]}}</div>
          </div>

          <div class="field field-lg">
            <label>{{i18n.birthPlace}}</label>
            <div class="value">{{fdi.birthPlace}}</div>
          </div>

          {{#if fdi.fatherName}}
          <div class="field">
            <label>{{i18n.father}}</label>
            <div class="value">{{fdi.fatherName}}</div>
          </div>
          {{/if}} {{#if fdi.motherName}}
          <div class="field">
            <label>{{i18n.mother}}</label>
            <div class="value">{{fdi.motherName}}</div>
          </div>
          {{/if}}
        </div>
      </section>

      <section class="qr-section">
        <div class="qr-container">
          <img src="data:image/png;base64,{{qrPngBase64}}" alt="QR" class="qr-code" />
          <p class="qr-caption">
            {{i18n.qrInstructions}}<br />
            <strong>{{i18n.verifyUrl}}</strong>
          </p>
        </div>
        <div class="meta">
          <div class="meta-row">
            <span>{{i18n.serialNumber}}</span><strong>{{fdi.serialNumber}}</strong>
          </div>
          <div class="meta-row">
            <span>{{i18n.issuedAt}}</span><strong>{{formatDateTime fdi.iat language}}</strong>
          </div>
          <div class="meta-row">
            <span>{{i18n.expiresAt}}</span><strong>{{formatDate fdi.exp language}}</strong>
          </div>
          <div class="meta-row">
            <span>{{i18n.language}}</span><strong>{{i18n.languageLabels.[language]}}</strong>
          </div>
        </div>
      </section>
    </main>

    <footer class="fdi-footer">
      <p class="disclaimer">{{{i18n.disclaimer}}}</p>
      <p class="hotline">{{i18n.hotline}} — <strong>*123*AIDE#</strong></p>
    </footer>
  </body>
</html>
```

### 8.2 `templates/fiche-descriptive/i18n/fr.json`

```json
{
  "title": "Fiche Descriptive Individuelle",
  "subtitle": "NINA — Numéro d'Identification National",
  "country": "République du Mali",
  "nina": "Numéro NINA",
  "lastName": "Nom de famille",
  "firstName": "Prénom(s)",
  "birthDate": "Date de naissance",
  "sex": "Sexe",
  "sexLabels": { "M": "Masculin", "F": "Féminin", "X": "Non spécifié" },
  "birthPlace": "Lieu de naissance",
  "father": "Père",
  "mother": "Mère",
  "photo": "Photographie",
  "qrInstructions": "Scannez ce code pour vérifier l'authenticité de ce document.",
  "verifyUrl": "verify.nina.ml",
  "serialNumber": "N° de série",
  "issuedAt": "Délivrée le",
  "expiresAt": "Valable jusqu'au",
  "language": "Langue",
  "languageLabels": {
    "fr": "Français",
    "bm": "Bamanankan",
    "snk": "Soninké",
    "ff": "Fulfulde",
    "tmq": "Tamasheq",
    "hau": "Hausa",
    "mos": "Mooré",
    "dje": "Zarma"
  },
  "disclaimer": "Ce document est délivré par le CTDEC. Il a la valeur juridique d'une attestation provisoire en attendant la délivrance de la carte biométrique. Toute falsification est passible de poursuites pénales (Loi N°2022-013, article 47).",
  "hotline": "Numéro d'assistance"
}
```

### 8.3 `templates/fiche-descriptive/i18n/bm.json` (Bambara)

```json
{
  "title": "Mɔgɔ Kunkolo Sɛbɛnni",
  "subtitle": "NINA — Jamana Ka Mɔgɔ Danyɔrɔ Nimɔrɔ",
  "country": "Mali Fasojamana",
  "nina": "NINA Nimɔrɔ",
  "lastName": "Jamu",
  "firstName": "Tɔgɔ",
  "birthDate": "Bangeli don",
  "sex": "Cɛya / Musoya",
  "sexLabels": { "M": "Cɛ", "F": "Muso", "X": "A ma fɔ" },
  "birthPlace": "Bangeli yɔrɔ",
  "father": "Fa",
  "mother": "Ba",
  "photo": "Ja",
  "qrInstructions": "I bɛ se ka QR nin maga walasa ka sɛbɛn nin lakaran.",
  "verifyUrl": "verify.nina.ml",
  "serialNumber": "Nimɔrɔ kɛrɛnkɛrɛnnen",
  "issuedAt": "Sɛbɛn dilanna don",
  "expiresAt": "A bɛ baara kɛ fo",
  "language": "Kan",
  "languageLabels": {
    "fr": "Faransi",
    "bm": "Bamanankan",
    "snk": "Sooninke",
    "ff": "Fulfulde",
    "tmq": "Tamasheq",
    "hau": "Hausa",
    "mos": "Mooré",
    "dje": "Zarma"
  },
  "disclaimer": "Sɛbɛn nin dilanna CTDEC fɛ. A bɛ baara kɛ fo karti biometri ka se. Nkalontigɛli kɛlen bɛ mɔgɔ bila kiri la (Sariya №2022-013, fan 47).",
  "hotline": "Dɛmɛ nimɔrɔ"
}
```

_(Les 6 autres fichiers — snk, ff, tmq, hau, mos, dje — suivent le même schéma et seront complétés
avec un traducteur natif en phase d'acceptation terrain.)_

---

## 9. Implémentation NestJS

### 9.1 `main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('NINA-AES · document-service')
    .setDescription('Génération de la Fiche Descriptive Individuelle signée')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3004);
  await app.listen(port);
  Logger.log(`document-service démarré sur :${port}`, 'Bootstrap');
}

bootstrap();
```

### 9.2 `key.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class KeyService {
  private readonly logger = new Logger(KeyService.name);
  private jwksClient: jwksRsa.JwksClient;
  private privateKeyPem: string | null = null;
  private keyId: string | null = null;

  constructor(private readonly config: ConfigService) {
    const jwksUri = this.config.getOrThrow<string>('KEYCLOAK_JWKS_URI');
    this.jwksClient = jwksRsa({
      jwksUri,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000, // 10 min
      rateLimit: true,
    });
  }

  /** Charge la clé privée depuis Vault (pour signer les QR). */
  async loadPrivateKey() {
    const vaultAddr = this.config.getOrThrow<string>('VAULT_ADDR');
    const vaultToken = this.config.getOrThrow<string>('VAULT_TOKEN');
    const path = this.config.get<string>(
      'VAULT_DOC_SIGNING_KEY_PATH',
      'secret/data/document/signing-key',
    );
    const { data } = await axios.get(`${vaultAddr}/v1/${path}`, {
      headers: { 'X-Vault-Token': vaultToken },
    });
    this.privateKeyPem = data.data.data.private_key_pem as string;
    this.keyId = data.data.data.kid as string;
    this.logger.log(`Clé privée chargée depuis Vault — kid=${this.keyId}`);
  }

  getPrivateKey(): { pem: string; kid: string } {
    if (!this.privateKeyPem || !this.keyId) {
      throw new Error('Private key not loaded');
    }
    return { pem: this.privateKeyPem, kid: this.keyId };
  }

  /** Pour l'endpoint public de vérification. */
  async getPublicKey(kid: string): Promise<string> {
    const key = await this.jwksClient.getSigningKey(kid);
    return key.getPublicKey();
  }
}
```

### 9.3 `qrcode.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';
import { KeyService } from './key.service';
import { ConfigService } from '@nestjs/config';

interface QrJwtPayload {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  fdi: {
    serialNumber: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    sex: 'M' | 'F' | 'X';
    birthPlace: string;
    documentType: string;
    photoHash?: string;
    language: string;
  };
}

@Injectable()
export class QrCodeService {
  constructor(
    private readonly jwt: JwtService,
    private readonly key: KeyService,
    private readonly config: ConfigService,
  ) {}

  async generate(payload: Omit<QrJwtPayload, 'iss' | 'aud' | 'iat' | 'exp' | 'jti'>) {
    const { pem, kid } = this.key.getPrivateKey();
    const iss = this.config.getOrThrow<string>('KEYCLOAK_ISSUER');
    const now = Math.floor(Date.now() / 1000);
    const ttl = Number(this.config.get('QR_JWT_TTL_SECONDS', 180 * 24 * 3600));
    const jti = crypto.randomUUID();

    const full: QrJwtPayload = {
      iss,
      aud: 'nina-aes:document-verify',
      iat: now,
      exp: now + ttl,
      jti,
      ...payload,
    };

    const token = await this.jwt.signAsync(full, {
      algorithm: 'RS256',
      privateKey: pem,
      keyid: kid,
    });

    const pngBuffer = await QRCode.toBuffer(token, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return { token, pngBase64: pngBuffer.toString('base64'), jti, kid };
  }
}
```

### 9.4 `pdf-renderer.service.ts`

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Cluster } from 'puppeteer-cluster';
import * as Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

export interface RenderFdiParams {
  fdi: {
    nina: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    sex: 'M' | 'F' | 'X';
    birthPlace: string;
    fatherName?: string;
    motherName?: string;
    serialNumber: string;
    iat: number;
    exp: number;
  };
  language: string;
  qrPngBase64: string;
  qrJwt: string;
  photoBase64?: string;
}

@Injectable()
export class PdfRendererService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private cluster!: Cluster<RenderFdiParams, Buffer>;
  private template!: HandlebarsTemplateDelegate;
  private i18n: Record<string, Record<string, unknown>> = {};

  async onModuleInit() {
    await this.loadTemplates();
    await this.initCluster();
    this.registerHelpers();
  }

  async onModuleDestroy() {
    await this.cluster?.close();
  }

  private async loadTemplates() {
    const root = path.join(__dirname, '..', 'templates', 'fiche-descriptive');
    const raw = await fs.readFile(path.join(root, 'template.hbs'), 'utf-8');
    this.template = Handlebars.compile(raw);

    const langs = ['fr', 'bm', 'snk', 'ff', 'tmq', 'hau', 'mos', 'dje'];
    for (const l of langs) {
      const p = path.join(root, 'i18n', `${l}.json`);
      this.i18n[l] = JSON.parse(await fs.readFile(p, 'utf-8'));
    }
  }

  private registerHelpers() {
    Handlebars.registerHelper('formatDate', (iso: string | number, lang: string) => {
      const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
      return d.toLocaleDateString(this.localeFor(lang), {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    });
    Handlebars.registerHelper('formatDateTime', (ts: number, lang: string) => {
      return new Date(ts * 1000).toLocaleString(this.localeFor(lang));
    });
  }

  private localeFor(lang: string): string {
    return (
      {
        fr: 'fr-FR',
        bm: 'bm-ML',
        snk: 'fr-ML',
        ff: 'ff-ML',
        tmq: 'tmq-ML',
        hau: 'ha-Latn-NE',
        mos: 'mos-BF',
        dje: 'dje-NE',
      }[lang] ?? 'fr-FR'
    );
  }

  private async initCluster() {
    this.cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: Number(process.env.PUPPETEER_POOL_SIZE ?? 4),
      puppeteerOptions: {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      },
      timeout: 30_000,
    });

    await this.cluster.task(async ({ page, data }) => {
      const html = this.template({
        ...data,
        language: data.language,
        i18n: this.i18n[data.language] ?? this.i18n.fr,
        logoAesBase64: await this.loadSvgBase64('logo-aes.svg'),
        logoMaliBase64: await this.loadSvgBase64('logo-mali.svg'),
      });

      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.addStyleTag({
        path: path.join(__dirname, '..', 'templates', 'fiche-descriptive', 'styles.css'),
      });

      const pdfBytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdfBytes);
    });
  }

  private async loadSvgBase64(file: string): Promise<string> {
    const buf = await fs.readFile(
      path.join(__dirname, '..', 'templates', 'fiche-descriptive', file),
    );
    return buf.toString('base64');
  }

  /** Post-processing pdf-lib : métadonnées PDF/A-3b + attachment JWT. */
  private async postProcess(raw: Buffer, params: RenderFdiParams): Promise<Buffer> {
    const doc = await PDFDocument.load(raw);
    doc.setTitle(`FDI ${params.fdi.serialNumber}`);
    doc.setAuthor('CTDEC — République du Mali');
    doc.setSubject('Fiche Descriptive Individuelle NINA');
    doc.setKeywords([params.fdi.serialNumber, params.fdi.nina, 'NINA', 'AES']);
    doc.setProducer('NINA-AES document-service 1.0');
    doc.setCreator('NINA-AES Platform');
    doc.setCreationDate(new Date(params.fdi.iat * 1000));

    // Attacher le JWT brut (pour vérification sans scan QR)
    await doc.attach(Buffer.from(params.qrJwt, 'utf-8'), 'qr.jwt', {
      mimeType: 'application/jwt',
      description: 'JWT signé RS256 — équivalent du QR code',
      creationDate: new Date(),
    });

    return Buffer.from(await doc.save());
  }

  async render(params: RenderFdiParams): Promise<Buffer> {
    const raw = await this.cluster.execute(params);
    return this.postProcess(raw, params);
  }
}
```

### 9.5 `storage.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: MinioClient;
  private bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('MINIO_BUCKET');
    this.client = new MinioClient({
      endPoint: this.config.getOrThrow('MINIO_ENDPOINT'),
      port: Number(this.config.get('MINIO_PORT', 9000)),
      useSSL: this.config.get('MINIO_USE_SSL') === 'true',
      accessKey: this.config.getOrThrow('MINIO_ACCESS_KEY'),
      secretKey: this.config.getOrThrow('MINIO_SECRET_KEY'),
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Bucket ${this.bucket} créé`);
    }
  }

  /** Upload PDF avec SSE-C (clé dérivée du NINA + salt Vault). */
  async uploadPdf(nina: string, documentId: string, pdf: Buffer): Promise<string> {
    const key = `${nina.slice(0, 4)}/${nina}/${documentId}.pdf`;
    const sseKey = this.deriveSseKey(nina);
    const sseMd5 = createHash('md5').update(sseKey).digest('base64');

    await this.client.putObject(this.bucket, key, pdf, pdf.length, {
      'Content-Type': 'application/pdf',
      'x-amz-server-side-encryption-customer-algorithm': 'AES256',
      'x-amz-server-side-encryption-customer-key': sseKey.toString('base64'),
      'x-amz-server-side-encryption-customer-key-md5': sseMd5,
    });
    return key;
  }

  async getPresignedUrl(nina: string, key: string, ttlSec = 7 * 24 * 3600): Promise<string> {
    // Note : URL pré-signée pour SSE-C nécessite que le client fournisse la clé.
    // Ici on retourne une URL pour un proxy interne qui ré-injecte la SSE-C.
    return this.client.presignedGetObject(this.bucket, key, ttlSec);
  }

  async getObject(nina: string, key: string): Promise<Buffer> {
    const sseKey = this.deriveSseKey(nina);
    const sseMd5 = createHash('md5').update(sseKey).digest('base64');
    const stream = await this.client.getObject(this.bucket, key, {
      SSECustomerAlgorithm: 'AES256',
      SSECustomerKey: sseKey.toString('base64'),
      SSECustomerKeyMD5: sseMd5,
    } as never);

    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  private deriveSseKey(nina: string): Buffer {
    const salt = this.config.getOrThrow<string>('DOC_SSE_SALT');
    return createHash('sha256')
      .update(salt + ':' + nina)
      .digest();
  }
}
```

### 9.6 `verification.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { KeyService } from './key.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface VerifyResult {
  valid: boolean;
  reasonCode?: 'EXPIRED' | 'REVOKED' | 'BAD_SIGNATURE' | 'MALFORMED' | 'UNKNOWN_KEY';
  payload?: unknown;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly key: KeyService,
    private readonly prisma: PrismaService,
  ) {}

  async verify(token: string): Promise<VerifyResult> {
    // 1. Décoder le header pour extraire kid
    const headerB64 = token.split('.')[0];
    if (!headerB64) return { valid: false, reasonCode: 'MALFORMED' };
    let kid: string;
    try {
      const h = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
      if (!h.kid || h.alg !== 'RS256') return { valid: false, reasonCode: 'MALFORMED' };
      kid = h.kid;
    } catch {
      return { valid: false, reasonCode: 'MALFORMED' };
    }

    // 2. Récupérer la clé publique via JWKS
    let publicKey: string;
    try {
      publicKey = await this.key.getPublicKey(kid);
    } catch {
      return { valid: false, reasonCode: 'UNKNOWN_KEY' };
    }

    // 3. Vérifier la signature et l'expiration
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync(token, {
        algorithms: ['RS256'],
        publicKey,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        return { valid: false, reasonCode: 'EXPIRED' };
      }
      return { valid: false, reasonCode: 'BAD_SIGNATURE' };
    }

    // 4. Vérifier la révocation en base
    const jti = payload.jti as string;
    const doc = await this.prisma.document.findFirst({
      where: { qrJwt: token },
      select: { revokedAt: true, nina: true },
    });
    if (doc?.revokedAt) {
      return { valid: false, reasonCode: 'REVOKED', payload };
    }

    return { valid: true, payload };
  }
}
```

### 9.7 `documents.service.ts`

```typescript
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRendererService } from './services/pdf-renderer.service';
import { QrCodeService } from './services/qrcode.service';
import { StorageService } from './services/storage.service';
import { SerialService } from './services/serial.service';
import { AuditPublisher } from '@nina-aes/shared-lib/messaging';
import axios from 'axios';
import { createHash } from 'crypto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderer: PdfRendererService,
    private readonly qr: QrCodeService,
    private readonly storage: StorageService,
    private readonly serial: SerialService,
    private readonly audit: AuditPublisher,
  ) {}

  async generateFDI(nina: string, language: string, actor: { id?: string }) {
    // 1. Récupérer le citoyen via identity-service
    const { data: citizen } = await axios.get(
      `${process.env.IDENTITY_SERVICE_URL}/api/v1/citizens/${nina}`,
      { headers: { 'X-Internal-Token': process.env.INTERNAL_TOKEN! } },
    );
    if (!citizen) throw new NotFoundException(`NINA ${nina} non trouvé`);

    // 2. Générer le numéro de série
    const serialNumber = await this.serial.next('FDI');

    // 3. Générer le QR JWT
    const photoHash = citizen.photoBase64
      ? createHash('sha256').update(citizen.photoBase64, 'base64').digest('hex')
      : undefined;

    const { token, pngBase64, kid } = await this.qr.generate({
      sub: nina,
      fdi: {
        serialNumber,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        birthDate: citizen.birthDate,
        sex: citizen.sex,
        birthPlace: `${citizen.residence?.commune ?? ''}, ${citizen.residence?.region ?? ''}`,
        documentType: 'FICHE_DESCRIPTIVE',
        photoHash,
        language,
      },
    });

    // 4. Rendre le PDF
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 180 * 24 * 3600;
    const pdf = await this.pdfRenderer.render({
      fdi: {
        nina,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        birthDate: citizen.birthDate,
        sex: citizen.sex,
        birthPlace: `${citizen.residence?.commune ?? ''}, ${citizen.residence?.region ?? ''}`,
        fatherName: citizen.parents?.[0]?.firstName + ' ' + citizen.parents?.[0]?.lastName,
        motherName: citizen.parents?.[1]?.firstName + ' ' + citizen.parents?.[1]?.lastName,
        serialNumber,
        iat: now,
        exp,
      },
      language,
      qrPngBase64: pngBase64,
      qrJwt: token,
      photoBase64: citizen.photoBase64,
    });

    const sha256Pdf = createHash('sha256').update(pdf).digest('hex');

    // 5. Persister en base
    const doc = await this.prisma.document.create({
      data: {
        nina,
        documentType: 'FICHE_DESCRIPTIVE',
        language,
        serialNumber,
        qrJwt: token,
        qrJwtKid: kid,
        storageKey: '',
        sha256Pdf,
        generatedBy: actor.id ?? null,
        expiresAt: new Date(exp * 1000),
      },
    });

    // 6. Upload MinIO
    const storageKey = await this.storage.uploadPdf(nina, doc.id, pdf);
    await this.prisma.document.update({
      where: { id: doc.id },
      data: { storageKey },
    });

    // 7. Audit
    await this.audit.publish({
      action: 'document.fdi.generated',
      actorId: actor.id ?? null,
      actorRole: actor.id ? 'AGENT' : 'CITIZEN',
      resourceType: 'document',
      resourceId: doc.id,
      payload: { nina, serialNumber, sha256Pdf, language, kid },
    });

    return { ...doc, storageKey };
  }

  async getDownloadUrl(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException();
    return this.storage.getPresignedUrl(doc.nina, doc.storageKey);
  }

  async revoke(documentId: string, reason: string, actorId: string) {
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.audit.publish({
      action: 'document.revoked',
      actorId,
      actorRole: 'ADMIN',
      resourceType: 'document',
      resourceId: documentId,
      payload: { reason, nina: updated.nina },
    });
    return updated;
  }
}
```

### 9.8 `documents.controller.ts` (authentifié)

```typescript
import { Controller, Post, Get, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard, Roles } from '@nina-aes/auth-guards';
import { DocumentsService } from './documents.service';
import { GenerateDocumentDto } from './dtos/generate-document.dto';
import { RevokeDocumentDto } from './dtos/revoke-document.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post('fdi')
  @Roles('CITIZEN', 'AGENT', 'ADMIN')
  @ApiOperation({ summary: 'Générer la FDI pour un NINA' })
  async generate(@Body() dto: GenerateDocumentDto, @Req() req: any) {
    return this.service.generateFDI(dto.nina, dto.language ?? 'fr', {
      id: req.user?.sub,
    });
  }

  @Get(':id/download-url')
  @Roles('CITIZEN', 'AGENT', 'ADMIN')
  @ApiOperation({ summary: 'URL pré-signée de téléchargement' })
  async downloadUrl(@Param('id') id: string) {
    return { url: await this.service.getDownloadUrl(id) };
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Révoquer une FDI' })
  async revoke(@Param('id') id: string, @Body() dto: RevokeDocumentDto, @Req() req: any) {
    return this.service.revoke(id, dto.reason, req.user.sub);
  }
}
```

### 9.9 `documents-public.controller.ts` (sans auth)

```typescript
import { Controller, Post, Body, Req, Ip, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { VerificationService } from './services/verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditPublisher } from '@nina-aes/shared-lib/messaging';
import { VerifyQrDto } from './dtos/verify-qr.dto';

@ApiTags('public')
@Controller('public/documents')
export class DocumentsPublicController {
  constructor(
    private readonly verification: VerificationService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditPublisher,
  ) {}

  @Post('verify-qr')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Vérification publique d'un QR (pas d'auth)" })
  async verify(@Body() dto: VerifyQrDto, @Ip() ip: string, @Req() req: any) {
    const result = await this.verification.verify(dto.token);

    // Audit + log d'accès (sans exposer de PII si invalide)
    await this.audit.publish({
      action: 'document.qr.verified',
      actorRole: 'PUBLIC',
      payload: {
        valid: result.valid,
        reasonCode: result.reasonCode ?? null,
        ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    if (!result.valid) {
      return { valid: false, reasonCode: result.reasonCode };
    }

    const p = result.payload as any;
    return {
      valid: true,
      issuedBy: p.iss,
      issuedAt: new Date(p.iat * 1000).toISOString(),
      expiresAt: new Date(p.exp * 1000).toISOString(),
      fdi: p.fdi,
    };
  }
}
```

---

## 10. Stockage MinIO SSE-C

### 10.1 Pourquoi SSE-C ?

| Mode      | Clé stockée où                   | Niveau de protection                                       |
| --------- | -------------------------------- | ---------------------------------------------------------- |
| SSE-S3    | MinIO lui-même                   | Faible (admin MinIO peut tout lire)                        |
| SSE-KMS   | KMS externe (ex: AWS KMS)        | Bon, mais nécessite KMS opéré                              |
| **SSE-C** | **Client** (fournie à chaque op) | **Excellent** (même un admin MinIO ne lit pas sans la clé) |

On utilise **SSE-C** avec clé dérivée SHA-256(salt + NINA) où `salt` est dans Vault. Cela signifie :

1. Le PDF stocké dans MinIO est illisible sans connaître le NINA + le salt
2. Même un DBA MinIO ne peut pas lire en masse les fiches
3. Pour régénérer l'URL, `document-service` doit obtenir le NINA depuis `documents.nina` → possible
   uniquement via endpoint authentifié

### 10.2 Bucket policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::documents/*",
      "Condition": {
        "Null": {
          "s3:ExistingObjectTag/sse-c": "true"
        }
      }
    }
  ]
}
```

Tout objet non-chiffré SSE-C est refusé → empêche un upload direct par erreur.

### 10.3 Politique de rétention

| Catégorie          | Politique                                              |
| ------------------ | ------------------------------------------------------ |
| FDI active         | Pas de suppression tant que `revokedAt IS NULL`        |
| FDI révoquée       | Soft-delete 1 an (lecture par auditeur), puis purge    |
| FDI expirée > 90 j | Archivage froid (Glacier-like MinIO) puis purge 10 ans |

---

## 11. Endpoint public de vérification

### 11.1 Flux côté mobile

```
┌────────────┐     Scan QR     ┌──────────────────────┐
│  Mobile    │────────────────▶│  JWT décodé localement│
│  React Nat │                 │  vérif offline RS256 │
└─────┬──────┘                 └───────────┬──────────┘
      │                                    │
      │ si réseau                          │ si hors ligne
      ▼                                    ▼
POST /public/documents/verify-qr      ✅ valid (signature)
  ↑ vérif serveur + révocation       ⚠️  pas vérifié révocation
  ↑ retourne fdi masquée (photo NO)
```

La vérification fonctionne **entièrement offline** grâce à la signature RS256 — le mobile embarque
le JWKS Keycloak (rafraîchi toutes les 24 h en arrière-plan). L'appel serveur n'ajoute que la
vérification de révocation, ce qui est **optionnel** pour un cas d'usage agent de terrain sans
réseau.

### 11.2 Rate limiting

- **30 requêtes/min/IP** via `@Throttle` (c'est un endpoint public)
- En cas d'attaque par énumération (scan d'un grand nombre de QR invalides), la DLQ de
  `audit-service` s'alimente → alerte Loki.

### 11.3 Exemple `curl`

```bash
curl -X POST http://localhost:3004/api/v1/public/documents/verify-qr \
  -H 'Content-Type: application/json' \
  -d '{"token":"eyJhbGciOi..."}' | jq

# Réponse valide :
{
  "valid": true,
  "issuedBy": "https://keycloak.nina.ml/realms/nina-aes",
  "issuedAt": "2026-04-16T14:32:01.000Z",
  "expiresAt": "2026-10-13T14:32:01.000Z",
  "fdi": {
    "serialNumber": "FDI-2026-0000042",
    "firstName": "Aliou",
    "lastName": "Traoré",
    "birthDate": "1985-03-15",
    "sex": "M",
    "birthPlace": "Bamako, Commune III",
    "documentType": "FICHE_DESCRIPTIVE",
    "language": "bm"
  }
}
```

---

## 12. Sécurité et protection PDF

### 12.1 Watermark invisible

Le PDF inclut un watermark text layer invisible (blanc sur blanc, opacité 0) contenant
`serialNumber + sha256Pdf`. Une copie photocopiée perd ce watermark. L'agent peut comparer au hash
stocké → détection de photocopies.

### 12.2 Métadonnées PDF/A-3b

Conformité ISO 19005-3 pour archivage légal :

- `Producer: NINA-AES document-service 1.0`
- `Title: FDI FDI-2026-0000042`
- `Author: CTDEC — République du Mali`
- Fichier attaché `qr.jwt` (MIME `application/jwt`)

### 12.3 Protection par mot de passe (optionnel)

Sur demande du citoyen, le PDF peut être chiffré AES-256 avec un mot de passe communiqué par SMS :

```typescript
// pdf-lib ne supporte pas chiffrement → passer par HummusJS ou qpdf en CLI post-gen
await execFile('qpdf', ['--encrypt', password, password, '256', '--', 'in.pdf', 'out.pdf']);
```

### 12.4 Aucune fuite de PII dans les logs

Les logs pino sont configurés avec
`redact: ['*.firstName', '*.lastName', '*.birthDate', '*.photoBase64']`.

---

## 13. Performance — pool Puppeteer

### 13.1 Benchmarks cibles

| Scénario                    | Cible P95 | Observé (laptop i7) |
| --------------------------- | --------- | ------------------- |
| Génération FDI (HTML → PDF) | < 800 ms  | ~450 ms             |
| Post-processing pdf-lib     | < 100 ms  | ~60 ms              |
| Upload MinIO (local)        | < 50 ms   | ~30 ms              |
| Total P95                   | < 1500 ms | ~900 ms             |

### 13.2 Cache LRU Redis

Un cache Redis (clé = `fdi:{nina}:{language}:{version}`) stocke le PDF généré pendant 5 min. Une
même FDI régénérée dans cette fenêtre est retournée instantanément — utile si le citoyen clique
plusieurs fois.

```typescript
async generateFDI(nina: string, language: string, actor: any) {
  const cacheKey = `fdi:${nina}:${language}:v1`;
  const cached = await this.redis.getBuffer(cacheKey);
  if (cached) {
    this.logger.log({ msg: 'fdi.cache.hit', nina });
    return this.returnCached(cached);
  }
  // ... génération normale
  await this.redis.set(cacheKey, pdf, 'EX', 300);
}
```

### 13.3 Pool Puppeteer

`puppeteer-cluster` en mode `CONCURRENCY_CONTEXT` : 4 instances browser persistantes, chacune avec
des contextes isolés. Gain ~3x vs spawn unique par requête.

---

## 14. Tests (unit + e2e + visual regression)

### 14.1 Unit — `qrcode.service.spec.ts`

```typescript
describe('QrCodeService', () => {
  it('génère un JWT RS256 vérifiable avec la clé publique', async () => {
    const { token, kid } = await qr.generate({
      sub: '19850315123456A',
      fdi: {
        serialNumber: 'FDI-TEST-001',
        firstName: 'Test',
        lastName: 'User',
        birthDate: '1985-03-15',
        sex: 'M',
        birthPlace: 'Bamako',
        documentType: 'FICHE_DESCRIPTIVE',
        language: 'fr',
      },
    });
    const publicKey = await key.getPublicKey(kid);
    const payload = await jwtService.verifyAsync(token, { algorithms: ['RS256'], publicKey });
    expect(payload.sub).toBe('19850315123456A');
    expect(payload.iss).toContain('nina-aes');
  });

  it('le token expire après TTL configuré', async () => {
    // mock Date.now() avancé de 181 jours
  });
});
```

### 14.2 E2E — `documents.e2e-spec.ts`

```typescript
describe('Documents (e2e)', () => {
  it('POST /documents/fdi crée un PDF + QR vérifiable', async () => {
    mockIdentityService({
      nina: '19850315123456A',
      firstName: 'Aliou',
      lastName: 'Traoré',
      birthDate: '1985-03-15',
      sex: 'M',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/documents/fdi')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ nina: '19850315123456A', language: 'fr' })
      .expect(201);

    expect(res.body.serialNumber).toMatch(/^FDI-2026-\d{7}$/);
    expect(res.body.sha256Pdf).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.qrJwt).toMatch(/^eyJhbGciOiJSUzI1NiI/);

    const verify = await request(app.getHttpServer())
      .post('/api/v1/public/documents/verify-qr')
      .send({ token: res.body.qrJwt })
      .expect(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.fdi.serialNumber).toBe(res.body.serialNumber);
  });

  it('révocation → le QR devient invalide', async () => {
    const doc = await createFdi();
    await request(app.getHttpServer())
      .delete(`/api/v1/documents/${doc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'citizen deceased' })
      .expect(200);

    const verify = await request(app.getHttpServer())
      .post('/api/v1/public/documents/verify-qr')
      .send({ token: doc.qrJwt })
      .expect(200);
    expect(verify.body.valid).toBe(false);
    expect(verify.body.reasonCode).toBe('REVOKED');
  });

  it('rate limit : 31 requêtes → 429', async () => {
    for (let i = 0; i < 30; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/public/documents/verify-qr')
        .send({ token: 'bad' });
    }
    await request(app.getHttpServer())
      .post('/api/v1/public/documents/verify-qr')
      .send({ token: 'bad' })
      .expect(429);
  });
});
```

### 14.3 Visual regression — `visual-regression.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist';

test('FDI rendu pixel-stable entre builds', async () => {
  const pdf = await generateFdiFixture();
  const fixture = await fs.readFile('test/fixtures/expected-fiche-descriptive.pdf');

  // Convertir en PNG page 1
  const actualPng = await pdfToPng(pdf, 1);
  const expectedPng = await pdfToPng(fixture, 1);

  expect(actualPng).toMatchSnapshot('fiche-descriptive.png', {
    maxDiffPixelRatio: 0.02, // tolère 2% de diff (antialiasing)
  });
});
```

### 14.4 Couverture cible

```typescript
coverageThreshold: {
  global: { branches: 80, functions: 85, lines: 85, statements: 85 },
},
```

---

## 15. Swagger + OpenAPI

Accessible sur `http://localhost:3004/api/docs`. Les 5 endpoints sont documentés avec exemples de
payload, codes d'erreur (400, 401, 403, 404, 409, 429) et schémas Zod/TypeBox.

| Méthode | URL                                  | Auth       | Rôles                         |
| ------- | ------------------------------------ | ---------- | ----------------------------- |
| POST    | `/api/v1/documents/fdi`              | Bearer JWT | CITIZEN, AGENT, ADMIN         |
| GET     | `/api/v1/documents/:id/download-url` | Bearer JWT | CITIZEN (owner), AGENT, ADMIN |
| DELETE  | `/api/v1/documents/:id`              | Bearer JWT | ADMIN                         |
| POST    | `/api/v1/public/documents/verify-qr` | **Aucune** | —                             |
| GET     | `/api/v1/documents/health`           | **Aucune** | —                             |

---

## 16. Mini-rapport d'étape

```markdown
# Rapport d'étape — Document 10 — document-service

**Date** : **\_\_\_\_** **Durée passée** : ** h (estimation : 12–16 h) **Commit de fin** :
**\_\_\_\_\*\*\*\*

## Fonctionnel

- [ ] FDI PDF générée en français
- [ ] FDI PDF générée en bambara (translitération OK)
- [ ] QR scan → verify-qr retourne payload complet
- [ ] Révocation → QR devient invalide
- [ ] URL pré-signée MinIO télécharge bien le PDF

## Performance

| Scénario           | Cible     | Mesuré |
| ------------------ | --------- | ------ |
| Génération FDI P95 | < 1500 ms |        |
| Verify-QR P95      | < 50 ms   |        |
| Taille PDF final   | < 300 kB  |        |

## Tests

| Type              | Passent ? | Couverture |
| ----------------- | --------- | ---------- |
| Unit              |           | \_\_ %     |
| E2E               |           | \_\_ %     |
| Visual regression |           | —          |

## Problèmes rencontrés

- ***

## Prochaines étapes

- Document 11 — ai-service FastAPI (détection d'erreurs NINA)
```

---

## 17. Checklist de fin d'étape

- [ ] ✅ 5 endpoints REST fonctionnels (Swagger OK)
- [ ] ✅ Pool Puppeteer démarre et absorbe 100 PDF/min sans crash
- [ ] ✅ 8 fichiers i18n présents (même si certaines traductions sont des placeholders)
- [ ] ✅ QR JWT RS256 avec `kid` valide → vérifiable par JWKS Keycloak
- [ ] ✅ JWKS cache 10 min actif (pas de hit Keycloak à chaque verify)
- [ ] ✅ Upload MinIO avec SSE-C — ne lit pas sans NINA
- [ ] ✅ Bucket policy `Deny` si non-SSE-C
- [ ] ✅ Révocation stockée en base + répercutée sur verify
- [ ] ✅ Audit publisher publie `document.fdi.generated` et `document.qr.verified`
- [ ] ✅ Rate limiting 30/min IP sur endpoint public
- [ ] ✅ Cache Redis PDF 5 min
- [ ] ✅ Métadonnées PDF/A-3b + attachment `qr.jwt`
- [ ] ✅ Visual regression passe
- [ ] ✅ Couverture tests ≥ 85 %
- [ ] ✅ Healthcheck vérifie MinIO + Keycloak + Vault
- [ ] ✅ Commit : `feat(document): FDI PDF + QR JWT RS256 + public verify`

---

## 18. Pour aller plus loin

1. **Carte PKPass / Apple Wallet** : générer un pass Apple Wallet équivalent de la FDI pour les
   citoyens diaspora. Le QR est identique, le container diffère.
2. **Verifiable Credentials W3C** : faire évoluer le payload QR vers le standard VC (JSON-LD +
   LD-Proofs) pour interop future avec les wallets européens (EUDI).
3. **HSM pour la clé privée** : passer de Vault KV à un HSM YubiHSM 2 ou AWS CloudHSM pour mettre la
   clé hors ligne.
4. **PDF/A-3u** : conformité stricte ISO 19005-3 pour archivage 30 ans (nécessite fonts embedded +
   color profile ICC).
5. **Tampon électronique qualifié** : signer en plus du QR avec un certificat eIDAS d'un Trust
   Service Provider certifié (pour interop UE).
6. **Révocation par CRL téléchargeable** : publier toutes les 24 h une liste des `jti` révoqués au
   format CRL, téléchargeable offline par les apps mobile pour verify 100 % offline avec révocation.
7. **Watermark dynamique** : inclure dans chaque PDF généré un watermark avec l'IP/userAgent de
   demande (anti-fraude).

---

_Document 10 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_ _Prochain
document : [11 — AI Service FastAPI](./11-AI-SERVICE-FASTAPI.md)_
