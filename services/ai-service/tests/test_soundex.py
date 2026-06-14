"""test_soundex.py — Golden-set du Soundex africain."""

from __future__ import annotations

import json
from pathlib import Path

import pytest  # pyright: ignore[reportMissingImports]

from app.phonetic import african_soundex

_FIXTURES = Path(__file__).parent / "fixtures" / "phonetic_pairs.json"
_PAIRS = json.loads(_FIXTURES.read_text(encoding="utf-8"))


@pytest.mark.parametrize("pair", _PAIRS, ids=[f"{p['a']}~{p['b']}" for p in _PAIRS])
def test_phonetic_pairs(pair):
    """Chaque paire du golden-set respecte sa relation attendue (même/différent)."""
    code_a = african_soundex(pair["a"])
    code_b = african_soundex(pair["b"])
    if pair["same"]:
        assert code_a == code_b, (
            f"attendu identique : {pair['a']}({code_a}) != {pair['b']}({code_b})"
        )
    else:
        assert code_a != code_b, (
            f"attendu différent : {pair['a']}({code_a}) == {pair['b']}({code_b})"
        )


def test_empty_string_returns_empty():
    """Une entrée vide renvoie un code vide."""
    assert african_soundex("") == ""


def test_apostrophe_insensitive():
    """N'Diaye et Ndiaye produisent le même code."""
    assert african_soundex("N'Diaye") == african_soundex("Ndiaye")
