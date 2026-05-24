#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# NINA-AES Platform — Vérification de l'environnement
# Usage : bash scripts/check-env.sh
# ═══════════════════════════════════════════════════

set -e
ERRORS=0

echo "═══════════════════════════════════════════════"
echo " NINA-AES — Vérification de l'environnement"
echo "═══════════════════════════════════════════════"
echo ""

# Fonction de vérification
check() {
  local name="$1"
  local cmd="$2"
  local expected="$3"

  if version=$($cmd 2>/dev/null); then
    echo "  ✅ $name : $version"
  else
    echo "  ❌ $name : NON TROUVÉ (attendu : $expected)"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "── Outils de développement ──"
check "Node.js"         "node --version"           "v24.x.x"
check "pnpm"            "pnpm --version"           "10.x.x"
check "TypeScript"      "npx tsc --version"        "6.0.x"
check "Python"          "python --version"          "3.14.x"
check "Git"             "git --version"             "2.53.x"
check "Docker"          "docker --version"          "29.x.x"
check "Docker Compose"  "docker compose version"    "v5.x.x"

echo ""
echo "── Conteneurs Docker ──"
for container in nina-postgres nina-redis nina-rabbitmq nina-minio nina-elasticsearch nina-keycloak nina-vault nina-maildev; do
  if docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null | grep -q "running"; then
    echo "  ✅ $container : running"
  else
    echo "  ❌ $container : NON DÉMARRÉ"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "── Extensions PostgreSQL ──"
EXTENSIONS=$(docker exec nina-postgres psql -U nina_admin -d nina_aes_db -t -c "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp','pgcrypto','pg_trgm','unaccent') ORDER BY extname;" 2>/dev/null || echo "ERREUR")
for ext in pgcrypto pg_trgm unaccent uuid-ossp; do
  if echo "$EXTENSIONS" | grep -q "$ext"; then
    echo "  ✅ $ext"
  else
    echo "  ❌ $ext : MANQUANTE"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "── Fichiers de configuration ──"
for f in .env infrastructure/docker/docker-compose.dev.yml package.json pnpm-workspace.yaml turbo.json Makefile .prettierrc .editorconfig commitlint.config.js; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ $f : MANQUANT"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "── Workspaces pnpm ──"
WORKSPACES=$(pnpm ls -r --depth -1 2>/dev/null | grep -c "@nina-aes" || echo "0")
echo "  Workspaces @nina-aes détectés : $WORKSPACES"
if [ "$WORKSPACES" -ge 15 ]; then
  echo "  ✅ Nombre suffisant (>= 15)"
else
  echo "  ⚠️  Nombre insuffisant (attendu >= 15)"
fi

echo ""
echo "═══════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo " ✅ ENVIRONNEMENT OK — Prêt à coder !"
else
  echo " ❌ $ERRORS ERREUR(S) DÉTECTÉE(S)"
  echo "    Corrigez les problèmes ci-dessus avant de continuer."
fi
echo "═══════════════════════════════════════════════"

exit $ERRORS
