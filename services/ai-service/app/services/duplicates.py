"""
duplicates.py — Détection de doublons potentiels.

Compare un citoyen à un **index de candidats** et renvoie les correspondances
les plus probables (homonymes réels, fiches dédoublées frauduleuses…).

Mode stateless : l'index peut être fourni dans la requête (`candidates`). En
son absence, un petit index de démonstration embarqué est utilisé. En
production, brancher Elasticsearch / identity-service à la place de
`DEFAULT_INDEX` (cf. point d'extension `load_default_index`).

Référence : docs/11-AI-SERVICE-FASTAPI.md §7 (features fuzzy/phonétiques).
"""

from __future__ import annotations

import time

from app.schemas.common import CitizenPayload
from app.schemas.duplicates import CandidateRecord, DuplicateCandidate
from app.services import nina_rules
from app.services.comparator import compare_names

# Index de démonstration (fictif) — remplacé par Elasticsearch en production.
DEFAULT_INDEX: list[CandidateRecord] = [
    CandidateRecord(
        nina="18903102015042V",
        first_name="Aliou",
        last_name="Traoré",
        birth_date="1989-03-15",
        birth_place="Kayes",
    ),
    CandidateRecord(
        nina="18903102015099X",
        first_name="Aliou",
        last_name="Traore",
        birth_date="1989-03-15",
        birth_place="Kayes",
    ),
    CandidateRecord(
        nina="29005156002013E",
        first_name="Fatoumata",
        last_name="Diarra",
        birth_date="1990-05-15",
        birth_place="Bamako",
    ),
]


def load_default_index() -> list[CandidateRecord]:
    """Retourne l'index par défaut. Point d'extension pour Elasticsearch.

    En production, remplacer le corps par une requête Elasticsearch filtrée
    (par région / phonétique) afin de ne pas scanner toute la base.
    """
    return DEFAULT_INDEX


def _full_name(first: str, last: str) -> str:
    return f"{first} {last}".strip()


def detect_duplicates(
    citizen: CitizenPayload,
    candidates: list[CandidateRecord] | None,
    *,
    limit: int = 10,
    min_score: float = 60.0,
) -> tuple[list[DuplicateCandidate], int]:
    """Recherche les doublons potentiels d'un citoyen.

    Args:
        citizen: citoyen de référence.
        candidates: index à comparer ; `None` → index par défaut.
        limit: nombre maximum de candidats retournés.
        min_score: score minimal pour retenir un candidat.

    Returns:
        Tuple ``(doublons_triés, nombre_scanné)``.
    """
    index = candidates if candidates is not None else load_default_index()
    target_name = _full_name(citizen.first_name, citizen.last_name)
    target_nina = nina_rules.normalize_nina(citizen.nina)
    target_date = (citizen.birth_date or "").strip()

    results: list[DuplicateCandidate] = []
    for cand in index:
        cand_name = _full_name(cand.first_name, cand.last_name)
        name_cmp = compare_names(target_name, cand_name)
        name_score = name_cmp.overall_similarity

        date_match = bool(target_date) and target_date == (cand.birth_date or "").strip()
        place_score = (
            compare_names(citizen.birth_place, cand.birth_place).overall_similarity
            if citizen.birth_place and cand.birth_place
            else 0.0
        )
        nina_match = bool(target_nina) and target_nina == nina_rules.normalize_nina(cand.nina)

        # Score global pondéré : le nom domine, la date renforce fortement.
        overall = round(
            0.65 * name_score + 0.25 * (100.0 if date_match else 0.0) + 0.10 * place_score, 1
        )
        if nina_match:
            overall = 100.0  # même NINA → collision certaine

        match_fields: list[str] = []
        if nina_match:
            match_fields.append("nina")
        if name_score >= 85.0:
            match_fields.append("name")
        if date_match:
            match_fields.append("birth_date")
        if place_score >= 80.0:
            match_fields.append("birth_place")

        if overall >= min_score:
            results.append(
                DuplicateCandidate(
                    nina=nina_rules.mask_nina(cand.nina),
                    name=cand_name,
                    score=overall,
                    match_fields=match_fields,
                )
            )

    results.sort(key=lambda r: r.score, reverse=True)
    return results[:limit], len(index)


def detect_duplicates_timed(
    citizen: CitizenPayload,
    candidates: list[CandidateRecord] | None,
    *,
    limit: int = 10,
    min_score: float = 60.0,
) -> tuple[list[DuplicateCandidate], int, float]:
    """Variante chronométrée de :func:`detect_duplicates` (retourne aussi le temps ms)."""
    start = time.perf_counter()
    results, scanned = detect_duplicates(citizen, candidates, limit=limit, min_score=min_score)
    return results, scanned, round((time.perf_counter() - start) * 1000.0, 2)
