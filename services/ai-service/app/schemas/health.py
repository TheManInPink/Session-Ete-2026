"""health.py — Schéma de l'endpoint GET /health."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """État de santé du service IA : statut, modèles chargés, dépendances."""

    status: str = Field(description="ok | degraded")
    service: str = Field(default="ai-service")
    version: str
    timestamp: str = Field(description="Horodatage ISO 8601 UTC")
    models: dict = Field(description="Modèles ML/NLP chargés (xgboost, spacy, ocr…)")
    backends: dict = Field(description="Bibliothèques actives (rapidfuzz, jellyfish…)")
    referential: dict = Field(description="État des référentiels (régions, cercles)")
