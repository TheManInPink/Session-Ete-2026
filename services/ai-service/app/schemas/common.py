"""
common.py — Types et schémas Pydantic partagés entre endpoints.

Choix de conception important : les payloads d'entrée acceptent des valeurs
**potentiellement erronées** (NINA mal formé, date avec des lettres, etc.).
C'est volontaire — le rôle du service est justement de *détecter* ces erreurs.
Une validation trop stricte (regex NINA sur l'entrée) renverrait un 422 avant
même l'analyse, ce qui irait à l'encontre de l'objectif. On valide donc en
profondeur dans le pipeline, pas au bord du schéma.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Sex(str, Enum):
    """Sexe déclaré du citoyen."""

    M = "M"
    F = "F"
    X = "X"  # non précisé / autre


class Language(str, Enum):
    """Langues nationales supportées (8 langues — inclusion numérique)."""

    FR = "fr"  # français
    BM = "bm"  # bambara
    SNK = "snk"  # soninké
    FF = "ff"  # peul (fulfulde)
    TMQ = "tmq"  # tamasheq
    HAU = "hau"  # haoussa
    MOS = "mos"  # mooré
    DJE = "dje"  # songhaï (zarma)


class Severity(str, Enum):
    """Gravité d'une anomalie détectée."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Verdict(str, Enum):
    """Verdict global de l'analyse, dérivé du score de confiance."""

    HIGH_CONFIDENCE = "HIGH_CONFIDENCE"  # score >= 85
    MEDIUM_CONFIDENCE = "MEDIUM_CONFIDENCE"  # 60 <= score < 85
    LOW_CONFIDENCE = "LOW_CONFIDENCE"  # score < 60


class ParentInfo(BaseModel):
    """Filiation déclarée (père / mère). Champs libres, souvent incomplets."""

    model_config = ConfigDict(extra="ignore")

    father: str | None = Field(default=None, max_length=200, description="Nom complet du père")
    mother: str | None = Field(default=None, max_length=200, description="Nom complet de la mère")


class CitizenPayload(BaseModel):
    """Enregistrement citoyen à analyser.

    Les champs sont volontairement permissifs : le NINA et la date peuvent être
    invalides en entrée (c'est ce que l'IA cherche à repérer).
    """

    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "example": {
                "nina": "18903102015042V",
                "first_name": "Aliou",
                "last_name": "Traoré",
                "birth_date": "1989-03-15",
                "birth_place": "Kayes",
                "sex": "M",
                "parents": {"father": "Modibo Traoré", "mother": "Fatoumata Diarra"},
                "language": "fr",
            }
        },
    )

    nina: str = Field(
        min_length=1, max_length=32, description="Numéro NINA (brut, peut être invalide)"
    )
    first_name: str = Field(min_length=1, max_length=120, description="Prénom(s)")
    last_name: str = Field(min_length=1, max_length=120, description="Nom de famille")
    # Chaîne brute (et non `date`) pour pouvoir détecter « lettres dans la date ».
    birth_date: str = Field(
        min_length=1, max_length=40, description="Date de naissance (ISO de préférence)"
    )
    sex: Sex
    birth_place: str | None = Field(
        default=None, max_length=200, description="Lieu de naissance (texte libre)"
    )
    birth_region: str | None = Field(
        default=None, max_length=120, description="Région de naissance normalisée"
    )
    parents: ParentInfo | None = None
    language: Language | None = None
