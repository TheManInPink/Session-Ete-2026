"""
Pipeline d'entraînement reproductible des modèles IA de la NINA-AES Platform.

Ce paquet regroupe :

- :mod:`training.nina`          — décodage / validation du format NINA (port Python
  fidèle de ``packages/utils/src/nina.ts``).
- :mod:`training.data`          — chargement du dataset synthétique, normalisation
  du schéma et découpe stratifiée train/val/test.
- :mod:`training.features`      — ingénierie de variables (``FeatureBuilder``).
- :mod:`training.train_xgboost` — entraînement du détecteur d'erreurs (XGBoost).
- :mod:`training.train_anomaly` — entraînement de l'Isolation Forest (SIGAC).
- :mod:`training.evaluate`      — rapport d'évaluation HTML (SVG sans dépendance).

Convention d'import (cf. README) :

    pip install -e .
    python -m training.train_xgboost --dataset ../datasets/nina_synthetic_v1.csv

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

__version__ = "1.0.0"

__all__ = [
    "__version__",
]
