# ADR-002 — Microservices plutôt que monolithe

## Statut

Accepté — Avril 2026

## Contexte

Le système NINA-AES couvre 9 objectifs hétérogènes : identité, IA de détection d'erreurs, audit
immuable, anti-corruption, gouvernance traçable, USSD, interopérabilité transfrontalière. Ces
domaines utilisent des technologies fondamentalement différentes (TypeScript pour le CRUD, Python
pour le ML). Un monolithe mélangerait ces préoccupations dans une seule base de code et imposerait
un compromis technologique.

## Décision

Décomposition en 11 microservices indépendants (9 NestJS + 2 FastAPI), chacun responsable d'un
domaine métier précis, communiquant via REST (synchrone) et RabbitMQ (asynchrone).

## Conséquences positives

- Chaque service peut être développé, testé et déployé indépendamment
- L'IA Python et le backend TypeScript coexistent sans compromis technologique
- Un service défaillant n'entraîne pas la chute du système entier (résilience)
- Architecture alignée sur les principes du Domain-Driven Design
- Scalabilité horizontale : chaque service peut être répliqué selon sa charge

## Conséquences négatives

- Complexité opérationnelle accrue (Docker, réseau inter-services, orchestration K3s)
- Latence additionnelle des appels inter-services (~5-10 ms en local)
- Plus difficile pour un développeur seul — atténué par le développement par phases

## Alternatives rejetées

- **Monolithe NestJS** : simplicité opérationnelle mais impossibilité d'intégrer Python ML
  nativement
- **Monolithe modulaire** : compromis intéressant mais ne résout pas la diversité TS/Python
- **Serverless (AWS Lambda)** : incompatible avec la souveraineté numérique (données hébergées chez
  un GAFAM)
