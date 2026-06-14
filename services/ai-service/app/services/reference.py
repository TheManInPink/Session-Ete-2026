"""
reference.py — Référentiels métier (géographie Mali, prénoms/noms, langues).

Centralise les données de référence utilisées par le détecteur :
    - Carte des régions RAVEC (code chiffré du NINA → région historique).
    - Référentiel géographique officiel (`data/mali/regions.json` + `cercles.json`).
    - Listes de prénoms/noms maliens courants (détection de fautes de frappe).
    - Plausibilité langue ↔ région.

Tout est chargé **paresseusement** et de façon **défensive** : si un fichier de
référentiel est absent, on bascule sur des valeurs embarquées (le service
démarre toujours).

⚠️ Limite connue (drift documenté) : le NINA encode la région sur **1 chiffre**
(schéma RAVEC historique à 9 régions), alors que `data/mali/regions.json` utilise
les codes `ML-NN` de la réforme 2023 (20 entités). La correspondance fine
RAVEC ↔ ML-NN reste un chantier (cf. docs/DOCUMENTATION-MAP.md). On valide donc
la cohérence au niveau **région historique** uniquement.
"""

from __future__ import annotations

import json
import unicodedata
from functools import lru_cache
from pathlib import Path


def _mali_data_dir() -> Path:
    """Répertoire du référentiel Mali (import paresseux de la config).

    Importer `app.config` (pydantic-settings) est différé ici pour que ce module
    reste importable depuis un environnement minimal (ex. entraînement du modèle
    sans pydantic).
    """
    from app.config import settings

    return Path(settings.mali_data_dir)


# ─── Carte des régions RAVEC (1 chiffre) → région historique ────────
# Numérotation administrative malienne pré-2016 (plaques, RAVEC). Le District
# de Bamako porte le code 9.
RAVEC_REGION_BY_DIGIT: dict[str, str] = {
    "1": "Kayes",
    "2": "Koulikoro",
    "3": "Sikasso",
    "4": "Ségou",
    "5": "Mopti",
    "6": "Tombouctou",
    "7": "Gao",
    "8": "Kidal",
    "9": "Bamako",
}

# ─── Langues nationales plausibles par région (codes ISO maison) ────
# fr=français, bm=bambara, snk=soninké, ff=peul, tmq=tamasheq, dje=songhaï,
# hau=haoussa, mos=mooré. Le français est plausible partout.
REGION_LANGUAGES: dict[str, set[str]] = {
    "Kayes": {"fr", "snk", "bm", "ff"},
    "Koulikoro": {"fr", "bm"},
    "Sikasso": {"fr", "bm", "ff"},
    "Ségou": {"fr", "bm"},
    "Mopti": {"fr", "ff", "bm", "dje"},
    "Tombouctou": {"fr", "tmq", "dje", "ff"},
    "Gao": {"fr", "dje", "tmq"},
    "Kidal": {"fr", "tmq"},
    "Bamako": {"fr", "bm"},
}

# ─── Prénoms et noms maliens courants (échantillon de référence) ────
# Sert au fuzzy matching « le prénom saisi ressemble-t-il à un prénom connu ? ».
# Liste volontairement compacte ; en production, charger depuis un fichier
# enrichi (recensement RAVEC anonymisé).
COMMON_FIRST_NAMES_M: frozenset[str] = frozenset(
    {
        "mamadou",
        "aliou",
        "modibo",
        "boubacar",
        "ousmane",
        "adama",
        "seydou",
        "ibrahim",
        "moussa",
        "sekou",
        "alpha",
        "bakary",
        "drissa",
        "issa",
        "amadou",
        "souleymane",
        "abdoulaye",
        "youssouf",
        "cheick",
        "oumar",
    }
)
COMMON_FIRST_NAMES_F: frozenset[str] = frozenset(
    {
        "fatoumata",
        "aissata",
        "kadiatou",
        "hawa",
        "mariama",
        "rokia",
        "djeneba",
        "aminata",
        "oumou",
        "salimata",
        "assitan",
        "fanta",
        "bintou",
        "maimouna",
        "nana",
        "ramata",
        "sira",
        "kadidia",
    }
)
COMMON_LAST_NAMES: frozenset[str] = frozenset(
    {
        "traore",
        "diarra",
        "keita",
        "coulibaly",
        "diallo",
        "sidibe",
        "sangare",
        "toure",
        "dembele",
        "konate",
        "samake",
        "togola",
        "bagayogo",
        "maiga",
        "cisse",
        "kone",
        "fofana",
        "doumbia",
        "sissoko",
        "kanoute",
        "ba",
    }
)

# Marqueurs « valeur absente / inconnue » (champs non renseignés sur le terrain).
PLACEHOLDERS: frozenset[str] = frozenset(
    {
        "",
        "x",
        "xx",
        "xxx",
        "inconnu",
        "inconnue",
        "n/a",
        "na",
        "nan",
        "???",
        "...",
        "néant",
        "neant",
        "sans",
        "rien",
    }
)


def fold(text: str | None) -> str:
    """Replie une chaîne pour comparaison : minuscule, sans accent, trim.

    Args:
        text: chaîne à normaliser.

    Returns:
        Chaîne pliée (utilisée comme clé de comparaison insensible aux accents).
    """
    if not text:
        return ""
    nfd = unicodedata.normalize("NFD", text.strip().lower())
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def is_placeholder(value: str | None) -> bool:
    """Indique si une valeur est un marqueur d'absence (« XXX », « Inconnu »…)."""
    return fold(value) in PLACEHOLDERS


def region_name_for_digit(digit: str) -> str | None:
    """Retourne la région historique correspondant au chiffre RAVEC du NINA.

    Args:
        digit: chiffre région du NINA (caractère unique).

    Returns:
        Nom de la région, ou `None` si le chiffre n'est pas valide (ex. « 0 »).
    """
    return RAVEC_REGION_BY_DIGIT.get(digit)


def is_valid_region_digit(digit: str) -> bool:
    """Indique si le chiffre région (1 caractère) correspond à une région connue."""
    return digit in RAVEC_REGION_BY_DIGIT


def language_plausible(language: str | None, region: str | None) -> bool:
    """Vérifie qu'une langue est plausible pour une région donnée.

    Args:
        language: code langue (ex. « bm »). `None` → considéré comme « fr ».
        region: nom de région (ex. « Bamako »). Inconnu → on accepte le français.

    Returns:
        `True` si la langue est plausible pour la région.
    """
    lang = (language or "fr").lower()
    allowed = REGION_LANGUAGES.get(region or "", {"fr"})
    return lang in allowed


def is_common_first_name(name: str | None) -> bool:
    """Indique si le prénom figure dans la liste de référence (M ou F)."""
    folded = fold(name)
    return folded in COMMON_FIRST_NAMES_M or folded in COMMON_FIRST_NAMES_F


def is_common_last_name(name: str | None) -> bool:
    """Indique si le nom de famille figure dans la liste de référence."""
    return fold(name) in COMMON_LAST_NAMES


def all_common_first_names() -> list[str]:
    """Retourne la liste pliée de tous les prénoms de référence (M + F)."""
    return sorted(COMMON_FIRST_NAMES_M | COMMON_FIRST_NAMES_F)


def all_common_last_names() -> list[str]:
    """Retourne la liste pliée de tous les noms de référence."""
    return sorted(COMMON_LAST_NAMES)


@lru_cache(maxsize=1)
def load_regions() -> list[dict]:
    """Charge `data/mali/regions.json` (réforme 2023). Vide si fichier absent.

    Returns:
        Liste des régions officielles (codes `ML-NN`), ou `[]` en dégradé.
    """
    path = _mali_data_dir() / "regions.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return list(data.get("regions", []))
    except (OSError, ValueError):
        return []


@lru_cache(maxsize=1)
def load_cercles() -> list[dict]:
    """Charge `data/mali/cercles.json`. Vide si fichier absent.

    Returns:
        Liste des cercles officiels (codes `ML-RR-NN`), ou `[]` en dégradé.
    """
    path = _mali_data_dir() / "cercles.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return list(data.get("cercles", []))
    except (OSError, ValueError):
        return []


def reference_status() -> dict[str, int | bool]:
    """Résumé de l'état des référentiels (pour l'endpoint /health)."""
    regions = load_regions()
    cercles = load_cercles()
    return {
        "regions_loaded": len(regions),
        "cercles_loaded": len(cercles),
        "geo_referential_available": bool(regions),
    }
