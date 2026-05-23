# vault-usage.md — Comment ajouter et gérer un secret Vault

> Guide opérationnel pour l'étudiant + futurs admins CTDEC. Compagnon de
> `docs/15-SECURITY-HARDENING.md` (architecture) et `docs/adr/ADR-019-backup-recovery-strategy.md`
> (rotation).
>
> **Audience** : développeurs qui veulent stocker un nouveau secret, administrateurs qui doivent
> rotater une clé, auditeurs qui veulent comprendre la chaîne de confiance.

---

## 1. Décider du bon engine

NINA-AES utilise **5 engines Vault** activés par `vault-init.sh`. Choisir le bon engine selon le
type de secret :

| Type de secret                                 | Engine       | Mount path        | Exemple                               |
| ---------------------------------------------- | ------------ | ----------------- | ------------------------------------- |
| Config / API keys / connection strings         | **kv-v2**    | `kv/data/`        | `kv/data/africastalking`              |
| Certificats X.509 mTLS                         | **pki**      | `pki/`            | `pki/issue/identity-service`          |
| Credentials Postgres dynamiques (TTL 24h)      | **database** | `database/creds/` | `database/creds/identity-app`         |
| Chiffrement / signature (clé reste dans Vault) | **transit**  | `transit/`        | `transit/encrypt/sigac-whistleblower` |
| Codes MFA (TOTP) pour les agents               | **totp**     | `totp/`           | `totp/code/agent-CTDEC-007`           |

**Règle d'or** : si une clé privée doit signer ou déchiffrer, **utiliser transit** plutôt que kv. La
clé ne quitte JAMAIS Vault (résistance post-compromission applicatif).

---

## 2. Ajouter un nouveau secret kv-v2

### 2.1 En local (dev)

```powershell
# 1) S'assurer que Vault tourne
docker ps | grep nina-vault
# Si absent : pnpm docker:up

# 2) Login (root token de dev)
$env:VAULT_ADDR = "http://localhost:8200"
$env:VAULT_TOKEN = "nina-dev"  # depuis docker-compose.dev.yml

# 3) Écrire le secret
docker exec nina-vault vault kv put kv/notification-service `
  sendgrid_api_key="SG.xxx" `
  template_id_welcome="d-abc123"

# 4) Vérifier
docker exec nina-vault vault kv get kv/notification-service
```

### 2.2 En staging / production

```bash
# 1) Login admin (Keycloak OIDC + MFA, cf. doc 15)
vault login -method=oidc

# 2) Écrire — Vault audite automatiquement l'opération
vault kv put kv/notification-service \
  sendgrid_api_key=@./sendgrid.txt \
  template_id_welcome="d-abc123"

# Le fichier sendgrid.txt doit être supprimé IMMÉDIATEMENT :
shred -u sendgrid.txt
```

### 2.3 Côté code (consommation)

**TypeScript (NestJS)** :

```ts
import { createVaultClientFromEnv } from '@nina-aes/vault-client';

const vault = createVaultClientFromEnv();
await vault.login();

const config = await vault.getSecret<{
  sendgrid_api_key: string;
  template_id_welcome: string;
}>('notification-service');
```

**Python (FastAPI ai-service)** :

```python
from app.vault import VaultClient

with VaultClient.from_env() as vault:
    config = vault.get_secret("ai-service")
    db = vault.get_database_creds("ai-readonly")
```

---

## 3. Ajouter un nouveau rôle / une nouvelle policy

### 3.1 Créer le fichier `.hcl`

```hcl
# infrastructure/vault/policies/notification-service.hcl

path "kv/data/notification-service/*" {
  capabilities = ["read"]
}

path "kv/data/keycloak/notification-client" {
  capabilities = ["read"]
}

path "database/creds/notification-app" {
  capabilities = ["read"]
}

path "auth/token/renew-self"  { capabilities = ["update"] }
path "auth/token/lookup-self" { capabilities = ["read"] }

# Refus explicites (defense-in-depth)
path "kv/data/jwt/private" { capabilities = ["deny"] }
path "transit/decrypt/*"   { capabilities = ["deny"] }
```

### 3.2 Appliquer la policy

```bash
# La policy est appliquée automatiquement par vault-init.sh à chaque
# (ré)démarrage. Pour un changement immédiat :
vault policy write notification-service \
  infrastructure/vault/policies/notification-service.hcl
```

### 3.3 Créer le rôle AppRole

```bash
vault write auth/approle/role/notification-service \
  token_policies="notification-service" \
  token_ttl=24h \
  token_max_ttl=72h \
  secret_id_ttl=720h
```

### 3.4 Récupérer role_id + secret_id pour Kubernetes Secret

```bash
ROLE_ID=$(vault read -field=role_id auth/approle/role/notification-service/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/notification-service/secret-id)

kubectl -n nina-aes create secret generic notification-service-vault-creds \
  --from-literal=VAULT_APPROLE_ROLE_ID="$ROLE_ID" \
  --from-literal=VAULT_APPROLE_SECRET_ID="$SECRET_ID"
```

En prod, ce Secret est **Sealed Secret** (cf. doc 20 §4.5).

---

## 4. Rotation manuelle d'une clé Transit

```bash
# 1) Lister les versions actuelles
vault read transit/keys/jwt-signing-rs256

# 2) Rotater (crée une nouvelle version, anciennes restent valides)
vault write -f transit/keys/jwt-signing-rs256/rotate

# 3) Configurer min_decryption_version pour invalider les v1, v2 si besoin
vault write transit/keys/jwt-signing-rs256/config \
  min_decryption_version=3
```

**ATTENTION** : ne pas exécuter `min_decryption_version` sur `sigac-whistleblower` sans procédure de
réémission des signalements en attente (cf. ADR-023 §Conséquences négatives).

---

## 5. Rotation automatique (CronJob 90 jours)

Le CronJob K3s `vault-rotation` (cf. `infrastructure/k8s/cronjobs/vault-rotation.yaml`) exécute
`infrastructure/vault/rotate-secrets.sh` tous les 90 jours :

- Rotation `transit/keys/jwt-signing-rs256` (auth-service)
- Rotation `transit/keys/aes-interop-mli` (Bloc B BCID-AES)
- Rotation root password Postgres (engine database)
- Rotation `secret_id` AppRole des 5 services principaux Bloc A
- Rollout restart des deployments concernés

**Logs** : visible dans Loki via query `{ app: "vault-rotation" }`. **Alertes** : si rotation
échoue, Alertmanager déclenche `VaultRotationFailed` (cf. doc 17 §4.6).

---

## 6. Lire un secret pour debug (admin uniquement)

```bash
# Liste les secrets kv-v2 disponibles
vault kv list kv/

# Lit un secret
vault kv get kv/database/identity-service

# Lit une version spécifique (kv-v2 garde l'historique)
vault kv get -version=3 kv/jwt/private

# Voir l'historique
vault kv metadata get kv/jwt/private
```

Toutes les lectures sont **auditées** dans le Vault audit log (`/vault/logs/audit.log` → shippé vers
Loki via Promtail).

---

## 7. Procédure d'incident — fuite suspectée

Si vous suspectez qu'un secret a fuité :

```bash
# 1) Rotater IMMÉDIATEMENT le secret concerné
vault kv put kv/<chemin> nouveau_secret=...   # ou rotate Transit

# 2) Révoquer tous les leases actuels
vault lease revoke -prefix database/creds/<role>

# 3) Émettre de nouveaux secret_id AppRole
vault write -f auth/approle/role/<service>/secret-id

# 4) Forcer le rollout des services
kubectl -n nina-aes rollout restart deployment/<service>

# 5) Notifier le CISO CTDEC + auditer le Vault audit log
grep "<chemin>" /vault/logs/audit.log | jq .

# 6) Ouvrir un incident dans docs/CHANGELOG.md §4
```

---

## 8. Bonnes pratiques (à ne pas négliger)

1. **Aucun secret en clair dans le code** ni dans les commits Git. Le hook `gitleaks` (cf. doc 16
   §4.5) bloque sur push.
2. **Préférer Transit à kv-v2** pour les clés cryptographiques.
3. **Toujours utiliser AppRole** en prod (jamais le root token).
4. **Auditer chaque secret lu** via le Vault audit log activé sur tous les engines
   (`vault audit enable file file_path=/vault/logs/audit.log`).
5. **Sealed Secrets pour Kubernetes** (cf. doc 20 §4.5) — jamais de Secret YAML en clair dans Git.
6. **Rotation au moins tous les 90 jours** pour toutes les clés signantes + creds applicatifs.
7. **MFA obligatoire** pour les humains accédant à la policy `admin` (Keycloak OIDC + Duo / TOTP).

---

## 9. Cheatsheet rapide

```bash
# Login dev
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=nina-dev

# Login prod (avec OIDC Keycloak)
vault login -method=oidc

# Engines actifs
vault secrets list

# Policies actives
vault policy list

# Tester une policy
echo '{ "path": "kv/data/identity-service/db" }' \
  | vault write sys/capabilities-self - paths=-

# Stats audit
vault read sys/audit
```

---

_Document — Mai 2026 · NINA-AES Platform · UQAR · CONFIDENTIEL_
