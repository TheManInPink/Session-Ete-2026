# `@nina-aes/notification-service`

> **Port** : 3005 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · nodemailer · Africa's Talking
> SMS **Statut** : Scaffold (5 fichiers, 2 controllers) **Référence** : doc dédiée à venir

---

## 1. Rôle

Émission de notifications utilisateurs sur les canaux du MVP : **email** (SMTP via Maildev en dev,
relais SMTP en prod), **SMS** (Africa's Talking pour le Mali), **push** (web/mobile via FCM, différé
Bloc E).

Consommateur RabbitMQ des queues `notification.email`, `notification.sms`, `notification.ussd` —
découplé du métier (les services émettent des évènements, le notification-service les traite
asynchroniquement).

---

## 2. Endpoints

| Méthode | Chemin                     | Description                     | Auth  |
| ------- | -------------------------- | ------------------------------- | ----- |
| `POST`  | `/notifications/email`     | Envoi direct email (test/admin) | ADMIN |
| `POST`  | `/notifications/sms`       | Envoi direct SMS (test/admin)   | ADMIN |
| `GET`   | `/notifications/templates` | Liste les templates disponibles | ADMIN |
| `GET`   | `/health`                  | Liveness                        | —     |

(À confirmer après implémentation.)

---

## 3. Variables d'environnement

| Variable                    | Défaut          | Rôle                                 |
| --------------------------- | --------------- | ------------------------------------ |
| `NOTIFICATION_SERVICE_PORT` | `3005`          | Port d'écoute HTTP                   |
| `SMTP_HOST`                 | `localhost`     | Hôte SMTP (Maildev en dev sur 1025)  |
| `SMTP_PORT`                 | `1025`          | Port SMTP                            |
| `AFRICAS_TALKING_API_KEY`   | (Vault en prod) | Clé API SMS                          |
| `AFRICAS_TALKING_USERNAME`  | `sandbox`       | Compte AT (sandbox en dev)           |
| `RABBITMQ_URL`              | (cf. `.env`)    | Consumer des queues `notification.*` |

---

## 4. Démarrer en local

```powershell
# Prérequis : maildev (1080/1025) + rabbitmq
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/notification-service dev

# Voir les emails envoyés : http://localhost:1080
```

---

## 5. Liens

- Interface Maildev : http://localhost:1080
- Queues RabbitMQ : `notification.email`, `notification.sms`, `notification.ussd` (cf.
  [`definitions.json`](../../infrastructure/docker/rabbitmq/definitions.json))
