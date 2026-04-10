"""
Point d'entrée du SIGAC (anticorruption-service) — port 3009.

Détection algorithmique des comportements anormaux, scoring
d'intégrité des agents, gestion des signalements anonymes.

Auteur  : Étudiant UQAR
Date    : 2026
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="NINA-AES SIGAC",
    description="Système Intégré de Gouvernance Anti-Corruption",
    version="0.1.0",
    docs_url="/api/v1/sigac/docs",
    openapi_url="/api/v1/sigac/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/sigac/health")
async def health_check():
    """Endpoint de santé du service SIGAC."""
    from datetime import datetime, timezone

    return {
        "status": "ok",
        "service": "anticorruption-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
