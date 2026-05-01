"""
Tests de base pour le service IA.
Ce fichier contient des tests simples pour vérifier que le service IA est opérationnel.
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    """Vérifie que l'endpoint de santé retourne un statut OK."""
    response = client.get("/api/v1/ai/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-service"
