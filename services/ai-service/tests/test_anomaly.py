"""test_anomaly.py — Endpoint POST /api/v1/ai/anomaly-score."""

from __future__ import annotations

URL = "/api/v1/ai/anomaly-score"

NORMAL_AGENT = {
    "agent_id": "agent-normal",
    "operations_today": 80,
    "avg_processing_time": 45.0,
    "corrections_no_doc": 3,
    "after_hours_actions": 2,
    "same_village_ratio": 0.30,
}

SUSPICIOUS_AGENT = {
    "agent_id": "agent-suspect",
    "operations_today": 450,
    "avg_processing_time": 4.0,
    "corrections_no_doc": 90,
    "after_hours_actions": 70,
    "same_village_ratio": 0.98,
}


def test_normal_agent_not_flagged(client):
    """Un agent au comportement nominal n'est pas signalé."""
    response = client.post(URL, json=NORMAL_AGENT)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_anomaly"] is False
    assert 0.0 <= body["anomaly_score"] <= 1.0


def test_suspicious_agent_flagged(client):
    """Un agent au comportement extrême est signalé comme anomalie."""
    response = client.post(URL, json=SUSPICIOUS_AGENT)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_anomaly"] is True
    assert body["anomaly_score"] > NORMAL_AGENT_SCORE(client)
    assert body["contributing_factors"], "facteurs contributifs attendus"


def NORMAL_AGENT_SCORE(client) -> float:  # noqa: N802 - helper nommé pour lisibilité
    """Renvoie le score d'anomalie de l'agent normal (pour comparaison)."""
    return client.post(URL, json=NORMAL_AGENT).json()["anomaly_score"]
