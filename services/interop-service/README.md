# `@nina-aes/interop-service`

> **Port** : 3006 **Stack** : NestJS 11.1 · TypeScript 6.0 (nodenext) · jose 6 (JWS Ed25519) ·
> ioredis · Prisma 7 · Vault KV **Statut** : Implémentation fonctionnelle BCID-AES v1 (Phase 2)
> **Référence** : `docs/21-BLOC-B-INTEROPERABILITE-AES.md` ·
> `docs/adr/ADR-021-protocole-bcid-aes-interop.md`

---

## 1. Rôle

Implémentation du protocole **BCID-AES** (Border Citizen Identity — Alliance des États du Sahel :
Mali, Burkina Faso, Niger) : vérification transfrontalière d'un NINA entre passerelles nationales.

**Défense en profondeur** (les deux requis, jamais l'un OU l'autre) :

1. **mTLS** — l'identité du pays pair vient du **certificat réel** terminé par l'ingress NGINX
   (en-têtes `ssl-client-*` réécrits, non spoofables) ; **jamais** d'un header client (A01/A07). Le
   fingerprint SHA-256 est recalculé **en interne** et confronté à `aes_partners`.
2. **JWS Ed25519** (EdDSA figé) — signature du payload applicatif, vérifiée avec la clé publique du
   partenaire ; claims protégés `jti`/`iat`/`nbf`/`exp`/`iss`/`aud` exigés.

**Privacy by design** : la réponse est MINIMALISTE (`{ exists, valid, vulnerable, lastUpdated }`) —
jamais de nom/prénom/photo/biométrie.

---

## 2. Endpoints

| Méthode | Chemin                                   | Description                                     | Auth               |
| ------- | ---------------------------------------- | ----------------------------------------------- | ------------------ |
| `POST`  | `/api/v1/interop/verify`                 | Verbe entrant BCID-AES verify-nina (JWS in/out) | **mTLS + JWS**     |
| `POST`  | `/api/v1/interop/outgoing/verify`        | Interroge un partenaire (appel sortant)         | JWT interne + rôle |
| `GET`   | `/api/v1/interop/stats`                  | Volumétrie par pays (24 h, dashboard)           | JWT interne + rôle |
| `GET`   | `/health` `/health/live` `/health/ready` | Healthcheck Postgres + Redis                    | —                  |

Spec OpenAPI 3.2 publiable : [`docs/api/bcid-aes-v1.yaml`](../../docs/api/bcid-aes-v1.yaml).

### Pipeline de sécurité du verbe entrant (ordre canonique, doc 21 §4.2)

```
cert mTLS (ingress) → assertPeerKnown (aes_partners, non révoqué)
  → verifyJws (EdDSA figé, nbf/exp/iss/aud, jti)
  → ANTI-REPLAY (fenêtre timestamp ±2min + Redis SET NX) AVANT métier
  → rate-limit (1000/h/pays, FAIL-CLOSED 503)
  → checkNina (lecture seule) → logVerification (NINA haché) → signResponse (JWS aud:aes:<pair>)
```

---

## 3. Modèle de clé (tranché — doc 21 §4.2ter / ADR-021)

Signature JWS Ed25519 **IN-PROCESS** via `jose`/`@noble` : Vault **Transit ne signe pas Ed25519**.
La clé privée est chargée depuis **Vault KV** (`VAULT_INTEROP_KEY_PATH`, lease court), jamais en
dur. Rotation = nouveau secret KV + nouveau `kid`. Fail-fast en production si la clé Vault est
indisponible (signer avec une clé éphémère casserait la vérification côté partenaire au restart).

---

## 4. Variables d'environnement (extraits — schéma complet : `src/config/env.schema.ts`)

| Variable                                | Défaut                        | Rôle                                       |
| --------------------------------------- | ----------------------------- | ------------------------------------------ |
| `INTEROP_SERVICE_PORT`                  | `3006`                        | Port d'écoute                              |
| `INTEROP_SELF_COUNTRY`                  | `MLI`                         | Pays opéré par ce nœud                     |
| `INTEROP_SELF_ISSUER`                   | `https://interop.nina-aes.ml` | `iss` des JWS signés                       |
| `INTEROP_TRUST_INGRESS_HEADERS`         | `true`                        | Lit le cert pair des en-têtes ingress      |
| `INTEROP_RATE_LIMIT_PER_COUNTRY`        | `1000`                        | Quota/pays (fenêtre glissante)             |
| `INTEROP_RATE_LIMIT_WINDOW_SEC`         | `3600`                        | Largeur fenêtre (s)                        |
| `INTEROP_CLOCK_TOLERANCE_SEC`           | `120`                         | ±2 min (nbf/exp + anti-replay)             |
| `VAULT_INTEROP_KEY_PATH`                | `interop/signing-key`         | Chemin KV de la clé Ed25519                |
| `INTEROP_PARTNER_ENDPOINTS`             | `` (vide)                     | CSV `PAYS=URL` des passerelles partenaires |
| `INTEROP_DEV_PEER_COUNTRY/_FINGERPRINT` | —                             | Simulation mTLS dev (interdite en prod)    |

En **production**, `validateEnv` REFUSE de démarrer si `INTEROP_TRUST_INGRESS_HEADERS=false` ou si
les `INTEROP_DEV_PEER_*` sont posés (usurpation de pays triviale).

---

## 5. Démarrer en local

```powershell
pnpm install
pnpm --filter @nina-aes/interop-service dev
```

Sans ingress local, simuler le pair :
`INTEROP_TRUST_INGRESS_HEADERS=false INTEROP_DEV_PEER_COUNTRY=BFA INTEROP_DEV_PEER_FINGERPRINT=<sha256-hex>`.

---

## 6. Tests

```powershell
pnpm --filter @nina-aes/interop-service test
```

Tests négatifs de sécurité (§5bis) : JWS forgé/`alg:none`/mauvais iss-aud, cert révoqué/inconnu,
replay (jti rejoué), timestamp hors fenêtre, 429 rate-limit, 503 fail-closed Redis, spoof de header
d'identité ignoré.

---

## 7. À faire (Phase 2)

- **Migration SQL réelle** `bcid_aes_interop` (modèles `AesPartner` + colonnes additives
  `AesVerificationLog`) : nécessite une DB. Le client Prisma est déjà régénéré.
- **Distribution des clés partenaires** : provisionner `aes_partners` (BFA, NER) — cf.
  [`docs/interop/PARTNER-ONBOARDING.md`](../../docs/interop/PARTNER-ONBOARDING.md).
- **Onglet « Interop AES »** dans `apps/governance` (consomme `/stats`).
- **Manifests K3s** : ingress mTLS (CA AES) + NetworkPolicy (seul l'ingress atteint :3006).

---

## 8. Liens

- Doc canonique :
  [`docs/21-BLOC-B-INTEROPERABILITE-AES.md`](../../docs/21-BLOC-B-INTEROPERABILITE-AES.md)
- ADR :
  [`docs/adr/ADR-021-protocole-bcid-aes-interop.md`](../../docs/adr/ADR-021-protocole-bcid-aes-interop.md)
- Spec OpenAPI : [`docs/api/bcid-aes-v1.yaml`](../../docs/api/bcid-aes-v1.yaml)
