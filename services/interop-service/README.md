# `@nina-aes/interop-service`

> **Port** : 3006 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · mTLS · Ed25519 **Statut** :
> Scaffold (3 fichiers, 1 controller) **Référence** : `docs/21-BLOC-B-INTEROPERABILITE-AES.md`

---

## 1. Rôle

Implémentation du protocole **BCID-AES** (Birth-Citizenship-Identity Document — version
Confédération AES : Mali, Burkina Faso, Niger) : vérification croisée d'identités entre gateways
nationaux via mTLS, signatures Ed25519 sur les payloads, modèle de fédération sans dépôt central.

Permet à un Burkinabé ou Nigérien de prouver son identité à un agent SIGAC malien sans envoi de
données personnelles en clair sur Internet.

---

## 2. Endpoints

| Méthode | Chemin                 | Description                              | Auth         |
| ------- | ---------------------- | ---------------------------------------- | ------------ |
| `POST`  | `/interop/verify`      | Vérifie un BCID auprès du pays émetteur  | mTLS gateway |
| `POST`  | `/interop/handshake`   | Échange initial entre gateways nationaux | mTLS gateway |
| `GET`   | `/interop/trust-store` | Liste les pays/CAs reconnus              | ADMIN        |
| `GET`   | `/health`              | Liveness                                 | —            |

(Spec à figer après ratification du protocole BCID-AES.)

---

## 3. Variables d'environnement

| Variable               | Défaut       | Rôle                                          |
| ---------------------- | ------------ | --------------------------------------------- |
| `INTEROP_SERVICE_PORT` | `3006`       | Port d'écoute HTTPS (mTLS)                    |
| `INTEROP_CA_BUNDLE`    | —            | Chemin du trust store inter-gateways          |
| `INTEROP_CLIENT_CERT`  | —            | Certificat client mTLS de ce gateway national |
| `INTEROP_CLIENT_KEY`   | (Vault prod) | Clé privée du certificat (Ed25519)            |

---

## 4. Démarrer en local

```powershell
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/interop-service dev
```

---

## 5. Liens

- Doc canonique :
  [`docs/21-BLOC-B-INTEROPERABILITE-AES.md`](../../docs/21-BLOC-B-INTEROPERABILITE-AES.md)
- Bloc régional **B** dans le PROMPT MAÎTRE — séquencé après stabilisation des services nationaux
  (Blocs A).
