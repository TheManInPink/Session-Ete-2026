"""export_reference.py — Synchronise `names.yml` → `data/mali/names.json`.

Le catalogue de noms (`config/names.yml`) est la **source unique éditable**. Le
service IA (`services/ai-service/app/services/reference.py`) en a besoin à
l'exécution pour que les features `*_is_common` / la similarité de noms soient
discriminantes — mais le conteneur du service n'embarque pas `ai-models/`.

On exporte donc un artefact JSON dans le répertoire de données du service
(`data/mali/`, à côté de `regions.json` / `cercles.json`). Cet artefact est
**généré, pas édité à la main** ; relancer cette commande après toute mise à
jour de `names.yml`.

CLI : `python -m dataset_generator.export_reference`
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from dataset_generator.catalog import load_catalog

# Racine du monorepo, relative à ce fichier :
#   ai-models/dataset-generator/src/dataset_generator/export_reference.py
#   parents[0]=dataset_generator [1]=src [2]=dataset-generator [3]=ai-models [4]=racine
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT_OUTPUT = _REPO_ROOT / "data" / "mali" / "names.json"


def main(argv: list[str] | None = None) -> None:
    """Exporte les listes de noms du catalogue vers un JSON consommé par le service."""
    parser = argparse.ArgumentParser(
        prog="dataset_generator.export_reference",
        description="Exporte names.yml vers data/mali/names.json (référentiel du service IA).",
    )
    parser.add_argument(
        "-o", "--output", default=str(_DEFAULT_OUTPUT), help="chemin du JSON de sortie"
    )
    parser.add_argument(
        "--config-dir", default=None, help="répertoire des YAML (sinon config/)"
    )
    args = parser.parse_args(argv)

    catalog = load_catalog(args.config_dir)
    payload = {
        "_comment": (
            "Généré depuis ai-models/dataset-generator/config/names.yml via "
            "`python -m dataset_generator.export_reference` — NE PAS éditer à la main. "
            "Noms 100% fictifs/anonymisés."
        ),
        "first_names_male": list(catalog.first_names_male),
        "first_names_female": list(catalog.first_names_female),
        "last_names": list(catalog.last_names),
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    total = sum(
        len(payload[k])
        for k in ("first_names_male", "first_names_female", "last_names")
    )
    print(f"[OK] {total} noms exportés → {out}")


if __name__ == "__main__":
    main()
