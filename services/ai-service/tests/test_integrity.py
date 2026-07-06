"""Tests de la vérification d'intégrité du bundle (app/inference.py)."""

from __future__ import annotations

import hashlib

import joblib

from app.config import settings
from app.inference import ModelRegistry

# Bundle minimal valide (clés requises présentes ; valeurs triviales picklables).
_DUMMY_BUNDLE = {
    "model": "dummy",
    "feature_builder": "dummy",
    "label_encoder": "dummy",
    "classes": ["none"],
}


def _write_bundle(tmp_path):
    """Écrit un bundle joblib + son sidecar .sha256 correct ; retourne le chemin."""
    path = tmp_path / "xgboost_v1.joblib"
    joblib.dump(_DUMMY_BUNDLE, path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (tmp_path / "xgboost_v1.joblib.sha256").write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    return path


def test_loads_with_matching_sidecar(tmp_path, monkeypatch) -> None:
    """Un bundle dont le sidecar correspond se charge."""
    path = _write_bundle(tmp_path)
    monkeypatch.setattr(settings, "xgboost_bundle_path", str(path))
    status = ModelRegistry().load()
    assert status["loaded"] is True
    assert status["error"] is None


def test_rejects_tampered_bundle(tmp_path, monkeypatch) -> None:
    """Un bundle altéré après signature est rejeté (mismatch SHA-256)."""
    path = _write_bundle(tmp_path)
    # Altère le bundle SANS mettre à jour le sidecar.
    joblib.dump({**_DUMMY_BUNDLE, "classes": ["none", "tampered"]}, path)
    monkeypatch.setattr(settings, "xgboost_bundle_path", str(path))
    status = ModelRegistry().load()
    assert status["loaded"] is False
    assert "Intégrité" in (status["error"] or "")


def test_unsigned_tolerated_in_dev(tmp_path, monkeypatch) -> None:
    """Sans sidecar et require_signed_bundle=False, le bundle se charge (dev)."""
    path = tmp_path / "xgboost_v1.joblib"
    joblib.dump(_DUMMY_BUNDLE, path)
    monkeypatch.setattr(settings, "xgboost_bundle_path", str(path))
    monkeypatch.setattr(settings, "require_signed_bundle", False)
    assert ModelRegistry().load()["loaded"] is True


def test_unsigned_refused_when_required(tmp_path, monkeypatch) -> None:
    """Sans sidecar et require_signed_bundle=True, le chargement est refusé."""
    path = tmp_path / "xgboost_v1.joblib"
    joblib.dump(_DUMMY_BUNDLE, path)
    monkeypatch.setattr(settings, "xgboost_bundle_path", str(path))
    monkeypatch.setattr(settings, "require_signed_bundle", True)
    status = ModelRegistry().load()
    assert status["loaded"] is False
    assert "non signé" in (status["error"] or "")
