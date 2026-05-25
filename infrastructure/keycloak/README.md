# Keycloak — Realm NINA-AES

Configuration du realm `nina-aes` consommé par `auth-service` (PROMPT 3.2).

## Contenu de `import/realm-nina-aes.json`

- **Realm `nina-aes`** : SSO + brute-force protected (5 tentatives / 15 min)
- **Password policy** : 12 chars min, complexité (Maj/Min/Chiffre/Spécial), 5 derniers historisés
- **6 rôles composites** alignés sur la doc 08 §3.4 :
  - `citizen` (default — assigné automatiquement à tout nouveau user)
  - `agent`
  - `supervisor` ⊇ `agent`
  - `admin` ⊇ `supervisor` ⊇ `agent`
  - `auditor` (transverse, lecture seule)
  - `anticorruption_inspector` (transverse)
- **Client `nina-aes-platform`** (confidentiel) :
  - `directAccessGrantsEnabled` ✅ — utilisé par `auth-service` pour `/auth/login`
  - `serviceAccountsEnabled` ✅ — utilisé pour le `client_credentials` (admin API)
  - Service account doté de `realm-management` (`manage-users`, `view-users`, `query-users`,
    `view-realm`, `view-clients`, `manage-clients`)
  - `secret` initial : `keycloak-client-dev-secret` (override en prod via Vault)
- **Refresh token rotation** activée côté Keycloak (`revokeRefreshToken: true`,
  `refreshTokenMaxReuse: 0`) — cohérent avec la rotation auth-service.
- **Access token lifespan** 900 s (15 min) — aligné `JWT_ACCESS_TTL_SECONDS`.

## Import automatique (dev)

Le compose `infrastructure/docker/docker-compose.dev.yml` monte ce dossier sur
`/opt/keycloak/data/import` et lance Keycloak avec `--import-realm`. À chaque `docker compose up`,
le realm est (re)créé s'il n'existe pas — les realms existants ne sont pas écrasés.

```bash
# Forcer la ré-importation (drop + recreate) :
docker compose -f infrastructure/docker/docker-compose.dev.yml down -v
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d keycloak
```

## Vérification post-import

```bash
# Token admin (client_credentials)
curl -s -X POST "http://localhost:8080/realms/nina-aes/protocol/openid-connect/token" \
  -d 'grant_type=client_credentials' \
  -d 'client_id=nina-aes-platform' \
  -d 'client_secret=keycloak-client-dev-secret' | jq .access_token

# Liste des users (doit fonctionner via le service account)
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/nina-aes/protocol/openid-connect/token" \
  -d 'grant_type=client_credentials' \
  -d 'client_id=nina-aes-platform' \
  -d 'client_secret=keycloak-client-dev-secret' | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/admin/realms/nina-aes/users" | jq .
```

## Production

- Ne PAS utiliser le secret par défaut. Générer un secret aléatoire et le stocker dans Vault
  (`kv/data/keycloak/nina-aes-platform`).
- Activer `sslRequired: all` (actuellement `external` pour permettre l'accès HTTP en LAN dev).
- Activer `verifyEmail: true` après mise en place du provider SMTP.
- Restreindre `webOrigins` (actuellement `+`) à la liste explicite des origines des apps Next.js
  déployées.
