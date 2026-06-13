# ADR-029 — api-gateway : terminaison d'authentification au bord + propagation `X-User-Context` (JWS)

## Statut

Accepté — 2026-06-13

## Contexte

Le `api-gateway` (port 3000, Bloc A) est le **point d'entrée HTTP unique** : toutes les requêtes des
3 apps Next.js (citizen / admin / governance), du mobile, du kiosque et du webhook USSD y transitent
avant d'atteindre les 14 microservices internes. Le scaffold MVP (PROMPT 3.1) routait déjà (table
statique + circuit breakers Opossum) mais **décodait le JWT sans en vérifier la signature**, ne
proposait ni rate limiting distribué, ni compression, ni Swagger agrégé, ni agrégateur de santé
(limites documentées dans le README MVP).

PROMPT 3.7 complète le service à hauteur de ses 10 responsabilités. Plusieurs décisions
structurantes — surtout autour de l'**authentification** et de la **confiance inter-services** —
étaient à arbitrer.

## Décisions

### 1. Terminaison d'authentification au bord + `X-User-Context` signé (JWS HS256)

Le JWT d'accès **RS256** est vérifié **une seule fois**, au gateway, via le **JWKS**
d'`auth-service` (`/.well-known/jwks.json`, pattern `JwksJwtVerifier` identique aux autres services
— ADR-027). Le gateway ré-émet alors un **JWS interne court** (`X-User-Context`, **HS256**, claims
`sub/role/mfa/email`, `iss=nina-aes-api-gateway`, **TTL 60 s**) propagé aux services aval.

- **Pourquoi un JWS interne plutôt que des en-têtes en clair** (`X-User-Id`) : un service aval ne
  doit jamais faire confiance à une identité non signée — un attaquant ayant atteint le réseau
  interne pourrait la forger. La signature (secret partagé **distribué par Vault**) rend l'en-tête
  infalsifiable.
- **Pourquoi HS256 en interne, RS256 au bord** : le RS256 (asymétrique, coûteux) n'est vérifié
  qu'une fois ; en interne, un HS256 (symétrique, bon marché) suffit puisque l'émetteur est de
  confiance. TTL court ⇒ fenêtre de rejeu minimale si un en-tête fuite dans un log.
- **Anti-spoofing** : le gateway **purge systématiquement** `X-User-Context` / `X-User-Id` /
  `X-User-Role` entrants avant tout traitement — seul le gateway peut les émettre.
- **Compatibilité ascendante** : l'en-tête `Authorization` d'origine reste **aussi** transmis tant
  que les services aval vérifient eux-mêmes le JWKS (ADR-027). `X-User-Context` est la cible vers
  laquelle ils migreront (vérification HS256 bon marché au lieu du JWKS).

### 2. Authentification dans un **guard global**, pas dans le controller catch-all

La vérification vit dans `GatewayAuthGuard` (`APP_GUARD`), pas dans le `ProxyController`. La
publicité d'une route est décidée à partir de la **table de routage statique** (`isPublicEndpoint`)

- une allowlist locale (health, metrics, swagger, `/api/v1/api-gateway/{info,openapi.json}`).

* **Pourquoi un guard** : idiomatique Nest, et surtout il s'exécute **avant** le guard de rate
  limiting — ce dernier dispose ainsi de l'`userId` pour une limitation **par utilisateur**.
* ADR-027 : guard **local** au service (jamais dans un package partagé — la duplication de
  `@nestjs/core` casse l'identité de `Reflector`).

### 3. Rate limiting **Redis**, fenêtre fixe, **fail-open**, par utilisateur puis par IP

`RedisRateLimitGuard` incrémente atomiquement un compteur `rl:<identité>:<début-fenêtre>` (ioredis
`INCR` + `EXPIRE` à la première occurrence). L'identité = `userId` authentifié si présent, sinon
l'IP source (premier hop `X-Forwarded-For`).

- **Pourquoi Redis et pas un compteur mémoire** : derrière un load-balancer, N pods n'observent
  chacun que 1/N du trafic ⇒ limite réelle N× trop permissive. Redis centralise le décompte.
- **Pourquoi un guard maison et non le `ThrottlerStorageRedis`** : indépendance vis-à-vis des
  internes (versionnés) de `@nestjs/throttler`, contrôle total de la clé d'identité, et `ioredis`
  est déjà une dépendance. Pas de nouvelle dépendance.
- **Fail-open** : si Redis est indisponible, on laisse passer. Le rate limiting est une protection
  best-effort, jamais un déni de service auto-infligé.

### 4. Routage : table **statique** (compile-time), avals locaux servis sur place

La table reste statique (pas d'injection dynamique de route ⇒ pas d'attaque par injection). Ajouts
PROMPT 3.7 : route `biometric` (port 3012) et **`/api/v1/api-gateway/*`** servie **localement** (la
15ᵉ « cible » : introspection + spec OpenAPI agrégée), non proxifiée. L'ordre d'`imports`
d'AppModule place `ProxyModule` en **dernier** pour que son catch-all `@All('*')` (préfixé
`/api/v1`) ne capture pas health / gateway-meta.

### 5. Swagger **agrégé** : fetch paresseux + fusion pure + cache TTL + dégradation douce

`AggregatorService` récupère `${base}/api/docs-json` de chaque aval distinct, fusionné par une
fonction **pure** (`mergeOpenApiDocuments`, testée sans réseau) : chemins **préfixés `/api/v1`**
(les specs aval sont générées **avant** le global prefix), schémas **namespacés** par service
(`Identity_Foo`) avec réécriture exacte des `$ref` (anti-collision), tag par service. Un aval
injoignable est **ignoré** (jamais d'échec). Spec servie sur `/api/v1/api-gateway/openapi.json`
(machine-readable) ; option `SWAGGER_AGGREGATE_ON_BOOT` pour servir l'agrégat directement sur
`/api/docs`.

### 6. Santé : **readiness** (critiques) distincte de l'**agrégateur** (tous, non bloquant)

- `GET /health/ready` **gate** le routing K8s et ne dépend que des services **critiques** (identity,
  auth) + Redis. Le gateway reste « ready » si un aval **secondaire** est down — c'est le **circuit
  breaker par route** qui isole la panne, pas la readiness.
- `GET /health/downstreams` est **observationnel** : pingue les 14 avals en parallèle et renvoie
  leur état, **toujours 200** (un dashboard, pas un gate).

### 7. Circuit breakers exposés via un **registre découplé**

L'état des breakers Opossum (un par service) est exposé en lecture (`/api/v1/api-gateway/breakers`)
via un `BreakerRegistry` **global**. Découplage volontaire : injecter `ProxyService` dans
`gateway-meta` forcerait l'initialisation du catch-all avant gateway-meta et casserait l'ordre
d'enregistrement des routes. Un module global **sans controller** est neutre vis-à-vis de cet ordre.

## Conséquences

### Positives

- Authentification vérifiée **une fois** ; confiance inter-services **cryptographique** et non plus
  fondée sur des en-têtes en clair ; surface de spoofing fermée.
- Rate limiting **cohérent multi-pods**, par utilisateur, sans devenir un point de défaillance
  (fail-open).
- Documentation API **unifiée** (une spec pour toute la plateforme) sans couplage de boot fort.
- Readiness **stable** : une panne aval secondaire ne retire pas le gateway du load-balancer.
- Aucune nouvelle dépendance « lourde » ; `compression` et `zod` seuls ajoutés.

### Négatives / limites

- **Vérification du `X-User-Context` côté aval pas encore livrée** : les services continuent de
  vérifier le JWKS eux-mêmes (`Authorization` toujours transmis). Un helper partagé de vérification
  HS256 reste à fournir pour finaliser la migration.
- **Secret HS256 partagé** : un secret unique gateway↔avals ; sa rotation (Vault) doit être
  coordonnée. Une montée en Ed25519 (asymétrique, le gateway seul signe) est l'évolution naturelle.
- **Agrégat OpenAPI best-effort** : un aval down est silencieusement absent de la spec (log warn) ;
  l'agrégat reflète l'état au moment du fetch (cache TTL).
- **Fenêtre fixe** de rate limiting : effet de bord classique (rafale possible à cheval sur deux
  fenêtres) ; un algorithme glissant (token bucket) serait plus lisse si besoin.

## Alternatives écartées

| Alternative                                        | Pourquoi écartée                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| En-têtes d'identité en clair (`X-User-Id` seul)    | Falsifiables sur le réseau interne ; pas de confiance vérifiable                   |
| Re-vérifier le RS256 (JWKS) dans chaque service    | Déjà le cas ; le but est précisément de **terminer** l'auth une fois au bord       |
| Auth dans le controller catch-all                  | Le rate limiting perd l'`userId` ; moins idiomatique que `APP_GUARD`               |
| `@nest-lab/throttler-storage-redis`                | Couplage aux internes versionnés du throttler ; guard maison plus simple/sûr       |
| Compteur de rate limit en mémoire                  | Faux sous N pods (limite N× trop permissive)                                       |
| Readiness gatée sur les 14 avals                   | Une panne secondaire retirerait tout le gateway du LB ; rôle du breaker            |
| Table de routage dynamique (DB/admin)              | Surface d'injection de route ; la performance et la sécurité préfèrent le statique |
| Construire l'agrégat OpenAPI au boot (obligatoire) | 14 fetch bloquants au démarrage ; lazy + cache TTL + dégradation douce             |

## Références

- ADR-006 — JWT RS256 + QR · ADR-013 — Keycloak (émetteur des tokens) · ADR-014 — audit append-only
- ADR-026 — Vault Transit (signature) · ADR-027 — `auth-guards` type-only (guards locaux par
  service)
- ADR-017 — observabilité LGTM (`/metrics`, traces OTel)
- Doc PROMPT 3.7 — api-gateway · `services/api-gateway/README.md`
- OWASP API Security Top 10 — API2 (Broken Authentication) / API8 (Security Misconfiguration)
- W3C Trace Context (propagation `traceparent`) : https://www.w3.org/TR/trace-context/
