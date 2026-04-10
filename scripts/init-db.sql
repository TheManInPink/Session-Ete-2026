-- ═══════════════════════════════════════════════════
-- NINA-AES Platform — Script d'initialisation PostgreSQL
--
-- Ce script est exécuté automatiquement au premier démarrage
-- du conteneur PostgreSQL via docker-entrypoint-initdb.d/
--
-- Il crée les bases de données et active les extensions nécessaires.
-- ═══════════════════════════════════════════════════

-- Activer les extensions sur la base principale
\c nina_aes;

-- uuid-ossp : génération d'UUID v4 pour les identifiants
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto : fonctions cryptographiques (gen_random_uuid, crypt, etc.)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm : trigrams pour la recherche floue sur les noms
-- Permet des requêtes LIKE/ILIKE performantes et des index GIN
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- unaccent : suppression des accents pour la recherche normalisée
-- Ex: "Sékou" → "Sekou" pour le matching
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Créer une base dédiée aux tests (isolée de la base de dev)
SELECT 'CREATE DATABASE nina_aes_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'nina_aes_test'
)\gexec

-- Activer les mêmes extensions sur la base de test
\c nina_aes_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Revenir sur la base principale
\c nina_aes;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ NINA-AES — Base de données initialisée avec extensions : uuid-ossp, pgcrypto, pg_trgm, unaccent';
END $$;
