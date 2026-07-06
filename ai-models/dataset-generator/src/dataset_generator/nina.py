"""
Construction de NINA synthétiques valides + corruption ciblée de la lettre de
contrôle.

Format identique à ``packages/utils/src/nina.ts`` et à ``ai-models/training`` :
14 chiffres ``X YY ZZ Z ZZ ZZZ ZZZ`` + lettre de contrôle (somme pondérée mod 23,
alphabet sans I/O). La région est encodée sur **1 chiffre** (codes NINA hérités
1-9), ce qui garantit que, sur les lignes propres, le chiffre région du NINA
égale ``region_code`` (invariant vérifié sur le dataset de référence).

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import numpy as np

# Alphabet de contrôle (23 lettres, sans I ni O) — identique à nina.ts.
CONTROL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"


def control_letter(digits14: str) -> str:
    """Calcule la lettre de contrôle des 14 premiers chiffres (somme pondérée mod 23).

    Args:
        digits14: Les 14 premiers chiffres du NINA.

    Returns:
        La lettre de contrôle attendue.
    """
    total = sum(int(d) * (i + 1) for i, d in enumerate(digits14))
    return CONTROL_ALPHABET[total % 23]


def build_nina(sex: int, year: int, month: int, region: int, rng: np.random.Generator) -> str:
    """Construit un NINA **valide** (15 caractères) à partir des composants.

    Args:
        sex: 1 (masculin) ou 2 (féminin).
        year: Année de naissance (4 chiffres).
        month: Mois de naissance (1-12).
        region: Code région NINA (1-9, un seul chiffre).
        rng: Générateur aléatoire NumPy (pour cercle / commune / séquentiel).

    Returns:
        Un NINA valide de 15 caractères.
    """
    cercle = int(rng.integers(0, 100))
    commune = int(rng.integers(0, 1000))
    seq = int(rng.integers(0, 1000))
    digits = (
        f"{sex:1d}{year % 100:02d}{month:02d}{region:1d}"
        f"{cercle:02d}{commune:03d}{seq:03d}"
    )  # 14 chiffres
    return digits + control_letter(digits)


def corrupt_checksum(nina: str, rng: np.random.Generator) -> str:
    """Remplace la lettre de contrôle par une autre lettre (rend le NINA invalide).

    Args:
        nina: NINA valide de 15 caractères.
        rng: Générateur aléatoire NumPy.

    Returns:
        Un NINA dont la lettre de contrôle est désormais incorrecte.
    """
    correct = nina[14]
    others = [c for c in CONTROL_ALPHABET if c != correct]
    return nina[:14] + others[int(rng.integers(0, len(others)))]


def validate_nina(nina: str) -> bool:
    """Valide le format et la lettre de contrôle (pour les invariants de validation).

    Args:
        nina: NINA à valider.

    Returns:
        ``True`` si 15 caractères, 14 chiffres + lettre de contrôle correcte.
    """
    n = str(nina).strip().upper()
    if len(n) != 15 or not n[:14].isdigit() or n[0] not in "12":
        return False
    return n[14] == control_letter(n[:14])
