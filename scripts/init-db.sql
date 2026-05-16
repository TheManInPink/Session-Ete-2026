-- ═══════════════════════════════════════════════════
-- NINA-AES Platform — Script d'initialisation PostgreSQL
--
-- Ce script est exécuté automatiquement au premier démarrage
-- du conteneur PostgreSQL via docker-entrypoint-initdb.d/
--
-- Il crée les bases de données et active les extensions nécessaires.
-- ═══════════════════════════════════════════════════

-- Activer les extensions sur la base principale
-- \c nina_aes;

-- ===========================================
-- 1. Création des bases de données
-- ===========================================

-- Base principale (déjà supposée existante via Docker)
-- CREATE DATABASE nina_aes_db;

-- ===========================================
-- 2. Bases de données auxiliaires (Keycloak + tests)
-- ===========================================
-- Création conditionnelle (idempotent) — utilise ICU pour le tri français,
-- cohérent avec POSTGRES_INITDB_ARGS de docker-compose.dev.yml (locale fr-FR).

\connect postgres;

-- Base pour Keycloak (isolation auth).
SELECT 'CREATE DATABASE keycloak WITH OWNER = nina_admin ENCODING = ''UTF8'' LOCALE_PROVIDER = ''icu'' ICU_LOCALE = ''fr-FR'' TEMPLATE = template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec

-- Base dédiée aux tests d'intégration.
SELECT 'CREATE DATABASE nina_aes_test WITH OWNER = nina_admin ENCODING = ''UTF8'' LOCALE_PROVIDER = ''icu'' ICU_LOCALE = ''fr-FR'' TEMPLATE = template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nina_aes_test')\gexec

-- ===========================================
-- 2bis. Utilisateur applicatif avec privilèges minimaux
-- ===========================================
-- `app_user` = utilisateur runtime des microservices : droits DML
-- (SELECT/INSERT/UPDATE/DELETE) UNIQUEMENT. Pas de DDL, pas de superuser.
-- Limite l'impact d'une compromission de service. Les migrations Prisma
-- utilisent `nina_admin` (owner) via une connection string distincte.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user
      LOGIN
      PASSWORD 'app_user_dev_2026!'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      CONNECTION LIMIT 50;
    RAISE NOTICE 'Utilisateur app_user créé (password dev — Vault en prod)';
  ELSE
    RAISE NOTICE 'Utilisateur app_user déjà présent — skip';
  END IF;
END $$;

-- ===========================================
-- 2. Configuration de la base principale
-- ===========================================

\connect nina_aes_db;

-- uuid-ossp : génération d'UUID v4 pour les identifiants (cles primaires des entites)
-- Utilisé pour : citizen_id, audit_entry_id, document_id, etc.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto : fonctions cryptographiques (gen_random_uuid, crypt, etc.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm : tri-grammes pour la recherche floue (recherche textuelle avancée) sur les noms
-- Permet des requêtes LIKE/ILIKE performantes et des index GIN
-- Utile pour la recherche floue en complement d'Elasticsearch
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- unaccent : suppression des accents pour la recherche normalisée
-- Ex: "Sékou" → "Sekou" pour le matching
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Extension pour les types de donnees supplementaires (citext = case-insensitive text)
CREATE EXTENSION IF NOT EXISTS "citext";

-- postgis : types et fonctions spatiales (geography, geometry, ST_*).
-- Fourni par l'image `postgis/postgis:18-3.6` du docker-compose. Indispensable
-- pour les colonnes `Location` (cercles, communes, centres CTDEC).
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ===========================================
-- 3. Schemas (DDD / microservices)
-- ===========================================
-- Chaque microservice a son propre schema pour l'isolation des donnees.
-- Cela respecte le principe DDD : chaque Bounded Context a sa propre
-- frontiere de donnees.
-- ============================================================================

-- Schema principal pour identity-service (donnees NINA)
CREATE SCHEMA IF NOT EXISTS identity;
COMMENT ON SCHEMA identity IS 'Donnees NINA : enregistrements citoyens, recherche, validation';

-- Schema pour auth-service (authentification)
CREATE SCHEMA IF NOT EXISTS auth;
COMMENT ON SCHEMA auth IS 'Sessions, tokens de rafraichissement, logs de connexion';

-- Schema pour audit-service (journal immuable)
CREATE SCHEMA IF NOT EXISTS audit;
COMMENT ON SCHEMA audit IS 'Journal d audit immuable avec chaine de hash Merkle';

-- Schema pour document-service (documents generes)
CREATE SCHEMA IF NOT EXISTS document;
COMMENT ON SCHEMA document IS 'Fiches Descriptives generees, metadonnees PDF';

-- Schema pour appointment-service (rendez-vous)
CREATE SCHEMA IF NOT EXISTS appointment;
COMMENT ON SCHEMA appointment IS 'Rendez-vous centres d enrolement, files prioritaires';

-- Schema pour governance-service (SGOGT)
CREATE SCHEMA IF NOT EXISTS governance;
COMMENT ON SCHEMA governance IS 'Messagerie officielle securisee, suivi des directives';

-- Schema pour anticorruption-service (SIGAC)
CREATE SCHEMA IF NOT EXISTS anticorruption;
COMMENT ON SCHEMA anticorruption IS 'Scoring d integrite, signalements anonymes';

-- Schema pour vulnerability-service (personnes vulnerables)
CREATE SCHEMA IF NOT EXISTS vulnerability;
COMMENT ON SCHEMA vulnerability IS 'Parcours adaptes, files prioritaires, agents mobiles';

-- Schema pour notification-service
CREATE SCHEMA IF NOT EXISTS notification;
COMMENT ON SCHEMA notification IS 'Templates SMS/email, historique des envois';

-- ===========================================
-- 4. Configuration de la recherche floue
-- ===========================================
-- Créer une configuration de recherche texte personnalisée
-- qui utilise unaccent pour ignorer les accents

CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS french_unaccent (
    COPY = french
);

ALTER TEXT SEARCH CONFIGURATION french_unaccent
    ALTER MAPPING FOR hword, hword_part, word
    WITH unaccent, french_stem;

-- ===========================================
-- 4bis. Privilèges app_user sur la base principale
-- ===========================================
-- Schémas DDD + tables futures (créées par les migrations Prisma). On grant
-- en amont pour que les nouvelles tables héritent automatiquement des
-- bons droits via `ALTER DEFAULT PRIVILEGES`.

GRANT CONNECT ON DATABASE nina_aes_db TO app_user;
GRANT USAGE ON SCHEMA identity, auth, audit, document, appointment,
                       governance, anticorruption, vulnerability, notification, public
  TO app_user;
-- Droits DML (pas DDL) sur tout ce qui existe DÉJÀ
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- Droits DML hérités pour TOUT ce qui sera créé plus tard (migrations Prisma)
ALTER DEFAULT PRIVILEGES IN SCHEMA identity, auth, audit, document, appointment,
                                  governance, anticorruption, vulnerability, notification, public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity, auth, audit, document, appointment,
                                  governance, anticorruption, vulnerability, notification, public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- ===========================================
-- 5. Configuration base de test
-- ===========================================

\connect nina_aes_test;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- app_user a aussi accès à la base de tests
GRANT CONNECT ON DATABASE nina_aes_test TO app_user;
GRANT ALL ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- ===========================================
-- 6. Finalisation
-- ===========================================

-- Revenir sur la base principale
\connect nina_aes_db;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ NINA-AES — Initialisation PostgreSQL terminée';
  RAISE NOTICE '   Bases    : nina_aes_db, nina_aes_test, keycloak';
  RAISE NOTICE '   Extensions : uuid-ossp, pgcrypto, pg_trgm, unaccent, citext, postgis';
  RAISE NOTICE '   Schemas  : identity, auth, audit, document, appointment,';
  RAISE NOTICE '              governance, anticorruption, vulnerability, notification';
  RAISE NOTICE '   Users    : nina_admin (owner, migrations), app_user (DML runtime)';
  RAISE NOTICE '============================================';
END $$;
