#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# NINA-AES Platform — Vault initialization & configuration
# ═══════════════════════════════════════════════════════════════════
# Configure HashiCorp Vault pour le projet :
#   1. (PROD uniquement) init + unseal Shamir 5/3
#   2. Active les engines : kv-v2, pki, database, transit, totp
#   3. Applique les policies par rôle (./policies/*.hcl)
#   4. Active l'auth method `approle` pour les services
#   5. Affiche les role_id/secret_id à copier dans Kubernetes secrets
#
# Compatible :
#   - Mode DEV (docker-compose.dev.yml) : Vault auto-init + auto-unseal,
#     root token = ${VAULT_DEV_ROOT_TOKEN_ID:-nina-dev}. Le script SKIP
#     init/unseal et passe direct aux engines/policies.
#   - Mode PROD (K3s) : init Shamir + unseal manuel + login root via OTP.
#
# Idempotent : ré-exécutable sans casser l'existant.
# Cf. docs/15-SECURITY-HARDENING.md §4.1 + docs/security/vault-usage.md.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_DEV_TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-nina-dev}"
POLICIES_DIR="$(cd "$(dirname "$0")" && pwd)/policies"
INIT_FILE="${VAULT_INIT_FILE:-./secrets/vault-init.txt}"   # PROD only

# Couleurs (pour la lisibilité — désactiver si pas TTY)
if [ -t 1 ]; then
  C_GREEN='\033[0;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[0;31m'; C_RESET='\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_RESET=''
fi
log()  { printf "${C_GREEN}[vault-init]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}[vault-init] ⚠️  %s${C_RESET}\n" "$*"; }
err()  { printf "${C_RED}[vault-init] ❌ %s${C_RESET}\n" "$*" >&2; }

# ─── Détection du mode (dev/prod) ──────────────────────────────────
export VAULT_ADDR
STATUS_JSON="$(vault status -format=json 2>&1 || true)"

if echo "$STATUS_JSON" | grep -q '"sealed":false' && \
   echo "$STATUS_JSON" | grep -q '"initialized":true'; then
  # Vault déjà prêt (mode dev OU prod déjà initialisé)
  if [ -n "${VAULT_DEV_ROOT_TOKEN_ID:-}" ] || \
     echo "$STATUS_JSON" | grep -q '"dev_mode":true'; then
    log "Mode DEV détecté — skip init/unseal."
    export VAULT_TOKEN="$VAULT_DEV_TOKEN"
  else
    log "Mode PROD, Vault déjà initialisé + unsealed."
    if [ -f "$INIT_FILE" ]; then
      VAULT_TOKEN=$(grep -E 'Initial Root Token' "$INIT_FILE" | awk '{print $NF}')
      export VAULT_TOKEN
    else
      err "Init file $INIT_FILE introuvable. Login manuel requis."
      exit 1
    fi
  fi
elif echo "$STATUS_JSON" | grep -q '"initialized":false'; then
  # PROD non initialisé → init + unseal Shamir
  warn "Vault non initialisé. Démarrage de l'init Shamir 5/3 (PROD)."
  mkdir -p "$(dirname "$INIT_FILE")"
  vault operator init -key-shares=5 -key-threshold=3 \
    -format=table > "$INIT_FILE"
  warn "Unseal keys écrites dans $INIT_FILE — DISTRIBUER aux 5 admins CTDEC."
  warn "Ce fichier doit être SUPPRIMÉ après distribution sécurisée."

  # Unseal en utilisant les 3 premières clés (DEV/staging uniquement)
  for i in 1 2 3; do
    KEY=$(grep -E "Unseal Key $i" "$INIT_FILE" | awk '{print $NF}')
    vault operator unseal "$KEY" >/dev/null
  done
  log "Vault unsealed (3/5 keys utilisées)."

  VAULT_TOKEN=$(grep -E 'Initial Root Token' "$INIT_FILE" | awk '{print $NF}')
  export VAULT_TOKEN
else
  err "État Vault inattendu. Status JSON :"
  echo "$STATUS_JSON" >&2
  exit 1
fi

# ─── Login & vérification ──────────────────────────────────────────
vault token lookup >/dev/null 2>&1 || {
  err "Token Vault invalide. Vérifier VAULT_TOKEN ou $INIT_FILE"
  exit 1
}
log "Token Vault accepté."

# ─── 1. Activation des engines de secrets ──────────────────────────
log "Activation des engines…"

# kv-v2 — secrets génériques (private keys, API keys, config)
vault secrets enable -version=2 -path=kv kv 2>/dev/null && \
  log "  ✓ engine kv-v2 (path: kv/)" || log "  · engine kv déjà activé"

# pki — autorité de certification interne pour mTLS (cf. doc 15)
vault secrets enable -path=pki pki 2>/dev/null && \
  log "  ✓ engine pki (path: pki/)" || log "  · engine pki déjà activé"
vault secrets tune -max-lease-ttl=87600h pki >/dev/null 2>&1 || true

# database — rotation auto des credentials Postgres
vault secrets enable -path=database database 2>/dev/null && \
  log "  ✓ engine database (path: database/)" || log "  · engine database déjà activé"

# transit — chiffrement de PII applicatif (signalements SIGAC, etc.)
vault secrets enable -path=transit transit 2>/dev/null && \
  log "  ✓ engine transit (path: transit/)" || log "  · engine transit déjà activé"

# totp — MFA codes pour les agents CTDEC
vault secrets enable -path=totp totp 2>/dev/null && \
  log "  ✓ engine totp (path: totp/)" || log "  · engine totp déjà activé"

# ─── 2. Application des policies (./policies/*.hcl) ────────────────
log "Application des policies…"

if [ ! -d "$POLICIES_DIR" ]; then
  err "Répertoire policies introuvable : $POLICIES_DIR"
  exit 1
fi

for hcl in "$POLICIES_DIR"/*.hcl; do
  POLICY_NAME=$(basename "$hcl" .hcl)
  vault policy write "$POLICY_NAME" "$hcl" >/dev/null
  log "  ✓ policy $POLICY_NAME ← $(basename "$hcl")"
done

# ─── 3. Auth method AppRole pour les services NestJS/FastAPI ───────
log "Configuration AppRole…"
vault auth enable approle 2>/dev/null && \
  log "  ✓ auth method approle activé" || log "  · approle déjà activé"

# Créer un AppRole par policy de service (NB : admin/auditor sont
# distribués manuellement aux humains via Keycloak SSO en prod).
SERVICE_ROLES="identity-service auth-service ai-service"
for ROLE in $SERVICE_ROLES; do
  vault write "auth/approle/role/$ROLE" \
    token_policies="$ROLE" \
    token_ttl=24h \
    token_max_ttl=72h \
    secret_id_ttl=720h \
    secret_id_num_uses=0 >/dev/null
  log "  ✓ approle $ROLE (TTL 24h, max 72h)"
done

# ─── 4. Afficher les role_id / secret_id (pour Kubernetes Secrets) ─
log "RoleID / SecretID à copier dans Kubernetes Secrets :"
for ROLE in $SERVICE_ROLES; do
  RID=$(vault read -format=json "auth/approle/role/$ROLE/role-id" | \
        grep '"role_id"' | sed 's/.*: *"\(.*\)".*/\1/')
  SID=$(vault write -format=json -f "auth/approle/role/$ROLE/secret-id" | \
        grep '"secret_id"' | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
  echo ""
  echo "  $ROLE :"
  echo "    role_id   = $RID"
  echo "    secret_id = $SID"
done
echo ""
warn "Ces credentials sont à stocker comme K8s Secret type Opaque,"
warn "ou comme Sealed Secret (cf. doc 20 §4.5)."

log "✅ vault-init.sh terminé. Lancer maintenant : ./seed-secrets.sh"
