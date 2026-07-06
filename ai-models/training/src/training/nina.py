"""
Décodage et validation du format NINA malien — port Python fidèle de
``packages/utils/src/nina.ts``.

Format : 14 chiffres + 1 lettre de contrôle = 15 caractères.
Structure ``X YY ZZ Z ZZ ZZZ ZZZ A`` :

- ``X``   : sexe (1 = masculin, 2 = féminin)
- ``YY``  : année de naissance (2 chiffres)
- ``ZZ``  : mois de naissance (2 chiffres)
- ``Z``   : code région RAVEC (1 chiffre)
- ``ZZ``  : code cercle (2 chiffres)
- ``ZZZ`` : code commune (3 chiffres)
- ``ZZZ`` : séquentiel dans la commune (3 chiffres)
- ``A``   : lettre de contrôle (somme pondérée modulo 23)

⚠️ La parité avec la version TypeScript est **vérifiée** : sur le dataset
synthétique, 100 % des enregistrements « propres » valident la lettre de contrôle
et 100 % des enregistrements ``invalid_checksum`` la rejettent. Toute divergence
ici romprait les variables de cohérence du modèle.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Expression régulière du format NINA : 14 chiffres (commençant par 1 ou 2 = sexe)
# suivis d'une lettre de contrôle majuscule.
NINA_REGEX = re.compile(r"^[12]\d{13}[A-Z]$")

# Alphabet de contrôle (23 lettres — sans `I` ni `O` pour éviter la confusion
# avec les chiffres `1` et `0`). Identique à CONTROL_ALPHABET de nina.ts.
CONTROL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"

# Caractères de séparation tolérés dans une saisie utilisateur.
_SEPARATORS = re.compile(r"[\s\-_.]+")


@dataclass(frozen=True)
class ParsedNina:
    """Structure parsée d'un numéro NINA (cf. ``ParsedNina`` côté TypeScript)."""

    full: str  # Numéro complet normalisé (15 caractères)
    sexe: int  # 1 = Masculin, 2 = Féminin
    annee_naissance: str  # Année de naissance (2 chiffres)
    mois_naissance: str  # Mois de naissance (2 chiffres)
    region: str  # Code région RAVEC (1 chiffre)
    cercle: str  # Code cercle RAVEC (2 chiffres)
    commune: str  # Code commune RAVEC (3 chiffres)
    sequentiel: str  # Numéro séquentiel dans la commune (3 chiffres)
    lettre_controle: str  # Lettre de contrôle


def normalize_nina(value: str | None) -> str:
    """Normalise un NINA pour comparaison : retire espaces / tirets, passe en majuscules.

    Args:
        value: Saisie brute (peut contenir espaces, tirets, minuscules, ``None``).

    Returns:
        Le NINA normalisé (alphanumérique majuscule uniquement).
    """
    if not value:
        return ""
    return _SEPARATORS.sub("", str(value)).upper()


def compute_control_letter(digits: str) -> str:
    """Calcule la lettre de contrôle à partir des 14 premiers chiffres.

    Algorithme : somme pondérée (chiffre × position 1-indexée) modulo 23, mappée
    sur :data:`CONTROL_ALPHABET`.

    Args:
        digits: Les 14 premiers chiffres du NINA.

    Returns:
        La lettre de contrôle attendue.

    Raises:
        ValueError: Si ``digits`` n'est pas composé d'exactement 14 chiffres.
    """
    if not re.fullmatch(r"\d{14}", digits):
        raise ValueError(f'Les 14 premiers caractères doivent être des chiffres. Reçu : "{digits}"')
    total = sum(int(digits[i]) * (i + 1) for i in range(14))
    return CONTROL_ALPHABET[total % 23]


def validate_nina(nina: str | None) -> bool:
    """Valide le format **et** la lettre de contrôle d'un NINA.

    Args:
        nina: NINA à valider (tolère espaces / tirets via :func:`normalize_nina`).

    Returns:
        ``True`` si le format est valide et la lettre de contrôle correcte.
    """
    n = normalize_nina(nina)
    if len(n) != 15 or not NINA_REGEX.match(n):
        return False
    return n[14] == compute_control_letter(n[:14])


def parse_nina(nina: str | None) -> ParsedNina:
    """Parse un NINA en ses composants structurels.

    Args:
        nina: NINA à parser (peut être formaté avec espaces).

    Returns:
        Un :class:`ParsedNina`.

    Raises:
        ValueError: Si le format est invalide.
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


def try_parse_nina(nina: str | None) -> ParsedNina | None:
    """Variante non levante de :func:`parse_nina` (retourne ``None`` si invalide).

    Pratique pour l'ingénierie de variables où une ligne corrompue ne doit pas
    interrompre le traitement du lot.

    Args:
        nina: NINA à parser.

    Returns:
        Un :class:`ParsedNina`, ou ``None`` si le format est inexploitable.
    """
    try:
        return parse_nina(nina)
    except ValueError, TypeError:
        return None
