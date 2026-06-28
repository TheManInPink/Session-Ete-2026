# `@nina-aes/governance-service`

> **Port** : 3010 **Stack** : NestJS 11.1 · TypeScript 6.0 (nodenext, strict) · Zod · Vault Transit
> **Statut** : implémenté (Bloc C2 SGOGT + directives Kanban, Bloc C3 intégrité électorale)
> **Référence** : `docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md`, `docs/governance/SGOGT-PROTOCOL.md`,
> `docs/governance/ELECTIONS-EXPORT-CONTRACT.md`, `docs/adr/ADR-022`.

---

## 1. Rôle

Gouvernance **institutionnelle** de la plateforme NINA-AES (fonctionnaires DNEC/CTDEC/DGE). Trois
sous-modules :

- **SGOGT** (`src/sgogt/`) — messagerie officielle **SIGNÉE** (JWS **RS256** via Vault Transit, clé
  par-fonctionnaire non exportable) remplaçant les appels téléphoniques non traçables. Chaque
  message est une **décision administrative cryptographiquement engageante** (non-répudiation),
  vérifiée à la réception (refus strict `alg != RS256`, cohérence claims↔colonnes), accusée par un
  **ACK signé** du lecteur, chaînée (hash-chain SHA-256 **linéaire**, PAS Merkle), et **escaladée
  automatiquement** au supérieur hiérarchique si non accusée dans le TTL (4 h CRITICAL / 24 h
  sinon).
- **Directives Kanban** (`src/directives/`) — cycle de vie strict
  `DRAFT→SENT→IN_PROGRESS→COMPLETED/REJECTED` (machine à états, transitions illégales rejetées 400,
  concurrence 409), assignee + deadline, historique de transitions audité.
- **Intégrité électorale** (`src/electoral/`) — pseudonymisation par **HMAC-SHA256 calculé DANS
  Vault** (clé non exportable, PAS un `SHA-256(NINA+sel)` bruteforçable) + `saltVersion` PUBLIC ;
  inscription auto à 18 ans (cron 02:00 Africa/Bamako) ; **export delta DGE** signé RS256 + SHA-256
  (vrais en-têtes HTTP), **rate-limité** (throttler nommé `dge`), **quota atomique par compte**,
  **anti-IDOR** (RBAC `DGE_OFFICIAL`), et **journalisé** (`DGE_EXPORT`) pour rendre un compte
  compromis détectable.

Le **NINA n'apparaît jamais en clair** : les messages SGOGT sont institutionnels, l'export électoral
est pseudonymisé.

> ⚠️ **Ré-identification** : le `pseudonymousId` est **stable entre exports** (linkable par
> conception) ; `commune + horodatages + removedReason` rendent la ré-identification triviale en
> commune peu peuplée. L'export est classifié/accès-contrôlé ; une **k-anonymité ou un bruit de
> Laplace est REQUIS** avant tout partage hors DGE (cf. `ELECTIONS-EXPORT-CONTRACT.md` §10).

---

## 2. Endpoints

| Méthode | Chemin                                | Rôle requis                        | Description                                   |
| ------- | ------------------------------------- | ---------------------------------- | --------------------------------------------- |
| `POST`  | `/api/v1/sgogt/messages`              | official/supervisor/director/admin | Émet un message signé (JWS RS256)             |
| `GET`   | `/api/v1/sgogt/messages`              | official/supervisor/director/admin | Boîte de réception (anti-IDOR)                |
| `GET`   | `/api/v1/sgogt/messages/:id/verify`   | + auditor                          | Vérifie signature + cohérence claims          |
| `POST`  | `/api/v1/sgogt/messages/:id/ack`      | official/supervisor/director/admin | Accusé de réception SIGNÉ (lecteur)           |
| `POST`  | `/api/v1/sgogt/messages/:id/respond`  | official/supervisor/director/admin | Répond (clôt la décision)                     |
| `POST`  | `/api/v1/directives`                  | official/supervisor/director/admin | Crée une directive (DRAFT)                    |
| `GET`   | `/api/v1/directives`                  | + auditor                          | Liste par statut (Kanban)                     |
| `POST`  | `/api/v1/directives/:id/transition`   | official/supervisor/director/admin | Transition de cycle de vie (auditée)          |
| `GET`   | `/api/v1/elections/export?since=ISO`  | **dge_official**                   | Export delta DGE signé + rate-limité + audité |
| `GET`   | `/health` · `/health/live` · `/ready` | public                             | Healthcheck (Postgres)                        |

---

## 3. Sécurité

- **JWT RS256** vérifié via JWKS d'auth-service (`iss=nina-aes-auth`, `aud=nina-governance-service`,
  refus strict `alg != RS256`). Guards locaux (ADR-027).
- **Signature/HMAC déléguées à Vault Transit** (clés non exportables). **Fail-fast production** : si
  Vault est indisponible, le service refuse de signer (pas de clé éphémère en prod). En dev/test,
  une clé RSA/HMAC éphémère mémoire est tolérée.
- **Helmet** (CSP stricte, HSTS), CORS restreint, `ValidationPipe` global (whitelist +
  forbidNonWhitelisted) + Zod par paramètre.
- **Audit** hash-chain SHA-256 d'audit-service (DTO conforme `ingest.dto.ts` : métadonnée dans
  `newValue`, jamais de `body`/NINA en clair).

> **Honnêteté** : la hash-chain SHA-256 n'est inviolable que si sa racine est **ancrée chez un
> tiers** (OCLEI / Vérificateur Général) — ancrage ⏳ non implémenté. La vérification externe du JWS
> par clé publique extraite (`transitReadPublicKey`) est livrée côté client mais n'est exécutable
> qu'avec les clés Transit RSA réelles provisionnées dans Vault.

---

## 4. Variables d'environnement

Validées par Zod au boot (`src/config/env.schema.ts`, fail-fast). Défauts sûrs ; aucun secret en
clair (seuls des NOMS de clés Vault). Voir aussi `turbo.json` (globalEnv) et `packages/config`.

Principales : `GOVERNANCE_SERVICE_PORT` (3010), `GOVERNANCE_VAULT_ENABLED`,
`VAULT_ELECTIONS_EXPORT_KEY`, `VAULT_ELECTIONS_HMAC_KEY`, `VAULT_SGOGT_KEY_PREFIX`,
`ELECTIONS_SALT_VERSION`, `SGOGT_TTL_*_HOURS`, `DGE_EXPORT_DAILY_QUOTA`,
`DGE_THROTTLE_TTL_MS`/`DGE_THROTTLE_LIMIT`.

---

## 5. Démarrer / valider en local

```powershell
pnpm install
pnpm --filter @nina-aes/governance-service run check-types
pnpm --filter @nina-aes/governance-service run lint
pnpm --filter @nina-aes/governance-service run test
pnpm --filter @nina-aes/governance-service dev
```

Migration SQL : `packages/database/prisma/migrations/20260628120000_governance_sgogt_electoral/` (à
appliquer via `pnpm --filter @nina-aes/database run db:migrate` une fois la DB de dev à jour).

---

## 6. Liens

- [`docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md`](../../docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md)
- [`docs/governance/SGOGT-PROTOCOL.md`](../../docs/governance/SGOGT-PROTOCOL.md)
- [`docs/governance/ELECTIONS-EXPORT-CONTRACT.md`](../../docs/governance/ELECTIONS-EXPORT-CONTRACT.md)
- Frontend associé : [`apps/governance`](../../apps/governance)
