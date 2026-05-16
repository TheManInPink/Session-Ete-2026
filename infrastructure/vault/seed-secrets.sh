#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# NINA-AES Platform — Pré-remplissage des secrets dev
# ═══════════════════════════════════════════════════════════════════
# Peuple Vault avec les secrets nécessaires pour démarrer les services
# Bloc A en local. À exécuter APRÈS vault-init.sh.
#
# Secrets injectés :
#   - kv/data/jwt              → paire RS256 générée à la volée
#   - kv/data/database/*       → connection strings Postgres par service
#   - kv/data/africastalking   → API key + username (placeholder en dev)
#   - kv/data/aes/certs        → chemins certificats mTLS (cf. Makefile certs-generate)
#   - kv/data/keycloak         → admin_password + client_secret citizen-app
#   - kv/data/minio            → access_key + secret_key
#   - kv/data/sigac            → clé Ed25519 procureur (dev factice)
#
# Idempotent : ré-exécutable, écrase les valeurs existantes.
#
# ⚠️ En PROD, les valeurs DOIVENT être saisies à la main par un admin
# avec MFA + audit. Ce script n'est utilisable QU'EN DEV.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────
export VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
export VAULT_TOKEN="${VAULT_TOKEN:-${VAULT_DEV_ROOT_TOKEN_ID:-nina-dev}}"

# Refuser l'exécution en prod (sauf force explicite)
if [ "${VAULT_ENV:-dev}" != "dev" ] && [ "${FORCE_PROD_SEED:-no}" != "yes" ]; then
  echo "❌ seed-secrets.sh est INTERDIT en prod sans FORCE_PROD_SEED=yes" >&2
  exit 2
fi

log() { printf "\033[0;32m[seed-secrets]\033[0m %s\n" "$*"; }

vault token lookup >/dev/null || { echo "❌ Token Vault invalide"; exit 1; }
log "Vault accessible — Token OK"

# ─── 1. JWT — paire RS256 RSA 4096 bits ────────────────────────────
log "Génération paire RS256 (RSA 4096)…"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# Génération de la clé privée + extraction de la publique
openssl genrsa -out "$TMP_DIR/jwt_private.pem" 4096 2>/dev/null
openssl rsa -in "$TMP_DIR/jwt_private.pem" \
  -pubout -out "$TMP_DIR/jwt_public.pem" 2>/dev/null

# Stockage dans kv-v2
vault kv put kv/jwt/private \
  pem=@"$TMP_DIR/jwt_private.pem" \
  algorithm="RS256" \
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >/dev/null
log "  ✓ kv/data/jwt/private (RS256 RSA 4096)"

vault kv put kv/jwt/public \
  pem=@"$TMP_DIR/jwt_public.pem" \
  algorithm="RS256" \
  >/dev/null
log "  ✓ kv/data/jwt/public"

# ─── 2. Database connection strings (DEV uniquement) ───────────────
log "Database connection strings (dev) …"

# Pour les rôles de service, on utilise la convention nina_admin/<password>
# matchant ce que init-db.sql provisionne (cf. scripts/init-db.sql).
# En prod, ces strings seraient générées dynamiquement par database engine.
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-nina_aes_db}"
DB_PASS="${POSTGRES_PASSWORD:-nina_dev_password}"

for SVC in identity-service auth-service audit-service document-service \
           appointment-service governance-service vulnerability-service \
           notification-service interop-service; do
  vault kv put "kv/database/$SVC" \
    url="postgresql://nina_admin:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME" \
    >/dev/null
done

# ai-service + anticorruption-service : connection string read-only
vault kv put "kv/database/ai-service" \
  url="postgresql://nina_ai_readonly:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME?application_name=ai-service" \
  >/dev/null
vault kv put "kv/database/anticorruption-service" \
  url="postgresql://nina_admin:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME?application_name=sigac" \
  >/dev/null
log "  ✓ kv/data/database/* (11 services)"

# ─── 3. Africa's Talking (USSD/SMS) — placeholder en dev ───────────
vault kv put kv/africastalking \
  api_key="atsk_dev_PLACEHOLDER_REMPLACER_EN_PROD" \
  username="sandbox" \
  shortcode="*123*NINA#" \
  callback_url="http://localhost:3005/ussd/callback" \
  >/dev/null
log "  ✓ kv/data/africastalking (sandbox, à remplacer en prod)"

# ─── 4. mTLS certificates (chemins) ─────────────────────────────────
# Les certs eux-mêmes sont générés par `make certs-generate` (cf. Makefile).
# Ici on stocke uniquement les CHEMINS pour que les services sachent où
# les trouver dans leur container.
vault kv put kv/aes/certs \
  ca_pem_path="/run/secrets/aes/ca.pem" \
  ca_key_path="/run/secrets/aes/ca.key" \
  mli_cert_path="/run/secrets/aes/mli.pem" \
  mli_key_path="/run/secrets/aes/mli.key" \
  bfa_cert_path="/run/secrets/aes/bfa.pem" \
  ner_cert_path="/run/secrets/aes/ner.pem" \
  >/dev/null
log "  ✓ kv/data/aes/certs (chemins mTLS)"

# ─── 5. Keycloak credentials ───────────────────────────────────────
vault kv put kv/keycloak/admin \
  username="admin" \
  password="${KEYCLOAK_ADMIN_PASSWORD:-keycloak_dev_password}" \
  realm="nina-aes" \
  base_url="http://keycloak:8080" \
  >/dev/null

vault kv put kv/keycloak/citizen-client \
  client_id="citizen-app" \
  client_secret="$(openssl rand -hex 32)" \
  >/dev/null

vault kv put kv/keycloak/admin-client \
  client_id="admin-app" \
  client_secret="$(openssl rand -hex 32)" \
  >/dev/null

log "  ✓ kv/data/keycloak/* (admin + 2 OIDC clients)"

# ─── 6. MinIO (object storage) ─────────────────────────────────────
vault kv put kv/minio \
  endpoint="http://minio:9000" \
  access_key="${MINIO_ROOT_USER:-minioadmin}" \
  secret_key="${MINIO_ROOT_PASSWORD:-minioadmin}" \
  bucket_documents="nina-documents" \
  bucket_backups="nina-backups" \
  >/dev/null
log "  ✓ kv/data/minio"

# ─── 7. SIGAC — clé Ed25519 procureur (dev factice) ────────────────
# En prod, cette clé est générée par Vault Transit avec key type ed25519,
# rotated par le CronJob 90j. Ici en dev on crée juste un placeholder
# pour que ai-service / anticorruption-service démarrent.
if ! vault read transit/keys/sigac-whistleblower >/dev/null 2>&1; then
  vault write -f transit/keys/sigac-whistleblower \
    type=ed25519 \
    exportable=false \
    deletion_allowed=false \
    >/dev/null
  log "  ✓ transit/keys/sigac-whistleblower (Ed25519, non exportable)"
else
  log "  · transit/keys/sigac-whistleblower déjà présente"
fi

# ─── 8. JWT signing key via transit (alternative à kv) ─────────────
# En parallèle du kv/data/jwt/private (legacy), on crée aussi une clé
# Transit qui permet à auth-service de signer SANS jamais extraire la
# clé privée de Vault. Migration cible doc 15 §4.3.
if ! vault read transit/keys/jwt-signing-rs256 >/dev/null 2>&1; then
  vault write -f transit/keys/jwt-signing-rs256 \
    type=rsa-4096 \
    exportable=false \
    >/dev/null
  log "  ✓ transit/keys/jwt-signing-rs256 (RSA 4096, non exportable)"
else
  log "  · transit/keys/jwt-signing-rs256 déjà présente"
fi

# ─── 9. PII encryption pour BCID-AES interop ───────────────────────
if ! vault read transit/keys/aes-interop-mli >/dev/null 2>&1; then
  vault write -f transit/keys/aes-interop-mli \
    type=ed25519 \
    exportable=false \
    >/dev/null
  log "  ✓ transit/keys/aes-interop-mli (Ed25519 — Bloc B BCID-AES)"
fi

# ─── 10. Backup encryption key (age + pgBackRest cipher) ───────────
if ! vault read transit/keys/backup-aes256 >/dev/null 2>&1; then
  vault write -f transit/keys/backup-aes256 \
    type=aes256-gcm96 \
    exportable=false \
    >/dev/null
  log "  ✓ transit/keys/backup-aes256 (cf. doc 19 §4.1)"
fi

log "✅ seed-secrets.sh terminé."
log ""
log "Pour vérifier : "
log "  vault kv list kv/"
log "  vault read transit/keys/jwt-signing-rs256"
log ""
log "⚠️  Les secrets ci-dessus sont des PLACEHOLDERS DE DEV."
log "   En prod, suivre la procédure dans docs/security/vault-usage.md §5."
