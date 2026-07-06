"""Tests du générateur de dataset synthétique NINA (reconstruction)."""

from __future__ import annotations

import pandas as pd

from dataset_generator import nina as nina_mod
from dataset_generator.generate import COLUMNS, generate
from dataset_generator.mutators import MUTATORS
from dataset_generator.validate import validate_frame


def test_schema_and_columns_order() -> None:
    """Le DataFrame généré a exactement les colonnes attendues, dans l'ordre."""
    df = generate(rows=200, error_rate=0.4, seed=0)
    assert list(df.columns) == COLUMNS
    assert len(df) == 200


def test_reproducible_with_seed() -> None:
    """Même graine ⇒ dataset identique (reproductibilité)."""
    a = generate(rows=100, error_rate=0.4, seed=7)
    b = generate(rows=100, error_rate=0.4, seed=7)
    pd.testing.assert_frame_equal(a, b)


def test_error_rate_in_range() -> None:
    """Le taux d'erreur réalisé est proche de la cible (tolérance statistique)."""
    df = generate(rows=2000, error_rate=0.4, seed=1)
    rate = df["has_error"].mean()
    assert 0.34 <= rate <= 0.46, rate


def test_clean_rows_pass_invariants() -> None:
    """Les lignes propres respectent tous les invariants (validate_frame sans problème)."""
    df = generate(rows=1000, error_rate=0.4, seed=2)
    assert validate_frame(df) == []


def test_error_types_are_canonical() -> None:
    """Tout error_type produit appartient au registre des mutateurs."""
    df = generate(rows=2000, error_rate=0.6, seed=3)
    produced = set(df[df["has_error"]]["error_type"].unique())
    assert produced.issubset(set(MUTATORS)), produced
    # Avec 0.6 × 2000 erreurs, les types fréquents doivent apparaître.
    assert "typo_substitution" in produced


def test_invalid_checksum_rows_really_invalid() -> None:
    """Les lignes invalid_checksum ont bien un NINA qui échoue la validation."""
    df = generate(rows=3000, error_rate=0.6, seed=4)
    ic = df[df["error_type"] == "invalid_checksum"]
    assert len(ic) > 0
    assert not ic["nina"].map(nina_mod.validate_nina).any()


def test_field_inversion_error_field_is_multi_value() -> None:
    """field_inversion déclare un error_field multi-champ 'first_name,last_name'."""
    df = generate(rows=3000, error_rate=0.7, seed=5)
    fi = df[df["error_type"] == "field_inversion"]
    assert len(fi) > 0
    assert (fi["error_field"] == "first_name,last_name").all()
