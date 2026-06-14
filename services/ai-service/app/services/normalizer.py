"""
normalizer.py — Étape ② du pipeline : normalisation des données.

Transforme un :class:`CitizenPayload` brut en :class:`NormalizedRecord`
exploitable par le détecteur :
    - Unicode NFC (canonicalisation des accents composés).
    - Trim + réduction des espaces multiples.
    - Détection des marqueurs d'absence (« XXX », « Inconnu »…).
    - Parsing tolérant de la date de naissance (plusieurs formats), avec
      détection des dates contenant des lettres (saisie corrompue).

Aucune dépendance externe : pur Python + stdlib.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

from app.schemas.common import CitizenPayload
from app.services.reference import is_placeholder

# Formats de date acceptés, du plus au moins courant.
_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y")
# Une date « propre » ne contient que chiffres et séparateurs.
_DATE_ALLOWED = re.compile(r"^[\d/\-.\s]+$")


def _nfc(value: str | None) -> str:
    """Canonicalise (NFC) et nettoie les espaces d'une chaîne."""
    if not value:
        return ""
    normalized = unicodedata.normalize("NFC", value).strip()
    return re.sub(r"\s+", " ", normalized)


def _parse_date(raw: str) -> date | None:
    """Tente de parser une date selon plusieurs formats. `None` si échec."""
    cleaned = raw.strip()
    # ISO d'abord (gère aussi les datetimes ISO en tronquant).
    try:
        return date.fromisoformat(cleaned[:10])
    except ValueError:
        pass
    from datetime import datetime

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).date()  # noqa: DTZ007 - date civile sans TZ
        except ValueError:
            continue
    return None


@dataclass
class NormalizedRecord:
    """Enregistrement normalisé, prêt pour l'analyse (étape ③)."""

    nina: str
    first_name: str
    last_name: str
    sex: str
    birth_date_raw: str
    birth_date: date | None
    birth_place: str
    birth_region: str
    father: str
    mother: str
    language: str | None

    # Drapeaux dérivés
    birth_date_has_letters: bool = False
    birth_date_parse_failed: bool = False
    first_name_is_placeholder: bool = False
    last_name_is_placeholder: bool = False
    father_is_placeholder: bool = False
    mother_is_placeholder: bool = False

    # Valeurs d'origine (pour proposer des corrections en gardant l'affichage).
    original: dict = field(default_factory=dict)


def normalize_record(citizen: CitizenPayload) -> NormalizedRecord:
    """Normalise un payload citoyen en :class:`NormalizedRecord`.

    Args:
        citizen: payload validé par Pydantic.

    Returns:
        Enregistrement normalisé avec drapeaux de qualité.
    """
    parents = citizen.parents
    father_raw = parents.father if parents else None
    mother_raw = parents.mother if parents else None

    first_name = _nfc(citizen.first_name)
    last_name = _nfc(citizen.last_name)
    birth_raw = citizen.birth_date.strip()
    birth_date = _parse_date(birth_raw)

    return NormalizedRecord(
        nina=re.sub(r"[\s\-_.]+", "", citizen.nina).upper(),
        first_name=first_name,
        last_name=last_name,
        sex=citizen.sex.value,
        birth_date_raw=birth_raw,
        birth_date=birth_date,
        birth_place=_nfc(citizen.birth_place),
        birth_region=_nfc(citizen.birth_region) or _nfc(citizen.birth_place),
        father=_nfc(father_raw),
        mother=_nfc(mother_raw),
        language=citizen.language.value if citizen.language else None,
        birth_date_has_letters=bool(birth_raw) and not _DATE_ALLOWED.match(birth_raw),
        birth_date_parse_failed=birth_date is None,
        first_name_is_placeholder=is_placeholder(first_name),
        last_name_is_placeholder=is_placeholder(last_name),
        father_is_placeholder=is_placeholder(father_raw),
        mother_is_placeholder=is_placeholder(mother_raw),
        original={
            "first_name": citizen.first_name,
            "last_name": citizen.last_name,
            "birth_date": citizen.birth_date,
        },
    )
