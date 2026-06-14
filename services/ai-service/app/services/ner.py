"""
ner.py — Reconnaissance d'entités nommées (NER).

Deux moteurs :
    1. **spaCy** (`fr_core_news_md`) si disponible — entités PER/LOC/ORG/MISC.
    2. **Fallback regex** sinon — détecte les personnes (suites de mots
       capitalisés), les lieux (référentiel des régions maliennes) et les dates
       (formats numériques + mois en toutes lettres).

Le fallback garantit que l'endpoint reste fonctionnel même sans spaCy (wheels
cp314 en attente, ou modèle non téléchargé).

Référence : docs/11-AI-SERVICE-FASTAPI.md §7 (feature spacy_entity_count).
"""

from __future__ import annotations

import re

from app.models.registry import registry
from app.schemas.ner import Entity
from app.services.reference import RAVEC_REGION_BY_DIGIT, fold

# Dates : numériques (15/03/1989, 1989-03-15) ou mois en toutes lettres.
_MONTHS_FR = (
    "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|"
    "septembre|octobre|novembre|décembre|decembre"
)
_DATE_PATTERNS = [
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b"),
    re.compile(rf"\b\d{{1,2}}\s+(?:{_MONTHS_FR})\s+\d{{2,4}}\b", re.IGNORECASE),
]
# Personnes : suites de 1 à 4 mots commençant par une majuscule (gère les
# particules « N' », tirets et apostrophes maliens).
_PERSON_PATTERN = re.compile(r"\b(?:[A-ZÀ-Ý][\wÀ-ÿ'’\-]+)(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’\-]+){0,3}\b")
# Lieux connus = noms des régions historiques.
_KNOWN_PLACES = {fold(name): name for name in RAVEC_REGION_BY_DIGIT.values()}

# Mots-outils qui, en début de phrase, ne sont pas des personnes.
_STOPWORDS = {
    fold(w) for w in ("Le", "La", "Les", "Né", "Née", "Fils", "Fille", "Monsieur", "Madame")
}


def _regex_entities(text: str) -> list[Entity]:
    """Extraction d'entités par expressions régulières (fallback)."""
    entities: list[Entity] = []
    occupied: list[tuple[int, int]] = []

    def _overlaps(start: int, end: int) -> bool:
        return any(start < e and end > s for s, e in occupied)

    # Dates (priorité haute pour réserver les spans numériques).
    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(text):
            entities.append(
                Entity(text=m.group(), label="DATE", start=m.start(), end=m.end(), score=0.9)
            )
            occupied.append((m.start(), m.end()))

    # Lieux connus.
    for m in re.finditer(r"\b[\wÀ-ÿ'’\-]+\b", text):
        if fold(m.group()) in _KNOWN_PLACES and not _overlaps(m.start(), m.end()):
            entities.append(
                Entity(text=m.group(), label="LOC", start=m.start(), end=m.end(), score=0.85)
            )
            occupied.append((m.start(), m.end()))

    # Personnes (mots capitalisés non déjà couverts).
    for m in _PERSON_PATTERN.finditer(text):
        first_token = fold(m.group().split()[0])
        if first_token in _STOPWORDS or first_token in _KNOWN_PLACES:
            continue
        if not _overlaps(m.start(), m.end()):
            entities.append(
                Entity(text=m.group(), label="PER", start=m.start(), end=m.end(), score=0.6)
            )
            occupied.append((m.start(), m.end()))

    entities.sort(key=lambda e: e.start)
    return entities


def _spacy_entities(text: str, nlp) -> list[Entity]:  # noqa: ANN001 - type spaCy dynamique
    """Extraction d'entités via spaCy, complétée par les dates regex."""
    doc = nlp(text)
    entities = [
        Entity(text=ent.text, label=ent.label_, start=ent.start_char, end=ent.end_char, score=0.85)
        for ent in doc.ents
    ]
    spans = [(e.start, e.end) for e in entities]
    # spaCy fr ne labelise pas les dates → on les ajoute par regex.
    for pattern in _DATE_PATTERNS:
        for m in pattern.finditer(text):
            if not any(m.start() < e and m.end() > s for s, e in spans):
                entities.append(
                    Entity(text=m.group(), label="DATE", start=m.start(), end=m.end(), score=0.9)
                )
    entities.sort(key=lambda e: e.start)
    return entities


def extract_entities(text: str, language: str | None = "fr") -> tuple[list[Entity], str]:
    """Extrait les entités nommées d'un texte.

    Args:
        text: texte à analyser.
        language: code langue (informatif ; le modèle chargé est français).

    Returns:
        Tuple ``(entities, engine)`` où ``engine`` vaut ``spacy`` ou
        ``regex_fallback``.
    """
    nlp = registry.get_spacy()
    if nlp is not None:
        try:
            return _spacy_entities(text, nlp), "spacy"
        except Exception:  # noqa: BLE001 - tout échec spaCy → fallback
            pass
    return _regex_entities(text), "regex_fallback"
