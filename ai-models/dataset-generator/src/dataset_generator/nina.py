"""nina.py — Construction et contrôle des NINA synthétiques.

⚠️ PARITÉ STRICTE avec :
    - services/ai-service/app/services/nina_rules.py (Python du service IA)
    - packages/utils/src/nina.ts (TypeScript du reste de la plateforme)

Le dataset DOIT produire de vrais NINA (14 chiffres + lettre de contrôle) afin
que la feature `nina_checksum_valid` du modèle soit réellement exploitable.
Toute divergence d'algorithme produirait des incohérences entre l'IA et le
backend ; un test (`tests/test_generate.py`) fige le vecteur connu
("18310444280090" → "H").

Format NINA : `X YY ZZ Z ZZ ZZZ ZZZ A` (15 caractères).
    X=sexe(1/2) · YY=année · ZZ=mois · Z=région · ZZ=cercle · ZZZ=commune
    · ZZZ=séquentiel · A=lettre de contrôle.
"""

from __future__ import annotations

import random
import re

# Alphabet de contrôle : 23 lettres, sans « I » ni « O » (confusion avec 1 / 0).
CONTROL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"

# Sexe encodé dans le 1er chiffre du NINA.
SEX_DIGIT = {"M": "1", "F": "2"}

# Un NINA bien formé : 1er chiffre 1 ou 2, 13 chiffres, 1 lettre majuscule.
NINA_REGEX = re.compile(r"^[12]\d{13}[A-Z]$")


def compute_control_letter(digits: str) -> str:
    """Calcule la lettre de contrôle des 14 premiers chiffres du NINA.

    Algorithme (identique à TS/Python du service) : somme pondérée
    `Σ chiffre_i × (i + 1)` pour i de 0 à 13, modulo 23, mappée sur
    :data:`CONTROL_ALPHABET`.

    Args:
        digits: les 14 premiers chiffres du NINA.

    Returns:
        Lettre de contrôle attendue (A-Z hors I et O).

    Raises:
        ValueError: si `digits` n'est pas exactement 14 chiffres.
    """
    if len(digits) != 14 or not digits.isdigit():
        raise ValueError(
            f'Les 14 premiers caractères doivent être des chiffres. Reçu : "{digits}"'
        )
    total = sum(int(d) * (i + 1) for i, d in enumerate(digits))
    return CONTROL_ALPHABET[total % 23]


def build_nina(
    *, year: int, month: int, sex: str, region_code: int, rng: random.Random
) -> str:
    """Construit un NINA valide à 15 caractères pour une naissance donnée.

    Args:
        year: année de naissance (seuls les 2 derniers chiffres sont encodés).
        month: mois de naissance (1-12).
        sex: « M » ou « F ».
        region_code: chiffre région RAVEC (1-9).
        rng: générateur aléatoire (injecté pour la reproductibilité).

    Returns:
        NINA complet (14 chiffres + lettre de contrôle).
    """
    digits = (
        SEX_DIGIT[sex]
        + f"{year % 100:02d}"
        + f"{month:02d}"
        + str(region_code)
        + f"{rng.randint(1, 60):02d}"  # cercle
        + f"{rng.randint(1, 300):03d}"  # commune
        + f"{rng.randint(1, 999):03d}"  # séquentiel
    )
    return digits + compute_control_letter(digits)


def corrupt_control_letter(nina: str, rng: random.Random) -> str:
    """Remplace la lettre de contrôle par une AUTRE lettre valide de l'alphabet.

    Le NINA reste structurellement valide (15 caractères) mais son checksum
    devient faux — c'est exactement l'erreur `invalid_checksum`.
    """
    others = [c for c in CONTROL_ALPHABET if c != nina[14]]
    return nina[:14] + rng.choice(others)


def is_structurally_valid(nina: str) -> bool:
    """Indique si le NINA respecte la structure (sans vérifier le checksum)."""
    return bool(NINA_REGEX.match(nina))


def is_checksum_valid(nina: str) -> bool:
    """Indique si le NINA est bien formé ET sa lettre de contrôle correcte."""
    return is_structurally_valid(nina) and nina[14] == compute_control_letter(nina[:14])
