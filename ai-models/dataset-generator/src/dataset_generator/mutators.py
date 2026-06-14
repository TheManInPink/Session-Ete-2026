"""mutators.py — Mutations bas niveau pour injecter des erreurs réalistes.

Chaque fonction reçoit la valeur à altérer et un `random.Random` (injecté pour
la reproductibilité) et **garantit** une chaîne différente de l'entrée pour les
fautes de frappe / phonétiques (sauf chaînes dégénérées d'un seul caractère).
"""

from __future__ import annotations

import random
import re

from unidecode import unidecode

# Voisinage clavier AZERTY (substitutions / insertions plausibles).
_AZERTY: dict[str, str] = {
    "a": "zqs",
    "z": "aesd",
    "e": "zrsd",
    "r": "etdf",
    "t": "ryfg",
    "y": "tugh",
    "u": "yihj",
    "i": "uojk",
    "o": "ipkl",
    "p": "olm",
    "q": "asw",
    "s": "qzedx",
    "d": "serfcx",
    "f": "drtgvc",
    "g": "ftyhbv",
    "h": "gyujnb",
    "j": "huikn",
    "k": "jiol",
    "l": "kopm",
    "m": "lp",
    "w": "qsx",
    "x": "wsdc",
    "c": "xdfv",
    "v": "cfgb",
    "b": "vghn",
    "n": "bhj",
}
_ALPHA = "abcdefghijklmnopqrstuvwxyz"


def _match_case(template: str, letter: str) -> str:
    """Aligne la casse de `letter` sur celle de `template`."""
    return letter.upper() if template.isupper() else letter.lower()


def substitute(value: str, rng: random.Random) -> str:
    """Remplace une lettre interne par une touche voisine (faute de frappe)."""
    if len(value) < 2:
        return value
    i = rng.randrange(1, len(value))
    ch = value[i]
    neighbors = _AZERTY.get(ch.lower())
    repl = rng.choice(neighbors) if neighbors else rng.choice(_ALPHA)
    repl = _match_case(ch, repl)
    if repl.lower() == ch.lower():  # garantir un vrai changement
        repl = _match_case(ch, "x" if ch.lower() != "x" else "z")
    return value[:i] + repl + value[i + 1 :]


def omit(value: str, rng: random.Random) -> str:
    """Supprime une lettre interne (omission)."""
    if len(value) < 2:
        return value
    i = rng.randrange(1, len(value))
    return (value[:i] + value[i + 1 :]) or value


def insert(value: str, rng: random.Random) -> str:
    """Insère une lettre superflue : doublement ou touche voisine."""
    if not value:
        return value
    i = rng.randrange(1, len(value) + 1)
    if rng.random() < 0.5:
        ch = value[i - 1]  # double la lettre précédente
    else:
        base = value[min(i, len(value) - 1)].lower()
        neigh = _AZERTY.get(base)
        ch = _match_case(
            value[i - 1], rng.choice(neigh) if neigh else rng.choice("aeiou")
        )
    return value[:i] + ch + value[i:]


# Variantes phonétiques fréquentes de prénoms (translittérations courantes).
_NAME_VARIANTS: dict[str, list[str]] = {
    "mohamed": ["mohammed", "mahamadou", "mahamoud", "mohamad"],
    "mohammed": ["mohamed", "mahamadou", "mohamad"],
    "mahamadou": ["mohamed", "mohammed", "mahamoudou"],
    "oumar": ["omar", "oumarou"],
    "omar": ["oumar", "oumarou"],
    "ibrahim": ["ibrahima", "brahim", "brahima"],
    "ibrahima": ["ibrahim", "brahima"],
    "amadou": ["hamadou", "ahmadou", "amadu"],
    "boubacar": ["aboubacar", "boubakar", "boubacary"],
    "aboubacar": ["boubacar", "aboubakar"],
    "aliou": ["alou", "aliyou", "aly"],
    "souleymane": ["souleyman", "soulaymane", "solomane"],
    "fatoumata": ["fatimata", "fatoumatou", "fatim"],
    "aissata": ["aichata", "aisseta", "acheta"],
    "kadiatou": ["kadidiatou", "khadidiatou", "kadia"],
    "mariam": ["maryam", "mariama", "meriem"],
    "aminata": ["aminatou", "amenata"],
    "youssouf": ["yousouf", "yssouf", "youssoufou"],
    "moussa": ["moussah", "mousa"],
}

# Règles de translittération (motif insensible à la casse → remplacement).
_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"ou", re.I), "u"),
    (re.compile(r"ph", re.I), "f"),
    (re.compile(r"mm", re.I), "m"),
    (re.compile(r"ss", re.I), "s"),
    (re.compile(r"ck", re.I), "k"),
    (re.compile(r"qu", re.I), "k"),
    (re.compile(r"th", re.I), "t"),
    (re.compile(r"dj", re.I), "j"),
    (re.compile(r"y", re.I), "i"),
]


def _titlecase(s: str) -> str:
    """Première lettre en majuscule, reste inchangé."""
    return s[:1].upper() + s[1:] if s else s


def _double_vowel(value: str, rng: random.Random) -> str:
    """Repli : double une voyelle (ou la dernière lettre)."""
    idxs = [i for i, c in enumerate(value) if c.lower() in "aeiou" and i > 0]
    if not idxs:
        return value + value[-1]
    i = rng.choice(idxs)
    return value[: i + 1] + value[i] + value[i + 1 :]


def phonetic(value: str, rng: random.Random) -> str:
    """Produit une variante phonétique réaliste (garantie ≠ entrée)."""
    folded = unidecode(value).lower()
    if folded in _NAME_VARIANTS:
        return _titlecase(rng.choice(_NAME_VARIANTS[folded]))

    candidates = [(rx, rep) for rx, rep in _RULES if rx.search(value)]
    rng.shuffle(candidates)
    for rx, rep in candidates:
        out = rx.sub(rep, value, count=1)
        if out.lower() != value.lower():
            return _titlecase(out)

    stripped = unidecode(value)  # perte d'accents (é→e, ï→i…)
    if stripped != value:
        return _titlecase(stripped)
    return _double_vowel(value, rng)


def swap_date_format(iso: str) -> str:
    """Réécrit une date ISO `AAAA-MM-JJ` au format US ambigu `MM/JJ/AAAA`.

    Représente l'erreur `date_format_error` (confusion JJ/MM vs MM/JJ).
    L'année reste extractible — l'erreur porte sur l'ordre jour/mois.
    """
    try:
        y, m, d = iso.split("-")
    except ValueError:
        return iso
    return f"{m}/{d}/{y}"
