# ADR-005 — PostgreSQL comme base de données principale

## Statut

Accepté — Avril 2026

## Contexte

Les données NINA sont fondamentalement relationnelles : enregistrements citoyens liés à des régions,
cercles et communes du référentiel RAVEC, corrections liées à des enregistrements et à des agents,
entrées d'audit chaînées cryptographiquement. Le système doit supporter jusqu'à 25 millions
d'enregistrements (population malienne projetée 2030) avec des garanties ACID fortes (intégrité
référentielle, transactions).

## Décision

PostgreSQL 17 (dernière version stable avec image Docker officielle) comme base de données unique
partagée par tous les services, accédée via Prisma 7.7+ ORM.

## Conséquences positives

- Extension `pg_trgm` : recherche floue par trigrams sur les noms avec index GIN — indispensable
  pour retrouver « Mamadou » quand on cherche « Mamadu »
- Extension `unaccent` : normalisation des noms (« Sékou » → « Sekou ») pour le matching
  inter-langues
- Extension `pgcrypto` : fonctions de hachage cryptographique côté base (gen_random_uuid, crypt)
- Extension `uuid-ossp` : génération d'UUID v4 pour les identifiants primaires
- Support TDE (Transparent Data Encryption) pour le chiffrement au repos — exigence ENF-013
- Maturité et fiabilité éprouvées : utilisé en production pour des systèmes gouvernementaux dans le
  monde entier depuis 25+ ans
- 100% open source sous licence PostgreSQL (permissive) — conformité totale avec le principe de
  souveraineté numérique

## Conséquences négatives

- Point unique de défaillance si non répliqué — atténué en production par une configuration
  primary + replica avec promotion automatique
- Tous les services partagent la même instance en développement — risque de contention sous forte
  charge (atténué par le pool de connexions Prisma)
- Les migrations Prisma doivent être coordonnées entre les services qui partagent le même schéma

## Alternatives rejetées

- **MongoDB** : pas de garanties ACID complètes sur les transactions multi-documents, pas
  d'intégrité référentielle native. Les données d'état civil sont structurées et relationnelles par
  nature — un document store n'est pas le bon paradigme
- **MySQL / MariaDB** : extensions de recherche floue (`pg_trgm`) et de normalisation (`unaccent`)
  moins riches que PostgreSQL. Pas de TDE natif sans plugin propriétaire
- **CockroachDB** : distribué nativement et compatible PostgreSQL wire protocol, mais surcoût
  opérationnel disproportionné pour un projet universitaire mono-nœud
- **Base séparée par service** (database-per-service pattern) : architecturalement idéal en
  microservices, mais complexité excessive pour un étudiant seul. Compromis : base unique avec
  schémas logiques séparés si nécessaire à l'avenir
