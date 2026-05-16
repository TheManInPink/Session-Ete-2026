"""
vault.py — Client HashiCorp Vault pour ai-service (FastAPI Python).

Equivalent fonctionnel de `@nina-aes/vault-client` (TypeScript) pour le
service IA. Utilise `hvac` (client officiel HashiCorp).

Caractéristiques :
    - Auth AppRole (recommandé) + token (dev) + Kubernetes SA
    - Cache mémoire TTL configurable (défaut 5 min)
    - Auto-renew thread arrière-plan
    - Méthodes : get_secret(), get_database_creds(), rotate_secret()

Usage type :
    from app.vault import VaultClient

    vault = VaultClient.from_env()
    vault.login()
    db_config = vault.get_secret("database/ai-service")
    db_creds = vault.get_database_creds("ai-readonly")

Variables d'env consommées :
    VAULT_ADDR, VAULT_AUTH_METHOD, VAULT_TOKEN,
    VAULT_APPROLE_ROLE_ID, VAULT_APPROLE_SECRET_ID,
    VAULT_KUBERNETES_ROLE

Référence : docs/15-SECURITY-HARDENING.md §4 + ADR-015 + ADR-023.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

try:
    import hvac
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "Le module 'hvac' est requis pour vault.py — l'ajouter à requirements.txt"
    ) from exc

logger = logging.getLogger("nina_aes.vault")


@dataclass
class DatabaseCredentials:
    """Credentials Postgres dynamiques (lease Vault). Auto-révoqués à TTL."""

    username: str
    password: str
    lease_id: str
    lease_ttl: int  # secondes
    renewable: bool


@dataclass
class _CacheEntry:
    """Entrée de cache avec horodatage d'expiration."""

    value: Any
    expires_at: float = field(default_factory=lambda: time.time() + 300)


class VaultClient:
    """Client Vault avec cache et auto-renew.

    Attributes:
        endpoint: URL Vault (ex. http://vault:8200).
        auth_method: 'token' | 'approle' | 'kubernetes'.
        cache_ttl: TTL du cache mémoire en secondes (défaut 300).
        kv_mount: Préfixe kv-v2 (défaut 'kv').
    """

    def __init__(
        self,
        endpoint: str,
        auth_method: str = "approle",
        cache_ttl: int = 300,
        kv_mount: str = "kv",
        auto_renew: bool = True,
        request_timeout: float = 5.0,
        **auth_kwargs: Any,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.auth_method = auth_method
        self.cache_ttl = cache_ttl
        self.kv_mount = kv_mount
        self.auto_renew = auto_renew
        self.auth_kwargs = auth_kwargs

        self._client = hvac.Client(url=self.endpoint, timeout=request_timeout)
        self._cache: dict[str, _CacheEntry] = {}
        self._cache_lock = threading.Lock()
        self._renew_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    # ─── Constructeur depuis l'environnement ────────────────────────
    @classmethod
    def from_env(cls) -> "VaultClient":
        """Construit un client à partir des variables d'environnement.

        Returns:
            Instance configurée selon VAULT_ADDR + VAULT_AUTH_METHOD.

        Raises:
            RuntimeError: si VAULT_ADDR n'est pas défini.
        """
        endpoint = os.environ.get("VAULT_ADDR")
        if not endpoint:
            raise RuntimeError("VAULT_ADDR non défini")

        method = os.environ.get("VAULT_AUTH_METHOD", "approle")

        kwargs: dict[str, Any] = {}
        if method == "token":
            kwargs["token"] = os.environ.get("VAULT_TOKEN", "nina-dev")
        elif method == "approle":
            kwargs["role_id"] = os.environ.get("VAULT_APPROLE_ROLE_ID", "")
            kwargs["secret_id"] = os.environ.get("VAULT_APPROLE_SECRET_ID", "")
        elif method == "kubernetes":
            kwargs["role"] = os.environ["VAULT_KUBERNETES_ROLE"]
            kwargs["jwt_path"] = os.environ.get(
                "VAULT_K8S_JWT_PATH",
                "/var/run/secrets/kubernetes.io/serviceaccount/token",
            )

        return cls(endpoint=endpoint, auth_method=method, **kwargs)

    # ─── Login / authentification ───────────────────────────────────
    def login(self) -> None:
        """Authentifie le client. À appeler une fois au démarrage.

        Raises:
            hvac.exceptions.Unauthorized: si Vault refuse l'auth.
        """
        if self.auth_method == "token":
            self._client.token = self.auth_kwargs["token"]
            lookup = self._client.auth.token.lookup_self()
            ttl = int(lookup.get("data", {}).get("ttl", 3600))
            logger.info("Auth Vault par token, TTL=%ds", ttl)

        elif self.auth_method == "approle":
            response = self._client.auth.approle.login(
                role_id=self.auth_kwargs["role_id"],
                secret_id=self.auth_kwargs["secret_id"],
            )
            ttl = int(response["auth"]["lease_duration"])
            logger.info("Auth Vault AppRole OK, TTL=%ds", ttl)

        elif self.auth_method == "kubernetes":
            jwt_path = Path(self.auth_kwargs["jwt_path"])
            jwt = jwt_path.read_text().strip()
            response = self._client.auth.kubernetes.login(
                role=self.auth_kwargs["role"], jwt=jwt
            )
            ttl = int(response["auth"]["lease_duration"])
            logger.info("Auth Vault Kubernetes OK, TTL=%ds", ttl)

        else:  # pragma: no cover
            raise ValueError(f"auth_method inconnu : {self.auth_method}")

        if self.auto_renew:
            self._start_renew_thread(ttl)

    def _start_renew_thread(self, initial_ttl: int) -> None:
        """Démarre un thread daemon qui renouvelle le token à 80 % TTL."""
        if self._renew_thread and self._renew_thread.is_alive():
            return

        def renew_loop() -> None:
            ttl = initial_ttl
            while not self._stop_event.is_set():
                # Attendre 80 % du TTL avant de tenter le renew
                sleep_for = max(ttl * 0.8, 30)
                if self._stop_event.wait(timeout=sleep_for):
                    return
                try:
                    resp = self._client.auth.token.renew_self()
                    ttl = int(resp["auth"]["lease_duration"])
                    logger.info("Token Vault renouvelé, nouveau TTL=%ds", ttl)
                except hvac.exceptions.VaultError as err:
                    logger.error("Échec renouvellement token Vault : %s", err)
                    return

        self._renew_thread = threading.Thread(
            target=renew_loop, name="vault-renew", daemon=True
        )
        self._renew_thread.start()

    # ─── API publique ───────────────────────────────────────────────
    def get_secret(self, path: str) -> dict[str, Any]:
        """Récupère un secret kv-v2 avec cache TTL.

        Args:
            path: chemin RELATIF au mount (ex. 'database/ai-service').

        Returns:
            Dict du champ `data` du secret.

        Raises:
            hvac.exceptions.InvalidPath: si le secret n'existe pas.
            hvac.exceptions.Forbidden: si la policy ne le permet pas.
        """
        cache_key = f"kv:{path}"
        with self._cache_lock:
            entry = self._cache.get(cache_key)
            if entry and entry.expires_at > time.time():
                logger.debug("Cache hit %s", cache_key)
                return entry.value

        response = self._client.secrets.kv.v2.read_secret_version(
            path=path, mount_point=self.kv_mount, raise_on_deleted_version=True
        )
        data = response["data"]["data"]

        with self._cache_lock:
            self._cache[cache_key] = _CacheEntry(
                value=data, expires_at=time.time() + self.cache_ttl
            )
        return data

    def get_database_creds(self, role: str) -> DatabaseCredentials:
        """Récupère des credentials Postgres dynamiques.

        Args:
            role: nom du rôle Vault database (ex. 'ai-readonly').

        Returns:
            DatabaseCredentials avec username, password, lease_ttl.
        """
        response = self._client.secrets.database.generate_credentials(name=role)
        return DatabaseCredentials(
            username=response["data"]["username"],
            password=response["data"]["password"],
            lease_id=response["lease_id"],
            lease_ttl=int(response["lease_duration"]),
            renewable=bool(response["renewable"]),
        )

    def transit_encrypt(self, key_name: str, plaintext_b64: str) -> str:
        """Chiffre un payload base64 avec une clé Transit.

        Args:
            key_name: nom de la clé (ex. 'sigac-whistleblower').
            plaintext_b64: payload encodé base64.

        Returns:
            Ciphertext format `vault:vN:<base64>`.
        """
        response = self._client.secrets.transit.encrypt_data(
            name=key_name, plaintext=plaintext_b64
        )
        return response["data"]["ciphertext"]

    def transit_decrypt(self, key_name: str, ciphertext: str) -> str:
        """Déchiffre un ciphertext Transit.

        Returns:
            Plaintext en base64.

        Raises:
            hvac.exceptions.Forbidden: si la policy ne permet pas decrypt.
        """
        response = self._client.secrets.transit.decrypt_data(
            name=key_name, ciphertext=ciphertext
        )
        return response["data"]["plaintext"]

    def rotate_transit_key(self, key_name: str) -> int:
        """Rotation manuelle d'une clé Transit.

        Returns:
            Numéro de la nouvelle version de clé.
        """
        self._client.secrets.transit.rotate_key(name=key_name)
        key_info = self._client.secrets.transit.read_key(name=key_name)
        new_version = int(key_info["data"]["latest_version"])
        logger.info("Transit key '%s' rotated → v%d", key_name, new_version)
        # Invalider tout le cache (les versions ont changé)
        self.clear_cache()
        return new_version

    def clear_cache(self) -> None:
        """Vide le cache mémoire (utile après rotation)."""
        with self._cache_lock:
            self._cache.clear()

    def close(self) -> None:
        """Arrête proprement le thread de renouvellement."""
        self._stop_event.set()
        if self._renew_thread:
            self._renew_thread.join(timeout=2.0)
        self.clear_cache()
        self._client.adapter.close()

    # Context manager (avec ressource cleanup)
    def __enter__(self) -> "VaultClient":
        self.login()
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()
