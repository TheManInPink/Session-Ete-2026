"""features.py — Extraction de features partagée (scoring en ligne ↔ entraînement).

**SOURCE DE VÉRITÉ UNIQUE** du vecteur de features du modèle XGBoost. Le scorer
(inférence, depuis un `NormalizedRecord`) et le script d'entraînement
(`ai-models/scripts/train_xgboost.py`, depuis le CSV) appellent TOUS LES DEUX
`extract_features`, garantissant un ordre ET un calcul identiques (pas de drift
silencieux entre entraînement et inférence).

Les features couvrent chaque type d'erreur du dataset synthétique :
    - typo / phonétique (nom)   → first/last_name_best_sim + *_phonetic_match
                                  (complétés par first/last_name_is_common)
    - inversion nom/prénom      → name_order_suspect
    - placeholder parent        → father/mother_is_placeholder
    - date impossible / format  → birth_impossible / date_format_invalid
    - lettre de contrôle KO     → nina_checksum_valid
    - sexe incohérent           → sex_matches_nina
    - région incohérente        → region_matches_nina

Dépendances : pur Python + référentiels. `rapidfuzz` est *préféré* (similarité
rapide) mais **optionnel** : à défaut, on retombe sur `difflib` (stdlib). Aucune
dépendance ML/pydantic n'est requise → importable depuis l'environnement
d'entraînement minimal.
"""

from __future__ import annotations

import difflib
import re
from datetime import date, datetime
from functools import lru_cache

from app.phonetic import african_soundex
from app.services import nina_rules
from app.services.reference import (
    RAVEC_REGION_BY_DIGIT,
    all_common_first_names,
    all_common_last_names,
    fold,
    is_common_first_name,
    is_common_last_name,
    is_placeholder,
)

# RapidFuzz optionnel : similarité vectorisée (C) si présent, sinon difflib.
try:  # pragma: no cover - dépend de l'environnement
    from rapidfuzz import fuzz as _rf_fuzz  # pyright: ignore[reportMissingImports]
    from rapidfuzz import process as _rf_process  # pyright: ignore[reportMissingImports]

    _HAS_RF = True
except ImportError:  # pragma: no cover
    _rf_fuzz = _rf_process = None
    _HAS_RF = False

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
    # ─── Features ajoutées pour la taxonomie d'erreurs enrichie ─────
    "first_name_best_sim",  # proximité fuzzy au catalogue (typo/phonétique)
    "last_name_best_sim",
    "first_name_phonetic_match",  # code Soundex africain présent au catalogue
    "last_name_phonetic_match",
    "name_order_suspect",  # prénom↔nom probablement inversés
    "date_format_invalid",  # date non parsable (format corrompu)
]

_DIACRITICS = set("àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ")
_YEAR_RE = re.compile(r"(\d{4})")
# Formats de date « plausibles » (miroir de normalizer._DATE_FORMATS).
_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y")


# ─── Référentiels mémoïsés pour la similarité de noms ────────────────
@lru_cache(maxsize=1)
def _first_choices() -> tuple[str, ...]:
    return tuple(all_common_first_names())


@lru_cache(maxsize=1)
def _last_choices() -> tuple[str, ...]:
    return tuple(all_common_last_names())


@lru_cache(maxsize=1)
def _first_soundex() -> frozenset[str]:
    return frozenset(african_soundex(n) for n in all_common_first_names())


@lru_cache(maxsize=1)
def _last_soundex() -> frozenset[str]:
    return frozenset(african_soundex(n) for n in all_common_last_names())


def _best_sim(value: str, choices: tuple[str, ...]) -> float:
    """Meilleure similarité (0-1) du nom au catalogue (1.0 = présent tel quel)."""
    v = fold(value)
    if not v or not choices:
        return 0.0
    if _HAS_RF:
        match = _rf_process.extractOne(v, choices, scorer=_rf_fuzz.ratio)
        return (match[1] / 100.0) if match else 0.0
    return max(difflib.SequenceMatcher(None, v, c).ratio() for c in choices)


def _phonetic_match(value: str, soundex_set: frozenset[str]) -> float:
    """1.0 si le code Soundex africain du nom figure au catalogue, sinon 0.0."""
    code = african_soundex(value)
    return float(bool(code) and code in soundex_set)


def _date_parseable(birth_date: str | date | None) -> bool:
    """Indique si la date est lisible (ISO ou formats courants JJ/MM, …)."""
    if isinstance(birth_date, date):
        return True
    raw = str(birth_date or "").strip()
    if not raw:
        return False
    try:
        date.fromisoformat(raw[:10])
        return True
    except ValueError:
        pass
    for fmt in _DATE_FORMATS:
        try:
            datetime.strptime(raw, fmt)  # noqa: DTZ007 - date civile sans TZ
            return True
        except ValueError:
            continue
    return False


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
        birth_date: date de naissance (`date` ou chaîne — préférer la chaîne
            brute pour exploiter `date_format_invalid`).
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
        "first_name_best_sim": _best_sim(fn, _first_choices()),
        "last_name_best_sim": _best_sim(ln, _last_choices()),
        "first_name_phonetic_match": _phonetic_match(fn, _first_soundex()),
        "last_name_phonetic_match": _phonetic_match(ln, _last_soundex()),
        "name_order_suspect": float(is_common_last_name(fn) and is_common_first_name(ln)),
        "date_format_invalid": float(
            bool(str(birth_date or "").strip()) and not _date_parseable(birth_date)
        ),
    }
