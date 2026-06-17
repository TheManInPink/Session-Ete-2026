"""
Chargement du référentiel synthétique embarqué (``catalog.json``).

Le référentiel contient : la table région (code → nom, codes NINA hérités 1-9),
une hiérarchie géographique (cercle / commune / village par région), des pools de
noms (prénoms, noms, parents), les langues pondérées, la plage d'années de
naissance, le taux d'erreur cible et les poids des types d'erreur. Il a été
amorcé depuis le premier dataset produit, puis figé comme donnée du paquet.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

# Le référentiel est embarqué à côté de ce module (cf. package-data pyproject).
CATALOG_PATH = Path(__file__).with_name("catalog.json")


@lru_cache(maxsize=1)
def load_catalog() -> dict:
    """Charge (et met en cache) le référentiel ``catalog.json``.

    Returns:
        Le dictionnaire de référentiel.

    Raises:
        FileNotFoundError: Si ``catalog.json`` est introuvable.
    """
    if not CATALOG_PATH.exists():
        raise FileNotFoundError(f"Référentiel introuvable : {CATALOG_PATH}")
    with open(CATALOG_PATH, encoding="utf-8") as fh:
        return json.load(fh)
