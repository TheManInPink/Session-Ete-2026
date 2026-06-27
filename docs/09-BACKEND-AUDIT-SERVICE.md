# 09 — Backend : Audit-Service (NestJS 11 + Hash-Chain SHA-256)

> **Projet** : NINA-AES Platform **Document** : 09/26 **Service** : `audit-service` — Journal
> d'audit append-only, **hash-chain SHA-256 linéaire** (ADR-007 — _pas_ un arbre de Merkle), preuve
> cryptographique **Port** : `3007` **Stack** : NestJS 11.1 · PostgreSQL 18 · Prisma 7.6 · RabbitMQ
> 4.2 · Ed25519 (in-process) · SHA-256 · Redis 8.6 **Auteur** : Étudiant UQAR **Date** : Avril 2026
> (harden as-built mai 2026) **Prérequis** :
> [Document 07 — Identity Service](./07-BACKEND-IDENTITY-SERVICE.md) ·
> [Document 08 — Auth Service](./08-BACKEND-AUTH-SERVICE.md)

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Pourquoi un audit immuable ? Le problème de la NINA et la souveraineté numérique](#2-pourquoi-un-audit-immuable)
3. [Technologies utilisées (versions avril 2026)](#3-technologies-utilisées)
4. [Architecture du microservice audit-service](#4-architecture-du-microservice-audit-service)
5. [Théorie — Hash-chain SHA-256 append-only (ADR-007)](#5-théorie--hash-chain)
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
existante, la **hash-chain** se rompt et la falsification devient **prouvable devant un tribunal**.

> **Vocabulaire (ADR-007)** : ce service implémente une **hash-chain SHA-256 linéaire**, _pas_ un
> arbre de Merkle. Chaque ligne chaîne le hash de la précédente (`previousHash`) — on parle parfois
> de « racine » (`chainRootHash`) par abus de langage pour désigner le dernier maillon scellé, mais
> il ne s'agit **pas** d'une racine d'arbre binaire et il n'y a **pas** de proof-of-inclusion en
> O(log n). Le vrai arbre de Merkle reste une évolution possible (cf. §18). **Intégrité juridique**
> : la hash-chain n'est opposable que si la racine périodique est **ancrée chez un tiers** (OCLEI /
> Vérificateur Général) — l'ancrage externe est **conçu, à implémenter en Phase 2** (cf. §5.2, §18).

### Ce que tu vas apprendre

| Compétence             | Niveau        | Application au projet                                 |
| ---------------------- | ------------- | ----------------------------------------------------- |
| Hash-chain SHA-256     | Expert        | Implémentation maison SHA-256 linéaire + preuve       |
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
- **Hash-chain SHA-256 linéaire** fonctionnelle avec `previousHash` + `merkleHash`
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

| Menace                 | Contre-mesure                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Suppression            | Trigger Postgres `BEFORE DELETE` qui raise une exception                                                                     |
| Modification           | Trigger Postgres `BEFORE UPDATE` qui raise une exception                                                                     |
| Substitution           | Hash-chain : chaque ligne contient `hash(N-1)` + son propre `hash`                                                           |
| Collusion DBA          | Scellement Ed25519 horaire de la racine + ancrage tiers (OCLEI)                                                              |
| Perte réseau           | Réplication WORM (Write-Once-Read-Many) sur MinIO chaque nuit                                                                |
| Falsification d'acteur | Origine **tracée + signature publisher vérifiée si déployée** (sinon confiance mTLS canal ; fail-closed en prod) — voir §9.4 |

### Propriétés garanties

- **Intégrité** : toute ligne modifiée brise la hash-chain (détection cryptographique).
- **Non-répudiation** : la signature Ed25519 horaire prouve l'existence d'une ligne avant un instant
  T — **à condition** que la racine soit ancrée chez un tiers (sinon le détenteur de la clé pourrait
  re-signer une chaîne réécrite ; cf. §5.2 + §18). Ancrage tiers **à implémenter en Phase 2**.
- **Authenticité de l'acteur** _(garantie graduée, cf. §9.4)_ : l'origine de chaque événement est
  **tracée** (émetteur broker réel scellé dans `_meta.origin`, couvert par le `payloadHash` → forge
  détectable a posteriori). L'**authentification forte** de l'émetteur repose sur (1) le maillage
  **mTLS Linkerd** au niveau canal (garantie « un service du mesh l'a émis », ⏳ INFRA) et (2) la
  **signature publisher Ed25519** vérifiée au niveau message **quand une clé est enregistrée** pour
  l'émetteur (`AUDIT_PUBLISHER_KEYS`) — alors une signature absente/invalide est rejetée. Tant que
  la signature n'est pas généralisée à tous les publishers, la garantie par défaut reste « un
  service du mesh l'a émis », pas « ce service précis » ; en **production**, le fail-open est
  interdit (`AUDIT_REQUIRE_SIGNED_ORIGIN=true` forcé au boot). La trace `_meta.origin` ne constitue
  pas, à elle seule, une authentification.
- **Auditabilité** : un inspecteur peut vérifier la chaîne **sans** accès à la base (script
  offline + racines signées + clé publique Ed25519 publiée).

---

## 3. Technologies utilisées

| Dépendance                   | Version   | Rôle                                                |
| ---------------------------- | --------- | --------------------------------------------------- |
| `@nestjs/common`             | `11.1.18` | Core NestJS                                         |
| `@nestjs/core`               | `11.1.18` | Runtime                                             |
| `@nestjs/platform-express`   | `11.1.18` | Adaptateur HTTP                                     |
| `@nestjs/config`             | `4.1.2`   | `.env` via Zod                                      |
| `@nestjs/swagger`            | `11.2.0`  | OpenAPI 3.1                                         |
| `@nestjs/terminus`           | `11.1.0`  | Healthchecks                                        |
| `@nestjs/schedule`           | `6.1.0`   | Cron scellement Ed25519                             |
| `@nestjs/throttler`          | `6.5.0`   | Rate-limiting endpoints de preuve                   |
| `prisma`                     | `7.6.2`   | ORM                                                 |
| `@prisma/client`             | `7.6.2`   | Client DB                                           |
| `amqplib`                    | `0.10.4`  | Types/protocole AMQP                                |
| `amqp-connection-manager`    | `4.1.x`   | Consumer RabbitMQ (reconnexion auto, modèle unique) |
| `ioredis`                    | `5.6.1`   | Cache racine signée                                 |
| `zod`                        | `4.3.6`   | Validation DTO + env                                |
| `pino`                       | `9.12.0`  | Logger structuré                                    |
| `nestjs-pino`                | `4.5.0`   | Bridge pino/NestJS                                  |
| `@noble/ed25519`             | `2.3.0`   | Signature Ed25519 sans dépendance C                 |
| `@noble/hashes`              | `1.9.0`   | SHA-256/512 constant-time                           |
| `class-validator`            | `0.14.2`  | Validation DTO                                      |
| `class-transformer`          | `0.5.1`   | Sérialisation                                       |
| `jest`                       | `30.2.0`  | Tests unitaires                                     |
| `supertest`                  | `7.2.0`   | Tests E2E                                           |
| `@testcontainers/postgresql` | `11.0.0`  | Postgres jetable pour tests                         |
| `@testcontainers/rabbitmq`   | `11.0.0`  | RabbitMQ jetable pour tests                         |

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
- **Scellement in-process** : Vault Transit **ne supporte pas Ed25519** (cf. ADR-026/034) — le
  scellement de la racine est donc effectué **in-process** avec `@noble/ed25519` (clé chargée depuis
  Vault KV, cf. §12), et **non** via Vault Transit. La signature du QR (autre service) est, elle,
  RS256 via Transit ; ce sont deux usages distincts. Voir
  [ADR-007 — Hash-chain audit](./adr/ADR-007-merkle-audit.md) et
  [ADR-034 — Sécurité (Vault/mTLS/OWASP)](./adr/ADR-034-security-hardening-vault-mtls-owasp.md).

---

## 4. Architecture du microservice audit-service

```
┌─────────────────────────────────────────────────────────────────────┐
│                     audit-service :3007  (port unique)             │
│                                                                     │
│  ┌────────────────┐    ┌────────────────┐    ┌──────────────────┐  │
│  │  HTTP REST API │    │ AMQP Consumer  │    │  Cron Scheduler  │  │
│  │  /audit/*      │    │ nina.events    │    │ @Cron hourly     │  │
│  └────────┬───────┘    └────────┬───────┘    └─────────┬────────┘  │
│           │                     │                      │           │
│           ▼                     ▼                      ▼           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                  AuditService (core)                          │ │
│  │  - append(event)     : chained INSERT + hash de chaînage      │ │
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
3. **Consumer idempotent** : chaque événement porte un `sourceEventId` — double-insertion impossible
   grâce à la contrainte `UNIQUE` sur `source_event_id`.
4. **Racine signée toutes les heures** par `SigningService` (Ed25519 **in-process** `@noble`, clé
   chargée depuis **Vault KV**). **Cible** : auth Vault par **AppRole / K8s ServiceAccount** (lease
   court), **jamais** par `VAULT_TOKEN` long-lived. ⚠️ **État as-built** : `vault.module.ts` utilise
   encore `method: 'token'` (`VAULT_TOKEN`, défaut dev `nina-dev-root-token`) ; la bascule vers
   `vaultClientFromEnv()` (qui supporte `approle`/`kubernetes`, déjà présents dans
   `@nina-aes/vault-client`) est un **durcissement ⏳ Phase 2** (cf. §12.1).
5. **Origine des événements authentifiée** (mTLS Linkerd ou signature publisher) pour empêcher la
   falsification d'acteur (cf. §9.4).

---

## 5. Théorie — Hash-chain SHA-256 append-only (ADR-007)

> **Pourquoi « hash-chain » et pas « Merkle » ?** Un arbre de Merkle hache des feuilles par paires
> jusqu'à une racine unique et permet une _preuve d'inclusion_ en O(log n). Ici, on chaîne
> **linéairement** chaque ligne à la précédente : c'est plus simple, suffisant pour la détection de
> falsification, et c'est ce que tranche **ADR-007**. Le nom de colonne `merkleHash` est conservé
> pour compatibilité du schéma, mais il désigne le **hash de chaînage** d'une chaîne linéaire.

### 5.1 Hash-chain simple

Chaque ligne d'audit contient :

```
payloadHash_N = SHA256( canonicalJson({action, actorType, correlationId, entityId, entityType,
                                        ipAddress, newValue, oldValue, sourceEventId, userId}) )
merkleHash_N  = SHA256( previousHash_N-1 | payloadHash_N | occurredAt_N(ISO) | sourceEventId_N )
```

(Voir le calcul exact `src/audit/chain.ts` ; `canonicalJson` trie récursivement les clés car JSONB
réordonne au stockage — la **même** fonction est utilisée par le script offline §11.)

Si un attaquant modifie la ligne `N`, alors `merkleHash_N` ne correspond plus → détection. S'il
modifie `N` **et** recalcule `merkleHash_N` proprement, alors `merkleHash_N` change, donc
`previousHash_N+1` pointe vers une valeur erronée → **la ligne N+1 détecte l'intrusion**.

Pour masquer intégralement, l'attaquant devrait recalculer **toute la chaîne jusqu'à la fin** ET
re-signer toutes les racines horaires (`audit_roots`, signées **in-process** avec `@noble/ed25519`).
La clé privée provient de **Vault KV** (politique `deny-by-default` ; auth **cible** AppRole/K8s —
as-built encore `VAULT_TOKEN`, cf. §12.1) ; sans elle, réécrire les signatures est **infaisable** —
mais voir la limite §5.2 (compromission de la clé → nécessité d'un ancrage tiers).

### 5.2 Racine périodique (ancrage temporel)

Toutes les 60 min, `SigningService` :

1. Lit `MAX(id)` de `audit_logs` → `lastId`.
2. Lit `merkleHash` de cette ligne → `chainRoot`.
3. Signe `SHA256(chainRoot || timestamp)` avec la clé privée Ed25519.
4. Insère dans `audit_roots` : `(chainRootHash, signedAt, signature, logCountCovered)`.

Résultat : un attaquant qui réécrit la base **sans** la clé privée ne peut pas reforger les
signatures → falsification détectée.

> ⚠️ **Limite honnête (à ne pas survendre)** : si l'attaquant **obtient la clé privée Ed25519** (ou
> coopère avec le service qui la détient), il peut réécrire **et** re-signer toute la chaîne. La
> non-répudiation n'est donc réellement opposable qu'une fois la racine **ancrée chez un tiers
> indépendant** : publication périodique du `chainRootHash` chez l'**OCLEI** / le **Vérificateur
> Général** (ou un timestamping notarié). Tant que cet ancrage externe n'est pas en place, on a une
> **détection d'altération en base**, pas une preuve juridique complète. **Ancrage tiers = conçu, ⏳
> à implémenter en Phase 2** (cf. §18 et `publishedExternal` dans `audit_roots`).

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

> ⚠️ **As-built — attention au piège de canonicalisation** : le code réel **n'utilise PAS** la
> librairie `canonicalize` (RFC 8785 stricte). Il emploie une fonction maison **`canonicalJson`**
> (`src/audit/chain.ts`) qui **trie récursivement les clés** puis applique `JSON.stringify` natif —
> **sans** normalisation RFC 8785 des nombres ni NFC Unicode. La **même** fonction est réimplémentée
> à l'identique dans le script offline `scripts/verify-chain.ts`. **Ne pas** substituer
> `canonicalize` à `canonicalJson` : leurs sorties diffèrent sur les nombres/Unicode → le
> `payloadHash` recalculé ne correspondrait plus et la vérification échouerait. Les exemples §8.2 et
> §11 ci-dessous qui importent `canonicalize` sont **illustratifs de l'intention JCS** ; la source
> de vérité est `canonicalJson`.

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
> Signature : Ed25519 **in-process** (`@noble/ed25519` — Vault Transit ne supporte pas Ed25519, cf.
> ADR-026/034), clé chargée depuis **Vault KV** (`VAULT_AUDIT_KEY_PATH`, défaut
> `audit/signing-key`), repli clé éphémère en dev **uniquement** (le fail-fast prod et la bascule
> auth AppRole/K8s sont des durcissements ⏳ Phase 2 — l'as-built charge encore via `VAULT_TOKEN`,
> cf. §12.1). Intégrité du chaînage sous concurrence : verrou consultatif transactionnel
> `pg_advisory_xact_lock` (un seul `append` à la fois, multi-instances). ADR alignées : **ADR-007
> (hash-chain audit, _pas_ Merkle)**, ADR-014 (append-only event-driven), ADR-027 (guards locaux),
> ADR-034 (Vault/mTLS/OWASP).

**Source canonique** : `packages/database/prisma/schema.prisma`. Le bloc Prisma ci-dessous est
**recopié de l'as-built** (et non plus de l'ébauche d'avril, supprimée car divergente). Les noms de
colonnes utilisés par le code §8 et le script §11 sont **exactement** ceux-ci.

```prisma
model AuditLog {
  id            BigInt   @id @default(autoincrement())
  /// Utilisateur acteur (UUID Keycloak via User). Null = non authentifié / système.
  /// L'ingestion AMQP laisse `userId` à NULL (évite toute violation de FK) ;
  /// l'acteur brut de l'événement est conservé dans `newValue` (donc couvert
  /// par `payloadHash`).
  userId        String?  @map("user_id") @db.Uuid
  actorType     String   @map("actor_type") @db.VarChar(30)  // CITIZEN, AGENT, SYSTEM, ...
  action        String   @db.VarChar(100)                    // "citizen.read", "correction.approve"
  entityType    String   @map("entity_type") @db.VarChar(80) // "Citizen", "CorrectionRequest", "event"
  entityId      String?  @map("entity_id") @db.VarChar(100)
  oldValue      Json?    @map("old_value")
  newValue      Json?    @map("new_value")
  ipAddress     String?  @map("ip_address") @db.Inet
  payloadHash   String   @map("payload_hash") @db.VarChar(64)  // SHA-256 du JSON canonicalisé
  previousHash  String   @map("previous_hash") @db.VarChar(64)
  merkleHash    String   @unique @map("merkle_hash") @db.VarChar(64) // hash de chaînage (linéaire)
  signature     String?  @db.VarChar(128)                      // Ed25519 du root horaire (cron)
  sourceEventId String   @unique @map("source_event_id") @db.VarChar(100) // idempotence AMQP
  correlationId String?  @map("correlation_id") @db.VarChar(100)
  occurredAt    DateTime @map("occurred_at") @db.Timestamptz(6) // instant métier (entrée dans le hash)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user User? @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([userId])
  @@index([entityType, entityId])
  @@index([occurredAt])
  @@index([action])
  @@map("audit_logs")
}

model AuditRoot {
  id                BigInt   @id @default(autoincrement())
  chainRootHash     String   @map("chain_root_hash") @db.VarChar(64) // merkleHash du dernier log couvert
  lastLogId         BigInt   @map("last_log_id")
  logCountCovered   Int      @map("log_count_covered")
  signature         String   @db.VarChar(160)                  // hex Ed25519 (128 chars + marge)
  signingKeyId      String   @map("signing_key_id") @db.VarChar(80) // ID clé (rotation Vault)
  publishedExternal Boolean  @default(false) @map("published_external") // ancrage tiers (Phase 2)
  signedAt          DateTime @default(now()) @map("signed_at") @db.Timestamptz(6)

  @@index([signedAt])
  @@index([lastLogId])
  @@map("audit_roots")
}
```

> **Points d'attention (as-built)** :
>
> - Le hash inclut `occurredAt` (instant métier), **pas** `createdAt` (instant d'insertion DB) —
>   c'est `occurredAt` qui doit être ré-hashé par le script offline §11.
> - `merkleHash` est le nom historique du **hash de chaînage** (chaîne linéaire, ADR-007).
> - `previousHash`, `payloadHash`, `merkleHash` font 64 hex (SHA-256) ; `signature` 128 hex
>   (Ed25519).

### Migrations — triggers append-only

Fichier réel :
`packages/database/prisma/migrations/20260530120000_audit_chain_immutability/migration.sql`. Une
**seule** fonction trigger partagée (`nina_reject_audit_mutation`) est posée sur les deux tables en
`BEFORE UPDATE` et `BEFORE DELETE`, plus un `REVOKE` best-effort si le rôle `nina_app` existe.
Extrait **illustratif** (la source canonique reste le fichier de migration) :

```sql
-- Fonction unique partagée par les deux tables, déclenchée AVANT toute mutation.
CREATE OR REPLACE FUNCTION nina_reject_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit table % is append-only (% blocked)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- audit_logs : UPDATE et DELETE interdits.
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();

-- audit_roots : mêmes garde-fous.
CREATE TRIGGER audit_roots_no_update BEFORE UPDATE ON audit_roots
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();
CREATE TRIGGER audit_roots_no_delete BEFORE DELETE ON audit_roots
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();

-- Défense en profondeur : retirer UPDATE/DELETE au rôle applicatif (si présent).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nina_app') THEN
    REVOKE UPDATE, DELETE ON audit_logs, audit_roots FROM nina_app;
  END IF;
END $$;
```

---

## 7. Structure de dossiers

> ⚠️ **As-built (vérifiable par `Get-ChildItem src/audit`)** : contrairement à l'ébauche d'avril
> (qui rangeait les fichiers sous `repositories/` et `services/`), l'as-built place **tous** les
> fichiers du domaine **directement** sous `src/audit/` — **pas** de sous-dossiers `repositories/`
> ni `services/`. Les imports du code §8 (`./services/hash.service`,
> `./repositories/audit-log.repository`) sont **illustratifs de la cible** ; les chemins réels sont
> `./hash.service`, `./audit-log.repository`, etc. Le `verification.service.ts` / `proof.dto.ts` de
> l'ébauche **n'existent pas** (la vérification vit dans `audit.service.ts`, le batching dans
> `audit.batcher.ts`, la normalisation dans `audit.normalizer.ts`). La structure ci-dessous est
> **recopiée de l'as-built**.

```
services/audit-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   └── env.schema.ts             # validation env (Zod) — défaut VAULT_TOKEN dev
│   ├── audit/
│   │   ├── audit.module.ts
│   │   ├── audit.controller.ts
│   │   ├── audit.service.ts          # append / verifyRange / getProof / latestRoot
│   │   ├── audit.consumer.ts         # RabbitMQ consumer (amqp-connection-manager)
│   │   ├── audit.batcher.ts          # ACK différé par lot (at-least-once)
│   │   ├── audit.normalizer.ts       # NormalizedEvent (formats hétérogènes → canonique)
│   │   ├── audit.cron.ts             # Scellement horaire Ed25519 in-process
│   │   ├── audit-log.repository.ts   # Prisma + RAW SQL (append-only, advisory lock)
│   │   ├── chain.ts                  # canonicalJson (maison) + payload/chain hash (source de vérité)
│   │   ├── hash.service.ts           # wrapper DI autour de chain.ts (SHA-256)
│   │   ├── signing.service.ts        # Ed25519 in-process (@noble) + clé Vault KV
│   │   └── dtos/
│   │       ├── ingest.dto.ts
│   │       └── query.dto.ts
│   ├── vault/
│   │   └── vault.module.ts           # VaultClient DI — as-built method:'token' (cf. §12.1)
│   ├── health/
│   │   └── health.controller.ts
│   └── prisma/
│       └── prisma.service.ts
├── test/
│   ├── audit.e2e-spec.ts
│   └── chain-integrity.e2e-spec.ts
├── scripts/
│   └── verify-chain.ts               # CLI offline (copie EXACTE de canonicalJson, cf. §11)
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
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NINA-AES · audit-service')
    .setDescription("Journal d'audit immuable — hash-chain SHA-256 linéaire (ADR-007)")
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  // Healthcheck Docker (`curl /health`) hors préfixe api/v1.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // NB : le consumer RabbitMQ N'EST PAS un microservice NestJS @EventPattern.
  // L'as-built utilise un consumer `amqp-connection-manager` interne
  // (AuditConsumer, OnModuleInit — cf. §8.5) pour la reconnexion auto et le
  // batching d'ACK. On NE déclare donc PAS app.connectMicroservice ici : un seul
  // modèle de consumer dans tout le service (évite la double-topologie).

  const port = Number(process.env.PORT ?? 3007); // port unique 3007 (cf. SERVICE_PORTS)
  await app.listen(port);
  Logger.log(`audit-service démarré sur :${port}`, 'Bootstrap');
}

bootstrap();
```

### 8.2 `hash.service.ts`

> ⚠️ **As-built** : l'import `@noble/hashes/sha256` ci-dessous est en réalité `@noble/hashes/sha2`
> (chemin du paquet actuel), et la canonicalisation passe par la fonction maison `canonicalJson` de
> `chain.ts` (tri récursif + `JSON.stringify`), **pas** par la librairie `canonicalize`. Le
> `HashService` réel est un mince wrapper DI autour des primitives pures de `chain.ts`. L'exemple
> ci-dessous illustre le calcul ; la source de vérité est `src/audit/chain.ts`.

```typescript
import { Injectable } from '@nestjs/common';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
// canonicalJson : tri récursif des clés + JSON.stringify natif (cf. chain.ts) —
// PAS la librairie `canonicalize` (RFC 8785), dont la sortie diffère sur les nombres.
import { canonicalJson } from './chain';

@Injectable()
export class HashService {
  /**
   * Calcule le hash canonique d'un payload JSON.
   * Tri récursif des clés (déterminisme) — voir chain.ts.
   */
  canonicalHash(payload: unknown): string {
    return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(payload))));
  }

  /**
   * Calcule le merkleHash (hash de chaînage linéaire) d'une ligne :
   *   SHA256( previousHash | payloadHash | occurredAt(ISO) | sourceEventId )
   * NB : on hache `occurredAt` (instant métier), PAS `createdAt`.
   */
  chainHash(params: {
    previousHash: string;
    payloadHash: string;
    occurredAt: Date;
    sourceEventId: string;
  }): string {
    const ts = params.occurredAt.toISOString();
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
   * Récupère le dernier maillon (pour chainage). La sérialisation des appends
   * concurrents est assurée en amont par `pg_advisory_xact_lock` (cf. audit.service),
   * d'où un simple ORDER BY id DESC LIMIT 1.
   */
  async getLastLogForInsert(tx: Prisma.TransactionClient) {
    const result = await tx.$queryRaw<
      Array<{ id: bigint; merkle_hash: string }>
    >`SELECT id, merkle_hash FROM audit_logs ORDER BY id DESC LIMIT 1`;
    return result[0] ?? null;
  }

  /**
   * INSERT chaîné. On utilise `UncheckedCreateInput` pour fournir `userId`
   * scalaire directement (la relation `user` reste optionnelle/Restrict).
   */
  async appendTx(tx: Prisma.TransactionClient, data: Prisma.AuditLogUncheckedCreateInput) {
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
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.userId && { userId: params.userId }),
      ...(params.action && { action: params.action }),
      ...(params.entityType && { entityType: params.entityType }),
      ...(params.entityId && { entityId: params.entityId }),
      ...((params.from || params.to) && {
        // On filtre sur l'instant métier (occurredAt), cohérent avec le hash.
        occurredAt: {
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

> ⚠️ **Écart as-built à connaître** : le `getProof` ci-dessous illustre la **cible** — il expose
> `signingKeyId` + clé publique **et vérifie la signature Ed25519 côté serveur** (`signatureValid`).
> L'as-built (`src/audit/audit.service.ts`) expose déjà `chainRootHash`, `signingKeyId`, `signature`
> et `publicKey`, mais **ne calcule pas encore** `signatureValid` (aucun appel à `signing.verify`
> dans `getProof`). Ajouter la vérification serveur + le champ `signatureValid` est un
> **durcissement ⏳ Phase 2** (le message à vérifier est
> `` `${chainRootHash}|${signedAt.toISOString()}` ``, cohérent avec `sealRoot`). À ne pas présenter
> comme livré.

> `NormalizedEvent` (défini dans `audit.normalizer.ts`) est la forme **canonique interne** après
> normalisation, alignée 1:1 sur les colonnes `AuditLog` :
>
> ```typescript
> export interface NormalizedEvent {
>   userId: string | null; // null pour l'ingestion AMQP (évite la violation de FK)
>   actorType: string;
>   action: string;
>   entityType: string;
>   entityId: string | null;
>   oldValue: unknown | null;
>   newValue: unknown | null;
>   ipAddress: string | null;
>   sourceEventId: string;
>   correlationId: string | null;
>   occurredAt: Date;
> }
> ```

```typescript
import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { HashService } from './services/hash.service';
import { SigningService } from './services/signing.service';
import { NormalizedEvent } from './audit.normalizer';

const GENESIS_HASH = '0'.repeat(64); // premier maillon de la chaîne

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AuditLogRepository,
    private readonly hash: HashService,
    private readonly signing: SigningService,
  ) {}

  /**
   * Append une ligne d'audit. Transaction Postgres pour garantir :
   *  - pg_advisory_xact_lock : un seul append à la fois (multi-instances)
   *  - SELECT du dernier log → previousHash correct
   *  - rollback si contrainte UNIQUE sur source_event_id violée (idempotence)
   *
   * `event` est déjà NORMALISÉ (cf. audit.normalizer.ts) : pour l'ingestion AMQP,
   * `userId` est null et l'acteur brut est dans `newValue` (donc couvert par le
   * payloadHash). Le `payloadHash` couvre l'ensemble des champs métier, ce qui
   * scelle aussi l'origine déclarée — voir §9.4 pour l'authentification du canal.
   */
  async append(event: NormalizedEvent) {
    return this.prisma.$transaction(async (tx) => {
      // Sérialise les appends concurrents (verrou consultatif transactionnel).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nina_audit_chain'))`;

      const last = await this.repo.getLastLogForInsert(tx);
      const previousHash = last?.merkle_hash ?? GENESIS_HASH;

      // Le payloadHash couvre exactement les champs persistés (mêmes clés que le
      // script offline §11), triés récursivement.
      const payloadHash = this.hash.canonicalHash({
        action: event.action,
        actorType: event.actorType,
        correlationId: event.correlationId ?? null,
        entityId: event.entityId ?? null,
        entityType: event.entityType,
        ipAddress: event.ipAddress ?? null,
        newValue: event.newValue ?? null,
        oldValue: event.oldValue ?? null,
        sourceEventId: event.sourceEventId,
        userId: event.userId ?? null,
      });

      const merkleHash = this.hash.chainHash({
        previousHash,
        payloadHash,
        occurredAt: event.occurredAt,
        sourceEventId: event.sourceEventId,
      });

      try {
        const log = await this.repo.appendTx(tx, {
          userId: event.userId ?? null,
          actorType: event.actorType,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          oldValue: (event.oldValue ?? null) as object,
          newValue: (event.newValue ?? null) as object,
          ipAddress: event.ipAddress ?? null,
          payloadHash,
          previousHash,
          merkleHash,
          sourceEventId: event.sourceEventId,
          correlationId: event.correlationId ?? null,
          occurredAt: event.occurredAt,
        });

        this.logger.log({
          msg: 'audit.appended',
          id: Number(log.id),
          action: log.action,
          actorType: log.actorType,
          merkleHash: log.merkleHash.slice(0, 16) + '...',
        });

        return log;
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('source_event_id')) {
          // Idempotence : l'événement a déjà été consommé.
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
      // Reconstruit l'objet métier dans le MÊME ordre de clés que append().
      const payloadHash = this.hash.canonicalHash({
        action: log.action,
        actorType: log.actorType,
        correlationId: log.correlationId,
        entityId: log.entityId,
        entityType: log.entityType,
        ipAddress: log.ipAddress,
        newValue: log.newValue,
        oldValue: log.oldValue,
        sourceEventId: log.sourceEventId,
        userId: log.userId,
      });
      const recomputed = this.hash.chainHash({
        previousHash: expectedPrev,
        payloadHash,
        occurredAt: log.occurredAt,
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
   * - la chaîne remontant jusqu'à la première racine signée qui le couvre
   * - la racine + signature Ed25519 + `signingKeyId` + clé publique
   * - le résultat de la VÉRIFICATION serveur de la signature (booléen)
   *
   * Exposer la clé publique + `signingKeyId` permet à l'inspecteur de rejouer la
   * vérification offline (§11) avec la BONNE clé même après une rotation Vault,
   * et de vérifier indépendamment. On vérifie aussi côté serveur pour que l'API
   * ne renvoie jamais une preuve dont la signature serait silencieusement
   * invalide (détection précoce d'une clé désynchronisée / racine corrompue).
   */
  async getProof(logId: bigint) {
    const log = await this.repo.findById(logId);
    if (!log) return null;

    // Première racine signée couvrant ce log (lastLogId >= logId).
    const nearestRoot = await this.prisma.auditRoot.findFirst({
      where: { lastLogId: { gte: logId } },
      orderBy: { lastLogId: 'asc' },
    });

    const chain = nearestRoot ? await this.repo.findByIdRange(logId, nearestRoot.lastLogId) : [log];

    // Vérification serveur de la signature Ed25519 de la racine.
    // NB : la clé publique exposée est celle COURANTE en mémoire. Si la racine a
    // été signée avec une clé antérieure (rotation), `signatureValid` peut être
    // `null` (clé d'époque non disponible) → l'inspecteur tranche via §11 avec la
    // clé publique d'archive correspondant à `signingKeyId`.
    let signatureValid: boolean | null = null;
    if (nearestRoot) {
      const message = `${nearestRoot.chainRootHash}|${nearestRoot.signedAt.toISOString()}`;
      signatureValid =
        nearestRoot.signingKeyId === this.signing.getKeyId()
          ? await this.signing.verify(message, nearestRoot.signature)
          : null;
    }

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
            signingKeyId: nearestRoot.signingKeyId,
          }
        : null,
      // Matériel de vérification indépendante (rejouable offline §11).
      signingKeyId: nearestRoot?.signingKeyId ?? null,
      publicKeyEd25519: this.signing.getPublicKeyHex(),
      signatureValid,
      // ⏳ Phase 2 : `externalAnchor` (preuve d'ancrage OCLEI/Vérificateur Général).
    };
  }

  /** Dernière racine scellée + matériel de vérification (clé publique courante). */
  async getLatestRoot() {
    const root = await this.prisma.auditRoot.findFirst({ orderBy: { signedAt: 'desc' } });
    return {
      root,
      publicKeyEd25519: this.signing.getPublicKeyHex(),
      currentSigningKeyId: this.signing.getKeyId(),
    };
  }
}
```

### 8.5 `audit.consumer.ts` (modèle unique : `amqp-connection-manager`)

> **Un seul modèle de consumer.** L'as-built **n'utilise pas** le transport microservice NestJS
> (`@EventPattern`) : il instancie un consumer `amqp-connection-manager` dans `onModuleInit` pour la
> reconnexion automatique et l'ACK différé par lot via `AuditBatcher`. Le message brut est passé à
> `AuditNormalizer` (tolérant aux formats hétérogènes : enveloppe `nina.audit` _ou_ ingestion
> directe), puis empilé. Idempotence garantie par `source_event_id UNIQUE`. Extrait simplifié :
>
> ✅ **As-built** : le consumer réel (`src/audit/audit.consumer.ts`, méthode `handle()`) appelle
> bien `isOriginTrusted()` AVANT tout `append`, et celle-ci **vérifie réellement** la signature
> publisher Ed25519 (`x-nina-signature`) contre la clé publique enregistrée de l'émetteur
> (`AUDIT_PUBLISHER_KEYS`). L'extrait ci-dessous est **simplifié** (la résolution de l'émetteur
> réel, la map de clés et `ed.verifyAsync` sont élidés pour la lisibilité). Le verdict sans clé
> enregistrée dépend de `AUDIT_REQUIRE_SIGNED_ORIGIN` (fail-closed forcé en production ; fail-open
> borné en dev). Voir §9.4 pour le détail.

```typescript
import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { Env } from '../config/env.schema.js';
import { AuditBatcher } from './audit.batcher.js';
import { AuditNormalizer } from './audit.normalizer.js';

/** TTL queue audit : 7 jours (aligné infrastructure/.../definitions.json). */
const AUDIT_QUEUE_TTL_MS = 604_800_000;
/** Clés topic captées sur nina.events (domaines métier audités). */
const AUDIT_EVENT_PATTERNS = [
  'citizen.#',
  'correction.#',
  'agent.#',
  'governance.#',
  'document.#',
  'identity.#',
  'appointment.#',
  'vulnerability.#',
  'interop.#',
];

@Injectable()
export class AuditConsumer implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AuditConsumer.name);
  private conn: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    private readonly batcher: AuditBatcher,
    private readonly normalizer: AuditNormalizer,
  ) {}

  onModuleInit(): void {
    const url = this.cfg.get('RABBITMQ_URL', { infer: true });
    const auditExchange = this.cfg.get('RABBITMQ_AUDIT_EXCHANGE', { infer: true }); // nina.audit (fanout)
    const eventsExchange = this.cfg.get('RABBITMQ_EVENTS_EXCHANGE', { infer: true }); // nina.events (topic)
    const queue = this.cfg.get('RABBITMQ_AUDIT_QUEUE', { infer: true }); // audit.log

    this.conn = connect([url]);
    this.channel = this.conn.createChannel({
      json: false, // on parse nous-mêmes (tolérance aux payloads non-JSON)
      setup: async (ch: Channel) => {
        await ch.assertExchange(auditExchange, 'fanout', { durable: true });
        await ch.assertExchange(eventsExchange, 'topic', { durable: true });
        await ch.assertQueue(queue, {
          durable: true,
          arguments: { 'x-message-ttl': AUDIT_QUEUE_TTL_MS }, // 7 jours
        });
        await ch.bindQueue(queue, auditExchange, ''); // tout le fanout audit
        for (const pattern of AUDIT_EVENT_PATTERNS) {
          await ch.bindQueue(queue, eventsExchange, pattern);
        }
        await ch.consume(queue, (msg) => this.onMessage(ch, msg), { noAck: false });
      },
    });
  }

  private async onMessage(ch: Channel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    // §9.4 — AUTHENTIFICATION DE L'ORIGINE : on n'accepte que les messages dont
    // l'émetteur est prouvé, soit par le canal (mTLS Linkerd entre services +
    // RabbitMQ), soit par une signature du publisher vérifiée ici. Sans cela, un
    // service compromis pourrait usurper `actorType`/`userId`.
    if (!this.isOriginTrusted(msg)) {
      this.logger.warn('Message rejeté : origine non authentifiée');
      ch.ack(msg); // drop (pas de requeue) — évite la boucle de poison
      return;
    }
    try {
      const normalized = this.normalizer.normalize(msg); // tolérant ; null si illisible
      if (!normalized) {
        ch.ack(msg); // non-JSON / non normalisable → drop (cf. §9.3)
        return;
      }
      // ACK DIFFÉRÉ : le batcher acknowledge après insertion réussie (at-least-once).
      this.batcher.enqueue(normalized, () => ch.ack(msg));
    } catch (err) {
      this.logger.error({ err }, 'audit.message.failed');
      ch.ack(msg); // drop best-effort (DLQ dédiée = évolution recommandée §9.3)
    }
  }

  /**
   * §9.4 — Origine de confiance (extrait simplifié de l'as-built). On résout
   * l'émetteur réel (`appId`/`x-nina-source`) puis, si une clé publique lui est
   * enregistrée, on VÉRIFIE la signature détachée Ed25519 `x-nina-signature`
   * (`ed.verifyAsync`) : signature absente/invalide ⇒ `false` (drop). Sans clé
   * enregistrée, le verdict suit `AUDIT_REQUIRE_SIGNED_ORIGIN` (fail-closed forcé
   * en production, fail-open borné en dev). La trace `_meta.origin` n'est pas une
   * authentification (forge seulement détectable a posteriori).
   */
  private async isOriginTrusted(msg: ConsumeMessage): Promise<boolean> {
    const emitter = this.extractEmitter(msg); // appId / x-nina-source
    const key = emitter ? this.publisherKeys.get(emitter) : undefined;
    if (key) return this.verifySignature(msg, key); // Ed25519 — rejet si KO
    return !this.requireSignedOrigin; // sinon : fail-closed (prod) / fail-open (dev)
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close();
    await this.conn?.close();
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
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
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
  @ApiOperation({ summary: 'Dernière racine signée Ed25519 (+ signingKeyId, clé publique)' })
  async latestRoot() {
    // Délègue au service (pas d'accès au champ privé `prisma`).
    return this.auditService.getLatestRoot();
  }
}
```

### 8.7 DTOs

`src/audit/dtos/ingest.dto.ts` — utilisé par l'endpoint POST d'ingestion directe (et par les tests).
L'ingestion AMQP, elle, passe par `AuditNormalizer` (pas par ce DTO). Champs **alignés as-built**.

```typescript
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsIP,
  IsISO8601,
  MaxLength,
} from 'class-validator';

export class IngestEventDto {
  /** UUID Keycloak de l'acteur (null/absent = système ou ingestion AMQP). */
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  /** CITIZEN, AGENT, SYSTEM, … (défaut applicatif : SYSTEM). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  actorType?: string;

  @IsString()
  @MaxLength(100)
  action!: string;

  /** "Citizen", "CorrectionRequest", "event", … */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsObject()
  oldValue?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  newValue?: Record<string, unknown>;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  /** Idempotence ; si absent, généré côté serveur (randomUUID). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceEventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  correlationId?: string;

  /** Instant métier (entre dans le hash). Défaut : maintenant. */
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
```

`src/audit/dtos/query.dto.ts`

```typescript
import { IsOptional, IsString, IsISO8601, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsISO8601() from?: string; // filtre sur occurredAt
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

### 9.4 Authentification de l'origine des événements (anti-falsification d'acteur)

**Problème** : le consumer écrit `actorType` / `userId` à partir du contenu du message. Un service
compromis (ou un attaquant ayant un accès publish au broker) pourrait **forger** un événement
attribuant une action à un autre acteur — la hash-chain scellerait alors une **fausse attribution**
de façon… parfaitement intègre. L'intégrité ne suffit pas : il faut **authentifier l'émetteur**.

**Deux lignes de défense (cf. ADR-034)** :

| Niveau                 | Mécanisme                                                                                                                                                                                                                                                                                                                                                         | État                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Canal (transport)      | **mTLS strict Linkerd** entre services et broker : seuls les pods du mesh peuvent publier ; le broker exige un certificat client.                                                                                                                                                                                                                                 | ✅ Conçu (ADR-034)                                                          |
| Message (bout-en-bout) | **Signature du publisher** : en-tête AMQP `x-nina-signature` = signature détachée du corps par la clé Ed25519 du service émetteur ; le consumer la **vérifie réellement** (`isOriginTrusted` → `ed.verifyAsync`) contre la clé publique connue du publisher (`AUDIT_PUBLISHER_KEYS`, indexée par `appId`) avant `append`. Signature absente/invalide ⇒ **rejet**. | ✅ Vérification implémentée ; ⏳ déploiement des clés publishers progressif |

> **Honnêteté** : la **vérification** de la signature publisher est désormais **implémentée** dans
> `isOriginTrusted()` (Ed25519, rejet si signature attendue absente/invalide). Mais elle ne mord que
> **lorsqu'une clé publique est enregistrée** pour l'émetteur (`AUDIT_PUBLISHER_KEYS`) ; tant que
> les publishers (document-service / identity-service) ne signent pas et que leur clé n'est pas
> déployée, la confiance retombe sur le **maillage mTLS** (le broker n'est pas exposé hors-mesh). Le
> comportement par défaut sans clé est régi par `AUDIT_REQUIRE_SIGNED_ORIGIN` : **fail-closed**
> (drop) lorsqu'il vaut `true` — **forcé en production** par `validateEnv` —, sinon **fail-open
> borné** (accepté avec WARN, dev/transition uniquement). Tant que la signature n'est pas
> généralisée, l'`actorType`/`userId` d'un message AMQP n'est garanti qu'au niveau « un service du
> mesh l'a émis », pas « ce service précis l'a émis ». C'est pourquoi l'ingestion AMQP force
> `userId = null` et conserve l'acteur **déclaré** dans `newValue._meta.origin` à côté de
> l'**émetteur réel** (couvert par le `payloadHash`, donc forge détectable a posteriori, mais non
> authentifiée à l'émission tant que la signature n'est pas exigée).

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
    "userId": null,
    "actorType": "AGENT",
    "merkleHash": "a3f9c7e8...",
    "previousHash": "b2e8d6...",
    "occurredAt": "2026-05-30T14:32:01.123Z"
  },
  "chain": [
    { "id": 12345, "previousHash": "b2e8d6...", "merkleHash": "a3f9c7e8..." },
    { "id": 12346, "previousHash": "a3f9c7e8...", "merkleHash": "c4de1f..." }
  ],
  "root": {
    "chainRootHash": "c4de1f...",
    "signedAt": "2026-05-30T15:00:00.000Z",
    "signature": "ee5a2b...cf9102",
    "logCountCovered": 12346,
    "signingKeyId": "vault-ed25519"
  },
  "signingKeyId": "vault-ed25519",
  "publicKeyEd25519": "9f86d081884c7d65..."
}
```

> ⚠️ **As-built** : `signatureValid` (vérification serveur de la signature) n'est **pas encore**
> renvoyé par `getProof` — c'est un durcissement ⏳ Phase 2 (cf. §8.4). Aujourd'hui la réponse
> fournit `signingKeyId` + clé publique pour la **vérification offline §11**, mais l'inspecteur doit
> la rejouer lui-même.

`publicKeyEd25519` + `signingKeyId` permettent à un inspecteur de **rejouer** la vérification
hors-ligne (§11) avec la bonne clé. Une fois la vérification serveur livrée (Phase 2),
`signatureValid` sera le résultat de la vérification **côté serveur** (Ed25519) — `null` si la
racine a été signée par une clé antérieure à une rotation (la preuve reste vérifiable offline avec
la clé d'archive correspondant à `signingKeyId`).

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
 *
 * IMPORTANT : `canonicalJson` ci-dessous doit être la COPIE EXACTE de
 * `src/audit/chain.ts` (tri récursif des clés + JSON.stringify natif), PAS la
 * librairie `canonicalize` (RFC 8785) — sinon les hashes divergent sur les
 * nombres/Unicode. L'objet métier doit être reconstruit avec les mêmes clés
 * (cf. ci-dessous). La clé publique (--verify-sig) doit correspondre au
 * `signing_key_id` des racines vérifiées (clé d'archive en cas de rotation Vault).
 */
import { Client } from 'pg';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import * as ed from '@noble/ed25519';

const GENESIS = '0'.repeat(64);

/** COPIE EXACTE de src/audit/chain.ts (tri récursif des clés, JSON natif). */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

async function main() {
  const fromId = BigInt(process.argv[process.argv.indexOf('--from') + 1] ?? 1);
  const toId = BigInt(process.argv[process.argv.indexOf('--to') + 1] ?? Number.MAX_SAFE_INTEGER);
  const verifySig = process.argv.includes('--verify-sig');
  const pubKeyHex = process.env.AUDIT_PUBLIC_KEY_ED25519!;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, user_id, actor_type, action, entity_type, entity_id,
            old_value, new_value, ip_address, correlation_id,
            source_event_id, payload_hash, previous_hash, merkle_hash, occurred_at
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
    // 1. payloadHash — on RECONSTRUIT l'objet métier dans le MÊME ordre de clés
    //    que le service (canonicalJson trie les clés → ordre déterministe).
    const payloadObj = {
      action: log.action,
      actorType: log.actor_type,
      correlationId: log.correlation_id,
      entityId: log.entity_id,
      entityType: log.entity_type,
      ipAddress: log.ip_address,
      newValue: log.new_value,
      oldValue: log.old_value,
      sourceEventId: log.source_event_id,
      userId: log.user_id,
    };
    const pHash = bytesToHex(sha256(new TextEncoder().encode(canonicalJson(payloadObj))));
    if (pHash !== log.payload_hash) {
      console.error(`❌ payload_hash tampered on id=${log.id}`);
      process.exit(2);
    }

    // 2. merkleHash — hash de chaînage sur occurred_at (PAS created_at).
    const concat = `${expectedPrev}|${pHash}|${new Date(log.occurred_at).toISOString()}|${log.source_event_id}`;
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

> **Sécurité des secrets (canon + ADR-034)** : la clé Ed25519 vient d'un **`VaultClient` partagé**
> (`@nina-aes/vault-client`). **Cible (à atteindre)** : auth par **AppRole / Kubernetes
> ServiceAccount** avec **lease court** — **jamais** un `VAULT_TOKEN` long-lived passé en clair. ⚠️
> **État as-built (à corriger)** : `vault.module.ts` instancie le client en
> `auth: { method: 'token', token: VAULT_TOKEN }` (défaut dev `nina-dev-root-token`) — c'est un
> **token statique**, exactement ce que le canon proscrit. Le package `@nina-aes/vault-client`
> expose déjà `approle`/`kubernetes` (et un helper `vaultClientFromEnv()` qui défaut à `approle`) :
> la bascule est un **durcissement ⏳ Phase 2**, pas une fonctionnalité livrée. Le repli **clé
> éphémère** existe **uniquement en dev** ; en prod il doit **fail-fast** (refuser de démarrer
> plutôt que de sceller avec une clé qui disparaît au restart) — **également ⏳ Phase 2** (cf. note
> d'implémentation ci-dessous). Rappel : Vault **Transit ne supporte pas Ed25519** → scellement
> **in-process** `@noble`. Le bloc de code ci-dessous (avec `VaultClient` AppRole + garde
> `NODE_ENV === 'production'`) illustre la **cible**, pas l'as-built.

```typescript
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { VAULT_CLIENT } from '../vault/vault.module.js';

interface AuditSigningKeySecret extends Record<string, unknown> {
  private_key_hex: string;
  public_key_hex: string;
  key_id?: string;
}

@Injectable()
export class SigningService implements OnModuleInit {
  private readonly logger = new Logger(SigningService.name);
  private privateKey: Uint8Array | null = null;
  private publicKeyHex = '';
  private keyId = 'unset';

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient, // AppRole/K8s, lease court
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadKey();
  }

  private async loadKey(): Promise<void> {
    const path = this.cfg.get('VAULT_AUDIT_KEY_PATH', { infer: true }); // défaut: audit/signing-key
    try {
      const secret = await this.vault.getSecret<AuditSigningKeySecret>(path);
      if (!secret?.private_key_hex || !secret?.public_key_hex) {
        throw new Error('secret incomplet (private_key_hex / public_key_hex manquant)');
      }
      this.privateKey = new Uint8Array(Buffer.from(secret.private_key_hex, 'hex'));
      this.publicKeyHex = secret.public_key_hex;
      this.keyId = secret.key_id ?? 'vault-ed25519';
      this.logger.log(`Clé Ed25519 chargée depuis Vault (keyId=${this.keyId})`);
    } catch (err) {
      // FAIL-FAST en production : une clé éphémère scellerait des racines
      // invérifiables après restart → on refuse de démarrer.
      if (this.cfg.get('NODE_ENV', { infer: true }) === 'production') {
        throw new Error(
          `Clé de scellement audit indisponible en production (${(err as Error).message}). ` +
            `Bootstrap Vault requis (AppRole/K8s). Refus de démarrer.`,
        );
      }
      this.logger.warn(
        `Clé Vault indisponible (${(err as Error).message}) — clé ÉPHÉMÈRE (DEV uniquement).`,
      );
      const priv = new Uint8Array(ed.utils.randomPrivateKey());
      this.privateKey = priv;
      this.publicKeyHex = Buffer.from(await ed.getPublicKeyAsync(priv)).toString('hex');
      this.keyId = 'ephemeral-dev';
    }
  }

  async sign(message: string): Promise<string> {
    if (!this.privateKey) await this.loadKey();
    const sig = await ed.signAsync(new TextEncoder().encode(message), this.privateKey!);
    return Buffer.from(sig).toString('hex');
  }

  /** Vérifie une signature hex contre la clé publique courante (utilisé par getProof). */
  async verify(message: string, sigHex: string): Promise<boolean> {
    if (!this.publicKeyHex) return false;
    try {
      return await ed.verifyAsync(
        new Uint8Array(Buffer.from(sigHex, 'hex')),
        new TextEncoder().encode(message),
        new Uint8Array(Buffer.from(this.publicKeyHex, 'hex')),
      );
    } catch {
      return false;
    }
  }

  /** Clé publique Ed25519 hex (exposée par getProof / latestRoot pour vérif offline). */
  getPublicKeyHex(): string {
    return this.publicKeyHex;
  }

  getKeyId(): string {
    return this.keyId;
  }
}
```

> **Note d'implémentation (as-built — écarts à corriger)** : par rapport au bloc cible ci-dessus, le
> code réel diverge sur **deux** points de sécurité, tous deux **⏳ Phase 2** :
>
> 1. **Auth Vault** : `src/vault/vault.module.ts` utilise
>    `auth: { method: 'token', token: VAULT_TOKEN }` (token statique, défaut dev
>    `nina-dev-root-token`), **pas** AppRole/K8s. Correctif : passer par `vaultClientFromEnv()` ou
>    `auth: { method: 'approle', roleId, secretId }` (déjà supporté par `@nina-aes/vault-client`).
> 2. **Fail-fast prod** : `src/audit/signing.service.ts` n'a **pas** la garde
>    `NODE_ENV === 'production'` ci-dessus — il retombe silencieusement sur une clé éphémère même en
>    prod.
>
> En place dès aujourd'hui : `verify`, `getPublicKeyHex`, `getKeyId`, chargement KV de la clé. À ne
> pas confondre avec une fonctionnalité de sécurité livrée.

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

> ⚠️ **Piège cryptographique à éviter** : `openssl enc -aes-256-gcm` **ne fonctionne pas** comme un
> vrai chiffrement authentifié en ligne de commande — la sous-commande `enc` **n'émet ni ne vérifie
> le tag d'authentification GCM**. On obtiendrait un fichier **non authentifié** (déchiffrable mais
> falsifiable sans détection), ce qui est inacceptable pour une archive WORM d'audit. Utiliser
> plutôt **`age`** (X25519 + ChaCha20-Poly1305, AEAD, souverain et sans dépendance KMS externe) ou,
> à défaut, **`gpg`** (AES-256 + MDC). Pour de l'AES-256-GCM strict, passer par une **librairie**
> (`node:crypto createCipheriv('aes-256-gcm')` qui gère le tag), pas par `openssl enc`.

```bash
# scripts/archive-audit-monthly.sh
set -euo pipefail
month=$(date -d "13 months ago" +%Y-%m)
table="audit_logs_${month//-/_}"

pg_dump --table="${table}" -Fc nina_aes_db > "/tmp/audit_${month}.dump"

# Chiffrement AUTHENTIFIÉ via age (AEAD ChaCha20-Poly1305) — clé publique d'archive.
# (Souveraineté : pas d'AWS KMS / Cloudflare ; la clé privée reste chez l'OCLEI / CTDEC.)
age -r "$(cat /etc/nina/archive-recipient.txt)" \
    -o "/tmp/audit_${month}.age" "/tmp/audit_${month}.dump"

# Variante GPG (si age indisponible) : gpg --symmetric --cipher-algo AES256 ...
# Variante lib : node scripts/encrypt-gcm.mjs (createCipheriv aes-256-gcm + tag).

mc cp "/tmp/audit_${month}.age" "minio/nina-audit-archive/${month}/"
mc retention set --default GOVERNANCE "10y" "minio/nina-audit-archive/${month}/"
shred -u "/tmp/audit_${month}.dump"           # efface le clair local
psql -c "DROP TABLE ${table}"
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
    const base = { payloadHash: 'a', occurredAt: new Date(0), sourceEventId: 'uuid-1' };
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
        actorType: 'AGENT',
        entityType: 'Citizen',
        newValue: { nina: `1234567890123${i}A`, agent: `agent-${i % 5}`, ts: Date.now() },
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
    // Hack : désactiver le trigger temporairement (simule attaque DBA superuser)
    await pgClient.query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update');
    await pgClient.query(`UPDATE audit_logs SET new_value = '{"hacked":true}' WHERE id = 50`);
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

- [ ] `append()` via RabbitMQ fonctionne (consumer unique amqp-connection-manager)
- [ ] Hash-chain valide sur 1000+ événements
- [ ] `GET /audit/:id/proof` retourne racine signée + signingKeyId + clé publique
- [ ] Tentative UPDATE rejetée par trigger
- [ ] Scellement horaire Ed25519 in-process fonctionne

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
- [ ] ✅ Consumer RabbitMQ unique (`amqp-connection-manager`) ack/drop correctement
- [ ] ✅ Idempotence via `source_event_id UNIQUE`
- [ ] ⏳ Origine des événements authentifiée (mTLS broker ✅ ; signature publisher = Phase 2)
- [ ] ⏳ Dead-Letter Queue configurée (_non implémentée — évolution §9.3_)
- [ ] ✅ Script `verify-chain.ts` recalcule payloadHash + chaînage (sur `occurred_at`)
- [ ] ✅ Cron horaire scelle la racine + signature Ed25519 (in-process `@noble`)
- [ ] ✅ Clé Ed25519 chargée depuis Vault KV (chemin `VAULT_AUDIT_KEY_PATH`)
- [ ] ⏳ Auth Vault par AppRole/K8s ServiceAccount, **jamais** `VAULT_TOKEN` statique (as-built
      utilise encore `method: 'token'` — durcissement §12.1, Phase 2)
- [ ] ⏳ Fail-fast si clé éphémère en production (durcissement §12.1 — Phase 2)
- [ ] ✅ `getProof` expose `signingKeyId` + clé publique
- [ ] ⏳ `getProof` vérifie la signature serveur (`signatureValid`) — durcissement §8.4, Phase 2
- [ ] ⏳ Ancrage de la racine chez un tiers (OCLEI/Vérificateur Général) — Phase 2
- [ ] ✅ Swagger accessible sur `/api/docs`
- [ ] ✅ Couverture tests ≥ 85%
- [ ] ✅ Healthcheck `GET /health` retourne 200 avec Postgres + RabbitMQ UP
- [ ] ✅ Commit Conventional Commits : `feat(audit): append-only hash-chain + Ed25519 sealing`
- [ ] ✅ ADR alignées (réutiliser les ADR existants, **pas** de nouvel ADR ni de doublon) :
      [ADR-007 — Hash-chain audit (linéaire, _pas_ Merkle)](./adr/ADR-007-merkle-audit.md),
      [ADR-014 — Audit event-driven append-only](./adr/ADR-014-audit-event-driven-append-only.md),
      [ADR-027 — Guards locaux par service](./adr/ADR-027-auth-guards-type-only-package.md),
      [ADR-034 — Sécurité (Vault/mTLS/OWASP/rotation)](./adr/ADR-034-security-hardening-vault-mtls-owasp.md)

---

## 18. Pour aller plus loin

1. **Ancrage tiers (prérequis juridique, Phase 2)** : publier périodiquement le `chainRootHash` chez
   un **tiers indépendant** — **OCLEI** / **Vérificateur Général** (canal souverain privilégié), ou
   à défaut un timestamping notarié / une chaîne publique. C'est **ce qui transforme la détection
   d'altération en preuve opposable** (sans cet ancrage, le détenteur de la clé pourrait re-signer
   une chaîne réécrite). Colonne `publishedExternal` déjà prévue dans `audit_roots`.
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

_Document 09 — Version 1.1 (harden as-built, mai 2026) — NINA-AES Platform — UQAR — CONFIDENTIEL_
_Prochain document : [10 — Document Service (PDF + QR JWT)](./10-BACKEND-DOCUMENT-SERVICE.md)_
