"""
Validation d'invariants sur un dataset NINA généré.

Vérifie que la sortie respecte les invariants attendus par ``ai-models/training`` :
colonnes présentes, lignes propres réellement cohérentes (NINA valide, chiffre
région == ``region_code``, sexe cohérent, date ISO), et lignes ``invalid_checksum``
réellement invalides. Utilisé par les tests et comme CLI de contrôle.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

from . import configure_console
from . import nina as nina_mod
from .generate import COLUMNS


def validate_frame(df: pd.DataFrame) -> list[str]:
    """Retourne la liste des problèmes détectés (liste vide = dataset conforme).

    Args:
        df: DataFrame à valider.

    Returns:
        Liste de messages de problème (vide si tout est conforme).
    """
    problems: list[str] = []

    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        problems.append(f"Colonnes manquantes : {missing}")
        return problems  # inutile d'aller plus loin

    clean = df[~df["has_error"].astype(bool)]
    bad_checksum = clean[~clean["nina"].map(nina_mod.validate_nina)]
    if len(bad_checksum):
        problems.append(f"{len(bad_checksum)} ligne(s) propre(s) avec NINA invalide.")

    region_digit = clean["nina"].str[5]
    if not (region_digit == clean["region_code"].astype(str)).all():
        problems.append("Chiffre région du NINA ≠ region_code sur des lignes propres.")

    sex_digit = clean["nina"].str[0]
    sex_ok = ((sex_digit == "1") & (clean["sex"] == "M")) | (
        (sex_digit == "2") & (clean["sex"] == "F")
    )
    if not sex_ok.all():
        problems.append("Sexe NINA ≠ champ sexe sur des lignes propres.")

    iso_ok = clean["birth_date"].str.match(r"^\d{4}-\d{2}-\d{2}$")
    if not iso_ok.all():
        problems.append("Date de naissance non ISO sur des lignes propres.")

    # Les lignes invalid_checksum doivent réellement échouer la validation.
    ic = df[df["error_type"] == "invalid_checksum"]
    if len(ic) and ic["nina"].map(nina_mod.validate_nina).any():
        problems.append("Des lignes invalid_checksum ont pourtant un NINA valide.")

    return problems


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI : valide un CSV et retourne 0 (OK) ou 1 (problèmes)."""
    configure_console()
    parser = argparse.ArgumentParser(description="Valide un dataset NINA généré.")
    parser.add_argument("csv", type=Path, help="Chemin du CSV à valider.")
    args = parser.parse_args(argv)

    df = pd.read_csv(args.csv, dtype=str, keep_default_na=False)
    df["has_error"] = df["has_error"].str.lower().isin({"true", "1", "yes"})
    problems = validate_frame(df)
    if problems:
        print(f"❌ {len(problems)} problème(s) :")
        for p in problems:
            print(f"   - {p}")
        return 1
    print(f"✅ Dataset conforme ({len(df)} lignes).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
