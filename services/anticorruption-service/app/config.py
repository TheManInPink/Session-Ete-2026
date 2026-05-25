"""Configuration du service SIGAC."""

from pydantic_settings import BaseSettings


class SIGACSettings(BaseSettings):
    """Configuration SIGAC avec valeurs par défaut."""

    host: str = "0.0.0.0"
    port: int = 3009
    database_url: str = "postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db"

    # Seuils de scoring d'intégrité
    integrity_critical_threshold: float = 40.0
    integrity_warning_threshold: float = 60.0

    model_config = {"env_prefix": "SIGAC_"}


settings = SIGACSettings()
