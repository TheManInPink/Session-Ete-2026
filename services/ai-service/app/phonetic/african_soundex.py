"""
african_soundex.py — Soundex adapté aux phonétiques ouest-africaines.

Le Soundex anglo-saxon classique est inadapté aux noms maliens (bambara,
soninké, peul, songhaï…) : il supprime la voyelle initiale et ne gère pas les
variations de translittération franco-arabes (« ou » vs « u », « Mamadou » vs
« Mahamadou », « Coulibaly » vs « Kulibali »). Cet algorithme maison corrige
ces points.

Principe :
    1. Minuscule, suppression des séparateurs (espaces, tirets, apostrophes).
    2. Suppression des accents (NFD) → lettres de base.
    3. Désambiguïsation du « c » : /s/ devant e/i/y, sinon /k/ ; « x » → « ks ».
    4. Digrammes de translittération : « ph »→f, « ou »→u, « au »→o, « ai »→e.
    5. Codage : voyelles conservées (timbre), consonnes regroupées par parenté
       articulatoire, « h » muet ignoré.
    6. **Réduction des codes consécutifs identiques** (clé de la robustesse aux
       insertions/répétitions).

PUR Python (aucune dépendance) : disponible même sans `jellyfish`.

Golden-set de validation : tests/fixtures/phonetic_pairs.json.
Référence : docs/11-AI-SERVICE-FASTAPI.md §11.
"""

from __future__ import annotations

import re
import unicodedata

# Voyelles (et quasi-voyelles) → timbre conservé.
_VOWELS = {"a": "a", "e": "e", "i": "i", "o": "o", "u": "u", "y": "i", "w": "u"}

# Consonnes → code par parenté articulatoire.
_CONSONANTS = {
    "b": "1",
    "p": "1",
    "d": "2",
    "t": "2",
    "f": "3",
    "v": "3",
    "g": "4",
    "k": "4",
    "q": "4",
    "j": "5",
    "l": "6",
    "m": "7",
    "n": "7",
    "r": "8",
    "s": "9",
    "z": "9",
    "h": "",  # H muet — ignoré
}


def _strip_accents(value: str) -> str:
    """Supprime les marques combinantes Unicode (é→e, ç→c, ï→i…)."""
    return "".join(
        c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn"
    )


def african_soundex(name: str) -> str:
    """Calcule le code Soundex africain d'un nom.

    Args:
        name: nom ou prénom (peut contenir espaces, tirets, apostrophes, accents).

    Returns:
        Code phonétique en majuscules (chaîne vide si l'entrée est vide).

    Examples:
        >>> african_soundex("Mamadou") == african_soundex("Mamadu")
        True
        >>> african_soundex("Coulibaly") == african_soundex("Kulibali")
        True
        >>> african_soundex("Diallo") == african_soundex("Jallo")
        False
    """
    if not name:
        return ""

    s = _strip_accents(name.lower().strip())
    s = re.sub(r"[\s\-'’]", "", s)
    if not s:
        return ""

    # Désambiguïsation du « c » et du « x » (avant le codage).
    s = re.sub(r"c(?=[eiy])", "s", s)
    s = s.replace("c", "k").replace("x", "ks")

    # Digrammes de translittération.
    s = s.replace("ph", "f").replace("ou", "u").replace("au", "o").replace("ai", "e")

    codes: list[str] = []
    for ch in s:
        if ch in _VOWELS:
            code = _VOWELS[ch]
        elif ch in _CONSONANTS:
            code = _CONSONANTS[ch]
        else:
            code = ""  # caractère inconnu (chiffre, ponctuation résiduelle) ignoré
        # Réduction des codes consécutifs identiques.
        if code and (not codes or codes[-1] != code):
            codes.append(code)

    return "".join(codes).upper()
