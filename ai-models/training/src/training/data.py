"""
Chargement du dataset synthétique NINA, normalisation du schéma et découpe
stratifiée train / val / test.

Le pipeline cible le dataset **riche** ``ai-models/datasets/nina_synthetic_v1.csv``
(colonnes ``error_type`` + ``error_field`` + hiérarchie géographique), tout en
restant tolérant au schéma **simple** ``synthetic_nina_v1.csv`` (colonne
``error_types``). Le parsing CSV passe par pandas : le champ ``error_field`` de
``field_inversion`` contient une valeur multi-champ entre guillemets
(``"first_name,last_name"``) qu'un découpage naïf casserait.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd


def configure_console() -> None:
    """Force la sortie console en UTF-8 (évite ``UnicodeEncodeError`` sous Windows cp1252).

    Les scripts impriment des caractères non-cp1252 (``→``, ``✅``…). Sans cela,
    ``print`` lève sur la console Windows par défaut. ``errors="replace"`` couvre
    les terminaux exotiques sans interrompre l'exécution.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 — best effort, ne doit jamais bloquer
            pass


# ──────────────────────────────────────────────────────────────────────────────
#  Chemins canoniques (résolus relativement à l'arborescence du dépôt)
# ──────────────────────────────────────────────────────────────────────────────
# data.py vit dans  <repo>/ai-models/training/src/training/data.py
#   parents[0] = .../training (paquet)   parents[3] = .../ai-models
#   parents[1] = .../src                 parents[4] = <repo>
AI_MODELS_DIR = Path(__file__).resolve().parents[3]
REPO_ROOT = Path(__file__).resolve().parents[4]

DATASETS_DIR = AI_MODELS_DIR / "datasets"
EXPORTED_DIR = AI_MODELS_DIR / "exported"
EVALUATION_DIR = AI_MODELS_DIR / "evaluation"

DEFAULT_DATASET = DATASETS_DIR / "nina_synthetic_v1.csv"

# Nom de la colonne cible dérivée (libellé d'erreur multi-classes).
LABEL_COL = "label"
# Libellé de la classe « aucune erreur ».
CLEAN_LABEL = "none"

# Ordre canonique des classes pour des rapports stables (les classes réellement
# présentes dans les données sont filtrées dans cet ordre ; les extras sont
# ajoutés à la fin par ordre alphabétique).
CANONICAL_LABEL_ORDER = [
    CLEAN_LABEL,
    "typo_substitution",
    "typo_omission",
    "typo_insertion",
    "phonetic_spelling",
    "field_inversion",
    "geographic_mismatch",
    "date_format_error",
    "invalid_checksum",
    "sex_mismatch",
    "placeholder_parent",
]

# Synonymes inter-datasets → libellé canonique.
# Les clés correspondent aux libellés RÉELLEMENT présents dans le schéma simple
# (synthetic_nina_v1.csv : bad_checksum, impossible_date, wrong_region,
# translit_name, typo_name) ; sex_mismatch et placeholder_parent sont déjà
# canoniques. Vérifié contre le vocabulaire des deux datasets.
_LABEL_SYNONYMS = {
    # Schéma simple → taxonomie canonique (schéma riche).
    "typo_name": "typo_substitution",
    "translit_name": "phonetic_spelling",
    "bad_checksum": "invalid_checksum",
    "impossible_date": "date_format_error",
    "wrong_region": "geographic_mismatch",
    # Alias divers tolérés.
    "name_typo": "typo_substitution",
    "phonetic": "phonetic_spelling",
    "checksum": "invalid_checksum",
    # Valeurs « pas d'erreur ».
    "": CLEAN_LABEL,
    "nan": CLEAN_LABEL,
    "none": CLEAN_LABEL,
    "false": CLEAN_LABEL,
}

# Colonnes textuelles requises par le pipeline (créées vides si absentes pour
# robustesse). SOURCE DE VÉRITÉ UNIQUE : importée par features.FeatureBuilder
# (auto-défense de transform) ET par ai-service (chemin d'inférence), pour éviter
# toute dérive entre entraînement et service.
REQUIRED_TEXT_COLUMNS = [
    "nina",
    "first_name",
    "last_name",
    "birth_date",
    "sex",
    "region_code",
    "birth_region",
    "cercle",
    "commune",
    "village",
    "father_name",
    "mother_name",
    "language",
]


def _normalize_label(raw: object) -> str:
    """Normalise un libellé d'erreur brut vers la taxonomie canonique.

    Args:
        raw: Valeur brute de ``error_type`` / ``error_types`` (peut être ``NaN``).

    Returns:
        Le libellé canonique (``"none"`` pour une ligne propre).
    """
    if raw is None or (isinstance(raw, float) and np.isnan(raw)):
        return CLEAN_LABEL
    text = str(raw).strip().lower()
    # Valeur multi-types éventuelle (séparateur ``;`` ou ``,``) → on retient le
    # premier type. Sans effet sur les datasets actuels (aucun multi-valeur dans
    # error_type/error_types), défensif pour un futur schéma.
    text = re.split(r"[;,]", text)[0].strip()
    return _LABEL_SYNONYMS.get(text, text or CLEAN_LABEL)


def load_dataset(path: str | Path = DEFAULT_DATASET) -> pd.DataFrame:
    """Charge et normalise le dataset synthétique NINA.

    Garantit la présence des colonnes textuelles attendues et dérive :

    - ``label``          : libellé d'erreur multi-classes (taxonomie canonique).
    - ``has_error_bool`` : booléen « la ligne contient au moins une erreur ».

    Args:
        path: Chemin du CSV à charger.

    Returns:
        Un :class:`pandas.DataFrame` normalisé, indexé de 0..N-1.

    Raises:
        FileNotFoundError: Si le fichier n'existe pas.
    """
    csv_path = Path(path)
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Dataset introuvable : {csv_path}\n"
            "Générez-le d'abord (cf. ai-models/dataset-generator) ou indiquez "
            "--dataset vers un CSV existant."
        )

    # dtype=str : on garde tout en texte pour préserver les zéros de tête des
    # codes géographiques et du NINA ; les colonnes numériques sont dérivées
    # explicitement plus loin.
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)

    # Colonne d'erreur : ``error_type`` (riche) prioritaire, sinon ``error_types``.
    if "error_type" in df.columns:
        error_series = df["error_type"]
    elif "error_types" in df.columns:
        error_series = df["error_types"]
    else:
        error_series = pd.Series([""] * len(df), index=df.index)

    df[LABEL_COL] = error_series.map(_normalize_label)

    # ``has_error_bool`` : colonne explicite si présente, sinon dérivée du label.
    if "has_error" in df.columns:
        df["has_error_bool"] = (
            df["has_error"].astype(str).str.strip().str.lower().isin({"true", "1", "yes"})
        )
    else:
        df["has_error_bool"] = df[LABEL_COL] != CLEAN_LABEL

    # Garantit la présence des colonnes textuelles (vides si absentes).
    for col in REQUIRED_TEXT_COLUMNS:
        if col not in df.columns:
            df[col] = ""
        df[col] = df[col].fillna("").astype(str)

    return df.reset_index(drop=True)


def ordered_classes(labels: pd.Series | list[str]) -> list[str]:
    """Retourne les classes présentes, triées selon :data:`CANONICAL_LABEL_ORDER`.

    Args:
        labels: Série ou liste de libellés.

    Returns:
        Liste ordonnée des classes uniques (canoniques d'abord, extras en fin).
    """
    present = set(pd.Series(labels).unique())
    ordered = [c for c in CANONICAL_LABEL_ORDER if c in present]
    extras = sorted(present - set(ordered))
    return ordered + extras


def make_splits(
    n_rows: int,
    y: pd.Series,
    *,
    val_size: float = 0.20,
    test_size: float = 0.20,
    random_state: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Découpe stratifiée reproductible 60/20/20 (train/val/test).

    La même fonction est utilisée par l'entraînement et l'évaluation : avec un
    ``random_state`` identique, l'évaluation retrouve **exactement** le même jeu
    de test (aucune fuite).

    Args:
        n_rows: Nombre de lignes du dataset.
        y: Série cible (pour la stratification), indexée 0..N-1.
        val_size: Proportion du jeu de validation (défaut 0.20).
        test_size: Proportion du jeu de test (défaut 0.20).
        random_state: Graine de reproductibilité.

    Returns:
        Trois tableaux d'indices : ``(train_idx, val_idx, test_idx)``.
    """
    from sklearn.model_selection import train_test_split

    idx = np.arange(n_rows)
    holdout = val_size + test_size  # part hors-train (40 % par défaut)

    train_idx, temp_idx = train_test_split(
        idx, test_size=holdout, stratify=y, random_state=random_state
    )
    # Sur le hold-out, la part « test » relative est test_size / (val + test).
    rel_test = test_size / holdout
    val_idx, test_idx = train_test_split(
        temp_idx,
        test_size=rel_test,
        stratify=y.iloc[temp_idx],
        random_state=random_state,
    )
    return np.sort(train_idx), np.sort(val_idx), np.sort(test_idx)
