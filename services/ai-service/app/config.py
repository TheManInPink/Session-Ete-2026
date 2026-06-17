"""
Configuration du service IA via variables d'environnement.

Utilise pydantic-settings pour la validation et le typage.
"""

from pathlib import Path

from pydantic_settings import BaseSettings

# Racine du dépôt résolue depuis ce fichier :
#   <repo>/services/ai-service/app/config.py
#   parents[0]=app  parents[1]=ai-service  parents[2]=services  parents[3]=<repo>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_EXPORTED = _REPO_ROOT / "ai-models" / "exported"


class AIServiceSettings(BaseSettings):
    """Configuration du service IA avec valeurs par défaut pour le développement."""

    # Serveur
    host: str = "0.0.0.0"
    port: int = 3003

    # Base de données NINA (lecture seule)
    database_url: str = "postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db"

    # Seuils du pipeline IA (en pourcentage du score P(erreur)).
    ai_auto_threshold: float = 85.0  # Score >= 85% → correction automatique
    ai_review_threshold: float = 60.0  # Score 60-84% → revue manuelle
    ai_batch_size: int = 1000  # Nombre d'enregistrements par batch

    # ── Modèles exportés par le pipeline ai-models/training ──────────────────
    # Bundle joblib auto-suffisant (modèle + FeatureBuilder + LabelEncoder).
    # Cf. ai-models/training/README.md.
    xgboost_bundle_path: str = str(_EXPORTED / "xgboost_v1.joblib")
    isolation_forest_path: str = str(_EXPORTED / "isolation_forest_v1.joblib")

    # Conservé pour compatibilité descendante (ancienne convention JSON XGBoost).
    xgboost_model_path: str = str(_REPO_ROOT / "ai-models" / "trained" / "xgboost_nina.json")

    # ── Sécurité / réseau ────────────────────────────────────────────────────
    # Jeton admin pour les opérations sensibles (rechargement de modèle). Vide en
    # dev (endpoint ouvert) ; défini en prod → en-tête X-Admin-Token requis. Ce
    # contrôle interne complète (ne remplace pas) le RBAC Keycloak prévu doc 08.
    admin_token: str = ""

    # Origines CORS autorisées. ⚠️ Ne jamais combiner "*" avec credentials :
    # main.py désactive automatiquement allow_credentials si "*" est présent.
    cors_origins: list[str] = ["*"]

    model_config = {"env_prefix": "AI_"}


settings = AIServiceSettings()
