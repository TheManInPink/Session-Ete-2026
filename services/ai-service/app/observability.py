"""
observability.py — Module d'observabilité pour ai-service (FastAPI).

Équivalent fonctionnel de @nina-aes/observability (TypeScript) côté
Python. Fournit :

    1. instrument(app)                 — /metrics + métriques HTTP auto
    2. init_tracing(service_name)      — OTel SDK → OTLP gRPC Jaeger
    3. get_logger(service_name)        — structlog JSON avec redact PII
    4. Métriques métier prédéfinies    — ai_nina_errors_detected_total, etc.

Référence : docs/17-MONITORING-OBSERVABILITY.md §4.3 + ADR-017.

Usage type :

    from app.observability import instrument, init_tracing, get_logger, AI_METRICS

    # AVANT tout import applicatif :
    init_tracing("ai-service")

    from fastapi import FastAPI
    app = FastAPI(title="ai-service")
    instrument(app)
    logger = get_logger("ai-service")

    @app.post("/api/detect")
    async def detect(request):
        with AI_METRICS["inference_duration"].time():
            result = run_pipeline(request)
        AI_METRICS["errors_detected"].labels(error_class=result.kind).inc()
        return result
"""

from __future__ import annotations

import logging
import os
from typing import Any

import structlog  # pyright: ignore[reportMissingImports]
from opentelemetry import trace  # pyright: ignore[reportMissingImports]
from opentelemetry.sdk.resources import Resource  # pyright: ignore[reportMissingImports]
from opentelemetry.sdk.trace import TracerProvider  # pyright: ignore[reportMissingImports]
from opentelemetry.sdk.trace.export import BatchSpanProcessor  # pyright: ignore[reportMissingImports]
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter  # pyright: ignore[reportMissingImports]
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # pyright: ignore[reportMissingImports]
from opentelemetry.instrumentation.requests import RequestsInstrumentor  # pyright: ignore[reportMissingImports]

try:
    # Optionnel : nécessite `sqlalchemy` (non installé pour ai-service, qui est
    # stateless). Sans lui, on désactive l'auto-instrumentation SQL plutôt que
    # de faire échouer tout le module d'observabilité.
    from opentelemetry.instrumentation.sqlalchemy import (  # pyright: ignore[reportMissingImports]
        SQLAlchemyInstrumentor,
    )
except Exception:  # noqa: BLE001 - sqlalchemy absent → instrumentation SQL désactivée
    SQLAlchemyInstrumentor = None  # type: ignore[assignment, misc]
from prometheus_client import Counter, Gauge, Histogram  # pyright: ignore[reportMissingImports]
from prometheus_fastapi_instrumentator import Instrumentator  # pyright: ignore[reportMissingImports]
from fastapi import FastAPI


# ─── PII redactor pour structlog ────────────────────────────────────
# Liste exhaustive des champs à caviardiser. Tout ajout doit être
# synchronisé avec packages/observability/src/logger.ts (TS).
_PII_FIELDS = frozenset(
    {
        "nina",
        "nina_raw",
        "ninaNumber",
        "fingerprint_hash",
        "fingerprintHash",
        "face_embedding",
        "faceEmbedding",
        "date_naissance",
        "dateNaissance",
        "date_of_birth",
        "dateOfBirth",
        "phone_number",
        "phoneNumber",
        "password",
        "token",
        "refresh_token",
        "refreshToken",
        "authorization",
        "cookie",
    }
)


def _redact_pii(_logger: Any, _method: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Processeur structlog qui caviarde récursivement les champs PII."""

    def _walk(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: ("***REDACTED***" if k in _PII_FIELDS else _walk(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_walk(item) for item in obj]
        return obj

    return _walk(event_dict)  # type: ignore[return-value]


# ─── Initialisation du tracing OpenTelemetry ────────────────────────
def init_tracing(service_name: str, *, otlp_endpoint: str | None = None) -> None:
    """Configure OTel + exporter OTLP gRPC vers Jaeger.

    DOIT être appelé AVANT toute initialisation FastAPI ou SQLAlchemy
    pour que les auto-instrumentations s'attachent correctement.

    Args:
        service_name: nom du service (ex. 'ai-service')
        otlp_endpoint: surcharge OTEL_EXPORTER_OTLP_ENDPOINT env
    """
    endpoint = otlp_endpoint or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://jaeger:4317")

    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": service_name,
                "service.version": os.environ.get("SERVICE_VERSION", "0.1.0"),
                "deployment.environment": os.environ.get("ENV", "dev"),
            }
        )
    )
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=endpoint, insecure=True),
            max_export_batch_size=512,
            schedule_delay_millis=5000,
        )
    )
    trace.set_tracer_provider(provider)

    # Auto-instrumentations clés (chargées même si non utilisées)
    RequestsInstrumentor().instrument()
    if SQLAlchemyInstrumentor is not None:
        try:
            SQLAlchemyInstrumentor().instrument()
        except Exception:  # noqa: BLE001 - SQLAlchemy non utilisé partout
            pass


# ─── Instrumentation Prometheus /metrics ───────────────────────────
def instrument(app: FastAPI) -> None:
    """Active /metrics + histogrammes HTTP par défaut + auto-instrument
    FastAPI traces.

    À appeler APRÈS création de l'app et init_tracing().
    """
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health", "/health/live", "/health/ready"],
        env_var_name="PROMETHEUS_ENABLED",
    ).instrument(app).expose(
        app,
        endpoint="/metrics",
        include_in_schema=False,
    )

    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls="/metrics,/health,/health/live,/health/ready",
    )


# ─── Logger structuré JSON avec redact PII ─────────────────────────
def get_logger(service_name: str) -> Any:
    """Retourne un logger structlog configuré pour NINA-AES.

    Sortie : JSON (compatible Promtail → Loki).
    Redaction : tous les champs PII listés dans _PII_FIELDS.

    Args:
        service_name: nom de service (label log).

    Returns:
        structlog.BoundLogger configuré.
    """
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _redact_pii,
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    # Niveau via LOG_LEVEL env
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, level_name, logging.INFO),
    )
    return structlog.get_logger(service_name).bind(
        service=service_name,
        env=os.environ.get("ENV", "dev"),
        version=os.environ.get("SERVICE_VERSION", "0.1.0"),
    )


# ─── Métriques métier prédéfinies ──────────────────────────────────
# Convention : <domain>_<subject>_<unit>
# Compatibilité noms avec packages/observability TS (Grafana dashboards
# partagés entre stacks).

AI_METRICS: dict[str, Counter | Histogram | Gauge] = {
    "errors_detected": Counter(
        "ai_nina_errors_detected_total",
        "Erreurs NINA détectées par le pipeline IA, par classe",
        ["error_class"],
    ),
    "inference_duration": Histogram(
        "ai_inference_duration_seconds",
        "Latence d'une inférence IA complète",
        buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
    ),
    "records_processed": Counter(
        "ai_records_processed_total",
        "Records NINA traités par le pipeline IA",
    ),
    "confidence_score": Gauge(
        "ai_confidence_score",
        "Score de confiance moyen IA (0-100) — fenêtre glissante 5min",
    ),
}

SIGAC_METRICS: dict[str, Counter | Histogram | Gauge] = {
    "agent_anomaly": Gauge(
        "sigac_agent_anomaly_score",
        "Score d'anomalie agent (0-100, > 75 = flag)",
        ["user_id", "region"],
    ),
    "integrity_score": Gauge(
        "sigac_integrity_score",
        "Score d'intégrité agrégé (0-100)",
        ["region"],
    ),
    "reports_received": Counter(
        "sigac_whistleblower_reports_total",
        "Signalements lanceurs d'alerte reçus",
        ["classification", "severity"],
    ),
    "pending_reports": Gauge(
        "sigac_pending_reports",
        "Signalements en attente de traitement",
        ["severity"],
    ),
}
