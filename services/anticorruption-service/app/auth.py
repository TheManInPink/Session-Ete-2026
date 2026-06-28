"""
Contrôle d'accès des endpoints sensibles SIGAC — RBAC Keycloak (RS256 + JWKS) avec repli.

Imite la garde durcie de ``ai-service`` (PyJWT, jamais ``python-jose``). Escalade de
garde (du plus fort au plus faible), pilotée par la config :

1. **``SIGAC_JWKS_URL`` défini** → exige un ``Authorization: Bearer <JWT>`` **RS256**
   valide (signature vérifiée via le JWKS de l'émetteur — auth-service / Keycloak)
   portant le **rôle** requis. C'est le RBAC « doc 08 ».
2. **``SIGAC_ADMIN_TOKEN`` défini** (sans JWKS) → exige l'en-tête ``X-Admin-Token``.
3. **Aucun des deux** (développement) → ouvert.

Durcissement (cf. doc 11 §3 / ADR-034) : on épingle ``algorithms=["RS256"]`` (rejette
``alg=none`` et la **confusion HS/RS**), on exige ``exp`` (pas de jeton illimité), et on
vérifie ``aud``/``iss`` dès qu'ils sont configurés.

> 🔑 Rappel CANON crypto : ici Ed25519 (EdDSA) n'apparaît **jamais** côté chiffrement.
> Le chiffrement des signalements se fait par sealed box X25519 / RSA-OAEP, côté client.
> L'auth n'utilise que des signatures (RS256), sans aucun rôle de confidentialité.

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


def subject_id(claims: dict[str, Any]) -> str | None:
    """Retourne l'identifiant du sujet du jeton (``sub``), utile pour la contestation.

    Args:
        claims: Revendications (payload) du JWT décodé.

    Returns:
        La valeur de ``sub`` (str) ou ``None`` si absente.
    """
    sub = claims.get("sub")
    return str(sub) if sub is not None else None


@functools.lru_cache(maxsize=1)
def _jwks_client():
    """Client JWKS mis en cache (clés de signature de l'émetteur)."""
    import jwt  # import local : la lib n'est requise que si le RBAC JWKS est actif

    return jwt.PyJWKClient(settings.jwks_url)


def verify_bearer(token: str, key: Any | None = None) -> dict[str, Any]:
    """Vérifie un JWT **RS256** et retourne ses revendications.

    Durcissement supply-chain (cf. doc 11 §3 / ADR-034) — on utilise **PyJWT**
    (et non ``python-jose``, banni : CVE-2024-33663 confusion d'algorithme,
    CVE-2024-33664 DoS) avec :

    - ``algorithms=["RS256"]`` **épinglé** : PyJWT rejette donc ``alg=none`` et
      toute **confusion HS/RS** (un jeton signé HS256 avec la clé publique RSA
      comme « secret » est refusé, l'algorithme déclaré n'étant pas autorisé).
    - ``require=["exp"]`` : un jeton **sans expiration** est rejeté.
    - vérification d'``aud`` activée dès que ``SIGAC_JWT_AUDIENCE`` est défini ;
      vérification d'``iss`` activée dès que ``SIGAC_JWT_ISSUER`` est défini.

    Args:
        token: Le JWT (sans le préfixe ``Bearer``).
        key: Clé publique de vérification. Si ``None`` (production), elle est
            résolue via le JWKS de ``SIGAC_JWKS_URL`` (clé indexée par ``kid``).
            L'injection d'une clé sert aux tests hors-ligne.

    Returns:
        Les revendications décodées.

    Raises:
        Exception: Toute erreur de signature / expiration / algorithme / format
            (sous-classes de ``jwt.PyJWTError``).
    """
    import jwt

    if key is None:
        key = _jwks_client().get_signing_key_from_jwt(token).key
    audience = settings.jwt_audience or None
    issuer = settings.jwt_issuer or None
    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],  # interdit alg=none et la confusion HS/RS
        audience=audience,
        issuer=issuer,
        options={
            "verify_aud": bool(audience),
            "verify_iss": bool(issuer),
            "require": ["exp"],
        },
    )


def _bearer_token(authorization: str | None) -> str:
    """Extrait le jeton d'un en-tête ``Authorization: Bearer <token>`` (ou 401)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="En-tête Authorization Bearer requis.")
    return authorization.split(" ", 1)[1].strip()


def authenticate(authorization: str | None) -> dict[str, Any]:
    """Vérifie le Bearer et retourne les revendications (ou lève 401).

    Utilisé par les endpoints qui ont besoin de l'**identité** de l'appelant
    (ex. contestation RGPD : l'agent ne peut contester que son propre score).
    Nécessite que ``SIGAC_JWKS_URL`` soit configuré ; sinon 401 explicite (on ne
    laisse PAS un endpoint identifiant ouvert en dev silencieusement).

    Args:
        authorization: Valeur brute de l'en-tête ``Authorization``.

    Returns:
        Les revendications décodées du JWT.

    Raises:
        HTTPException: 401 si pas de JWKS configuré ou jeton invalide.
    """
    if not settings.jwks_url:
        raise HTTPException(
            status_code=401,
            detail="Authentification requise (SIGAC_JWKS_URL non configuré).",
        )
    token = _bearer_token(authorization)
    try:
        return verify_bearer(token)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — toute erreur jwt = 401
        raise HTTPException(
            status_code=401, detail=f"JWT invalide ({type(exc).__name__})."
        ) from exc


def require_role(required_role: str) -> Callable[..., dict[str, Any] | None]:
    """Fabrique une dépendance FastAPI exigeant ``required_role`` (escalade ci-dessus).

    Args:
        required_role: Rôle requis (ex. ``"inspector"``, ``"prosecutor"``, ``"agent"``).

    Returns:
        Une dépendance FastAPI (à passer à ``Depends``). Elle retourne les
        revendications du jeton si le RBAC JWKS est actif (utile pour identifier
        l'appelant), sinon ``None`` (repli admin-token / dev).
    """

    def dependency(
        authorization: str | None = Header(default=None),
        x_admin_token: str | None = Header(default=None),
    ) -> dict[str, Any] | None:
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
            return claims
        # 2) Repli jeton admin.
        if settings.admin_token:
            if x_admin_token != settings.admin_token:
                raise HTTPException(status_code=403, detail="Jeton admin requis ou invalide.")
            return None
        # 3) Développement : ouvert (ni JWKS ni jeton configurés).
        return None

    return dependency
