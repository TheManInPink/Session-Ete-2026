# ═══════════════════════════════════════════════════════════════════
# Vault Policy — identity-service (port 3001, NestJS)
# ═══════════════════════════════════════════════════════════════════
# identity-service est le service le plus sollicité du Bloc A
# (validation NINA, recherche citoyens). Il doit :
#
#   - Lire les secrets de configuration (DATABASE_URL, JWT_PUBLIC_KEY)
#   - Lire les credentials Postgres dynamiques rotated 24h (database engine)
#   - PAS écrire dans kv ni signer/déchiffrer via transit (read-only)
#
# Tout accès écriture ou cross-service est INTERDIT (principe du
# moindre privilège). Pour les opérations sensibles (signature JWS,
# émission de FDI), passer par auth-service ou document-service.
# ═══════════════════════════════════════════════════════════════════

# ─── Secrets de config (kv-v2) ─────────────────────────────────────
# kv-v2 utilise le préfixe `data/` dans les paths (différent de kv-v1).
path "kv/data/identity-service/*" {
  capabilities = ["read"]
}

# Lire la clé publique JWT partagée (vérification des tokens entrants)
path "kv/data/jwt/public" {
  capabilities = ["read"]
}

# ─── Credentials dynamiques Postgres (rotation 24h) ────────────────
# Lecture seule sur le rôle `identity_app` qui aura les permissions
# DML sur les tables Citizen, Location, AuditLog (cf. doc 06).
path "database/creds/identity-app" {
  capabilities = ["read"]
}

# ─── Token lifecycle ───────────────────────────────────────────────
# Renouveler son propre token (avant expiration TTL 24h)
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Lookup pour debug (token TTL restant)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# ─── Refus explicite ──────────────────────────────────────────────
# Refuser explicitement les accès cross-service (defense-in-depth).
# Sans ces deny, le wildcard kv/data/identity-service/* aurait été
# strictement nécessaire mais Vault préfère les deny explicites
# pour les audits ANSSI.
path "kv/data/auth-service/*"    { capabilities = ["deny"] }
path "kv/data/ai-service/*"      { capabilities = ["deny"] }
path "kv/data/anticorruption-service/*" { capabilities = ["deny"] }
path "transit/encrypt/*"         { capabilities = ["deny"] }
path "transit/decrypt/*"         { capabilities = ["deny"] }
path "pki/issue/*"               { capabilities = ["deny"] }
