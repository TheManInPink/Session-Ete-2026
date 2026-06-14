"""Chargement paresseux et gracieux des modèles ML/NLP (XGBoost, spaCy)."""

from app.models.registry import ModelRegistry, registry

__all__ = ["ModelRegistry", "registry"]
