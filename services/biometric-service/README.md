# `@nina-aes/biometric-service`

> **Port** : 3012 **Stack** : NestJS 11.1 · TypeScript 6.0 (nodenext, strict) · Zod **Bloc** : F
> (biométrie — le module le plus sensible) **Références** :
> [doc 25 — Bloc F](../../docs/25-BLOC-F-BIOMETRIE.md) ·
> [ADR-025](../../docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md) ·
> [DPIA](../../docs/biometrics/DPIA-NINA-AES-2026.md) ·
> [CONSENT-PROTOCOL](../../docs/biometrics/CONSENT-PROTOCOL.md) ·
> [INCIDENT-PROTOCOL](../../docs/biometrics/INCIDENT-PROTOCOL.md)

---

## 1. Rôle

Biométrie d'État avec **protection de template ISO/IEC 24745** (_cancelable biometrics_). On ne
stocke **JAMAIS** l'image brute ni le template en clair — uniquement un **template PROTÉGÉ**
(`protectedTemplate` bytea, code signe d'une projection aléatoire **distance-préservante**), comparé
par **DISTANCE de Hamming + seuil τ** (`distance ≤ τ`), **jamais par égalité de hash**.

> **Pourquoi pas un hash ?** Un hash cryptographique (effet d'avalanche) détruit la proximité : deux
> captures du même doigt diffèrent de quelques bits → deux hash totalement différents → FRR = 100 %.
> La protection cancelable préserve la distance (lemme de Johnson-Lindenstrauss) tout en restant
> **irréversible** et **révocable**. Cf. doc 25 §0.

## 2. Endpoints (préfixe `/api/v1`)

| Méthode | Chemin                                       | Rôle requis          | Description                                                            |
| ------- | -------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `POST`  | `/biometric/consent/verify`                  | `biometric_operator` | Vérifie + enregistre un consentement signé (JWS Ed25519 ancré)         |
| `POST`  | `/biometric/consent/revoke`                  | `biometric_operator` | Révoque le consentement → efface les templates (droit à l'effacement)  |
| `POST`  | `/biometric/enrollment/fingerprint`          | `biometric_operator` | Enrôle une empreinte (template protégé, jamais d'image)                |
| `POST`  | `/biometric/enrollment/face`                 | `biometric_operator` | Enrôle un visage (P3b)                                                 |
| `POST`  | `/biometric/verify/fingerprint`              | `biometric_operator` | Vérifie 1:1 (distance ≤ τ, boucle sans court-circuit, anti-bruteforce) |
| `POST`  | `/biometric/identify/fingerprint`            | `inspector`          | Recherche 1:N restreinte (P3c, 4-yeux + mandat)                        |
| `GET`   | `/health` · `/health/live` · `/health/ready` | _public_             | Healthcheck Terminus (Postgres)                                        |

Tous les endpoints (sauf `/health`) exigent un **JWT agent RS256** (`iss=nina-aes-auth`,
`aud=nina-biometric-service`) + un **rôle** (RBAC). Helmet/CSP/HSTS actifs.

## 3. Garanties de sécurité implémentées

- **Protection de template ISO/IEC 24745** — projection aléatoire signée (`sign(R·v)`) semée par un
  **paramètre cancelable** (secret Vault, versionné par `transform_kid`). Irréversible +
  non-chaînable + révocable + distance-préservante (`src/cancelable/`).
- **Vérification 1:1** — distance de Hamming ≤ τ ; **boucle sans court-circuit** (anti-timing, doc
  25 §4.3) ; **anti-bruteforce** (verrouillage par `(agent, citoyen)` + alerte SIEM).
- **Identification 1:N restreinte** — `inspector` + mandat tracé (4-yeux). Limite de confidentialité
  **documentée** (l'index conserve de la structure géométrique, doc 25 §0.6) ; ⏳ index ANN à
  remplacer le balayage linéaire en production.
- **Consentement JWS Ed25519 ANCRÉ** — vérifié contre la clé publique **ancrée** du citoyen
  (registre souverain Bloc A) ; liste blanche `["EdDSA"]` fermée (`alg:none` impossible) ;
  allow-list de scope EXACTE ; anti-rejeu (`jti`) ; révocable → effacement.
- **Rotation double-écriture** — plusieurs `transform_kid` actifs coexistent ; `verify` parcourt
  TOUS les kids ; révocation logique (`revokedAt`) puis hard delete (INCIDENT-PROTOCOL).
- **Gate DPIA/RGPD bloquant** — sans `BIOMETRIC_DPIA_SIGNED=true`, le service **refuse de démarrer
  en production** (`src/governance/dpia-gate.service.ts`, DPIA §10).
- **Audit de CHAQUE opération** — trace durable `BiometricAccessLog` (fail-closed) + relais RabbitMQ
  vers la hash-chain SHA-256 d'audit-service. NINA jamais en clair, template/paramètre jamais
  journalisés.
- **Mémoire** — effacement best-effort des vecteurs clairs (`src/cancelable/secure-buffer.ts`) ;
  garanties réelles via durcissement hôte (no-swap / mlock / tmpfs — documenté, doc 25 §4.4).

## 4. Variables d'environnement (défauts sûrs)

| Variable                                | Défaut                            | Rôle                                             |
| --------------------------------------- | --------------------------------- | ------------------------------------------------ |
| `BIOMETRIC_SERVICE_PORT`                | `3012`                            | Port HTTP                                        |
| `BIOMETRIC_DPIA_SIGNED`                 | `false`                           | **Gate bloquant** en prod (DPIA signée CISO/DPO) |
| `BIOMETRIC_VAULT_ENABLED`               | `true`                            | Accès Vault au paramètre cancelable              |
| `BIOMETRIC_TRANSFORM_SECRET_PATH`       | `kv/data/biometric/bio-transform` | Chemin Vault du paramètre cancelable             |
| `BIOMETRIC_ACTIVE_TRANSFORM_KID`        | `bio-transform-v1`                | Kid actif (rotation = nouveau kid)               |
| `BIOMETRIC_PROJECTION_DIM`              | `512`                             | Dimension de projection (longueur du code signe) |
| `BIOMETRIC_MATCH_THRESHOLD`             | `0.32`                            | Seuil τ (à **mesurer** sur courbe DET en P3a)    |
| `BIOMETRIC_CONSENT_AUDIENCE`            | `nina-biometric-service`          | `aud` attendu du JWS de consentement             |
| `BIOMETRIC_VERIFY_MAX_FAILURES`         | `5`                               | Verrouillage anti-bruteforce après N échecs      |
| `BIOMETRIC_VERIFY_LOCKOUT_SEC`          | `900`                             | Fenêtre/durée du verrouillage                    |
| `AUTH_JWKS_URL` / `AUTH_JWT_*`          | (cf. `.env`)                      | Vérification JWT agent RS256                     |
| `VAULT_*`, `RABBITMQ_*`, `DATABASE_URL` | (cf. `.env`)                      | Vault / audit / Postgres                         |

## 5. Développer en local

```powershell
pnpm install
pnpm --filter @nina-aes/database run db:generate
pnpm --filter @nina-aes/biometric-service run check-types
pnpm --filter @nina-aes/biometric-service run lint     # max-warnings=0
pnpm --filter @nina-aes/biometric-service run test     # 6 suites / 31 tests
pnpm --filter @nina-aes/biometric-service dev
```

> En dev (`BIOMETRIC_VAULT_ENABLED=false` ou Vault injoignable), un paramètre cancelable **éphémère
> déterministe** est dérivé localement (JAMAIS en production). La résolution de clé citoyen utilise
> une clé DEV dérivée tant que le registre Bloc A n'est pas livré (⏳).

## 6. À faire (Phase 2 / production)

- Mesurer **FAR/FRR** sur courbe DET et figer τ (cible FAR ≤ 0,01 % / FRR ≈ 1–3 %).
- Brancher le **registre de clés citoyen souverain** (Bloc A) dans `CitizenKeyringService`.
- Remplacer le balayage linéaire 1:N par un **index ANN** (FAISS) sur templates protégés.
- Provisionner le paramètre cancelable Vault + **drill de rotation** double-écriture.
- **Durcissement hôte** (no-swap / mlock / tmpfs / core dumps off) au provisioning du nœud dédié.
- **Signer la DPIA** (CISO/DPO CTDEC) avant tout déploiement (gate `BIOMETRIC_DPIA_SIGNED`).
