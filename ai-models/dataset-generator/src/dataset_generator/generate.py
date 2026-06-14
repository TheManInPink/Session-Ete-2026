"""generate.py — Génération du dataset synthétique NINA (cœur du pipeline).

Expose :
    - :func:`generate_clean_record`  — un citoyen fictif SANS erreur (cohérent).
    - :func:`inject_error`           — applique une erreur du catalogue.
    - :func:`generate_dataset`       — produit un `DataFrame` étiqueté.
    - :func:`main`                   — CLI `python -m dataset_generator.generate`.

Colonnes de sortie (:data:`COLUMNS`) : sur-ensemble COMPATIBLE avec le trainer
XGBoost existant (`ai-models/scripts/train_xgboost.py`, qui lit nina, first_name,
last_name, birth_date, sex, birth_region, father_name, mother_name, has_error).
On ajoute les étiquettes fines `region_code`, `error_type`, `error_field` ainsi
que `cercle`, `commune`, `village`, `language`.

Invariants garantis sur chaque ligne :
    - le NINA est toujours structurellement valide ;
    - `region_code == int(nina[5])` (le code région de la colonne = celui du NINA) ;
    - le checksum est valide SAUF si `error_type == "invalid_checksum"`.
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import pandas as pd
from faker import Faker

from dataset_generator import mutators, nina
from dataset_generator.catalog import (
    RAVEC_REGION_BY_DIGIT,
    Catalog,
    languages_for,
    load_catalog,
)

# Ordre canonique des colonnes du CSV.
COLUMNS: list[str] = [
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

# Familles d'erreurs visant un champ « nom » (choix aléatoire prénom/nom).
_TYPO_OPS = {
    "typo_substitution": mutators.substitute,
    "typo_omission": mutators.omit,
    "typo_insertion": mutators.insert,
    "phonetic_spelling": mutators.phonetic,
}

_DEFAULT_SEED = 42
_MIN_AGE, _MAX_AGE = 5, 95
_FAKER = Faker("fr_FR")  # dates de naissance fictives localisées


def _full_name(
    first_pool: tuple[str, ...], last_pool: tuple[str, ...], rng: random.Random
) -> str:
    """Compose un « Prénom Nom » fictif pour la filiation (père/mère)."""
    return f"{rng.choice(first_pool)} {rng.choice(last_pool)}"


def generate_clean_record(
    catalog: Catalog | None = None, rng: random.Random | None = None
) -> dict:
    """Génère un enregistrement citoyen fictif SANS erreur (champs cohérents).

    Le NINA, le sexe, la région et la langue sont mutuellement cohérents.

    Args:
        catalog: catalogue chargé (par défaut : :func:`load_catalog`).
        rng: générateur aléatoire (par défaut : module `random`, non déterministe).

    Returns:
        Dictionnaire d'une ligne (clés = :data:`COLUMNS`), `has_error=False`.
    """
    catalog = catalog or load_catalog()
    rng = rng or random
    sex = rng.choice(["M", "F"])
    first_pool = catalog.first_names_male if sex == "M" else catalog.first_names_female
    village = rng.choice(catalog.villages)
    birth = _FAKER.date_of_birth(minimum_age=_MIN_AGE, maximum_age=_MAX_AGE)
    record_nina = nina.build_nina(
        year=birth.year,
        month=birth.month,
        sex=sex,
        region_code=village.region_code,
        rng=rng,
    )
    return {
        "nina": record_nina,
        "last_name": rng.choice(catalog.last_names),
        "first_name": rng.choice(first_pool),
        "birth_date": birth.isoformat(),
        "sex": sex,
        "region_code": village.region_code,
        # Nom canonique RAVEC (accentué) : garantit la cohérence avec le NINA.
        "birth_region": RAVEC_REGION_BY_DIGIT[village.region_code],
        "cercle": village.cercle,
        "commune": village.commune,
        "village": village.name,
        "father_name": _full_name(catalog.first_names_male, catalog.last_names, rng),
        "mother_name": _full_name(catalog.first_names_female, catalog.last_names, rng),
        "language": rng.choice(languages_for(village.region_code)),
        "has_error": False,
        "error_type": "",
        "error_field": "",
    }


def _pick_other_region_village(catalog: Catalog, region_code: int, rng: random.Random):
    """Choisit un village d'une AUTRE région que `region_code`."""
    others = [v for v in catalog.villages if v.region_code != region_code]
    return rng.choice(others) if others else rng.choice(catalog.villages)


def inject_error(
    record: dict,
    error_type: str,
    catalog: Catalog | None = None,
    rng: random.Random | None = None,
) -> dict:
    """Applique une erreur du catalogue à une COPIE de `record`.

    Args:
        record: enregistrement propre (issu de :func:`generate_clean_record`).
        error_type: nom d'un type d'erreur (`error-patterns.yml`).
        catalog: catalogue (requis pour `geographic_mismatch`).
        rng: générateur aléatoire.

    Returns:
        Nouveau dictionnaire muté (`has_error=True`, `error_type`, `error_field`).

    Raises:
        ValueError: si `error_type` est inconnu.
    """
    catalog = catalog or load_catalog()
    rng = rng or random
    rec = dict(record)

    if error_type in _TYPO_OPS:
        field = rng.choice(["first_name", "last_name"])
        rec[field] = _TYPO_OPS[error_type](rec[field], rng)
        rec["error_field"] = field
    elif error_type == "field_inversion":
        rec["first_name"], rec["last_name"] = rec["last_name"], rec["first_name"]
        rec["error_field"] = "first_name,last_name"
    elif error_type == "geographic_mismatch":
        # On laisse le NINA (et region_code) intacts, mais on déclare une
        # naissance dans une autre région → incohérence NINA ↔ lieu déclaré.
        other = _pick_other_region_village(catalog, rec["region_code"], rng)
        rec["birth_region"] = RAVEC_REGION_BY_DIGIT[other.region_code]
        rec["village"] = other.name
        rec["cercle"] = other.cercle
        rec["commune"] = other.commune
        rec["error_field"] = "birth_region"
    elif error_type == "date_format_error":
        rec["birth_date"] = mutators.swap_date_format(rec["birth_date"])
        rec["error_field"] = "birth_date"
    elif error_type == "invalid_checksum":
        rec["nina"] = nina.corrupt_control_letter(rec["nina"], rng)
        rec["error_field"] = "nina"
    else:
        raise ValueError(f"Type d'erreur inconnu : {error_type}")

    rec["has_error"] = True
    rec["error_type"] = error_type
    return rec


def generate_dataset(
    n: int = 10_000,
    error_rate: float = 0.4,
    *,
    seed: int = _DEFAULT_SEED,
    catalog: Catalog | None = None,
) -> pd.DataFrame:
    """Produit `n` enregistrements étiquetés (~`error_rate` portant une erreur).

    Args:
        n: nombre de lignes.
        error_rate: probabilité qu'une ligne porte une erreur (0-1).
        seed: graine (rng + Faker) pour une génération reproductible.
        catalog: catalogue (par défaut : chargé depuis config/).

    Returns:
        `DataFrame` aux colonnes :data:`COLUMNS`.
    """
    catalog = catalog or load_catalog()
    rng = random.Random(seed)
    _FAKER.seed_instance(seed)
    names = catalog.error_names()
    weights = catalog.error_weights()

    rows = []
    for _ in range(n):
        rec = generate_clean_record(catalog, rng)
        if rng.random() < error_rate:
            error_type = rng.choices(names, weights=weights, k=1)[0]
            rec = inject_error(rec, error_type, catalog, rng)
        rows.append(rec)
    return pd.DataFrame(rows, columns=COLUMNS)


def _print_summary(df: pd.DataFrame, out: Path) -> None:
    """Affiche un résumé lisible (volumes + distribution des erreurs)."""
    n = len(df)
    n_err = int(df["has_error"].sum())
    print(f"[OK] {n} enregistrements générés → {out}")
    print(f"     erronés : {n_err} ({n_err / n:.1%}) · propres : {n - n_err}")
    dist = df.loc[df["has_error"], "error_type"].value_counts()
    if not dist.empty:
        print("     distribution des erreurs (conditionnelle) :")
        for etype, count in dist.items():
            print(f"       - {etype:<20} {count:>6}  ({count / n_err:.1%})")


def main(argv: list[str] | None = None) -> None:
    """Point d'entrée CLI : génère le CSV et écrit un résumé sur stdout."""
    parser = argparse.ArgumentParser(
        prog="dataset_generator.generate",
        description="Génère un dataset synthétique NINA (100% fictif).",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="ai-models/datasets/nina_synthetic_v1.csv",
        help="chemin du CSV de sortie",
    )
    parser.add_argument(
        "-n", "--n", type=int, default=10_000, help="nombre d'enregistrements"
    )
    parser.add_argument(
        "--error-rate",
        type=float,
        default=0.4,
        help="proportion d'enregistrements erronés (0-1)",
    )
    parser.add_argument(
        "--seed", type=int, default=_DEFAULT_SEED, help="graine aléatoire"
    )
    parser.add_argument(
        "--config-dir", default=None, help="répertoire des YAML (sinon config/)"
    )
    args = parser.parse_args(argv)

    catalog = load_catalog(args.config_dir)
    df = generate_dataset(args.n, args.error_rate, seed=args.seed, catalog=catalog)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8")
    _print_summary(df, out)


if __name__ == "__main__":
    main()
