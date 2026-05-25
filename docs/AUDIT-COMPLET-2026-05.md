# AUDIT COMPLET — NINA-AES Platform

> **Date** : 23 mai 2026 **Auditeur** : Agent Explore (Claude Code) — mandaté par l'étudiant UQAR
> **Périmètre** : 15 services + 13 packages + 3 apps + documentation **Méthode** : lecture statique
> du code, des `package.json`, du `CHANGELOG.md`, et du PROMPT v2.0 **Statut** : Document de
> référence pour la refonte v3.0

---

## 1. Synthèse exécutive

Le monorepo NINA-AES est **majoritairement documenté et architecturé** mais **critiquement incomplet
en code**.

| Indicateur                                         | Valeur                                               |
| -------------------------------------------------- | ---------------------------------------------------- |
| Services attendus                                  | 15                                                   |
| Services 100 % fonctionnels                        | **1** (identity-service)                             |
| Services 40-60 % (scaffold + quelques contrôleurs) | 8                                                    |
| Services 0-20 % (vides ou quasi-vides)             | **6**                                                |
| Versions cohérentes avec le PROMPT v2.0            | **~25 %** (5 majeures sur 41 obsolètes ou inventées) |
| Services en NestJS 11.1                            | 9 sur 15                                             |
| Services en NestJS 10.4 (drift)                    | **6 sur 15**                                         |
| Package `@nina-aes/logger` utilisé                 | **0 service** (stub inopérant)                       |

**Verdict** : le Bloc A est à environ 20 % d'exécution réelle. Un sprint focalisé de 3-4 semaines
est nécessaire pour rattraper les services backbone manquants (`api-gateway`, `enrollment-service`,
`ussd-service`) et harmoniser les versions avant tout déploiement en staging.

---

## 2. Inventaire des 15 services — complétude réelle

| Service                              | NestJS  | `src/` ?    | `main.ts`            | Modules                           | Complétude | Notes                                                           |
| ------------------------------------ | ------- | ----------- | -------------------- | --------------------------------- | ---------- | --------------------------------------------------------------- |
| **identity-service**                 | 11.1.18 | ✅          | ✅                   | 3 (citizen, correction, location) | **100 %**  | CRUD, middleware, RabbitMQ, Redis, guards — modèle de référence |
| **auth-service**                     | 11.1.18 | ✅          | ✅                   | 1 (well-known, jwks)              | **60 %**   | Stub Keycloak — émission JWT non livrée                         |
| **api-gateway**                      | 10.4.0  | ❌ **VIDE** | ❌                   | —                                 | **0 %**    | Skeleton uniquement (`package.json` + README vide)              |
| **document-service**                 | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **60 %**   | Skeleton — PDF/MinIO à implémenter                              |
| **ai-service** (FastAPI)             | —       | ✅ `app/`   | ✅ `main.py`         | 1 (health)                        | **30 %**   | Stub — pipeline IA absent                                       |
| **audit-service**                    | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **60 %**   | Skeleton — chaîne Merkle absente                                |
| **appointment-service**              | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **40 %**   | Stub — aucune logique RDV                                       |
| **enrollment-service**               | 10.4.0  | ❌ **VIDE** | ❌                   | —                                 | **0 %**    | Skeleton — enrôlement biométrique absent                        |
| **ussd-service**                     | 10.4.0  | ❌ **VIDE** | ❌                   | —                                 | **0 %**    | Skeleton — menu USSD absent                                     |
| **biometric-service**                | 10.4.0  | ✅          | ✅                   | 1 (app.controller)                | **20 %**   | Stub — aucune capture biométrique                               |
| **notification-service**             | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **30 %**   | Stub — aucune intégration email/SMS                             |
| **governance-service**               | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **20 %**   | Stub — messagerie absente                                       |
| **anticorruption-service** (FastAPI) | —       | ✅ `app/`   | ✅ `main.py` minimal | —                                 | **5 %**    | Quasi vide — SIGAC / Isolation Forest absent                    |
| **interop-service**                  | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **10 %**   | Stub — BCID-AES absent                                          |
| **vulnerability-service**            | 11.1.18 | ✅          | ✅                   | 1 (app.controller)                | **10 %**   | Stub — files prioritaires absentes                              |

---

## 3. Focus — `api-gateway`, `enrollment-service`, `ussd-service`

Les trois services demandés par l'utilisateur dans la consigne. **Tous trois en état critique (0 %
de code)**.

### 3.1 `api-gateway` (port attendu : 3000)

- Pas de dossier `src/` (un `dist/` traîne — probablement vestige d'un build antérieur supprimé)
- `package.json` déclare NestJS 10.4.0 (mismatch vs reste du repo en 11.1.18)
- Dépendances présentes : `@nestjs/axios`, `@nestjs/throttler`, `express-rate-limit`, `axios`
- **Manque** : proxy vers les 14 services en aval, circuit breaker (Opossum), validation JWT
  centralisée, agrégation Swagger, Helmet, CORS configuré, propagation `X-User-Context`

### 3.2 `enrollment-service` (port à attribuer — recommandé 3013)

- Pas de dossier `src/`
- `package.json` en NestJS 10.4.0 (à bumper)
- Dépendances présentes : `@nestjs/microservices`, `@nina-aes/database` (Prisma)
- **Manque** : capture biométrique, vérification qualité empreinte (NFIQ 2.0), validation NINA,
  intégration RAVEC, queue async, kits mobiles offline-first

### 3.3 `ussd-service` (port à attribuer — recommandé 3014)

- Pas de dossier `src/`
- `package.json` en NestJS 10.4.0
- Dépendances présentes : `@nestjs/microservices`, `@nina-aes/database`
- **Manque** : webhook Africa's Talking, machine d'états (XState), sessions Redis TTL 5 min, i18n 8
  langues (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE), validation HMAC du webhook, rate limit par numéro

> **Note importante** : le PROMPT v2.0 décrit `ussd-service` comme un _sous-module_ de
> `vulnerability-service` (PROMPT 6.2). C'est en contradiction avec la structure réelle où
> `ussd-service` est un service NestJS à part entière. Le PROMPT v3.0 traite `ussd-service` comme
> service autonome.

---

## 4. Drift de versions — détail par catégorie

| Catégorie    | Prompt v2.0 dit         | Réel (package.json majoritaire) | Réel (minoritaire)      | Statut         |
| ------------ | ----------------------- | ------------------------------- | ----------------------- | -------------- |
| NestJS core  | 11.1+                   | 11.1.18 (9 services)            | **10.4.0 (6 services)** | ⚠️ Drift       |
| TypeScript   | 6.0                     | 6.0.2 (9 services)              | **5.6.0 (6 services)**  | ⚠️ Drift       |
| @types/node  | —                       | 25.5.2 (majorité)               | 22.15.3 (3 services)    | ⚠️ Mineur      |
| Node engines | 24                      | `>=24.0.0` (identity seul)      | absent ailleurs         | ⚠️ Non enforce |
| Prisma       | 7.7.0 (prompt cite 7.6) | **7.8.0**                       | —                       | ✅             |
| Next.js      | non spécifié            | 16.2.2                          | —                       | ✅             |

Les 6 services en NestJS 10.4 / TS 5.6 sont **exactement** : `api-gateway`, `enrollment-service`,
`ussd-service`, `biometric-service`, `auth-service`, `appointment-service`. Coïncidence intéressante
: ce sont les services scaffoldés le plus tard ou jamais finis. La migration NestJS 10→11 a été
appliquée partiellement.

---

## 5. Sécurité — quick check

### ✅ Points forts

- `AllExceptionsFilter` global dans `identity-service` → normalisation HTTP 4xx/5xx
- `process.env.*` lu via `@nina-aes/config` (validation Zod) dans `identity-service`
- Aucun secret hardcodé détecté (grep négatif sur `JWT_SECRET`, `API_KEY` dans `src/`)
- `ValidationPipe` global avec `whitelist: true` et `forbidNonWhitelisted: true` dans
  `identity-service`

### ⚠️ Lacunes

- **3 services backbone (api-gateway, enrollment, ussd) n'ont pas de code** → aucun filtre, aucune
  validation, aucune authentification
- **auth-service** : stub Keycloak — aucune émission JWT fonctionnelle
- **Validation Zod absente côté services** : seul `class-validator` est utilisé (moins strict que
  Zod pour DTOs complexes)
- **Pas d'intégration RabbitMQ** dans 8/15 services (seul `identity` a un `RabbitMQService`)
- **`@nina-aes/logger` non utilisé** : tous les services emploient `new Logger(ServiceName.name)`
  (Logger NestJS de base) — pas de Pino, pas de Loki, pas de correlation ID, pas de masquage PII

---

## 6. Logging — état réel

Le package `@nina-aes/logger` est un **stub temporaire** (le `CHANGELOG.md` §2 le note explicitement
: « implémentation Pino + Loki à faire dans doc 17 »).

| Indicateur                                   | Valeur                              |
| -------------------------------------------- | ----------------------------------- |
| Services qui importent `@nina-aes/logger`    | **0**                               |
| Services utilisant `new Logger()` NestJS     | 19 fichiers répartis sur 9 services |
| Usage de Pino direct                         | 0                                   |
| Usage de `console.log`                       | 0 (bon)                             |
| Correlation ID (X-Request-Id)                | absent                              |
| Masquage PII (NINA, biométrie) dans les logs | absent                              |
| Exporters Loki                               | absents                             |

**Impact** : aucune télémétrie structurée exploitable. En cas d'incident en prod, l'investigation
forensique serait quasi impossible.

---

## 7. Top 10 — dettes techniques et gaps critiques

1. **Trois services backbone complètement vides** (`api-gateway`, `enrollment`, `ussd`) → bloquent
   le Bloc A
2. **Mismatch NestJS majeur** : 5 services en 10.4, 9 en 11.1 → conflits de dépendances potentiels
3. **Logger stub inopérant** : aucune observabilité structurée
4. **`ai-service` et `anticorruption-service` à ~5-30 %** : FastAPI expose juste `/health`, aucun
   pipeline IA
5. **`auth-service` sans Keycloak fonctionnel** : stub well-known/JWKS uniquement
6. **Validation Zod absente côté backend** : `class-validator` seul (moins sûr)
7. **RabbitMQ non intégré** dans 8/15 services
8. **Seed Prisma partiel** : 371 locations chargées (1 pays + 10 régions Mali) vs cible (20
   régions + 64 cercles + ~300 communes échantillons)
9. **Documentation drift** : les 27 docs `docs/*.md` citent NestJS 11.1 / Node 24 / Prisma 7.7, mais
   une partie du code est en 10.4 / 22 / 7.8
10. **Tests E2E Playwright en mode mock seulement** : aucune intégration backend réelle

---

## 8. Recommandations priorisées (ordre d'exécution v3.0)

### Sprint 1 (semaine 1) — Harmonisation

- Pin **NestJS 11.1.23**, **TypeScript 6.0.3**, **@types/node 25.5.2** dans **tous** les
  `package.json` services
- Créer `src/{main.ts, app.module.ts, app.controller.ts}` dans `api-gateway`, `enrollment-service`,
  `ussd-service`
- Ajouter `"engines": { "node": ">=24.0.0" }` à tous les `package.json` services

### Sprint 2 (semaine 2) — `api-gateway`

- Module `gateway-proxy.module.ts` : intercepter GET/POST → routage vers 14 services aval
- Circuit breaker (Opossum) + timeout 5s par service
- Middleware JWT (vérification clé publique Keycloak)
- Agrégation Swagger sur `/api/docs`
- Helmet + CORS strict pour les 3 apps frontend

### Sprint 3 (semaine 3) — `enrollment-service` + `ussd-service`

- `enrollment` : modules `biometric-capture/`, `verification/`, `quality-check/`, route
  `POST /enroll`, intégration RAVEC
- `ussd` : adapter Africa's Talking, machine d'états Redis (TTL 5 min), 8 langues, validation HMAC
  du webhook

### Sprint 4 (semaine 4) — Logger opérationnel

- Remplacer `@nina-aes/logger` stub par Pino 9 + transport Loki
- Helpers `LoggerModule.forRoot()` (NestJS) et `setup_logger()` (FastAPI)
- Correlation ID middleware, masquage PII (NINA, biométrie, mots de passe)
- Import obligatoire dans les 15 services

### Sprint 5 (semaines 4-5) — Services IA

- `ai-service` : pipeline 5 étapes (normalisation → NER/spaCy → règles métier → fuzzy match →
  scoring XGBoost)
- `anticorruption-service` : Isolation Forest sur métadonnées agents, LSTM séquences
- Dataset synthétique 10 000 enregistrements

### Sprint 6 (semaine 6) — Validation Zod + ErrorFilter

- Schémas Zod centralisés dans `@nina-aes/shared-types` (déjà partiellement présents)
- `ZodValidationPipe` global dans tous les services
- `AllExceptionsFilter` étendu pour `ZodError` (cf. `identity-service` comme modèle)

### Sprint 7 (semaine 6) — RabbitMQ / Redis

- `audit-service` consomme `citizen.*`, `correction.*`, `agent.*` → chaîne Merkle
- `notification-service` consomme `correction.approved` → SMS/email
- Healthcheck Redis + RabbitMQ dans `/health` Terminus

### Sprint 8 (semaine 7) — Tests

- Jest suites pour `enrollment`, `ussd`, `api-gateway`
- Playwright E2E backend réel (pas mock)
- k6 load tests : 100 VUs sur `/citizens/:nina`

### Sprint 9 (semaine 8) — Documentation

- `CHANGELOG.md` v3.0
- ADR-018 « Pourquoi NestJS 11.1 + Zod »
- README par service (entrypoint, dépendances, healthcheck)

---

## 9. Conclusion

Le projet a **une architecture solide sur le papier et un design system frontend abouti**, mais **le
backend est très partiel**. Le PROMPT v2.0 promet plus que ce qui est livré, et cite des versions
parfois inventées (`Jest 0.3.0`, `Next.js 16.6`, `Prisma 7.6`, `Vault 1.21`).

La refonte en v3.0 doit :

1. Coller à la **réalité du code** (15 services, dont 6 quasi-vides)
2. Utiliser les **vraies versions stables de mai 2026** (cf. `docs/VERSIONS-MAI-2026.md`)
3. Imposer des **standards transversaux** (logger structuré, error filter, JSDoc français, codes
   d'erreur normalisés)
4. **Corriger les bugs du prompt** (doublon 8.2 ↔ 9.2, collision ports, phases mal numérotées,
   services oubliés)
5. Documenter l'**état réel** pour que l'étudiant sache exactement où il en est avant chaque sprint

---

**Document généré le 23 mai 2026 — base de la refonte PROMPT v3.0**
