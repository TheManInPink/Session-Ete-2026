# @nina-aes/vault-client

Client TypeScript pour HashiCorp Vault, conçu pour les services NestJS du Bloc A NINA-AES.

## Caractéristiques

- **Auth** : AppRole (recommandé), token (dev), Kubernetes SA
- **Cache mémoire** TTL configurable (défaut 5 min)
- **Auto-renew** du token à 80 % du TTL restant
- **Helpers métier** : `getSecret`, `getDatabaseCreds`, `transitSign`, `transitVerify`,
  `rotateTransitKey`
- **Zéro dépendance externe** lourde (fetch natif Node 24)

## Usage

```ts
import { createVaultClientFromEnv } from '@nina-aes/vault-client';

const vault = createVaultClientFromEnv();
await vault.login();

const dbConfig = await vault.getSecret<{ url: string }>('database/identity-service');
const dbCreds = await vault.getDatabaseCreds('identity-app');
const sig = await vault.transitSign('jwt-signing-rs256', payloadBase64);
```

## Variables d'environnement

| Variable                  | Obligatoire            | Description                                   |
| ------------------------- | ---------------------- | --------------------------------------------- |
| `VAULT_ADDR`              | ✅                     | URL Vault, ex. `http://vault:8200`            |
| `VAULT_AUTH_METHOD`       | —                      | `token` \| `approle` (défaut) \| `kubernetes` |
| `VAULT_TOKEN`             | si `method=token`      | Root token (dev) ou token long-lived          |
| `VAULT_APPROLE_ROLE_ID`   | si `method=approle`    | Role ID public                                |
| `VAULT_APPROLE_SECRET_ID` | si `method=approle`    | Secret ID (rotation 30j)                      |
| `VAULT_KUBERNETES_ROLE`   | si `method=kubernetes` | Nom du rôle K8s mappé                         |

## Doc associée

- `docs/15-SECURITY-HARDENING.md` — architecture Vault
- `docs/security/vault-usage.md` — comment ajouter un secret
- `infrastructure/vault/policies/` — policies par service
