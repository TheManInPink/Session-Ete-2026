# `@nina-aes/audit-service`

> **Port** : 3007 **Stack** : NestJS 11.1 · TypeScript 6 · Prisma 7 · PostgreSQL 18 · RabbitMQ 4.2 ·
> SHA-256 (Merkle) · Ed25519 (`@noble/*`) · Vault KV **Statut** : Implémenté (Bloc A) **Référence**
> : `docs/09-BACKEND-AUDIT-SERVICE.md`

---

## 1. Rôle

Journal d'audit **append-only** et **inviolable** de la plateforme NINA-AES :

- **Chaîne Merkle SHA-256** : chaque entrée chaîne `previousHash` → `merkleHash`.
- **Immuabilité base de données** : triggers PostgreSQL `BEFORE UPDATE/DELETE` qui rejettent toute
  mutation (cf. migration `20260530120000_audit_chain_immutability`).
- **Scellement horaire** : signature **Ed25519** de la racine courante (clé dans Vault KV), table
  `audit_roots` — rend toute réécriture rétroactive prouvable.
- **Idempotence** : `source_event_id UNIQUE`.
- **Anti-fork** : chaque `append` acquiert un verrou consultatif `pg_advisory_xact_lock` → chaînage
  strictement sérialisé (multi-instances).

## 2. Sources d'écriture

1. **Consumer RabbitMQ** (principal, asynchrone) — batching 500 ms / 1000 :
   - exchange fanout `RABBITMQ_AUDIT_EXCHANGE` (défaut `nina.audit`) ;
   - exchange topic `RABBITMQ_EVENTS_EXCHANGE` (défaut `nina.events`) lié via `AUDIT_EVENT_PATTERNS`
     (`citizen.#`, `correction.#`, `governance.#`, `document.#`, …).
2. **POST `/api/v1/audit`** (synchrone m2m, rôle `ADMIN`).

> ✅ **Drift topologie résolu** (cf. CHANGELOG `0vicies`) : `document-service` (clés `document.*`)
> et `identity-service` (clés `citizen.*` / `correction.*`) publient désormais tous deux sur
> `nina.events`, capté ici via `AUDIT_EVENT_PATTERNS`. Auparavant ils émettaient respectivement sur
> `audit.events` et `nina-aes.events` (exchanges orphelins). _Note doc : ADR-014 / docs 09-10-11
> nomment encore l'exchange historique `audit.events` ; `nina.events` (code + `definitions.json`)
> fait foi._

## 3. Endpoints (`/api/v1`)

| Méthode | Chemin                                   | Rôles                                        | Description                              |
| ------- | ---------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| `POST`  | `/audit`                                 | `ADMIN`                                      | Ingestion synchrone (idempotente)        |
| `GET`   | `/audit`                                 | `AUDITOR`,`ADMIN`,`ANTICORRUPTION_INSPECTOR` | Recherche paginée filtrée                |
| `GET`   | `/audit/verify`                          | `AUDITOR`,`ADMIN`                            | Vérifie l'intégrité sur `?from&to` (ids) |
| `GET`   | `/audit/export`                          | `AUDITOR`,`ADMIN`                            | Export CSV + signature Ed25519 (headers) |
| `GET`   | `/audit/roots/latest`                    | `AUDITOR`,`ADMIN`,`ANTICORRUPTION_INSPECTOR` | Dernière racine scellée                  |
| `GET`   | `/audit/:id`                             | `AUDITOR`,`ADMIN`,`ANTICORRUPTION_INSPECTOR` | Lecture d'un log                         |
| `GET`   | `/audit/:id/proof`                       | `AUDITOR`,`ADMIN`,`ANTICORRUPTION_INSPECTOR` | Preuve (chaîne + racine signée)          |
| `GET`   | `/health` `/health/live` `/health/ready` | —                                            | Sondes (Postgres)                        |

Swagger : `http://localhost:3007/api/docs`.

## 4. Variables d'environnement (extrait)

| Variable                     | Défaut                                          | Rôle                            |
| ---------------------------- | ----------------------------------------------- | ------------------------------- |
| `AUDIT_SERVICE_PORT`         | `3007`                                          | Port HTTP                       |
| `DATABASE_URL`               | (racine `.env`)                                 | PostgreSQL                      |
| `AUTH_JWKS_URL`              | `http://localhost:3002/.well-known/jwks.json`   | Vérification RS256 (downstream) |
| `RABBITMQ_URL`               | `amqp://localhost:5672`                         | Broker                          |
| `RABBITMQ_AUDIT_EXCHANGE`    | `nina.audit`                                    | Exchange fanout audit           |
| `RABBITMQ_EVENTS_EXCHANGE`   | `nina.events`                                   | Exchange topic métier           |
| `AUDIT_EVENT_PATTERNS`       | `citizen.#,correction.#,…`                      | Bindings topic                  |
| `AUDIT_BATCH_MAX_SIZE`       | `1000`                                          | Flush par taille                |
| `AUDIT_BATCH_INTERVAL_MS`    | `500`                                           | Flush par temps                 |
| `VAULT_ADDR` / `VAULT_TOKEN` | `http://localhost:8200` / `nina-dev-root-token` | Vault                           |
| `VAULT_AUDIT_KEY_PATH`       | `audit/signing-key`                             | Clé Ed25519 (KV v2)             |
| `AUDIT_SEAL_ENABLED`         | `true`                                          | Cron de scellement              |
| `RABBITMQ_CONSUMER_ENABLED`  | `true`                                          | Consumer (désactivable en test) |

## 5. Démarrer en local

```powershell
# Prérequis : Postgres + RabbitMQ + Vault up (cf. infrastructure/docker)
pnpm install
pnpm --filter @nina-aes/database db:migrate        # applique audit_roots + triggers
pnpm --filter @nina-aes/audit-service dev
```

## 6. Vérification d'intégrité offline (preuve indépendante)

```powershell
$env:DATABASE_URL="postgresql://..."
$env:AUDIT_PUBLIC_KEY_ED25519="<clé publique hex>"   # pour --verify-sig
pnpm --filter @nina-aes/audit-service verify:chain -- --from 1 --to 1000000 --verify-sig
```

N'utilise que `pg` + `@noble/*` + `canonicalize` — **aucun** import du code applicatif (preuve
indépendante). Codes : 0 OK · 2 payload altéré · 3 merkle rompu · 4 signature invalide.

## 7. Liens

- Doc canonique : [`docs/09-BACKEND-AUDIT-SERVICE.md`](../../docs/09-BACKEND-AUDIT-SERVICE.md)
- ADR : ADR-007 (Merkle audit trail), ADR-014 (audit append-only event-driven), ADR-027 (guards
  locaux)
- Topologie RabbitMQ :
  [`infrastructure/docker/rabbitmq/definitions.json`](../../infrastructure/docker/rabbitmq/definitions.json)
