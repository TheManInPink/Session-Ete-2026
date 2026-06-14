"""ner.py — Schémas de l'endpoint POST /api/v1/ai/ner."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Language


class NerRequest(BaseModel):
    """Texte à analyser pour reconnaissance d'entités nommées."""

    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "example": {
                "text": "Aliou Traoré, né le 15 mars 1989 à Kayes, fils de Modibo Traoré.",
                "language": "fr",
            }
        },
    )

    text: str = Field(min_length=1, max_length=10_000)
    language: Language | None = Field(default=Language.FR)


class Entity(BaseModel):
    """Entité nommée localisée dans le texte."""

    text: str = Field(description="Texte de l'entité")
    label: str = Field(description="Type (PER, LOC, ORG, DATE, MISC…)")
    start: int = Field(ge=0, description="Index de début (caractère)")
    end: int = Field(ge=0, description="Index de fin (caractère, exclu)")
    score: float = Field(ge=0.0, le=1.0, default=1.0, description="Confiance de la détection")


class NerResponse(BaseModel):
    """Liste des entités détectées dans le texte."""

    entities: list[Entity]
    engine: str = Field(description="Moteur utilisé (spacy | regex_fallback)")
    language: str = Field(description="Langue traitée")
