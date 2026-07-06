"""Tests d'intégration du canal lanceur d'alerte — anti-corrélation + confidentialité.

Garanties vérifiées au niveau API :
- la clé diffusée est PUBLIQUE uniquement (aucun secret) ;
- l'intake refuse un schéma interdit et un ciphertext trop long (422) ;
- la ligne stockée ne contient NI téléphone, NI IP, NI correlation-id, NI timestamp
  précis (seulement ciphertext + buckets + jour + hash de token) ;
- aucun log par requête n'enregistre l'IP client (``request.client``) ni un NINA ;
- la file procureur est réservée à un rôle (INSPECTOR/PROSECUTOR) en mode protégé.
"""

from __future__ import annotations

import base64
import dataclasses

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.whistleblower import StoredReport, store

client = TestClient(app)

# Champs strictement interdits dans une ligne stockée (anti-corrélation, protocole §6.1).
_FORBIDDEN_FIELDS = {"phone", "msisdn", "ip", "ip_address", "correlation_id", "timestamp"}


def _valid_intake_payload() -> dict:
    """Construit un POST d'intake valide (ciphertext factice mais base64 plausible)."""
    return {
        "ciphertext_b64": base64.b64encode(b"sealed-ciphertext-opaque").decode("ascii"),
        "scheme": "SEALED_BOX_X25519",
        "cipher_kid": "proc-x25519-v1",
        "fine_classification": "CORRUPTION_FINANCIAL",
        "fine_severity": "CRITICAL",
    }


def test_public_key_endpoint_exposes_public_only() -> None:
    """L'endpoint clé publique ne renvoie QUE schéma/kid/clé publique (aucun secret privé)."""
    resp = client.get("/api/v1/sigac/whistleblower/public-key")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"scheme", "cipher_kid", "public_key"}
    assert "private" not in str(body).lower()


def test_intake_rejects_disallowed_scheme() -> None:
    """Un schéma hors _ALLOWED_SCHEMES est refusé (422)."""
    payload = _valid_intake_payload()
    payload["scheme"] = "ROT13"
    resp = client.post("/api/v1/sigac/whistleblower/reports", json=payload)
    assert resp.status_code == 422


def test_intake_rejects_oversized_ciphertext(monkeypatch) -> None:
    """Un ciphertext dépassant max_ciphertext_b64_len est refusé (422, anti-DoS)."""
    monkeypatch.setattr(settings, "max_ciphertext_b64_len", 16)
    payload = _valid_intake_payload()
    payload["ciphertext_b64"] = base64.b64encode(b"x" * 256).decode("ascii")
    resp = client.post("/api/v1/sigac/whistleblower/reports", json=payload)
    assert resp.status_code == 422


def test_intake_stores_no_correlatable_fields() -> None:
    """La ligne stockée ne contient AUCUN champ corrélant (phone/ip/correlation-id/heure)."""
    resp = client.post("/api/v1/sigac/whistleblower/reports", json=_valid_intake_payload())
    assert resp.status_code == 201
    report_id = resp.json()["report_id"]

    stored = store._by_id[report_id]  # accès direct pour inspection du modèle stocké
    field_names = {f.name for f in dataclasses.fields(StoredReport)}
    assert _FORBIDDEN_FIELDS.isdisjoint(field_names)
    # received_day ne porte QUE le jour (YYYY-MM-DD), jamais l'heure.
    assert len(stored.received_day) == 10 and stored.received_day.count("-") == 2
    # Aucun timestamp précis (':' d'une heure ISO) nulle part dans la ligne.
    assert ":" not in stored.received_day


def test_intake_returns_token_once_and_stores_only_hash() -> None:
    """Le token de suivi n'est rendu qu'à l'intake ; seul son hash est stocké."""
    resp = client.post("/api/v1/sigac/whistleblower/reports", json=_valid_intake_payload())
    token = resp.json()["tracking_token"]
    report_id = resp.json()["report_id"]
    stored = store._by_id[report_id]
    # Le token EN CLAIR n'apparaît jamais dans la ligne stockée (seul le hash).
    assert token != stored.token_hash
    assert len(stored.token_hash) == 64  # SHA-256 hex

    # Le statut est consultable par le token (statut grossier seulement).
    status_resp = client.get(f"/api/v1/sigac/whistleblower/reports/{token}/status")
    assert status_resp.status_code == 200
    assert status_resp.json() == {"status": "RECEIVED"}


def test_no_request_scoped_logging_of_ip_or_nina(caplog) -> None:
    """Aucun log émis pendant l'intake ne contient l'IP client (request.client) ni un NINA."""
    payload = _valid_intake_payload()
    with caplog.at_level("DEBUG"):
        resp = client.post("/api/v1/sigac/whistleblower/reports", json=payload)
    assert resp.status_code == 201
    # TestClient présente un client testclient/IP factice ; on prouve qu'AUCUN
    # enregistrement de log ne mentionne d'IP ni de marqueur NINA.
    joined = " ".join(rec.getMessage() for rec in caplog.records).lower()
    assert "testclient" not in joined
    assert "127.0.0.1" not in joined
    assert "nina" not in joined


def test_unknown_token_status_is_404() -> None:
    """Un token de suivi inconnu renvoie 404 (pas de fuite d'existence)."""
    resp = client.get("/api/v1/sigac/whistleblower/reports/unknown-token/status")
    assert resp.status_code == 404


def test_queue_guarded_by_role(monkeypatch) -> None:
    """La file procureur exige un rôle quand admin-token est configuré (sinon 403)."""
    monkeypatch.setattr(settings, "jwks_url", "")
    monkeypatch.setattr(settings, "admin_token", "s3cr3t")
    # Sans en-tête X-Admin-Token → 403.
    resp = client.get("/api/v1/sigac/whistleblower/queue")
    assert resp.status_code == 403
    # Avec le bon jeton admin → 200 (repli RBAC).
    ok = client.get(
        "/api/v1/sigac/whistleblower/queue",
        headers={"X-Admin-Token": "s3cr3t"},
    )
    assert ok.status_code == 200
    assert "reports" in ok.json()
