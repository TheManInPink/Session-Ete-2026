"""
nina_rules.py — Validation et décomposition du numéro NINA (côté Python).

⚠️ PARITÉ STRICTE avec `packages/utils/src/nina.ts` (TypeScript).
Toute divergence d'algorithme produirait des incohérences entre l'IA (Python)
et le reste de la plateforme (NestJS). Les deux implémentations DOIVENT rester
synchronisées. Un test de non-régression (`tests/test_nina_rules.py`) fige des
vecteurs connus.

Format NINA : 14 chiffres + 1 lettre de contrôle = 15 caractères.
Structure : `X YY ZZ Z ZZ ZZZ ZZZ A`
    - X   : sexe (1 = masculin, 2 = féminin)
    - YY  : année de naissance (2 chiffres)
    - ZZ  : mois de naissance (2 chiffres)
    - Z   : code région RAVEC (1 chiffre)
    - ZZ  : code cercle
    - ZZZ : code commune
    - ZZZ : séquentiel dans la commune
    - A   : lettre de contrôle (somme pondérée modulo 23)

Référence : docs/11-AI-SERVICE-FASTAPI.md + packages/utils/src/nina.ts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Le 1er chiffre encode le sexe (1 ou 2) ; suivent 13 chiffres puis 1 lettre.
NINA_REGEX = re.compile(r"^[12]\d{13}[A-Z]$")

# Alphabet de contrôle : 23 lettres, sans « I » ni « O » pour éviter la
# confusion avec « 1 » et « 0 ». Indexé A=0 … W=22.
CONTROL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"

# Sexe encodé dans le 1er chiffre du NINA.
SEX_BY_NINA_DIGIT = {"1": "M", "2": "F"}


@dataclass(frozen=True)
class ParsedNina:
    """Décomposition structurelle d'un NINA (15 caractères)."""

    full: str
    sexe: int  # 1 = masculin, 2 = féminin
    annee_naissance: str  # 2 chiffres
    mois_naissance: str  # 2 chiffres
    region: str  # 1 chiffre
    cercle: str  # 2 chiffres
    commune: str  # 3 chiffres
    sequentiel: str  # 3 chiffres
    lettre_controle: str


def normalize_nina(value: str | None) -> str:
    """Normalise un NINA : retire espaces/tirets/points et passe en majuscules.

    À utiliser **avant** toute validation ou comparaison.

    Args:
        value: saisie brute (peut contenir espaces, tirets, minuscules).

    Returns:
        NINA normalisé (alphanumérique majuscule).
    """
    if not value:
        return ""
    return re.sub(r"[\s\-_.]+", "", value).upper()


def compute_control_letter(digits: str) -> str:
    """Calcule la lettre de contrôle à partir des 14 premiers chiffres.

    Algorithme (identique à `computeControlLetter` en TypeScript) : somme
    pondérée `Σ chiffre_i × (i + 1)` pour i de 0 à 13, modulo 23, mappée sur
    `CONTROL_ALPHABET`.

    Args:
        digits: les 14 premiers chiffres du NINA.

    Returns:
        Lettre de contrôle attendue (A-Z hors I et O).

    Raises:
        ValueError: si `digits` n'est pas exactement 14 chiffres.
    """
    if not re.fullmatch(r"\d{14}", digits):
        raise ValueError(f'Les 14 premiers caractères doivent être des chiffres. Reçu : "{digits}"')

    total = sum(int(d) * (i + 1) for i, d in enumerate(digits))
    return CONTROL_ALPHABET[total % 23]


def validate_nina(nina: str) -> bool:
    """Valide le format ET la lettre de contrôle d'un NINA.

    Tolère espaces/tirets via :func:`normalize_nina`.

    Args:
        nina: NINA à valider.

    Returns:
        `True` si le format est valide **et** la lettre de contrôle correcte.
    """
    n = normalize_nina(nina)
    if len(n) != 15 or not NINA_REGEX.match(n):
        return False
    return n[14] == compute_control_letter(n[:14])


def validate_nina_checksum(nina: str) -> bool:
    """Alias explicite de :func:`validate_nina` (parité avec `validateNinaChecksum` TS).

    À utiliser quand on veut souligner que c'est bien la **lettre de contrôle
    finale** que l'on vérifie.
    """
    return validate_nina(nina)


def parse_nina(nina: str) -> ParsedNina:
    """Décompose un NINA en ses composants structurels.

    Args:
        nina: NINA à décomposer (peut être formaté avec espaces).

    Returns:
        Instance :class:`ParsedNina`.

    Raises:
        ValueError: si le format est invalide (ne valide PAS la lettre de
            contrôle — utiliser :func:`validate_nina` pour cela).
    """
    n = normalize_nina(nina)
    if not NINA_REGEX.match(n):
        raise ValueError(f'Format NINA invalide : "{nina}"')

    return ParsedNina(
        full=n,
        sexe=int(n[0]),
        annee_naissance=n[1:3],
        mois_naissance=n[3:5],
        region=n[5:6],
        cercle=n[6:8],
        commune=n[8:11],
        sequentiel=n[11:14],
        lettre_controle=n[14],
    )


def format_nina(nina: str) -> str:
    """Formate un NINA pour affichage lisible : `X YY ZZ Z ZZ ZZZ ZZZ A`."""
    n = normalize_nina(nina)
    if len(n) != 15:
        return n
    return f"{n[0]} {n[1:3]} {n[3:5]} {n[5]} {n[6:8]} {n[8:11]} {n[11:14]} {n[14]}"


def mask_nina(nina: str, visible_start: int = 2, visible_end: int = 2) -> str:
    """Masque un NINA pour les journaux : `12***********8A`.

    Args:
        nina: NINA à masquer.
        visible_start: nombre de caractères visibles au début.
        visible_end: nombre de caractères visibles à la fin.

    Returns:
        NINA partiellement masqué (jamais journalisé en clair — cf. RGPD).
    """
    n = normalize_nina(nina)
    if not n:
        return ""
    if len(n) <= visible_start + visible_end:
        return "*" * len(n)
    return n[:visible_start] + "*" * (len(n) - visible_start - visible_end) + n[-visible_end:]
