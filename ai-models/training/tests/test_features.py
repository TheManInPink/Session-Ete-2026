"""Tests de l'ingénierie de variables (``FeatureBuilder``)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from training.data import CLEAN_LABEL
from training.features import FeatureBuilder


def _toy_df() -> pd.DataFrame:
    """Petit DataFrame conforme au schéma normalisé (colonnes minimales requises)."""
    rows = [
        # NINA propre (cohérent) — région 1, sexe M (1), né en 2017-06.
        ("11706148141251S", "Boubacar", "Fall", "2017-06-23", "M", "1", "Kayes", "none"),
        # Faute phonétique sur le prénom.
        (
            "23311418080221N",
            "Massitann",
            "Pamateck",
            "1933-11-08",
            "F",
            "4",
            "Ségou",
            "phonetic_spelling",
        ),
        # Checksum invalide.
        ("11706148141251A", "Awa", "Traore", "1990-01-01", "F", "1", "Kayes", "invalid_checksum"),
        ("18310444280090H", "Mamadou", "Togola", "1983-10-16", "M", "8", "Bamako", "none"),
    ]
    cols = [
        "nina",
        "first_name",
        "last_name",
        "birth_date",
        "sex",
        "region_code",
        "birth_region",
        "label",
    ]
    df = pd.DataFrame(rows, columns=cols)
    # Colonnes optionnelles attendues par le builder.
    for c in ("cercle", "commune", "village"):
        df[c] = ""
    return df


def test_fit_transform_no_nan_and_numeric() -> None:
    """Le transform produit une matrice numérique sans NaN ni inf."""
    df = _toy_df()
    builder = FeatureBuilder()
    feats = builder.fit_transform(df)
    assert len(feats) == len(df)
    assert feats.shape[1] == len(builder.feature_names_)
    assert np.isfinite(feats.to_numpy()).all()
    assert feats.notna().all().all()


def test_coherence_features_discriminate() -> None:
    """Les variables de cohérence séparent ligne propre et checksum invalide."""
    df = _toy_df()
    feats = FeatureBuilder().fit_transform(df)
    # Ligne 0 = propre → checksum OK ; ligne 2 = checksum invalide → KO.
    assert feats.loc[0, "nina_checksum_ok"] == 1.0
    assert feats.loc[2, "nina_checksum_ok"] == 0.0
    assert feats.loc[0, "nina_valid_format"] == 1.0


def test_single_row_transform_matches_columns() -> None:
    """Le chemin d'inférence (1 ligne) renvoie exactement les mêmes colonnes."""
    df = _toy_df()
    builder = FeatureBuilder().fit(df)
    one = builder.transform(df.iloc[[0]])
    assert list(one.columns) == builder.feature_names_
    assert len(one) == 1


def test_transform_before_fit_raises() -> None:
    """Appeler transform avant fit lève une RuntimeError explicite."""
    with pytest.raises(RuntimeError):
        FeatureBuilder().transform(_toy_df())


def test_clean_label_constant_is_none() -> None:
    """Garde-fou : la constante de classe propre reste 'none'."""
    assert CLEAN_LABEL == "none"


def test_transform_self_defensive_minimal_columns() -> None:
    """transform crée les colonnes manquantes : un dict minimal {nina, first_name} passe."""
    builder = FeatureBuilder().fit(_toy_df())
    minimal = pd.DataFrame([{"nina": "11706148141251S", "first_name": "Awa"}])
    out = builder.transform(minimal)
    assert list(out.columns) == builder.feature_names_
    assert len(out) == 1
    assert np.isfinite(out.to_numpy()).all()


def test_transform_ignores_label_column() -> None:
    """transform ne lit jamais la cible : il fonctionne sans colonne 'label'."""
    df = _toy_df()
    builder = FeatureBuilder().fit(df)
    out = builder.transform(df.drop(columns=["label"]))
    assert list(out.columns) == builder.feature_names_


def test_birth_year_replaced_by_implausible_flag() -> None:
    """La variable d'année brute a été remplacée par un drapeau de plausibilité."""
    feats = FeatureBuilder().fit_transform(_toy_df())
    assert "birth_year_implausible" in feats.columns
    assert "birth_year" not in feats.columns


def test_region_match_robust_to_json_typed_code() -> None:
    """nina_region_match tolère un region_code JSON-typé ('1.0') ou zéro-padé ('01')."""
    builder = FeatureBuilder().fit(_toy_df())
    for code in ("1.0", "01", "1"):
        rec = pd.DataFrame(
            [{"nina": "11706148141251S", "first_name": "Boubacar", "region_code": code}]
        )
        out = builder.transform(rec)
        assert out.loc[0, "nina_region_match"] == 1.0, f"region_code={code!r}"
