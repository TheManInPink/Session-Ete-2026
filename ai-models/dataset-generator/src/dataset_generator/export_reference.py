"""
Export du référentiel géographique en JSON (régions + hiérarchie cercle/commune/village).

Utile pour partager le référentiel hérité (codes NINA 1-9) avec d'autres
composants ou pour inspection, sans dépendre du paquet Python.

Usage :

    python -m dataset_generator.export_reference --output ../datasets/reference_geo.json

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import catalog as catalog_mod
from . import configure_console


def build_reference() -> dict:
    """Construit la structure de référentiel géographique exportable.

    Returns:
        ``{"regions": {code: name}, "hierarchy": {code: [[cercle, commune, village], ...]}}``.
    """
    cat = catalog_mod.load_catalog()
    return {
        "metadata": {
            "title": "Référentiel géographique NINA (codes hérités 1-9)",
            "note": "Synthétique — usage entraînement IA uniquement.",
        },
        "regions": cat["regions"],
        "hierarchy": cat["geo"],
    }


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI : écrit le référentiel JSON."""
    configure_console()
    parser = argparse.ArgumentParser(description="Exporte le référentiel géographique NINA.")
    parser.add_argument(
        "--output", type=Path, default=Path("reference_geo.json"), help="Chemin JSON de sortie."
    )
    args = parser.parse_args(argv)

    reference = build_reference()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(reference, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"→ {args.output} ({len(reference['regions'])} régions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
