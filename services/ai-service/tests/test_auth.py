"""
test_auth.py — Vérification du contexte X-User-Context (sécurité).

Couvre la terminaison d'auth au bord (ADR-029) : signature HS256, expiration,
distinction « en-tête absent » (permissif) vs « présent mais invalide » (401),
et contrôle de rôle (403).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import pytest  # pyright: ignore[reportMissingImports]

from app.config import settings

URL = "/api/v1/ai/compare-names"
BODY = {"name1": "Mamadou Traoré", "name2": "Mamadu Traore"}
SECRET = "test-secret-hs256"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _make_token(payload: dict, secret: str = SECRET, alg: str = "HS256") -> str:
    """Forge un JWS compact HS256 pour les tests."""
    header = _b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    body = _b64url(json.dumps(payload).encode())
    sig = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url(sig)}"


@pytest.fixture
def with_secret(monkeypatch):
    """Active la vérification de signature en injectant un secret de test."""
    monkeypatch.setattr(settings, "gateway_jws_secret", SECRET)
    return SECRET


def test_valid_context_with_role_allows(client, with_secret):
    """Un contexte valide avec un rôle autorisé passe (200)."""
    token = _make_token({"sub": "u1", "roles": ["AGENT"], "exp": time.time() + 60})
    r = client.post(URL, json=BODY, headers={"X-User-Context": token})
    assert r.status_code == 200, r.text


def test_tampered_signature_rejected(client, with_secret):
    """Une signature falsifiée (mauvais secret) est rejetée (401)."""
    token = _make_token({"sub": "u1", "roles": ["AGENT"], "exp": time.time() + 60}, secret="wrong")
    r = client.post(URL, json=BODY, headers={"X-User-Context": token})
    assert r.status_code == 401


def test_expired_context_rejected(client, with_secret):
    """Un contexte expiré est rejeté (anti-rejeu, 401)."""
    token = _make_token({"sub": "u1", "roles": ["AGENT"], "exp": time.time() - 60})
    r = client.post(URL, json=BODY, headers={"X-User-Context": token})
    assert r.status_code == 401


def test_alg_confusion_rejected(client, with_secret):
    """Un en-tête avec alg != HS256 est rejeté (401)."""
    token = _make_token({"sub": "u1", "roles": ["AGENT"], "exp": time.time() + 60}, alg="none")
    r = client.post(URL, json=BODY, headers={"X-User-Context": token})
    assert r.status_code == 401


def test_wrong_role_forbidden(client, with_secret):
    """Un contexte valide sans le rôle requis est interdit (403)."""
    token = _make_token({"sub": "u1", "roles": ["CITIZEN"], "exp": time.time() + 60})
    r = client.post(URL, json=BODY, headers={"X-User-Context": token})
    assert r.status_code == 403


def test_absent_context_permissive(client):
    """Sans en-tête, l'accès est autorisé (auth assurée au bord du gateway)."""
    r = client.post(URL, json=BODY)
    assert r.status_code == 200
