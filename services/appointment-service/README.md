# `@nina-aes/appointment-service`

> **Port** : 3008 · **Stack** : NestJS 11.1 · TypeScript 6.0 · Prisma 7 · Redis (ioredis) · RabbitMQ
> (amqp-connection-manager) **Bloc** : A (+ C1 files prioritaires)

---

## 1. Rôle

Prise de **rendez-vous** dans les centres d'enrôlement (CTDEC Bamako + antennes RAVEC régionales).
Gère les **créneaux** par centre (STANDARD vs PRIORITAIRE), une **file d'attente virtuelle** par
centre/jour (Redis), des **quotas** journaliers, la **blacklist temporaire** anti no-show, et publie
les **rappels SMS** (confirmation, J-1, H-2) consommés par `notification-service` via RabbitMQ.

Un « centre » = une `Institution` dotée d'un profil `EnrollmentCenter` (1:1). L'identifiant public
d'un centre est donc l'`Institution.id` (= `centerId` des rendez-vous).

---

## 2. Endpoints

| Méthode | Chemin                                       | Description                                                                | Auth             |
| ------- | -------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| `GET`   | `/api/v1/centers`                            | Liste (filtres `region`,`cercle`,`service`,`openNow`,`lat`+`lng`+`radius`) | Public           |
| `GET`   | `/api/v1/centers/suggest`                    | Centre le plus proche avec créneau libre                                   | Public           |
| `GET`   | `/api/v1/centers/:id`                        | Détail (horaires, capacité, quotas, services)                              | Public           |
| `GET`   | `/api/v1/centers/:id/availability`           | Créneaux `from`..`to` (STANDARD / PRIORITAIRE)                             | Public           |
| `POST`  | `/api/v1/appointments`                       | Crée un RDV (file prioritaire si vulnérable)                               | AGENT+           |
| `GET`   | `/api/v1/appointments`                       | Liste (filtre `citizenId` OU `centerId` REQUIS, paginée)                   | AGENT+ / AUDITOR |
| `GET`   | `/api/v1/appointments/queue/:centerId`       | File d'attente du jour (vue agent)                                         | AGENT            |
| `GET`   | `/api/v1/appointments/:id`                   | Détail                                                                     | AGENT+ / AUDITOR |
| `PUT`   | `/api/v1/appointments/:id/cancel`            | Annulation                                                                 | AGENT+           |
| `PUT`   | `/api/v1/appointments/:id/check-in`          | Arrivée au centre → entrée en file + numéro                                | AGENT            |
| `PUT`   | `/api/v1/appointments/:id/complete`          | Clôture                                                                    | AGENT            |
| `GET`   | `/health` · `/health/live` · `/health/ready` | Sondes (Postgres requis, Redis indicatif)                                  | —                |

Auth : JWT RS256 vérifié via le JWKS d'`auth-service` (`AUTH_JWKS_URL`), RBAC par `@Roles`. Les
routes `/centers/*` sont publiques (annuaire consultable avant authentification : web, USSD, borne)
mais soumises au throttler. Les routes `/appointments/*` sont **médiées** : réservées à AGENT /
SUPERVISOR / ADMIN (+ AUDITOR en lecture). Le rôle CITIZEN n'y est pas accordé — voir §7.

---

## 3. Logique métier

- **Cycle de vie** : `SCHEDULED → (check-in) CONFIRMED → (complete) COMPLETED` ; `→ CANCELLED` à
  tout moment actif ; `→ NO_SHOW` (cron) si l'heure est dépassée sans présentation. Toutes les
  transitions sont **atomiques** (compare-and-set Prisma `updateMany`).
- **Créneaux** : grille générée depuis `openingHours` + `slotDurationMin`. La **fenêtre
  prioritaire** (`07:00–09:00` par défaut) est réservée aux personnes vulnérables. Capacité
  contrôlée à 3 niveaux : par créneau (`parallelDesks`), par nature/jour
  (`standardQuota`/`priorityQuota`), par jour (`capacityPerDay`).
- **Anti-surbooking** : insertion sérialisée par `pg_advisory_xact_lock(centre, créneau)` + revérif
  de capacité dans la transaction.
- **Vulnérabilité** : si `vulnerabilityCategory` est fourni, validation contre une fiche
  `VulnerabilityRecord` active (source de vérité partagée — équivalent d'un appel à
  `vulnerability-service`) ⇒ priorité `P1` et accès aux créneaux prioritaires.
- **File d'attente virtuelle** : sorted set Redis par centre/jour ; score = arrivée − bonus de
  priorité (les vulnérables passent devant). Le rang donne le numéro de passage + l'attente estimée.
- **No-show & blacklist** : 2 absences sur une fenêtre glissante (90 j) ⇒ blacklist temporaire 48 h
  (clé Redis à TTL natif). La vérification échoue **ouvert** si Redis est indisponible.
- **Rappels SMS** : confirmation à la création, puis J-1 et H-2 via le cron (toutes les 10 min).
  Idempotents via `idempotencyKey` (`appt:<id>:reminder-*`) côté `notification-service`.

### Modèles ML (placeholder — futur)

`QueueService.estimateWaitMinutes` est une heuristique (`⌈personnes_devant / guichets⌉ × durée`). Un
futur modèle (régression sur l'historique réel des durées de service + détection des centres
surchargés) remplacera cette méthode sans changer l'interface.

---

## 4. Variables d'environnement (extrait)

| Variable                                                       | Défaut                   | Rôle                                  |
| -------------------------------------------------------------- | ------------------------ | ------------------------------------- |
| `APPOINTMENT_SERVICE_PORT`                                     | `3008`                   | Port HTTP                             |
| `DATABASE_URL`                                                 | (`.env` racine)          | PostgreSQL                            |
| `REDIS_URL` / `REDIS_KEY_PREFIX`                               | `…6379` / `appointment:` | File d'attente + blacklist            |
| `RABBITMQ_URL`                                                 | (`.env` racine)          | Publication vers `nina.notifications` |
| `AUTH_JWKS_URL`                                                | `…:3002/.well-known/…`   | Vérification JWT                      |
| `APPOINTMENT_NOSHOW_THRESHOLD` / `_WINDOW_DAYS` / `_GRACE_MIN` | `2` / `90` / `30`        | Politique no-show                     |
| `APPOINTMENT_BLACKLIST_TTL_HOURS`                              | `48`                     | Durée de blacklist                    |
| `APPOINTMENT_CRON_ENABLED`                                     | `true`                   | Active rappels + balayage no-show     |
| `APPOINTMENT_NOTIFICATIONS_ENABLED`                            | `true`                   | Active la publication RabbitMQ        |

Voir `src/config/env.schema.ts` (Zod, fail-fast) pour la liste complète.

---

## 5. Démarrer en local

```powershell
# Pré-requis : Postgres + Redis + RabbitMQ (docker-compose), migrations + seed appliqués.
pnpm --filter @nina-aes/database db:migrate
pnpm --filter @nina-aes/database db:seed   # crée les 6 centres (CTDEC + 5 antennes)

pnpm --filter @nina-aes/appointment-service dev
# Swagger : http://localhost:3008/api/docs
```

---

## 6. Tests

```powershell
pnpm --filter @nina-aes/appointment-service test
```

Couverture unitaire : géo (Haversine), grille/disponibilité des créneaux, file d'attente (priorité +
attente), cœur métier des RDV (création, transitions, no-show), filtres des centres.

---

## 7. Notes & limites connues

- **Pas de self-service CITIZEN direct (anti-IDOR)** : le `sub` du JWT identifie un compte Keycloak,
  pas un `Citizen`, et aucune liaison forte `JWT.sub ↔ Citizen.id` n'existe encore (ressort
  d'`identity`/`auth-service`). Accorder CITIZEN sur ces routes permettrait de passer un `citizenId`
  arbitraire ⇒ lecture/annulation des RDV d'autrui, fuite de PII, passe-droit prioritaire
  (IDOR/BOLA). Les opérations sont donc **médiées** : un agent au guichet, ou le BFF du portail
  citoyen / USSD / borne (compte de service AGENT) qui a authentifié le citoyen et résolu son
  `citizenId`, appelle l'API. `GET /appointments` exige un filtre de portée (`citizenId` ou
  `centerId`) et est paginé (≤ 200/page) pour empêcher tout vidage de masse. Quand le binding
  existera, on pourra rouvrir un self-service CITIZEN scoppé à sa propre identité. Voir **ADR-028**.
- **i18n des rappels** : les templates vivent dans `notification-service` (FR + fallback FR pour les
  autres langues). Le service envoie en SMS (canal inclusif) ; l'email est disponible mais non émis
  en V1.
- **Mali = UTC+0** : aucune conversion de fuseau. À revoir pour la diaspora
  (`EnrollmentCenter.timezone`).
