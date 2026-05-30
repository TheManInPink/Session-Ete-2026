# 10 — Backend : Document-Service (NestJS 11 + Puppeteer + QR JWT RS256)

> **Projet** : NINA-AES Platform · **Document** : 10/26 · **Bloc** : A (NINA Mali — P0) **Service**
> : `document-service` — Génération de la Fiche Descriptive Individuelle (FDI) au format PDF/A-3b,
> QR vérifiable hors ligne, archivage WORM MinIO. **Port** : `3004` · **Stack** : NestJS 11.1 ·
> Puppeteer 24 · pdf-lib 1.17 · Handlebars 4.7 · qrcode 1.5 · jose 5 · Vault Transit · MinIO 2025-11
> · PostgreSQL 18 · Prisma 7.6 · RabbitMQ 4.2 **Auteur** : Étudiant UQAR · **Date** : Avril 2026 ·
> **Durée estimée** : 12–16 h **Prérequis** :
> [07 — Identity Service](./07-BACKEND-IDENTITY-SERVICE.md) ·
> [08 — Auth Service](./08-BACKEND-AUTH-SERVICE.md) ·
> [09 — Audit Service](./09-BACKEND-AUDIT-SERVICE.md) ·
> [05 — Docker Compose](./05-INFRASTRUCTURE-DOCKER-COMPOSE.md) (MinIO + Vault disponibles) **ADR
> liés** : [ADR-006 — JWT RS256 pour QR](./adr/ADR-006-jwt-rs256-qr-code.md) ·
> [ADR-026 — Clé QR via Vault Transit](./adr/ADR-026-vault-transit-qr-signing.md)

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Pourquoi un QR JWT RS256 ? — La faille du NINA brut](#2-pourquoi-un-qr-jwt-rs256)
3. [Technologies utilisées (versions avril 2026)](#3-technologies-utilisées-versions-avril-2026)
4. [Architecture du microservice document-service](#4-architecture-du-microservice-document-service)
5. [Schéma Prisma — `Document`, `DocumentRevocation`, `DocumentAccessLog`](#5-schéma-prisma)
6. [Structure de dossiers](#6-structure-de-dossiers)
7. [Payload QR JWT RS256 — schéma détaillé](#7-payload-qr-jwt-rs256--schéma-détaillé)
8. [Template HTML Handlebars — Fiche Descriptive A4](#8-template-html-handlebars--fiche-descriptive-a4)
9. [Implémentation NestJS — Code intégral commenté](#9-implémentation-nestjs--code-intégral-commenté)
10. [Stockage MinIO (S3) avec versioning + Object Lock WORM](#10-stockage-minio-s3-avec-versioning--object-lock-worm)
11. [Endpoint public de vérification du QR (offline-friendly)](#11-endpoint-public-de-vérification-du-qr-offline-friendly)
12. [Sécurité — protection PDF, anti-fraude, OWASP](#12-sécurité--protection-pdf-anti-fraude-owasp)
13. [Performance — pool Puppeteer, cache, métriques](#13-performance--pool-puppeteer-cache-métriques)
14. [Tests (unit + e2e + visual regression)](#14-tests-unit--e2e--visual-regression)
15. [Swagger + OpenAPI 3.1](#15-swagger--openapi-31)
16. [Mini-rapport d'étape (template)](#16-mini-rapport-détape-template)
17. [Checklist de fin d'étape](#17-checklist-de-fin-détape)
18. [Pour aller plus loin](#18-pour-aller-plus-loin)

---

## 1. Objectif pédagogique

Construire le service qui **matérialise** l'identité numérique NINA sous forme d'un **PDF officiel
vérifiable hors ligne** : la **Fiche Descriptive Individuelle (FDI)**, équivalent numérique signé du
document papier A4 actuellement délivré par le **CTDEC** (Centre de Traitement des Données de l'État
Civil, rue Baba Diarra BP 215, Bamako).

La FDI est :

- **Imprimable** sur papier A4 standard (rendu pixel-stable),
- **Signée cryptographiquement** via un QR code contenant un JWT RS256 — **pas** le NINA en clair,
- **Vérifiable hors ligne** par n'importe quelle application mobile (scan QR + clé publique
  embarquée ou JWKS cache 24 h),
- **Multilingue** : FR · BM (bamanankan) · SNK (soninké) · FF (peul/fulfulde) — extensible aux 4
  autres langues nationales (Tamasheq, Hausa, Mossi, Djerma) pour le Bloc B,
- **Auditée** : chaque génération et chaque vérification publie un événement vers `audit-service`
  (chaîne Merkle, cf. document 09).

Ce service joue le rôle de **carte d'identité numérique portable** en attendant la carte biométrique
physique du Bloc F (qui n'arrive qu'en P3, prioritairement après l'interop AES).

### Ce que tu vas apprendre

| Compétence                            | Niveau        | Application au projet                                     |
| ------------------------------------- | ------------- | --------------------------------------------------------- |
| Génération PDF serveur (Puppeteer)    | Avancé        | Chromium headless, rendu HTML → PDF/A-3b                  |
| pdf-lib (post-processing)             | Avancé        | Métadonnées PDF/A, watermark, attachment du JWT brut      |
| Templates Handlebars + i18next        | Intermédiaire | Internationalisation 8 langues, helpers NINA              |
| JWT RS256 + clé via Vault Transit     | Expert        | Signature côté Vault (clé jamais exfiltrée), `kid` JWKS   |
| QR code à correction d'erreurs élevée | Intermédiaire | Niveau H (30 % redondance) pour résister à l'usure papier |
| MinIO S3 + Object Lock WORM           | Avancé        | Rétention compliance 10 ans, immutabilité prouvable       |
| Pool Puppeteer (`puppeteer-cluster`)  | Avancé        | 4 contextes browser, 100 PDF/min soutenu                  |
| Visual regression (pdf → png → diff)  | Intermédiaire | Détecte une régression de mise en page entre 2 commits    |
| Révocation par `jti` + cache Redis    | Avancé        | Liste de révocation O(1), TTL aligné sur expiry JWT       |

### Livrables à la fin de ce document

- **6 endpoints REST** sur `http://localhost:3004/api/v1/documents/*` (+ `/health`)
- **Génération PDF** de la FDI (A4, 1 page recto-verso) avec QR au coin inférieur droit
- **Signature JWT RS256 par Vault Transit** (clé `nina-qr-signing` jamais exfiltrée du Vault)
- **Template Handlebars** multi-langues (4 langues livrées en P0 : FR, BM, SNK, FF)
- **Upload MinIO** bucket `fiches` avec versioning + Object Lock 10 ans
- **URL pré-signée** (expiry 1 h par défaut, configurable jusqu'à 7 j)
- **Endpoint public** `/public/documents/verify-qr` sans auth (rate-limit IP 30/min)
- **Audit** de chaque génération / révocation / vérification (RabbitMQ → audit-service)
- **Tests** ≥ 85 % de couverture (unit + e2e + 1 test de régression visuelle)
- **Swagger** OpenAPI 3.1 documentant les 6 endpoints

---

## 2. Pourquoi un QR JWT RS256

### 2.1 Le QR code actuel du CTDEC : une faille critique

Le document papier émis aujourd'hui par le CTDEC contient un QR code qui encode **uniquement le NINA
brut** (15 caractères). Concrètement :

```text
QR scanné aujourd'hui → "19850315123456A"
```

C'est strictement équivalent à imprimer le NINA en chiffres et à demander à l'agent de le retaper.
Cela ouvre **trois vecteurs d'attaque** :

| Attaque              | Faisabilité aujourd'hui | Impact                                   |
| -------------------- | ----------------------- | ---------------------------------------- |
| Copie / réimpression | Trivial (photocopieuse) | Faux papier vérifié comme vrai en mairie |
| Falsification champ  | Triviale (Photoshop)    | NOM/PRÉNOMS modifiés, QR inchangé        |
| Substitution photo   | Triviale                | Identité d'un tiers prise sur la photo   |

Aucun mécanisme de signature ne permet de prouver, à partir du seul QR, que :

1. la fiche a bien été émise par le CTDEC à un instant T,
2. les champs (NOM, PRÉNOMS, naissance, etc.) **n'ont pas été altérés** depuis l'émission,
3. le document n'a pas été révoqué (décès, fraude, etc.).

### 2.2 Réponse — JWT RS256 contenant un hash des données + signature Vault

Le QR de la nouvelle FDI encode un **JWT signé RS256** (3072 bits) dont le payload est :

- Le NINA (`sub`),
- Le **hash SHA-256** de la totalité des champs imprimés (`fdi.hash`) → toute altération visuelle
  est détectable,
- Un `biometricHash` (placeholder en P0, valeur réelle en Bloc F),
- Un `jti` unique (identifiant du JWT) pour la révocation,
- `iat`, `exp` (180 jours), `iss` (`urn:nina-aes:ctdec-bamako`),
- Un `kid` (key id) qui permet à un vérificateur de retrouver la bonne clé publique dans le JWKS.

La signature est calculée **par Vault** via l'API `transit/sign/nina-qr-signing` : la **clé privée
ne quitte jamais le coffre-fort**. Le service `document-service` ne fait que présenter le payload
hashé et obtenir la signature.

### 2.3 Propriétés cryptographiques garanties

| Propriété            | Mécanisme                                                          |
| -------------------- | ------------------------------------------------------------------ |
| Authenticité         | Signature RS256 par clé Vault `nina-qr-signing` (issuer CTDEC)     |
| Intégrité des champs | `fdi.hash = SHA-256(canonical_json(fdi))` inclus dans le JWT       |
| Non-rejouabilité     | `jti` unique + révocation par liste Redis                          |
| Expiration           | `exp` à 180 jours (FDI à renouveler annuellement, marge 50 %)      |
| Rotation de clé      | `kid` JWKS → vérifieur récupère la bonne clé publique              |
| Vérification offline | JWKS cache 24 h sur mobile + clé publique embarquée comme fallback |
| Détection de copie   | Watermark dynamique (IP + UA de la demande) en filigrane PDF       |

### 2.4 Pourquoi RS256 et pas Ed25519 ?

`audit-service` utilise Ed25519 (cf. doc 09 §12) car la signature est interne, jamais scannée par un
mobile. Pour le QR :

- **RS256** est le seul algorithme **garanti supporté par 100 % des bibliothèques JWT mobiles**
  (Android, iOS, Flutter, React Native) en 2026.
- Les payloads QR restent compacts (~600 octets) ce qui tient confortablement dans un QR niveau H.
- L'écosystème Keycloak / Vault Transit le supporte nativement.

---

## 3. Technologies utilisées (versions avril 2026)

| Dépendance                 | Version   | Rôle                                                 |
| -------------------------- | --------- | ---------------------------------------------------- |
| `@nestjs/common`           | `11.1.18` | Core NestJS                                          |
| `@nestjs/core`             | `11.1.18` | Runtime                                              |
| `@nestjs/platform-express` | `11.1.18` | Adaptateur HTTP                                      |
| `@nestjs/config`           | `4.1.2`   | `.env` validé via Zod                                |
| `@nestjs/swagger`          | `11.2.0`  | OpenAPI 3.1                                          |
| `@nestjs/terminus`         | `11.1.0`  | Healthchecks (MinIO, Vault, Postgres)                |
| `@nestjs/microservices`    | `11.1.18` | Publisher AMQP vers audit-service                    |
| `@nestjs/schedule`         | `6.1.0`   | Cron : nettoyage cache, rafraîchissement JWKS        |
| `@nestjs/throttler`        | `6.5.0`   | Rate-limit endpoint public `/verify-qr`              |
| `@nina-aes/database`       | workspace | Singleton PrismaClient (cf. packages/database)       |
| `@nina-aes/vault-client`   | workspace | Wrapper Vault (`transit/sign`, `kv/get`)             |
| `@nina-aes/auth-guards`    | workspace | `JwtAuthGuard`, `RolesGuard`, `ClerkOwnerGuard`      |
| `@nina-aes/shared-types`   | workspace | DTOs `FdiPayload`, `QrPayload`, enums                |
| `puppeteer`                | `24.10.0` | Chromium headless                                    |
| `puppeteer-cluster`        | `0.24.0`  | Pool de contextes browser                            |
| `pdf-lib`                  | `1.17.1`  | Post-processing PDF/A, attachments, métadonnées      |
| `qrcode`                   | `1.5.4`   | Rendu QR niveau H en SVG/PNG                         |
| `handlebars`               | `4.7.8`   | Moteur de template HTML                              |
| `i18next`                  | `25.0.2`  | Internationalisation 8 langues                       |
| `i18next-fs-backend`       | `2.6.0`   | Charge les `.json` depuis `src/i18n/`                |
| `jose`                     | `5.10.0`  | Construction JWT (header + payload, signature Vault) |
| `minio`                    | `8.0.7`   | Client S3-compatible (upload, presign, object lock)  |
| `ioredis`                  | `5.6.0`   | Cache PDF + révocations                              |
| `prom-client`              | `15.1.3`  | Métriques Prometheus (`pdf_generated_total`, etc.)   |
| `zod`                      | `3.24.4`  | Validation DTOs                                      |
| `pino`                     | `9.7.0`   | Logger structuré                                     |
| `nestjs-pino`              | `4.4.0`   | Intégration pino + NestJS                            |
| `helmet`                   | `8.1.0`   | Hardening HTTP                                       |

**Dev / Tests** :

| Dépendance         | Version   | Rôle                          |
| ------------------ | --------- | ----------------------------- |
| `jest`             | `30.0.4`  | Tests unitaires               |
| `@nestjs/testing`  | `11.1.18` | Module de test NestJS         |
| `supertest`        | `7.1.4`   | Tests HTTP e2e                |
| `@playwright/test` | `1.50.1`  | Visual regression             |
| `pdfjs-dist`       | `4.10.38` | PDF → PNG côté tests          |
| `testcontainers`   | `10.16.0` | MinIO + Vault éphémères en CI |

---

## 4. Architecture du microservice document-service

### 4.1 Diagramme PlantUML

```plantuml
@startuml
!theme plain
title document-service — flux de génération FDI + vérification QR

actor "Citoyen ou Agent" as User
participant "API Gateway\n(Caddy/Traefik)" as GW
box "document-service (3004)" #LightYellow
  participant "DocumentsController" as Ctrl
  participant "FdiService" as Fdi
  participant "TemplateService\n(Handlebars + i18n)" as Tpl
  participant "QrSignerService\n(Vault Transit)" as Qr
  participant "PdfGeneratorService\n(Puppeteer pool)" as Pdf
  participant "StorageService\n(MinIO S3)" as S3
  participant "RevocationService\n(Redis)" as Rev
end box
database "PostgreSQL\nDocument" as DB
queue "RabbitMQ\naudit.events" as MQ
participant "Vault\ntransit/sign" as Vault
participant "MinIO\nbucket fiches" as Minio

User -> GW : POST /documents/fdi {nina, language}
GW -> Ctrl : JWT vérifié (auth-service)
Ctrl -> Fdi : generate(nina, lang, requesterId)
Fdi -> Fdi : fetch citoyen via identity-service (gRPC)
Fdi -> Tpl : render(citoyen, lang) → HTML
Fdi -> Qr : sign(payload) — payload contient SHA-256(fdi)
Qr -> Vault : POST transit/sign/nina-qr-signing
Vault --> Qr : signature base64url
Qr --> Fdi : token JWT (header.payload.signature)
Fdi -> Pdf : html + qrDataUrl → PDF (Puppeteer)
Pdf --> Fdi : Buffer PDF/A-3b
Fdi -> S3 : putObject + ObjectLock 10y
S3 -> Minio : PUT /fiches/<nina>/<jti>.pdf
Fdi -> DB : INSERT Document (jti, sha256, kid, ...)
Fdi -> MQ : publish "document.fdi.generated"
Fdi --> Ctrl : {url presigned, jti, expiresAt}
Ctrl --> User : 201 Created

== Vérification offline ==
User -> GW : POST /public/documents/verify-qr {token}
GW -> Ctrl : pas d'auth (rate-limit IP)
Ctrl -> Qr : verify(token) — JWKS + fdi.hash + jti
Qr -> Rev : isRevoked(jti) ?
Rev --> Qr : false
Qr --> Ctrl : {valid, fdi: { nina, name, ... }}
Ctrl -> MQ : publish "document.qr.verified" (asynchrone)
Ctrl --> User : 200 OK
@enduml
```

### 4.2 Position dans la cartographie des 11 microservices

| #   | Service                | Port | Consomme                     | Émet                                                           |
| --- | ---------------------- | ---- | ---------------------------- | -------------------------------------------------------------- |
| 1   | identity-service       | 3001 | —                            | citizen.created, citizen.updated                               |
| 2   | auth-service           | 3002 | —                            | auth.login, auth.mfa.success                                   |
| 3   | ai-service             | 3003 | citizen.created              | nina.scored                                                    |
| 4   | **document-service**   | 3004 | citizen (gRPC), Vault, MinIO | document.fdi.generated, document.revoked, document.qr.verified |
| 5   | notification-service   | 3005 | document.fdi.generated       | notification.sent                                              |
| 6   | interop-service        | 3006 | —                            | interop.lookup                                                 |
| 7   | audit-service          | 3007 | **toutes**                   | —                                                              |
| 8   | appointment-service    | 3008 | document.fdi.generated       | appointment.created                                            |
| 9   | anticorruption-service | 3009 | document.qr.verified         | sigac.flag                                                     |
| 10  | governance-service     | 3010 | —                            | gov.message                                                    |
| 11  | vulnerability-service  | 3011 | —                            | vulnerability.assistance                                       |

`document-service` est **consommateur** d'identity (lecture) + Vault (signature) + MinIO (stockage),
**producteur** vers RabbitMQ (audit + notification).

---

## 5. Schéma Prisma

Fichier `packages/database/prisma/schema.prisma` (extrait — le schéma complet est dans le document
06).

```prisma
// ─────────────────────────────────────────────────────────────
// Document — FDI émise (1 ligne par PDF généré, append-only)
// ─────────────────────────────────────────────────────────────
model Document {
  id              String   @id @default(uuid(7))
  jti             String   @unique               // identifiant du JWT QR — clé de révocation
  nina            String                          // NINA du citoyen (lookup via identity)
  type            DocumentType @default(FICHE_DESCRIPTIVE)
  serialNumber    String   @unique                // FDI-2026-0000123 (numéro de souche imprimé)
  language        String                          // ISO 639-3 (fra, bam, snk, fuv)
  sha256Html      String                          // hash du HTML source (canonical)
  sha256Pdf       String                          // hash du PDF final
  kid             String                          // key id Vault qui a signé le QR
  minioBucket     String   @default("fiches")
  minioObjectKey  String                          // <nina>/<jti>.pdf
  minioVersionId  String                          // versioning MinIO
  issuedAt        DateTime @default(now())
  expiresAt       DateTime                        // iat + 180 jours
  issuedBy        String                          // userId Keycloak (agent ou self-service)
  issuedFromIp    String                          // IP source (anti-fraude)
  watermark       String                          // SHA-256(ip|userAgent|jti) court
  createdAt       DateTime @default(now())

  revocation      DocumentRevocation?
  accessLogs      DocumentAccessLog[]

  @@index([nina, type])
  @@index([issuedAt])
  @@map("documents")
}

enum DocumentType {
  FICHE_DESCRIPTIVE
  EXTRAIT_NAISSANCE        // futur — pas en P0
  CERTIFICAT_NATIONALITE   // futur — pas en P0
}

// ─────────────────────────────────────────────────────────────
// Révocation — 1 ligne par document révoqué (ne supprime jamais)
// ─────────────────────────────────────────────────────────────
model DocumentRevocation {
  id          String   @id @default(uuid(7))
  documentId  String   @unique
  document    Document @relation(fields: [documentId], references: [id])
  reason      RevocationReason
  reasonText  String?                            // texte libre optionnel
  revokedAt   DateTime @default(now())
  revokedBy   String                              // userId qui a révoqué

  @@map("document_revocations")
}

enum RevocationReason {
  DECEASED              // décès du citoyen
  FRAUD_DETECTED        // fraude détectée
  DATA_CORRECTION       // données corrigées (ré-émission)
  CITIZEN_REQUEST       // demande explicite
  OTHER
}

// ─────────────────────────────────────────────────────────────
// Journal d'accès — chaque GET download + chaque verify-qr
// ─────────────────────────────────────────────────────────────
model DocumentAccessLog {
  id           String   @id @default(uuid(7))
  documentId   String?
  document     Document? @relation(fields: [documentId], references: [id])
  action       AccessAction
  jti          String?                            // pour verify-qr sans documentId
  ipAddress    String
  userAgent    String?
  result       AccessResult
  reasonCode   String?                            // VALID, EXPIRED, REVOKED, HASH_MISMATCH, …
  occurredAt   DateTime @default(now())

  @@index([jti])
  @@index([occurredAt])
  @@map("document_access_logs")
}

enum AccessAction {
  DOWNLOAD
  VERIFY_QR
}

enum AccessResult {
  SUCCESS
  FAILURE
}
```

### 5.1 Triggers Postgres (append-only sur révocations)

```sql
-- packages/database/prisma/migrations/_triggers/document_revocations_immutable.sql
CREATE OR REPLACE FUNCTION block_revocation_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_revocations is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_revocations
  BEFORE UPDATE OR DELETE ON document_revocations
  FOR EACH ROW EXECUTE FUNCTION block_revocation_mutation();
```

---

## 6. Structure de dossiers

```text
services/document-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.schema.ts                 # Zod
│   │   └── puppeteer.config.ts
│   ├── documents/
│   │   ├── documents.controller.ts       # 4 endpoints privés
│   │   ├── public-documents.controller.ts# 1 endpoint public (/verify-qr)
│   │   ├── documents.service.ts
│   │   ├── dto/
│   │   │   ├── generate-fdi.dto.ts
│   │   │   ├── verify-qr.dto.ts
│   │   │   └── revoke.dto.ts
│   │   └── interfaces/
│   │       └── fdi-payload.interface.ts
│   ├── fdi/
│   │   ├── fdi.service.ts                # orchestrateur génération
│   │   ├── canonical.ts                  # JSON canonique stable (RFC 8785-like)
│   │   ├── serial-number.service.ts      # FDI-YYYY-XXXXXXX
│   │   └── watermark.ts
│   ├── pdf/
│   │   ├── pdf-generator.service.ts      # pool Puppeteer
│   │   ├── pdf-postprocess.service.ts    # pdf-lib (PDF/A + attachment JWT)
│   │   └── browser-pool.provider.ts
│   ├── qr/
│   │   ├── qr-signer.service.ts          # Vault transit/sign + jose
│   │   ├── qr-verifier.service.ts        # JWKS + hash + révocation
│   │   ├── jwks.service.ts               # cache 24 h
│   │   └── revocation.service.ts         # Redis SET
│   ├── templates/
│   │   ├── template.service.ts           # Handlebars + i18n + helpers
│   │   ├── helpers/
│   │   │   ├── format-nina.helper.ts     # "1 12 34 5 67 789 012 A"
│   │   │   ├── format-date.helper.ts
│   │   │   └── biometric-placeholder.helper.ts
│   │   └── files/
│   │       ├── fiche-descriptive.hbs
│   │       ├── fiche-descriptive.css
│   │       └── partials/
│   │           ├── header-ctdec.hbs
│   │           ├── photo-block.hbs
│   │           ├── identity-block.hbs
│   │           ├── place-hierarchy.hbs    # 8 niveaux
│   │           ├── parents-block.hbs
│   │           ├── justification-block.hbs
│   │           └── qr-footer.hbs
│   ├── i18n/
│   │   ├── fr.json
│   │   ├── bm.json                       # bamanankan
│   │   ├── snk.json                      # soninké
│   │   └── fuv.json                      # peul / fulfulde
│   ├── storage/
│   │   ├── minio.service.ts              # putObject avec ObjectLock + presign
│   │   └── minio.config.ts
│   ├── audit/
│   │   └── audit-publisher.service.ts    # RabbitMQ → audit.events
│   ├── identity-client/
│   │   └── identity.client.ts            # gRPC vers identity-service (port 3001)
│   ├── vault/
│   │   └── vault.module.ts               # ré-export @nina-aes/vault-client
│   ├── health/
│   │   └── health.controller.ts          # MinIO + Vault + Postgres + Identity
│   └── metrics/
│       └── metrics.controller.ts         # /metrics Prometheus
├── test/
│   ├── unit/
│   │   ├── qr-signer.service.spec.ts
│   │   ├── canonical.spec.ts
│   │   ├── template.service.spec.ts
│   │   └── revocation.service.spec.ts
│   ├── e2e/
│   │   ├── documents.e2e-spec.ts
│   │   └── verify-qr.e2e-spec.ts
│   ├── visual/
│   │   └── visual-regression.spec.ts
│   └── fixtures/
│       ├── citizen.fixture.json
│       └── expected-fiche-descriptive.pdf
├── prisma/                               # juste les triggers spécifiques
├── package.json
├── tsconfig.json
└── README.md
```

---

## 7. Payload QR JWT RS256 — schéma détaillé

### 7.1 Header

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "nina-qr-2026-04"
}
```

`kid` correspond au nom de la clé Vault dans `transit/keys/nina-qr-signing` + le numéro de version.
Le vérificateur l'utilise pour aller chercher la bonne clé publique dans le JWKS exposé sur
`https://auth.nina-aes.ml/.well-known/jwks-qr.json`.

### 7.2 Payload (claims)

```typescript
// services/document-service/src/qr/qr-payload.interface.ts
export interface QrPayload {
  // Standard JWT
  iss: string; // "urn:nina-aes:ctdec-bamako"
  sub: string; // NINA (15 caractères) — sujet du document
  jti: string; // UUID v7 — identifiant unique du JWT (clé révocation)
  iat: number; // émission (epoch seconds)
  nbf: number; // not-before = iat
  exp: number; // expiry = iat + 15552000 (180 j)
  aud: string[]; // ["urn:nina-aes:verifier"]

  // Spécifiques FDI
  fdi: {
    serialNumber: string; // FDI-2026-0000123
    type: 'FICHE_DESCRIPTIVE';
    language: string; // fra | bam | snk | fuv
    hash: string; // SHA-256(canonical_json(fdiData)) — détection altération
    issuedAt: string; // ISO 8601 (lisible humain)
    documentId: string; // UUID v7 — id en base
  };

  // Données minimales lisibles offline (sans appel base)
  // Tout est aussi dans `fdi.hash` pour vérifier qu'elles n'ont pas été modifiées
  citizen: {
    nina: string;
    firstName: string;
    lastName: string;
    birthDate: string; // ISO 8601
    sex: 'M' | 'F';
    birthPlace: string; // commune seulement (PII minimisé)
  };

  // Placeholder Bloc F — vide en P0, hash réel quand biométrie active
  biometricHash: string | null;

  // Watermark anti-fraude (court, non-PII)
  wm: string; // 12 premiers caractères de SHA-256(ip|userAgent|jti)
}
```

### 7.3 Taille et niveau de QR

| Élément                 | Valeur typique                          |
| ----------------------- | --------------------------------------- |
| Header base64url        | ~80 caractères                          |
| Payload base64url       | ~550 caractères                         |
| Signature RSA 3072      | 512 octets → 684 caractères base64url   |
| **Total JWT**           | **~1 320 caractères**                   |
| Niveau de correction QR | **H (30 %)** — résiste à pliage / usure |
| Taille QR rendu (1 cm²) | ~600 × 600 px sur le PDF                |

Un niveau de correction H impose une matrice ~57×57 modules. C'est confortable sur un QR de 4 cm de
côté à 300 DPI.

### 7.4 Pourquoi inclure `citizen` ET `fdi.hash` ?

- `citizen` permet la **lecture offline** (ex. agent en brousse sans réseau).
- `fdi.hash` permet de **détecter** si le citoyen affiché à l'écran ne correspond pas à ce qui est
  effectivement imprimé sur le papier (cas d'un faux papier avec QR authentique). Le vérificateur
  recalcule `SHA-256(canonical_json(citizen + serialNumber + …))` et compare.

### 7.5 Pourquoi `citizen` est-il minimisé ?

Pas d'adresse, pas de profession, pas de noms des parents : ce sont des données PII secondaires qui
peuvent évoluer (déménagement, mariage) et qui n'ont pas leur place dans un jeton signé valide 180
jours. Le PDF imprimé les contient, et leur intégrité est protégée par `fdi.hash`.

---

## 8. Template HTML Handlebars — Fiche Descriptive A4

### 8.1 `templates/files/fiche-descriptive.hbs` (extrait)

```handlebars
<!DOCTYPE html>
<html lang="{{language}}">
<head>
  <meta charset="UTF-8" />
  <title>FDI — {{citizen.nina}}</title>
  <link rel="stylesheet" href="./fiche-descriptive.css" />
</head>
<body>
  {{> header-ctdec t=t}}

  <main class="fdi">
    <section class="top-band">
      <div class="serial">
        <strong>{{t "fdi.serial.label"}}</strong>
        <span class="serial-value">{{document.serialNumber}}</span>
        <span class="serial-date">{{formatDate document.issuedAt language}}</span>
      </div>
      <div class="document-id">
        <small>{{t "fdi.documentId"}} {{document.id}}</small>
      </div>
    </section>

    <h1 class="fdi-title">{{t "fdi.title"}}</h1>

    <section class="identity-row">
      {{> photo-block citizen=citizen}}
      {{> identity-block citizen=citizen t=t formatNina=formatNina}}
    </section>

    <section class="places">
      <h2 class="section-title">{{t "fdi.birthPlace"}}</h2>
      {{> place-hierarchy place=citizen.birthPlace t=t}}

      <h2 class="section-title">{{t "fdi.residence"}}</h2>
      {{> place-hierarchy place=citizen.residence t=t}}
    </section>

    <section class="parents">
      <h2 class="section-title">{{t "fdi.parents"}}</h2>
      {{> parents-block parents=citizen.parents t=t}}
    </section>

    {{> justification-block document=document t=t}}

    <footer class="fdi-footer">
      <img src="data:image/svg+xml;base64,{{coatOfArmsBase64}}"
           class="coat-of-arms" alt="" />
      <div class="signature-block">
        <p>{{t "fdi.issuedOn"}} <strong>{{formatDate document.issuedAt language}}</strong></p>
        <p class="ctdec-signature">CTDEC — Bamako</p>
      </div>
      {{> qr-footer qrDataUrl=qrDataUrl document=document}}
    </footer>

    <div class="watermark">{{document.watermark}}</div>
  </main>
</body>
</html>
```

### 8.2 Partial `partials/identity-block.hbs`

```handlebars
<div class='identity'>
  <dl>
    <dt>{{t 'fdi.nina'}}</dt>
    <dd class='nina-formatted'>{{formatNina citizen.nina}}</dd>

    <dt>{{t 'fdi.lastName'}}</dt>
    <dd>{{citizen.lastName}}</dd>

    <dt>{{t 'fdi.firstName'}}</dt>
    <dd>{{citizen.firstName}}</dd>

    <dt>{{t 'fdi.birthDate'}}</dt>
    <dd>{{formatDate citizen.birthDate language}}</dd>

    <dt>{{t 'fdi.sex'}}</dt>
    <dd>{{t (concat 'fdi.sex.' citizen.sex)}}</dd>

    <dt>{{t 'fdi.matrimonial'}}</dt>
    <dd>{{t (concat 'fdi.matrimonial.' citizen.matrimonialStatus)}}</dd>

    <dt>{{t 'fdi.profession'}}</dt>
    <dd>{{citizen.profession}}</dd>
  </dl>
</div>
```

### 8.3 Partial `partials/place-hierarchy.hbs` (8 niveaux)

```handlebars
<table class='place-hierarchy'>
  <tr>
    <td>{{t 'fdi.country.code'}}</td><td>{{place.countryCode}}</td>
    <td>{{t 'fdi.country'}}</td><td>{{place.country}}</td>
  </tr>
  <tr>
    <td>{{t 'fdi.region'}}</td><td>{{place.region}}</td>
    <td>{{t 'fdi.cercle'}}</td><td>{{place.cercle}}</td>
  </tr>
  <tr>
    <td>{{t 'fdi.arrondissement'}}</td><td>{{place.arrondissement}}</td>
    <td>{{t 'fdi.commune'}}</td><td>{{place.commune}}</td>
  </tr>
  <tr>
    <td>{{t 'fdi.quartier'}}</td><td>{{place.quartier}}</td>
    <td>{{t 'fdi.fraction'}}</td><td>{{place.fraction}}</td>
  </tr>
  <tr>
    <td>{{t 'fdi.hameau'}}</td><td>{{place.hameau}}</td>
    <td>{{t 'fdi.secteur'}}</td><td>{{place.secteur}}</td>
  </tr>
</table>
```

### 8.4 Partial `partials/qr-footer.hbs`

```handlebars
<div class='qr-zone'>
  <img src='{{qrDataUrl}}' alt='QR FDI' width='120' height='120' />
  <small class='qr-instructions'>
    {{t 'fdi.qr.scanInstructions'}}<br />
    <code>{{document.jti}}</code>
  </small>
</div>
```

### 8.5 CSS `fiche-descriptive.css` (essence)

```css
@page {
  size: A4;
  margin: 14mm 12mm;
}

body {
  font-family: 'Noto Sans', Arial, sans-serif;
  color: #111;
  font-size: 10pt;
  margin: 0;
}

.fdi {
  display: grid;
  grid-template-rows: auto auto 1fr auto auto auto;
  gap: 6mm;
}

.identity-row {
  display: grid;
  grid-template-columns: 50mm 1fr;
  gap: 8mm;
  align-items: start;
}

.nina-formatted {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 13pt;
  letter-spacing: 0.5px;
}

.place-hierarchy {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.place-hierarchy td {
  border: 0.4pt solid #999;
  padding: 1.5mm;
}

.qr-zone {
  position: absolute;
  bottom: 14mm;
  right: 12mm;
  text-align: center;
}

.watermark {
  position: absolute;
  bottom: 5mm;
  right: 5mm;
  font-size: 6pt;
  color: #bbb;
  font-family: monospace;
}

.fdi-title {
  text-align: center;
  font-size: 14pt;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  border-bottom: 1pt solid #000;
  padding-bottom: 3mm;
}
```

### 8.6 Fichier i18n `i18n/fr.json` (extrait)

```json
{
  "fdi": {
    "title": "Fiche descriptive individuelle",
    "serial": { "label": "N° de souche :" },
    "documentId": "Identifiant fiche :",
    "nina": "NINA",
    "lastName": "Nom",
    "firstName": "Prénom(s)",
    "birthDate": "Date de naissance",
    "sex": { "M": "Homme", "F": "Femme" },
    "matrimonial": {
      "SINGLE": "Célibataire",
      "MARRIED": "Marié(e)",
      "DIVORCED": "Divorcé(e)",
      "WIDOWED": "Veuf / Veuve"
    },
    "profession": "Profession",
    "birthPlace": "Lieu de naissance",
    "residence": "Lieu de résidence",
    "country": "Pays",
    "country.code": "Code pays",
    "region": "Région",
    "cercle": "Cercle",
    "arrondissement": "Arrondissement",
    "commune": "Commune",
    "quartier": "Quartier / Village",
    "fraction": "Fraction",
    "hameau": "Hameau",
    "secteur": "Secteur",
    "parents": "Parents",
    "issuedOn": "Fait le",
    "qr": {
      "scanInstructions": "Scannez ce QR pour vérifier l'authenticité"
    }
  }
}
```

> ⚠️ Pour les 3 autres langues (BM, SNK, FUV), le squelette de clés est identique. Le texte est
> traduit avec un linguiste local : ne jamais utiliser de traduction machine pour un document légal
> officiel. En P0, livrer FR + BM ; SNK + FUV peuvent rester comme placeholders à compléter en
> Sprint 5 (cf. doc 26).

---

## 9. Implémentation NestJS — Code intégral commenté

### 9.1 `main.ts`

```typescript
// services/document-service/src/main.ts
/**
 * @file        main.ts
 * @description Bootstrap du microservice document-service (port 3004).
 *              Active Swagger, Helmet, validation Zod, logger pino.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DocumentExceptionFilter } from './documents/document-exception.filter';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: false })); // Swagger nécessite CSP relax
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new DocumentExceptionFilter());
  app.enableCors({ origin: ['https://citoyen.nina-aes.ml'], credentials: true });
  setupSwagger(app);
  await app.listen(3004);
  app.get(Logger).log({ port: 3004 }, 'document-service ready');
}
bootstrap();
```

### 9.2 `app.module.ts`

```typescript
// services/document-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { envSchema } from './config/env.schema';
import { DocumentsModule } from './documents/documents.module';
import { PdfModule } from './pdf/pdf.module';
import { QrModule } from './qr/qr.module';
import { TemplateModule } from './templates/template.module';
import { StorageModule } from './storage/storage.module';
import { AuditPublisherModule } from './audit/audit-publisher.module';
import { IdentityClientModule } from './identity-client/identity-client.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => envSchema.parse(env),
    }),
    LoggerModule.forRoot({ pinoHttp: { redact: ['req.headers.authorization'] } }),
    ScheduleModule.forRoot(),
    TerminusModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    DocumentsModule,
    PdfModule,
    QrModule,
    TemplateModule,
    StorageModule,
    AuditPublisherModule,
    IdentityClientModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
```

### 9.3 `config/env.schema.ts`

```typescript
// services/document-service/src/config/env.schema.ts
import { z } from 'zod';

/**
 * Schéma de configuration validé au démarrage (échec fast si manquant).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3004),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  RABBITMQ_URL: z.string().url(),
  RABBITMQ_AUDIT_EXCHANGE: z.string().default('audit.events'),
  RABBITMQ_NOTIF_EXCHANGE: z.string().default('notification.events'),

  // Vault Transit
  VAULT_ADDR: z.string().url(),
  VAULT_TOKEN: z.string().min(10),
  VAULT_QR_SIGNING_KEY: z.string().default('nina-qr-signing'),

  // MinIO
  MINIO_ENDPOINT: z.string(),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET_FICHES: z.string().default('fiches'),
  MINIO_RETENTION_YEARS: z.coerce.number().default(10),

  // identity-service gRPC
  IDENTITY_GRPC_URL: z.string().default('localhost:50051'),

  // JWKS QR (URL publique exposée aux mobiles)
  JWKS_QR_URL: z.string().url(),

  // FDI
  FDI_TTL_DAYS: z.coerce.number().default(180),
  FDI_PUPPETEER_POOL_SIZE: z.coerce.number().default(4),
});

export type Env = z.infer<typeof envSchema>;
```

### 9.4 `documents/documents.controller.ts`

```typescript
// services/document-service/src/documents/documents.controller.ts
/**
 * @file        documents.controller.ts
 * @description Endpoints privés (JWT requis) : génération, download URL, révocation.
 */
import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
// Depuis ADR-027 : Roles + types depuis le package ; classes Guards locales au service.
import { Roles } from '@nina-aes/auth-guards';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';
import { Request } from 'express';
import { FdiService } from '../fdi/fdi.service';
import { StorageService } from '../storage/minio.service';
import { GenerateFdiDto } from './dto/generate-fdi.dto';
import { RevokeDto } from './dto/revoke.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly fdi: FdiService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Génère une nouvelle Fiche Descriptive Individuelle pour le NINA fourni.
   *
   * @returns L'identifiant de la souche, l'URL pré-signée (1 h), l'expiration JWT.
   */
  @Post('fdi')
  @Roles('CITIZEN', 'AGENT', 'ADMIN')
  @ApiOperation({ summary: 'Générer une FDI (PDF + QR JWT RS256)' })
  async generate(@Body() dto: GenerateFdiDto, @Req() req: Request) {
    return this.fdi.generate({
      nina: dto.nina,
      language: dto.language ?? 'fra',
      requesterId: req.user!.sub,
      requesterIp: req.ip!,
      userAgent: req.headers['user-agent'] ?? '',
    });
  }

  @Get(':id/download-url')
  @Roles('CITIZEN', 'AGENT', 'ADMIN')
  @ApiOperation({ summary: 'URL pré-signée MinIO (1 h)' })
  async downloadUrl(@Param('id') id: string, @Req() req: Request) {
    return this.storage.presign(id, req.user!.sub);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Révoquer une FDI (jamais hard-delete)' })
  async revoke(@Param('id') id: string, @Body() dto: RevokeDto, @Req() req: Request) {
    return this.fdi.revoke({
      documentId: id,
      reason: dto.reason,
      reasonText: dto.reasonText,
      revokedBy: req.user!.sub,
    });
  }
}
```

### 9.5 `documents/public-documents.controller.ts`

```typescript
// services/document-service/src/documents/public-documents.controller.ts
/**
 * @file        public-documents.controller.ts
 * @description Endpoint public sans auth pour vérification offline du QR.
 *              Rate-limité 30 req/min par IP.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { QrVerifierService } from '../qr/qr-verifier.service';
import { VerifyQrDto } from './dto/verify-qr.dto';

@ApiTags('public-documents')
@Controller('public/documents')
export class PublicDocumentsController {
  constructor(private readonly verifier: QrVerifierService) {}

  /**
   * Vérifie un jeton JWT extrait d'un QR de FDI.
   *
   * @returns
   *   { valid: true, fdi, citizen } si tout est OK.
   *   { valid: false, reasonCode } sinon (REVOKED, EXPIRED, HASH_MISMATCH, BAD_SIGNATURE).
   */
  @Post('verify-qr')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Vérifier un QR JWT (offline-friendly)' })
  async verify(@Body() dto: VerifyQrDto) {
    return this.verifier.verify(dto.token);
  }
}
```

### 9.6 `documents/dto/generate-fdi.dto.ts`

```typescript
// services/document-service/src/documents/dto/generate-fdi.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { NINA_REGEX } from '@nina-aes/utils';

export class GenerateFdiDto extends createZodDto(
  z.object({
    nina: z.string().regex(NINA_REGEX, 'NINA invalide'),
    language: z.enum(['fra', 'bam', 'snk', 'fuv']).optional(),
  }),
) {}
```

### 9.7 `fdi/fdi.service.ts` — orchestrateur

```typescript
// services/document-service/src/fdi/fdi.service.ts
/**
 * @file        fdi.service.ts
 * @description Orchestre la génération complète : fetch citoyen → render HTML → sign QR
 *              → render PDF → upload MinIO → persistence → audit.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uuidv7 } from 'uuidv7';
import { PrismaClient } from '@nina-aes/database';
import { IdentityClient } from '../identity-client/identity.client';
import { TemplateService } from '../templates/template.service';
import { QrSignerService } from '../qr/qr-signer.service';
import { PdfGeneratorService } from '../pdf/pdf-generator.service';
import { PdfPostprocessService } from '../pdf/pdf-postprocess.service';
import { StorageService } from '../storage/minio.service';
import { AuditPublisherService } from '../audit/audit-publisher.service';
import { SerialNumberService } from './serial-number.service';
import { canonicalJson } from './canonical';
import { computeWatermark } from './watermark';
import { createHash } from 'node:crypto';

export interface GenerateInput {
  nina: string;
  language: 'fra' | 'bam' | 'snk' | 'fuv';
  requesterId: string;
  requesterIp: string;
  userAgent: string;
}

@Injectable()
export class FdiService {
  private readonly log = new Logger(FdiService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cfg: ConfigService,
    private readonly identity: IdentityClient,
    private readonly tpl: TemplateService,
    private readonly qr: QrSignerService,
    private readonly pdf: PdfGeneratorService,
    private readonly post: PdfPostprocessService,
    private readonly storage: StorageService,
    private readonly audit: AuditPublisherService,
    private readonly serial: SerialNumberService,
  ) {}

  async generate(input: GenerateInput) {
    // 1. Récupération du citoyen via identity-service (gRPC)
    const citizen = await this.identity.getCitizen(input.nina);
    if (!citizen) throw new NotFoundException('NINA introuvable');

    // 2. Préparation des identifiants stables
    const jti = uuidv7();
    const documentId = uuidv7();
    const serialNumber = await this.serial.next();
    const iat = Math.floor(Date.now() / 1000);
    const ttlDays = this.cfg.get<number>('FDI_TTL_DAYS')!;
    const exp = iat + ttlDays * 86_400;
    const watermark = computeWatermark(input.requesterIp, input.userAgent, jti);

    // 3. Construction d'un payload canonique (ordre des clés stable → hash stable)
    const fdiData = {
      serialNumber,
      type: 'FICHE_DESCRIPTIVE' as const,
      language: input.language,
      issuedAt: new Date(iat * 1000).toISOString(),
      documentId,
      citizen, // contient toutes les données affichées sur le PDF
    };
    const fdiHash = createHash('sha256').update(canonicalJson(fdiData)).digest('hex');

    // 4. Signature du QR via Vault Transit
    const { token, kid } = await this.qr.sign({
      iss: 'urn:nina-aes:ctdec-bamako',
      sub: citizen.nina,
      jti,
      iat,
      nbf: iat,
      exp,
      aud: ['urn:nina-aes:verifier'],
      fdi: {
        serialNumber,
        type: 'FICHE_DESCRIPTIVE',
        language: input.language,
        hash: fdiHash,
        issuedAt: fdiData.issuedAt,
        documentId,
      },
      citizen: {
        nina: citizen.nina,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        birthDate: citizen.birthDate,
        sex: citizen.sex,
        birthPlace: citizen.birthPlace.commune,
      },
      biometricHash: null,
      wm: watermark,
    });

    // 5. Rendu HTML
    const { html, sha256Html } = await this.tpl.render({
      citizen,
      document: { id: documentId, serialNumber, issuedAt: fdiData.issuedAt, jti, watermark },
      language: input.language,
      qrToken: token,
    });

    // 6. PDF via Puppeteer + post-process pdf-lib (PDF/A + attach JWT)
    const rawPdf = await this.pdf.fromHtml(html);
    const finalPdf = await this.post.toPdfA(rawPdf, { jwtAttachment: token });
    const sha256Pdf = createHash('sha256').update(finalPdf).digest('hex');

    // 7. Upload MinIO (versioning + Object Lock 10 ans)
    const { objectKey, versionId, presignedUrl } = await this.storage.put({
      nina: citizen.nina,
      jti,
      buffer: finalPdf,
    });

    // 8. Persistence (append-only ; pas d'UPDATE possible sur cette ligne)
    await this.prisma.document.create({
      data: {
        id: documentId,
        jti,
        nina: citizen.nina,
        type: 'FICHE_DESCRIPTIVE',
        serialNumber,
        language: input.language,
        sha256Html,
        sha256Pdf,
        kid,
        minioBucket: this.cfg.get<string>('MINIO_BUCKET_FICHES')!,
        minioObjectKey: objectKey,
        minioVersionId: versionId,
        issuedAt: new Date(iat * 1000),
        expiresAt: new Date(exp * 1000),
        issuedBy: input.requesterId,
        issuedFromIp: input.requesterIp,
        watermark,
      },
    });

    // 9. Audit asynchrone (le service publie un événement, audit-service
    //    le consomme et l'ajoute à sa chaîne Merkle — cf. document 09)
    await this.audit.publish('document.fdi.generated', {
      documentId,
      jti,
      nina: citizen.nina,
      serialNumber,
      issuedBy: input.requesterId,
      kid,
      sha256Pdf,
    });

    return {
      documentId,
      serialNumber,
      jti,
      sha256Pdf,
      qrJwt: token,
      downloadUrl: presignedUrl,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async revoke(input: {
    documentId: string;
    reason: string;
    reasonText?: string;
    revokedBy: string;
  }) {
    const doc = await this.prisma.document.findUnique({
      where: { id: input.documentId },
      include: { revocation: true },
    });
    if (!doc) throw new NotFoundException();
    if (doc.revocation) return { alreadyRevoked: true };

    await this.prisma.documentRevocation.create({
      data: {
        documentId: doc.id,
        reason: input.reason as never,
        reasonText: input.reasonText,
        revokedBy: input.revokedBy,
      },
    });

    // Ajouter le jti à la SET Redis de révocation (avec TTL = expiresAt)
    await this.qr.revoke(doc.jti, doc.expiresAt);

    await this.audit.publish('document.revoked', {
      documentId: doc.id,
      jti: doc.jti,
      reason: input.reason,
      revokedBy: input.revokedBy,
    });

    return { revoked: true, jti: doc.jti };
  }
}
```

### 9.8 `fdi/canonical.ts`

```typescript
// services/document-service/src/fdi/canonical.ts
/**
 * @file        canonical.ts
 * @description Sérialisation JSON canonique : tri stable des clés (récursif),
 *              élimination des `undefined`, normalisation des nombres → string.
 *              Suit l'esprit de RFC 8785 sans toutes ses subtilités unicode.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const child = (v as Record<string, unknown>)[k];
      if (child !== undefined) out[k] = sortKeys(child);
    }
    return out;
  }
  return v;
}
```

### 9.9 `qr/qr-signer.service.ts` — signature Vault Transit

```typescript
// services/document-service/src/qr/qr-signer.service.ts
/**
 * @file        qr-signer.service.ts
 * @description Construit l'en-tête + payload JWT, hash SHA-256, demande à Vault de
 *              signer (la clé privée ne quitte JAMAIS Vault), assemble le JWT final.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { VaultClient } from '@nina-aes/vault-client';
import { RevocationService } from './revocation.service';
import type { QrPayload } from './qr-payload.interface';

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

@Injectable()
export class QrSignerService {
  private readonly keyName: string;

  constructor(
    private readonly vault: VaultClient,
    private readonly cfg: ConfigService,
    private readonly revocation: RevocationService,
  ) {
    this.keyName = cfg.get<string>('VAULT_QR_SIGNING_KEY')!;
  }

  async sign(payload: QrPayload): Promise<{ token: string; kid: string }> {
    // 1. Récupération de la version courante de la clé (= kid logique)
    const keyMeta = await this.vault.read(`transit/keys/${this.keyName}`);
    const latestVersion = keyMeta.data.latest_version as number;
    const kid = `${this.keyName}-v${latestVersion}`;

    // 2. Sérialisation header + payload
    const header = { alg: 'RS256', typ: 'JWT', kid };
    const headerB64 = b64url(JSON.stringify(header));
    const payloadB64 = b64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // 3. Hash SHA-256 du signing input (Vault transit signe un hash, pas le message brut)
    const sha = createHash('sha256').update(signingInput).digest('base64');

    // 4. Vault transit/sign : retourne "vault:v1:<base64sig>"
    const { data } = await this.vault.write(`transit/sign/${this.keyName}/sha2-256`, {
      input: sha,
      prehashed: true,
      signature_algorithm: 'pkcs1v15',
    });
    const vaultSig = data.signature as string;
    const rawSig = Buffer.from(vaultSig.split(':')[2], 'base64');
    const sigB64 = b64url(rawSig);

    return { token: `${signingInput}.${sigB64}`, kid };
  }

  /**
   * Ajoute un jti à la liste de révocation Redis. TTL aligné sur l'expiration JWT
   * (au-delà, le JWT est déjà invalide).
   */
  async revoke(jti: string, exp: Date): Promise<void> {
    const ttlSec = Math.max(60, Math.floor((exp.getTime() - Date.now()) / 1000));
    await this.revocation.add(jti, ttlSec);
  }
}
```

### 9.10 `qr/qr-verifier.service.ts`

```typescript
// services/document-service/src/qr/qr-verifier.service.ts
/**
 * @file        qr-verifier.service.ts
 * @description Vérifie un JWT QR : récupère la clé publique via JWKS (cache 24h),
 *              vérifie signature + iss + exp + révocation + cohérence fdi.hash.
 */
import { Injectable } from '@nestjs/common';
import { jwtVerify, importJWK } from 'jose';
import { createHash } from 'node:crypto';
import { JwksService } from './jwks.service';
import { RevocationService } from './revocation.service';
import { canonicalJson } from '../fdi/canonical';
import { AuditPublisherService } from '../audit/audit-publisher.service';

type VerifyOk = { valid: true; fdi: unknown; citizen: unknown; jti: string };
type VerifyKo = { valid: false; reasonCode: string };

@Injectable()
export class QrVerifierService {
  constructor(
    private readonly jwks: JwksService,
    private readonly revocation: RevocationService,
    private readonly audit: AuditPublisherService,
  ) {}

  async verify(token: string): Promise<VerifyOk | VerifyKo> {
    let payload: any;
    let header: any;
    try {
      const decoded = decodeHeader(token);
      header = decoded.header;
      const jwk = await this.jwks.getKey(header.kid);
      const publicKey = await importJWK(jwk, 'RS256');
      const result = await jwtVerify(token, publicKey, {
        issuer: 'urn:nina-aes:ctdec-bamako',
        audience: 'urn:nina-aes:verifier',
        algorithms: ['RS256'],
      });
      payload = result.payload;
    } catch (e: any) {
      const code = mapJoseError(e);
      return this.fail(code);
    }

    // Cohérence fdi.hash → recalcul depuis fdi + citizen extraits du payload
    const fdiCanonical = canonicalJson({
      serialNumber: payload.fdi.serialNumber,
      type: payload.fdi.type,
      language: payload.fdi.language,
      issuedAt: payload.fdi.issuedAt,
      documentId: payload.fdi.documentId,
      citizen: payload.citizen,
    });
    const expectedHash = createHash('sha256').update(fdiCanonical).digest('hex');
    if (expectedHash !== payload.fdi.hash) return this.fail('HASH_MISMATCH');

    if (await this.revocation.isRevoked(payload.jti)) return this.fail('REVOKED');

    // Audit asynchrone (fire-and-forget)
    void this.audit.publish('document.qr.verified', {
      jti: payload.jti,
      nina: payload.sub,
      result: 'SUCCESS',
    });

    return {
      valid: true,
      jti: payload.jti,
      fdi: payload.fdi,
      citizen: payload.citizen,
    };
  }

  private fail(reasonCode: string): VerifyKo {
    void this.audit.publish('document.qr.verified', { result: 'FAILURE', reasonCode });
    return { valid: false, reasonCode };
  }
}

function decodeHeader(token: string): { header: { kid: string; alg: string } } {
  const [h] = token.split('.');
  return { header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) };
}

function mapJoseError(e: any): string {
  const code = e?.code ?? '';
  if (code === 'ERR_JWT_EXPIRED') return 'EXPIRED';
  if (code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') return 'BAD_SIGNATURE';
  if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') return 'BAD_CLAIM';
  return 'INVALID';
}
```

### 9.11 `qr/jwks.service.ts`

```typescript
// services/document-service/src/qr/jwks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';

@Injectable()
export class JwksService {
  private readonly log = new Logger(JwksService.name);
  private readonly cacheKey = 'qr:jwks';

  constructor(
    private readonly cfg: ConfigService,
    private readonly redis: Redis,
  ) {}

  async getKey(kid: string): Promise<any> {
    const jwks = await this.fetchCached();
    const key = jwks.keys.find((k: any) => k.kid === kid);
    if (!key) throw new Error(`kid ${kid} not in JWKS`);
    return key;
  }

  private async fetchCached(): Promise<{ keys: any[] }> {
    const cached = await this.redis.get(this.cacheKey);
    if (cached) return JSON.parse(cached);
    const res = await fetch(this.cfg.get<string>('JWKS_QR_URL')!);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const jwks = await res.json();
    await this.redis.set(this.cacheKey, JSON.stringify(jwks), 'EX', 86_400); // 24 h
    return jwks;
  }

  /** Rafraîchissement préventif toutes les 6 h pour amortir le cold cache. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refresh(): Promise<void> {
    await this.redis.del(this.cacheKey);
    await this.fetchCached();
    this.log.log('JWKS rafraîchi');
  }
}
```

### 9.12 `pdf/pdf-generator.service.ts`

```typescript
// services/document-service/src/pdf/pdf-generator.service.ts
/**
 * @file        pdf-generator.service.ts
 * @description Pool Puppeteer (4 contextes par défaut) → HTML → PDF Buffer.
 */
import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cluster } from 'puppeteer-cluster';

@Injectable()
export class PdfGeneratorService implements OnModuleInit, OnApplicationShutdown {
  private cluster!: Cluster<{ html: string }, Buffer>;

  constructor(private readonly cfg: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: this.cfg.get<number>('FDI_PUPPETEER_POOL_SIZE')!,
      puppeteerOptions: {
        headless: 'shell',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      },
    });
    await this.cluster.task(async ({ page, data }) => {
      await page.setContent(data.html, { waitUntil: 'networkidle0' });
      await page.emulateMediaType('screen');
      return Buffer.from(
        await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          tagged: true, // accessibilité PDF/UA
        }),
      );
    });
  }

  fromHtml(html: string): Promise<Buffer> {
    return this.cluster.execute({ html });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.cluster?.close();
  }
}
```

### 9.13 `pdf/pdf-postprocess.service.ts`

```typescript
// services/document-service/src/pdf/pdf-postprocess.service.ts
/**
 * @file        pdf-postprocess.service.ts
 * @description Post-traite le PDF Puppeteer : ajoute métadonnées PDF/A-3b et
 *              attache le JWT brut comme fichier embarqué `qr.jwt`.
 */
import { Injectable } from '@nestjs/common';
import { PDFDocument, AFRelationship } from 'pdf-lib';

@Injectable()
export class PdfPostprocessService {
  async toPdfA(raw: Buffer, opts: { jwtAttachment: string }): Promise<Buffer> {
    const pdf = await PDFDocument.load(raw);

    pdf.setProducer('NINA-AES document-service');
    pdf.setCreator('CTDEC Bamako');
    pdf.setTitle('Fiche Descriptive Individuelle');
    pdf.setSubject('Identité numérique souveraine AES');
    pdf.setKeywords(['NINA', 'AES', 'CTDEC', 'FDI']);
    pdf.setCreationDate(new Date());
    pdf.setModificationDate(new Date());

    // Attache le JWT brut comme PDF Attachment (utile pour vérification sans scan)
    await pdf.attach(Buffer.from(opts.jwtAttachment, 'utf8'), 'qr.jwt', {
      mimeType: 'application/jwt',
      description: 'JWT QR code (RS256)',
      creationDate: new Date(),
      modificationDate: new Date(),
      afRelationship: AFRelationship.Source,
    });

    return Buffer.from(await pdf.save({ useObjectStreams: false }));
  }
}
```

### 9.14 `templates/template.service.ts`

```typescript
// services/document-service/src/templates/template.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as Handlebars from 'handlebars';
import * as qrcode from 'qrcode';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { formatNinaHelper } from './helpers/format-nina.helper';
import { formatDateHelper } from './helpers/format-date.helper';

@Injectable()
export class TemplateService implements OnModuleInit {
  private compiled!: HandlebarsTemplateDelegate;

  async onModuleInit(): Promise<void> {
    Handlebars.registerHelper('formatNina', formatNinaHelper);
    Handlebars.registerHelper('formatDate', formatDateHelper);
    Handlebars.registerHelper('concat', (a, b) => `${a}${b}`);

    const partialsDir = join(__dirname, 'files', 'partials');
    for (const f of await fs.readdir(partialsDir)) {
      const name = f.replace(/\.hbs$/, '');
      const src = await fs.readFile(join(partialsDir, f), 'utf8');
      Handlebars.registerPartial(name, src);
    }

    const src = await fs.readFile(join(__dirname, 'files', 'fiche-descriptive.hbs'), 'utf8');
    this.compiled = Handlebars.compile(src, { noEscape: false });

    await i18next.use(Backend).init({
      fallbackLng: 'fra',
      preload: ['fra', 'bam', 'snk', 'fuv'],
      backend: { loadPath: join(__dirname, '..', 'i18n', '{{lng}}.json') },
    });
  }

  async render(input: {
    citizen: any;
    document: {
      id: string;
      serialNumber: string;
      issuedAt: string;
      jti: string;
      watermark: string;
    };
    language: string;
    qrToken: string;
  }): Promise<{ html: string; sha256Html: string }> {
    const qrDataUrl = await qrcode.toDataURL(input.qrToken, {
      errorCorrectionLevel: 'H',
      margin: 1,
      scale: 6,
    });
    const t = i18next.getFixedT(input.language);
    const html = this.compiled({
      ...input,
      qrDataUrl,
      t,
      coatOfArmsBase64: '', // injecté en prod depuis assets
    });
    const sha256Html = createHash('sha256').update(html).digest('hex');
    return { html, sha256Html };
  }
}
```

### 9.15 `templates/helpers/format-nina.helper.ts`

```typescript
// services/document-service/src/templates/helpers/format-nina.helper.ts
/**
 * Formate un NINA brut "19850315123456A" en "1 98 50 3 15 123 456 A".
 */
export function formatNinaHelper(nina: string): string {
  if (!/^\d{14}[A-Z]$/.test(nina)) return nina;
  return [
    nina[0],
    nina.slice(1, 3),
    nina.slice(3, 5),
    nina[5],
    nina.slice(6, 8),
    nina.slice(8, 11),
    nina.slice(11, 14),
    nina[14],
  ].join(' ');
}
```

### 9.16 `qr/revocation.service.ts`

```typescript
// services/document-service/src/qr/revocation.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RevocationService {
  private readonly prefix = 'qr:rev:';
  constructor(private readonly redis: Redis) {}

  async add(jti: string, ttlSec: number): Promise<void> {
    await this.redis.set(this.prefix + jti, '1', 'EX', ttlSec);
  }
  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(this.prefix + jti)) === 1;
  }
}
```

### 9.17 `audit/audit-publisher.service.ts`

```typescript
// services/document-service/src/audit/audit-publisher.service.ts
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class AuditPublisherService implements OnModuleInit {
  constructor(@Inject('AUDIT_BUS') private readonly bus: ClientProxy) {}
  async onModuleInit(): Promise<void> {
    await this.bus.connect();
  }
  publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
      this.bus
        .emit(routingKey, {
          ...payload,
          source: 'document-service',
          emittedAt: new Date().toISOString(),
        })
        .subscribe({ complete: () => resolve(), error: () => resolve() });
    });
  }
}
```

### 9.18 `health/health.controller.ts`

```typescript
// services/document-service/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { Public } from '@nina-aes/auth-guards';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly hc: HealthCheckService,
    private readonly http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.hc.check([
      () => this.http.pingCheck('vault', `${process.env.VAULT_ADDR}/v1/sys/health`),
      () =>
        this.http.pingCheck(
          'minio',
          `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/minio/health/ready`,
        ),
    ]);
  }
}
```

---

## 10. Stockage MinIO (S3) avec versioning + Object Lock WORM

### 10.1 Pré-requis bucket — créés une fois pour toutes

```bash
# 1. Activer Object Lock à la création (impossible a posteriori)
mc alias set local http://localhost:9000 minio minio12345
mc mb --with-lock local/fiches

# 2. Versioning explicite (Object Lock l'exige déjà, mais on documente)
mc version enable local/fiches

# 3. Rétention par défaut : 10 ans en mode COMPLIANCE
mc retention set --default compliance "3650d" local/fiches
```

> ⚠️ **Compliance vs Governance** : en mode `compliance`, **même** l'admin root ne peut pas
> supprimer avant l'expiration. C'est ce qu'on veut pour un document d'identité.

### 10.2 `storage/minio.service.ts`

```typescript
// services/document-service/src/storage/minio.service.ts
/**
 * @file        minio.service.ts
 * @description Wrapper MinIO : put avec rétention 10 ans, URL pré-signée 1 h,
 *              récupération de version par jti.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { addYears } from 'date-fns';
import { PrismaClient } from '@nina-aes/database';

@Injectable()
export class StorageService {
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly retentionYears: number;

  constructor(
    cfg: ConfigService,
    private readonly prisma: PrismaClient,
  ) {
    this.client = new MinioClient({
      endPoint: cfg.get<string>('MINIO_ENDPOINT')!,
      port: cfg.get<number>('MINIO_PORT')!,
      useSSL: cfg.get<boolean>('MINIO_USE_SSL')!,
      accessKey: cfg.get<string>('MINIO_ACCESS_KEY')!,
      secretKey: cfg.get<string>('MINIO_SECRET_KEY')!,
    });
    this.bucket = cfg.get<string>('MINIO_BUCKET_FICHES')!;
    this.retentionYears = cfg.get<number>('MINIO_RETENTION_YEARS')!;
  }

  async put(input: { nina: string; jti: string; buffer: Buffer }) {
    const objectKey = `${input.nina}/${input.jti}.pdf`;
    const retainUntilDate = addYears(new Date(), this.retentionYears);
    const result = await this.client.putObject(
      this.bucket,
      objectKey,
      input.buffer,
      input.buffer.length,
      {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fdi-${input.jti}.pdf"`,
        'x-amz-object-lock-mode': 'COMPLIANCE',
        'x-amz-object-lock-retain-until-date': retainUntilDate.toISOString(),
      },
    );
    const presignedUrl = await this.client.presignedGetObject(this.bucket, objectKey, 60 * 60);
    return { objectKey, versionId: result.versionId ?? '', presignedUrl };
  }

  async presign(documentId: string, requesterId: string): Promise<{ url: string }> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('not found');
    // TODO : vérifier que requesterId est owner OU agent/admin (déjà côté guard)
    const url = await this.client.presignedGetObject(doc.minioBucket, doc.minioObjectKey, 60 * 60);
    await this.prisma.documentAccessLog.create({
      data: { documentId, action: 'DOWNLOAD', ipAddress: 'n/a', result: 'SUCCESS' },
    });
    return { url };
  }
}
```

---

## 11. Endpoint public de vérification du QR (offline-friendly)

L'URL `/api/v1/public/documents/verify-qr` est conçue pour répondre **même quand le réseau est
dégradé** : pas de fetch base, pas d'appel identity-service, juste JWKS (cache 24 h) + Redis
(révocations). Latence cible **< 50 ms p95**.

### 11.1 Requête

```bash
curl -X POST http://localhost:3004/api/v1/public/documents/verify-qr \
     -H "Content-Type: application/json" \
     -d '{"token": "eyJhbGciOiJSUzI1NiIs..."}'
```

### 11.2 Réponses possibles

**OK** :

```json
{
  "valid": true,
  "jti": "01918f8b-...",
  "fdi": {
    "serialNumber": "FDI-2026-0000123",
    "type": "FICHE_DESCRIPTIVE",
    "language": "fra",
    "hash": "a5e1...",
    "issuedAt": "2026-04-15T09:30:00.000Z",
    "documentId": "01918f8b-..."
  },
  "citizen": {
    "nina": "19850315123456A",
    "firstName": "Aliou",
    "lastName": "Traoré",
    "birthDate": "1985-03-15",
    "sex": "M",
    "birthPlace": "Bamako"
  }
}
```

**KO** :

```json
{ "valid": false, "reasonCode": "REVOKED" }
{ "valid": false, "reasonCode": "EXPIRED" }
{ "valid": false, "reasonCode": "BAD_SIGNATURE" }
{ "valid": false, "reasonCode": "HASH_MISMATCH" }
{ "valid": false, "reasonCode": "BAD_CLAIM" }
```

### 11.3 Rate-limit & anti-abus

- 30 requêtes / minute / IP (`@nestjs/throttler`)
- Blocage automatique 1 h si > 100 KO consécutifs sur la même IP (cf. doc 15 — script fail2ban)

---

## 12. Sécurité — protection PDF, anti-fraude, OWASP

| Risque OWASP / spécifique          | Contre-mesure                                                        |
| ---------------------------------- | -------------------------------------------------------------------- |
| A01 Broken Access Control          | `JwtAuthGuard` + `RolesGuard` + check owner sur download             |
| A02 Cryptographic Failures         | RS256 3072 bits, clé Vault Transit jamais exfiltrée                  |
| A03 Injection (template)           | Handlebars `noEscape: false` partout sauf QR DataURL                 |
| A04 Insecure Design                | Append-only DB + Object Lock 10 ans MinIO                            |
| A05 Security Misconfiguration      | Helmet + CORS strict + Zod env validation au boot                    |
| A06 Vulnerable Components          | Snyk + Trivy (cf. doc 16)                                            |
| A07 Identification & Auth Failures | Keycloak + MFA (cf. doc 08)                                          |
| A08 Software & Data Integrity      | `sha256Html` + `sha256Pdf` stockés, audit Merkle                     |
| A09 Logging & Monitoring           | pino + Prometheus + alertes Grafana (cf. doc 17)                     |
| A10 SSRF                           | Aucun fetch d'URL utilisateur dans Puppeteer (HTML local uniquement) |
| **Copie photocopiée**              | Watermark dynamique (IP+UA+jti) imprimé en bas du PDF                |
| **Faux PDF avec QR authentique**   | `fdi.hash` vérifié à la lecture → champs altérés détectés            |
| **Réutilisation après révocation** | `jti` → Redis SET avec TTL aligné sur `exp`                          |
| **Vol de clé privée**              | Clé jamais hors Vault, audit Vault des `transit/sign`                |

### 12.1 Vault — politique minimale

```hcl
# infrastructure/vault/policies/document-service.hcl
path "transit/sign/nina-qr-signing/sha2-256" { capabilities = ["update"] }
path "transit/keys/nina-qr-signing"           { capabilities = ["read"]   }
```

Le service ne peut **que signer**, jamais lire la clé ni en créer de nouvelle.

---

## 13. Performance — pool Puppeteer, cache, métriques

### 13.1 Cibles SLA

| Endpoint            | p50      | p95     | p99      |
| ------------------- | -------- | ------- | -------- |
| `POST /fdi`         | < 600 ms | < 1.5 s | < 3 s    |
| `GET /download-url` | < 30 ms  | < 80 ms | < 200 ms |
| `POST /verify-qr`   | < 15 ms  | < 50 ms | < 120 ms |

### 13.2 Cache PDF (5 min) — bénéfice ré-impressions multiples

```typescript
const cacheKey = `pdf:${nina}:${language}`;
const cached = await this.redis.getBuffer(cacheKey);
if (cached) return { fromCache: true, buffer: cached };
// ... génération normale, puis :
await this.redis.set(cacheKey, finalPdf, 'EX', 300);
```

> ⚠️ Le cache ne stocke **pas** le JWT (qui contient le `jti` et `wm`) : seul le PDF rendu pour une
> langue donnée est mis en cache. Chaque génération crée un nouveau JWT signé.

### 13.3 Pool Puppeteer

`puppeteer-cluster` en mode `CONCURRENCY_CONTEXT` : 4 instances browser persistantes, chacune avec
des contextes isolés. Gain ~3x vs `puppeteer.launch` par requête (économie de spawn process ~250 ms
par PDF).

### 13.4 Métriques Prometheus (extraits)

```text
document_pdf_generated_total{language="fra"} 1245
document_pdf_generation_seconds_bucket{le="1.0"} 1188
document_qr_verified_total{result="SUCCESS"} 5832
document_qr_verified_total{result="FAILURE", reasonCode="REVOKED"} 12
document_revoked_total 47
```

Dashboards Grafana fournis dans `infrastructure/grafana/dashboards/document-service.json` (doc 17).

---

## 14. Tests (unit + e2e + visual regression)

### 14.1 Unit — `test/unit/qr-signer.service.spec.ts`

```typescript
describe('QrSignerService', () => {
  it('génère un JWT RS256 vérifiable avec la clé publique correspondante', async () => {
    const { token, kid } = await signer.sign(samplePayload());
    expect(kid).toMatch(/^nina-qr-signing-v\d+$/);

    const jwk = await jwksMock.getKey(kid);
    const publicKey = await importJWK(jwk, 'RS256');
    const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });

    expect(payload.sub).toBe('19850315123456A');
    expect(payload.iss).toBe('urn:nina-aes:ctdec-bamako');
    expect((payload as any).fdi.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuse la vérification après modification du payload (signature invalide)', async () => {
    const { token } = await signer.sign(samplePayload());
    const [h, p, s] = token.split('.');
    const tamperedPayload = Buffer.from(p, 'base64url')
      .toString('utf8')
      .replace('Aliou', 'Mamadou');
    const tampered = `${h}.${Buffer.from(tamperedPayload).toString('base64url')}.${s}`;
    await expect(verify(tampered)).rejects.toThrow();
  });
});
```

### 14.2 E2E — `test/e2e/documents.e2e-spec.ts`

```typescript
describe('Documents (e2e)', () => {
  it('POST /documents/fdi crée un PDF + QR vérifiable end-to-end', async () => {
    mockIdentityService({
      nina: '19850315123456A',
      firstName: 'Aliou',
      lastName: 'Traoré',
      birthDate: '1985-03-15',
      sex: 'M',
      birthPlace: { commune: 'Bamako', region: 'District' /* ... */ },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/documents/fdi')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ nina: '19850315123456A', language: 'fra' })
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
    expect(verify.body.citizen.firstName).toBe('Aliou');
  });

  it('révocation → QR devient invalide (reasonCode=REVOKED)', async () => {
    const doc = await createFdi();
    await request(app.getHttpServer())
      .delete(`/api/v1/documents/${doc.documentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'DECEASED' })
      .expect(200);

    const verify = await request(app.getHttpServer())
      .post('/api/v1/public/documents/verify-qr')
      .send({ token: doc.qrJwt });
    expect(verify.body.valid).toBe(false);
    expect(verify.body.reasonCode).toBe('REVOKED');
  });

  it('rate limit : 31e requête → 429', async () => {
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

### 14.3 Visual regression — `test/visual/visual-regression.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { pdfToPng } from '../helpers/pdf-to-png';

test('FDI rendu pixel-stable entre builds', async () => {
  const pdf = await generateFdiFixture('fra');
  const expected = await fs.readFile('test/fixtures/expected-fiche-descriptive.pdf');

  const actualPng = await pdfToPng(pdf, 1);
  const expectedPng = await pdfToPng(expected, 1);

  expect(actualPng).toMatchSnapshot('fiche-descriptive-fra.png', {
    maxDiffPixelRatio: 0.02, // tolère 2% pour anti-aliasing
  });
});
```

### 14.4 Couverture cible

```typescript
// jest.config.ts
coverageThreshold: {
  global: { branches: 80, functions: 85, lines: 85, statements: 85 },
},
```

### 14.5 Commandes

```bash
# Unit + e2e
pnpm --filter @nina-aes/document-service test
pnpm --filter @nina-aes/document-service test:e2e

# Visual regression (Playwright)
pnpm --filter @nina-aes/document-service test:visual

# Génération d'un PDF de démonstration (sans envoyer en MinIO)
pnpm --filter @nina-aes/document-service exec ts-node scripts/demo-fdi.ts \
  --nina 19850315123456A --language fra --out demo.pdf
```

---

## 15. Swagger + OpenAPI 3.1

Accessible sur `http://localhost:3004/api/docs`. Les **6 endpoints** sont documentés avec exemples,
codes d'erreur (400, 401, 403, 404, 409, 429) et schémas Zod.

| Méthode | URL                                  | Auth       | Rôles                         |
| ------- | ------------------------------------ | ---------- | ----------------------------- |
| POST    | `/api/v1/documents/fdi`              | Bearer JWT | CITIZEN, AGENT, ADMIN         |
| GET     | `/api/v1/documents/:id/download-url` | Bearer JWT | CITIZEN (owner), AGENT, ADMIN |
| DELETE  | `/api/v1/documents/:id`              | Bearer JWT | ADMIN                         |
| POST    | `/api/v1/public/documents/verify-qr` | **Aucune** | — (rate-limit IP)             |
| GET     | `/api/v1/health`                     | **Aucune** | —                             |
| GET     | `/metrics`                           | mTLS only  | — (Prometheus scrape)         |

### 15.1 Pièges courants & dépannage

| Symptôme                                    | Cause probable                              | Solution                                                                            |
| ------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ERR_PUPPETEER_PROTOCOL_ERROR` au démarrage | Chromium pas téléchargé                     | `pnpm rebuild puppeteer` puis vérifier `PUPPETEER_CACHE_DIR`                        |
| PDF généré sans la police Noto              | Font non installée dans le conteneur Docker | `apt install fonts-noto fonts-noto-cjk` dans le Dockerfile                          |
| QR scanné → `BAD_SIGNATURE` systématique    | `kid` du JWKS ne correspond pas             | Vérifier que `JWKS_QR_URL` pointe sur le bon endpoint Vault → `jwks-qr.json`        |
| Vault `403 permission denied`               | Politique manquante                         | Appliquer `infrastructure/vault/policies/document-service.hcl`                      |
| `Object Lock not enabled on bucket`         | Bucket créé sans `--with-lock`              | Supprimer + recréer (`mc rb` / `mc mb --with-lock`) — l'option n'est pas réversible |
| `HASH_MISMATCH` à la vérification           | Champ citizen modifié hors flux             | Bien re-signer via `POST /fdi` (jamais éditer en base)                              |
| Rate limit 429 en dev                       | Throttler trop strict                       | Désactiver via `THROTTLE_DISABLED=true` en `.env.dev` (cf. `env.schema.ts`)         |

---

## 16. Mini-rapport d'étape (template)

```markdown
### Rapport — Document 10 — document-service — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : \_\_\_ h (estimation : 12–16 h)
- **Commit de fin** : **\*\*\*\***\_\_**\*\*\*\***

## Fonctionnel

- [ ] FDI PDF générée en français (visuellement conforme au modèle CTDEC)
- [ ] FDI PDF générée en bambara (translitération OK)
- [ ] QR scan → verify-qr retourne payload complet (valid: true)
- [ ] Révocation → QR devient invalide (REVOKED)
- [ ] URL pré-signée MinIO télécharge bien le PDF (expire après 1 h)
- [ ] PDF embarque le JWT brut comme attachment `qr.jwt`

## Performance

| Scénario            | Cible       | Mesuré |
| ------------------- | ----------- | ------ |
| Génération FDI p95  | < 1500 ms   |        |
| Verify-QR p95       | < 50 ms     |        |
| Taille PDF final    | < 300 kB    |        |
| Pool Puppeteer load | 100 PDF/min |        |

## Tests

| Type              | Passent ? | Couverture |
| ----------------- | --------- | ---------- |
| Unit              |           | \_\_ %     |
| E2E               |           | \_\_ %     |
| Visual regression |           | —          |

## Difficultés rencontrées

- ***

## Solutions trouvées

- ***

## Prochaines actions

- Document 11 — ai-service FastAPI (détection d'erreurs NINA, RapidFuzz + XGBoost)
```

---

## 17. Checklist de fin d'étape

- [ ] ✅ 6 endpoints REST fonctionnels (Swagger OK)
- [ ] ✅ Pool Puppeteer démarre et absorbe 100 PDF/min sans crash
- [ ] ✅ 4 fichiers i18n présents (`fra.json` + 3 autres, même placeholders)
- [ ] ✅ QR JWT RS256 signé via Vault Transit avec `kid` correct (`nina-qr-signing-vN`)
- [ ] ✅ JWKS cache 24 h actif (pas de hit Vault à chaque verify)
- [ ] ✅ Upload MinIO avec Object Lock COMPLIANCE 10 ans actif
- [ ] ✅ Bucket `fiches` créé avec `--with-lock` + versioning ON
- [ ] ✅ Révocation stockée en DB + propagée sur Redis avec TTL aligné sur `exp`
- [ ] ✅ Audit publisher publie `document.fdi.generated`, `document.revoked`, `document.qr.verified`
- [ ] ✅ Rate limiting 30/min IP sur endpoint public
- [ ] ✅ Cache Redis PDF 5 min actif (vérifié avec 2 appels successifs même NINA/langue)
- [ ] ✅ Métadonnées PDF/A-3b + attachment `qr.jwt` présents dans le PDF final
- [ ] ✅ Visual regression passe avec `maxDiffPixelRatio: 0.02`
- [ ] ✅ Couverture tests ≥ 85 %
- [ ] ✅ Healthcheck `/health` vérifie MinIO + Vault + Postgres
- [ ] ✅ Commit : `feat(document): FDI PDF + QR JWT RS256 + Vault sign + MinIO WORM`
- [ ] ✅ ADR-006 (addendum 2026-05-25) et ADR-026 (nouveau) mis à jour
- [ ] ✅ `docs/CHANGELOG.md` : ligne d'arrivée du service ajoutée
- [ ] ✅ Aucun secret en clair (tout dans Vault ou `.env` git-ignoré)

---

## 18. Pour aller plus loin

1. **Carte PKPass / Apple Wallet** — générer un pass Apple Wallet équivalent à la FDI pour la
   diaspora (Bloc B). Le QR reste identique, seul le container `.pkpass` diffère.
2. **Verifiable Credentials W3C** — faire évoluer le payload QR vers le standard VC (JSON-LD +
   LD-Proofs) pour interop future avec les wallets européens EUDI Wallet (échéance 2026 EU).
3. **HSM physique** — remplacer Vault Transit par un YubiHSM 2 ou un Thales Luna HSM pour la clé
   `nina-qr-signing`. Vault devient front-end mais la clé est physiquement hors-ligne.
4. **PDF/A-3u strict** — conformité ISO 19005-3 niveau 3u pour archivage 30 ans (nécessite fonts
   embedded + color profile ICC). Demande pdf-lib + `pdf-lib-pdfa` extension.
5. **Tampon électronique qualifié eIDAS** — signer en plus du QR avec un certificat eIDAS d'un Trust
   Service Provider certifié pour interop UE / diaspora vivant en Europe.
6. **CRL téléchargeable** — publier toutes les 24 h une liste des `jti` révoqués au format CRL
   téléchargeable offline. Permet aux mobiles d'avoir une vérification 100 % offline **avec** prise
   en compte des révocations récentes.
7. **Watermark dynamique avancé** — au-delà du `wm` court, inclure un QR « interne » filigrané
   contenant un nonce daté permettant de tracer une fuite ciblée.
8. **i18n complète** — finaliser les 4 langues restantes (Tamasheq, Hausa, Mossi, Djerma) avec un
   linguiste partenaire pour le Bloc B (interop AES Niger + Burkina Faso).
9. **Signature détachée optionnelle** — exposer en plus du QR un endpoint `GET /:id/signature.p7s`
   au format CMS/PKCS#7 pour interop avec outils gouvernementaux historiques (LibreOffice
   Signatures, Adobe Acrobat Sign).
10. **OCSP-like en ligne** — endpoint `GET /public/documents/status/:jti` qui renvoie juste
    `{ status: "VALID" | "REVOKED" | "EXPIRED" }` (latence ~5 ms) pour les vérifications massives
    type contrôle frontalier.

---

_Document 10 — Version 2.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_ _Prochain :
[11 — AI-Service FastAPI](./11-AI-SERVICE-FASTAPI.md)_

✅ Document 10 terminé ➡️ Prochain document : `11-AI-SERVICE-FASTAPI.md` ❓ Veux-tu que je continue
avec le document 11 ?
