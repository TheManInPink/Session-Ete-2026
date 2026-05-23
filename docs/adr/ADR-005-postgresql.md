# ADR-005 — PostgreSQL comme base de données principale

## Statut

Accepté — Avril 2026 · **Révisé — Mai 2026** (image PostGIS, locale ICU, layout Postgres 18, driver
adapter Prisma)

## Contexte

Les données NINA sont fondamentalement relationnelles : enregistrements citoyens liés à des régions,
cercles et communes du référentiel RAVEC, corrections liées à des enregistrements et à des agents,
entrées d'audit chaînées cryptographiquement. Le système doit supporter jusqu'à 25 millions
d'enregistrements (population malienne projetée 2030) avec des garanties ACID fortes (intégrité
référentielle, transactions).

## Décision

**PostgreSQL 18** (dernière version stable, image officielle PostGIS) comme base de données unique
partagée par tous les services, accédée via **Prisma 7.8+** ORM **avec driver adapter
`@prisma/adapter-pg`** (Prisma 7.7+ a basculé sur le moteur « client » qui exige un adapter natif).

L'image utilisée est **`postgis/postgis:18-3.6`** plutôt que `postgres:18-alpine` car :

1. Elle inclut nativement les 5 extensions requises (`uuid-ossp`, `pgcrypto`, `pg_trgm`, `unaccent`,
   `citext`) **plus PostGIS 3.6** pour la colonne `geography(Point,4326)` du modèle `Location`.
2. Elle évite l'installation manuelle de PostGIS (l'image alpine officielle ne le fournit pas).

### Configuration effective (`infrastructure/docker/docker-compose.dev.yml`)

- **Locale** : `--locale-provider=icu --icu-locale=fr-FR --encoding=UTF8 --data-checksums`. L'ICU
  est portable (pas besoin de générer la locale `fr_FR.UTF-8` dans l'image, qui n'est pas présente
  dans `postgis/postgis:18-3.6` Debian-based).
- **Volume** : `nina-postgres-data:/var/lib/postgresql` (parent — exigence Postgres 18 pour
  permettre `pg_upgrade --link` entre versions majeures, le sous-dossier `<major>/data` est créé
  automatiquement par l'image).
- **Variables** : chargées depuis `.env` racine via `docker compose --env-file .env -f …`.

## Conséquences positives

- Extension `pg_trgm` : recherche floue par trigrams sur les noms avec index GIN — indispensable
  pour retrouver « Mamadou » quand on cherche « Mamadu »
- Extension `unaccent` : normalisation des noms (« Sékou » → « Sekou ») pour le matching
  inter-langues
- Extension `pgcrypto` : fonctions de hachage cryptographique côté base (gen_random_uuid, crypt)
- Extension `uuid-ossp` : génération d'UUID v4 pour les identifiants primaires
- **Extension `postgis`** : colonnes géographiques `geography(Point,4326)` pour les `Location`
  (centroides régionaux/communaux) et requêtes spatiales (heatmap, zones desservies par antenne
  mobile)
- **Extension `citext`** : types case-insensitive utilisables sur des champs comme `email`
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
