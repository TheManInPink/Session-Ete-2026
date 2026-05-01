#!/bin/bash
# ============================================================================
# NINA-AES Platform — Initialisation des buckets MinIO
# ============================================================================
# Usage : exécuter après le premier 'docker compose up'
#   bash scripts/init-minio.sh
# ============================================================================

set -e

echo "=== Initialisation MinIO — Création des buckets ==="

# Configurer le client MinIO pour se connecter au conteneur local
docker exec nina-minio mc alias set local http://localhost:9000 \
  "${MINIO_ROOT_USER:-nina_minio_admin}" \
  "${MINIO_ROOT_PASSWORD:-nina_minio_dev_2026_secure}" 2>/dev/null

# Créer le bucket pour les photos d'identité des citoyens
docker exec nina-minio mc mb local/nina-photos --ignore-existing
echo "  ✓ Bucket nina-photos créé (photos d'identité)"

# Créer le bucket pour les documents PDF générés (Fiches Descriptives)
docker exec nina-minio mc mb local/nina-documents --ignore-existing
echo "  ✓ Bucket nina-documents créé (PDF Fiches Descriptives)"

# Créer le bucket pour les documents scannés (actes de naissance, justificatifs)
docker exec nina-minio mc mb local/nina-scans --ignore-existing
echo "  ✓ Bucket nina-scans créé (documents scannés)"

# Créer le bucket pour les sauvegardes
docker exec nina-minio mc mb local/nina-backups --ignore-existing
echo "  ✓ Bucket nina-backups créé (sauvegardes)"

# Politique de lecture publique pour les photos (en dev seulement)
docker exec nina-minio mc anonymous set download local/nina-photos

echo ""
echo "=== MinIO initialisé avec succès ==="
echo "  Console : http://localhost:9001"
echo "  API     : http://localhost:9000"