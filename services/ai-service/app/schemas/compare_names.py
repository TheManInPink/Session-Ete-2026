"""compare_names.py — Schémas de l'endpoint POST /api/v1/ai/compare-names."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CompareNamesRequest(BaseModel):
    """Requête de comparaison de deux noms."""

    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={"example": {"name1": "Mamadou Traoré", "name2": "Mamadu Traore"}},
    )

    name1: str = Field(min_length=1, max_length=200)
    name2: str = Field(min_length=1, max_length=200)


class CompareNamesResponse(BaseModel):
    """Métriques de similarité agrégées + verdict."""

    rapidfuzz_ratio: float = Field(
        ge=0.0, le=100.0, description="Ratio d'édition normalisé (0-100)"
    )
    jaro_winkler: float = Field(ge=0.0, le=1.0, description="Similarité Jaro-Winkler (0-1)")
    levenshtein: int = Field(ge=0, description="Distance d'édition brute")
    soundex_match: bool = Field(description="Même code Soundex latin")
    metaphone_match: bool = Field(description="Même code Metaphone")
    african_soundex_match: bool = Field(description="Même code Soundex africain (maison)")
    overall_similarity: float = Field(ge=0.0, le=100.0, description="Score agrégé (0-100)")
    verdict: Literal["identical", "similar", "different"]
