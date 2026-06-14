"""
generate_synthetic_dataset.py — Génère un dataset synthétique d'enregistrements NINA.

~50 % d'enregistrements corrects, ~50 % avec une (ou plusieurs) erreur(s)
contrôlée(s) et étiquetée(s). Aucune donnée réelle n'est utilisée (RGPD + Loi
malienne 2022-013 ; cf. doc 11 §6).

Différence clé avec le brouillon de doc 11 : on produit de **vrais NINA à
14 chiffres + lettre de contrôle** (somme pondérée mod 23, alphabet sans I/O),
identiques à `packages/utils/src/nina.ts` et `app/services/nina_rules.py`.
Ainsi la feature `nina_checksum_valid` est réellement exploitable.

Usage :
    python ai-models/scripts/generate_synthetic_dataset.py --n 10000

Dépendance : pandas (faker est optionnel, non requis ici).
"""

from __future__ import annotations

import argparse
import random
import string
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

# ─── Référentiel embarqué (cohérent avec app/services/reference.py) ─
CONTROL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # 23 lettres, sans I ni O
PRENOMS_M = [
    "Mamadou",
    "Aliou",
    "Modibo",
    "Boubacar",
    "Ousmane",
    "Adama",
    "Seydou",
    "Ibrahim",
    "Moussa",
    "Sékou",
    "Bakary",
    "Drissa",
    "Issa",
    "Amadou",
]
PRENOMS_F = [
    "Fatoumata",
    "Aïssata",
    "Kadiatou",
    "Hawa",
    "Mariama",
    "Rokia",
    "Djénéba",
    "Aminata",
    "Oumou",
    "Salimata",
    "Assitan",
    "Bintou",
]
NOMS = [
    "Traoré",
    "Diarra",
    "Keita",
    "Coulibaly",
    "Diallo",
    "Sidibé",
    "Sangaré",
    "Touré",
    "Dembélé",
    "Konaté",
    "Samaké",
    "Togola",
    "Bagayogo",
    "Maïga",
]
# Région historique (chiffre RAVEC) → nom.
REGIONS = {
    1: "Kayes",
    2: "Koulikoro",
    3: "Sikasso",
    4: "Ségou",
    5: "Mopti",
    6: "Tombouctou",
    7: "Gao",
    8: "Kidal",
    9: "Bamako",
}
LANGUAGES = ["fr", "bm", "snk", "ff", "tmq", "hau", "mos", "dje"]
PLACEHOLDERS = ["XXX", "Inconnu", "N/A", "???", "..."]


def compute_control_letter(digits: str) -> str:
    """Somme pondérée Σ chiffre_i × (i+1) mod 23 → lettre (parité TS/Python)."""
    total = sum(int(d) * (i + 1) for i, d in enumerate(digits))
    return CONTROL_ALPHABET[total % 23]


def build_nina(birth: date, sex: str, region: int) -> str:
    """Construit un NINA valide à 15 caractères pour une naissance donnée."""
    digits = (
        ("1" if sex == "M" else "2")
        + f"{birth.year % 100:02d}"
        + f"{birth.month:02d}"
        + str(region)
        + f"{random.randint(1, 60):02d}"  # cercle
        + f"{random.randint(1, 300):03d}"  # commune
        + f"{random.randint(1, 999):03d}"  # séquentiel
    )
    return digits + compute_control_letter(digits)


def typo(value: str) -> str:
    """Introduit une faute de frappe réaliste (swap/delete/dup/replace)."""
    if len(value) < 3:
        return value
    i = random.randint(1, len(value) - 2)
    op = random.choice(["swap", "delete", "duplicate", "replace"])
    if op == "swap":
        return value[:i] + value[i + 1] + value[i] + value[i + 2 :]
    if op == "delete":
        return value[:i] + value[i + 1 :]
    if op == "duplicate":
        return value[: i + 1] + value[i] + value[i + 1 :]
    return value[:i] + random.choice(string.ascii_lowercase) + value[i + 1 :]


def transliterate(value: str) -> str:
    """Variations de translittération courantes (ou→u, é→e…)."""
    for a, b in (("ou", "u"), ("é", "e"), ("è", "e"), ("ï", "i")):
        if a in value.lower() and random.random() < 0.5:
            value = value.replace(a, b).replace(a.upper(), b.upper())
    return value


def random_birth() -> date:
    """Date de naissance aléatoire entre 18 et 90 ans."""
    days = random.randint(18 * 365, 90 * 365)
    return date.today() - timedelta(days=days)


def gen_row(_idx: int) -> dict:
    """Génère un enregistrement, correct ou erroné, avec étiquetage."""
    sex = random.choice(["M", "F"])
    first = random.choice(PRENOMS_M if sex == "M" else PRENOMS_F)
    last = random.choice(NOMS)
    birth = random_birth()
    region = random.choice(list(REGIONS))
    region_name = REGIONS[region]
    declared_sex = sex
    father = f"{random.choice(PRENOMS_M)} {random.choice(NOMS)}"
    mother = f"{random.choice(PRENOMS_F)} {random.choice(NOMS)}"
    errors: list[str] = []

    nina = build_nina(birth, sex, region)

    if random.random() < 0.5:
        kind = random.choice(
            [
                "typo_name",
                "translit_name",
                "placeholder_parent",
                "impossible_date",
                "sex_mismatch",
                "wrong_region",
                "bad_checksum",
            ]
        )
        if kind == "typo_name":
            first = typo(first)
        elif kind == "translit_name":
            first = transliterate(first)
        elif kind == "placeholder_parent":
            father = random.choice(PLACEHOLDERS)
            mother = random.choice(PLACEHOLDERS)
        elif kind == "impossible_date":
            birth = date(1850, 1, 1)
            nina = build_nina(birth, sex, region)
        elif kind == "sex_mismatch":
            declared_sex = "F" if sex == "M" else "M"
        elif kind == "wrong_region":
            region_name = REGIONS[random.choice([r for r in REGIONS if r != region])]
        elif kind == "bad_checksum":
            nina = nina[:14] + random.choice(
                [c for c in CONTROL_ALPHABET if c != nina[14]]
            )
        errors.append(kind)

    return {
        "nina": nina,
        "first_name": first,
        "last_name": last,
        "birth_date": birth.isoformat(),
        "sex": declared_sex,
        "birth_region": region_name,
        "father_name": father,
        "mother_name": mother,
        "language": random.choice(LANGUAGES),
        "has_error": bool(errors),
        "error_types": ",".join(errors),
    }


def main(n: int, out: str, seed: int) -> None:
    """Génère `n` lignes et écrit le CSV de sortie."""
    random.seed(seed)
    rows = [gen_row(i) for i in range(n)]
    df = pd.DataFrame(rows)
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, encoding="utf-8")
    print(f"[OK] {n} enregistrements generes -> {out_path}")
    print(df["has_error"].value_counts())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Génère un dataset NINA synthétique")
    parser.add_argument(
        "--n", type=int, default=10_000, help="nombre d'enregistrements"
    )
    parser.add_argument(
        "--out",
        default="ai-models/datasets/synthetic_nina_v1.csv",
        help="chemin de sortie",
    )
    parser.add_argument("--seed", type=int, default=42, help="graine aléatoire")
    args = parser.parse_args()
    main(args.n, args.out, args.seed)
