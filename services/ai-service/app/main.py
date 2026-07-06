"""
Point d'entrée du service IA (ai-service) — port 3003.

Ce service expose un pipeline de détection d'erreurs en 5 étapes :
1. Ingestion des données NINA
2. Normalisation et préparation
3. Analyse (Jaro-Winkler, Soundex, NER, règles métier)
4. Scoring (XGBoost)
5. Soumission des corrections

Le modèle XGBoost (bundle exporté par ai-models/training) est chargé au
démarrage et rechargeable à chaud via POST /api/v1/ai/reload-models.

Auteur  : Étudiant UQAR
Date    : 2026
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import require_role
from .config import settings
from .inference import registry

# Borne de taille de lot (évite un appel de scoring synchrone non borné = levier DoS).
_MAX_BATCH = 1000


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Cycle de vie : charge le modèle au démarrage (chargement non bloquant si absent)."""
    status = registry.load()
    if status["loaded"]:
        print(
            f"[ai-service] Modèle chargé : {status['model_name']} "
            f"({status['n_features']} variables)."
        )
    else:
        # On ne bloque pas le démarrage : le service reste « live » et le modèle
        # peut être chargé plus tard via /reload-models.
        print(f"[ai-service] ⚠️ Modèle non chargé : {status['error']}")
    yield


app = FastAPI(
    title="NINA-AES AI Service",
    description="Module IA de détection et correction des erreurs de saisie NINA",
    version="0.1.0",
    docs_url="/api/v1/ai/docs",
    openapi_url="/api/v1/ai/openapi.json",
    lifespan=lifespan,
)

# Configuration CORS pilotée par la config. La spec CORS interdit de combiner
# une origine "*" avec credentials → on désactive allow_credentials dans ce cas
# (le service est derrière la gateway et ne manipule pas de cookies navigateur).
_cors_origins = settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials="*" not in _cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
#  Schémas de requête / réponse
# ──────────────────────────────────────────────────────────────────────────────
class CitizenRecord(BaseModel):
    """Enregistrement citoyen minimal soumis au scoring IA."""

    nina: str = Field(..., description="Numéro NINA (15 caractères).")
    first_name: str = ""
    last_name: str = ""
    birth_date: str = Field("", description="Date ISO YYYY-MM-DD.")
    sex: str = ""
    region_code: str = ""
    birth_region: str = ""
    cercle: str = ""
    commune: str = ""
    village: str = ""
    # Alignés avec REQUIRED_TEXT_COLUMNS (schéma de données) bien qu'actuellement
    # non consommés par le FeatureBuilder — évite une dérive serve/train future.
    father_name: str = ""
    mother_name: str = ""
    language: str = ""


class ScoreRequest(BaseModel):
    """Lot d'enregistrements à scorer (taille bornée pour éviter un abus DoS)."""

    records: list[CitizenRecord] = Field(..., min_length=1, max_length=_MAX_BATCH)


# ──────────────────────────────────────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────────────────────────────────────
def _health_payload() -> dict:
    """Charge utile de santé partagée par les sondes."""
    return {
        "status": "ok",
        "service": "ai-service",
        "model_loaded": registry.is_loaded,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
async def health_probe():
    """Liveness **non préfixée** — cible de la sonde Docker/K8s (`curl /health`).

    Convention plateforme : la sonde conteneur interroge `/health` (cf. Dockerfile),
    distincte de l'endpoint API préfixé ci-dessous.
    """
    return _health_payload()


@app.get("/api/v1/ai/health")
async def health_check():
    """Endpoint de santé (préfixé API) — état du service et du modèle.

    Returns:
        dict: Statut du service avec timestamp et état du modèle.
    """
    return _health_payload()


@app.get("/api/v1/ai/model-info")
async def model_info():
    """Retourne les métadonnées du modèle actuellement chargé.

    Returns:
        dict: Nom, classes, nombre de variables, métriques de test, versions.
    """
    return registry.status()


@app.post("/api/v1/ai/reload-models", dependencies=[Depends(require_role("admin"))])
async def reload_models():
    """Recharge à chaud le modèle XGBoost depuis ``ai-models/exported`` (endpoint admin).

    🔒 Protégé par :func:`app.auth.require_role` (escalade RBAC) : si ``AI_JWKS_URL``
    est défini, un Bearer RS256 portant le rôle ``admin`` est exigé (RBAC Keycloak,
    doc 08) ; sinon, repli sur ``X-Admin-Token`` (``AI_ADMIN_TOKEN``) ; sinon, ouvert
    en développement.

    Returns:
        dict: Statut du registre après rechargement.
    """
    return registry.reload()


def _mask_nina(nina: str) -> str:
    """Masque un NINA pour limiter la surface de dé-anonymisation dans les réponses.

    On ne renvoie que les 4 derniers caractères (``***********3456A`` → ``…3456A``).
    Le NINA en clair n'est jamais ré-émis par un endpoint de scoring : le client
    corrèle ses résultats par l'ordre du lot (réponse alignée sur ``records``).

    Args:
        nina: NINA en clair fourni dans la requête.

    Returns:
        Une forme masquée ne révélant que les 4 derniers caractères.
    """
    s = str(nina or "")
    return f"…{s[-4:]}" if len(s) > 4 else "…"


@app.post("/api/v1/ai/score", dependencies=[Depends(require_role("agent"))])
async def score(request: ScoreRequest):
    """Score un lot d'enregistrements (étape 4 « Scoring » du pipeline).

    🔒 Protégé par :func:`app.auth.require_role` (défense en profondeur) : si
    ``AI_JWKS_URL`` est défini, un Bearer RS256 portant le rôle ``agent`` est exigé
    (RBAC Keycloak, doc 08) ; sinon repli sur ``X-Admin-Token`` ; sinon ouvert en
    dev. On ne se repose donc plus uniquement sur la gateway pour l'auth — même
    garde que ``/reload-models``. Le rate-limiting reste assuré à la gateway.

    Args:
        request: Lot d'enregistrements citoyens.

    Returns:
        dict: Résultats de scoring (type d'erreur prédit, score, recommandation).
        Le NINA est **masqué** (4 derniers caractères) pour ne pas ré-émettre une
        donnée identifiante en clair.

    Raises:
        HTTPException: 503 si aucun modèle n'est chargé (le statut HTTP reflète
        l'indisponibilité, pour que la gateway ne traite pas un service dégradé
        comme un succès).
    """
    if not registry.is_loaded:
        raise HTTPException(
            status_code=503,
            detail={"error": "model_not_loaded", "hint": "POST /api/v1/ai/reload-models"},
        )
    results = registry.predict([r.model_dump() for r in request.records])
    # Masque le NINA dans la charge utile de réponse (limite la dé-anonymisation) ;
    # ne pas dépendre du redactor structlog (src/observability.py) non câblé ici.
    for item in results:
        if "nina" in item:
            item["nina"] = _mask_nina(item["nina"])
    return {"count": len(results), "results": results}
