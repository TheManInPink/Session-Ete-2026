"""anomaly.py — Schémas de l'endpoint POST /api/v1/ai/anomaly-score.

Scoring comportemental d'un agent de saisie (détection de fraude / collusion).
Alimente le SIGAC (Bloc D) — cf. docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AnomalyScoreRequest(BaseModel):
    """Indicateurs comportementaux journaliers d'un agent."""

    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "example": {
                "agent_id": "agent-bamako-042",
                "operations_today": 320,
                "avg_processing_time": 12.5,
                "corrections_no_doc": 45,
                "after_hours_actions": 30,
                "same_village_ratio": 0.92,
            }
        },
    )

    agent_id: str = Field(min_length=1, max_length=120)
    operations_today: int = Field(ge=0, description="Nombre d'opérations effectuées aujourd'hui")
    avg_processing_time: float = Field(ge=0.0, description="Temps moyen de traitement (secondes)")
    corrections_no_doc: int = Field(ge=0, description="Corrections sans pièce justificative")
    after_hours_actions: int = Field(ge=0, description="Actions hors heures ouvrables")
    same_village_ratio: float = Field(
        ge=0.0, le=1.0, description="Proportion d'enregistrements d'un même village (0-1)"
    )


class ContributingFactor(BaseModel):
    """Facteur contribuant au score d'anomalie (explicabilité)."""

    factor: str = Field(description="Indicateur concerné")
    value: float = Field(description="Valeur observée")
    baseline: float = Field(description="Valeur de référence (agent normal)")
    deviation: float = Field(description="Écart normalisé par rapport à la référence")


class AnomalyScoreResponse(BaseModel):
    """Score d'anomalie comportementale d'un agent."""

    agent_id: str
    anomaly_score: float = Field(
        ge=0.0, le=1.0, description="Score d'anomalie (0=normal, 1=très anormal)"
    )
    is_anomaly: bool = Field(description="Vrai si le score dépasse le seuil de flag")
    contributing_factors: list[ContributingFactor] = Field(
        description="Facteurs les plus contributifs, triés par écart décroissant"
    )
    method: str = Field(description="Méthode utilisée (isolation_forest | heuristic)")
