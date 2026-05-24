# `@nina-aes/api-gateway`

> **Port** : 3000 **Stack** : NestJS 11.1 · TypeScript 6.0 · Pino · Opossum · Helmet **Statut** :
> MVP livré (était à 0 %) **Référence** : PROMPT MAÎTRE v3.0 — Phase 3.1

---

## 1. Rôle

Point d'entrée HTTP **unique** pour toute la plateforme NINA-AES. Toutes les requêtes externes (apps
Next.js, mobile, kiosque, webhook USSD) passent par ce service avant d'atteindre les microservices
internes.

---

## 2. Responsabilités

| Responsabilité   | Implémentation                                              |
| ---------------- | ----------------------------------------------------------- |
| Routing          | Table statique → 14 services (`proxy.routes.ts`)            |
| Circuit breaker  | Opossum, un par service aval                                |
| Rate limiting    | `@nestjs/throttler`, 100 req/min/IP par défaut              |
| Authentification | Validation JWT (stub — à compléter Prompt 3.3)              |
| Sécurité HTTP    | Helmet (CSP, HSTS, X-Frame-Options)                         |
| CORS             | Liste blanche d'origines via env                            |
| Corrélation      | `X-Request-Id` propagé via `@nina-aes/logger`               |
| Logs             | Pino structuré JSON + masquage PII                          |
| Erreurs          | `AllExceptionsFilter` → `ErrorResponse` normalisée          |
| Healthcheck      | Terminus liveness (`/health`) + readiness (`/health/ready`) |

---

## 3. Variables d'environnement

| Variable                 | Défaut                         | Rôle                             |
| ------------------------ | ------------------------------ | -------------------------------- |
| `API_GATEWAY_PORT`       | `3000`                         | Port d'écoute                    |
| `NODE_ENV`               | `development`                  | `development` active pino-pretty |
| `CORS_ORIGINS`           | `http://localhost:4001,...`    | Origines autorisées (CSV)        |
| `THROTTLE_TTL_SEC`       | `60`                           | Fenêtre de rate limit (secondes) |
| `THROTTLE_LIMIT`         | `100`                          | Requêtes max par fenêtre par IP  |
| `LOKI_URL`               | —                              | Endpoint Loki (optionnel)        |
| `GIT_SHA`                | —                              | Hash Git du build                |
| `IDENTITY_SERVICE_URL`   | `http://identity-service:3001` | URL service aval                 |
| (autres `*_SERVICE_URL`) | voir `proxy.routes.ts`         | URL services aval                |

---

## 4. Démarrer en local

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform
pnpm install
pnpm --filter @nina-aes/api-gateway dev

# Test
curl http://localhost:3000/health
```

---

## 5. Codes d'erreur (Annexe C du PROMPT v3.0)

| Code             | HTTP | Cause                           |
| ---------------- | ---- | ------------------------------- |
| `E_GW_001`       | 503  | Service en aval indisponible    |
| `E_GW_002`       | 503  | Circuit breaker ouvert          |
| `E_GW_004`       | 401  | JWT requis et absent / malformé |
| `E_GW_NOT_FOUND` | 404  | Aucune route pour ce chemin     |
| `E_GW_TIMEOUT`   | 504  | Timeout service en aval         |

---

## 6. Limitations connues du MVP

- **Validation JWT non implémentée** : le controller décode le token sans vérifier la signature. NE
  PAS DÉPLOYER EN PROD EN L'ÉTAT — TODO Prompt 3.3.
- **Swagger agrégé non implémenté** : `/api/docs` ne contient que les routes locales.
- **`X-User-Context` non signé JWS** : à sécuriser dans une 2e passe via mTLS + JWS.
- **Métriques Prometheus non exposées** : `/metrics` à ajouter via `@nina-aes/observability`.
- **Tests E2E absents** : à écrire (Prompt 10.1 du v3.0).
