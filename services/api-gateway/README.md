# `@nina-aes/api-gateway`

> **Port** : 3000 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · Opossum · Helmet · ioredis ·
> jsonwebtoken **Statut** : complet (10 responsabilités — PROMPT 3.7) **Référence** : PROMPT MAÎTRE
> v3.0 — Phase 3.1 / 3.7 · **ADR-029**

---

## 1. Rôle

Point d'entrée HTTP **unique** pour toute la plateforme NINA-AES. Toutes les requêtes externes (apps
Next.js, mobile, kiosque, webhook USSD) passent par ce service avant d'atteindre les microservices
internes.

---

## 2. Responsabilités

| Responsabilité   | Implémentation                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Routing          | Table statique — 18 préfixes → 14 services + route locale `/api/v1/api-gateway` (`proxy.routes.ts`, voir §2.1) |
| Circuit breaker  | Opossum, un par service aval (état exposé sur `/api/v1/api-gateway/breakers`)                                  |
| Authentification | JWT RS256 vérifié **une fois** (JWKS) au bord — `GatewayAuthGuard`                                             |
| Contexte propagé | `X-User-Context` **signé JWS HS256** (TTL 60 s) + purge des en-têtes usurpés                                   |
| Rate limiting    | **Redis** (`RedisRateLimitGuard`), par utilisateur sinon IP, fail-open                                         |
| Compression      | gzip / brotli (`compression`)                                                                                  |
| Sécurité HTTP    | Helmet (CSP, HSTS, X-Frame-Options)                                                                            |
| CORS             | Liste blanche d'origines via env                                                                               |
| Corrélation      | `X-Request-Id` + `traceparent` propagés (`@nina-aes/logger`)                                                   |
| Logs             | Pino structuré JSON + masquage PII                                                                             |
| Métriques        | `/metrics` Prometheus (`@nina-aes/observability`), traces OTel **opt-in**                                      |
| Erreurs          | `AllExceptionsFilter` → `ErrorResponse` normalisée                                                             |
| Swagger          | natif `/api/docs` + **agrégé** `/api/v1/api-gateway/openapi.json`                                              |
| Healthcheck      | liveness `/health` · readiness `/health/ready` · agrégateur `/health/downstreams`                              |

### 2.1 Table de routage (`proxy.routes.ts`)

Le proxy forwarde le chemin **inchangé** (aucune réécriture d'URL) : chaque préfixe public est donc
**identique** au préfixe exposé par les controllers du service aval. 18 préfixes pour 14 services
distincts.

| Préfixe(s) public(s)                                             | Service aval (port)   | Endpoints publics (sans JWT)                                                                                      | Timeout |
| ---------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| `/api/v1/citizens` · `/api/v1/corrections` · `/api/v1/locations` | identity (3001)       | —                                                                                                                 | 5 s     |
| `/api/v1/auth`                                                   | auth (3002)           | `/auth/login` · `/auth/register` · `/auth/refresh`                                                                | 5 s     |
| `/api/v1/ai`                                                     | ai (3003)             | —                                                                                                                 | 15 s    |
| `/api/v1/documents`                                              | document (3004)       | —                                                                                                                 | 30 s    |
| `/api/v1/notifications`                                          | notification (3005)   | —                                                                                                                 | 5 s     |
| `/api/v1/aes`                                                    | interop (3006)        | —                                                                                                                 | 5 s     |
| `/api/v1/audit`                                                  | audit (3007)          | —                                                                                                                 | 5 s     |
| `/api/v1/appointments`                                           | appointment (3008)    | —                                                                                                                 | 5 s     |
| `/api/v1/sigac`                                                  | anticorruption (3009) | `/sigac/whistleblower/public-key` · `/sigac/whistleblower/reports` · `/sigac/whistleblower/reports/:token/status` | 5 s     |
| `/api/v1/sgogt` · `/api/v1/directives` · `/api/v1/elections`     | governance (3010)     | —                                                                                                                 | 5 s     |
| `/api/v1/vulnerable`                                             | vulnerability (3011)  | —                                                                                                                 | 5 s     |
| `/api/v1/biometric`                                              | biometric (3012)      | —                                                                                                                 | 5 s     |
| `/api/v1/enrollment`                                             | enrollment (3013)     | —                                                                                                                 | 5 s     |
| `/api/v1/ussd`                                                   | ussd (3014)           | `/ussd/callback` (webhook Africa's Talking)                                                                       | 5 s     |

Notes :

- **Endpoints publics** : déclaration littérale = matching par **préfixe** ; déclaration à segments
  `:param` (ex. token de suivi lanceur d'alerte) = matching **exact segment par segment** (un
  `:param` accepte exactement un segment non vide — fail-closed sinon).
- Le préfixe `/api/v1/governance` (mort : aucun controller aval ne l'expose, le proxy ne réécrit pas
  l'URL) a été **retiré** au profit des trois préfixes réels `/sgogt`, `/directives`, `/elections`.
- Les anciens endpoints publics `/api/v1/sigac/alerts*` (routes inexistantes côté
  anticorruption-service) ont été **remplacés** par les trois vraies routes anonymes du canal
  lanceur d'alerte (`app/main.py`).

---

## 3. Variables d'environnement

Validées au démarrage (fail-fast) par `src/config/env.schema.ts` (Zod).

| Variable                         | Défaut                                        | Rôle                                                   |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `API_GATEWAY_PORT`               | `3000`                                        | Port d'écoute                                          |
| `NODE_ENV`                       | `development`                                 | `development` active pino-pretty                       |
| `SERVICE_VERSION` / `GIT_SHA`    | `1.0.0` / —                                   | Métadonnées build                                      |
| `CORS_ORIGINS`                   | `http://localhost:4001,...`                   | Origines autorisées (CSV)                              |
| `AUTH_JWKS_URL`                  | `http://localhost:3002/.well-known/jwks.json` | JWKS d'auth-service (vérif RS256)                      |
| `AUTH_REQUIRED`                  | `true`                                        | Désactivable pour bancs de test isolés                 |
| `GATEWAY_HS256_SECRET`           | (dev) — **Vault en prod**                     | Signature du JWS `X-User-Context`                      |
| `GATEWAY_USER_CONTEXT_TTL_SEC`   | `60`                                          | Durée de vie du JWS interne                            |
| `REDIS_URL` / `REDIS_KEY_PREFIX` | `redis://localhost:6379` / `gateway:`         | Rate limiting distribué                                |
| `RATE_LIMIT_ENABLED`             | `true`                                        | Active le rate limiting                                |
| `RATE_LIMIT_WINDOW_SEC`          | `60`                                          | Fenêtre (s)                                            |
| `RATE_LIMIT_MAX`                 | `100`                                         | Requêtes max / fenêtre / identité                      |
| `SWAGGER_AGGREGATE_TTL_SEC`      | `300`                                         | TTL du cache de la spec agrégée                        |
| `SWAGGER_AGGREGATE_ON_BOOT`      | `false`                                       | Construit l'agrégat au boot et le sert sur `/api/docs` |
| `OTEL_TRACING_ENABLED`           | `false`                                       | Démarre le SDK OTel (traces)                           |
| `LOKI_URL`                       | —                                             | Endpoint Loki (optionnel)                              |
| `<SERVICE>_SERVICE_URL` (×14)    | `http://<service>:<port>`                     | URL des services aval (voir `proxy.routes.ts`)         |

---

## 4. Démarrer en local

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
pnpm install
pnpm --filter @nina-aes/api-gateway dev

# Tests
curl http://localhost:3000/health
curl http://localhost:3000/health/downstreams
curl http://localhost:3000/api/v1/api-gateway/openapi.json
```

---

## 5. Codes d'erreur (Annexe C du PROMPT v3.0)

| Code             | HTTP | Cause                           |
| ---------------- | ---- | ------------------------------- |
| `E_GW_001`       | 503  | Service en aval indisponible    |
| `E_GW_002`       | 503  | Circuit breaker ouvert          |
| `E_GW_004`       | 401  | JWT requis et absent / invalide |
| `E_GW_RATELIMIT` | 429  | Quota de requêtes dépassé       |
| `E_GW_NOT_FOUND` | 404  | Aucune route pour ce chemin     |
| `E_GW_TIMEOUT`   | 504  | Timeout service en aval         |

---

## 6. Endpoints locaux (non proxifiés)

| Endpoint                               | Auth    | Rôle                                           |
| -------------------------------------- | ------- | ---------------------------------------------- |
| `GET /health`                          | public  | Liveness                                       |
| `GET /health/ready`                    | public  | Readiness (identity + auth + Redis) — gate K8s |
| `GET /health/downstreams`              | public  | État des 14 avals (toujours 200)               |
| `GET /metrics`                         | public  | Métriques Prometheus                           |
| `GET /api/docs`                        | public  | Swagger UI (natif, ou agrégé si on-boot)       |
| `GET /api/v1/api-gateway/info`         | public  | Version, uptime                                |
| `GET /api/v1/api-gateway/openapi.json` | public  | Spec OpenAPI agrégée des 14 services           |
| `GET /api/v1/api-gateway/routes`       | protégé | Table de routage (sans URL interne)            |
| `GET /api/v1/api-gateway/breakers`     | protégé | État des circuit breakers                      |

---

## 7. Suites de migration restantes (post-MVP)

- **Vérification du `X-User-Context` côté aval** : un helper partagé HS256 reste à fournir pour que
  les services aval cessent de re-vérifier le JWKS (l'`Authorization` est encore transmis en
  attendant). Évolution cible : signature **Ed25519** (asymétrique, gateway seul signataire).
- **`GATEWAY_HS256_SECRET` via Vault** en production (le défaut de dev est refusé au boot si
  `NODE_ENV=production`).
- **Tracing OTel** désactivé par défaut (`OTEL_TRACING_ENABLED=false`) — activer en staging/prod.
