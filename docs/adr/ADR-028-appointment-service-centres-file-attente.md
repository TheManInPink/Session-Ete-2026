# ADR-028 — appointment-service : modèle centres, file d'attente virtuelle et autorisation

## Statut

Accepté — 2026-06-04

## Contexte

Le `appointment-service` (port 3008, Bloc A + files prioritaires C1) gère la prise de rendez-vous
dans les centres d'enrôlement (CTDEC Bamako + antennes RAVEC régionales) : créneaux STANDARD vs
PRIORITAIRE (réservés aux personnes vulnérables), quotas par centre, file d'attente le jour J,
no-show et rappels SMS. Le schéma Prisma possédait déjà `Appointment` (qui référence un centre via
`institution_id`) et `Institution`, mais aucun « profil opérationnel » de centre (horaires,
capacité, quotas, fenêtre prioritaire, géolocalisation). Plusieurs décisions structurantes étaient à
arbitrer.

## Décisions

### 1. Profil de centre : modèle `EnrollmentCenter` (1:1 `Institution`) plutôt que colonnes sur `Institution`

Un nouveau modèle `EnrollmentCenter` porte la configuration de RDV, rattaché 1:1 à une `Institution`
(`institution_id @unique`). Les `Appointment` continuent de référencer l'`Institution`
(`centerId = institution_id`) ; l'identifiant public d'un centre est donc l'`Institution.id`.

- **Pourquoi pas des colonnes sur `Institution`** : `institutions` est partagée par 4 domaines
  (users, gouvernance, audit, RDV) ; y ajouter ~12 colonnes spécifiques aux RDV la pollue et couple
  des services indépendants.
- **Pourquoi pas un catalogue applicatif** (config TS seedée) : la souveraineté de la donnée et la
  modifiabilité par un admin sans redéploiement imposent une source de vérité en base (principe
  directeur du projet). Migration **purement additive** (aucune colonne existante modifiée).

### 2. File d'attente virtuelle + blacklist no-show : Redis

- File d'attente : **sorted set** Redis par `centre/jour` ; score = heure d'arrivée − bonus de
  priorité (P1 = 24 h) ⇒ les vulnérables passent devant les arrivées standard du même jour, sans
  jamais doubler une file inter-journalière. Le rang donne le numéro de passage + l'attente estimée.
- Blacklist no-show : **clé à TTL natif** (48 h). 2 absences sur 90 j glissants ⇒ blacklist.
- **Tolérance aux pannes** : la file dégrade proprement et la vérification de blacklist échoue
  **ouvert** (on ne bloque jamais une réservation pour une panne d'infra). PostgreSQL reste la
  source de vérité ; Redis est un accélérateur d'expérience, pas un système d'enregistrement.

### 3. Anti-surbooking : verrou consultatif Postgres au niveau JOUR

La grille de capacité a 3 niveaux (créneau `parallelDesks`, nature/jour
`standardQuota`/`priorityQuota`, jour `capacityPerDay`). Le pré-contrôle en lecture
(`getAvailability`) laisse une fenêtre TOCTOU sous concurrence. La création passe donc par
`createBookingAtomic` qui, **dans une transaction**, prend un
`pg_advisory_xact_lock(hashtext('appt:<centerId>:<jour>'))` puis **recompte les 3 niveaux** avant
l'insert. Le verrou est pris au niveau **JOUR** (et non créneau) pour sérialiser aussi les requêtes
ciblant des créneaux distincts d'un même jour (sinon les quotas journaliers seraient contournables).
Choix d'un verrou consultatif plutôt que d'une contrainte `UNIQUE` : les quotas sont des agrégats
(pas une unicité de ligne) que SQL ne peut pas exprimer en contrainte simple.

### 4. Notifications : publication d'événements vers `notification-service`

Le service **ne rend pas** les messages : il publie un `NotificationJob` sur l'exchange topic
`nina.notifications` (clé `notification.sms`), consommé par `notification-service` qui gère le rendu
multilingue, l'idempotence et la livraison. Les templates `appointment-reminder-2h` et
`appointment-cancelled` ont été ajoutés à son catalogue. Les rappels (confirmation, J-1, H-2) sont
**idempotents** via `idempotencyKey` (`appt:<id>:reminder-*`) : un rappel republié (chevauchement de
fenêtres cron, redélivrance) n'est expédié qu'une fois. La fenêtre du cron (15 min) est
volontairement

> à son intervalle (10 min) pour garantir un recouvrement et ne jamais « trouer » un rappel après un
> tick manqué.

### 5. Autorisation : opérations RDV **médiées par le personnel / le portail** (pas de self-service CITIZEN direct)

Le claim `sub` du JWT identifie un compte **Keycloak**, pas un `Citizen` (le modèle `Citizen` n'a
pas de `keycloakId`). Il n'existe donc **aucune liaison forte `JWT.sub ↔ Citizen.id`** dans le
périmètre de ce service. Accorder le rôle CITIZEN sur les routes `/appointments` permettrait à tout
citoyen authentifié de soumettre un `citizenId` arbitraire ⇒ faille d'autorisation horizontale
(IDOR/BOLA : lecture/annulation des RDV d'autrui, fuite de PII, passe-droit sur la file
prioritaire).

**Décision** : les routes `/appointments/*` sont réservées à **AGENT / SUPERVISOR / ADMIN** (+
AUDITOR en lecture). Le `citizenId` est fourni par un appelant de confiance (agent au guichet, ou
BFF du portail citoyen / USSD / borne — compte de service AGENT — qui a authentifié le citoyen et
résolu son identité). `GET /appointments` exige un **filtre de portée** (`citizenId` ou `centerId`)
et est **paginé** (≤ 200/page) pour interdire tout vidage de masse. Les routes `/centers/*`
(annuaire sans PII) restent publiques mais throttlées.

> Quand la liaison `JWT.sub ↔ Citizen.id` existera (ressort d'`identity`/`auth-service`), on pourra
> rouvrir un self-service CITIZEN **scopé à sa propre identité** (dériver le `citizenId` du token,
> vérifier la propriété de la ligne sur get/cancel).

### 6. Fuseau horaire : tout en UTC

Le Mali est à **UTC+0 toute l'année** (pas de changement d'heure). Toute l'arithmétique de créneaux,
de jours et de files raisonne en UTC, évitant une dépendance à une librairie de fuseaux. À revoir si
un centre opère hors UTC (diaspora) via `EnrollmentCenter.timezone`.

## Conséquences

### Positives

- Configuration des centres en base, modifiable sans redéploiement ; `institutions` non polluée.
- Quotas garantis sous concurrence (3 niveaux revérifiés atomiquement).
- File d'attente performante et inclusive (priorité vulnérables), sans devenir un point de
  défaillance bloquant.
- Aucune faille IDOR/BOLA : surface citoyenne fermée tant que le binding d'identité n'existe pas.
- Découplage net du `notification-service` (un seul producteur d'événements, rendu/i18n
  centralisés).

### Négatives / limites

- **Pas de self-service CITIZEN direct** tant que le binding d'identité n'est pas livré (les
  citoyens passent par un agent ou le BFF du portail). Suivi : binding `identity`/`auth-service`.
- **Verrou JOUR** : sérialise les réservations d'un centre pour un jour donné — acceptable au volume
  visé (≤ ~200 RDV/centre/jour), à réévaluer si la charge explose (sharding par créneau + contrainte
  d'exclusion Postgres).
- **Rappels best-effort** : SMS de courtoisie ; un curseur persisté `reminderSentAt` (colonne
  future) fiabiliserait davantage que la fenêtre glissante + idempotence actuelle.

## Alternatives écartées

| Alternative                                 | Pourquoi écartée                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Colonnes RDV sur `Institution`              | Pollue une table partagée par 4 domaines                                  |
| Catalogue de centres en config TS           | Pas de source de vérité en base ; modif = redéploiement                   |
| File d'attente en table SQL                 | Redis (sorted set + TTL) plus naturel ; PostgreSQL reste l'enregistrement |
| Contrainte `UNIQUE` anti-surbooking         | Exprime une unicité de ligne, pas des quotas agrégés                      |
| CITIZEN avec vérification de propriété      | Impossible sans liaison `JWT.sub ↔ Citizen.id` (hors périmètre)           |
| Rappels via plugin delayed-message RabbitMQ | Non disponible ; cron + idempotence suffisent                             |

## Références

- ADR-011 — schéma Prisma · ADR-027 — `auth-guards` type-only (guards locaux par service)
- Doc PROMPT 3.6 — appointment-service · `services/appointment-service/README.md`
- OWASP API Security Top 10 — API1 (BOLA) / API3 (BOPLA)
- PostgreSQL — verrous consultatifs :
  https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
