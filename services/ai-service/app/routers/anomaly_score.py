"""routers/anomaly_score.py — POST /api/v1/ai/anomaly-score."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import require_roles
from app.schemas.anomaly import AnomalyScoreRequest, AnomalyScoreResponse
from app.services.anomaly import score_agent

router = APIRouter(tags=["sigac"])


@router.post(
    "/anomaly-score",
    response_model=AnomalyScoreResponse,
    summary="Score d'anomalie comportementale d'un agent (Isolation Forest)",
)
async def anomaly_score(
    request: AnomalyScoreRequest,
    # Réservé aux superviseurs/SIGAC : surveillance des agents.
    _ctx=Depends(require_roles("ADMIN", "SYSTEM", "SUPERVISOR")),
) -> AnomalyScoreResponse:
    """Évalue le risque de fraude/collusion d'un agent de saisie.

    Returns:
        Score d'anomalie (0-1), drapeau, et facteurs contributifs expliqués.
    """
    return score_agent(request)
