"""
Point d'entrée du service IA (ai-service) — port 3003.

Ce service expose un pipeline de détection d'erreurs en 5 étapes :
1. Ingestion des données NINA
2. Normalisation et préparation
3. Analyse (Jaro-Winkler, Soundex, NER, règles métier)
4. Scoring (XGBoost)
5. Soumission des corrections

Auteur  : Étudiant UQAR
Date    : 2026
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="NINA-AES AI Service",
    description="Module IA de détection et correction des erreurs de saisie NINA",
    version="0.1.0",
    docs_url="/api/v1/ai/docs",
    openapi_url="/api/v1/ai/openapi.json",
)

# Configuration CORS pour le développement
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/ai/health")
async def health_check():
    """
    Endpoint de santé — vérifie que le service IA est opérationnel.

    Returns:
        dict: Statut du service avec timestamp
    """
    from datetime import datetime, timezone

    return {
        "status": "ok",
        "service": "ai-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
