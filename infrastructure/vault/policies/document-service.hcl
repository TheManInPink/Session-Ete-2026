# ═══════════════════════════════════════════════════════════════════
# Vault Policy — document-service (port 3004, NestJS)
# ═══════════════════════════════════════════════════════════════════
# document-service génère la Fiche Descriptive Individuelle (FDI),
# PDF officiel CTDEC avec QR JWT RS256 vérifiable offline.
#
# Le QR est signé via le module Vault Transit (clé `nina-qr-signing`).
# La clé privée RSA 3072 NE QUITTE JAMAIS Vault — le service envoie un
# hash et reçoit la signature (cf. ADR-006 + ADR-026).
#
# Surface d'attaque minimale : ce service peut SIGNER, pas LIRE
# la clé, pas la ROTER, pas EXPORTER. Il ne peut pas non plus signer
# avec d'autres clés (jwt-signing-rs256 d'auth-service, etc.).
# ═══════════════════════════════════════════════════════════════════

# ─── Secrets de config (kv-v2) ─────────────────────────────────────
path "kv/data/document-service/*" {
  capabilities = ["read"]
}

# Credentials MinIO (access/secret keys du compte de service)
path "kv/data/minio/document-service" {
  capabilities = ["read"]
}

# ─── Credentials dynamiques Postgres ───────────────────────────────
path "database/creds/document-app" {
  capabilities = ["read"]
}

# ─── Transit — signature des QR FDI ────────────────────────────────
# Lecture des métadonnées de la clé (pour récupérer latest_version → kid)
path "transit/keys/nina-qr-signing" {
  capabilities = ["read"]
}

# Signature : SHA-256 du payload JWT envoyé, signature renvoyée.
# `prehashed=true` + `signature_algorithm=pkcs1v15` côté service.
path "transit/sign/nina-qr-signing/sha2-256" {
  capabilities = ["update"]
}

# Vérification — utile pour les tests d'intégrité côté service
path "transit/verify/nina-qr-signing/sha2-256" {
  capabilities = ["update"]
}

# ─── Token lifecycle ───────────────────────────────────────────────
path "auth/token/renew-self"  { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }

# ─── Refus explicite ──────────────────────────────────────────────
# Aucun droit de rotation manuelle (réservée au CronJob vault-rotation)
path "transit/keys/nina-qr-signing/rotate" {
  capabilities = ["deny"]
}

# Aucun droit d'export de la clé (même pour audit)
path "transit/keys/nina-qr-signing/export/*" {
  capabilities = ["deny"]
}

# Cloisonnement avec les autres services
path "kv/data/auth-service/*"          { capabilities = ["deny"] }
path "kv/data/identity-service/*"      { capabilities = ["deny"] }
path "kv/data/ai-service/*"            { capabilities = ["deny"] }
path "kv/data/anticorruption-service/*" { capabilities = ["deny"] }

# Pas le droit de signer avec la clé d'auth-service
path "transit/sign/jwt-signing-rs256/*" { capabilities = ["deny"] }
