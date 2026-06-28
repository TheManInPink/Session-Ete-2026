"""
Canal lanceur d'alerte SIGAC — confidentialité RÉELLE (CANON corrigé P0).

Source : doc 23 §4.5 + ``docs/sigac/WHISTLEBLOWER-PROTOCOL.md`` §4-§8.

PRINCIPE FONDATEUR (à ne JAMAIS enfreindre) :

- Le **scellement** se fait **côté client** (borne USSD / passerelle) avec la **clé
  PUBLIQUE** du procureur. Le serveur ne reçoit **QUE** le ciphertext.
- Le serveur **NE DÉCHIFFRE JAMAIS** : il ne détient **aucune** clé privée. Seul le
  procureur (hors-ligne / via recovery SSS M-of-N 3-of-5) le peut. Aucun endpoint de
  déchiffrement server-side n'existe ni ne doit exister.
- Schéma recommandé : **sealed box libsodium** = ``crypto_box_seal`` (X25519 ECDH +
  XSalsa20-Poly1305). Variante : **RSA-OAEP SHA-256** (clé ``rsa-4096``). **JAMAIS
  Ed25519** (= signature, pas chiffrement).
- **ANTI-CORRÉLATION** : on ne stocke en clair que des **buckets grossiers**
  (classification/severité) + le **JOUR** (pas l'heure). Aucune IP, aucun numéro,
  aucun correlation-id, aucun timestamp précis. La classification/severité FINES vivent
  DANS le ciphertext (lisible du seul procureur).
- **Token de suivi** : secret aléatoire 128 bits (``secrets.token_*``), **NON dérivé**
  de l'identité du plaignant. Le serveur ne stocke qu'un **hash SHA-256** du token.

> ⚠️ RISQUE RÉSIDUEL OPÉRATEUR (doc 23 §6 bis / protocole §9) : le canal USSD transite
> par un agrégateur tiers (Africa's Talking) qui voit le MSISDN dans ses CDR. Hors de
> notre contrôle → le canal n'est PAS « anonyme de bout en bout » tant qu'un agrégateur
> national / SMSC on-prem ne route pas ``*123*ALERTE#``. Documenté, non corrigeable ici.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import base64
import datetime as _dt
import hashlib
import json
import secrets
import threading
from dataclasses import dataclass, field
from typing import Any

# ── Vocabulaire métier (aligné Prisma doc 23 §4.1) ─────────────────────────────
#: Schémas de scellement autorisés (et SEULEMENT ceux-là).
SCHEME_SEALED_BOX_X25519 = "SEALED_BOX_X25519"
SCHEME_RSA_OAEP_4096 = "RSA_OAEP_4096"
_ALLOWED_SCHEMES = {SCHEME_SEALED_BOX_X25519, SCHEME_RSA_OAEP_4096}

#: Classifications FINES (sortie BERT) — transportées DANS le ciphertext.
FINE_CLASSIFICATIONS = (
    "CORRUPTION_FINANCIAL",
    "ABUSE_OF_POWER",
    "IDENTITY_FRAUD",
    "DATA_LEAK",
    "HARASSMENT",
    "OTHER",
)
#: Severités FINES — transportées DANS le ciphertext.
FINE_SEVERITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

#: Statuts du cycle de vie d'un signalement (protocole §6.4).
STATUS_RECEIVED = "RECEIVED"
STATUS_ACKNOWLEDGED = "ACKNOWLEDGED"
STATUS_UNDER_INVESTIGATION = "UNDER_INVESTIGATION"
STATUS_CLOSED_FOUNDED = "CLOSED_FOUNDED"
STATUS_CLOSED_UNFOUNDED = "CLOSED_UNFOUNDED"
STATUS_CLOSED_DUPLICATE = "CLOSED_DUPLICATE"


# ──────────────────────────────────────────────────────────────────────────────
#  Anti-corrélation : bucketisation GROSSIÈRE (réduit l'entropie identifiante)
# ──────────────────────────────────────────────────────────────────────────────
def bucketize_classification(fine_classification: str) -> str:
    """Réduit une classification FINE (6 valeurs) à un bucket GROSSIER (3 valeurs).

    POURQUOI : la classe fine est identifiante par recoupement. On ne stocke en clair
    qu'un bucket grossier ; la vérité fine reste chiffrée (lisible du seul procureur).

    Args:
        fine_classification: classe BERT précise (ex. ``"CORRUPTION_FINANCIAL"``).

    Returns:
        Le bucket grossier (``FINANCIAL_OR_POWER`` | ``FRAUD_OR_LEAK`` | ``OTHER_BUCKET``).
    """
    mapping = {
        "CORRUPTION_FINANCIAL": "FINANCIAL_OR_POWER",
        "ABUSE_OF_POWER": "FINANCIAL_OR_POWER",
        "IDENTITY_FRAUD": "FRAUD_OR_LEAK",
        "DATA_LEAK": "FRAUD_OR_LEAK",
        "HARASSMENT": "OTHER_BUCKET",
        "OTHER": "OTHER_BUCKET",
    }
    return mapping.get(str(fine_classification).upper(), "OTHER_BUCKET")


def bucketize_severity(fine_severity: str) -> str:
    """Réduit une severité FINE (4 niveaux) à un bucket GROSSIER (2 niveaux).

    POURQUOI : 2 niveaux au lieu de 4 réduisent l'entropie permettant de recouper.

    Args:
        fine_severity: severité précise (ex. ``"CRITICAL"``).

    Returns:
        ``LOW_MED`` (LOW/MEDIUM) ou ``HIGH_CRIT`` (HIGH/CRITICAL).
    """
    return "HIGH_CRIT" if str(fine_severity).upper() in {"HIGH", "CRITICAL"} else "LOW_MED"


def received_day(now: _dt.datetime | None = None) -> str:
    """Retourne le JOUR (``YYYY-MM-DD``) — bucketisation temporelle, PAS l'heure.

    POURQUOI : un timestamp à la seconde + IP suffit à recouper « qui était au guichet
    à 14h03:12 ». On ne conserve que le jour (UTC).

    Args:
        now: instant de référence (UTC) ; ``None`` = maintenant.

    Returns:
        La date du jour au format ISO ``YYYY-MM-DD``.
    """
    moment = now or _dt.datetime.now(_dt.timezone.utc)
    return moment.date().isoformat()


# ──────────────────────────────────────────────────────────────────────────────
#  Token de suivi anonyme (NON dérivé de l'identité — protocole §8)
# ──────────────────────────────────────────────────────────────────────────────
def generate_tracking_token() -> str:
    """Génère un token de suivi : secret aléatoire 128 bits, **non dérivé du numéro**.

    POURQUOI PAS ``hash(numéro)`` : quiconque connaît un numéro pourrait recalculer le
    token et corréler le signalement à une personne (désanonymisation triviale). Le
    token est donc un secret CSPRNG **indépendant** de toute identité.

    Returns:
        Un token URL-safe (>=128 bits d'entropie), affiché UNE fois au signaleur.
    """
    return secrets.token_urlsafe(16)  # 16 octets = 128 bits


def hash_tracking_token(token: str) -> str:
    """Hash SHA-256 (hex) d'un token de suivi — la SEULE forme stockée côté serveur.

    POURQUOI stocker un hash et pas le token : irréversibilité. Une fuite de la base ne
    livre pas les tokens, et le hash n'est lié à aucune identité (ne casse pas l'anonymat).

    Args:
        token: le token de suivi en clair (saisi par le signaleur).

    Returns:
        L'empreinte SHA-256 hexadécimale du token.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ──────────────────────────────────────────────────────────────────────────────
#  Scellement CÔTÉ CLIENT (borne) — produit du ciphertext indéchiffrable serveur
# ──────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SealedReport:
    """Résultat du scellement, prêt à être POSTé au serveur (qui ne voit que ça)."""

    ciphertext_b64: str  # INDÉCHIFFRABLE sans la clé privée procureur
    cipher_kid: str  # version de la clé publique procureur utilisée
    scheme: str  # SEALED_BOX_X25519 | RSA_OAEP_4096


def _build_payload(plaintext_message: str, fine_classification: str, fine_severity: str) -> bytes:
    """Construit le payload SENSIBLE (caché du serveur) : message + classif/severité FINES.

    NB : volontairement PAS de timestamp précis, PAS de numéro, PAS d'IP ici non plus.
    """
    return json.dumps(
        {
            "message": plaintext_message,
            "classification": fine_classification,
            "severity": fine_severity,
        },
        ensure_ascii=False,
    ).encode("utf-8")


def seal_report_sealed_box(
    plaintext_message: str,
    fine_classification: str,
    fine_severity: str,
    prosecutor_pubkey_b64: str,
    cipher_kid: str,
) -> SealedReport:
    """Scelle un signalement avec la **clé publique X25519** du procureur (sealed box).

    POURQUOI cette fonction vit côté borne et PAS côté serveur : le plaintext ne doit
    JAMAIS transiter ni résider sur le serveur. ``crypto_box_seal`` génère une paire
    X25519 ÉPHÉMÈRE, fait l'ECDH avec la clé publique procureur, chiffre via
    XSalsa20-Poly1305, puis JETTE la clé privée éphémère : même la borne ne peut pas
    redéchiffrer après coup (« anonymous public-key encryption »). Seul le détenteur de
    la clé privée procureur (hors-ligne) peut ouvrir le message.

    Args:
        plaintext_message: le texte brut du signalement (≤ 160 chars USSD).
        fine_classification: la classe BERT précise (ex. ``"CORRUPTION_FINANCIAL"``).
        fine_severity: la severité précise (ex. ``"CRITICAL"``).
        prosecutor_pubkey_b64: clé PUBLIQUE X25519 du procureur (base64, 32 octets).
            Publiée largement — ce n'est PAS un secret.
        cipher_kid: identifiant de version de cette clé publique (ex. ``"proc-x25519-v1"``).

    Returns:
        SealedReport — uniquement du ciphertext + métadonnées de clé. Aucune donnée en clair.

    Raises:
        ValueError: si la clé publique n'a pas la longueur X25519 attendue (32 octets).
        RuntimeError: si PyNaCl (libsodium) n'est pas disponible dans l'environnement.
    """
    try:
        from nacl.public import PublicKey, SealedBox  # libsodium crypto_box_seal
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError(
            "PyNaCl (libsodium) requis pour SEALED_BOX_X25519 — `pip install pynacl`."
        ) from exc

    pubkey_raw = base64.b64decode(prosecutor_pubkey_b64)
    if len(pubkey_raw) != 32:
        # Garde-fou : une clé Ed25519 fait AUSSI 32 octets mais n'est PAS une clé
        # d'échange. La vraie défense est la séparation stricte des clés côté Vault.
        raise ValueError("Clé publique X25519 invalide (32 octets attendus).")

    payload = _build_payload(plaintext_message, fine_classification, fine_severity)
    sealed = SealedBox(PublicKey(pubkey_raw)).encrypt(payload)  # X25519 + XSalsa20-Poly1305
    return SealedReport(
        ciphertext_b64=base64.b64encode(sealed).decode("ascii"),
        cipher_kid=cipher_kid,
        scheme=SCHEME_SEALED_BOX_X25519,
    )


def seal_report_rsa_oaep(
    plaintext_message: str,
    fine_classification: str,
    fine_severity: str,
    prosecutor_rsa_pubkey_pem: bytes,
    cipher_kid: str,
) -> SealedReport:
    """Variante : scelle avec la **clé publique rsa-4096** du procureur (RSA-OAEP SHA-256).

    POURQUOI RSA-OAEP et pas RSA brut (PKCS#1 v1.5) : OAEP ajoute un padding aléatoire
    prouvé sûr contre les attaques à chiffré choisi ; PKCS#1 v1.5 est vulnérable
    (Bleichenbacher). On exige donc OAEP. POURQUOI type ``rsa-4096`` et JAMAIS
    ``ed25519`` : Ed25519 ne sert qu'à SIGNER ; ``transit/encrypt`` la refuse.

    Args:
        plaintext_message: le texte brut du signalement.
        fine_classification: la classe BERT précise.
        fine_severity: la severité précise.
        prosecutor_rsa_pubkey_pem: clé PUBLIQUE rsa-4096 au format PEM (diffusable).
        cipher_kid: identifiant de version de cette clé.

    Returns:
        SealedReport — ciphertext base64 (RSA-OAEP brut), déchiffrable du seul procureur.

    Raises:
        RuntimeError: si la lib ``cryptography`` n'est pas disponible.
    """
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError("La lib `cryptography` est requise pour RSA_OAEP_4096.") from exc

    public_key = serialization.load_pem_public_key(prosecutor_rsa_pubkey_pem)
    payload = _build_payload(plaintext_message, fine_classification, fine_severity)
    ciphertext = public_key.encrypt(
        payload,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return SealedReport(
        ciphertext_b64=base64.b64encode(ciphertext).decode("ascii"),
        cipher_kid=cipher_kid,
        scheme=SCHEME_RSA_OAEP_4096,
    )


# ──────────────────────────────────────────────────────────────────────────────
#  Stockage CÔTÉ SERVEUR — ciphertext ONLY, JAMAIS de déchiffrement
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class StoredReport:
    """Ligne ``whistleblower_reports`` telle que stockée — **aucune** donnée en clair.

    ⚠️ Ce dataclass ne contient AUCUN champ permettant de relier au plaignant :
    pas de ``phone``, pas de ``ip``, pas de ``correlation_id``, pas de timestamp précis.
    Seul le ciphertext est sensible — et le serveur ne peut pas l'ouvrir.
    """

    id: str  # uuid v4 aléatoire (non corrélable)
    ciphertext: str  # sealed box / RSA-OAEP base64 — indéchiffrable serveur
    scheme: str
    cipher_kid: str
    classification_bucket: str  # bucket GROSSIER (pas la classe fine)
    severity_bucket: str  # bucket GROSSIER (2 niveaux)
    received_day: str  # YYYY-MM-DD seulement (pas l'heure)
    token_hash: str  # SHA-256 du token de suivi (jamais le token en clair)
    status: str = STATUS_RECEIVED
    acknowledged_by: str | None = None
    acknowledged_at: str | None = None


class ReportStore:
    """Stockage en mémoire des signalements scellés (référence ; DB en prod).

    GARANTIE CENTRALE : cette classe **n'expose AUCUNE** méthode de déchiffrement.
    Elle ne détient aucune clé privée. Le seul accès au contenu passe par le procureur,
    hors-ligne, avec sa propre clé privée — jamais via ce service.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._by_id: dict[str, StoredReport] = {}
        self._by_token_hash: dict[str, str] = {}  # token_hash -> report.id

    def store(
        self,
        *,
        report_id: str,
        ciphertext: str,
        scheme: str,
        cipher_kid: str,
        classification_bucket: str,
        severity_bucket: str,
        received_day_str: str,
        token_hash: str,
    ) -> StoredReport:
        """Persiste un signalement scellé (ciphertext + buckets + jour seulement).

        Args:
            report_id: UUID v4 aléatoire fourni par la borne.
            ciphertext: payload scellé base64 (jamais déchiffré par le serveur).
            scheme: schéma de scellement (``SEALED_BOX_X25519`` | ``RSA_OAEP_4096``).
            cipher_kid: version de la clé publique utilisée.
            classification_bucket: bucket grossier de classification.
            severity_bucket: bucket grossier de severité.
            received_day_str: JOUR (``YYYY-MM-DD``), pas l'heure.
            token_hash: hash SHA-256 du token de suivi.

        Returns:
            La ligne stockée.

        Raises:
            ValueError: si le schéma n'est pas un schéma autorisé.
        """
        if scheme not in _ALLOWED_SCHEMES:
            raise ValueError(f"Schéma de scellement non autorisé : {scheme!r}")
        with self._lock:
            row = StoredReport(
                id=report_id,
                ciphertext=ciphertext,
                scheme=scheme,
                cipher_kid=cipher_kid,
                classification_bucket=classification_bucket,
                severity_bucket=severity_bucket,
                received_day=received_day_str,
                token_hash=token_hash,
            )
            self._by_id[report_id] = row
            self._by_token_hash[token_hash] = report_id
            return row

    def status_by_token(self, token: str) -> str | None:
        """Retourne le **statut grossier** d'un signalement par son token de suivi.

        Le suivi ne révèle QUE le statut (RECEIVED / UNDER_INVESTIGATION / CLOSED_*),
        jamais le contenu, la classe fine, ni aucune métadonnée fine (protocole §8.3).

        Args:
            token: le token de suivi en clair (re-saisi par le signaleur).

        Returns:
            Le statut, ou ``None`` si le token est inconnu.
        """
        with self._lock:
            report_id = self._by_token_hash.get(hash_tracking_token(token))
            row = self._by_id.get(report_id) if report_id else None
            return row.status if row else None

    def list_buckets(self) -> list[dict[str, Any]]:
        """Liste la file procureur — buckets + jour SEULEMENT (jamais de contenu).

        Destiné au dashboard SIGAC (réservé INSPECTOR/PROSECUTOR). N'expose JAMAIS le
        ciphertext ni de métadonnée fine : le déchiffrement réel se fait hors-ligne.

        Returns:
            Une liste de dicts ``{id, classification_bucket, severity_bucket,
            received_day, status, scheme, cipher_kid}`` — aucun contenu déchiffré.
        """
        with self._lock:
            return [
                {
                    "id": r.id,
                    "classification_bucket": r.classification_bucket,
                    "severity_bucket": r.severity_bucket,
                    "received_day": r.received_day,
                    "status": r.status,
                    "scheme": r.scheme,
                    "cipher_kid": r.cipher_kid,
                }
                for r in self._by_id.values()
            ]

    def count(self) -> int:
        """Nombre de signalements stockés (métrique de file, non identifiante)."""
        with self._lock:
            return len(self._by_id)


# Singleton partagé par l'application FastAPI (en prod : remplacé par la table Prisma).
store = ReportStore()


@dataclass(frozen=True)
class PublicKeyBundle:
    """Bundle de clé PUBLIQUE diffusable au client (borne) pour sceller localement."""

    scheme: str
    cipher_kid: str
    public_key: str  # base64 (X25519) ou PEM (RSA) — NON secret
    fields: dict[str, str] = field(default_factory=dict)
