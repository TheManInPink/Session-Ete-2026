# ADR-003 — NestJS pour les services TypeScript

## Statut

Accepté — Avril 2026

## Contexte

9 des 11 microservices sont écrits en TypeScript. Plusieurs frameworks sont candidats : Express.js
nu, Fastify, Hono, NestJS. Le choix doit favoriser la maintenabilité sur 9 services avec des
patterns de code cohérents, tout en offrant une intégration native avec Prisma, RabbitMQ et
Keycloak.

## Décision

NestJS 11.1+ pour tous les services TypeScript backend : identity-service, auth-service,
document-service, notification-service, interop-service, audit-service, appointment-service,
governance-service, vulnerability-service.

## Conséquences positives

- Système de modules et d'injection de dépendances intégré — simplifie le découplage entre
  composants d'un même service
- Guards (authentification JWT), Interceptors (audit automatique), Pipes (validation DTO) sont des
  primitives natives — la sécurité et la qualité deviennent des conventions, pas des options
- Intégration native avec Prisma ORM, RabbitMQ (via `@nestjs/microservices`), WebSockets, et le
  pattern CQRS
- Génération automatique de documentation OpenAPI via `@nestjs/swagger`
- Documentation exhaustive et communauté active (>70k stars GitHub)
- Pattern de code identique sur les 9 services — réduction de la charge cognitive

## Conséquences négatives

- Courbe d'apprentissage initiale (décorateurs TypeScript, système de modules, injection de
  dépendances)
- Overhead de démarrage plus élevé qu'Express nu (~200 ms vs ~50 ms) — négligeable pour des services
  persistants
- Convention over configuration — moins de flexibilité pour des cas atypiques

## Alternatives rejetées

- **Express.js nu** : trop peu de structure pour maintenir la cohérence sur 9 services. Chaque
  développeur (même seul) finirait par réinventer les guards, les interceptors et le système de
  modules
- **Hono** : excellent pour les API légères et le edge computing, mais manque l'écosystème de
  modules, guards et interceptors qui font la force de NestJS dans un contexte gouvernemental
- **Fastify** : bonnes performances brutes mais écosystème de plugins moins mature pour les cas
  d'usage spécifiques (RBAC à 6 rôles, audit Merkle, MFA TOTP)
