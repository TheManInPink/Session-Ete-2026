"""Tests du décodage NINA (parité avec ``packages/utils/src/nina.ts``)."""

from __future__ import annotations

import pytest

from training import nina


def test_compute_control_letter_known_vector() -> None:
    """La lettre de contrôle est déterministe (somme pondérée mod 23, sans I/O)."""
    # 14 chiffres → lettre attendue calculée par l'algorithme de référence.
    digits = "11706148141251"  # extrait d'un NINA propre du dataset
    letter = nina.compute_control_letter(digits)
    assert letter == "S"
    # Recomposé : le NINA complet doit valider.
    assert nina.validate_nina(digits + letter)


def test_compute_control_letter_rejects_non_digits() -> None:
    """Une entrée non numérique lève une ValueError explicite."""
    with pytest.raises(ValueError):
        nina.compute_control_letter("11706148141X51")


def test_normalize_strips_separators_and_uppercases() -> None:
    """La normalisation retire espaces/tirets et passe en majuscules."""
    assert nina.normalize_nina(" 1 17-06_14.81 41251s ") == "11706148141251S"
    assert nina.normalize_nina(None) == ""


def test_validate_detects_bad_checksum() -> None:
    """Un NINA dont la dernière lettre est fausse est rejeté."""
    assert nina.validate_nina("11706148141251S") is True
    assert nina.validate_nina("11706148141251A") is False


def test_parse_structure() -> None:
    """Le parsing renvoie les composants attendus (sexe, année, mois, géo)."""
    parsed = nina.parse_nina("11706148141251S")
    assert parsed.sexe == 1
    assert parsed.annee_naissance == "17"
    assert parsed.mois_naissance == "06"
    assert parsed.region == "1"
    assert parsed.lettre_controle == "S"


def test_try_parse_returns_none_on_garbage() -> None:
    """La variante non levante renvoie None sur entrée invalide."""
    assert nina.try_parse_nina("not-a-nina") is None
    assert nina.try_parse_nina("11706148141251S") is not None
