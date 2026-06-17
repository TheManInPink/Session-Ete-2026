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

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import settings
from .inference import registry

# Borne de taille de lot (évite un appel de scoring synchrone non borné = levier DoS).
_MAX_BATCH = 1000


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Garde admin : exige X-Admin-Token si ``AI_ADMIN_TOKEN`` est défini.

    En développement (jeton non configuré), l'endpoint reste ouvert. En production,
    définissez ``AI_ADMIN_TOKEN`` pour exiger l'en-tête. Complète le RBAC Keycloak
    (doc 08) sans le remplacer.
    """
    if settings.admin_token and x_admin_token != settings.admin_token:
        raise HTTPException(status_code=403, detail="Jeton admin requis ou invalide.")


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
@app.get("/api/v1/ai/health")
async def health_check():
    """Endpoint de santé — vérifie que le service IA est opérationnel.

    Returns:
        dict: Statut du service avec timestamp et état du modèle.
    """
    return {
        "status": "ok",
        "service": "ai-service",
        "model_loaded": registry.is_loaded,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/ai/model-info")
async def model_info():
    """Retourne les métadonnées du modèle actuellement chargé.

    Returns:
        dict: Nom, classes, nombre de variables, métriques de test, versions.
    """
    return registry.status()


@app.post("/api/v1/ai/reload-models", dependencies=[Depends(require_admin)])
async def reload_models():
    """Recharge à chaud le modèle XGBoost depuis ``ai-models/exported`` (endpoint admin).

    🔒 Protégé par :func:`require_admin` : si ``AI_ADMIN_TOKEN`` est défini, l'en-tête
    ``X-Admin-Token`` est exigé. À compléter par le rôle ADMIN Keycloak (doc 08).

    Returns:
        dict: Statut du registre après rechargement.
    """
    return registry.reload()


@app.post("/api/v1/ai/score")
async def score(request: ScoreRequest):
    """Score un lot d'enregistrements (étape 4 « Scoring » du pipeline).

    Args:
        request: Lot d'enregistrements citoyens.

    Returns:
        dict: Résultats de scoring (type d'erreur prédit, score, recommandation).

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
    return {"count": len(results), "results": results}
