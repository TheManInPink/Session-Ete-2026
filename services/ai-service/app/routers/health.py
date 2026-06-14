"""routers/health.py — GET /health (+ alias /api/v1/ai/health)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app import telemetry
from app.models.registry import registry
from app.schemas.health import HealthResponse
from app.services.comparator import runtime_backends
from app.services.ocr import ocr_available
from app.services.reference import reference_status

router = APIRouter(tags=["health"])

# Version exposée (alignée sur pyproject.toml).
SERVICE_VERSION = "1.0.0"


def _health_payload() -> HealthResponse:
    """Construit la réponse de santé (sans déclencher de chargement coûteux)."""
    backends = runtime_backends()
    backends["metrics"] = telemetry.metrics_enabled()
    backends["ocr"] = ocr_available()
    referential = reference_status()
    status = "ok" if referential.get("geo_referential_available") else "degraded"
    return HealthResponse(
        status=status,
        service="ai-service",
        version=SERVICE_VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
        models=registry.loaded_models(),
        backends=backends,
        referential=referential,
    )


@router.get("/health", response_model=HealthResponse, summary="Santé du service IA")
async def health() -> HealthResponse:
    """Sonde de liveness (utilisée par Docker/K3s) + état des modèles et backends."""
    return _health_payload()


@router.get(
    "/api/v1/ai/health",
    response_model=HealthResponse,
    summary="Santé du service IA (alias derrière l'api-gateway)",
)
async def health_aliased() -> HealthResponse:
    """Alias de :func:`health`, joignable via le préfixe proxifié par le gateway."""
    return _health_payload()
