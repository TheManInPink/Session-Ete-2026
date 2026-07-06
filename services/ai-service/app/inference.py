"""
Chargement et exécution des modèles IA exportés (étape 4 « Scoring » du pipeline).

Le service charge au démarrage le **bundle** ``xgboost_v1.joblib`` produit par
``ai-models/training`` (cf. son README). Ce bundle contient le modèle XGBoost,
le ``FeatureBuilder`` ajusté et le ``LabelEncoder`` : l'inférence reproduit donc
**exactement** les variables de l'entraînement, sans dupliquer de logique.

⚠️ Dépendance de désérialisation : ``joblib.load`` doit pouvoir importer
``training.features`` / ``training.nina`` (les classes du bundle). En production,
installez le paquet (``pip install -e ai-models/training``). En développement, ce
module ajoute automatiquement ``ai-models/training/src`` au ``sys.path`` en repli.

Le registre est protégé par un verrou pour permettre le rechargement à chaud
(``POST /api/v1/ai/reload-models``) sans interrompre les requêtes en cours.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import hashlib
import sys
import threading
from pathlib import Path
from typing import Any

import joblib

from .config import settings

# Clés minimales attendues dans le bundle joblib (validation à la désérialisation).
_REQUIRED_BUNDLE_KEYS = {"model", "feature_builder", "label_encoder", "classes"}


def _sha256_file(path: Path) -> str:
    """Empreinte SHA-256 d'un fichier (vérification d'intégrité du bundle)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _verify_integrity(path: Path) -> str | None:
    """Vérifie l'empreinte SHA-256 du bundle via son sidecar ``.sha256``.

    Le sidecar (``<bundle>.joblib.sha256``) est produit à l'entraînement. Le
    bundle étant désérialisé (pickle = exécution de code), cette vérification
    détecte toute altération avant le ``joblib.load``.

    Args:
        path: Chemin du bundle ``.joblib``.

    Returns:
        ``None`` si l'intégrité est OK (ou tolérée), sinon un message d'erreur.
    """
    sidecar = path.with_suffix(path.suffix + ".sha256")
    if not sidecar.exists():
        if settings.require_signed_bundle:
            return f"Bundle non signé (sidecar absent : {sidecar.name}) et AI_REQUIRE_SIGNED_BUNDLE=true"
        return None  # toléré en dev (pas de sidecar = pas de vérif)
    expected = sidecar.read_text(encoding="utf-8").split()[0].strip().lower()
    actual = _sha256_file(path).lower()
    if actual != expected:
        return f"Intégrité du bundle invalide (SHA-256 attendu {expected[:12]}…, obtenu {actual[:12]}…)"
    return None


def _ensure_training_importable() -> None:
    """Garantit que le paquet ``training`` est importable (pour désérialiser le bundle).

    Si le paquet n'est pas installé, on ajoute ``ai-models/training/src`` au
    ``sys.path`` (repli développement). Sans cela, ``joblib.load`` lèverait un
    ``ModuleNotFoundError: training.features`` à la reconstruction du FeatureBuilder.
    """
    try:
        import training  # noqa: F401

        return
    except ImportError:
        repo_root = Path(__file__).resolve().parents[3]
        src = repo_root / "ai-models" / "training" / "src"
        if src.is_dir():
            if str(src) not in sys.path:
                sys.path.insert(0, str(src))
        else:
            # Diagnostic explicite du mode d'échec décrit dans le docstring du module.
            print(
                f"[ai-service] ⚠️ Paquet 'training' non importable et {src} introuvable — "
                "le chargement du bundle échouera. Installez ai-models/training "
                "(pip install -e ai-models/training)."
            )


class ModelRegistry:
    """Registre thread-safe des modèles chargés en mémoire."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._bundle: dict[str, Any] | None = None
        self._error: str | None = None

    @property
    def is_loaded(self) -> bool:
        """``True`` si un bundle XGBoost est chargé et exploitable."""
        return self._bundle is not None

    def load(self) -> dict[str, Any]:
        """Charge (ou recharge) le bundle XGBoost depuis le disque.

        Returns:
            Un dictionnaire de statut : ``{"loaded": bool, "error": str | None, ...}``.
        """
        with self._lock:
            path = Path(settings.xgboost_bundle_path)
            if not path.exists():
                self._bundle = None
                self._error = f"Bundle introuvable : {path}"
                return self.status()
            # Vérifie l'intégrité AVANT toute désérialisation (pickle = exécution).
            integrity_error = _verify_integrity(path)
            if integrity_error:
                self._bundle = None
                self._error = integrity_error
                return self.status()
            try:
                _ensure_training_importable()
                bundle = joblib.load(path)
                # Validation de forme : refuse un artefact qui n'a pas la structure
                # attendue (protège predict() d'un KeyError opaque et limite la
                # surface si un fichier non conforme était substitué).
                missing = _REQUIRED_BUNDLE_KEYS - set(bundle)
                if missing:
                    self._bundle = None
                    self._error = f"Bundle invalide — clés manquantes : {sorted(missing)}"
                else:
                    self._bundle = bundle
                    self._error = None
            except Exception as exc:  # noqa: BLE001 — on dégrade sans planter le service
                self._bundle = None
                self._error = f"{type(exc).__name__}: {exc}"
            return self.status()

    def reload(self) -> dict[str, Any]:
        """Recharge le modèle à chaud (alias explicite de :meth:`load`)."""
        return self.load()

    def status(self) -> dict[str, Any]:
        """Résumé léger de l'état du registre (sans exposer les objets modèle)."""
        meta = (self._bundle or {}).get("metadata", {}) if self._bundle else {}
        return {
            "loaded": self.is_loaded,
            "error": self._error,
            "bundle_path": settings.xgboost_bundle_path,
            "model_name": meta.get("model_name"),
            "classes": (self._bundle or {}).get("classes") if self._bundle else None,
            "n_features": meta.get("n_features"),
            "created_at": meta.get("created_at"),
            "metrics_test": meta.get("metrics", {}).get("test", {}) if meta else {},
            "versions": meta.get("versions"),
        }

    def predict(self, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Score un lot d'enregistrements NINA (étape « Scoring » du pipeline).

        Args:
            records: Liste de dicts (champs : ``nina``, ``first_name``, ``last_name``,
                ``birth_date``, ``sex``, ``region_code``, ``birth_region``…).

        Returns:
            Une liste de résultats alignée sur ``records``, chacun contenant le
            type d'erreur prédit, le score P(erreur) et la recommandation.

        Raises:
            RuntimeError: Si aucun modèle n'est chargé.
        """
        with self._lock:
            if not self._bundle:
                raise RuntimeError("Aucun modèle chargé (cf. /api/v1/ai/reload-models).")
            if not records:
                return []
            import pandas as pd  # import local : pandas n'est pas requis au boot

            model = self._bundle["model"]
            builder = self._bundle["feature_builder"]
            classes = list(self._bundle["classes"])

            # transform() est auto-défensif : il crée les colonnes textuelles
            # manquantes. On ne force PAS les colonnes OCR ici — sinon des colonnes
            # vides feraient croire à une confiance OCR « présente » (biais) ; les
            # laisser absentes maintient correctement ocr_available=0.
            df = pd.DataFrame(records)
            features = builder.transform(df)
            proba = model.predict_proba(features)

            none_idx = classes.index("none") if "none" in classes else 0
            results: list[dict[str, Any]] = []
            for i in range(len(df)):
                row = proba[i]
                pred_idx = int(row.argmax())
                pred_label = classes[pred_idx]
                p_error = float(1.0 - row[none_idx])
                score = round(p_error * 100.0, 2)
                if score >= settings.ai_auto_threshold and pred_label != "none":
                    reco = "auto_correct"
                elif score >= settings.ai_review_threshold:
                    reco = "manual_review"
                else:
                    reco = "no_action"
                results.append(
                    {
                        "nina": str(records[i].get("nina", "")),
                        "predicted_error_type": None if pred_label == "none" else pred_label,
                        "confidence": round(float(row[pred_idx]), 4),
                        "error_score": score,
                        "recommendation": reco,
                    }
                )
            return results


# Singleton partagé par l'application FastAPI.
registry = ModelRegistry()
