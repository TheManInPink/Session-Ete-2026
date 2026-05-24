# `@nina-aes/identity-service`

> **Port** : 3001 **Stack** : NestJS 11.1 · TypeScript 6.0 · Prisma · Pino · Elasticsearch
> **Statut** : Implémentation en cours (27 fichiers, 5 controllers) **Référence** :
> `docs/07-BACKEND-IDENTITY-SERVICE.md`

---

## 1. Rôle

Microservice **central** de la plateforme NINA-AES : CRUD complet des enregistrements citoyens
(NINA), recherche floue via Elasticsearch, validation du format NINA, gestion des corrections
(workflow validation par agent SIGAC) et hiérarchie géographique (régions / cercles / communes du
Mali).

C'est le service le plus sollicité — tous les autres microservices (api-gateway, enrollment, ussd,
document) y délèguent les opérations sur les citoyens.

---

## 2. Endpoints

| Méthode  | Chemin                                   | Description                          | Auth        |
| -------- | ---------------------------------------- | ------------------------------------ | ----------- |
| `GET`    | `/citizens/:nina`                        | Récupère un citoyen par NINA         | Bearer JWT  |
| `GET`    | `/citizens/by-id/:id`                    | Récupère un citoyen par UUID interne | Bearer JWT  |
| `GET`    | `/citizens`                              | Liste / recherche floue (paginated)  | Bearer JWT  |
| `POST`   | `/citizens`                              | Crée un enregistrement NINA          | ADMIN       |
| `PUT`    | `/citizens/:id`                          | Met à jour un citoyen                | ADMIN       |
| `DELETE` | `/citizens/:id`                          | Supprime (soft) un citoyen           | ADMIN       |
| `POST`   | `/corrections`                           | Soumet une correction                | Bearer JWT  |
| `GET`    | `/corrections`                           | Liste les corrections en attente     | AGENT       |
| `GET`    | `/corrections/:id`                       | Détail d'une correction              | AGENT       |
| `PUT`    | `/corrections/:id/approve`               | Approuve une correction              | AGENT_SIGAC |
| `PUT`    | `/corrections/:id/reject`                | Rejette une correction               | AGENT_SIGAC |
| `GET`    | `/locations`                             | Liste les régions/cercles/communes   | Public      |
| `GET`    | `/locations/search`                      | Recherche floue de localité          | Public      |
| `GET`    | `/locations/:id`                         | Détail d'une localité                | Public      |
| `GET`    | `/health` `/health/live` `/health/ready` | Liveness / readiness probes          | —           |

---

## 3. Variables d'environnement

| Variable                | Défaut                  | Rôle                                           |
| ----------------------- | ----------------------- | ---------------------------------------------- |
| `IDENTITY_SERVICE_PORT` | `3001`                  | Port d'écoute HTTP                             |
| `DATABASE_URL`          | (cf. `.env`)            | Connexion PostgreSQL (Prisma)                  |
| `ELASTICSEARCH_URL`     | `http://localhost:9200` | Endpoint Elasticsearch (index `nina_citizens`) |
| `ELASTIC_PASSWORD`      | (cf. `.env`)            | Auth ES (xpack.security activé)                |
| `NODE_ENV`              | `development`           | Active pino-pretty                             |
| `LOKI_URL`              | —                       | Endpoint Loki (optionnel)                      |
| `GIT_SHA`               | —                       | Hash Git du build                              |

---

## 4. Démarrer en local

```powershell
# Prérequis : stack Docker démarrée (postgres + elasticsearch + index nina_citizens)
bash scripts/check-env.sh

pnpm install
pnpm --filter @nina-aes/identity-service dev

# Test
curl http://localhost:3001/health
```

---

## 5. Liens

- Doc canonique : [`docs/07-BACKEND-IDENTITY-SERVICE.md`](../../docs/07-BACKEND-IDENTITY-SERVICE.md)
- Schéma BDD : [`docs/06-DATABASE-SCHEMA-PRISMA.md`](../../docs/06-DATABASE-SCHEMA-PRISMA.md)
- Index ES initialisé par [`scripts/init-elasticsearch.sh`](../../scripts/init-elasticsearch.sh)
