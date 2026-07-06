"""Tests de la vérification d'intégrité fail-closed du bundle (app/inference.py)."""

from __future__ import annotations

import hashlib

import joblib

from app.config import settings
from app.inference import AnomalyModelRegistry

# Bundle Isolation Forest minimal valide (clés requises ; valeurs picklables triviales).
_DUMMY_BUNDLE = {
    "model": "dummy",
    "scaler": "dummy",
    "feature_names": ["f1", "f2"],
}


def _write_bundle(tmp_path):
    """Écrit un bundle joblib + son sidecar .sha256 correct ; retourne le chemin."""
    path = tmp_path / "isolation_forest_v1.joblib"
    joblib.dump(_DUMMY_BUNDLE, path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    sidecar = tmp_path / "isolation_forest_v1.joblib.sha256"
    sidecar.write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    return path


def test_loads_with_matching_sidecar(tmp_path, monkeypatch) -> None:
    """Un bundle dont le sidecar correspond se charge (intégrité OK)."""
    path = _write_bundle(tmp_path)
    monkeypatch.setattr(settings, "isolation_forest_path", str(path))
    status = AnomalyModelRegistry().load()
    assert status["loaded"] is True
    assert status["error"] is None


def test_rejects_tampered_bundle(tmp_path, monkeypatch) -> None:
    """Un bundle altéré après signature est rejeté (mismatch SHA-256, fail-closed)."""
    path = _write_bundle(tmp_path)
    # Altère le bundle SANS mettre à jour le sidecar.
    joblib.dump({**_DUMMY_BUNDLE, "feature_names": ["f1", "f2", "tampered"]}, path)
    monkeypatch.setattr(settings, "isolation_forest_path", str(path))
    status = AnomalyModelRegistry().load()
    assert status["loaded"] is False
    assert "Intégrité" in (status["error"] or "")


def test_unsigned_refused_when_required(tmp_path, monkeypatch) -> None:
    """Sans sidecar et require_signed_bundle=True, le chargement est REFUSÉ (défaut)."""
    path = tmp_path / "isolation_forest_v1.joblib"
    joblib.dump(_DUMMY_BUNDLE, path)
    monkeypatch.setattr(settings, "isolation_forest_path", str(path))
    monkeypatch.setattr(settings, "require_signed_bundle", True)
    status = AnomalyModelRegistry().load()
    assert status["loaded"] is False
    assert "non signé" in (status["error"] or "")


def test_unsigned_tolerated_only_when_disabled(tmp_path, monkeypatch) -> None:
    """Sans sidecar et require_signed_bundle=False, le bundle se charge (dev explicite)."""
    path = tmp_path / "isolation_forest_v1.joblib"
    joblib.dump(_DUMMY_BUNDLE, path)
    monkeypatch.setattr(settings, "isolation_forest_path", str(path))
    monkeypatch.setattr(settings, "require_signed_bundle", False)
    assert AnomalyModelRegistry().load()["loaded"] is True
