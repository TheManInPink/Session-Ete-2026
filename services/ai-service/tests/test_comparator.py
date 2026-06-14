"""test_comparator.py — Comparaison de noms (fuzzy + phonétique)."""

from __future__ import annotations

from app.services.comparator import compare_names


def test_identical_names():
    """Deux noms identiques → verdict identical, similarité maximale."""
    result = compare_names("Aliou Traoré", "Aliou Traoré")
    assert result.verdict == "identical"
    assert result.overall_similarity >= 99.0
    assert result.levenshtein == 0


def test_translit_variant_is_similar():
    """Une variante de translittération est jugée similaire ou identique."""
    result = compare_names("Mamadou Traoré", "Mamadu Traore")
    assert result.verdict in {"similar", "identical"}
    assert result.overall_similarity >= 80.0


def test_different_names():
    """Deux noms sans rapport → verdict different."""
    result = compare_names("Traoré", "Diallo")
    assert result.verdict == "different"


def test_accent_insensitivity():
    """Les accents ne doivent pas casser la similarité."""
    result = compare_names("Sékou", "Sekou")
    assert result.overall_similarity >= 90.0
