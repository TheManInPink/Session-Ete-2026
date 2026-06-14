"""
main.py — Point d'entrée du service IA (ai-service) — port 3003.

Module IA de détection et correction des erreurs de saisie NINA. Expose
**7 endpoints** REST + une sonde de santé, articulés autour d'un pipeline de
détection en 5 étapes (ingestion → normalisation → analyse → scoring →
soumission).

Endpoints (préfixe `/api/v1/ai`) :
    1. POST /detect-errors      — analyse complète d'un enregistrement NINA
    2. POST /compare-names      — comparaison fuzzy + phonétique de deux noms
    3. POST /detect-duplicates  — doublons potentiels d'un citoyen
    4. POST /anomaly-score      — score comportemental d'un agent (SIGAC)
    5. POST /ocr-extract        — OCR d'un acte de naissance scanné
    6. POST /ner                — reconnaissance d'entités nommées
    7. GET  /health             — statut + modèles chargés + backends

Sécurité : l'authentification est terminée au bord par l'api-gateway (ADR-029) ;
ce service fait confiance au contexte `X-User-Context` (cf. `app/auth.py`).

Observabilité : `/metrics` Prometheus + tracing OTLP sont activés si les
dépendances d'observabilité sont présentes, sinon ignorés silencieusement
(dégradation gracieuse).

Auteur : Étudiant UQAR — Date : 2026 — Référence : docs/11-AI-SERVICE-FASTAPI.md.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import (
    anomaly_score,
    compare_names,
    detect_duplicates,
    detect_errors,
    health,
    ner,
    ocr_extract,
)

logger = logging.getLogger("nina_aes.ai")

# Préfixe public de tous les endpoints métier (proxifié par l'api-gateway).
API_PREFIX = "/api/v1/ai"


def _setup_observability(app: FastAPI) -> None:
    """Active /metrics (toujours) + tracing OTLP (opt-in), si dispo (best effort).

    Le tracing est **opt-in** via `OTEL_TRACING_ENABLED` (aligné sur l'api-gateway,
    PROMPT 3.7) pour éviter les tentatives de connexion à Jaeger en local.
    """
    try:
        from app.observability import init_tracing, instrument

        instrument(app)  # expose /metrics + auto-instrumentation FastAPI
        if os.environ.get("OTEL_TRACING_ENABLED", "").lower() in ("1", "true", "yes"):
            init_tracing("ai-service")
            logger.info("Observabilité activée (/metrics + tracing OTLP).")
        else:
            logger.info("Observabilité activée (/metrics ; tracing OTLP désactivé).")
    except Exception as exc:  # noqa: BLE001 - OTel/Prometheus optionnels en local
        logger.warning("Observabilité désactivée (%s).", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cycle de vie : pré-chargement best-effort du modèle au démarrage."""
    from app.models.registry import registry

    # Vérification rapide de la présence du modèle XGBoost (n'échoue jamais).
    registry.get_xgb_bundle()
    logger.info("ai-service prêt — env=%s, port=%s.", settings.env, settings.port)
    yield
    logger.info("ai-service arrêté.")


def create_app() -> FastAPI:
    """Construit et configure l'application FastAPI.

    Returns:
        Instance FastAPI prête à être servie par uvicorn.
    """
    # Garde-fou production : refuser de démarrer sans secret de vérification du
    # contexte gateway (sinon les signatures X-User-Context ne seraient pas
    # vérifiées — fail-closed, cf. ADR-029).
    if settings.env == "production" and not settings.gateway_jws_secret:
        raise RuntimeError(
            "AI_GATEWAY_JWS_SECRET est obligatoire en production "
            "(vérification du contexte X-User-Context)."
        )

    app = FastAPI(
        title="NINA-AES · ai-service",
        description="Module IA de détection et correction des erreurs de saisie NINA "
        "(pipeline 5 étapes : fuzzy, phonétique, NER, scoring).",
        version=health.SERVICE_VERSION,
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=f"{API_PREFIX}/redoc",
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )

    # CORS : permissif uniquement hors production. On n'autorise jamais les
    # credentials avec une origine joker (`*`) — combinaison interdite/risquée.
    cors_origins = settings.cors_origins if settings.env != "production" else []
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials="*" not in cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    # Sonde de santé (racine, pour la probe Docker `curl /health`).
    app.include_router(health.router)

    # Endpoints métier sous le préfixe public.
    for module in (
        detect_errors,
        compare_names,
        detect_duplicates,
        anomaly_score,
        ocr_extract,
        ner,
    ):
        app.include_router(module.router, prefix=API_PREFIX)

    _setup_observability(app)

    # Alias OpenAPI pour l'agrégateur Swagger de l'api-gateway (cf. PROMPT 3.7).
    @app.get("/api/docs-json", include_in_schema=False)
    async def docs_json() -> JSONResponse:  # noqa: ANN202 - handler interne
        return JSONResponse(app.openapi())

    # Gestionnaire d'erreurs : ne jamais divulguer la stack au client.
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:  # noqa: ANN001
        logger.exception("Erreur non gérée sur %s : %s", request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "Erreur interne du service IA.", "code": "E_AI_INTERNAL"},
        )

    return app


app = create_app()
