"""catalog.py — Chargement des référentiels YAML (noms, lieux, erreurs).

Résout le répertoire `config/` (par défaut relatif au package, sinon via
`--config-dir` ou la variable d'environnement `NINA_DATASET_CONFIG_DIR`), lit
`names.yml` + `error-patterns.yml`, et expose un objet :class:`Catalog`
immuable consommé par le générateur.

Les constantes géographiques (région RAVEC, langues plausibles) sont un MIROIR
de `services/ai-service/app/services/reference.py` : on les indexe par chiffre
région (entier) pour rester insensible aux accents.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

# Répertoire config par défaut : <package>/../../config (layout « src »).
#   src/dataset_generator/catalog.py → parents[2] = dataset-generator/
_DEFAULT_CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"

# ─── Référentiel géographique (miroir de reference.py) ──────────────
# RAVEC : chiffre région du NINA → nom de région historique.
RAVEC_REGION_BY_DIGIT: dict[int, str] = {
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

# Langues nationales plausibles par chiffre région (le français partout).
# fr=français bm=bambara snk=soninké ff=peul tmq=tamasheq dje=songhaï.
LANGUAGES_BY_REGION_CODE: dict[int, list[str]] = {
    1: ["fr", "snk", "bm", "ff"],
    2: ["fr", "bm"],
    3: ["fr", "bm", "ff"],
    4: ["fr", "bm"],
    5: ["fr", "ff", "bm", "dje"],
    6: ["fr", "tmq", "dje", "ff"],
    7: ["fr", "dje", "tmq"],
    8: ["fr", "tmq"],
    9: ["fr", "bm"],
}


def languages_for(region_code: int) -> list[str]:
    """Retourne les langues plausibles d'une région (repli : français)."""
    return LANGUAGES_BY_REGION_CODE.get(region_code, ["fr"])


# ─── Structures de données ──────────────────────────────────────────
@dataclass(frozen=True)
class Village:
    """Village fictif rattaché à une région administrative RAVEC."""

    name: str
    region_code: int
    region: str
    cercle: str
    commune: str


@dataclass(frozen=True)
class ErrorPattern:
    """Un type d'erreur du catalogue (`error-patterns.yml`)."""

    name: str
    frequency: float
    fields: tuple[str, ...]
    description: str
    severity: str = "medium"


@dataclass(frozen=True)
class Catalog:
    """Catalogue complet : noms, villages, patterns d'erreurs."""

    first_names_male: tuple[str, ...]
    first_names_female: tuple[str, ...]
    last_names: tuple[str, ...]
    villages: tuple[Village, ...]
    error_patterns: tuple[ErrorPattern, ...]

    def error_names(self) -> list[str]:
        """Liste ordonnée des noms de types d'erreurs."""
        return [e.name for e in self.error_patterns]

    def error_weights(self) -> list[float]:
        """Liste ordonnée des fréquences (poids du tirage pondéré)."""
        return [e.frequency for e in self.error_patterns]


def _read_yaml(path: Path) -> dict:
    """Lit un fichier YAML en levant une erreur explicite s'il est absent."""
    if not path.exists():
        raise FileNotFoundError(
            f"Référentiel introuvable : {path}\n"
            "→ Vérifiez le répertoire config/ ou utilisez --config-dir / "
            "la variable NINA_DATASET_CONFIG_DIR."
        )
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


@lru_cache(maxsize=4)
def _load_cached(config_dir: str) -> Catalog:
    """Charge et met en cache le catalogue pour un répertoire config donné."""
    base = Path(config_dir)
    names = _read_yaml(base / "names.yml")
    patterns = _read_yaml(base / "error-patterns.yml")

    male = tuple(names.get("first_names_male", []))
    female = tuple(names.get("first_names_female", []))
    last = tuple(names.get("last_names", []))
    villages = tuple(
        Village(
            name=v["name"],
            region_code=int(v["region_code"]),
            region=v["region"],
            cercle=v.get("cercle", ""),
            commune=v.get("commune", ""),
        )
        for v in names.get("villages", [])
    )
    errors = tuple(
        ErrorPattern(
            name=e["name"],
            frequency=float(e["frequency"]),
            fields=tuple(e.get("fields", [])),
            description=e.get("description", ""),
            severity=e.get("severity", "medium"),
        )
        for e in patterns.get("error_types", [])
    )

    # Garde-fous : un catalogue vide casserait silencieusement la génération.
    if not (male and female and last and villages and errors):
        raise ValueError(
            "Catalogue incomplet : vérifiez first_names_male/female, last_names, "
            "villages (names.yml) et error_types (error-patterns.yml)."
        )
    return Catalog(male, female, last, villages, errors)


def load_catalog(config_dir: str | os.PathLike[str] | None = None) -> Catalog:
    """Charge le catalogue depuis `config_dir` (priorité : argument > env > défaut).

    Args:
        config_dir: répertoire des YAML. Si `None`, on lit
            `NINA_DATASET_CONFIG_DIR` puis le répertoire par défaut du package.

    Returns:
        Le :class:`Catalog` (mémoïsé par chemin résolu).
    """
    base = (
        Path(config_dir)
        if config_dir
        else Path(os.environ.get("NINA_DATASET_CONFIG_DIR", _DEFAULT_CONFIG_DIR))
    )
    return _load_cached(str(base.resolve()))
