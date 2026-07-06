"""
Chargement du bundle Isolation Forest SIGAC — intégrité **fail-closed** APPLIQUÉE.

Ce module charge au démarrage le bundle ``isolation_forest_v1.joblib`` produit par
``ai-models/training`` (clés ``{model, scaler, feature_names}``). Il est l'analogue
durci, côté SIGAC, du registre de ``ai-service/app/inference.py`` (AS-BUILT imité).

PRINCIPE DE SÉCURITÉ (correctif revue) — un bundle ``.joblib`` est un **pickle** : le
charger exécute du code. On ne désérialise donc **JAMAIS** un artefact non vérifié.
Lorsque ``SIGAC_REQUIRE_SIGNED_BUNDLE`` est vrai (défaut) :

- on exige un sidecar adjacent ``<bundle>.joblib.sha256`` (même convention que le
  bundle XGBoost) ;
- on recalcule le SHA-256 du bundle et on le compare en **temps constant**
  (``hmac.compare_digest``) à la valeur du sidecar ;
- en cas de sidecar **absent** ou de **non-correspondance**, le chargement est
  **refusé** (``loaded=False`` + message). Le service ne « dégrade » pas vers un mode
  sans modèle silencieux : l'endpoint de scoring renverra alors ``503`` (cf. main.py).

> ⚠️ Le bundle reste un pickle : le sidecar garantit l'**intégrité** (non-altération),
> pas la provenance. La signature/horodatage et un format sûr (``skops``) sont la
> cible Phase 2 ; ici la défense est : refus fail-closed + bundle versionné en dépôt.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import hashlib
import hmac
import threading
from pathlib import Path
from typing import Any

from .config import settings

# Clés minimales attendues dans le bundle Isolation Forest (validation à la
# désérialisation — refuse un artefact substitué qui n'aurait pas cette forme).
_REQUIRED_BUNDLE_KEYS = {"model", "scaler", "feature_names"}


def _sha256_file(path: Path) -> str:
    """Calcule l'empreinte SHA-256 hexadécimale d'un fichier (lecture par blocs).

    Args:
        path: chemin du fichier à empreindre.

    Returns:
        L'empreinte SHA-256 hexadécimale (minuscules).
    """
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_integrity(path: Path) -> str | None:
    """Vérifie l'intégrité d'un bundle ``.joblib`` via son sidecar ``.sha256`` (fail-closed).

    Appliquée **AVANT** toute désérialisation (pickle = exécution de code). Le sidecar
    ``<bundle>.joblib.sha256`` est produit à l'export (même convention que le bundle
    XGBoost : ``<digest>␠␠<nom>``). La comparaison est en **temps constant** pour ne
    pas fuiter d'information par le timing.

    Args:
        path: chemin du bundle ``.joblib``.

    Returns:
        ``None`` si l'intégrité est vérifiée (ou tolérée hors mode signé), sinon un
        message d'erreur explicite (sidecar absent ou empreinte divergente).
    """
    sidecar = path.with_suffix(path.suffix + ".sha256")
    if not sidecar.exists():
        if settings.require_signed_bundle:
            return (
                f"Bundle non signé (sidecar absent : {sidecar.name}) "
                "et SIGAC_REQUIRE_SIGNED_BUNDLE=true — chargement refusé (fail-closed)."
            )
        return None  # toléré seulement si require_signed_bundle=False (dev explicite)
    expected = sidecar.read_text(encoding="utf-8").split()[0].strip().lower()
    actual = _sha256_file(path).lower()
    # Comparaison en temps constant (hmac.compare_digest) — pas d'égalité naïve.
    if not hmac.compare_digest(expected, actual):
        return (
            f"Intégrité du bundle invalide (SHA-256 attendu {expected[:12]}…, "
            f"obtenu {actual[:12]}…) — chargement refusé (fail-closed)."
        )
    return None


class AnomalyModelRegistry:
    """Registre thread-safe du modèle Isolation Forest (chargement à chaud possible).

    GARANTIE : ``load()`` ne stocke un bundle que si (1) l'intégrité fail-closed est
    vérifiée ET (2) la forme du bundle est valide. Sinon ``loaded`` reste ``False`` et
    ``error`` porte la cause — l'endpoint de scoring renvoie alors ``503`` plutôt que
    de scorer avec un modèle absent ou non vérifié.
    """

    def __init__(self) -> None:
        """Initialise un registre vide (aucun modèle chargé)."""
        self._lock = threading.RLock()
        self._bundle: dict[str, Any] | None = None
        self._error: str | None = None

    @property
    def is_loaded(self) -> bool:
        """Indique si un bundle Isolation Forest vérifié est chargé et exploitable."""
        return self._bundle is not None

    def load(self) -> dict[str, Any]:
        """Charge (ou recharge) le bundle Isolation Forest depuis le disque, fail-closed.

        Ordre strict : existence → intégrité (sidecar) → désérialisation → validation
        de forme. Toute étape qui échoue laisse le registre **vide** (pas de modèle
        partiellement chargé) et renseigne ``error``.

        Returns:
            Le dictionnaire de statut (cf. :meth:`status`).
        """
        with self._lock:
            path = Path(settings.isolation_forest_path)
            if not path.exists():
                self._bundle = None
                self._error = f"Bundle introuvable : {path}"
                return self.status()
            # Intégrité AVANT désérialisation (pickle = exécution de code).
            integrity_error = verify_integrity(path)
            if integrity_error:
                self._bundle = None
                self._error = integrity_error
                return self.status()
            try:
                import joblib  # import local : non requis tant qu'on ne charge pas

                bundle = joblib.load(path)
                missing = _REQUIRED_BUNDLE_KEYS - set(bundle)
                if missing:
                    self._bundle = None
                    self._error = f"Bundle invalide — clés manquantes : {sorted(missing)}"
                else:
                    self._bundle = bundle
                    self._error = None
            except Exception as exc:  # noqa: BLE001 — on dégrade proprement (pas de crash)
                self._bundle = None
                self._error = f"{type(exc).__name__}: {exc}"
            return self.status()

    def reload(self) -> dict[str, Any]:
        """Recharge le modèle à chaud (alias explicite de :meth:`load`)."""
        return self.load()

    def status(self) -> dict[str, Any]:
        """Retourne un résumé léger de l'état du registre (sans exposer l'objet modèle).

        Returns:
            Un dict ``{loaded, error, bundle_path, feature_names, n_features}``.
        """
        feature_names = (self._bundle or {}).get("feature_names") if self._bundle else None
        return {
            "loaded": self.is_loaded,
            "error": self._error,
            "bundle_path": settings.isolation_forest_path,
            "feature_names": list(feature_names) if feature_names else None,
            "n_features": len(feature_names) if feature_names else None,
        }

    def anomaly_scores(self, feature_rows: list[list[float]]) -> list[float]:
        """Calcule l'``anomaly_score`` 0-100 (100 = très anormal) d'un lot d'agents.

        POURQUOI cette échelle : le sous-modèle Isolation Forest renvoie un score brut
        où **plus c'est négatif, plus c'est anormal** (``decision_function``). On le
        convertit en ``anomaly_score`` 0-100 (100 = très anormal), conformément à la
        convention doc 23 §4.2 (``factorAnomaly = 100 − anomaly_score`` côté scoring).

        Args:
            feature_rows: lignes de features (mêmes colonnes/ordre que
                ``feature_names`` du bundle), une par agent.

        Returns:
            La liste des ``anomaly_score`` (float 0-100) alignée sur ``feature_rows``.

        Raises:
            RuntimeError: si aucun modèle vérifié n'est chargé.
        """
        with self._lock:
            if not self._bundle:
                raise RuntimeError("Aucun modèle Isolation Forest chargé/vérifié.")
            if not feature_rows:
                return []
            model = self._bundle["model"]
            scaler = self._bundle["scaler"]
            features = scaler.transform(feature_rows)
            # decision_function : >0 = normal, <0 = anormal. On mappe vers 0-100.
            raw = model.decision_function(features)
            return [round(float(50.0 - 50.0 * float(d)), 2) for d in raw]


# Singleton partagé par l'application FastAPI (en prod : table/queue Prisma).
registry = AnomalyModelRegistry()
