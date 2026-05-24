# `@nina-aes/audit-service`

> **Port** : 3007 **Stack** : NestJS 11.1 · TypeScript 6.0 · Prisma · Pino · SHA-256 (Merkle)
> **Statut** : Scaffold (5 fichiers, 2 controllers) **Référence** :
> `docs/09-BACKEND-AUDIT-SERVICE.md`

---

## 1. Rôle

Journal d'audit **append-only** de la plateforme NINA-AES : chaîne de hash Merkle SHA-256 pour
garantir l'inviolabilité chronologique des évènements, vérification d'intégrité, recherche
d'évènements par citoyen / agent / période.

Consommateur RabbitMQ de l'exchange `nina.audit` — tout évènement business
(création/modification/correction NINA, login admin, accès sensible) y est journalisé de manière
asynchrone.

---

## 2. Endpoints

| Méthode | Chemin              | Description                                | Auth        |
| ------- | ------------------- | ------------------------------------------ | ----------- |
| `GET`   | `/audit/events`     | Liste paginée (filtres date/citoyen/agent) | AGENT_AUDIT |
| `GET`   | `/audit/events/:id` | Détail d'un évènement                      | AGENT_AUDIT |
| `POST`  | `/audit/verify`     | Vérifie l'intégrité d'une plage temporelle | AGENT_AUDIT |
| `GET`   | `/audit/export`     | Export CSV/JSON pour rapport SIGAC         | AGENT_SIGAC |
| `GET`   | `/health`           | Liveness                                   | —           |

(À confirmer après implémentation Bloc 9.)

---

## 3. Variables d'environnement

| Variable             | Défaut        | Rôle                                        |
| -------------------- | ------------- | ------------------------------------------- |
| `AUDIT_SERVICE_PORT` | `3007`        | Port d'écoute HTTP                          |
| `DATABASE_URL`       | (cf. `.env`)  | Connexion PostgreSQL (table `audit_logs_*`) |
| `RABBITMQ_URL`       | (cf. `.env`)  | Connexion AMQP (consumer `audit.log` queue) |
| `NODE_ENV`           | `development` | Active pino-pretty                          |

---

## 4. Démarrer en local

```powershell
# Prérequis : postgres + rabbitmq + topologie nina.audit chargée
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/audit-service dev
```

---

## 5. Liens

- Doc canonique : [`docs/09-BACKEND-AUDIT-SERVICE.md`](../../docs/09-BACKEND-AUDIT-SERVICE.md)
- Topologie RabbitMQ : exchange `nina.audit` provisionné via
  [`infrastructure/docker/rabbitmq/definitions.json`](../../infrastructure/docker/rabbitmq/definitions.json)
