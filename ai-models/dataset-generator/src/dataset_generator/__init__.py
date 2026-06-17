"""
Générateur de dataset synthétique NINA pour l'entraînement du module IA.

⚠️ RECONSTRUCTION : la source d'origine de ce paquet a été perdue (troncature à
0 octet lors d'une saturation disque ENOSPC ; il ne restait que le bytecode
``__pycache__``). Ce code a été **ré-écrit fidèlement** à partir du schéma et des
distributions du premier dataset produit (``nina_synthetic_v1.csv``) :
référentiel embarqué dans :mod:`dataset_generator.catalog` (``catalog.json``),
construction de NINA valides dans :mod:`dataset_generator.nina`, injection
d'erreurs ciblées dans :mod:`dataset_generator.mutators`, orchestration et CLI
dans :mod:`dataset_generator.generate`.

Le dataset produit est **compatible** avec ``ai-models/training`` (mêmes colonnes,
même vocabulaire d'``error_type``).

Usage :

    pip install -e .
    python -m dataset_generator.generate --rows 10000 --output ../datasets/nina_synthetic_v1.csv

Souveraineté : 100 % synthétique, aucune donnée réelle de citoyen.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import sys

__version__ = "1.0.0"


def configure_console() -> None:
    """Force la sortie console en UTF-8 (évite ``UnicodeEncodeError`` sous Windows cp1252).

    Les CLI impriment des caractères non-cp1252 (``→``, ``✅``, ``❌``). Appelée au
    début de chaque ``main()``. ``errors="replace"`` couvre les terminaux exotiques.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 — best effort, ne doit jamais bloquer
            pass


__all__ = ["__version__", "configure_console"]
