# ═══════════════════════════════════════════════════════════════════
# Vault Policy — admin (humains DBA / DevOps CTDEC)
# ═══════════════════════════════════════════════════════════════════
# Policy distribuée aux admins humains via Keycloak SSO + Vault OIDC
# auth (en prod) ou via root token (dev).
#
# Permet :
#   - Read/Write sur tous les paths kv/
#   - Gérer les engines (rotate keys transit, rotate Postgres creds)
#   - Émettre des certificats PKI mTLS
#   - Lire les audit logs Vault
#
# NE PERMET PAS :
#   - Le `sys/init`, `sys/seal`, `sys/unseal` (réservé Shamir keyholders)
#   - Le déchiffrement des signalements SIGAC (réservé policy `prosecutor`)
#
# ⚠️ MFA obligatoire en prod (Duo / TOTP via Vault MFA).
# ═══════════════════════════════════════════════════════════════════

# ─── Tout l'engine kv-v2 (read/write/delete) ───────────────────────
path "kv/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "kv/data/*" {
  capabilities = ["create", "read", "update", "delete", "patch"]
}

path "kv/metadata/*" {
  capabilities = ["read", "list", "delete"]
}

# ─── Database engine (configurer rôles + rotater root creds) ───────
path "database/config/*" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}

path "database/roles/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "database/rotate-root/*" {
  capabilities = ["update"]
}

# Lecture des credentials dynamiques (pour debug / diagnostic)
path "database/creds/*" {
  capabilities = ["read"]
}

# ─── Transit (manage keys, rotate, NE peut PAS encrypt/decrypt sigac) ─
path "transit/keys" {
  capabilities = ["list"]
}

path "transit/keys/*" {
  capabilities = ["create", "read", "update", "delete"]
}

# Rotation autorisée (utilisée par CronJob vault-rotation)
path "transit/keys/+/rotate" {
  capabilities = ["update"]
}

# Encrypt/decrypt génériques (PAS sigac-whistleblower)
path "transit/encrypt/+" {
  capabilities = ["update"]
}

path "transit/decrypt/+" {
  capabilities = ["update"]
}

# Refus explicite du déchiffrement des signalements lanceurs d'alerte
# → réservé à la policy `prosecutor` (rôle judiciaire dédié)
path "transit/decrypt/sigac-whistleblower" {
  capabilities = ["deny"]
}

# ─── PKI engine (émission de certs mTLS pour les services) ─────────
path "pki/roles/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "pki/issue/*" {
  capabilities = ["update"]
}

path "pki/revoke" {
  capabilities = ["update"]
}

path "pki/tidy" {
  capabilities = ["update"]
}

path "pki/cert/*" {
  capabilities = ["read"]
}

# ─── AppRole (manage les rôles applicatifs) ────────────────────────
path "auth/approle/role/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# ─── Sys — observabilité Vault (audit, mounts, policies) ───────────
path "sys/mounts/*" {
  capabilities = ["read", "list"]
}

path "sys/policies/acl" {
  capabilities = ["list"]
}

path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "sys/health" {
  capabilities = ["read"]
}

path "sys/audit" {
  capabilities = ["read", "list"]
}

# Lookup tokens des autres services (debug)
path "auth/token/lookup" {
  capabilities = ["update"]
}

# ─── Refus explicite — Shamir keyholders uniquement ────────────────
# Init/seal/unseal = procédure manuelle 3/5 admins (cf. doc 19 §4.5)
path "sys/init"   { capabilities = ["deny"] }
path "sys/seal"   { capabilities = ["deny"] }
path "sys/unseal" { capabilities = ["deny"] }
