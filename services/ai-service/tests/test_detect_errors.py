"""test_detect_errors.py — Endpoint POST /api/v1/ai/detect-errors."""

from __future__ import annotations

URL = "/api/v1/ai/detect-errors"

# Enregistrement parfaitement cohérent (NINA valide 18903102015042V).
CLEAN = {
    "nina": "18903102015042V",
    "first_name": "Aliou",
    "last_name": "Traoré",
    "birth_date": "1989-03-15",
    "sex": "M",
    "birth_place": "Kayes",
    "parents": {"father": "Modibo Sangaré", "mother": "Hawa Diarra"},
}


def _detect(client, **overrides):
    citizen = {**CLEAN, **overrides}
    response = client.post(URL, json={"citizen": citizen})
    assert response.status_code == 200, response.text
    return response.json()


def _types(body) -> set[str]:
    return {e["type"] for e in body["errors_detected"]}


def test_clean_record_high_confidence(client):
    """Un enregistrement cohérent ne déclenche aucune erreur."""
    body = _detect(client)
    assert body["errors_detected"] == []
    assert body["verdict"] == "HIGH_CONFIDENCE"
    assert body["overall_confidence"] == 100.0
    assert body["nina_masked"] != CLEAN["nina"]  # jamais en clair


def test_invalid_checksum_detected_with_suggestion(client):
    """Une lettre de contrôle erronée est détectée et corrigée par suggestion."""
    body = _detect(client, nina="18903102015042A")
    assert "nina_checksum_invalid" in _types(body)
    assert any(s["field"] == "nina" for s in body["suggestions"])
    assert body["verdict"] == "MEDIUM_CONFIDENCE"


def test_invalid_format_detected(client):
    """Un NINA mal formé est signalé sans planter le pipeline."""
    body = _detect(client, nina="ABC123")
    assert "nina_format_invalid" in _types(body)


def test_future_birth_date(client):
    """Une date de naissance dans le futur est détectée (critique)."""
    body = _detect(client, birth_date="2090-01-01")
    assert "birth_date_in_future" in _types(body)
    assert body["overall_confidence"] < 60.0


def test_birth_date_with_letters(client):
    """Une date contenant des lettres est signalée."""
    body = _detect(client, birth_date="quinze mars 1989")
    assert "birth_date_has_letters" in _types(body)


def test_sex_inconsistent_with_nina(client):
    """Un sexe déclaré incohérent avec le NINA est détecté."""
    body = _detect(client, sex="F")
    assert "sex_nina_mismatch" in _types(body)


def test_suspicious_characters_in_name(client):
    """Des chiffres dans un prénom sont signalés."""
    body = _detect(client, first_name="Al1ou")
    assert "suspicious_characters" in _types(body)
