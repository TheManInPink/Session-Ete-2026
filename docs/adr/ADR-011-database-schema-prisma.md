# ADR-011 — Schéma de base de données unifié avec Prisma ORM

## Statut

Accepté — Avril 2026

## Contexte

La NINA-AES Platform comprend 11 microservices qui ont tous besoin d'accéder à des données
persistantes : enregistrements NINA, utilisateurs, corrections, audit, documents, rendez-vous,
notifications, vérifications AES, personnes vulnérables, scores anti-corruption, sessions USSD.

Deux approches architecturales s'opposent :

- **Database-per-service** : chaque microservice possède sa propre base de données. Les services ne
  peuvent pas accéder aux données des autres directement — uniquement via des API REST ou des
  événements.
- **Shared database** : tous les microservices accèdent à la même base PostgreSQL. Un schéma Prisma
  unique définit toutes les tables.

Le projet est développé par un étudiant seul, dans un contexte académique avec des contraintes de
temps (12-16 semaines).

## Décision

Utilisation d'une **base de données PostgreSQL partagée** (shared database) avec un schéma Prisma
unifié dans le package `@nina-aes/database`. Le schéma comprend 16 modèles et 16 enums couvrant tous
les domaines fonctionnels. Prisma 7.7+ est utilisé comme ORM pour la génération du client
TypeScript, les migrations et le seeding.

Le client Prisma est exposé comme un singleton via `packages/database/src/index.ts` et importé par
tous les services NestJS.

## Conséquences positives

- **Simplicité opérationnelle** : une seule base à provisionner, monitorer, sauvegarder et
  restaurer. Une seule URL de connexion (`DATABASE_URL`) pour tous les services
- **Intégrité référentielle** : les foreign keys entre tables de services différents (ex:
  `NinaCorrection.ninaRecordId → NinaRecord.id`) sont garanties par PostgreSQL. Impossible de créer
  une correction pour un NINA inexistant
- **Transactions cross-domain** : si un agent crée un enregistrement NINA ET un log d'audit dans la
  même transaction, l'atomicité est native. Pas besoin de saga pattern
- **Migrations cohérentes** : un seul `prisma migrate dev` met à jour toutes les tables. Pas de
  coordination de versions entre 11 schémas séparés
- **Client typé partagé** : tous les services utilisent les mêmes types TypeScript auto-générés par
  Prisma. Renommer un champ dans le schéma fait échouer le build de tous les services impactés —
  détection immédiate

## Conséquences négatives

- **Couplage au niveau données** : si le service `identity` modifie la structure de `nina_records`,
  tous les services qui lisent cette table sont potentiellement impactés. Atténué par le monorepo
  qui détecte ces changements à la compilation
- **Pas d'isolation de déploiement** : on ne peut pas déployer une migration pour un seul service —
  la migration affecte toute la base. Acceptable dans un contexte d'étudiant solo
- **Scalabilité horizontale limitée** : en théorie, chaque service devrait pouvoir être scalé
  indépendamment avec sa propre base. En pratique, pour un projet académique, une seule instance
  PostgreSQL (docker) suffit largement
- **Violation du principe microservices** : la shared database est un anti-pattern reconnu en
  architecture microservices. C'est un compromis documenté et assumé pour le contexte du projet

## Alternatives rejetées

- **Database-per-service** : 11 bases PostgreSQL séparées, 11 fichiers `schema.prisma`, 11 scripts
  de migration. Complexité opérationnelle disproportionnée pour un développeur solo. Les
  transactions cross-service nécessiteraient le saga pattern (choreography ou orchestration),
  ajoutant une couche de complexité significative
- **TypeORM** au lieu de Prisma : plus mature pour les migrations complexes, mais plus verbeux
  (décorateurs sur des classes). Prisma offre un schéma déclaratif et un client auto-généré plus
  ergonomique
- **Drizzle ORM** : plus léger et SQL-like, mais écosystème moins mature. Prisma offre Studio et une
  meilleure documentation
- **SQL brut sans ORM** : contrôle total mais coût de maintenance élevé avec 16 modèles. Chaque
  requête devrait être écrite, typée et maintenue manuellement
