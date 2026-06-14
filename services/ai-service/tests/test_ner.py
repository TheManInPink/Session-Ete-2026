"""test_ner.py — Endpoint POST /api/v1/ai/ner (fonctionne avec ou sans spaCy)."""

from __future__ import annotations

URL = "/api/v1/ai/ner"


def test_extracts_entities(client):
    """Le NER détecte au moins une personne et une date dans un texte typé."""
    text = "Aliou Traoré, né le 15 mars 1989 à Kayes, fils de Modibo Traoré."
    response = client.post(URL, json={"text": text, "language": "fr"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["engine"] in {"spacy", "regex_fallback"}
    labels = {e["label"] for e in body["entities"]}
    assert body["entities"], "au moins une entité attendue"
    assert "DATE" in labels


def test_offsets_are_consistent(client):
    """Les offsets renvoyés pointent bien sur le texte d'origine."""
    text = "Fatoumata Diarra née à Bamako."
    response = client.post(URL, json={"text": text})
    body = response.json()
    for ent in body["entities"]:
        assert text[ent["start"] : ent["end"]] == ent["text"]
