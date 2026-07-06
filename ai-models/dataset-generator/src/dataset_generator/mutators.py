"""
Mutateurs d'erreurs : injectent une erreur **ciblée** dans un enregistrement propre.

Chaque mutateur a la signature ``(record, rng, catalog) -> error_field`` : il modifie
``record`` en place et retourne la valeur de ``error_field`` (chaîne, éventuellement
multi-champ séparée par une virgule pour ``field_inversion``). Le vocabulaire de
clés de :data:`MUTATORS` est **aligné** sur la taxonomie de ``ai-models/training``.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

from typing import Callable

import numpy as np

from . import nina as nina_mod

_LETTERS = "abcdefghijklmnopqrstuvwxyz"

# Règles de variante phonétique (translittérations fréquentes des noms maliens).
_PHONETIC_RULES = [
    ("ou", "u"),
    ("ph", "f"),
    ("ck", "k"),
    ("c", "k"),
    ("ss", "c"),
    ("y", "i"),
    ("ai", "e"),
    ("ann", "an"),
    ("ah", "a"),
    ("ll", "l"),
]


def _pick_name_field(rng: np.random.Generator) -> str:
    """Choisit aléatoirement le champ ``first_name`` ou ``last_name``."""
    return "first_name" if rng.random() < 0.5 else "last_name"


def typo_substitution(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Remplace une lettre d'un nom par une autre (faute de frappe par substitution)."""
    field = _pick_name_field(rng)
    name = record[field]
    if len(name) < 2:
        field = "first_name" if field == "last_name" else "last_name"
        name = record[field]
    if len(name) < 2:
        return field
    i = int(rng.integers(1, len(name)))
    repl = _LETTERS[int(rng.integers(0, len(_LETTERS)))]
    record[field] = name[:i] + repl + name[i + 1 :]
    return field


def typo_omission(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Supprime une lettre d'un nom (faute par omission)."""
    field = _pick_name_field(rng)
    name = record[field]
    if len(name) < 3:
        return field
    i = int(rng.integers(1, len(name)))
    record[field] = name[:i] + name[i + 1 :]
    return field


def typo_insertion(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Insère une lettre superflue dans un nom (faute par insertion)."""
    field = _pick_name_field(rng)
    name = record[field]
    if not name:
        return field
    i = int(rng.integers(1, len(name) + 1))
    extra = _LETTERS[int(rng.integers(0, len(_LETTERS)))]
    record[field] = name[:i] + extra + name[i:]
    return field


def phonetic_spelling(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Produit une variante phonétique d'un nom (orthographe alternative plausible)."""
    field = _pick_name_field(rng)
    name = record[field]
    low = name.lower()
    for pat, rep in _PHONETIC_RULES:
        if pat in low:
            record[field] = low.replace(pat, rep, 1).capitalize()
            return field
    # Repli : double une voyelle (variante phonétique générique).
    for i, ch in enumerate(low):
        if ch in "aeiou":
            record[field] = (low[: i + 1] + ch + low[i + 1 :]).capitalize()
            break
    return field


def field_inversion(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Inverse prénom et nom (erreur de saisie d'inversion de champs)."""
    record["first_name"], record["last_name"] = record["last_name"], record["first_name"]
    return "first_name,last_name"


def geographic_mismatch(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Met une région de naissance incohérente avec ``region_code`` (le code est conservé)."""
    regions = catalog["regions"]
    current = record["region_code"]
    others = [code for code in regions if code != current]
    other = others[int(rng.integers(0, len(others)))]
    record["birth_region"] = regions[other]
    return "birth_region"


def date_format_error(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Reformate la date en non-ISO (``DD/MM/YYYY`` ou ``MM/DD/YYYY``)."""
    iso = record["birth_date"]  # YYYY-MM-DD
    y, m, d = iso.split("-")
    record["birth_date"] = f"{d}/{m}/{y}" if rng.random() < 0.5 else f"{m}/{d}/{y}"
    return "birth_date"


def invalid_checksum(record: dict, rng: np.random.Generator, catalog: dict) -> str:
    """Corrompt la lettre de contrôle du NINA (rend le NINA invalide)."""
    record["nina"] = nina_mod.corrupt_checksum(record["nina"], rng)
    return "nina"


# Registre des mutateurs (clés = taxonomie ai-models/training).
MUTATORS: dict[str, Callable[[dict, np.random.Generator, dict], str]] = {
    "typo_substitution": typo_substitution,
    "typo_omission": typo_omission,
    "typo_insertion": typo_insertion,
    "phonetic_spelling": phonetic_spelling,
    "field_inversion": field_inversion,
    "geographic_mismatch": geographic_mismatch,
    "date_format_error": date_format_error,
    "invalid_checksum": invalid_checksum,
}
