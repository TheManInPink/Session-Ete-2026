"""Tests de base du service SIGAC (santé)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    """L'endpoint de santé préfixé retourne un statut OK pour anticorruption-service."""
    response = client.get("/api/v1/sigac/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "anticorruption-service"


def test_health_probe_unprefixed() -> None:
    """La liveness non préfixée /health (sonde Docker) répond aussi OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["service"] == "anticorruption-service"
