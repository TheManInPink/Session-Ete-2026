"""
comparator.py — Comparaison de noms (fuzzy + phonétique).

Combine plusieurs métriques de similarité pour décider si deux noms désignent
probablement la même personne (homonymie, faute de frappe, translittération) :

    - **RapidFuzz ratio** : similarité d'édition normalisée (0-100).
    - **Jaro-Winkler** : favorise les préfixes communs (bon pour les noms).
    - **Levenshtein** : distance d'édition brute.
    - **Soundex / Metaphone** : correspondance phonétique latine (jellyfish).
    - **Soundex africain** : phonétique ouest-africaine maison.

Stratégie de dépendances : `rapidfuzz` et `jellyfish` sont *préférés* mais
**optionnels**. En leur absence, des implémentations Python pures (Jaro-Winkler,
Levenshtein, `difflib`) prennent le relais — le service reste fonctionnel, avec
une précision légèrement moindre.

Référence : docs/11-AI-SERVICE-FASTAPI.md §7.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass

from app.phonetic import african_soundex
from app.services.reference import fold

# ─── Imports optionnels (dégradation gracieuse) ─────────────────────
try:  # pragma: no cover - dépend de l'environnement
    from rapidfuzz import fuzz as _rf_fuzz  # pyright: ignore[reportMissingImports]
    from rapidfuzz.distance import Levenshtein as _rf_lev  # pyright: ignore[reportMissingImports]

    _HAS_RAPIDFUZZ = True
except ImportError:  # pragma: no cover
    _rf_fuzz = None
    _rf_lev = None
    _HAS_RAPIDFUZZ = False

try:  # pragma: no cover
    import jellyfish as _jellyfish  # pyright: ignore[reportMissingImports]

    _HAS_JELLYFISH = True
except ImportError:  # pragma: no cover
    _jellyfish = None
    _HAS_JELLYFISH = False


@dataclass(frozen=True)
class NameComparison:
    """Résultat structuré de la comparaison de deux noms."""

    rapidfuzz_ratio: float
    jaro_winkler: float
    levenshtein: int
    soundex_match: bool
    metaphone_match: bool
    african_soundex_match: bool
    overall_similarity: float
    verdict: str  # "identical" | "similar" | "different"


# ─── Implémentations pures (utilisées si les libs sont absentes) ────
def _levenshtein_py(a: str, b: str) -> int:
    """Distance de Levenshtein en Python pur (programmation dynamique)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def _jaro_py(a: str, b: str) -> float:
    """Similarité de Jaro (0-1) en Python pur."""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0

    match_distance = max(len(a), len(b)) // 2 - 1
    match_distance = max(match_distance, 0)
    a_matches = [False] * len(a)
    b_matches = [False] * len(b)

    matches = 0
    for i, ca in enumerate(a):
        start = max(0, i - match_distance)
        end = min(i + match_distance + 1, len(b))
        for j in range(start, end):
            if b_matches[j] or b[j] != ca:
                continue
            a_matches[i] = b_matches[j] = True
            matches += 1
            break

    if matches == 0:
        return 0.0

    # Transpositions
    transpositions = 0
    k = 0
    for i in range(len(a)):
        if not a_matches[i]:
            continue
        while not b_matches[k]:
            k += 1
        if a[i] != b[k]:
            transpositions += 1
        k += 1
    transpositions //= 2

    return (matches / len(a) + matches / len(b) + (matches - transpositions) / matches) / 3.0


def _jaro_winkler_py(a: str, b: str, prefix_scale: float = 0.1) -> float:
    """Similarité de Jaro-Winkler (0-1) en Python pur."""
    jaro = _jaro_py(a, b)
    prefix = 0
    for ca, cb in zip(a, b):
        if ca == cb:
            prefix += 1
        else:
            break
        if prefix == 4:
            break
    return jaro + prefix * prefix_scale * (1 - jaro)


def _ratio(a: str, b: str) -> float:
    """Ratio de similarité 0-100 (RapidFuzz si dispo, sinon difflib)."""
    if not a and not b:
        return 100.0
    if _HAS_RAPIDFUZZ:
        return float(_rf_fuzz.ratio(a, b))
    return difflib.SequenceMatcher(None, a, b).ratio() * 100.0


def _jaro_winkler(a: str, b: str) -> float:
    """Jaro-Winkler 0-1 (jellyfish si dispo, sinon implémentation pure)."""
    if _HAS_JELLYFISH:
        return float(_jellyfish.jaro_winkler_similarity(a, b))
    return _jaro_winkler_py(a, b)


def _levenshtein(a: str, b: str) -> int:
    """Distance de Levenshtein (RapidFuzz si dispo, sinon implémentation pure)."""
    if _HAS_RAPIDFUZZ:
        return int(_rf_lev.distance(a, b))
    return _levenshtein_py(a, b)


def _soundex(value: str) -> str:
    """Soundex latin (jellyfish) — chaîne vide si indisponible/erreur."""
    if not value or not _HAS_JELLYFISH:
        return ""
    try:  # pragma: no cover - dépend de l'entrée
        return _jellyfish.soundex(value)
    except Exception:  # noqa: BLE001 - jellyfish peut lever sur certains caractères non-ASCII
        return ""


def _metaphone(value: str) -> str:
    """Metaphone (jellyfish) — chaîne vide si indisponible/erreur."""
    if not value or not _HAS_JELLYFISH:
        return ""
    try:  # pragma: no cover
        return _jellyfish.metaphone(value)
    except Exception:  # noqa: BLE001 - jellyfish peut lever sur certains caractères non-ASCII
        return ""


def compare_names(name1: str, name2: str) -> NameComparison:
    """Compare deux noms et agrège les métriques de similarité.

    Args:
        name1: premier nom.
        name2: second nom.

    Returns:
        :class:`NameComparison` avec le détail des métriques et un verdict.

    Notes:
        Le `overall_similarity` est une moyenne pondérée privilégiant
        Jaro-Winkler (préfixes) et le ratio d'édition, complétée d'un bonus
        phonétique. Verdict : ``identical`` (≥ 95), ``similar`` (≥ 80),
        ``different`` sinon.
    """
    a, b = (name1 or "").strip(), (name2 or "").strip()
    fa, fb = fold(a), fold(b)

    ratio = _ratio(fa, fb)
    jw = _jaro_winkler(fa, fb)
    lev = _levenshtein(fa, fb)

    sx_a, sx_b = _soundex(a), _soundex(b)
    mp_a, mp_b = _metaphone(a), _metaphone(b)
    soundex_match = bool(sx_a) and sx_a == sx_b
    metaphone_match = bool(mp_a) and mp_a == mp_b
    as_a, as_b = african_soundex(a), african_soundex(b)
    african_match = bool(as_a) and as_a == as_b

    # Score agrégé 0-100 : 50 % ratio d'édition + 35 % Jaro-Winkler + 15 %
    # bonus phonétique (Soundex latin OU africain).
    phonetic_bonus = 100.0 if (soundex_match or african_match) else 0.0
    overall = round(0.50 * ratio + 0.35 * (jw * 100.0) + 0.15 * phonetic_bonus, 2)

    if fa == fb:
        verdict = "identical"
    elif overall >= 80.0:
        verdict = "similar"
    else:
        verdict = "different"

    return NameComparison(
        rapidfuzz_ratio=round(ratio, 2),
        jaro_winkler=round(jw, 4),
        levenshtein=lev,
        soundex_match=soundex_match,
        metaphone_match=metaphone_match,
        african_soundex_match=african_match,
        overall_similarity=overall,
        verdict=verdict,
    )


def best_match(name: str, candidates: list[str]) -> tuple[str, float] | None:
    """Retourne le candidat le plus proche d'un nom et son score (0-100).

    Args:
        name: nom de référence.
        candidates: liste de noms candidats (déjà pliés ou non).

    Returns:
        Tuple ``(candidat, score)`` du meilleur match, ou `None` si la liste
        est vide.
    """
    if not candidates:
        return None
    fname = fold(name)
    scored = [(c, _ratio(fname, fold(c))) for c in candidates]
    return max(scored, key=lambda x: x[1])


def runtime_backends() -> dict[str, bool]:
    """Indique quelles bibliothèques de comparaison sont actives (pour /health)."""
    return {"rapidfuzz": _HAS_RAPIDFUZZ, "jellyfish": _HAS_JELLYFISH}
