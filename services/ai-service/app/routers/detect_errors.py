"""routers/detect_errors.py — POST /api/v1/ai/detect-errors."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import require_roles
from app.schemas.detect_errors import DetectErrorsRequest, DetectErrorsResponse
from app.services.pipeline import run_detection

router = APIRouter(tags=["detection"])


@router.post(
    "/detect-errors",
    response_model=DetectErrorsResponse,
    summary="Analyse complète d'un enregistrement NINA pour détecter les erreurs",
)
async def detect_errors(
    request: DetectErrorsRequest,
    _ctx=Depends(require_roles("AGENT", "ADMIN", "SYSTEM")),
) -> DetectErrorsResponse:
    """Exécute le pipeline de détection en 5 étapes sur un enregistrement.

    Vérifie : format/checksum NINA, date de naissance (futur/<1900/format),
    cohérence sexe & année & géographie encodées dans le NINA, inversion
    nom/prénom, fautes d'orthographe (fuzzy), caractères suspects.

    Returns:
        Erreurs détectées, suggestions de correction, score de confiance global.
    """
    return run_detection(request.citizen, request.context)
