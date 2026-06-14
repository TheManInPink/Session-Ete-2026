"""
telemetry.py — Accès gracieux aux métriques Prometheus métier.

`app/observability.py` définit les métriques métier (`AI_METRICS`) mais importe
OpenTelemetry / Prometheus / structlog au niveau module. Ces dépendances peuvent
être absentes en développement local (wheels cp314 non publiées) ; ce shim
encapsule l'import de façon défensive afin que le pipeline reste fonctionnel
sans observabilité.

Les noms de métriques sont alignés sur le dashboard Grafana
`infrastructure/monitoring/grafana/dashboards/03-ai-service.json` :
    - ai_nina_errors_detected_total{error_class}
    - ai_records_processed_total
    - ai_inference_duration_seconds
    - ai_confidence_score
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Iterator

logger = logging.getLogger("nina_aes.ai.telemetry")

try:  # pragma: no cover - dépend de l'environnement
    from app.observability import AI_METRICS as _AI_METRICS

    _METRICS_ENABLED = True
except Exception as _exc:  # noqa: BLE001 - OTel/Prometheus optionnels en local
    _AI_METRICS = None
    _METRICS_ENABLED = False
    logger.debug("Métriques Prometheus désactivées (%s)", _exc)


def metrics_enabled() -> bool:
    """Indique si les métriques Prometheus sont actives."""
    return _METRICS_ENABLED


@contextlib.contextmanager
def time_inference() -> Iterator[None]:
    """Chronomètre une inférence (no-op si les métriques sont indisponibles)."""
    if not _METRICS_ENABLED:
        yield
        return
    with _AI_METRICS["inference_duration"].time():  # type: ignore[index]
        yield


def record_result(score: float, errors: list) -> None:
    """Met à jour les compteurs/jauges métier après une analyse.

    Args:
        score: score de confiance global (0-100).
        errors: liste d'anomalies détectées (objets avec attribut ``type``).
    """
    if not _METRICS_ENABLED:
        return
    try:  # pragma: no cover - dépend de l'environnement d'exécution
        _AI_METRICS["records_processed"].inc()  # type: ignore[index]
        _AI_METRICS["confidence_score"].set(score)  # type: ignore[index]
        for err in errors:
            _AI_METRICS["errors_detected"].labels(  # type: ignore[index]
                error_class=getattr(err, "type", "unknown")
            ).inc()
    except Exception as exc:  # noqa: BLE001 - une métrique ne doit jamais casser le pipeline
        logger.debug("Émission de métriques échouée : %s", exc)
