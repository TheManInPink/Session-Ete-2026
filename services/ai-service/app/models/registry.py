"""
registry.py — Registre central des modèles ML/NLP.

Principe directeur : **dégradation gracieuse**. Le service DOIT démarrer et
servir ses endpoints même quand :
    - le modèle XGBoost n'a pas encore été entraîné (`ai-models/trained/` vide) ;
    - spaCy ou son modèle `fr_core_news_md` ne sont pas installés ;
    - les wheels ML (xgboost, spacy) ne sont pas disponibles pour la version de
      Python locale (ex. cp314 en attente).

Dans ces cas, les composants concernés basculent sur des heuristiques (scorer)
ou des fallbacks regex (NER). Le chargement est **paresseux** : aucun modèle
n'est chargé tant qu'un endpoint qui en a besoin n'est pas appelé.

Référence : docs/11-AI-SERVICE-FASTAPI.md §10.5 + ADR-015.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger("nina_aes.ai.registry")


class ModelRegistry:
    """Charge et met en cache les modèles, de façon paresseuse et thread-safe."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._spacy_nlp: Any | None = None
        self._spacy_attempted = False
        self._xgb_bundle: dict[str, Any] | None = None
        self._xgb_attempted = False

    # ─── spaCy ──────────────────────────────────────────────────────
    def get_spacy(self) -> Any | None:
        """Retourne le pipeline spaCy chargé, ou `None` si indisponible.

        Le premier appel tente le chargement ; les suivants renvoient le cache
        (y compris `None` si le chargement a échoué, pour ne pas réessayer en
        boucle).
        """
        if self._spacy_attempted:
            return self._spacy_nlp

        with self._lock:
            if self._spacy_attempted:
                return self._spacy_nlp
            self._spacy_attempted = True
            try:
                import spacy  # pyright: ignore[reportMissingImports]  # optionnel (cf. extras)

                self._spacy_nlp = spacy.load(settings.spacy_model, disable=["lemmatizer", "tagger"])
                logger.info("Modèle spaCy chargé : %s", settings.spacy_model)
            except Exception as exc:  # noqa: BLE001 - on tolère toute défaillance d'import/chargement
                logger.warning(
                    "spaCy indisponible (%s) — bascule sur le NER regex de secours.", exc
                )
                self._spacy_nlp = None
        return self._spacy_nlp

    # ─── XGBoost ────────────────────────────────────────────────────
    def get_xgb_bundle(self) -> dict[str, Any] | None:
        """Retourne le bundle XGBoost (`model`, `feature_names`, `version`…), ou `None`.

        Le bundle est un dict sérialisé via joblib (cf.
        `ai-models/scripts/train_xgboost.py`). En son absence, le scorer
        utilise une heuristique pondérée transparente.
        """
        if self._xgb_attempted:
            return self._xgb_bundle

        with self._lock:
            if self._xgb_attempted:
                return self._xgb_bundle
            self._xgb_attempted = True
            self._xgb_bundle = self._load_xgb()
        return self._xgb_bundle

    def _load_xgb(self) -> dict[str, Any] | None:
        path = Path(settings.xgboost_model_path)
        if not path.exists():
            logger.info("Modèle XGBoost absent (%s) — scoring heuristique activé.", path)
            return None
        try:
            self._verify_sha256(path)
            import joblib  # optionnel mais présent dans requirements

            bundle = joblib.load(path)
            logger.info(
                "Modèle XGBoost chargé : %s (version %s)",
                path.name,
                bundle.get("version", "inconnue"),
            )
            return bundle
        except Exception as exc:  # noqa: BLE001
            logger.warning("Échec du chargement XGBoost (%s) — scoring heuristique.", exc)
            return None

    @staticmethod
    def _verify_sha256(path: Path) -> None:
        """Vérifie le hash du modèle si `AI_MODEL_EXPECTED_SHA256` est défini."""
        expected = settings.model_expected_sha256
        if not expected:
            return
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Hash du modèle incorrect : attendu {expected}, obtenu {actual}")

    # ─── Introspection (pour /health) ───────────────────────────────
    def loaded_models(self) -> dict[str, Any]:
        """Résumé des modèles chargés (sans déclencher de chargement coûteux).

        Note : on ne force PAS le chargement ici pour garder /health rapide ;
        on rapporte l'état courant du cache.
        """
        xgb = self._xgb_bundle
        return {
            "xgboost": {
                "loaded": xgb is not None,
                "version": (xgb or {}).get("version") if xgb else None,
                "path": settings.xgboost_model_path,
            },
            "spacy": {
                "loaded": self._spacy_nlp is not None,
                "model": settings.spacy_model,
            },
        }

    def warmup(self) -> None:
        """Pré-charge les modèles au démarrage (best effort, jamais bloquant)."""
        self.get_xgb_bundle()
        self.get_spacy()


# Instance unique partagée (un registre par processus uvicorn).
registry = ModelRegistry()
