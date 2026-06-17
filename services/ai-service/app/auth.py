"""
Contrôle d'accès des endpoints sensibles — RBAC Keycloak (RS256 + JWKS) avec repli.

Escalade de garde (du plus fort au plus faible), pilotée par la config :

1. **`AI_JWKS_URL` défini** → exige un `Authorization: Bearer <JWT>` **RS256** valide
   (signature vérifiée via le JWKS de l'émetteur — auth-service / Keycloak) portant
   le **rôle** requis (rôles realm + clients Keycloak). C'est le RBAC « doc 08 ».
2. **`AI_ADMIN_TOKEN` défini** (sans JWKS) → exige l'en-tête `X-Admin-Token`.
3. **Aucun des deux** (développement) → ouvert.

La logique d'extraction des rôles et de vérification est factorisée en fonctions
pures testables hors-ligne (cf. tests/test_auth.py, avec une paire RSA locale).

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import functools
from typing import Any, Callable

from fastapi import Header, HTTPException

from .config import settings


def extract_roles(claims: dict[str, Any]) -> set[str]:
    """Extrait l'ensemble des rôles (minuscules) d'un jeton Keycloak décodé.

    Couvre les rôles **realm** (``realm_access.roles``) et **clients**
    (``resource_access.<client>.roles``).

    Args:
        claims: Revendications (payload) du JWT décodé.

    Returns:
        Ensemble de rôles en minuscules.
    """
    roles: set[str] = set()
    realm = claims.get("realm_access") or {}
    roles.update(realm.get("roles") or [])
    for client_access in (claims.get("resource_access") or {}).values():
        roles.update((client_access or {}).get("roles") or [])
    return {str(r).lower() for r in roles}


@functools.lru_cache(maxsize=1)
def _jwks_client():
    """Client JWKS mis en cache (clés de signature de l'émetteur)."""
    import jwt  # import local : la lib n'est requise que si le RBAC JWKS est actif

    return jwt.PyJWKClient(settings.jwks_url)


def verify_bearer(token: str, key: Any | None = None) -> dict[str, Any]:
    """Vérifie un JWT RS256 et retourne ses revendications.

    Args:
        token: Le JWT (sans le préfixe ``Bearer``).
        key: Clé publique de vérification. Si ``None`` (production), elle est
            résolue via le JWKS de ``AI_JWKS_URL``. L'injection sert aux tests.

    Returns:
        Les revendications décodées.

    Raises:
        Exception: Toute erreur de signature / expiration / format (jwt.*).
    """
    import jwt

    if key is None:
        key = _jwks_client().get_signing_key_from_jwt(token).key
    audience = settings.jwt_audience or None
    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=audience,
        options={"verify_aud": bool(audience)},
    )


def _bearer_token(authorization: str | None) -> str:
    """Extrait le jeton d'un en-tête ``Authorization: Bearer <token>`` (ou 401)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="En-tête Authorization Bearer requis.")
    return authorization.split(" ", 1)[1].strip()


def require_role(required_role: str) -> Callable[..., None]:
    """Fabrique une dépendance FastAPI exigeant ``required_role`` (escalade ci-dessus).

    Args:
        required_role: Rôle requis (ex. ``"admin"``).

    Returns:
        Une dépendance FastAPI (à passer à ``Depends``).
    """

    def dependency(
        authorization: str | None = Header(default=None),
        x_admin_token: str | None = Header(default=None),
    ) -> None:
        # 1) RBAC JWKS (le plus fort) si configuré.
        if settings.jwks_url:
            token = _bearer_token(authorization)
            try:
                claims = verify_bearer(token)
            except HTTPException:
                raise
            except Exception as exc:  # noqa: BLE001 — toute erreur jwt = 401
                raise HTTPException(
                    status_code=401, detail=f"JWT invalide ({type(exc).__name__})."
                ) from exc
            if required_role.lower() not in extract_roles(claims):
                raise HTTPException(status_code=403, detail=f"Rôle requis : {required_role}.")
            return
        # 2) Repli jeton admin.
        if settings.admin_token:
            if x_admin_token != settings.admin_token:
                raise HTTPException(status_code=403, detail="Jeton admin requis ou invalide.")
            return
        # 3) Développement : ouvert (ni JWKS ni jeton configurés).
        return

    return dependency
