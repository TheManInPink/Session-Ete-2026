"""
features.py — Extraction de features partagée (scoring en ligne ↔ entraînement).

**SOURCE DE VÉRITÉ UNIQUE** du vecteur de features du modèle XGBoost. Le scorer
(inférence, depuis un `NormalizedRecord`) et le script d'entraînement
(`ai-models/scripts/train_xgboost.py`, depuis le CSV) appellent TOUS LES DEUX
`extract_features`, garantissant un ordre ET un calcul identiques (pas de drift
silencieux entre entraînement et inférence).

Les features couvrent chaque type d'erreur injecté dans le dataset synthétique :
    - typo/translit nom        → first_name_is_common / last_name_is_common
    - placeholder parent       → father_is_placeholder / mother_is_placeholder
    - date impossible          → birth_impossible
    - lettre de contrôle KO    → nina_checksum_valid
    - sexe incohérent          → sex_matches_nina
    - région incohérente       → region_matches_nina

Pur Python (stdlib + référentiels) : aucune dépendance ML/pydantic, donc
importable depuis l'environnement d'entraînement minimal.
"""

from __future__ import annotations

import re
from datetime import date

from app.services import nina_rules
from app.services.reference import (
    RAVEC_REGION_BY_DIGIT,
    fold,
    is_common_first_name,
    is_common_last_name,
    is_placeholder,
)

# Ordre canonique des features — figé dans le bundle modèle (`feature_names`).
FEATURE_NAMES: list[str] = [
    "first_name_length",
    "last_name_length",
    "first_name_is_placeholder",
    "father_is_placeholder",
    "mother_is_placeholder",
    "birth_year",
    "birth_impossible",
    "first_name_mixed_case",
    "has_diacritics",
    "first_name_is_common",
    "last_name_is_common",
    "nina_checksum_valid",
    "sex_matches_nina",
    "region_matches_nina",
]

_DIACRITICS = set("àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ")
_YEAR_RE = re.compile(r"(\d{4})")


def _parse_year(birth_date: str | date | None) -> int | None:
    """Extrait l'année d'une date (objet `date` ou chaîne ISO/texte)."""
    if birth_date is None:
        return None
    if isinstance(birth_date, date):
        return birth_date.year
    raw = str(birth_date).strip()
    try:
        return date.fromisoformat(raw[:10]).year
    except ValueError:
        match = _YEAR_RE.search(raw)
        return int(match.group(1)) if match else None


def _is_mixed_case(name: str) -> bool:
    return sum(1 for c in name if c.isupper()) > 1 and sum(1 for c in name if c.islower()) > 1


def extract_features(
    *,
    nina: str,
    first_name: str,
    last_name: str,
    birth_date: str | date | None,
    sex: str,
    birth_region: str | None,
    father_name: str | None,
    mother_name: str | None,
) -> dict[str, float]:
    """Calcule le dictionnaire de features (valeurs `float`, booléens en 0/1).

    Args:
        nina: numéro NINA brut.
        first_name, last_name: prénom / nom.
        birth_date: date de naissance (`date` ou chaîne).
        sex: sexe déclaré ("M"/"F"/"X").
        birth_region: région de naissance déclarée (texte).
        father_name, mother_name: filiation déclarée.

    Returns:
        Dict `feature → valeur`. Utiliser :data:`FEATURE_NAMES` pour l'ordonner.
    """
    fn = (first_name or "").strip()
    ln = (last_name or "").strip()
    year = _parse_year(birth_date)

    normalized = nina_rules.normalize_nina(nina)
    well_formed = bool(nina_rules.NINA_REGEX.match(normalized))

    # Cohérence sexe / région encodés dans le NINA (neutre si NINA mal formé).
    sex_matches = 1.0
    region_matches = 1.0
    if well_formed:
        sex_matches = float(nina_rules.SEX_BY_NINA_DIGIT.get(normalized[0]) == (sex or "").upper())
        region_name = RAVEC_REGION_BY_DIGIT.get(normalized[5])
        region_matches = float(bool(region_name) and fold(birth_region) == fold(region_name))

    return {
        "first_name_length": float(len(fn)),
        "last_name_length": float(len(ln)),
        "first_name_is_placeholder": float(is_placeholder(fn)),
        "father_is_placeholder": float(is_placeholder(father_name)),
        "mother_is_placeholder": float(is_placeholder(mother_name)),
        "birth_year": float(year or 0),
        "birth_impossible": float(year is None or year < 1900),
        "first_name_mixed_case": float(_is_mixed_case(fn)),
        "has_diacritics": float(any(c in _DIACRITICS for c in fn)),
        "first_name_is_common": float(is_common_first_name(fn)),
        "last_name_is_common": float(is_common_last_name(ln)),
        "nina_checksum_valid": float(nina_rules.validate_nina(normalized)),
        "sex_matches_nina": sex_matches,
        "region_matches_nina": region_matches,
    }
