"""routers/compare_names.py — POST /api/v1/ai/compare-names."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import require_roles
from app.schemas.compare_names import CompareNamesRequest, CompareNamesResponse
from app.services.comparator import compare_names

router = APIRouter(tags=["comparison"])


@router.post(
    "/compare-names",
    response_model=CompareNamesResponse,
    summary="Compare deux noms (fuzzy + phonétique) et rend un verdict",
)
async def compare(
    request: CompareNamesRequest,
    _ctx=Depends(require_roles("AGENT", "ADMIN", "SYSTEM")),
) -> CompareNamesResponse:
    """Agrège plusieurs métriques de similarité entre deux noms.

    Returns:
        RapidFuzz, Jaro-Winkler, Levenshtein, Soundex/Metaphone, score agrégé
        et verdict (`identical` | `similar` | `different`).
    """
    result = compare_names(request.name1, request.name2)
    return CompareNamesResponse(
        rapidfuzz_ratio=result.rapidfuzz_ratio,
        jaro_winkler=result.jaro_winkler,
        levenshtein=result.levenshtein,
        soundex_match=result.soundex_match,
        metaphone_match=result.metaphone_match,
        african_soundex_match=result.african_soundex_match,
        overall_similarity=result.overall_similarity,
        verdict=result.verdict,
    )
