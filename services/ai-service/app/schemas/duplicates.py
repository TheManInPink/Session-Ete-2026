"""duplicates.py — Schémas de l'endpoint POST /api/v1/ai/detect-duplicates."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CitizenPayload


class CandidateRecord(BaseModel):
    """Enregistrement candidat fourni explicitement dans la requête.

    Permet d'interroger un index sans dépendre d'Elasticsearch (mode stateless).
    En production, l'index est alimenté par identity-service / Elasticsearch.
    """

    model_config = ConfigDict(extra="ignore")

    nina: str = Field(max_length=32)
    first_name: str = Field(max_length=120)
    last_name: str = Field(max_length=120)
    birth_date: str | None = Field(default=None, max_length=40)
    birth_place: str | None = Field(default=None, max_length=200)


class DetectDuplicatesRequest(BaseModel):
    """Requête de détection de doublons pour un citoyen."""

    model_config = ConfigDict(extra="ignore")

    citizen: CitizenPayload
    # Index candidat optionnel ; si absent, l'index par défaut (échantillon
    # embarqué) est utilisé. Brancher Elasticsearch ici en production.
    candidates: list[CandidateRecord] | None = None
    limit: int = Field(default=10, ge=1, le=50, description="Nombre max de candidats retournés")
    min_score: float = Field(
        default=60.0, ge=0.0, le=100.0, description="Score minimal pour retenir un candidat"
    )


class DuplicateCandidate(BaseModel):
    """Un doublon potentiel avec son score et les champs concordants."""

    nina: str = Field(description="NINA masqué du candidat")
    name: str = Field(description="Nom complet du candidat")
    score: float = Field(ge=0.0, le=100.0, description="Score de similarité global")
    match_fields: list[str] = Field(description="Champs ayant fortement concordé")


class DetectDuplicatesResponse(BaseModel):
    """Liste des doublons potentiels triés par score décroissant."""

    potential_duplicates: list[DuplicateCandidate]
    candidates_scanned: int = Field(ge=0, description="Nombre d'enregistrements comparés")
    processing_ms: float = Field(ge=0.0)
