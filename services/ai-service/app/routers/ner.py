"""routers/ner.py — POST /api/v1/ai/ner."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import require_roles
from app.schemas.ner import NerRequest, NerResponse
from app.services.ner import extract_entities

router = APIRouter(tags=["nlp"])


@router.post(
    "/ner",
    response_model=NerResponse,
    summary="Reconnaissance d'entités nommées (spaCy ou fallback regex)",
)
async def ner(
    request: NerRequest,
    _ctx=Depends(require_roles("AGENT", "ADMIN", "SYSTEM")),
) -> NerResponse:
    """Détecte les entités nommées (personnes, lieux, dates) dans un texte.

    Returns:
        Liste d'entités localisées + moteur utilisé (`spacy` ou
        `regex_fallback`).
    """
    language = request.language.value if request.language else "fr"
    entities, engine = extract_entities(request.text, language)
    return NerResponse(entities=entities, engine=engine, language=language)
