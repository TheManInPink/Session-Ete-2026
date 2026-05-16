# ═══════════════════════════════════════════════════════════════════
# Vault Policy — ai-service (port 3003, FastAPI Python)
# ═══════════════════════════════════════════════════════════════════
# ai-service exécute le pipeline ML de détection d'erreurs NINA
# (cf. ADR-015). Il a besoin de :
#
#   - Lire sa config (modèle paths, dataset paths)
#   - Lire les credentials Postgres (READ-ONLY sur citizens pour analyse)
#   - PAS d'accès au transit (pas de chiffrement applicatif côté IA)
#   - PAS de signature (l'IA n'émet pas de documents officiels)
#
# Le moindre privilège est ici crucial : un modèle ML peut être
# extrait par membership inference attack si compromis. On limite
# strictement la surface.
# ═══════════════════════════════════════════════════════════════════

# ─── Secrets de config (kv-v2) ─────────────────────────────────────
path "kv/data/ai-service/*" {
  capabilities = ["read"]
}

# ─── Credentials Postgres en LECTURE SEULE ─────────────────────────
# Le rôle `ai-readonly` n'a que des GRANT SELECT sur citizens, locations,
# audit_logs (cf. doc 06 §3.2). Aucun INSERT/UPDATE/DELETE.
path "database/creds/ai-readonly" {
  capabilities = ["read"]
}

# ─── Token lifecycle ───────────────────────────────────────────────
path "auth/token/renew-self"  { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }

# ─── Refus explicite ──────────────────────────────────────────────
# Aucun accès cross-service, aucun transit, aucun PKI, aucune écriture.
path "kv/data/identity-service/*" { capabilities = ["deny"] }
path "kv/data/auth-service/*"      { capabilities = ["deny"] }
path "kv/data/jwt/*"                { capabilities = ["deny"] }
path "transit/*"                    { capabilities = ["deny"] }
path "pki/*"                        { capabilities = ["deny"] }
path "database/creds/auth-app"      { capabilities = ["deny"] }
path "database/creds/identity-app"  { capabilities = ["deny"] }
