"""test_health.py — Sonde de santé du service IA."""

from __future__ import annotations


def test_health_root(client):
    """GET /health (sonde Docker) renvoie un statut et l'état des modèles."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in {"ok", "degraded"}
    assert data["service"] == "ai-service"
    assert "xgboost" in data["models"]
    assert "spacy" in data["models"]
    assert "rapidfuzz" in data["backends"]
    assert "regions_loaded" in data["referential"]


def test_health_aliased(client):
    """GET /api/v1/ai/health (alias gateway) répond également."""
    response = client.get("/api/v1/ai/health")
    assert response.status_code == 200
    assert response.json()["service"] == "ai-service"


def test_openapi_available(client):
    """Le schéma OpenAPI expose bien les 7 endpoints attendus."""
    response = client.get("/api/v1/ai/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    for endpoint in (
        "/api/v1/ai/detect-errors",
        "/api/v1/ai/compare-names",
        "/api/v1/ai/detect-duplicates",
        "/api/v1/ai/anomaly-score",
        "/api/v1/ai/ocr-extract",
        "/api/v1/ai/ner",
        "/health",
    ):
        assert endpoint in paths, f"endpoint manquant dans OpenAPI : {endpoint}"
