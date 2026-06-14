"""
pipeline.py — Orchestration du pipeline de détection en 5 étapes.

Enchaîne les étapes pour l'analyse d'un enregistrement unique
(`POST /api/v1/ai/detect-errors`) :

    ① Ingestion      — payload validé (fait par FastAPI/Pydantic en amont).
    ② Normalisation  — `normalizer.normalize_record`.
    ③ Analyse        — `detector.detect` (règles métier + fuzzy/phonétique).
    ④ Scoring        — `scorer.compute_score` (XGBoost ou heuristique).
    ⑤ Soumission     — verdict + métriques (la persistance éventuelle des
                        corrections est déléguée à identity-service ; ce service
                        reste *stateless*).

Référence : docs/11-AI-SERVICE-FASTAPI.md §5.
"""

from __future__ import annotations

import time

from app import telemetry
from app.schemas.common import CitizenPayload
from app.schemas.detect_errors import DetectErrorsResponse
from app.services import detector, nina_rules
from app.services.normalizer import normalize_record
from app.services.scorer import compute_score


def run_detection(citizen: CitizenPayload, context: dict | None = None) -> DetectErrorsResponse:
    """Exécute le pipeline complet de détection sur un citoyen.

    Args:
        citizen: enregistrement à analyser.
        context: contexte optionnel (indicateurs agent) — réservé pour
            enrichissements futurs du scoring.

    Returns:
        :class:`DetectErrorsResponse` complet (erreurs, suggestions, score…).
    """
    start = time.perf_counter()

    with telemetry.time_inference():
        # ② Normalisation
        record = normalize_record(citizen)
        # ③ Analyse
        errors, suggestions = detector.detect(record)
        # ④ Scoring
        score, verdict, model_version = compute_score(record, errors)

    # ⑤ Soumission : métriques + réponse (verdict consommé par l'appelant)
    telemetry.record_result(score, errors)
    processing_ms = round((time.perf_counter() - start) * 1000.0, 2)

    return DetectErrorsResponse(
        nina_masked=nina_rules.mask_nina(record.nina),
        errors_detected=errors,
        suggestions=suggestions,
        overall_confidence=score,
        verdict=verdict,
        model_version=model_version,
        processing_ms=processing_ms,
    )
