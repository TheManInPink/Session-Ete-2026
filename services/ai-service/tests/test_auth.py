"""Tests du contrôle d'accès RBAC (app/auth.py) — crypto réelle, hors-ligne."""

from __future__ import annotations

import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app import auth
from app.config import settings

# Expiration future par défaut pour les jetons de test (1 h).
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


def test_extract_roles_realm_and_clients() -> None:
    """extract_roles fusionne rôles realm + clients, en minuscules."""
    claims = {
        "realm_access": {"roles": ["ADMIN", "offline_access"]},
        "resource_access": {"ai-service": {"roles": ["Agent"]}, "x": {"roles": ["viewer"]}},
    }
    assert auth.extract_roles(claims) == {"admin", "offline_access", "agent", "viewer"}
    assert auth.extract_roles({}) == set()


def test_verify_bearer_accepts_valid_rs256_token() -> None:
    """Un JWT RS256 signé par la bonne clé (avec exp) est accepté et décodé."""
    priv, pub = _keypair()
    token = jwt.encode(
        {"sub": "u1", "exp": _EXP, "realm_access": {"roles": ["admin"]}},
        priv,
        algorithm="RS256",
    )
    claims = auth.verify_bearer(token, key=pub)
    assert claims["sub"] == "u1"
    assert "admin" in auth.extract_roles(claims)


def test_verify_bearer_rejects_wrong_signature() -> None:
    """Un JWT signé par une autre clé est rejeté (signature invalide)."""
    priv_a, _ = _keypair()
    _, pub_b = _keypair()
    token = jwt.encode({"sub": "u1", "exp": _EXP}, priv_a, algorithm="RS256")
    with pytest.raises(jwt.InvalidTokenError):
        auth.verify_bearer(token, key=pub_b)


def test_verify_bearer_rejects_token_without_exp() -> None:
    """Un JWT sans revendication ``exp`` est rejeté (require=["exp"])."""
    priv, pub = _keypair()
    token = jwt.encode({"sub": "u1"}, priv, algorithm="RS256")  # pas d'exp
    with pytest.raises(jwt.MissingRequiredClaimError):
        auth.verify_bearer(token, key=pub)


def test_verify_bearer_rejects_alg_confusion_hs256() -> None:
    """Confusion HS/RS : un jeton forgé en ``alg=HS256`` est rejeté.

    C'est exactement la classe d'attaque de CVE-2024-33663 (python-jose) :
    l'attaquant déclare ``HS256`` et signe avec la clé publique RSA — connue —
    comme secret HMAC, espérant que le vérifieur l'accepte. On construit ici le
    jeton **à la main** (PyJWT refuse même de l'encoder via son API), ce qui
    reproduit fidèlement le jeton malveillant transmis sur le réseau. Avec
    ``algorithms=["RS256"]`` épinglé, ``verify_bearer`` refuse l'algorithme
    HS256 déclaré (``InvalidAlgorithmError``), sans jamais tenter la clé.
    """
    import base64
    import hashlib
    import hmac
    import json

    def _b64(raw: bytes) -> bytes:
        return base64.urlsafe_b64encode(raw).rstrip(b"=")

    _, pub = _keypair()
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(
        json.dumps({"sub": "attacker", "exp": _EXP, "realm_access": {"roles": ["admin"]}}).encode()
    )
    signing_input = header + b"." + payload
    sig = _b64(hmac.new(pub, signing_input, hashlib.sha256).digest())
    forged = (signing_input + b"." + sig).decode()

    with pytest.raises(jwt.InvalidAlgorithmError):
        auth.verify_bearer(forged, key=pub)


def test_verify_bearer_rejects_alg_none() -> None:
    """Un jeton ``alg=none`` (non signé) est rejeté par l'épinglage RS256."""
    unsigned = jwt.encode({"sub": "x", "exp": _EXP}, key=None, algorithm="none")
    with pytest.raises(jwt.InvalidTokenError):
        auth.verify_bearer(unsigned, key="ignored")


def test_require_role_dev_open(monkeypatch) -> None:
    """Sans JWKS ni jeton admin (dev), la garde laisse passer."""
    monkeypatch.setattr(settings, "jwks_url", "")
    monkeypatch.setattr(settings, "admin_token", "")
    dep = auth.require_role("admin")
    assert dep(authorization=None, x_admin_token=None) is None


def test_require_role_admin_token_fallback(monkeypatch) -> None:
    """Avec AI_ADMIN_TOKEN (sans JWKS), l'en-tête X-Admin-Token est exigé."""
    monkeypatch.setattr(settings, "jwks_url", "")
    monkeypatch.setattr(settings, "admin_token", "s3cr3t")
    dep = auth.require_role("admin")
    assert dep(authorization=None, x_admin_token="s3cr3t") is None
    with pytest.raises(HTTPException) as exc:
        dep(authorization=None, x_admin_token="wrong")
    assert exc.value.status_code == 403


def test_require_role_jwks_role_gate(monkeypatch) -> None:
    """Avec JWKS, un Bearer portant le rôle requis passe ; sinon 401/403."""
    monkeypatch.setattr(settings, "jwks_url", "http://auth-service/.well-known/jwks.json")
    monkeypatch.setattr(settings, "admin_token", "")
    # On court-circuite la résolution JWKS réseau par un faux décodeur.
    monkeypatch.setattr(auth, "verify_bearer", lambda token: {"realm_access": {"roles": ["admin"]}})
    dep = auth.require_role("admin")
    assert dep(authorization="Bearer xyz", x_admin_token=None) is None

    # Jeton sans le rôle requis → 403.
    monkeypatch.setattr(auth, "verify_bearer", lambda token: {"realm_access": {"roles": ["agent"]}})
    with pytest.raises(HTTPException) as exc403:
        dep(authorization="Bearer xyz", x_admin_token=None)
    assert exc403.value.status_code == 403

    # En-tête Authorization manquant → 401.
    with pytest.raises(HTTPException) as exc401:
        dep(authorization=None, x_admin_token=None)
    assert exc401.value.status_code == 401
