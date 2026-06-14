# ============================================================================
# Dockerfile — ai-service (FastAPI, port 3003)
# ============================================================================
# Image autonome multi-stage. Pour les builds CI/CD, le pipeline utilise plutôt
# le Dockerfile générique partagé `infrastructure/docker/Dockerfile.fastapi`
# (build-arg SERVICE=ai-service) ; ce fichier reste l'équivalent standalone.
#
# Python 3.13-slim (et non 3.14) tant que spaCy/XGBoost ne publient pas de
# wheels cp314 — `blis` (transitive spaCy) ne compile pas contre l'API CPython
# 3.14. Bumper vers 3.14-slim dès publication des wheels.
# ============================================================================

# ── Stage 1 — builder : dépendances système + Python ───────────────────────
FROM python:3.13-slim-bookworm AS builder

# build-essential : compilation d'éventuelles dépendances natives.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /install
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install/deps -r requirements.txt

# ── Stage 2 — runtime : image finale minimale, non-root ────────────────────
FROM python:3.13-slim-bookworm

# Dépendances runtime :
#   libgomp1        : OpenMP requis par XGBoost
#   tesseract-ocr + fra : OCR des actes de naissance (/ocr-extract)
#   curl            : HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgomp1 \
      tesseract-ocr \
      tesseract-ocr-fra \
      curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nina && useradd -u 1001 -g 1001 -m -s /sbin/nologin nina

WORKDIR /app

# Récupère les paquets Python installés au stage builder.
COPY --from=builder /install/deps /usr/local
# Code applicatif (layout `app/`, cohérent avec package.json et la CI).
COPY --chown=nina:nina app/ ./app/

USER nina

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AI_PORT=3003

EXPOSE 3003

# La sonde Docker interroge /health (racine), exposé par app/routers/health.py.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3003/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3003"]
