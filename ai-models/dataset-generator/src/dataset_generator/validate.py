"""validate.py — Contrôles qualité du dataset synthétique produit.

Vérifie qu'un CSV généré respecte les invariants et la distribution attendue :
    1. Colonnes présentes.
    2. NINA toujours structurellement valide ; checksum valide SAUF erreur
       `invalid_checksum` ; `region_code == int(nina[5])`.
    3. Distribution des `error_type` conforme au catalogue (±tolérance).
    4. Taux global d'erreurs ≈ `--error-rate`.
    5. Absence de doublons exacts accidentels.
    6. Réalisme des noms : les prénoms/noms PROPRES figurent au catalogue.

CLI : `python -m dataset_generator.validate --csv datasets/v1.csv`
Code de sortie : 0 si tous les contrôles DURS passent, 1 sinon.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass

import pandas as pd

from dataset_generator import nina
from dataset_generator.catalog import Catalog, load_catalog

# Tolérance absolue sur la fréquence conditionnelle de chaque type d'erreur.
_FREQ_TOLERANCE = 0.05
# Tolérance absolue sur le taux global d'erreurs.
_RATE_TOLERANCE = 0.04
# Seuil d'alerte sur les doublons exacts (fraction des lignes).
_DUP_TOLERANCE = 0.01


@dataclass
class Check:
    """Résultat d'un contrôle individuel."""

    name: str
    ok: bool
    hard: bool  # True = bloquant (fait échouer la validation)
    detail: str


def _fold(s: str) -> str:
    """Repli minuscule sans accent (clé de comparaison des noms)."""
    import unicodedata

    nfd = unicodedata.normalize("NFD", str(s).strip().lower())
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def _check_columns(df: pd.DataFrame, required: list[str]) -> Check:
    missing = [c for c in required if c not in df.columns]
    return Check(
        "colonnes", not missing, True, f"manquantes : {missing}" if missing else "OK"
    )


def _check_nina(df: pd.DataFrame) -> list[Check]:
    """Structure, checksum (conditionnel) et cohérence region_code ↔ NINA."""
    bad_struct, bad_checksum, bad_region = 0, 0, 0
    for row in df.itertuples(index=False):
        n = str(row.nina)
        if not nina.is_structurally_valid(n):
            bad_struct += 1
            continue
        checksum_ok = nina.is_checksum_valid(n)
        expect_valid = str(row.error_type) != "invalid_checksum"
        if checksum_ok != expect_valid:
            bad_checksum += 1
        if int(n[5]) != int(row.region_code):
            bad_region += 1
    return [
        Check("nina_structure", bad_struct == 0, True, f"{bad_struct} NINA mal formés"),
        Check(
            "nina_checksum_invariant",
            bad_checksum == 0,
            True,
            f"{bad_checksum} checksums incohérents",
        ),
        Check(
            "region_code_coherent",
            bad_region == 0,
            True,
            f"{bad_region} region_code ≠ chiffre NINA",
        ),
    ]


def _check_distribution(df: pd.DataFrame, catalog: Catalog) -> list[Check]:
    """Compare la fréquence conditionnelle observée au catalogue."""
    errored = df[df["has_error"]]
    n_err = len(errored)
    checks: list[Check] = []
    if n_err == 0:
        return [Check("distribution", False, True, "aucune ligne erronée")]
    expected = {e.name: e.frequency / 100.0 for e in catalog.error_patterns}
    observed = (errored["error_type"].value_counts() / n_err).to_dict()
    for name, exp in expected.items():
        obs = observed.get(name, 0.0)
        ok = abs(obs - exp) <= _FREQ_TOLERANCE
        checks.append(
            Check(f"freq:{name}", ok, False, f"attendu {exp:.0%}, observé {obs:.1%}")
        )
    return checks


def _check_error_rate(df: pd.DataFrame, error_rate: float) -> Check:
    rate = df["has_error"].mean()
    ok = abs(rate - error_rate) <= _RATE_TOLERANCE
    return Check(
        "taux_erreur", ok, False, f"attendu {error_rate:.0%}, observé {rate:.1%}"
    )


def _check_duplicates(df: pd.DataFrame) -> Check:
    """Doublons exacts (toutes colonnes) — devraient être quasi nuls."""
    dups = int(df.duplicated().sum())
    ok = dups <= _DUP_TOLERANCE * len(df)
    return Check("doublons", ok, False, f"{dups} ligne(s) dupliquée(s)")


def _check_name_realism(df: pd.DataFrame, catalog: Catalog) -> Check:
    """Les noms PROPRES (sans erreur de nom) doivent figurer au catalogue."""
    firsts = {_fold(x) for x in catalog.first_names_male + catalog.first_names_female}
    lasts = {_fold(x) for x in catalog.last_names}
    name_errors = {
        "typo_substitution",
        "typo_omission",
        "typo_insertion",
        "phonetic_spelling",
        "field_inversion",
    }
    clean = df[~df["error_type"].isin(name_errors)]
    in_first = clean["first_name"].map(lambda x: _fold(x) in firsts)
    in_last = clean["last_name"].map(lambda x: _fold(x) in lasts)
    rate = float((in_first & in_last).mean()) if len(clean) else 1.0
    return Check(
        "realisme_noms",
        rate >= 0.99,
        False,
        f"{rate:.1%} des noms propres au catalogue",
    )


def validate_csv(
    csv_path: str, error_rate: float = 0.4, catalog: Catalog | None = None
) -> list[Check]:
    """Exécute tous les contrôles et retourne la liste des résultats."""
    from dataset_generator.generate import COLUMNS

    catalog = catalog or load_catalog()
    df = pd.read_csv(csv_path, dtype={"nina": str}, keep_default_na=False)
    checks: list[Check] = [_check_columns(df, COLUMNS)]
    if not checks[0].ok:  # colonnes manquantes → on s'arrête là
        return checks
    df["has_error"] = df["has_error"].map(lambda v: str(v).lower() in ("true", "1"))
    checks += _check_nina(df)
    checks += _check_distribution(df, catalog)
    checks.append(_check_error_rate(df, error_rate))
    checks.append(_check_duplicates(df))
    checks.append(_check_name_realism(df, catalog))
    return checks


def main(argv: list[str] | None = None) -> int:
    """CLI de validation. Retourne 0 (succès) ou 1 (échec dur)."""
    parser = argparse.ArgumentParser(
        prog="dataset_generator.validate",
        description="Valide un dataset synthétique NINA.",
    )
    parser.add_argument("--csv", default="ai-models/datasets/nina_synthetic_v1.csv")
    parser.add_argument("--error-rate", type=float, default=0.4)
    parser.add_argument("--config-dir", default=None)
    args = parser.parse_args(argv)

    catalog = load_catalog(args.config_dir)
    checks = validate_csv(args.csv, args.error_rate, catalog)

    print(f"Validation de {args.csv}\n" + "─" * 60)
    failed_hard = False
    for c in checks:
        icon = "✅" if c.ok else ("❌" if c.hard else "⚠️")
        print(f"  {icon} {c.name:<28} {c.detail}")
        failed_hard = failed_hard or (c.hard and not c.ok)
    print("─" * 60)
    print("RÉSULTAT :", "ÉCHEC" if failed_hard else "OK")
    return 1 if failed_hard else 0


if __name__ == "__main__":
    raise SystemExit(main())
