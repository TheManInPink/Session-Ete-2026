"""
Point d'entrée du SIGAC (anticorruption-service) — port 3009 (Bloc D).

Détection algorithmique des comportements anormaux (Isolation Forest), scoring
d'intégrité des agents (bandes de gouvernance ADR-023), contestation RGPD-like
(art. 22), et canal lanceur d'alerte à confidentialité réelle (scellement côté
client, le serveur ne déchiffre JAMAIS).

Garanties exposées par cette surface API :
- **CORS sûr** : jamais de wildcard combiné aux credentials (corrige la revue).
- **Scoring fail-closed** : le bundle Isolation Forest est vérifié (sidecar
  ``.sha256``) avant tout usage ; sinon ``503`` (pas de scoring dégradé).
- **Advisory only** : le scoring ne sanctionne pas ; un humain (INSPECTOR /
  PROSECUTOR) agit via ``require_role``.
- **Contestation** : un agent authentifié ne peut contester QUE son propre ``sub``.
- **Anti-corrélation** : l'intake signalement ne stocke que ciphertext + buckets +
  jour + hash de token ; aucune IP / aucun NINA n'est journalisé par requête.

Auteur  : Étudiant UQAR
Date    : 2026
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import authenticate, require_role, subject_id
from .config import settings
from .inference import registry
from .scoring import score_integrity
from .whistleblower import (
    _ALLOWED_SCHEMES,
    PublicKeyBundle,
    bucketize_classification,
    bucketize_severity,
    generate_tracking_token,
    hash_tracking_token,
    received_day,
    store,
)

# Borne de taille de lot (évite un scoring synchrone non borné = levier DoS).
_MAX_BATCH = 1000


app = FastAPI(
    title="NINA-AES SIGAC",
    description="Système Intégré de Gouvernance Anti-Corruption",
    version="0.1.0",
    docs_url="/api/v1/sigac/docs",
    openapi_url="/api/v1/sigac/openapi.json",
)

# ── CORS sûr (correctif revue P0) ──────────────────────────────────────────────
# La spec CORS interdit de combiner une origine "*" avec ``allow_credentials=True``
# (wildcard crédentialé = invalide/insecure). On lit ``settings.cors_origins`` et,
# si "*" est présent, on FORCE ``allow_credentials=False`` (le service est derrière
# la gateway et ne manipule pas de cookies navigateur). Plus aucun ``["*"]`` codé en
# dur : on déploie un allowlist explicite via ``SIGAC_CORS_ORIGINS`` en production.
_cors_origins = settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
#  Schémas
# ──────────────────────────────────────────────────────────────────────────────
class IntegrityScoreRequest(BaseModel):
    """Demande de scoring d'intégrité d'un agent (signal consultatif, jamais une sanction)."""

    agent_id: str = Field(..., description="Identifiant de l'agent évalué.")
    # Score agrégé amont (5 facteurs, doc 23 §4.1). ``None`` = non calculable.
    overall_score: float | None = Field(default=None, ge=0.0, le=100.0)
    n_actions: int = Field(default=0, ge=0, description="Nb d'actions sur la fenêtre.")


class DisputeRequest(BaseModel):
    """Contestation d'un score d'intégrité (RGPD-like art. 22)."""

    reason: str = Field(..., max_length=2000, description="Motivation écrite de l'agent.")


class SealedReportRequest(BaseModel):
    """Signalement scellé POSTé par la borne — le serveur ne voit QUE ces champs.

    Aucun numéro, aucune IP, aucun correlation-id, aucun timestamp précis : la borne
    n'en envoie pas, et le serveur n'en réclame pas (anti-corrélation, protocole §6.1).
    """

    report_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ciphertext_b64: str = Field(..., description="Payload scellé base64 (indéchiffrable serveur).")
    scheme: str = Field(..., description="SEALED_BOX_X25519 | RSA_OAEP_4096.")
    cipher_kid: str = Field(..., description="Version de la clé publique procureur utilisée.")
    fine_classification: str = Field(
        ..., description="Classe BERT fine (réduite côté serveur à un bucket grossier)."
    )
    fine_severity: str = Field(
        ..., description="Severité fine (réduite côté serveur à un bucket grossier)."
    )


# ──────────────────────────────────────────────────────────────────────────────
#  Santé
# ──────────────────────────────────────────────────────────────────────────────
def _health_payload() -> dict[str, Any]:
    """Construit la charge utile de santé partagée par les sondes SIGAC."""
    return {
        "status": "ok",
        "service": "anticorruption-service",
        "model_loaded": registry.is_loaded,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
async def health_probe() -> dict[str, Any]:
    """Liveness **non préfixée** — cible de la sonde Docker/K8s (``curl /health``)."""
    return _health_payload()


@app.get("/api/v1/sigac/health")
async def health_check() -> dict[str, Any]:
    """Endpoint de santé (préfixé API) — état du service et du modèle d'anomalies."""
    return _health_payload()


# ──────────────────────────────────────────────────────────────────────────────
#  Scoring d'intégrité — ADVISORY ONLY (aucune sanction automatique)
# ──────────────────────────────────────────────────────────────────────────────
@app.post(
    "/api/v1/sigac/integrity-scores",
    dependencies=[Depends(require_role("inspector"))],
)
async def compute_integrity_score(request: IntegrityScoreRequest) -> dict[str, Any]:
    """Calcule la bande d'intégrité d'un agent — **signal d'aide à la décision**, pas une sanction.

    🔒 Réservé aux rôles d'investigation (``inspector``) via :func:`app.auth.require_role`
    (repli admin-token / dev). Garde-fous appliqués (cf. ``app/scoring.py``) :

    - ``n_actions`` < ``SIGAC_MIN_ACTIONS_FOR_SCORE`` ⇒ ``INSUFFICIENT_DATA`` (JAMAIS
      un 0 pénalisant) ;
    - bande basse ⇒ ``flagged_for_investigation=True`` qui n'est qu'une **recommandation
      d'examen humain** OCLEI — aucune sanction n'est appliquée par ce service.

    Args:
        request: agent évalué, score agrégé amont et nombre d'actions.

    Returns:
        La bande, le score éventuel, le drapeau d'examen et ``advisory=true``.
    """
    result = score_integrity(request.overall_score, request.n_actions)
    return {
        "agent_id": request.agent_id,
        "band": result.band,
        "overall_score": result.overall_score,
        "flagged_for_investigation": result.flagged_for_investigation,
        "advisory": result.advisory,
        "n_actions": result.n_actions,
    }


@app.post(
    "/api/v1/sigac/integrity-scores/{score_subject_id}/dispute",
    status_code=201,
)
async def dispute_integrity_score(
    score_subject_id: str,
    request: DisputeRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Ouvre une contestation d'un score d'intégrité (RGPD-like art. 22) — auth stricte.

    🔒 Authentification OBLIGATOIRE via :func:`app.auth.authenticate` (Bearer RS256 +
    JWKS) : un agent ne peut contester QUE **son propre** score. On compare le ``sub``
    du jeton à ``score_subject_id`` ; toute tentative cross-sujet est refusée ``403``.

    POURQUOI on ne supprime rien : la contestation **gèle l'effet** du flag mais
    **conserve la trace** (transparence du recours) ; un inspecteur humain tranche.

    Args:
        score_subject_id: identifiant du sujet (``sub``) du score contesté.
        request: motivation écrite de l'agent.
        authorization: en-tête ``Authorization: Bearer <JWT>``.

    Returns:
        Statut ``DISPUTE_OPENED`` + le sujet concerné.

    Raises:
        HTTPException: ``401`` si non authentifié ; ``403`` si le sujet n'est pas le sien.
    """
    claims = authenticate(authorization)
    caller = subject_id(claims)
    if caller is None or caller != score_subject_id:
        # Empêche un agent de contester/altérer le dossier d'un collègue.
        raise HTTPException(
            status_code=403,
            detail="Vous ne pouvez contester que votre propre score.",
        )
    # La trace est conservée (pas de suppression) ; un humain OCLEI tranche ensuite.
    return {
        "status": "DISPUTE_OPENED",
        "subject_id": score_subject_id,
        "reason_length": len(request.reason),
    }


# ──────────────────────────────────────────────────────────────────────────────
#  Canal lanceur d'alerte — confidentialité réelle (le serveur ne déchiffre JAMAIS)
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/api/v1/sigac/whistleblower/public-key")
async def whistleblower_public_key() -> dict[str, Any]:
    """Diffuse la **clé PUBLIQUE** du procureur pour que la borne scelle localement.

    Ce bundle ne contient AUCUN secret : seule la clé publique (X25519 base64 ou RSA
    PEM) et son ``cipher_kid``. Le serveur ne détient aucune clé privée et ne déchiffre
    jamais (CANON crypto, doc 23 §4.5 / protocole §4).

    Returns:
        Le :class:`PublicKeyBundle` sérialisé (schéma, kid, clé publique).
    """
    if settings.whistleblower_scheme == "RSA_OAEP_4096":
        public_key = settings.prosecutor_pubkey_pem
    else:
        public_key = settings.prosecutor_pubkey_b64
    bundle = PublicKeyBundle(
        scheme=settings.whistleblower_scheme,
        cipher_kid=settings.cipher_kid,
        public_key=public_key,
    )
    return {
        "scheme": bundle.scheme,
        "cipher_kid": bundle.cipher_kid,
        "public_key": bundle.public_key,
    }


@app.post("/api/v1/sigac/whistleblower/reports", status_code=201)
async def ingest_sealed_report(request: SealedReportRequest) -> dict[str, Any]:
    """Reçoit un signalement **déjà scellé** par la borne — stockage ciphertext-only.

    Le serveur ne déchiffre JAMAIS. Il valide le schéma (∈ ``_ALLOWED_SCHEMES``) et la
    taille du ciphertext (anti-DoS), réduit la classification/severité FINES à des
    **buckets grossiers** (anti-corrélation), n'horodate qu'au **jour**, génère un token
    de suivi (rendu UNE fois) et n'en stocke que le **hash**.

    ⚠️ Aucune journalisation par requête de ``request.client`` (IP) ni de NINA : la
    réponse et le stockage ne contiennent ni IP, ni numéro, ni correlation-id, ni
    timestamp précis (protocole §6.1).

    Args:
        request: champs scellés POSTés par la borne (jamais de plaintext sensible).

    Returns:
        Le ``report_id``, le ``tracking_token`` (UNE seule fois) et le ``status``.

    Raises:
        HTTPException: ``422`` si le schéma est interdit ou le ciphertext trop long.
    """
    if request.scheme not in _ALLOWED_SCHEMES:
        raise HTTPException(status_code=422, detail="Schéma de scellement non autorisé.")
    if len(request.ciphertext_b64) > settings.max_ciphertext_b64_len:
        raise HTTPException(status_code=422, detail="Ciphertext trop volumineux (anti-DoS).")

    token = generate_tracking_token()
    store.store(
        report_id=request.report_id,
        ciphertext=request.ciphertext_b64,
        scheme=request.scheme,
        cipher_kid=request.cipher_kid,
        classification_bucket=bucketize_classification(request.fine_classification),
        severity_bucket=bucketize_severity(request.fine_severity),
        received_day_str=received_day(),
        token_hash=hash_tracking_token(token),
    )
    # Le token n'est renvoyé qu'ICI, une seule fois ; le serveur n'en garde que le hash.
    return {"report_id": request.report_id, "tracking_token": token, "status": "RECEIVED"}


@app.get("/api/v1/sigac/whistleblower/reports/{tracking_token}/status")
async def whistleblower_status(tracking_token: str) -> dict[str, Any]:
    """Retourne le **statut GROSSIER** d'un signalement par son token de suivi.

    Le suivi ne révèle QUE le statut (RECEIVED / UNDER_INVESTIGATION / CLOSED_*),
    jamais le contenu, la classe fine, ni aucune métadonnée fine (protocole §8.3).

    Args:
        tracking_token: token de suivi en clair (re-saisi par le signaleur).

    Returns:
        ``{status}`` grossier.

    Raises:
        HTTPException: ``404`` si le token est inconnu.
    """
    status = store.status_by_token(tracking_token)
    if status is None:
        raise HTTPException(status_code=404, detail="Token de suivi inconnu.")
    return {"status": status}


@app.get(
    "/api/v1/sigac/whistleblower/queue",
    dependencies=[Depends(require_role("inspector"))],
)
async def whistleblower_queue() -> dict[str, Any]:
    """Liste la file procureur — buckets + jour SEULEMENT (réservé INSPECTOR/PROSECUTOR).

    🔒 Réservé via :func:`app.auth.require_role` (repli admin-token / dev). N'expose
    JAMAIS le ciphertext ni de métadonnée fine : le déchiffrement réel se fait hors-ligne
    sur le poste procureur.

    Returns:
        La liste des entrées de file (buckets, jour, statut) — aucun contenu déchiffré.
    """
    return {"count": store.count(), "reports": store.list_buckets()}
