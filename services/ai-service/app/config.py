"""
Configuration du service IA via variables d'environnement.

Utilise pydantic-settings pour la validation et le typage.
"""

from pydantic_settings import BaseSettings


class AIServiceSettings(BaseSettings):
    """Configuration du service IA avec valeurs par défaut pour le développement."""

    # Serveur
    host: str = "0.0.0.0"
    port: int = 3003

    # Base de données NINA (lecture seule)
    database_url: str = "postgresql://nina:nina_dev@localhost:5432/nina_aes"

    # Seuils du pipeline IA
    ai_auto_threshold: float = 85.0      # Score >= 85% → correction automatique
    ai_review_threshold: float = 60.0    # Score 60-84% → revue manuelle
    ai_batch_size: int = 1000            # Nombre d'enregistrements par batch

    # Modèle XGBoost
    xgboost_model_path: str = "../../ai-models/trained/xgboost_nina.json"

    model_config = {"env_prefix": "AI_"}


settings = AIServiceSettings()
