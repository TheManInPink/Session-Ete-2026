# ═══════════════════════════════════════════════════════════════════
# Vault Policy — auditor (OCLEI / ANSSI inspecteurs)
# ═══════════════════════════════════════════════════════════════════
# Policy READ-ONLY pour les auditeurs externes (OCLEI Mali, audit
# ANSSI ponctuel). Permet de :
#
#   - Lire les audit logs Vault (sys/audit + chemins d'audit configurés)
#   - Lire les métadonnées des secrets (sans lire les secrets eux-mêmes)
#   - Lire la configuration (policies, mounts, auth methods)
#   - Lire les credentials du rôle `auditor-postgres` (lecture
#     audit_logs Prisma + tables citoyens hashed)
#
# AUCUN accès en écriture, AUCUN secret réel lisible.
# AUCUN accès aux signalements SIGAC déchiffrés.
# ═══════════════════════════════════════════════════════════════════

# ─── Métadonnées kv-v2 uniquement (PAS les data) ───────────────────
# Permet de voir QUELS secrets existent, sans voir leur contenu.
path "kv/metadata/*" {
  capabilities = ["read", "list"]
}

# REFUS explicite des `data` (où sont les secrets en clair)
path "kv/data/*" {
  capabilities = ["deny"]
}

# ─── Audit logs Postgres applicatif ────────────────────────────────
# Rôle Postgres dédié auditeur (SELECT-only sur audit_logs +
# vue anonymisée des citoyens). Cf. doc 09 + doc 17.
path "database/creds/auditor-postgres" {
  capabilities = ["read"]
}

# ─── Sys — lecture des metadata Vault (audit forensique) ───────────
path "sys/audit" {
  capabilities = ["read", "list"]
}

path "sys/mounts" {
  capabilities = ["read", "list"]
}

path "sys/mounts/*" {
  capabilities = ["read"]
}

path "sys/policies/acl" {
  capabilities = ["list"]
}

path "sys/policies/acl/*" {
  capabilities = ["read"]
}

path "sys/health" {
  capabilities = ["read"]
}

path "sys/leases/lookup/*" {
  capabilities = ["read"]
}

# Lister les rôles AppRole et leurs métadonnées (sans secret_id)
path "auth/approle/role" {
  capabilities = ["list"]
}

path "auth/approle/role/*" {
  capabilities = ["read"]
}

# ─── Token lifecycle de l'auditeur ─────────────────────────────────
path "auth/token/renew-self"  { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }

# ─── Refus explicite (defense-in-depth) ────────────────────────────
path "transit/encrypt/*" { capabilities = ["deny"] }
path "transit/decrypt/*" { capabilities = ["deny"] }
path "transit/sign/*"    { capabilities = ["deny"] }
path "pki/issue/*"       { capabilities = ["deny"] }
path "pki/revoke"        { capabilities = ["deny"] }
path "sys/init"          { capabilities = ["deny"] }
path "sys/seal"          { capabilities = ["deny"] }
path "sys/unseal"        { capabilities = ["deny"] }
