"""
test_fallbacks.py — Couvre les chemins de *dégradation* et utilitaires.

Ces branches ne s'exécutent pas quand les libs réelles (rapidfuzz, jellyfish,
xgboost) sont installées ; on les teste donc directement pour garantir que le
mode dégradé reste correct.
"""

from __future__ import annotations

from app.schemas.common import CitizenPayload, Sex
from app.schemas.detect_errors import DetectedError
from app.schemas.common import Severity
from app.services import nina_rules, reference
from app.services.anomaly import _AnomalyModel
from app.services.comparator import (
    _jaro_py,
    _jaro_winkler_py,
    _levenshtein_py,
    best_match,
    runtime_backends,
)
from app.services.normalizer import normalize_record
from app.services.scorer import _MODEL_FEATURE_ORDER, compute_score

VALID_NINA = "18903102015042V"


# ─── Comparator — implémentations Python pures ──────────────────────
def test_levenshtein_pure():
    assert _levenshtein_py("kitten", "sitting") == 3
    assert _levenshtein_py("", "abc") == 3
    assert _levenshtein_py("abc", "abc") == 0


def test_jaro_and_winkler_pure():
    assert _jaro_py("a", "a") == 1.0
    assert _jaro_py("", "x") == 0.0
    # Jaro-Winkler favorise les préfixes communs (cas classique MARTHA/MARHTA).
    assert _jaro_winkler_py("MARTHA", "MARHTA") > 0.9


def test_best_match_and_backends():
    candidate, score = best_match("Traore", ["Diarra", "Traore", "Keita"])
    assert candidate == "Traore"
    assert score >= 99.0
    assert best_match("X", []) is None
    backends = runtime_backends()
    assert {"rapidfuzz", "jellyfish"} <= backends.keys()


# ─── nina_rules — formatage / masquage / erreurs ────────────────────
def test_format_and_mask():
    assert nina_rules.format_nina(VALID_NINA) == "1 89 03 1 02 015 042 V"
    assert nina_rules.format_nina("123") == "123"  # trop court → inchangé
    assert nina_rules.mask_nina("") == ""
    assert nina_rules.mask_nina("12") == "**"  # tout masqué si trop court
    assert nina_rules.validate_nina_checksum(VALID_NINA) is True


def test_parse_invalid_raises():
    import pytest  # pyright: ignore[reportMissingImports]

    with pytest.raises(ValueError):
        nina_rules.parse_nina("pas-un-nina")


# ─── reference — référentiels & plausibilité ────────────────────────
def test_reference_helpers():
    assert reference.region_name_for_digit("1") == "Kayes"
    assert reference.region_name_for_digit("0") is None
    assert reference.is_valid_region_digit("9") is True
    assert reference.language_plausible("bm", "Bamako") is True
    assert reference.language_plausible("tmq", "Bamako") is False
    status = reference.reference_status()
    assert "regions_loaded" in status
    assert reference.load_regions()  # data/mali/regions.json présent
    assert isinstance(reference.load_cercles(), list)


# ─── anomaly — heuristique de secours (sans Isolation Forest) ───────
def test_anomaly_heuristic_orders_normal_vs_suspect():
    model = _AnomalyModel()
    normal = model._heuristic([80.0, 45.0, 3.0, 2.0, 0.30])
    suspect = model._heuristic([450.0, 4.0, 90.0, 70.0, 0.98])
    assert 0.0 <= normal <= 1.0
    assert suspect > normal


# ─── scorer — branche modèle XGBoost (mockée) ───────────────────────
class _DummyModel:
    """Faux modèle exposant predict_proba comme XGBClassifier."""

    def predict_proba(self, features):  # noqa: D401, ANN001
        return [[0.2, 0.8]]  # 80 % de probabilité d'erreur


def _record():
    return normalize_record(
        CitizenPayload(
            nina=VALID_NINA,
            first_name="Aliou",
            last_name="Traoré",
            birth_date="1989-03-15",
            sex=Sex.M,
            birth_place="Kayes",
        )
    )


def test_scorer_uses_model_when_present(monkeypatch):
    monkeypatch.setattr("app.services.scorer.settings.ai_use_model", True)  # opt-in
    bundle = {"model": _DummyModel(), "feature_names": _MODEL_FEATURE_ORDER, "version": "test-v1"}
    monkeypatch.setattr("app.services.scorer.registry.get_xgb_bundle", lambda: bundle)
    score, verdict, version = compute_score(_record(), [])
    assert version == "test-v1"
    assert 0.0 <= score <= 100.0


def test_scorer_rejects_mismatched_feature_order(monkeypatch):
    monkeypatch.setattr("app.services.scorer.settings.ai_use_model", True)  # opt-in
    bad = {"model": _DummyModel(), "feature_names": ["wrong"], "version": "test"}
    monkeypatch.setattr("app.services.scorer.registry.get_xgb_bundle", lambda: bad)
    _, _, version = compute_score(_record(), [])
    assert version == "heuristic-v1"  # garde-fou → retour heuristique


def test_scorer_default_is_heuristic_even_with_model(monkeypatch):
    """Par défaut (ai_use_model=False), l'heuristique prime même si un modèle existe."""
    bundle = {"model": _DummyModel(), "feature_names": _MODEL_FEATURE_ORDER, "version": "test-v1"}
    monkeypatch.setattr("app.services.scorer.registry.get_xgb_bundle", lambda: bundle)
    _, _, version = compute_score(_record(), [])
    assert version == "heuristic-v1"


def test_scorer_heuristic_penalises_critical():
    crit = DetectedError(
        type="impossible_date",
        field="birth_date",
        severity=Severity.CRITICAL,
        message="x",
        confidence=1.0,
        details={},
    )
    score, verdict, version = compute_score(_record(), [crit])
    assert version == "heuristic-v1"
    assert score < 60.0
