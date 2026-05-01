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
-- 2. Base de données pour Keycloak
-- ===========================================

-- Keycloak a besoin de sa propre base de données
-- Séparée de la base NINA pour l'isolation des données d'authentification
CREATE DATABASE keycloak
    WITH OWNER = nina_admin
    ENCODING = 'UTF8'
    LC_COLLATE = 'fr_FR.UTF-8'
    LC_CTYPE = 'fr_FR.UTF-8'
    TEMPLATE = template0;

-- ===========================================
-- 3. Base de données de test
-- ===========================================

-- Base séparée pour les tests d'intégration
-- Détruite et recréée à chaque exécution de la suite de tests
CREATE DATABASE nina_aes_test
    WITH OWNER = nina_admin
    ENCODING = 'UTF8'
    LC_COLLATE = 'fr_FR.UTF-8'
    LC_CTYPE = 'fr_FR.UTF-8'
    TEMPLATE = template0;

-- ── Création conditionnelle (sécurisée) de la base de test ──
\connect postgres;

-- Créer une base dédiée aux tests (isolée de la base de dev)
SELECT 'CREATE DATABASE nina_aes_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'nina_aes_test'
)\gexec

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
-- 5. Configuration base de test
-- ===========================================

\connect nina_aes_test;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ===========================================
-- 6. Finalisation
-- ===========================================

-- Revenir sur la base principale
\connect nina_aes_db;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ NINA-AES — Base de données initialisée avec extensions : uuid-ossp, pgcrypto, pg_trgm, unaccent';
  RAISE NOTICE 'Extensions : uuid-ossp, pg_trgm, pgcrypto, citext';
  RAISE NOTICE 'Schemas : identity, auth, audit, document, appointment, governance, anticorruption, vulnerability, notification';
  RAISE NOTICE '============================================';
END $$;
