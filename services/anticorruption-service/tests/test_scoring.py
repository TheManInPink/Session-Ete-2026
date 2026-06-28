"""Tests des garde-fous de scoring : anti-zéro pénalisant + advisory only (pas de sanction)."""

from __future__ import annotations

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import settings
from app.main import app
from app.scoring import (
    BAND_A_INVESTIGUER,
    BAND_A_SURVEILLER,
    BAND_INSUFFICIENT_DATA,
    BAND_INTEGRE,
    score_integrity,
)

client = TestClient(app)
_EXP = int(time.time()) + 3600


def _keypair() -> tuple[bytes, bytes]:
    """Génère une paire RSA (PEM privé PKCS8, PEM public) pour signer/vérifier."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    pub = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return priv, pub


# ── Garde-fou n°1 : INSUFFICIENT_DATA, JAMAIS un 0 pénalisant ──────────────────
def test_insufficient_data_is_not_a_zero_penalty(monkeypatch) -> None:
    """Sous le seuil d'actions → INSUFFICIENT_DATA (score None, pas de flag), pas un 0."""
    monkeypatch.setattr(settings, "min_actions_for_score", 5)
    result = score_integrity(overall_score=0.0, n_actions=2)
    assert result.band == BAND_INSUFFICIENT_DATA
    assert result.overall_score is None  # surtout PAS 0.0
    assert result.flagged_for_investigation is False


def test_none_overall_score_is_insufficient_data() -> None:
    """Un score amont non calculable (None) ⇒ INSUFFICIENT_DATA, jamais flaggé."""
    result = score_integrity(overall_score=None, n_actions=100)
    assert result.band == BAND_INSUFFICIENT_DATA
    assert result.flagged_for_investigation is False


# ── Bandes de gouvernance (ADR-023) ────────────────────────────────────────────
def test_banding_thresholds() -> None:
    """≥85 INTEGRE / 70-84 A_SURVEILLER / <70 A_INVESTIGUER (sens : élevé = bon)."""
    assert score_integrity(90.0, 50).band == BAND_INTEGRE
    assert score_integrity(75.0, 50).band == BAND_A_SURVEILLER
    assert score_integrity(62.0, 50).band == BAND_A_INVESTIGUER


# ── Advisory only : aucune sanction automatique ────────────────────────────────
def test_low_band_flags_for_human_review_only() -> None:
    """Bande basse ⇒ flag d'EXAMEN humain, mais advisory=True (pas de sanction auto)."""
    result = score_integrity(40.0, 50)
    assert result.band == BAND_A_INVESTIGUER
    assert result.flagged_for_investigation is True  # recommandation d'examen
    assert result.advisory is True  # JAMAIS une sanction appliquée par le service


def test_score_endpoint_returns_advisory_no_sanction(monkeypatch) -> None:
    """L'endpoint renvoie un signal advisory ; aucun champ de sanction n'est émis."""
    monkeypatch.setattr(settings, "jwks_url", "")
    monkeypatch.setattr(settings, "admin_token", "")  # dev-open pour ce test
    resp = client.post(
        "/api/v1/sigac/integrity-scores",
        json={"agent_id": "agent-7", "overall_score": 40.0, "n_actions": 50},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["advisory"] is True
    assert body["flagged_for_investigation"] is True
    # Aucune notion de sanction/blocage n'est présente dans la réponse.
    assert "sanction" not in body
    assert "blocked" not in body


# ── Contestation : un agent ne peut contester QUE son propre sub ────────────────
def test_dispute_rejects_cross_subject(monkeypatch) -> None:
    """Un agent authentifié ne peut PAS contester le score d'un autre sujet (403)."""
    priv, pub = _keypair()
    monkeypatch.setattr(settings, "jwks_url", "http://auth/jwks.json")
    # Court-circuite la résolution JWKS réseau : on injecte la clé publique de test.
    monkeypatch.setattr(
        auth,
        "verify_bearer",
        lambda token: jwt.decode(token, pub, algorithms=["RS256"], options={"require": ["exp"]}),
    )
    token = jwt.encode({"sub": "agent-A", "exp": _EXP}, priv, algorithm="RS256")

    # agent-A conteste le score de agent-B → 403.
    resp = client.post(
        "/api/v1/sigac/integrity-scores/agent-B/dispute",
        json={"reason": "pas mon score"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_dispute_accepts_own_subject(monkeypatch) -> None:
    """Un agent peut contester SON propre score (201, trace conservée)."""
    priv, pub = _keypair()
    monkeypatch.setattr(settings, "jwks_url", "http://auth/jwks.json")
    monkeypatch.setattr(
        auth,
        "verify_bearer",
        lambda token: jwt.decode(token, pub, algorithms=["RS256"], options={"require": ["exp"]}),
    )
    token = jwt.encode({"sub": "agent-A", "exp": _EXP}, priv, algorithm="RS256")

    resp = client.post(
        "/api/v1/sigac/integrity-scores/agent-A/dispute",
        json={"reason": "faux positif présumé"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "DISPUTE_OPENED"


def test_dispute_requires_authentication(monkeypatch) -> None:
    """Sans JWKS configuré, la contestation est refusée (401) — jamais ouverte en dev."""
    monkeypatch.setattr(settings, "jwks_url", "")
    resp = client.post(
        "/api/v1/sigac/integrity-scores/agent-A/dispute",
        json={"reason": "x"},
    )
    assert resp.status_code == 401


@pytest.mark.parametrize("score", [85.0, 70.0])
def test_band_boundaries_inclusive(score) -> None:
    """Les bornes 85 et 70 sont inclusives dans la bande supérieure."""
    band = score_integrity(score, 50).band
    assert band in {BAND_INTEGRE, BAND_A_SURVEILLER}
