"""test_generate.py — Tests unitaires du générateur de dataset synthétique.

Exécution : `pytest` depuis ai-models/dataset-generator/
(le `pythonpath = ["src"]` est défini dans pyproject.toml).
"""

from __future__ import annotations

import random

import pytest

from dataset_generator import mutators, nina
from dataset_generator.catalog import load_catalog
from dataset_generator.generate import (
    generate_clean_record,
    generate_dataset,
    inject_error,
)


@pytest.fixture(scope="module")
def catalog():
    return load_catalog()


def test_control_letter_known_vector():
    """Vecteur figé : parité avec nina_rules.py / nina.ts."""
    assert nina.compute_control_letter("18310444280090") == "H"


def test_control_letter_rejects_bad_input():
    with pytest.raises(ValueError):
        nina.compute_control_letter("123")  # pas 14 chiffres


def test_clean_record_is_consistent(catalog):
    """Un enregistrement propre est cohérent (NINA valide, région, checksum)."""
    rng = random.Random(0)
    rec = generate_clean_record(catalog, rng)
    assert rec["has_error"] is False
    assert nina.is_checksum_valid(rec["nina"])
    assert int(rec["nina"][5]) == rec["region_code"]
    # 1er chiffre du NINA = sexe (1=M, 2=F).
    assert rec["nina"][0] == ("1" if rec["sex"] == "M" else "2")


def test_inject_invalid_checksum_breaks_checksum(catalog):
    rng = random.Random(1)
    rec = generate_clean_record(catalog, rng)
    bad = inject_error(rec, "invalid_checksum", catalog, rng)
    assert bad["has_error"] is True
    assert nina.is_structurally_valid(bad["nina"])  # structure OK
    assert not nina.is_checksum_valid(bad["nina"])  # mais checksum faux
    assert bad["error_field"] == "nina"


def test_geographic_mismatch_changes_region(catalog):
    rng = random.Random(2)
    rec = generate_clean_record(catalog, rng)
    bad = inject_error(rec, "geographic_mismatch", catalog, rng)
    # Le NINA (donc region_code) est inchangé, mais la région déclarée diffère.
    assert bad["region_code"] == rec["region_code"]
    assert bad["birth_region"] != rec["birth_region"]


def test_field_inversion_swaps_names(catalog):
    rng = random.Random(3)
    rec = generate_clean_record(catalog, rng)
    bad = inject_error(rec, "field_inversion", catalog, rng)
    assert bad["first_name"] == rec["last_name"]
    assert bad["last_name"] == rec["first_name"]


@pytest.mark.parametrize(
    "op", [mutators.substitute, mutators.omit, mutators.insert, mutators.phonetic]
)
def test_mutators_change_value(op):
    """Chaque mutateur modifie réellement un nom de longueur usuelle."""
    rng = random.Random(7)
    assert op("Mahamadou", rng) != "Mahamadou"


def test_determinism(catalog):
    """Même graine ⇒ datasets identiques (reproductibilité)."""
    a = generate_dataset(300, 0.4, seed=123, catalog=catalog)
    b = generate_dataset(300, 0.4, seed=123, catalog=catalog)
    assert a.equals(b)


def test_distribution_within_tolerance(catalog):
    """La distribution conditionnelle des erreurs suit le catalogue (±5%)."""
    df = generate_dataset(5000, 0.4, seed=42, catalog=catalog)
    freq = df.loc[df["has_error"], "error_type"].value_counts(normalize=True)
    expected = {e.name: e.frequency / 100 for e in catalog.error_patterns}
    for name, exp in expected.items():
        assert abs(freq.get(name, 0.0) - exp) <= 0.05, (name, freq.get(name, 0.0), exp)


def test_error_rate_within_tolerance(catalog):
    df = generate_dataset(5000, 0.4, seed=42, catalog=catalog)
    assert abs(df["has_error"].mean() - 0.4) <= 0.04
