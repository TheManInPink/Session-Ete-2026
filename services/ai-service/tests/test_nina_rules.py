"""
test_nina_rules.py — Parité avec packages/utils/src/nina.ts.

Fige des vecteurs connus pour garantir que l'algorithme Python de lettre de
contrôle reste identique à l'implémentation TypeScript.
"""

from __future__ import annotations

import pytest  # pyright: ignore[reportMissingImports]

from app.services import nina_rules

# 14 chiffres dont la lettre de contrôle attendue (somme pondérée mod 23) est V.
KNOWN_DIGITS = "18903102015042"
KNOWN_LETTER = "V"
VALID_NINA = KNOWN_DIGITS + KNOWN_LETTER  # 18903102015042V


def test_control_letter_known_vector():
    """La lettre de contrôle des 14 chiffres de référence vaut V."""
    assert nina_rules.compute_control_letter(KNOWN_DIGITS) == KNOWN_LETTER


def test_control_alphabet_excludes_i_and_o():
    """L'alphabet de contrôle ne contient ni I ni O (anti-confusion 1/0).

    L'alphabet compte 24 lettres (26 − I − O) ; le modulo 23 n'en adresse que
    les 23 premières (parité exacte avec packages/utils/src/nina.ts).
    """
    assert "I" not in nina_rules.CONTROL_ALPHABET
    assert "O" not in nina_rules.CONTROL_ALPHABET
    assert nina_rules.CONTROL_ALPHABET == "ABCDEFGHJKLMNPQRSTUVWXYZ"
    assert len(nina_rules.CONTROL_ALPHABET) == 24


def test_validate_nina_roundtrip():
    """Un NINA composé de 14 chiffres + lettre calculée est valide."""
    assert nina_rules.validate_nina(VALID_NINA) is True


def test_validate_nina_rejects_wrong_letter():
    """Une lettre de contrôle erronée est rejetée."""
    wrong = KNOWN_DIGITS + ("A" if KNOWN_LETTER != "A" else "B")
    assert nina_rules.validate_nina(wrong) is False


def test_validate_nina_rejects_bad_format():
    """Un NINA sans lettre finale ou trop court est rejeté."""
    assert nina_rules.validate_nina("189031020150421") is False  # 15 chiffres, pas de lettre
    assert nina_rules.validate_nina("123") is False


def test_validate_nina_first_digit_must_be_sex():
    """Le 1er chiffre doit être 1 ou 2 (sexe)."""
    assert nina_rules.validate_nina("3" + KNOWN_DIGITS[1:] + KNOWN_LETTER) is False


def test_compute_control_letter_requires_14_digits():
    """compute_control_letter exige exactement 14 chiffres."""
    with pytest.raises(ValueError):
        nina_rules.compute_control_letter("123")
    with pytest.raises(ValueError):
        nina_rules.compute_control_letter("1890310201504X")


def test_parse_nina_components():
    """La décomposition structurelle est correcte."""
    parsed = nina_rules.parse_nina(VALID_NINA)
    assert parsed.sexe == 1
    assert parsed.annee_naissance == "89"
    assert parsed.mois_naissance == "03"
    assert parsed.region == "1"
    assert parsed.lettre_controle == "V"


def test_normalize_nina_strips_separators():
    """La normalisation retire espaces/tirets et met en majuscules."""
    assert nina_rules.normalize_nina("1 89-03_10.2015042v") == VALID_NINA


def test_mask_nina_hides_middle():
    """Le masquage conserve les bords et masque le centre (RGPD)."""
    masked = nina_rules.mask_nina(VALID_NINA)
    assert masked.startswith("18")
    assert masked.endswith("2V")
    assert "*" in masked
