"""
anomaly.py — Scoring comportemental d'un agent (détection de fraude).

Utilise un **Isolation Forest** (scikit-learn) entraîné sur une distribution
synthétique d'« agents normaux ». Un agent dont le comportement s'écarte
fortement de cette norme (trop d'opérations, traitements trop rapides,
corrections sans pièce, actions nocturnes, concentration sur un seul village)
obtient un score d'anomalie élevé.

Dégradation gracieuse : si scikit-learn est indisponible, on bascule sur un
score heuristique basé sur les z-scores par indicateur.

Ce service alimente le SIGAC (Bloc D) — docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md.
"""

from __future__ import annotations

import logging
import math
import threading

from app.schemas.anomaly import (
    AnomalyScoreRequest,
    AnomalyScoreResponse,
    ContributingFactor,
)

logger = logging.getLogger("nina_aes.ai.anomaly")

# Ordre canonique des indicateurs.
_FEATURES = (
    "operations_today",
    "avg_processing_time",
    "corrections_no_doc",
    "after_hours_actions",
    "same_village_ratio",
)

# Profil de l'agent « normal » (moyenne, écart-type) pour générer la base
# synthétique et calculer les z-scores. Valeurs plausibles pour un guichet
# d'état civil malien.
_BASELINE = {
    "operations_today": (80.0, 25.0),
    "avg_processing_time": (45.0, 15.0),
    "corrections_no_doc": (3.0, 2.5),
    "after_hours_actions": (2.0, 2.0),
    "same_village_ratio": (0.30, 0.15),
}

_ANOMALY_FLAG_THRESHOLD = 0.6  # au-delà : agent signalé


def _sigmoid(x: float) -> float:
    """Sigmoïde logistique bornée à [0, 1]."""
    return 1.0 / (1.0 + math.exp(-x))


class _AnomalyModel:
    """Encapsule l'Isolation Forest (chargé paresseusement) + le fallback."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clf = None
        self._attempted = False

    def _ensure_model(self) -> None:
        if self._attempted:
            return
        with self._lock:
            if self._attempted:
                return
            self._attempted = True
            try:
                import numpy as np
                from sklearn.ensemble import IsolationForest

                rng = np.random.default_rng(42)
                n = 2000
                columns = [
                    rng.normal(mean, std, n) for mean, std in (_BASELINE[f] for f in _FEATURES)
                ]
                baseline = np.column_stack(columns)
                # Bornes physiques : ratios dans [0,1], compteurs >= 0.
                baseline = np.clip(baseline, 0.0, None)
                baseline[:, 4] = np.clip(baseline[:, 4], 0.0, 1.0)

                clf = IsolationForest(n_estimators=200, contamination=0.05, random_state=42)
                clf.fit(baseline)
                self._clf = clf
                logger.info("Isolation Forest entraîné sur base synthétique (n=%d).", n)
            except Exception as exc:  # noqa: BLE001 - sklearn/numpy optionnels
                logger.warning("Isolation Forest indisponible (%s) — heuristique z-score.", exc)
                self._clf = None

    def score(self, vector: list[float]) -> tuple[float, str]:
        """Retourne ``(anomaly_score 0-1, method)`` pour un vecteur d'indicateurs."""
        self._ensure_model()
        if self._clf is not None:
            try:
                # decision_function : négatif = anomalie. On mappe via sigmoïde.
                decision = float(self._clf.decision_function([vector])[0])
                return round(_sigmoid(-decision * 4.0), 3), "isolation_forest"
            except Exception as exc:  # noqa: BLE001
                logger.warning("Scoring IF échoué (%s) — heuristique.", exc)
        return self._heuristic(vector), "heuristic"

    @staticmethod
    def _heuristic(vector: list[float]) -> float:
        """Score heuristique : moyenne des écarts positifs normalisés."""
        deviations = []
        for value, feature in zip(vector, _FEATURES):
            mean, std = _BASELINE[feature]
            # avg_processing_time anormal SI trop BAS (rushing) → on inverse.
            z = (value - mean) / std if std else 0.0
            if feature == "avg_processing_time":
                z = -z
            deviations.append(max(0.0, z))
        return round(_sigmoid(sum(deviations) / len(deviations) - 1.0), 3)


_model = _AnomalyModel()


def score_agent(request: AnomalyScoreRequest) -> AnomalyScoreResponse:
    """Calcule le score d'anomalie d'un agent et ses facteurs contributifs.

    Args:
        request: indicateurs comportementaux journaliers de l'agent.

    Returns:
        :class:`AnomalyScoreResponse`.
    """
    vector = [getattr(request, f) for f in _FEATURES]
    anomaly_score, method = _model.score(vector)

    # Facteurs contributifs : z-score par indicateur, trié par écart décroissant.
    factors: list[ContributingFactor] = []
    for value, feature in zip(vector, _FEATURES):
        mean, std = _BASELINE[feature]
        z = (value - mean) / std if std else 0.0
        signed = -z if feature == "avg_processing_time" else z
        factors.append(
            ContributingFactor(
                factor=feature,
                value=round(float(value), 3),
                baseline=mean,
                deviation=round(float(signed), 3),
            )
        )
    factors.sort(key=lambda f: abs(f.deviation), reverse=True)

    return AnomalyScoreResponse(
        agent_id=request.agent_id,
        anomaly_score=anomaly_score,
        is_anomaly=anomaly_score >= _ANOMALY_FLAG_THRESHOLD,
        contributing_factors=factors,
        method=method,
    )
