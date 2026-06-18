# 09 — Backend : Audit-Service (NestJS 11 + Merkle Chain SHA-256)

> **Projet** : NINA-AES Platform **Document** : 09/26 **Service** : `audit-service` — Journal
> d'audit append-only, chaîne Merkle, preuve cryptographique **Port** : `3007` **Stack** : NestJS
> 11.1 · PostgreSQL 18 · Prisma 7.6 · RabbitMQ 4.2 · Ed25519 · SHA-256 · Redis 8.6 **Auteur** :
> Étudiant UQAR **Date** : Avril 2026 **Prérequis** :
> [Document 07 — Identity Service](./07-BACKEND-IDENTITY-SERVICE.md) ·
> [Document 08 — Auth Service](./08-BACKEND-AUTH-SERVICE.md)

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Pourquoi un audit immuable ? Le problème de la NINA et la souveraineté numérique](#2-pourquoi-un-audit-immuable)
3. [Technologies utilisées (versions avril 2026)](#3-technologies-utilisées)
4. [Architecture du microservice audit-service](#4-architecture-du-microservice-audit-service)
5. [Théorie — Chaîne Merkle et hash chain append-only](#5-théorie--chaîne-merkle)
6. [Modèle Prisma `AuditLog` et `AuditRoot`](#6-modèle-prisma)
7. [Structure de dossiers](#7-structure-de-dossiers)
8. [Implémentation NestJS — Code intégral commenté](#8-implémentation-nestjs)
9. [Intégration événementielle via RabbitMQ (consumer)](#9-intégration-événementielle-rabbitmq)
10. [Endpoints REST — API de preuve cryptographique](#10-endpoints-rest--api-de-preuve)
11. [Script de vérification d'intégrité offline](#11-script-de-vérification-dintégrité-offline)
12. [Signature périodique de la racine (Ed25519)](#12-signature-périodique-de-la-racine)
13. [Rétention 10 ans et archivage WORM](#13-rétention-10-ans-et-archivage-worm)
14. [Tests (unit + e2e + intégration)](#14-tests-unit--e2e--intégration)
15. [Swagger + OpenAPI](#15-swagger--openapi)
16. [Mini-rapport d'étape (template)](#16-mini-rapport-détape-template)
17. [Checklist de fin d'étape](#17-checklist-de-fin-détape)
18. [Pour aller plus loin](#18-pour-aller-plus-loin)

---

## 1. Objectif pédagogique

Construire un **journal d'audit inviolable** qui enregistre **toutes les actions sensibles** de la
plateforme NINA-AES : lecture d'une fiche citoyen, modification d'un enregistrement, validation
d'une correction, connexion d'un agent, requête interop cross-border, etc.

Le service `audit-service` n'est **pas** un simple "logger" : c'est un **coffre-fort
cryptographique** qui rend **mathématiquement détectable** toute tentative de falsification a
posteriori. Si un attaquant (ou un agent corrompu) tente de supprimer ou modifier une ligne d'audit
existante, la chaîne Merkle se rompt et la falsification devient **prouvable devant un tribunal**.

### Ce que tu vas apprendre

| Compétence             | Niveau        | Application au projet                                 |
| ---------------------- | ------------- | ----------------------------------------------------- |
| Chaîne de hash Merkle  | Expert        | Implémentation maison SHA-256 + preuve                |
| Append-only storage    | Avancé        | Contraintes Postgres `UPDATE`/`DELETE` interdits      |
| Messaging événementiel | Avancé        | RabbitMQ topic exchange `audit.*`                     |
| Ed25519                | Intermédiaire | Signature périodique de la racine                     |
| Horloge monotone       | Intermédiaire | `timestamp` + séquence pour ordering déterministe     |
| SQL anti-tampering     | Avancé        | Triggers Postgres `BEFORE UPDATE/DELETE` bloquants    |
| Cron NestJS            | Intermédiaire | `@Cron('0 * * * *')` pour scellement horaire          |
| Vérification offline   | Avancé        | Script Node.js indépendant pour re-calculer la chaîne |

### Livrable à la fin de ce document

- **5 endpoints REST** sur `http://localhost:3007/api/v1/audit/*`
- **1 consumer RabbitMQ** (`audit.log`) lié à `nina.events` (topic) + `nina.audit` (fanout)
- **Chaîne Merkle SHA-256** fonctionnelle avec `previousHash` + `merkleHash`
- **Triggers Postgres** bloquant tout `UPDATE`/`DELETE` sur `audit_logs`
- **Scellement horaire** : signature Ed25519 de la racine toutes les 60 min
- **Script CLI** `verify-chain.ts` pour vérification offline indépendante
- **Tests** ≥ 85% de couverture
- **Swagger** OpenAPI 3.1 documentant les 5 endpoints

---

## 2. Pourquoi un audit immuable ?

Le contexte NINA Mali a été marqué par plusieurs **scandales documentés** où des fichiers électoraux
ont été "perdus", "corrompus" ou "mis à jour" de façon suspecte avant les scrutins. Un système
moderne de gestion d'identité **ne peut pas se contenter** d'un simple log applicatif : il faut une
**preuve cryptographique** que l'historique est intact.

### Trois menaces à contrer

1. **Insider threat** : un agent de la DGEC avec un accès DBA tente de supprimer son propre log de
   corruption.
2. **External tampering** : un attaquant obtient un accès Postgres et modifie 20 lignes d'audit pour
   masquer son passage.
3. **Collusion** : un binôme agent + DBA tente de substituer une ligne d'audit par une autre
   cohérente.

### Réponse technique

| Menace        | Contre-mesure                                                         |
| ------------- | --------------------------------------------------------------------- |
| Suppression   | Trigger Postgres `BEFORE DELETE` qui raise une exception              |
| Modification  | Trigger Postgres `BEFORE UPDATE` qui raise une exception              |
| Substitution  | Chaîne Merkle : chaque ligne contient `hash(N-1)` + son propre `hash` |
| Collusion DBA | Scellement Ed25519 horaire de la racine vers un HSM externe           |
| Perte réseau  | Réplication WORM (Write-Once-Read-Many) sur MinIO chaque nuit         |

### Propriétés garanties

- **Intégrité** : toute ligne modifiée brise la chaîne (détection cryptographique).
- **Non-répudiation** : la signature Ed25519 horaire prouve l'existence d'une ligne avant un instant
  T.
- **Auditabilité** : un inspecteur peut vérifier la chaîne **sans** accès à la base (script
  offline + racines signées).

---

## 3. Technologies utilisées

| Dépendance                    | Version   | Rôle                                |
| ----------------------------- | --------- | ----------------------------------- |
| `@nestjs/common`              | `11.1.18` | Core NestJS                         |
| `@nestjs/core`                | `11.1.18` | Runtime                             |
| `@nestjs/platform-express`    | `11.1.18` | Adaptateur HTTP                     |
| `@nestjs/config`              | `4.1.2`   | `.env` via Zod                      |
| `@nestjs/swagger`             | `11.2.0`  | OpenAPI 3.1                         |
| `@nestjs/terminus`            | `11.1.0`  | Healthchecks                        |
| `@nestjs/microservices`       | `11.1.18` | Transport AMQP                      |
| `@nestjs/schedule`            | `6.1.0`   | Cron scellement Ed25519             |
| `@nestjs/throttler`           | `6.5.0`   | Rate-limiting endpoints de preuve   |
| `prisma`                      | `7.6.2`   | ORM                                 |
| `@prisma/client`              | `7.6.2`   | Client DB                           |
| `amqplib`                     | `0.10.4`  | Client RabbitMQ natif               |
| `@nestjs/microservices` (RMQ) | `11.1.18` | Patron NestJS RabbitMQ              |
| `ioredis`                     | `5.6.1`   | Cache racine signée                 |
| `zod`                         | `4.3.6`   | Validation DTO + env                |
| `pino`                        | `9.12.0`  | Logger structuré                    |
| `nestjs-pino`                 | `4.5.0`   | Bridge pino/NestJS                  |
| `@noble/ed25519`              | `2.3.0`   | Signature Ed25519 sans dépendance C |
| `@noble/hashes`               | `1.9.0`   | SHA-256/512 constant-time           |
| `class-validator`             | `0.14.2`  | Validation DTO                      |
| `class-transformer`           | `0.5.1`   | Sérialisation                       |
| `jest`                        | `30.2.0`  | Tests unitaires                     |
| `supertest`                   | `7.2.0`   | Tests E2E                           |
| `@testcontainers/postgresql`  | `11.0.0`  | Postgres jetable pour tests         |
| `@testcontainers/rabbitmq`    | `11.0.0`  | RabbitMQ jetable pour tests         |

### Pourquoi `@noble/hashes` et pas `node:crypto` ?

`@noble/hashes` est **100% JavaScript pur**, audité (trail of bits 2023), **constant-time**,
portable partout (Node, Bun, Deno, navigateur). Cela facilite la réutilisation du code de
vérification dans le script CLI offline et, plus tard, dans le mobile React Native. `node:crypto`
reste utilisé côté serveur pour les opérations non-critiques (ID de corrélation).

### Pourquoi Ed25519 plutôt que RSA ?

- **Signatures 3x plus courtes** (64 octets vs 256 octets RSA-2048) → meilleur pour stocker
  `signed_chain_roots`.
- **Vitesse** : 50 000 sig/s vs 700 sig/s RSA-2048 → le scellement horaire devient négligeable.
- **Robustesse cryptographique** : courbe Edwards, résistante aux side-channels de base.
- **Déjà adopté** par l'écosystème AES pour l'interop (cf.
  [ADR-007](./adr/ADR-007-ed25519-interop-aes.md)).

---

## 4. Architecture du microservice audit-service

```
┌─────────────────────────────────────────────────────────────────────┐
│                     audit-service :3007                             │
│                                                                     │
│  ┌────────────────┐    ┌────────────────┐    ┌──────────────────┐  │
│  │  HTTP REST API │    │ AMQP Consumer  │    │  Cron Scheduler  │  │
│  │  /audit/*      │    │ nina.events    │    │ @Cron hourly     │  │
│  └────────┬───────┘    └────────┬───────┘    └─────────┬────────┘  │
│           │                     │                      │           │
│           ▼                     ▼                      ▼           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                  AuditService (core)                          │ │
│  │  - append(event)     : chained INSERT + Merkle hash           │ │
│  │  - verify(fromId, toId) : re-calculate & compare chain        │ │
│  │  - getProof(logId)   : return full chain up to log            │ │
│  │  - sealRoot()        : Ed25519 sign root every hour           │ │
│  └───────────┬───────────────────────────────────┬───────────────┘ │
│              │                                   │                 │
│              ▼                                   ▼                 │
│  ┌───────────────────────┐           ┌────────────────────────┐    │
│  │ AuditLogRepository    │           │  SigningService        │    │
│  │ (Prisma + RAW SQL for │           │  (Ed25519 + Vault key) │    │
│  │  append-only guards)  │           │                        │    │
│  └───────────┬───────────┘           └───────────┬────────────┘    │
│              │                                   │                 │
│              ▼                                   ▼                 │
│  ┌───────────────────────┐           ┌────────────────────────┐    │
│  │  PostgreSQL 18        │           │  Vault KV v2           │    │
│  │  - audit_logs         │           │  (private key signing) │    │
│  │  - audit_roots        │           │                        │    │
│  │  - TRIGGERS immuable  │           │                        │    │
│  └───────────────────────┘           └────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

**Principes clés** :

1. **Aucun endpoint d'écriture directe** : les écritures viennent exclusivement de RabbitMQ
   (découplage).
2. **Triggers Postgres** bloquant `UPDATE`/`DELETE` sur les 2 tables.
3. **Consumer idempotent** : chaque événement a un `eventId` (UUID) — double-insertion impossible
   grâce à la contrainte `UNIQUE` sur `source_event_id`.
4. **Racine signée toutes les heures** par `SigningService` via Vault.

---

## 5. Théorie — Chaîne Merkle et hash chain append-only

### 5.1 Hash chain simple

Chaque ligne d'audit contient :

```
merkleHash_N = SHA256( previousHash_N-1 || canonical_payload_N || timestamp_N || source_event_id_N )
```

Si un attaquant modifie la ligne `N`, alors `merkleHash_N` ne correspond plus → détection. S'il
modifie `N` **et** recalcule `merkleHash_N` proprement, alors `merkleHash_N` change, donc
`previousHash_N+1` pointe vers une valeur erronée → **la ligne N+1 détecte l'intrusion**.

Pour masquer intégralement, l'attaquant devrait recalculer **toute la chaîne jusqu'à la fin** ET
modifier toutes les racines signées horaires (stockées dans `audit_roots` et contresignées par
Vault). Sans la clé privée Ed25519 (dans Vault, protégée par mTLS + politique `deny-by-default`),
c'est **computationnellement et opérationnellement infaisable**.

### 5.2 Racine périodique (ancrage temporel)

Toutes les 60 min, `SigningService` :

1. Lit `MAX(id)` de `audit_logs` → `lastId`.
2. Lit `merkleHash` de cette ligne → `chainRoot`.
3. Signe `SHA256(chainRoot || timestamp)` avec la clé privée Ed25519.
4. Insère dans `audit_roots` : `(chainRootHash, signedAt, signature, logCountCovered)`.

Le résultat : même si un attaquant parvient à tout réécrire en base, il ne peut **pas** produire une
signature Ed25519 valide pour la nouvelle racine → la falsification reste prouvable en comparant la
signature stockée à la ligne publiée sur un canal externe (par exemple tweet hebdomadaire de la
racine hexa — inspiré de Bitcoin timestamping).

### 5.3 Payload canonique

Les structures JSON non déterministes (ordre des clés, espaces) sont un **cauchemar
cryptographique**. Solution : **payload canonique** via
[JCS RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) :

```
canonical(obj) = JSON stringifié avec :
  - clés triées alphabétiquement
  - pas d'espace
  - nombres sans zéros superflus
  - Unicode NFC normalisé
```

Librairie utilisée : `canonicalize` ^2.1.0 (déjà compilé dans `@nina-aes/shared-lib`).

---

## 6. Modèle Prisma

> ### ⚠️ Schéma réel (as-built — mai 2026)
>
> Le bloc `prisma` illustratif ci-dessous (conçu en avril) a **divergé** du schéma réellement
> implémenté. La **source canonique** est `packages/database/prisma/schema.prisma`. Champs réels de
> `AuditLog` :
>
> `id` (BigInt) · `userId` (UUID?, FK `users` — `null` pour l'ingestion AMQP afin d'éviter toute
> violation de clé étrangère ; l'acteur brut est conservé dans `newValue`) · `actorType` · `action`
> · `entityType` · `entityId` · `oldValue` (Json?) · `newValue` (Json?) · `ipAddress` (Inet?) ·
> `payloadHash` · `previousHash` · `merkleHash` (unique) · `signature?` · `sourceEventId`
> (VarChar(100), **unique** → idempotence) · `correlationId` · `occurredAt` · `createdAt`.
>
> Modèle `AuditRoot` réel (`audit_roots`) : `id` (BigInt) · `chainRootHash` · `lastLogId` (BigInt) ·
> `logCountCovered` · `signature` (hex 128) · `signingKeyId` · `publishedExternal` · `signedAt`.
>
> Calculs (cf. `src/audit/chain.ts`) :
> `payloadHash = SHA256( canonicalJson({action, actorType, correlationId, entityId, entityType, ipAddress, newValue, oldValue, sourceEventId, userId}) )`
> où `canonicalJson` trie récursivement les clés (indispensable car JSONB réordonne les clés au
> stockage ; même fonction dans le script offline) ;
> `merkleHash = SHA256( previousHash | payloadHash | occurredAt(ISO) | sourceEventId )`.
>
> Migration réelle : `20260530120000_audit_chain_immutability` — une seule fonction trigger partagée
> `nina_reject_audit_mutation()` (BEFORE UPDATE/DELETE sur les deux tables) + REVOKE best-effort si
> le rôle `nina_app` existe.
>
> Signature : Ed25519 (`@noble/ed25519`), clé chargée depuis **Vault KV** (`VAULT_AUDIT_KEY_PATH`,
> défaut `audit/signing-key`), repli clé éphémère en dev. Intégrité du chaînage sous concurrence :
> verrou consultatif transactionnel `pg_advisory_xact_lock` (un seul `append` à la fois,
> multi-instances). ADR alignées : ADR-007 (Merkle), ADR-014 (append-only), ADR-027 (guards locaux).

Fichier : `packages/database/prisma/schema.prisma` (section audit ajoutée)

```prisma
model AuditLog {
  id               BigInt   @id @default(autoincrement())
  // Identifiants métier
  sourceEventId    String   @unique @map("source_event_id") @db.Uuid
  actorId          String?  @map("actor_id")      // NULL si système
  actorRole        String?  @map("actor_role")    // CITIZEN, AGENT, SYSTEM, ...
  action           String                        // "citizen.read", "correction.approve"
  resourceType     String?  @map("resource_type") // "citizen", "correction"
  resourceId       String?  @map("resource_id")
  // Payload
  payload          Json                          // canonical JSON
  payloadHash      String   @map("payload_hash") // SHA-256 du canonical
  // Chaîne
  previousHash     String   @map("previous_hash")
  merkleHash       String   @unique @map("merkle_hash")
  // Métadonnées
  ipAddress        String?  @map("ip_address") @db.Inet
  userAgent        String?  @map("user_agent")
  traceId          String?  @map("trace_id")    // corrélation Jaeger
  createdAt        DateTime @default(now()) @map("created_at")

  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@index([resourceType, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}

model AuditRoot {
  id               BigInt   @id @default(autoincrement())
  chainRootHash    String   @map("chain_root_hash")     // merkleHash du dernier log couvert
  lastLogId        BigInt   @map("last_log_id")
  logCountCovered  Int      @map("log_count_covered")
  signedAt         DateTime @default(now()) @map("signed_at")
  signature        String                                // hex ed25519 (128 chars)
  signingKeyId     String   @map("signing_key_id")      // ID Vault (rotation)
  publishedExternal Boolean @default(false) @map("published_external") // Twitter, GitHub public log

  @@index([signedAt])
  @@map("audit_roots")
}
```

### Migrations — triggers append-only

Fichier : `packages/database/prisma/migrations/20260416000000_audit_triggers/migration.sql`

```sql
-- ============================================================
-- TRIGGER : bloque tout UPDATE sur audit_logs
-- ============================================================
CREATE OR REPLACE FUNCTION reject_audit_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (attempted UPDATE on id=%)', OLD.id
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_update();

-- ============================================================
-- TRIGGER : bloque tout DELETE sur audit_logs
-- ============================================================
CREATE OR REPLACE FUNCTION reject_audit_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (attempted DELETE on id=%)', OLD.id
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_delete();

-- ============================================================
-- Mêmes triggers sur audit_roots (racines scellées)
-- ============================================================
CREATE TRIGGER audit_roots_no_update
  BEFORE UPDATE ON audit_roots
  FOR EACH ROW EXECUTE FUNCTION reject_audit_update();

CREATE TRIGGER audit_roots_no_delete
  BEFORE DELETE ON audit_roots
  FOR EACH ROW EXECUTE FUNCTION reject_audit_delete();

-- ============================================================
-- Rôle applicatif : NE DOIT JAMAIS avoir UPDATE/DELETE
-- ============================================================
REVOKE UPDATE, DELETE ON audit_logs FROM nina_app;
REVOKE UPDATE, DELETE ON audit_roots FROM nina_app;

-- Seul le rôle superuser Postgres peut drop les triggers
-- (et ne doit pas être utilisé par l'app)
COMMENT ON TRIGGER audit_logs_no_update ON audit_logs IS
  'Append-only enforcement. Drop requires DBA + signed change ticket.';
```

---

## 7. Structure de dossiers

```
services/audit-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.validation.ts
│   │   └── app.config.ts
│   ├── audit/
│   │   ├── audit.module.ts
│   │   ├── audit.controller.ts
│   │   ├── audit.service.ts
│   │   ├── audit.consumer.ts         # RabbitMQ consumer
│   │   ├── audit.cron.ts             # Scellement horaire
│   │   ├── repositories/
│   │   │   └── audit-log.repository.ts
│   │   ├── services/
│   │   │   ├── hash.service.ts       # SHA-256 + canonicalize
│   │   │   ├── signing.service.ts    # Ed25519 via Vault
│   │   │   └── verification.service.ts
│   │   └── dtos/
│   │       ├── ingest.dto.ts
│   │       ├── query.dto.ts
│   │       └── proof.dto.ts
│   ├── health/
│   │   └── health.controller.ts
│   └── prisma/
│       └── prisma.service.ts
├── test/
│   ├── audit.e2e-spec.ts
│   └── chain-integrity.e2e-spec.ts
├── scripts/
│   └── verify-chain.ts               # CLI offline
├── Dockerfile
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## 8. Implémentation NestJS

### 8.1 `main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NINA-AES · audit-service')
    .setDescription("Journal d'audit immuable avec chaîne Merkle SHA-256")
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  // RabbitMQ consumer (hybrid app)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL!],
      queue: 'audit.log',
      queueOptions: { durable: true },
      noAck: false, // manual ack pour idempotence
      prefetchCount: 1, // ordering garanti par consumer unique
    },
  });

  await app.startAllMicroservices();
  const port = Number(process.env.PORT ?? 3007);
  await app.listen(port);
  Logger.log(`audit-service démarré sur :${port}`, 'Bootstrap');
}

bootstrap();
```

### 8.2 `hash.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import canonicalize from 'canonicalize';

@Injectable()
export class HashService {
  /**
   * Calcule le hash canonique d'un payload JSON.
   * Utilise JCS (RFC 8785) pour la reproductibilité bit-à-bit.
   */
  canonicalHash(payload: unknown): string {
    const canonical = canonicalize(payload);
    if (!canonical) {
      throw new Error('Payload non canonicalisable');
    }
    return bytesToHex(sha256(new TextEncoder().encode(canonical)));
  }

  /**
   * Calcule le merkleHash d'une ligne : SHA256(prev || payloadHash || ts || eventId)
   * Les 4 composants sont concaténés en hexadécimal (séparateur pipe).
   */
  chainHash(params: {
    previousHash: string;
    payloadHash: string;
    timestamp: Date;
    sourceEventId: string;
  }): string {
    const ts = params.timestamp.toISOString();
    const concat = `${params.previousHash}|${params.payloadHash}|${ts}|${params.sourceEventId}`;
    return bytesToHex(sha256(new TextEncoder().encode(concat)));
  }
}
```

### 8.3 `audit-log.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère le dernier log (pour chainage). Utilise SELECT ... FOR UPDATE
   * pour garantir l'atomicité en cas de concurrence.
   */
  async getLastLogForInsert(tx: Prisma.TransactionClient) {
    const result = await tx.$queryRaw<
      Array<{ id: bigint; merkle_hash: string }>
    >`SELECT id, merkle_hash FROM audit_logs ORDER BY id DESC LIMIT 1 FOR UPDATE`;
    return result[0] ?? null;
  }

  async appendTx(tx: Prisma.TransactionClient, data: Prisma.AuditLogCreateInput) {
    return tx.auditLog.create({ data });
  }

  async findByIdRange(fromId: bigint, toId: bigint) {
    return this.prisma.auditLog.findMany({
      where: { id: { gte: fromId, lte: toId } },
      orderBy: { id: 'asc' },
    });
  }

  async findById(id: bigint) {
    return this.prisma.auditLog.findUnique({ where: { id } });
  }

  async findFiltered(params: {
    actorId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.actorId && { actorId: params.actorId }),
      ...(params.action && { action: params.action }),
      ...(params.resourceType && { resourceType: params.resourceType }),
      ...(params.resourceId && { resourceId: params.resourceId }),
      ...((params.from || params.to) && {
        createdAt: {
          ...(params.from && { gte: params.from }),
          ...(params.to && { lte: params.to }),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { id: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total };
  }
}
```

### 8.4 `audit.service.ts`

```typescript
import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { HashService } from './services/hash.service';
import { IngestEventDto } from './dtos/ingest.dto';

const GENESIS_HASH = '0'.repeat(64); // racine de la chaîne

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuditLogRepository,
    private readonly hash: HashService,
  ) {}

  /**
   * Append une ligne d'audit. Transaction Postgres pour garantir :
   *  - SELECT ... FOR UPDATE du dernier log
   *  - INSERT avec previousHash correct
   *  - rollback si contrainte UNIQUE sur source_event_id viole
   */
  async append(event: IngestEventDto) {
    return this.prisma.$transaction(async (tx) => {
      const last = await this.repo.getLastLogForInsert(tx);
      const previousHash = last?.merkle_hash ?? GENESIS_HASH;

      const payloadHash = this.hash.canonicalHash(event.payload);
      const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
      const merkleHash = this.hash.chainHash({
        previousHash,
        payloadHash,
        timestamp,
        sourceEventId: event.sourceEventId,
      });

      try {
        const log = await this.repo.appendTx(tx, {
          sourceEventId: event.sourceEventId,
          actorId: event.actorId ?? null,
          actorRole: event.actorRole ?? null,
          action: event.action,
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          payload: event.payload as object,
          payloadHash,
          previousHash,
          merkleHash,
          ipAddress: event.ipAddress ?? null,
          userAgent: event.userAgent ?? null,
          traceId: event.traceId ?? null,
        });

        this.logger.log({
          msg: 'audit.appended',
          id: Number(log.id),
          action: log.action,
          actorId: log.actorId,
          merkleHash: log.merkleHash.slice(0, 16) + '...',
        });

        return log;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('source_event_id')) {
          // Idempotence : l'événement a déjà été consommé → silence
          this.logger.warn(`Événement déjà ingéré : ${event.sourceEventId}`);
          throw new ConflictException('duplicate_source_event_id');
        }
        throw err;
      }
    });
  }

  /**
   * Vérifie l'intégrité d'un intervalle de logs.
   * Re-calcule chaque merkleHash et compare à la valeur stockée.
   */
  async verifyRange(fromId: bigint, toId: bigint) {
    const logs = await this.repo.findByIdRange(fromId, toId);
    if (logs.length === 0) {
      return { valid: true, checked: 0, firstInvalidId: null };
    }

    let expectedPrev: string = logs[0].previousHash;
    let checked = 0;
    for (const log of logs) {
      const payloadHash = this.hash.canonicalHash(log.payload);
      const recomputed = this.hash.chainHash({
        previousHash: expectedPrev,
        payloadHash,
        timestamp: log.createdAt,
        sourceEventId: log.sourceEventId,
      });
      if (recomputed !== log.merkleHash) {
        return {
          valid: false,
          checked,
          firstInvalidId: Number(log.id),
          reason: 'merkle_mismatch',
        };
      }
      if (log.payloadHash !== payloadHash) {
        return {
          valid: false,
          checked,
          firstInvalidId: Number(log.id),
          reason: 'payload_tampered',
        };
      }
      expectedPrev = log.merkleHash;
      checked++;
    }
    return { valid: true, checked, firstInvalidId: null };
  }

  /**
   * Retourne la preuve cryptographique d'un log précis :
   * - le log lui-même
   * - la chaîne remontant jusqu'à la dernière racine signée
   * - la racine + signature Ed25519
   */
  async getProof(logId: bigint) {
    const log = await this.repo.findById(logId);
    if (!log) return null;

    // Chercher la racine signée la plus proche après ce log
    const nearestRoot = await this.prisma.auditRoot.findFirst({
      where: { lastLogId: { gte: logId } },
      orderBy: { signedAt: 'asc' },
    });

    // Chaîne entre logId et nearestRoot.lastLogId
    const chain = nearestRoot ? await this.repo.findByIdRange(logId, nearestRoot.lastLogId) : [log];

    return {
      log,
      chain: chain.map((l) => ({
        id: Number(l.id),
        merkleHash: l.merkleHash,
        previousHash: l.previousHash,
      })),
      root: nearestRoot
        ? {
            chainRootHash: nearestRoot.chainRootHash,
            signedAt: nearestRoot.signedAt,
            signature: nearestRoot.signature,
            logCountCovered: nearestRoot.logCountCovered,
          }
        : null,
    };
  }
}
```

### 8.5 `audit.consumer.ts`

```typescript
import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { AuditService } from './audit.service';
import { IngestEventDto } from './dtos/ingest.dto';
import { validateOrReject } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Controller()
export class AuditConsumer {
  private readonly logger = new Logger(AuditConsumer.name);

  constructor(private readonly auditService: AuditService) {}

  @EventPattern('audit.event')
  async handleAuditEvent(@Payload() payload: unknown, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const dto = plainToInstance(IngestEventDto, payload);
      await validateOrReject(dto);
      await this.auditService.append(dto);
      channel.ack(originalMsg);
    } catch (err) {
      const isDuplicate = err instanceof Error && err.message.includes('duplicate_source_event_id');
      if (isDuplicate) {
        // idempotent : on acknowledge quand même
        channel.ack(originalMsg);
        return;
      }
      this.logger.error({ err, payload }, 'audit.event.failed');
      // nack + requeue=false → va en DLQ (dead-letter queue)
      channel.nack(originalMsg, false, false);
    }
  }
}
```

### 8.6 `audit.controller.ts`

```typescript
import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dtos/query.dto';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { Throttle } from '@nestjs/throttler';
// Décorateur + clés depuis @nina-aes/auth-guards (type-only depuis ADR-027) ; classes Guards
// locales au service (à copier dans services/audit-service/src/auth/guards/).
import { Roles } from '@nina-aes/auth-guards';
import { JwtAuthGuard, RolesGuard } from '../auth/guards/index.js';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly repo: AuditLogRepository,
  ) {}

  @Get()
  @Roles('AUDITOR', 'ADMIN', 'ANTICORRUPTION_INSPECTOR')
  @ApiOperation({ summary: 'Recherche paginée des logs (filtrage)' })
  async list(@Query() query: QueryAuditDto) {
    return this.repo.findFiltered({
      actorId: query.actorId,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      skip: query.skip,
      take: query.take,
    });
  }

  @Get(':id')
  @Roles('AUDITOR', 'ADMIN', 'ANTICORRUPTION_INSPECTOR')
  @ApiOperation({ summary: 'Lire un log par ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.repo.findById(BigInt(id));
  }

  @Get(':id/proof')
  @Roles('AUDITOR', 'ADMIN', 'ANTICORRUPTION_INSPECTOR')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: "Preuve cryptographique d'un log (chaîne + racine signée)",
  })
  @ApiOkResponse({ description: 'Log + chaîne + racine Ed25519' })
  async proof(@Param('id', ParseIntPipe) id: number) {
    return this.auditService.getProof(BigInt(id));
  }

  @Get('verify/range')
  @Roles('AUDITOR', 'ADMIN')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @ApiOperation({
    summary: "Vérification d'intégrité d'un intervalle",
  })
  async verifyRange(
    @Query('from', ParseIntPipe) from: number,
    @Query('to', ParseIntPipe) to: number,
  ) {
    return this.auditService.verifyRange(BigInt(from), BigInt(to));
  }

  @Get('roots/latest')
  @Roles('AUDITOR', 'ADMIN', 'ANTICORRUPTION_INSPECTOR')
  @ApiOperation({ summary: 'Dernière racine signée Ed25519' })
  async latestRoot() {
    return this.auditService['prisma'].auditRoot.findFirst({
      orderBy: { signedAt: 'desc' },
    });
  }
}
```

### 8.7 DTOs

`src/audit/dtos/ingest.dto.ts`

```typescript
import { IsString, IsUUID, IsOptional, IsObject, IsIP, IsISO8601 } from 'class-validator';

export class IngestEventDto {
  @IsUUID('4')
  sourceEventId!: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  actorRole?: string;

  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsISO8601()
  timestamp?: string;
}
```

`src/audit/dtos/query.dto.ts`

```typescript
import { IsOptional, IsString, IsISO8601, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditDto {
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) take?: number = 50;
}
```

---

## 9. Intégration événementielle RabbitMQ

### 9.1 Exchanges et queue

> **Implémentation de référence** : `services/audit-service/src/audit/audit.consumer.ts` (basé sur
> `amqp-connection-manager`, reconnexion auto). Les exemples ci-dessous illustrent le modèle ; les
> noms exacts proviennent du schéma d'env (`env.schema.ts`) et de
> `infrastructure/docker/rabbitmq/definitions.json`.

Le consumer déclare (idempotent) **deux** exchanges + **une** queue, puis lie la queue aux deux :

```typescript
// audit.consumer.ts — topologie (valeurs par défaut de env.schema.ts)
const RABBITMQ_AUDIT_EXCHANGE = 'nina.audit'; // fanout — audit explicite
const RABBITMQ_EVENTS_EXCHANGE = 'nina.events'; // topic  — événements métier
const RABBITMQ_AUDIT_QUEUE = 'audit.log'; // durable, x-message-ttl 7 j
// AUDIT_EVENT_PATTERNS : citizen.#, correction.#, agent.#, governance.#,
//   document.#, identity.#, appointment.#, vulnerability.#, interop.#

await ch.assertExchange(RABBITMQ_AUDIT_EXCHANGE, 'fanout', { durable: true });
await ch.assertExchange(RABBITMQ_EVENTS_EXCHANGE, 'topic', { durable: true });
await ch.assertQueue(RABBITMQ_AUDIT_QUEUE, { durable: true });
await ch.bindQueue(RABBITMQ_AUDIT_QUEUE, RABBITMQ_AUDIT_EXCHANGE, ''); // tout le fanout
for (const pattern of AUDIT_EVENT_PATTERNS) {
  await ch.bindQueue(RABBITMQ_AUDIT_QUEUE, RABBITMQ_EVENTS_EXCHANGE, pattern);
}
```

Les **publishers** sont propres à chaque service (pas de shared-lib) : ils publient sur
`nina.events` avec une clé de routage de leur domaine. Exemple : `document-service` →
`audit-publisher.service.ts` (clés `document.*`), `identity-service` → `rabbitmq.service.ts` (clés
`citizen.*` / `correction.*`).

### 9.2 Publisher (côté autres services)

Chaque service publie en `amqp-connection-manager` sur `nina.events` avec une clé de routage de son
domaine (cf. `document-service/src/audit/audit-publisher.service.ts`) :

```typescript
// fire-and-forget, jamais bloquant pour l'opération métier
await channel.publish(RABBITMQ_EVENTS_EXCHANGE /* 'nina.events' */, 'document.fdi.generated', {
  ...payload,
  source: 'document-service',
  emittedAt: new Date().toISOString(),
});
```

### 9.3 Robustesse des messages

Comportement **actuel** du consumer (`audit.consumer.ts`) : ACK différé après insertion en lot
(at-least-once + idempotence via `source_event_id UNIQUE`) ; un message non-JSON ou non normalisable
est **ACK + droppé** (pas de boucle de poison) ; la queue `audit.log` porte un `x-message-ttl` de 7
jours.

> **Évolution recommandée** : une Dead Letter Queue dédiée (`audit.dlx` → `audit.dlq`,
> `x-dead-letter-routing-key: audit.failed`) pour conserver les messages rejetés au lieu de les
> dropper, avec alerting Grafana/Loki si la DLQ dépasse 10 messages sur 5 min. _Non implémentée à ce
> jour._

---

## 10. Endpoints REST — API de preuve

| Méthode | URL                          | Rôles                     | Description                              |
| ------- | ---------------------------- | ------------------------- | ---------------------------------------- |
| GET     | `/api/v1/audit`              | AUDITOR, ADMIN, INSPECTOR | Recherche paginée filtrée                |
| GET     | `/api/v1/audit/:id`          | AUDITOR, ADMIN, INSPECTOR | Lecture d'un log                         |
| GET     | `/api/v1/audit/:id/proof`    | AUDITOR, ADMIN, INSPECTOR | Preuve cryptographique + racine signée   |
| GET     | `/api/v1/audit/verify/range` | AUDITOR, ADMIN            | Vérification d'intégrité d'un intervalle |
| GET     | `/api/v1/audit/roots/latest` | AUDITOR, ADMIN, INSPECTOR | Dernière racine signée                   |

### Exemple `curl` — preuve d'un log

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3007/api/v1/audit/12345/proof | jq
```

Réponse (tronquée) :

```json
{
  "log": {
    "id": "12345",
    "action": "correction.approve",
    "actorId": "agt-042",
    "merkleHash": "a3f9c7e8...",
    "previousHash": "b2e8d6...",
    "createdAt": "2026-04-16T14:32:01.123Z"
  },
  "chain": [
    { "id": 12345, "previousHash": "b2e8d6...", "merkleHash": "a3f9c7e8..." },
    { "id": 12346, "previousHash": "a3f9c7e8...", "merkleHash": "c4de1f..." }
  ],
  "root": {
    "chainRootHash": "c4de1f...",
    "signedAt": "2026-04-16T15:00:00.000Z",
    "signature": "ee5a2b...cf9102",
    "logCountCovered": 12346
  }
}
```

---

## 11. Script de vérification d'intégrité offline

Fichier : `services/audit-service/scripts/verify-chain.ts`

```typescript
#!/usr/bin/env ts-node
/**
 * Vérification offline de la chaîne d'audit.
 *
 * Usage :
 *   pnpm ts-node scripts/verify-chain.ts --from 1 --to 100000 [--verify-sig]
 *
 * N'utilise que @noble/hashes, @noble/ed25519 et pg.
 * Ne dépend PAS du code applicatif → preuve indépendante.
 */
import { Client } from 'pg';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import * as ed from '@noble/ed25519';
import canonicalize from 'canonicalize';

const GENESIS = '0'.repeat(64);

async function main() {
  const fromId = BigInt(process.argv[process.argv.indexOf('--from') + 1] ?? 1);
  const toId = BigInt(process.argv[process.argv.indexOf('--to') + 1] ?? Number.MAX_SAFE_INTEGER);
  const verifySig = process.argv.includes('--verify-sig');
  const pubKeyHex = process.env.AUDIT_PUBLIC_KEY_ED25519!;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, source_event_id, payload, payload_hash,
            previous_hash, merkle_hash, created_at
       FROM audit_logs
      WHERE id >= $1 AND id <= $2
      ORDER BY id ASC`,
    [fromId.toString(), toId.toString()],
  );

  if (rows.length === 0) {
    console.log("❌ Aucun log dans l'intervalle");
    process.exit(1);
  }

  let expectedPrev = rows[0].previous_hash as string;
  let checked = 0;

  for (const log of rows) {
    // 1. payloadHash
    const pHash = bytesToHex(sha256(new TextEncoder().encode(canonicalize(log.payload) ?? '')));
    if (pHash !== log.payload_hash) {
      console.error(`❌ payload_hash tampered on id=${log.id}`);
      process.exit(2);
    }

    // 2. merkleHash
    const concat = `${expectedPrev}|${pHash}|${new Date(log.created_at).toISOString()}|${log.source_event_id}`;
    const mHash = bytesToHex(sha256(new TextEncoder().encode(concat)));
    if (mHash !== log.merkle_hash) {
      console.error(`❌ merkle_hash mismatch on id=${log.id}`);
      console.error(`   expected ${mHash.slice(0, 16)}...`);
      console.error(`   stored   ${(log.merkle_hash as string).slice(0, 16)}...`);
      process.exit(3);
    }

    expectedPrev = log.merkle_hash;
    checked++;
  }

  console.log(
    `✅ Chaîne valide : ${checked} logs vérifiés (id ${rows[0].id} → ${rows[rows.length - 1].id})`,
  );

  // 3. (Optionnel) Signatures Ed25519 des racines
  if (verifySig) {
    const roots = await client.query(
      `SELECT chain_root_hash, signed_at, signature
         FROM audit_roots
        WHERE last_log_id >= $1 AND last_log_id <= $2`,
      [fromId.toString(), toId.toString()],
    );
    const pubKey = Uint8Array.from(Buffer.from(pubKeyHex, 'hex'));
    for (const r of roots.rows) {
      const msg = new TextEncoder().encode(
        `${r.chain_root_hash}|${new Date(r.signed_at).toISOString()}`,
      );
      const sigBytes = Uint8Array.from(Buffer.from(r.signature, 'hex'));
      const ok = await ed.verifyAsync(sigBytes, msg, pubKey);
      if (!ok) {
        console.error(
          `❌ Signature Ed25519 INVALIDE pour racine ${r.chain_root_hash.slice(0, 16)}...`,
        );
        process.exit(4);
      }
    }
    console.log(`✅ ${roots.rows.length} racines Ed25519 vérifiées`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
```

Usage :

```bash
DATABASE_URL=postgres://... \
AUDIT_PUBLIC_KEY_ED25519=deadbeef... \
pnpm ts-node services/audit-service/scripts/verify-chain.ts --from 1 --to 1000000 --verify-sig
```

---

## 12. Signature périodique de la racine

### 12.1 `signing.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as ed from '@noble/ed25519';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private keyId: string | null = null;

  constructor(private readonly config: ConfigService) {}

  async loadKeyFromVault() {
    const vaultAddr = this.config.getOrThrow<string>('VAULT_ADDR');
    const vaultToken = this.config.getOrThrow<string>('VAULT_TOKEN');
    const path = this.config.get<string>('VAULT_SIGNING_KEY_PATH', 'secret/data/audit/signing-key');

    const { data } = await axios.get(`${vaultAddr}/v1/${path}`, {
      headers: { 'X-Vault-Token': vaultToken },
    });

    const privateHex: string = data.data.data.private_key_hex;
    const publicHex: string = data.data.data.public_key_hex;
    this.keyId = data.data.data.key_id ?? 'default';
    this.privateKey = Uint8Array.from(Buffer.from(privateHex, 'hex'));
    this.publicKey = Uint8Array.from(Buffer.from(publicHex, 'hex'));

    this.logger.log(`Clé Ed25519 chargée depuis Vault — keyId=${this.keyId}`);
  }

  async sign(message: string): Promise<string> {
    if (!this.privateKey) await this.loadKeyFromVault();
    const sig = await ed.signAsync(new TextEncoder().encode(message), this.privateKey!);
    return Buffer.from(sig).toString('hex');
  }

  getKeyId(): string {
    return this.keyId ?? 'unknown';
  }
}
```

### 12.2 `audit.cron.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SigningService } from './services/signing.service';

@Injectable()
export class AuditCron {
  private readonly logger = new Logger(AuditCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sealChainRoot() {
    const lastLog = await this.prisma.auditLog.findFirst({
      orderBy: { id: 'desc' },
    });
    if (!lastLog) {
      this.logger.warn('Aucun log à sceller');
      return;
    }

    const signedAt = new Date();
    const message = `${lastLog.merkleHash}|${signedAt.toISOString()}`;
    const signature = await this.signing.sign(message);

    const logCount = await this.prisma.auditLog.count();

    await this.prisma.auditRoot.create({
      data: {
        chainRootHash: lastLog.merkleHash,
        lastLogId: lastLog.id,
        logCountCovered: logCount,
        signedAt,
        signature,
        signingKeyId: this.signing.getKeyId(),
      },
    });

    this.logger.log({
      msg: 'chain.root.sealed',
      root: lastLog.merkleHash.slice(0, 16),
      logs: logCount,
    });
  }
}
```

---

## 13. Rétention 10 ans et archivage WORM

### 13.1 Politique de rétention

| Donnée                         | Rétention     | Stockage                                     |
| ------------------------------ | ------------- | -------------------------------------------- |
| `audit_logs` chauds            | 2 ans         | Postgres primaire                            |
| `audit_logs` tièdes            | 2 → 10 ans    | Postgres partitions froides (SSD lent)       |
| `audit_logs` froids (> 10 ans) | Déplacement   | MinIO bucket WORM (lock retention)           |
| `audit_roots`                  | **Perpétuel** | Postgres + MinIO + publication externe hebdo |

### 13.2 Partitionnement mensuel

Postgres 18 : partitions déclaratives par mois sur `created_at`, en utilisant `pg_partman`
(extension).

```sql
CREATE TABLE audit_logs_template (LIKE audit_logs INCLUDING ALL) PARTITION BY RANGE (created_at);

SELECT partman.create_parent(
  p_parent_table => 'public.audit_logs',
  p_control => 'created_at',
  p_type => 'range',
  p_interval => '1 month',
  p_premake => 3
);
```

### 13.3 Script d'archivage mensuel

```bash
# scripts/archive-audit-monthly.sh
month=$(date -d "13 months ago" +%Y-%m)
pg_dump --table=audit_logs_${month//-/_} -Fc nina_aes_db > /tmp/audit_${month}.dump
openssl enc -aes-256-gcm -pbkdf2 -in /tmp/audit_${month}.dump -out /tmp/audit_${month}.enc -pass file:/etc/nina/archive.key
mc cp /tmp/audit_${month}.enc minio/nina-audit-archive/${month}/
mc retention set --default GOVERNANCE "10y" minio/nina-audit-archive/${month}/
psql -c "DROP TABLE audit_logs_${month//-/_}"
```

---

## 14. Tests (unit + e2e + intégration)

### 14.1 `hash.service.spec.ts` (unit)

```typescript
describe('HashService', () => {
  const h = new HashService();

  it("canonicalHash est déterministe peu importe l'ordre des clés", () => {
    const a = { b: 2, a: 1, c: { y: 2, x: 1 } };
    const b = { a: 1, b: 2, c: { x: 1, y: 2 } };
    expect(h.canonicalHash(a)).toEqual(h.canonicalHash(b));
  });

  it('chainHash change si previousHash change', () => {
    const base = { payloadHash: 'a', timestamp: new Date(0), sourceEventId: 'uuid-1' };
    expect(h.chainHash({ previousHash: 'x', ...base })).not.toEqual(
      h.chainHash({ previousHash: 'y', ...base }),
    );
  });
});
```

### 14.2 `chain-integrity.e2e-spec.ts` (E2E avec Testcontainers)

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer } from '@testcontainers/rabbitmq';

describe('Chain Integrity (e2e)', () => {
  let pg: StartedPostgreSqlContainer;
  let rmq: StartedRabbitMQContainer;
  let app: INestApplication;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer().start();
    rmq = await new RabbitMQContainer().start();
    process.env.DATABASE_URL = pg.getConnectionUri();
    process.env.RABBITMQ_URL = rmq.getAmqpUrl();
    app = await bootstrapTestApp();
    await runPrismaMigrations();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await pg.stop();
    await rmq.stop();
  });

  it('ingère 100 événements et la chaîne reste valide', async () => {
    for (let i = 0; i < 100; i++) {
      await publishEvent({
        action: 'citizen.read',
        actorId: `agent-${i % 5}`,
        payload: { nina: `1234567890123${i}A`, ts: Date.now() },
      });
    }
    await waitForProcessed(100);

    const result = await request(app.getHttpServer())
      .get('/api/v1/audit/verify/range?from=1&to=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(result.body.valid).toBe(true);
    expect(result.body.checked).toBe(100);
  });

  it('détecte une falsification directe en base', async () => {
    // Hack : désactiver le trigger temporairement (simule attaque DBA)
    await pgClient.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update');
    await pgClient.query(`UPDATE audit_logs SET payload = '{"hacked":true}' WHERE id = 50`);
    await pgClient.query('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update');

    const result = await request(app.getHttpServer())
      .get('/api/v1/audit/verify/range?from=1&to=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(result.body.valid).toBe(false);
    expect(result.body.reason).toBe('payload_tampered');
    expect(result.body.firstInvalidId).toBe(50);
  });

  it('rejette un UPDATE via rôle applicatif nina_app', async () => {
    // Utilise le rôle restreint (trigger actif)
    const appClient = new Client({ connectionString: appOnlyUrl });
    await appClient.connect();
    await expect(
      appClient.query(`UPDATE audit_logs SET action = 'hacked' WHERE id = 1`),
    ).rejects.toThrow(/append-only/);
    await appClient.end();
  });
});
```

### 14.3 Couverture minimale

Configuration dans `jest.config.ts` :

```typescript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 85,
    lines: 85,
    statements: 85,
  },
},
```

---

## 15. Swagger + OpenAPI

Accessible sur `http://localhost:3007/api/docs`.

Les 5 endpoints sont documentés avec :

- Exemples de requête et réponse
- Codes d'erreur (401, 403, 404, 429)
- Rate limits par endpoint
- Schémas Zod convertis via `nestjs-zod` pour cohérence DTO ↔ doc

---

## 16. Mini-rapport d'étape (template)

```markdown
# Rapport d'étape — Document 09 — audit-service

**Date** : **\_\_\_\_** **Durée passée** : ** h (estimation : 12–16 h) **Commit de fin** :
**\_\_\_\_\*\*\*\*

## Fonctionnel

- [ ] `append()` via RabbitMQ fonctionne
- [ ] Chaîne Merkle valide sur 1000+ événements
- [ ] `GET /audit/:id/proof` retourne racine signée
- [ ] Tentative UPDATE rejetée par trigger
- [ ] Scellement horaire Ed25519 fonctionne

## Tests

| Type           | Passent ? | Couverture |
| -------------- | --------- | ---------- |
| Unit           |           | \_\_ %     |
| E2E            |           | \_\_ %     |
| Testcontainers |           | —          |

## Problèmes rencontrés

- ***

## Apprentissages principaux

- ***

## Prochaines étapes

- Document 10 — document-service (PDF + QR JWT)
```

---

## 17. Checklist de fin d'étape

- [ ] ✅ Migrations Prisma incluent triggers append-only
- [ ] ✅ Rôle DB `nina_app` n'a **pas** de `UPDATE`/`DELETE` sur `audit_logs`
- [ ] ✅ Consumer RabbitMQ ack/nack correctement
- [ ] ✅ Idempotence via `source_event_id UNIQUE`
- [ ] ✅ Dead-Letter Queue configurée
- [ ] ✅ Script `verify-chain.ts` exécute sans erreur sur 1000 logs
- [ ] ✅ Cron horaire scelle la racine + signature Ed25519 valide
- [ ] ✅ Clé Ed25519 chargée depuis Vault (jamais hardcodée)
- [ ] ✅ Swagger accessible sur `/api/docs`
- [ ] ✅ Couverture tests ≥ 85%
- [ ] ✅ Healthcheck `GET /health` retourne 200 avec Postgres + RabbitMQ UP
- [ ] ✅ Commit Conventional Commits : `feat(audit): append-only Merkle chain + Ed25519 sealing`
- [ ] ✅ ADR alignées (pas de nouvel ADR : la numérotation 009 est déjà prise par
      `rabbitmq-event-bus`) : [ADR-006 — Merkle audit trail](./adr/ADR-006-merkle-audit-trail.md),
      [ADR-026 — Immutabilité du journal d'audit](./adr/ADR-026-audit-log-immutability.md),
      [ADR-007 — Ed25519](./adr/ADR-007-ed25519-interop-aes.md),
      [ADR-027 — Guards locaux par service](./adr/ADR-027-guards-local-per-service.md)

---

## 18. Pour aller plus loin

1. **Anchoring public** : publier le hash de la racine horaire sur une chaîne publique (Bitcoin
   OP_RETURN, Ethereum L2, ou simplement un tweet institutionnel hebdomadaire) pour preuve
   d'existence temporelle externe.
2. **HSM hardware** : passer d'une clé Ed25519 stockée dans Vault à un HSM YubiHSM 2 ou AWS CloudHSM
   pour mettre la clé hors-ligne.
3. **Merkle tree** (vrai) : passer du hash chain linéaire à un arbre Merkle binaire pour
   proof-of-inclusion en O(log n) plutôt que O(n).
4. **Transparency log** (type Certificate Transparency) : permettre à n'importe qui de vérifier que
   son nom n'a pas été accédé sans trace, via un monitor externe.
5. **Multi-signataires** : exiger 2 signatures Ed25519 (ministère + auditeur externe) pour sceller
   la racine → défense contre insider threat absolu.
6. **Benchmark** : ingérer 1M de logs et mesurer le temps de vérification — devrait être < 5 min sur
   un i7 standard (SHA-256 à 500 MB/s).

---

_Document 09 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_ _Prochain
document : [10 — Document Service (PDF + QR JWT)](./10-BACKEND-DOCUMENT-SERVICE.md)_
