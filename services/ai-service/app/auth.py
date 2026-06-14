"""
auth.py — Contexte utilisateur propagé par l'api-gateway.

Architecture (ADR-029) : l'**api-gateway termine l'authentification** (JWT
RS256 vérifié une seule fois via le JWKS d'auth-service), purge les en-têtes
d'identité usurpés, puis propage aux services aval un en-tête `X-User-Context`
**signé JWS HS256** (TTL court). Les services internes font confiance à ce
contexte (réseau mTLS).

Ce module :
    - lit et (optionnellement) **vérifie** la signature HS256 du contexte —
      la vérification HMAC-SHA256 utilise uniquement la stdlib (`hmac`), donc
      aucune dépendance externe n'est requise ;
    - expose une fabrique :func:`require_roles` pour protéger les endpoints.

Comportement en l'absence d'en-tête (développement local, tests, appel direct
hors gateway) : **permissif** — on n'exige pas le contexte, car l'auth est
déjà assurée au bord en production. Un avertissement est journalisé.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import time

from fastapi import HTTPException, Request, status

from app.config import settings

logger = logging.getLogger("nina_aes.ai.auth")

# Seul algorithme accepté (le gateway signe en HS256) — on refuse tout autre
# `alg` pour parer aux attaques de confusion d'algorithme (« alg=none », RS↔HS).
_EXPECTED_ALG = "HS256"
# Marge d'horloge tolérée sur l'expiration (secondes).
_CLOCK_LEEWAY = 5.0


class ContextInvalidError(Exception):
    """En-tête X-User-Context présent mais invalide (signature/exp/alg/iss)."""


def _b64url_decode(segment: str) -> bytes:
    """Décode un segment base64url (avec padding tolérant)."""
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _verify_and_decode(token: str) -> dict:
    """Vérifie et décode un JWS compact HS256 (`header.payload.signature`).

    Contrôles effectués :
        - structure en 3 segments + `alg` == HS256 (anti-confusion d'algo) ;
        - signature HMAC-SHA256 en temps constant **si** un secret est configuré ;
        - expiration `exp` (anti-rejeu, le gateway émet un TTL court) ;
        - émetteur `iss` si un émetteur attendu est configuré.

    Args:
        token: chaîne JWS compacte.

    Returns:
        Claims décodés (dict).

    Raises:
        ContextInvalidError: si une vérification échoue.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ContextInvalidError("format")
    header_b64, payload_b64, signature_b64 = parts

    # 1) En-tête + algorithme
    try:
        header = json.loads(_b64url_decode(header_b64))
    except (binascii.Error, ValueError, json.JSONDecodeError) as exc:
        raise ContextInvalidError("header") from exc
    if header.get("alg") != _EXPECTED_ALG:
        raise ContextInvalidError("alg")

    # 2) Signature (uniquement si un secret partagé est connu)
    secret = settings.gateway_jws_secret
    if secret:
        expected = hmac.new(
            secret.encode("utf-8"),
            f"{header_b64}.{payload_b64}".encode(),
            hashlib.sha256,
        ).digest()
        try:
            provided = _b64url_decode(signature_b64)
        except (binascii.Error, ValueError) as exc:
            raise ContextInvalidError("signature") from exc
        if not hmac.compare_digest(expected, provided):
            raise ContextInvalidError("signature")

    # 3) Payload
    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except (binascii.Error, ValueError, json.JSONDecodeError) as exc:
        raise ContextInvalidError("payload") from exc

    # 4) Expiration (anti-rejeu)
    exp = claims.get("exp")
    if exp is not None:
        try:
            if time.time() > float(exp) + _CLOCK_LEEWAY:
                raise ContextInvalidError("expired")
        except (TypeError, ValueError) as exc:
            raise ContextInvalidError("exp_malformed") from exc

    # 5) Émetteur (si un émetteur attendu est configuré)
    expected_iss = settings.gateway_jws_issuer
    if expected_iss and claims.get("iss") not in (None, expected_iss):
        raise ContextInvalidError("issuer")

    return claims


def _extract_roles(claims: dict) -> set[str]:
    """Extrait les rôles depuis plusieurs emplacements de claim possibles."""
    roles: set[str] = set()
    if isinstance(claims.get("roles"), list):
        roles.update(str(r).upper() for r in claims["roles"])
    realm = claims.get("realm_access", {})
    if isinstance(realm, dict) and isinstance(realm.get("roles"), list):
        roles.update(str(r).upper() for r in realm["roles"])
    if isinstance(claims.get("role"), str):
        roles.add(claims["role"].upper())
    return roles


def get_user_context(request: Request) -> dict | None:
    """Retourne les claims du contexte gateway.

    - En-tête **absent** → `None` (l'auth est assurée au bord ; confort
      local/tests ; en production le boot exige le secret, cf. `main.py`).
    - En-tête **présent mais invalide** (signature/exp/alg/iss) → **401**
      (on ne fait jamais confiance à un contexte falsifié).

    Raises:
        HTTPException: 401 si le contexte est présent mais invalide.
    """
    raw = request.headers.get(settings.user_context_header)
    if not raw:
        return None
    try:
        return _verify_and_decode(raw)
    except ContextInvalidError as exc:
        logger.warning("X-User-Context rejeté (%s).", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Contexte utilisateur invalide.",
        ) from exc


def require_roles(*allowed: str):
    """Fabrique une dépendance exigeant l'un des rôles donnés.

    Args:
        *allowed: rôles autorisés (ex. « AGENT », « ADMIN », « SYSTEM »).

    Returns:
        Une dépendance FastAPI.

    Notes:
        - Contexte absent → **autorisé** (auth déléguée au gateway en prod ;
          confort local/tests).
        - Contexte présent mais **invalide** (signature/exp/alg) → **401**.
        - Contexte valide mais **rôle manquant** → **403**.
    """
    allowed_upper = {r.upper() for r in allowed}

    def _dependency(request: Request) -> dict | None:
        claims = get_user_context(request)
        if claims is None:
            logger.debug("Aucun X-User-Context — accès autorisé (auth assurée au gateway).")
            return None
        roles = _extract_roles(claims)
        if allowed_upper and not (roles & allowed_upper):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Rôle requis : {sorted(allowed_upper)}.",
            )
        return claims

    return _dependency
