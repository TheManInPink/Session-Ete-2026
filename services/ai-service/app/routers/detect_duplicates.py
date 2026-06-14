"""routers/detect_duplicates.py — POST /api/v1/ai/detect-duplicates."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import require_roles
from app.schemas.duplicates import DetectDuplicatesRequest, DetectDuplicatesResponse
from app.services.duplicates import detect_duplicates_timed

router = APIRouter(tags=["detection"])


@router.post(
    "/detect-duplicates",
    response_model=DetectDuplicatesResponse,
    summary="Détecte les doublons potentiels d'un citoyen",
)
async def detect_duplicates(
    request: DetectDuplicatesRequest,
    _ctx=Depends(require_roles("AGENT", "ADMIN", "SYSTEM")),
) -> DetectDuplicatesResponse:
    """Compare le citoyen à un index de candidats et renvoie les doublons probables.

    L'index peut être fourni dans la requête (`candidates`) ; sinon un index de
    démonstration embarqué est utilisé (brancher Elasticsearch en production).

    Returns:
        Doublons potentiels triés par score, avec les champs concordants.
    """
    duplicates, scanned, processing_ms = detect_duplicates_timed(
        request.citizen,
        request.candidates,
        limit=request.limit,
        min_score=request.min_score,
    )
    return DetectDuplicatesResponse(
        potential_duplicates=duplicates,
        candidates_scanned=scanned,
        processing_ms=processing_ms,
    )
