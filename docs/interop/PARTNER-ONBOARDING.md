# PARTNER-ONBOARDING — Intégrer un pays au protocole BCID-AES

> **Référence** : `docs/21-BLOC-B-INTEROPERABILITE-AES.md` §4.6 ·
> `docs/adr/ADR-021-protocole-bcid-aes-interop.md` **Service** : `services/interop-service`
> (port 3006)

Procédure manuelle V1 pour enregistrer un partenaire (Burkina Faso, Niger — ou un futur pays) dans
la table `aes_partners` côté Mali. V2 = échange automatisé via le canal BCID-AES (verbe
`rotate-key`).

---

## 1. Ce que le partenaire fournit

Le partenaire (ex. BFA) génère sa paire Ed25519 **in-process** (`@noble`/openssl) et la stocke en
Vault **KV** de son côté (jamais Transit — Transit ne signe pas Ed25519, cf. §4.2ter). Seules **deux
données publiques** quittent le partenaire :

1. **Clé publique JWK Ed25519** (`{ "kty":"OKP", "crv":"Ed25519", "x":"…" }`) + un `kid` (ex.
   `bfa-2026-q2`).
2. **Fingerprint SHA-256 du cert client X.509** (DER) qu'il présentera en mTLS — émis par la CA AES
   partagée.

Récupérer ces données par un **canal sécurisé hors-bande** (courrier diplomatique, échange en main
propre, canal signé). Ne jamais accepter une clé reçue sur un canal non authentifié.

### Calcul du fingerprint (côté vérification)

Le fingerprint enregistré DOIT être identique à celui que `derivePeerFromMtls` recalcule : `SHA-256`
du **DER** du certificat (hex, 64 chars).

```bash
openssl x509 -in bfa-client.pem -outform DER | sha256sum   # → cert_fingerprint
```

Le `Subject` du cert DOIT contenir le code pays AES (`OU=BFA` ou `O=BFA` ou `CN=…BFA…`) : c'est de
là que le service dérive le pays (jamais d'un header).

---

## 2. Enregistrer le partenaire (table `aes_partners`)

```sql
INSERT INTO aes_partners (
  id, country, cert_fingerprint, public_key_jwk, kid, expected_issuer,
  status, valid_from, valid_until, created_by, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'BFA',
  '<sha256-hex-du-DER-du-cert>',                 -- 64 chars
  '{"kty":"OKP","crv":"Ed25519","x":"…"}'::jsonb,
  'bfa-2026-q2',
  'https://interop.dgec.bf',                     -- iss attendu dans le JWS BFA
  'ACTIVE',
  '2026-05-01T00:00:00Z',
  '2027-05-01T00:00:00Z',
  'admin-mli',
  now(), now()
);
```

> ⚠️ La migration SQL `bcid_aes_interop` qui crée la table `aes_partners` est un **livrable Phase
> 2** (nécessite une DB). Le client Prisma est déjà régénéré
> (`pnpm --filter @nina-aes/database run db:generate`).

---

## 3. Vérifier l'enregistrement

```bash
# Happy path : un JWS BFA valide doit renvoyer un JWS de réponse signé.
curl -X POST https://interop.nina-aes.ml/api/v1/interop/verify \
  --cert ./certs/aes-bfa.pem --key ./certs/aes-bfa.key \
  -H "Content-Type: application/jose" \
  --data @./test-jws.txt
# (le JWS doit porter jti=requestId, nbf, exp ≤5min, iss=https://interop.dgec.bf, aud=aes:MLI)
```

En base, vérifier le journal :

```sql
SELECT requester_country, response_exists, response_valid, result
FROM aes_verification_logs ORDER BY created_at DESC LIMIT 5;
```

---

## 4. Rotation / révocation

- **Rotation de clé** : insérer une nouvelle ligne avec un nouveau `kid` + nouvelle `valid_from`,
  laisser l'ancienne active pendant la fenêtre de transition (multi-clés).
- **Révocation** : poser `revoked_at = now()` et `revoked_reason`. `assertPeerKnown` filtre
  `revoked_at IS NULL` + `status = 'ACTIVE'` + fenêtre `valid_from`/`valid_until` → tout JWS de ce
  cert est immédiatement rejeté (403).

---

## 5. Côté sortant (Mali interroge un partenaire)

Renseigner l'endpoint du partenaire :

```
INTEROP_PARTNER_ENDPOINTS=BFA=https://interop.dgec.bf/api/v1/interop,NER=https://interop.dge-cin.ne/api/v1/interop
```

Puis déclencher un appel (route admin, JWT interne + rôle) :

```bash
curl -X POST https://interop.nina-aes.ml/api/v1/interop/outgoing/verify \
  -H "Authorization: Bearer <jwt-operateur>" \
  -H "Content-Type: application/json" \
  -d '{ "targetCountry":"BFA", "nina":"18903102015042V", "purpose":"border-control" }'
```
