# ═══════════════════════════════════════════════════════════════════
# Vault Policy — auth-service (port 3002, NestJS)
# ═══════════════════════════════════════════════════════════════════
# auth-service est l'autorité de confiance JWT/OIDC du système. Il :
#
#   - Signe les access_token et refresh_token JWT RS256 (PRIVATE KEY)
#   - Vérifie les ID tokens Keycloak (intégration OIDC)
#   - Gère les credentials applicatifs (client_secret, admin_password)
#   - Rotate sa propre clé de signature tous les 90 jours (transit engine)
#
# C'est le SEUL service qui peut lire `kv/data/jwt/private`.
# Compromis auth-service = compromis de toutes les sessions citoyens.
# ═══════════════════════════════════════════════════════════════════

# ─── Secrets de config (kv-v2) ─────────────────────────────────────
path "kv/data/auth-service/*" {
  capabilities = ["read"]
}

# Clé PRIVÉE RS256 pour signer les JWT (lecture seule par ce service)
path "kv/data/jwt/private" {
  capabilities = ["read"]
}

# Clé PUBLIQUE pour la vérification (partagée mais ici utilisée localement)
path "kv/data/jwt/public" {
  capabilities = ["read"]
}

# Credentials Keycloak (admin user pour gestion realm, client_secret)
path "kv/data/keycloak/*" {
  capabilities = ["read"]
}

# ─── Credentials dynamiques Postgres ───────────────────────────────
path "database/creds/auth-app" {
  capabilities = ["read"]
}

# ─── Transit — signature/vérification JWT via Vault ────────────────
# Alternative à la clé en kv : Vault génère et garde la clé privée,
# auth-service envoie le payload à signer et récupère la signature.
# Plus sûr car la clé NE QUITTE JAMAIS Vault.
path "transit/keys/jwt-signing-rs256" {
  capabilities = ["read"]
}

path "transit/sign/jwt-signing-rs256" {
  capabilities = ["update"]
}

path "transit/verify/jwt-signing-rs256" {
  capabilities = ["update"]
}

# Rotation de la clé tous les 90 jours (cf. vault-rotation.yaml CronJob)
path "transit/keys/jwt-signing-rs256/rotate" {
  capabilities = ["update"]
}

# ─── Token lifecycle ───────────────────────────────────────────────
path "auth/token/renew-self"  { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }

# ─── Refus explicite ──────────────────────────────────────────────
path "kv/data/identity-service/*" { capabilities = ["deny"] }
path "kv/data/ai-service/*"        { capabilities = ["deny"] }
path "kv/data/anticorruption-service/*" { capabilities = ["deny"] }
path "transit/decrypt/sigac-whistleblower" { capabilities = ["deny"] }
