# ============================================================================
# ai-service (port 3003) — image autonome (FastAPI + XGBoost + RapidFuzz)
# ============================================================================
# ⚠️ CONTEXTE DE BUILD = RACINE DU DÉPÔT (le Dockerfile copie aussi
# ai-models/training pour pouvoir désérialiser le bundle joblib) :
#
#   docker build -f services/ai-service/Dockerfile -t nina-aes/ai-service:latest .
#
# L'image multi-services générique de la CI reste
# infrastructure/docker/Dockerfile.fastapi (cf. doc 16/20) ; ce fichier est la
# variante autonome corrigée (l'ancienne version lançait `src.main:app` — un
# fichier vide — sur une base Alpine + apt-get invalides).
#
# Pin Python 3.13 (et NON 3.14) tant que spaCy ne publie pas de wheels cp314
# (cf. note ci.yml / Dockerfile.fastapi).
# ============================================================================
FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Rend le paquet `training` importable pour désérialiser le FeatureBuilder
    # du bundle (cf. app/inference.py + ADR-030), sans pip-install (évite le
    # conflit requires-python>=3.14 du paquet training sur une image 3.13).
    PYTHONPATH=/app/training-src

WORKDIR /app

# Dépendances système des libs ML : libgomp1 (XGBoost), tesseract (OCR), curl
# (HEALTHCHECK). apt (Debian slim) — PAS apk.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      libgomp1 \
      libstdc++6 \
      tesseract-ocr \
      tesseract-ocr-fra \
    && rm -rf /var/lib/apt/lists/*

# 1) Dépendances Python (couche cachée tant que requirements.txt est stable).
COPY services/ai-service/requirements.txt .
RUN pip install -r requirements.txt

# 2) Code de feature engineering (nécessaire à la désérialisation du bundle).
#    Ses dépendances (scikit-learn, xgboost, pandas, numpy, rapidfuzz, jellyfish)
#    sont déjà fournies par requirements.txt ci-dessus.
COPY ai-models/training/src /app/training-src

# 3) Code applicatif du service.
COPY services/ai-service/app ./app

# Utilisateur non-root (UID 1001, cohérent avec les autres images NINA-AES).
RUN groupadd -g 1001 nina && useradd -u 1001 -g nina -m -s /sbin/nologin nina
USER nina

EXPOSE 3003

# ⚠️ Le bundle modèle (ai-models/exported/xgboost_v1.joblib) n'est PAS embarqué
# (gitignoré, produit par la CI). Le fournir au runtime via un volume monté sur
# AI_XGBOOST_BUNDLE_PATH, ou le récupérer depuis MinIO au démarrage (cf. doc 20).
# Le service démarre quand même si le modèle est absent (chargement non bloquant).

# Sonde de liveness — endpoint /health non préfixé (cf. app/main.py).
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3003/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3003"]
