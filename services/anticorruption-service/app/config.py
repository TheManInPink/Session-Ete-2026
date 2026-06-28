"""
Configuration du service SIGAC (anticorruption-service) via variables d'environnement.

Utilise pydantic-settings pour la validation et le typage. **Aucun secret en clair**
n'est commité : les valeurs sensibles (URL base, audience JWT, chemins de modèles)
proviennent de l'environnement ou de Vault (AppRole, lease court) à l'exécution.

⚠️ CANON crypto (doc 23 §4.5 + WHISTLEBLOWER-PROTOCOL §4) : le service NE détient
**jamais** de clé privée de déchiffrement. Il n'expose que la **clé publique** du
procureur (X25519 sealed box ou RSA-OAEP `rsa-4096`). Aucun `VAULT_TOKEN` long-lived
n'est jamais lu ni stocké ici (correctif P0).

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from pathlib import Path

from pydantic_settings import BaseSettings

# Racine du dépôt résolue depuis ce fichier :
#   <repo>/services/anticorruption-service/app/config.py
#   parents[0]=app  parents[1]=anticorruption-service  parents[2]=services  parents[3]=<repo>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_EXPORTED = _REPO_ROOT / "ai-models" / "exported"


class SIGACSettings(BaseSettings):
    """Configuration SIGAC avec valeurs par défaut **sûres** pour le développement."""

    # ── Serveur ──────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 3009

    # Base de données (lecture seule sur audit_logs, écriture scores/reports).
    # AUCUN identifiant en clair commité : la valeur réelle vient de l'env / Vault.
    # Vide par défaut → le service n'embarque aucun mot de passe DB dans le dépôt.
    database_url: str = ""

    # ── Canal lanceur d'alerte — CLÉ PUBLIQUE du procureur (PAS un secret) ────
    # Le serveur diffuse cette clé PUBLIQUE pour que le client (borne USSD) scelle
    # côté client. Le serveur NE déchiffre JAMAIS : il n'a aucune clé privée.
    #   - whistleblower_scheme : "SEALED_BOX_X25519" (recommandé) | "RSA_OAEP_4096"
    #   - prosecutor_pubkey_b64 : clé publique X25519 (32 octets, base64) — sealed box
    #   - prosecutor_pubkey_pem : clé publique rsa-4096 (PEM) — variante RSA-OAEP
    #   - cipher_kid : identifiant de version de la clé (rotation/traçabilité)
    whistleblower_scheme: str = "SEALED_BOX_X25519"
    prosecutor_pubkey_b64: str = ""
    prosecutor_pubkey_pem: str = ""
    cipher_kid: str = "proc-x25519-v1"

    # Bornes de taille du message scellé reçu (anti-DoS). Le ciphertext base64 d'une
    # sealed box d'un message USSD (≤160 chars) reste petit ; on borne large mais fini.
    max_ciphertext_b64_len: int = 8192

    # ── Scoring d'intégrité (SCORING-RUNBOOK §1.2) ───────────────────────────
    # Convention : overallScore ÉLEVÉ = BON. Bandes de gouvernance versionnées
    # (ADR-023) : ≥85 INTEGRE / 70-84 A_SURVEILLER / <70 A_INVESTIGUER.
    integrity_band_integre: float = 85.0
    integrity_band_investigate: float = 70.0
    # Nombre minimal d'actions pour produire un score (sinon INSUFFICIENT_DATA,
    # JAMAIS un 0 pénalisant — garde-fou n°1 du runbook).
    min_actions_for_score: int = 5

    # ── Détection d'anomalies (Isolation Forest — doc 23 §4.2) ───────────────
    # a priori (PAS une vérité terrain) ; recalibrable (runbook §6).
    anomaly_contamination: float = 0.02
    anomaly_n_estimators: int = 200
    anomaly_flag_threshold: float = 75.0  # anomaly_score (100 = très anormal)
    # Bundle Isolation Forest exporté + sidecar .sha256 (intégrité fail-closed).
    isolation_forest_path: str = str(_EXPORTED / "isolation_forest_v1.joblib")
    # Défaut fail-closed : refuse un bundle .pkl/.joblib SANS sidecar .sha256.
    require_signed_bundle: bool = True

    # ── Sécurité / réseau ────────────────────────────────────────────────────
    # Jeton admin pour les opérations sensibles (repli si pas de JWKS). Vide en dev.
    admin_token: str = ""

    # Origines CORS. ⚠️ Ne jamais combiner "*" avec credentials : main.py FORCE
    # ``allow_credentials=False`` dès que "*" est présent (logique réellement
    # implémentée — wildcard crédentialé interdit par la spec CORS). En production,
    # définir un allowlist explicite via ``SIGAC_CORS_ORIGINS`` (réactive credentials).
    cors_origins: list[str] = ["*"]

    # ── RBAC (doc 08 — auth-service / Keycloak), PyJWT RS256 + JWKS ───────────
    # URL JWKS de l'émetteur. Si défini, les endpoints sensibles exigent un Bearer
    # RS256 valide portant le rôle requis ; sinon repli admin_token ; sinon (dev) ouvert.
    jwks_url: str = ""
    # Audience attendue dans le JWT (vide = non vérifiée).
    jwt_audience: str = ""
    # Émetteur attendu (iss). Vide = non vérifié.
    jwt_issuer: str = ""

    model_config = {"env_prefix": "SIGAC_"}


settings = SIGACSettings()
