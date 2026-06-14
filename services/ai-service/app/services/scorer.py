"""
scorer.py — Étape ④ du pipeline : scoring agrégé.

Produit un **score de confiance 0-100** (plus haut = moins de risque d'erreur)
et un verdict (HIGH / MEDIUM / LOW). Deux modes :

    1. **Modèle XGBoost** (si entraîné et chargé) — `prob_error → score`.
    2. **Heuristique pondérée** (défaut) — transparente, sans dépendance ML :
       on part de 100 et on retranche une pénalité par anomalie, pondérée par
       sa gravité et sa confiance.

La bascule est automatique : tant qu'aucun modèle n'est présent dans
`ai-models/trained/`, l'heuristique fait foi. Cela rend le service fonctionnel
« out of the box » pour l'étudiant, avant tout entraînement.

Référence : docs/11-AI-SERVICE-FASTAPI.md §5 (étape ④) + §8.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.models.registry import registry
from app.schemas.common import Severity, Verdict
from app.schemas.detect_errors import DetectedError
from app.services.features import FEATURE_NAMES, extract_features
from app.services.normalizer import NormalizedRecord

logger = logging.getLogger("nina_aes.ai.scorer")

# Pénalités heuristiques (points retranchés à 100), par gravité.
_SEVERITY_PENALTY = {
    Severity.CRITICAL: 45.0,
    Severity.HIGH: 25.0,
    Severity.MEDIUM: 12.0,
    Severity.LOW: 4.0,
}

# Ordre des features attendu par le modèle — défini une seule fois dans
# app/services/features.py (partagé avec ai-models/scripts/train_xgboost.py).
_MODEL_FEATURE_ORDER = FEATURE_NAMES


def _verdict_for(score: float) -> Verdict:
    """Mappe un score 0-100 vers un verdict, selon les seuils de configuration."""
    if score >= settings.ai_auto_threshold:
        return Verdict.HIGH_CONFIDENCE
    if score >= settings.ai_review_threshold:
        return Verdict.MEDIUM_CONFIDENCE
    return Verdict.LOW_CONFIDENCE


def _heuristic_score(errors: list[DetectedError]) -> float:
    """Calcule un score 0-100 par soustraction de pénalités pondérées."""
    score = 100.0
    for err in errors:
        penalty = _SEVERITY_PENALTY.get(err.severity, 5.0) * max(err.confidence, 0.1)
        score -= penalty
    return round(max(0.0, min(100.0, score)), 1)


def _model_features(record: NormalizedRecord) -> list[float]:
    """Construit le vecteur de features attendu par le modèle XGBoost.

    Délègue à l'extracteur partagé (source de vérité unique) pour garantir la
    parité avec l'entraînement.
    """
    feats = extract_features(
        nina=record.nina,
        first_name=record.first_name,
        last_name=record.last_name,
        birth_date=record.birth_date or record.birth_date_raw,
        sex=record.sex,
        birth_region=record.birth_region,
        father_name=record.father,
        mother_name=record.mother,
    )
    return [feats[name] for name in FEATURE_NAMES]


def compute_score(
    record: NormalizedRecord, errors: list[DetectedError]
) -> tuple[float, Verdict, str]:
    """Calcule le score global et le verdict d'un enregistrement.

    Args:
        record: enregistrement normalisé.
        errors: anomalies détectées à l'étape ③.

    Returns:
        Tuple ``(score, verdict, model_version)``.
    """
    # Modèle opt-in (AI_USE_MODEL) : par défaut on reste sur l'heuristique
    # explicable. Cf. config.ai_use_model.
    bundle = registry.get_xgb_bundle() if settings.ai_use_model else None
    if bundle is not None:
        # Garde-fou : l'ordre des features du bundle DOIT correspondre à celui
        # attendu ici, sinon le modèle recevrait un vecteur permuté (probabilités
        # erronées, silencieuses) → on retombe sur l'heuristique.
        if bundle.get("feature_names") not in (None, _MODEL_FEATURE_ORDER):
            logger.warning("feature_names du modèle != ordre attendu — scoring heuristique.")
            bundle = None
    if bundle is not None:
        try:
            model = bundle["model"]
            features = [_model_features(record)]
            prob_error = float(model.predict_proba(features)[0][1])
            score = round((1.0 - prob_error) * 100.0, 1)
            # On combine avec l'heuristique : une anomalie critique certaine doit
            # tirer le score vers le bas même si le modèle est optimiste.
            score = min(score, _heuristic_score(errors))
            return score, _verdict_for(score), str(bundle.get("version", "xgboost"))
        except Exception as exc:  # noqa: BLE001 - tout échec modèle → heuristique
            logger.warning("Scoring XGBoost échoué (%s) — bascule heuristique.", exc)

    score = _heuristic_score(errors)
    return score, _verdict_for(score), "heuristic-v1"
