"""Tests de normalisation des libellés et du chargement (robustesse cross-schéma)."""

from __future__ import annotations

import pytest

from training import data

# Vocabulaire RÉEL observé dans les deux datasets (vérifié contre les CSV).
RICH_LABELS = [
    "date_format_error",
    "field_inversion",
    "geographic_mismatch",
    "invalid_checksum",
    "phonetic_spelling",
    "typo_insertion",
    "typo_omission",
    "typo_substitution",
]
SIMPLE_LABELS = [
    "bad_checksum",
    "impossible_date",
    "placeholder_parent",
    "sex_mismatch",
    "translit_name",
    "typo_name",
    "wrong_region",
]


@pytest.mark.parametrize("raw", RICH_LABELS + SIMPLE_LABELS)
def test_every_real_label_maps_into_canonical(raw: str) -> None:
    """Aucun libellé réel ne doit produire une classe hors taxonomie canonique."""
    norm = data._normalize_label(raw)
    assert norm in data.CANONICAL_LABEL_ORDER, f"{raw!r} -> {norm!r} hors taxonomie"


def test_simple_schema_synonyms_resolve() -> None:
    """Les libellés du schéma simple sont repliés sur leurs équivalents canoniques."""
    assert data._normalize_label("bad_checksum") == "invalid_checksum"
    assert data._normalize_label("impossible_date") == "date_format_error"
    assert data._normalize_label("wrong_region") == "geographic_mismatch"
    assert data._normalize_label("typo_name") == "typo_substitution"
    assert data._normalize_label("translit_name") == "phonetic_spelling"


def test_empty_and_falsey_map_to_clean() -> None:
    """Valeurs vides / 'False' / None → classe 'none'."""
    assert data._normalize_label("") == data.CLEAN_LABEL
    assert data._normalize_label("False") == data.CLEAN_LABEL
    assert data._normalize_label(None) == data.CLEAN_LABEL


def test_load_dataset_labels_subset_of_canonical_if_present() -> None:
    """Si le dataset par défaut est présent, tous ses labels sont canoniques."""
    if not data.DEFAULT_DATASET.exists():
        pytest.skip("dataset par défaut absent (généré hors tests)")
    df = data.load_dataset(data.DEFAULT_DATASET)
    assert set(df[data.LABEL_COL]).issubset(set(data.CANONICAL_LABEL_ORDER))
