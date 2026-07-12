# `@nina-aes/notification-service`

> **Port** : 3005 **Stack** : NestJS 11.1 · TypeScript 6 · Prisma 7 · PostgreSQL 18 · RabbitMQ 4.2 ·
> Africa's Talking (SMS) · Nodemailer (SMTP) · FCM HTTP v1 (push) **Statut** : Implémenté (Bloc A)
> **Référence** : `docs/12-FRONTEND-INTEGRATION-API.md` (PROMPT 3.5)

---

## 1. Rôle

Service **multicanal** unifié de la plateforme NINA-AES. Tous les microservices y délèguent l'envoi
de notifications transactionnelles via 3 canaux :

- **SMS** — Africa's Talking (Mali, Burkina, Niger), bac-à-sable détecté automatiquement.
- **Email** — SMTP institutionnel (Maildev en développement).
- **Push** — FCM HTTP v1 (Android + iOS via APNS proxifié par Firebase).

Garanties : **idempotence** (clé d'unicité), **ré-essai exponentiel** avant DLQ, **historique**
PostgreSQL, **templates multilingues** (8 langues, repli FR), **métriques** en mémoire.

## 2. Sources d'écriture

1. **HTTP `POST /api/v1/notifications/send`** (synchrone) — envoi unique immédiat (ex. code MFA).
2. **HTTP `POST /api/v1/notifications/broadcast`** (ADMIN) — publie N jobs sur RabbitMQ.
3. **Consumer RabbitMQ** (asynchrone, workers parallèles via prefetch) — consomme
   `notification.sms/.email/.ussd/.push` + la file de ré-injection `notification.work`. Le canal est
   déterminé par le **corps** du message (`channel`), pas par la file.

Les autres services publient sur l'exchange topic `nina.notifications` avec la clé
`notification.<canal>`.

## 3. Endpoints (`/api/v1`)

| Méthode | Chemin                                   | Rôles                                  | Description                            |
| ------- | ---------------------------------------- | -------------------------------------- | -------------------------------------- |
| `POST`  | `/notifications/send`                    | `ADMIN`,`AGENT`,`SUPERVISOR`           | Envoi unique (canal auto ou forcé)     |
| `POST`  | `/notifications/broadcast`               | `ADMIN`                                | Envoi en masse (débit régulé, DLQ)     |
| `GET`   | `/notifications/templates`               | `ADMIN`,`AGENT`,`SUPERVISOR`           | Catalogue des templates + variables    |
| `GET`   | `/notifications/metrics`                 | `ADMIN`,`AUDITOR`                      | Envois/heure, taux de succès, latence  |
| `POST`  | `/notifications/atalking/callback`       | — (`@Public` + secret)                 | Webhook DLR Africa's Talking           |
| `GET`   | `/notifications/:id/status`              | `ADMIN`,`AGENT`,`SUPERVISOR`,`AUDITOR` | Statut de livraison d'une notification |
| `GET`   | `/health` `/health/live` `/health/ready` | —                                      | Sondes (Postgres)                      |

Swagger : `http://localhost:3005/api/docs`.

### Exemple — envoi d'un code MFA

```bash
curl -X POST http://localhost:3005/api/v1/notifications/send \
  -H "Authorization: Bearer <jwt-agent>" -H "Content-Type: application/json" \
  -d '{"recipient":"+22376000000","channel":"sms","template":"mfa-code","variables":{"code":"482913","ttl":5}}'
```

## 4. Templates (8 langues)

10 templates transactionnels (`correction-submitted`, `correction-approved`,
`appointment-confirmed`, `appointment-reminder-24h`, `appointment-reminder-2h`,
`appointment-cancelled`, `mfa-code`, `whistleblower-token`, `ussd-confirmation`,
`priority-queue-turn`). Contenu dans `src/notifications/templates/locales/<lang>.json`. **FR est la
référence complète** ; les 7 autres langues retombent sur FR tant qu'un locuteur natif n'a pas
validé la traduction (cf. `locales/README.md`). Les variables obligatoires sont déclarées dans
`template.catalog.ts` et validées avant envoi (aucun `{id}` brut ne peut partir).
`priority-queue-turn` (appel « c'est votre tour » de la file prioritaire d'enrôlement) est publié
par le `vulnerability-service` (cf.
[ADR-035](../../docs/adr/ADR-035-livraison-domicile-et-validation-categorie.md)).

## 5. Idempotence

`dedupeKey = SHA-256(recipient | canal | template | variables canoniques)`, colonne `dedupe_key`
**UNIQUE** (nullable). Une notification déjà `SENT/DELIVERED/READ` court-circuite (livraison
at-least-once neutralisée) ; une `FAILED/PENDING` est ré-expédiée sur la même ligne. Une clé
`idempotencyKey` explicite peut être fournie.

## 6. Ré-essai exponentiel → DLQ

À chaque échec **transitoire**, le job est déposé dans une file de délai TTL `notification.retry.k`
(paliers : **1 min, 5 min, 30 min, 2 h, 12 h**). À l'expiration, RabbitMQ le dead-lette vers
`nina.notifications` (clé `notification.requeue`) → file `notification.work` → consumer. Une file
PAR palier évite le blocage en tête de file des TTL hétérogènes. Après 5 ré-essais (ou un échec
**définitif** : canal non supporté), le job part en DLQ (`nina.dlx` → `dlx.parking`).

## 7. Variables d'environnement (extrait)

| Variable                                 | Défaut                                        | Rôle                             |
| ---------------------------------------- | --------------------------------------------- | -------------------------------- |
| `NOTIFICATION_SERVICE_PORT`              | `3005`                                        | Port HTTP                        |
| `DATABASE_URL`                           | (racine `.env`)                               | Historique PostgreSQL            |
| `AUTH_JWKS_URL`                          | `http://localhost:3002/.well-known/jwks.json` | Vérification RS256               |
| `RABBITMQ_URL`                           | `amqp://localhost:5672`                       | Broker                           |
| `RABBITMQ_PREFETCH`                      | `16`                                          | Workers parallèles (consumer)    |
| `RABBITMQ_CONSUMER_ENABLED`              | `true`                                        | Active producteur + consumer     |
| `NOTIFICATION_RETRY_DELAYS_MS`           | `60000,300000,1800000,7200000,43200000`       | Paliers de ré-essai              |
| `AT_API_KEY` / `AT_USERNAME`             | `sandbox-api-key` / `sandbox`                 | Africa's Talking (SMS)           |
| `AT_SMS_SENDER_ID`                       | `NINA-AES`                                    | Sender ID (live)                 |
| `AT_SMS_ENABLED`                         | `true`                                        | Coupe-circuit SMS (CI/tests)     |
| `NOTIFICATION_ATALKING_CALLBACK_SECRET`  | (vide)                                        | Secret du webhook DLR            |
| `SMTP_HOST` / `SMTP_PORT`                | `localhost` / `1025`                          | SMTP (Maildev en dev)            |
| `SMTP_FROM`                              | `NINA-AES <noreply@nina-aes.ml>`              | Expéditeur email                 |
| `FCM_ENABLED`                            | `false`                                       | Push réel (sinon log simulé)     |
| `FCM_PROJECT_ID` / `FCM_SERVICE_ACCOUNT` | (vide)                                        | Credentials Firebase (Vault)     |
| `NOTIFICATION_BROADCAST_RATE_PER_SEC`    | `20`                                          | Débit consumer (protège AT/SMTP) |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT`     | `60000` / `120`                               | Rate-limit HTTP                  |

> **Secrets** : en production, `AT_API_KEY`, `SMTP_PASSWORD` et `FCM_SERVICE_ACCOUNT` sont injectés
> dans l'environnement par **Vault Agent** (sidecar) — l'application ne lit jamais Vault directement
> et aucun secret n'est codé en dur (cf. principe de souveraineté + doc 15).

## 8. Démarrer en local

```bash
# 1. Infra (PostgreSQL, RabbitMQ + définitions, Maildev)
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# 2. Migration (ajoute notifications.dedupe_key)
pnpm --filter @nina-aes/database run db:migrate

# 3. Lancer le service
pnpm --filter @nina-aes/notification-service run dev

# 4. Vérifier
curl http://localhost:3005/health
# Emails de test capturés sur Maildev → http://localhost:1080
# DLQ → RabbitMQ Management http://localhost:15672 (file dlx.parking)
```

## 9. Tests

```bash
pnpm --filter @nina-aes/notification-service run test      # 4 suites, 23 tests (mockés)
```

Couvre : moteur de templates (interpolation + fallback FR), cœur métier (envoi, déduction de canal,
idempotence, échec, broadcast — repo en mémoire), fournisseur Africa's Talking (`fetch` mocké),
topologie/paliers RabbitMQ.

## 10. Architecture (flux simplifié)

```text
Service métier ──POST /send──────────────► [NotificationsController]
                                                 │ processJob
                                                 ▼
   nina.notifications (topic) ──notification.sms──► notification.sms ─┐
   (broadcast / événements)   ──notification.email─► notification.email│ prefetch
                                                                       ├─► [Consumer] ─► [Dispatcher] ─► AT / SMTP / FCM
   notification.retry.k (TTL) ──requeue──► notification.work ──────────┘            │
        ▲ (échec transitoire)                                                       │ échec définitif
        └──────────────────────────────────────────────────── [Publisher] ─────────► nina.dlx → dlx.parking
```
