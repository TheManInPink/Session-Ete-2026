# ADR-009 — Monorepo Turborepo avec pnpm Workspaces

## Statut

Accepté — Avril 2026

## Contexte

Le projet NINA-AES Platform comprend 3 applications frontend (Next.js), 9 microservices backend
TypeScript (NestJS), 2 microservices backend Python (FastAPI) et 5+ bibliothèques partagées (types,
database, config, utils, ui). La question fondamentale est : comment organiser ces 20+ projets dans
un dépôt Git ?

Deux approches existent :

- **Multi-repo** : un dépôt Git par service/application. Chaque projet est indépendant.
- **Monorepo** : un seul dépôt Git contenant tous les projets. Les dépendances internes sont
  résolues localement.

Le projet est développé par un étudiant seul. La priorité est la cohérence inter-services (les types
partagés comme `Citizen` ou `AuditLogEntry` doivent être identiques partout) et la simplicité
opérationnelle (un seul `git clone`, un seul `pnpm install`).

## Décision

Utilisation d'un monorepo avec **Turborepo 2.9+** comme orchestrateur de tâches et **pnpm 10+**
comme gestionnaire de paquets avec workspaces natifs. L'arborescence est organisée en trois dossiers
de premier niveau :

- `apps/*` — 3 applications frontend Next.js
- `services/*` — 11 microservices backend (9 NestJS + 2 FastAPI)
- `packages/*` — bibliothèques partagées internes

## Conséquences positives

- **Cohérence des types** : un seul `packages/shared-types` est importé par tous les services.
  Modifier `Citizen` met à jour tous les consommateurs instantanément — pas besoin de publier sur
  npm
- **Orchestration intelligente** : Turborepo analyse le graphe de dépendances et parallélise les
  tâches (build, test, lint). Si `shared-types` n'a pas changé, ses consommateurs ne sont pas
  reconstruits (cache)
- **Dépendances dédupliquées** : pnpm utilise un content-addressable store qui stocke chaque version
  d'un package une seule fois sur le disque, même si 20 workspaces l'utilisent
- **Onboarding simplifié** : `git clone` + `pnpm install` + `docker compose up` = environnement
  complet en 5 minutes
- **Atomic commits** : un seul commit peut modifier un type partagé ET tous les services qui
  l'utilisent — l'historique Git reste cohérent
- **Refactoring sécurisé** : renommer un champ dans `Citizen` fait échouer `check-types` dans tous
  les services qui l'utilisent — détection immédiate

## Conséquences négatives

- **Taille du dépôt** : le `node_modules` combiné est plus volumineux (~500 Mo avec toutes les
  dépendances NestJS, Next.js, Prisma). Atténué par le `pnpm store` qui déduplique sur le disque
- **CI/CD plus long** : un pipeline CI doit potentiellement builder 22 workspaces. Atténué par le
  cache Turborepo (local et remote via Vercel)
- **Coupling organisationnel** : si plusieurs développeurs travaillent sur des services différents,
  les merge conflicts sur `pnpm-lock.yaml` sont fréquents. Non applicable pour un étudiant seul
- **Services Python hors workspaces** : les services FastAPI ont un `package.json` minimal pour que
  pnpm les reconnaisse, mais leurs dépendances réelles sont dans `requirements.txt`. C'est un
  compromis pragmatique

## Alternatives rejetées

- **Multi-repo (un dépôt par service)** : chaque modification de `Citizen` nécessiterait de publier
  le package `@nina-aes/shared-types` sur npm, puis de mettre à jour la dépendance dans 11 repos
  séparés. Overhead opérationnel incompatible avec un développeur solo
- **Nx** : plus puissant que Turborepo (generators, distributed task execution, affected graph) mais
  courbe d'apprentissage plus raide. Turborepo est suffisant pour le projet et mieux intégré à
  l'écosystème Next.js/Vercel
- **Lerna** : historiquement populaire mais supplanté par Turborepo en performance (pas de cache
  intelligent, pas de parallélisation basée sur le graphe). Maintenu par Nx depuis 2022
- **npm workspaces** : fonctionnent mais plus lents que pnpm, pas de content-addressable store, et
  node_modules plat (hoisting non déterministe)
