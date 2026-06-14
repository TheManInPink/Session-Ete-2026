"""
config.py — Configuration centralisée du service IA (ai-service).

Chargée via `pydantic-settings` : chaque attribut peut être surchargé par une
variable d'environnement préfixée `AI_` (ex. `AI_PORT=3003`,
`AI_SPACY_MODEL=fr_core_news_lg`).

Principe de souveraineté & sécurité : **aucun secret en clair ici**. Les
identifiants de base de données et clés de modèle transitent par HashiCorp
Vault (cf. `app/vault.py`) ; les valeurs par défaut ci-dessous ne servent qu'au
développement local.

Référence : docs/11-AI-SERVICE-FASTAPI.md + docs/15-SECURITY-HARDENING.md.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings

# Racine du monorepo, calculée relativement à ce fichier :
#   .../nina-aes-platform/services/ai-service/app/config.py
#   parents[0]=app  parents[1]=ai-service  parents[2]=services  parents[3]=racine
_REPO_ROOT = Path(__file__).resolve().parents[3]


class AIServiceSettings(BaseSettings):
    """Configuration du service IA avec valeurs par défaut pour le développement."""

    # ─── Serveur ────────────────────────────────────────────────────
    host: str = "0.0.0.0"  # noqa: S104 — bind interne au réseau Docker/K3s
    port: int = 3003
    env: str = "development"
    cors_origins: list[str] = ["*"]

    # ─── Base de données NINA (lecture seule, optionnelle) ──────────
    # Le service est *stateless* : il ne possède pas de table propre. L'URL
    # n'est utilisée que pour des recherches de doublons côté identity-service.
    database_url: str = "postgresql://nina_admin:nina_dev_2026!@localhost:5432/nina_aes_db"

    # ─── Services amont/aval ────────────────────────────────────────
    api_gateway_url: str = "http://localhost:3000"
    identity_service_url: str = "http://localhost:3001"

    # ─── Seuils du pipeline IA (en pourcentage 0-100) ───────────────
    # Convention métier (doc 11 §2.3) : l'IA *propose*, l'humain *décide*.
    ai_auto_threshold: float = 85.0  # score >= 85 → proposition d'auto-approbation
    ai_review_threshold: float = 60.0  # 60-84 → file de revue manuelle ; <60 → log/urgence
    ai_batch_size: int = 1000  # taille max d'un lot d'analyse

    # ─── Modèles ML/NLP ─────────────────────────────────────────────
    # Chemins relatifs à la racine du monorepo. Absents par défaut : le service
    # démarre quand même et bascule sur des heuristiques transparentes.
    xgboost_model_path: str = str(_REPO_ROOT / "ai-models" / "trained" / "nina_detector_v1.pkl")
    # Le scoring XGBoost est **opt-in** : par défaut on garde l'heuristique, qui
    # est explicable (chaque variation de score correspond à une erreur listée).
    # Le modèle peut être pessimiste sur des dossiers propres sans fournir
    # d'explication, ce qui dégraderait l'UX « assistant à la décision ».
    ai_use_model: bool = False
    spacy_model: str = "fr_core_news_md"
    # Vérification d'intégrité optionnelle du modèle (SHA-256 attendu).
    model_expected_sha256: str | None = None

    # ─── OCR ────────────────────────────────────────────────────────
    ocr_languages: str = "fra+eng"  # codes Tesseract
    ocr_max_upload_bytes: int = 10 * 1024 * 1024  # 10 Mo

    # ─── Référentiel géographique Mali ──────────────────────────────
    mali_data_dir: str = str(_REPO_ROOT / "data" / "mali")

    # ─── Sécurité : contexte utilisateur signé par l'api-gateway ────
    # Le gateway termine l'auth (JWT RS256) et propage un en-tête
    # `X-User-Context` signé JWS HS256 (cf. ADR-029). Si ce secret est fourni,
    # le service vérifie la signature ; sinon il fait confiance au réseau
    # interne (mTLS) et se contente de lire le contexte.
    gateway_jws_secret: str | None = None
    # Émetteur attendu du contexte (validé uniquement s'il est défini).
    gateway_jws_issuer: str | None = None
    user_context_header: str = "x-user-context"

    model_config = {"env_prefix": "AI_", "extra": "ignore"}


# Instance unique partagée par toute l'application.
settings = AIServiceSettings()
