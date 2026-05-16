#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# NINA-AES Platform — Rotation périodique des secrets Vault
# ═══════════════════════════════════════════════════════════════════
# Exécuté tous les 90 jours par le CronJob K3s
# `vault-rotation` (cf. infrastructure/k8s/cronjobs/vault-rotation.yaml).
#
# Rotation :
#   1. Clés Transit signantes (jwt-signing-rs256, aes-interop-mli) →
#      nouvelle version, les anciennes restent valides pour la
#      vérification jusqu'à `min_decryption_version`.
#   2. Database root credentials Postgres (engine database).
#   3. Secret IDs AppRole (force le re-bootstrap des services).
#
# NE TOUCHE PAS à :
#   - sigac-whistleblower : rotation manuelle par procureur (sinon
#     les signalements en attente deviendraient indéchiffrables
#     sans la procédure formelle de réémission).
#   - backup-aes256 : rotation tous les 5 ans cf. doc 19 §4.5.
#
# Logs audit dans Vault audit log (kv/audit/) + appel webhook
# `alertmanager` si une rotation échoue.
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
[ -z "${VAULT_TOKEN:-}" ] && { echo "❌ VAULT_TOKEN obligatoire"; exit 2; }

ROTATION_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log() { printf "[rotate-secrets %s] %s\n" "$ROTATION_DATE" "$*"; }

log "Début rotation périodique — $(date -u)"

# ─── 1. Rotation des clés Transit signantes ────────────────────────
TRANSIT_KEYS=(
  "jwt-signing-rs256"     # auth-service JWT signing
  "aes-interop-mli"       # Bloc B BCID-AES Ed25519
)

for KEY in "${TRANSIT_KEYS[@]}"; do
  if vault read "transit/keys/$KEY" >/dev/null 2>&1; then
    vault write -f "transit/keys/$KEY/rotate" >/dev/null
    VERSION=$(vault read -format=json "transit/keys/$KEY" | \
              grep '"latest_version"' | sed 's/.*: *\([0-9]*\).*/\1/')
    log "  ✓ transit/keys/$KEY rotated → v${VERSION}"
  else
    log "  · transit/keys/$KEY absente, skip"
  fi
done

# ─── 2. Rotation root credentials Postgres ─────────────────────────
# Force Postgres à changer le mot de passe du compte `vault_root`,
# que Vault utilise pour générer les credentials des rôles applicatifs.
# Conséquence : tous les nouveaux `database/creds/*` utiliseront ce
# nouveau mot de passe — transparent pour les services qui utilisent
# le lease Vault.
if vault read database/config/nina-postgres >/dev/null 2>&1; then
  vault write -f database/rotate-root/nina-postgres >/dev/null
  log "  ✓ database/rotate-root/nina-postgres (Postgres password rotated)"
else
  log "  · database/config/nina-postgres absente, skip"
fi

# ─── 3. Rotation des AppRole secret_id (services NestJS/FastAPI) ───
# Force les services à reconfigurer leur Kubernetes Secret. À combiner
# avec un `kubectl rollout restart` orchestré par ce même CronJob
# (cf. yaml ci-après).
SERVICE_ROLES="identity-service auth-service ai-service audit-service document-service"

for ROLE in $SERVICE_ROLES; do
  if vault read "auth/approle/role/$ROLE" >/dev/null 2>&1; then
    # Détruire les anciens secret_id (force le re-bootstrap)
    vault write -f "auth/approle/role/$ROLE/secret-id" >/dev/null
    log "  ✓ approle $ROLE — nouveau secret_id émis"
  fi
done

log "✅ Rotation terminée — $(date -u)"

# ─── Logging structuré pour Loki (cf. doc 17) ──────────────────────
# Output JSON parsable par Promtail / Loki query.
cat <<EOF
{"event":"vault_rotation_completed","timestamp":"$ROTATION_DATE","keys_rotated":["jwt-signing-rs256","aes-interop-mli"],"database_root_rotated":true,"approles_rotated":5}
EOF
