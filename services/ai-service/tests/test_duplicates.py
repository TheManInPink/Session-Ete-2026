"""test_duplicates.py — Endpoint POST /api/v1/ai/detect-duplicates."""

from __future__ import annotations

URL = "/api/v1/ai/detect-duplicates"

CITIZEN = {
    "nina": "18903102015042V",
    "first_name": "Aliou",
    "last_name": "Traoré",
    "birth_date": "1989-03-15",
    "sex": "M",
    "birth_place": "Kayes",
}


def test_finds_default_index_duplicates(client):
    """Sans candidats fournis, l'index de démonstration révèle des doublons."""
    response = client.post(URL, json={"citizen": CITIZEN})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["candidates_scanned"] >= 1
    assert body["potential_duplicates"], "au moins un doublon attendu"
    top = body["potential_duplicates"][0]
    assert top["score"] >= 99.0  # même NINA → collision certaine
    assert "nina" in top["match_fields"]


def test_explicit_candidates_near_duplicate(client):
    """Un quasi-doublon (faute de frappe sur le nom, même date) est détecté."""
    candidates = [
        {
            "nina": "18903102015099X",
            "first_name": "Aliou",
            "last_name": "Traore",
            "birth_date": "1989-03-15",
            "birth_place": "Kayes",
        }
    ]
    response = client.post(URL, json={"citizen": CITIZEN, "candidates": candidates})
    body = response.json()
    assert body["candidates_scanned"] == 1
    assert body["potential_duplicates"], "le quasi-doublon doit être retenu"
    assert body["potential_duplicates"][0]["score"] >= 80.0


def test_no_match_returns_empty(client):
    """Un citoyen sans rapport avec les candidats ne renvoie aucun doublon."""
    candidates = [
        {
            "nina": "10112305012007Y",
            "first_name": "Bakary",
            "last_name": "Konaté",
            "birth_date": "2001-12-20",
            "birth_place": "Sikasso",
        }
    ]
    response = client.post(URL, json={"citizen": CITIZEN, "candidates": candidates})
    body = response.json()
    assert body["potential_duplicates"] == []


def test_default_index_ninas_are_valid():
    """Toutes les fiches de l'index de démonstration ont un NINA valide."""
    from app.services import nina_rules
    from app.services.duplicates import DEFAULT_INDEX

    for record in DEFAULT_INDEX:
        assert nina_rules.validate_nina(record.nina), (
            f"NINA invalide dans DEFAULT_INDEX : {record.nina}"
        )
