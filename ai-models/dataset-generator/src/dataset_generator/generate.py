"""
Génération du dataset synthétique NINA (orchestration + CLI).

Construit des enregistrements **propres** cohérents (NINA valide, sexe/année/mois/
région cohérents), puis injecte une erreur ciblée dans une fraction
``--error-rate`` des lignes (type tiré selon les poids du référentiel). Le CSV de
sortie respecte exactement l'ordre de colonnes attendu par ``ai-models/training``.

Usage :

    python -m dataset_generator.generate --rows 10000 --output ../datasets/nina_synthetic_v1.csv

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from . import catalog as catalog_mod
from . import configure_console
from . import mutators as mut
from . import nina as nina_mod

# Ordre de colonnes EXACT attendu en aval (note : last_name avant first_name).
COLUMNS = [
    "nina",
    "last_name",
    "first_name",
    "birth_date",
    "sex",
    "region_code",
    "birth_region",
    "cercle",
    "commune",
    "village",
    "father_name",
    "mother_name",
    "language",
    "has_error",
    "error_type",
    "error_field",
]


def _clean_record(rng: np.random.Generator, cat: dict) -> dict:
    """Construit un enregistrement propre et cohérent.

    Args:
        rng: Générateur aléatoire.
        cat: Référentiel chargé.

    Returns:
        Un dict avec toutes les colonnes de :data:`COLUMNS` (has_error=False).
    """
    region_codes = list(cat["regions"].keys())
    region = region_codes[int(rng.integers(0, len(region_codes)))]
    triples = cat["geo"][region]
    cercle, commune, village = triples[int(rng.integers(0, len(triples)))]

    sex_digit = int(rng.integers(1, 3))  # 1=M, 2=F
    year = int(rng.integers(cat["birth_year_min"], cat["birth_year_max"] + 1))
    month = int(rng.integers(1, 13))
    day = int(rng.integers(1, 29))

    def pick(key: str) -> str:
        pool = cat[key]
        return pool[int(rng.integers(0, len(pool)))]

    lang = cat["languages"][int(rng.choice(len(cat["languages"]), p=cat["language_weights"]))]

    return {
        "nina": nina_mod.build_nina(sex_digit, year, month, int(region), rng),
        "last_name": pick("last_names"),
        "first_name": pick("first_names"),
        "birth_date": f"{year:04d}-{month:02d}-{day:02d}",
        "sex": "M" if sex_digit == 1 else "F",
        "region_code": region,
        "birth_region": cat["regions"][region],
        "cercle": cercle,
        "commune": commune,
        "village": village,
        "father_name": pick("father_names"),
        "mother_name": pick("mother_names"),
        "language": lang,
        "has_error": False,
        "error_type": "",
        "error_field": "",
    }


def generate(rows: int, error_rate: float, seed: int) -> pd.DataFrame:
    """Génère un DataFrame synthétique de ``rows`` lignes.

    Args:
        rows: Nombre de lignes à produire.
        error_rate: Fraction de lignes contenant une erreur (0..1).
        seed: Graine de reproductibilité.

    Returns:
        Un :class:`pandas.DataFrame` aux colonnes :data:`COLUMNS`.
    """
    rng = np.random.default_rng(seed)
    cat = catalog_mod.load_catalog()

    error_types = list(cat["error_type_weights"].keys())
    weights = np.array(list(cat["error_type_weights"].values()), dtype=float)
    weights = weights / weights.sum()

    records = []
    for _ in range(rows):
        rec = _clean_record(rng, cat)
        if rng.random() < error_rate:
            etype = error_types[int(rng.choice(len(error_types), p=weights))]
            error_field = mut.MUTATORS[etype](rec, rng, cat)
            rec["has_error"] = True
            rec["error_type"] = etype
            rec["error_field"] = error_field
        records.append(rec)

    return pd.DataFrame(records, columns=COLUMNS)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analyse les arguments de la ligne de commande."""
    p = argparse.ArgumentParser(description="Génère un dataset synthétique NINA.")
    p.add_argument("--rows", type=int, default=10000, help="Nombre de lignes (défaut 10000).")
    p.add_argument(
        "--output",
        type=Path,
        default=Path("nina_synthetic_v1.csv"),
        help="Chemin du CSV de sortie.",
    )
    p.add_argument("--error-rate", type=float, default=0.40, help="Fraction de lignes en erreur.")
    p.add_argument("--seed", type=int, default=42, help="Graine de reproductibilité.")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI."""
    configure_console()
    args = parse_args(argv)
    print(f"Génération de {args.rows} lignes (error_rate={args.error_rate}, seed={args.seed})…")
    df = generate(args.rows, args.error_rate, args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)
    n_err = int(df["has_error"].sum())
    print(f"→ {args.output} ({len(df)} lignes, {n_err} en erreur = {n_err / len(df):.1%})")
    print("  types d'erreur :", df[df.has_error]["error_type"].value_counts().to_dict())
    return 0


if __name__ == "__main__":
    sys.exit(main())
