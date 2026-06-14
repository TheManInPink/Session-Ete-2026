"""
conftest.py — Configuration partagée des tests pytest.

Ajoute la racine du service au `sys.path` pour que `import app...` fonctionne
quand pytest est lancé depuis `services/ai-service/`, et expose un client de
test FastAPI réutilisable.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest  # pyright: ignore[reportMissingImports]

# Racine du service (= parent du dossier tests/) ajoutée au path d'import.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Déterminisme : on force le mode heuristique (modèle introuvable) pour que les
# tests du moteur de règles ne dépendent PAS d'un éventuel modèle entraîné
# présent dans ai-models/trained/. L'intégration XGBoost est couverte à part
# (test_fallbacks.py, modèle mocké).
os.environ["AI_XGBOOST_MODEL_PATH"] = str(Path(__file__).resolve().parent / "__no_model__.pkl")


@pytest.fixture(scope="session")
def client():
    """Client de test synchrone pour l'app FastAPI du service IA."""
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
