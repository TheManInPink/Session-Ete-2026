"""dataset_generator — Pipeline de génération du dataset synthétique NINA.

Package 100 % autonome : il **n'importe rien** du service FastAPI. La logique
NINA (lettre de contrôle, structure) est ré-implémentée à l'identique dans
:mod:`dataset_generator.nina` (voir la note de parité dans ce module — un test
fige un vecteur connu pour garantir l'absence de dérive).

Modules :
    - :mod:`dataset_generator.nina`      — construction / contrôle des NINA.
    - :mod:`dataset_generator.catalog`   — chargement des référentiels YAML.
    - :mod:`dataset_generator.mutators`  — mutations bas niveau (fautes réalistes).
    - :mod:`dataset_generator.generate`  — génération du dataset + CLI.
    - :mod:`dataset_generator.validate`  — contrôles qualité du CSV produit.
"""

from __future__ import annotations

__version__ = "1.0.0"
__all__ = ["__version__"]
