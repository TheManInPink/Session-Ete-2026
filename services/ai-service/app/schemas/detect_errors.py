"""detect_errors.py — Schémas de l'endpoint POST /api/v1/ai/detect-errors."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import CitizenPayload, Severity, Verdict


class DetectErrorsRequest(BaseModel):
    """Requête d'analyse d'un enregistrement NINA unique."""

    model_config = ConfigDict(extra="ignore")

    citizen: CitizenPayload
    # Contexte optionnel (taux d'anomalie de l'agent, vélocité…), enrichit le scoring.
    context: dict | None = None


class DetectedError(BaseModel):
    """Une anomalie détectée sur l'enregistrement."""

    type: str = Field(description="Code de l'erreur (ex. nina_checksum_invalid)")
    field: str | None = Field(default=None, description="Champ concerné (ex. nina, birth_date)")
    severity: Severity
    message: str = Field(description="Explication lisible par un humain (français)")
    confidence: float = Field(ge=0.0, le=1.0, description="Confiance de la détection (0-1)")
    details: dict = Field(default_factory=dict, description="Détails structurés pour le frontend")


class Suggestion(BaseModel):
    """Proposition de correction (jamais appliquée automatiquement)."""

    field: str = Field(description="Champ à corriger")
    current_value: str = Field(description="Valeur actuelle")
    proposed_value: str = Field(description="Valeur proposée")
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(description="Justification de la proposition")


class DetectErrorsResponse(BaseModel):
    """Résultat de l'analyse : erreurs, suggestions, score agrégé."""

    nina_masked: str = Field(description="NINA masqué (jamais en clair dans les logs)")
    errors_detected: list[DetectedError]
    suggestions: list[Suggestion]
    overall_confidence: float = Field(
        ge=0.0, le=100.0, description="Score de confiance global (0-100, plus haut = plus sûr)"
    )
    verdict: Verdict
    model_version: str = Field(description="Version du modèle/heuristique utilisé")
    processing_ms: float = Field(ge=0.0, description="Temps de traitement en millisecondes")
