# 02 — Infrastructure Docker & Services de données

> **Bloc concerné** : A — NINA Mali (P0)
> **Prérequis** : Document 01 complété (monorepo restructuré, Husky, Makefile, CI)
> **Durée estimée** : 5 à 7 heures pour un étudiant seul
> **Livrables de cette étape** :
> - `infrastructure/docker/docker-compose.dev.yml` complet avec 7 services d'infrastructure
> - `infrastructure/docker/.env.docker` avec les variables Docker
> - `scripts/init-db.sql` — Script d'initialisation PostgreSQL (extensions, rôles, base de test)
> - `scripts/init-keycloak.sh` — Import du realm NINA-AES dans Keycloak
> - `infrastructure/docker/keycloak/nina-aes-realm.json` — Configuration du realm
> - `infrastructure/docker/rabbitmq/rabbitmq.conf` — Configuration RabbitMQ
> - `infrastructure/docker/rabbitmq/definitions.json` — Queues et exchanges pré-définis
> - Tous les services démarrent, passent leurs healthchecks, et communiquent entre eux
> - ADR-002 rédigé

---

## 1. Objectif pédagogique

Avant d'écrire le moindre microservice, il faut que **l'infrastructure de données existe et fonctionne**. Un développeur qui démarre son `identity-service` sans avoir de PostgreSQL en face perd du temps en erreurs de connexion. Cette étape crée l'environnement Docker local qui reproduit fidèlement l'infrastructure de production.

**Ce qu'on apprend :**
- Comment Docker Compose orchestre plusieurs conteneurs qui communiquent entre eux
- Pourquoi les **healthchecks** sont essentiels (un conteneur "running" n'est pas forcément "ready")
- Comment PostgreSQL gère les extensions nécessaires (uuid-ossp, pgcrypto, pg_trgm, unaccent)
- Comment Keycloak centralise l'authentification via OAuth2/OIDC
- Comment RabbitMQ assure la communication asynchrone entre microservices
- Pourquoi Redis sert à la fois de cache et de stockage de sessions USSD
- Comment MinIO remplace Amazon S3 pour le stockage objet souverain
- Comment Elasticsearch permet la recherche floue sur les noms (essentiel pour le NINA)

**Ce qu'on construit :**
- Un `docker-compose.dev.yml` qui lance toute l'infrastructure en une seule commande
- Des scripts d'initialisation qui configurent automatiquement les bases de données et les services
- Un réseau Docker isolé où tous les services peuvent se trouver par leur nom

**Pourquoi c'est important pour le projet NINA-AES :**
- PostgreSQL stocke les 20+ millions d'enregistrements NINA du Mali
- Redis stocke les sessions USSD (stateful, 5 min TTL) des téléphones basiques
- RabbitMQ transporte les événements entre services (ex: "NINA modifié" → audit-service)
- Elasticsearch permet de chercher "Mamadou" quand on tape "Mamadu" (recherche floue)
- MinIO stocke les photos d'identité et les documents PDF signés
- Keycloak gère les 6 rôles (citoyen, agent, superviseur, admin, auditeur, inspecteur)

---

## 2. Technologies utilisées (avec versions à jour)

| Technologie | Version | Rôle dans cette étape | Documentation officielle |
|---|---|---|---|
| Docker Desktop | 4.40+ | Moteur de conteneurs | https://docs.docker.com/desktop/install/windows-install/ |
| Docker Compose | 2.35+ (inclus dans Docker Desktop) | Orchestration multi-conteneurs | https://docs.docker.com/compose/ |
| PostgreSQL | 18.3 | Base de données relationnelle principale (données NINA, audit, users) | https://www.postgresql.org/docs/18/ |
| Redis | 8.6.2 | Cache, sessions Keycloak, sessions USSD, rate limiting | https://redis.io/docs/ |
| RabbitMQ | 4.2.5 | Message broker asynchrone (événements entre microservices) | https://www.rabbitmq.com/docs |
| Elasticsearch | 9.3.2 | Recherche floue sur noms, autocomplétion, plugin phonétique | https://www.elastic.co/guide/en/elasticsearch/reference/current/ |
| MinIO | RELEASE.2026-* | Stockage objet compatible S3 (photos, documents PDF) | https://min.io/docs/minio/container/index.html |
| Keycloak | 26.5.0 | IAM — OAuth2 + OIDC + RBAC (6 rôles) | https://www.keycloak.org/documentation |
| Maildev | 2.2.1 | Serveur SMTP de test (intercepte les emails en dev) | https://github.com/maildev/maildev |

---

## 3. Architecture / Schéma

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RÉSEAU DOCKER : nina-aes-network                     │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ PostgreSQL   │  │   Redis     │  │  RabbitMQ   │  │  Elasticsearch  │   │
│  │ :5432        │  │   :6379     │  │  :5672      │  │  :9200          │   │
│  │              │  │             │  │  :15672 (UI)│  │                 │   │
│  │ nina_aes_db  │  │ Sessions    │  │ Exchanges:  │  │ Index:          │   │
│  │ nina_aes_test│  │ Cache       │  │  nina.events│  │  nina_citizens  │   │
│  │              │  │ USSD states │  │  nina.audit │  │  nina_locations │   │
│  │ Extensions:  │  │             │  │  nina.notif │  │                 │   │
│  │  uuid-ossp   │  │             │  │             │  │ Plugin:         │   │
│  │  pgcrypto    │  │             │  │ Queues:     │  │  phonetic       │   │
│  │  pg_trgm     │  │             │  │  identity.* │  │  icu-analysis   │   │
│  │  unaccent    │  │             │  │  audit.*    │  │                 │   │
│  └──────┬───────┘  └──────┬──────┘  │  notif.*   │  └────────┬────────┘   │
│         │                 │         └──────┬──────┘           │            │
│         │                 │                │                  │            │
│  ┌──────┴───────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌───────┴────────┐   │
│  │   MinIO      │  │  Keycloak   │  │  Maildev    │  │                │   │
│  │   :9000      │  │  :8080      │  │  :1080 (UI) │  │  (Futur)       │   │
│  │   :9001 (UI) │  │             │  │  :1025(SMTP)│  │  11 services   │   │
│  │              │  │ Realm:      │  │             │  │  NestJS/FastAPI │   │
│  │ Buckets:     │  │  nina-aes   │  │ Intercepte  │  │  :3001..:3011  │   │
│  │  nina-photos │  │ Clients:    │  │ tous les    │  │                │   │
│  │  nina-docs   │  │  citizen    │  │ emails en   │  │                │   │
│  │  nina-scans  │  │  admin      │  │ dev         │  │                │   │
│  │              │  │  service    │  │             │  │                │   │
│  └──────────────┘  └─────────────┘  └─────────────┘  └────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
    Volumes Docker persistants (données conservées entre redémarrages)
    nina_pg_data    nina_redis_data  nina_rabbit_data  nina_es_data
    nina_minio_data nina_kc_data
```

---

## 4. Étapes d'implémentation (numérotées)

### Étape 4.1 — Vérifier les prérequis Docker

**Pourquoi** : Docker Desktop doit être installé et fonctionnel. Sur Windows, Docker utilise WSL2 comme backend. Il faut vérifier que tout est en place avant de créer les fichiers de configuration.

**Commandes CLI — PowerShell** :

```powershell
# Vérifier que Docker est installé et fonctionne
docker --version
# Sortie attendue : Docker version 27.x ou supérieur

# Vérifier que Docker Compose est disponible (intégré à Docker Desktop)
docker compose version
# Sortie attendue : Docker Compose version v2.35.x ou supérieur

# Vérifier que le daemon Docker tourne
docker info | Select-String "Server Version"
# Si erreur : lancer Docker Desktop depuis le menu Démarrer
```

**Commandes CLI — Bash (Git Bash / WSL)** :

```bash
# Mêmes vérifications en bash
docker --version
docker compose version
docker info | grep "Server Version"
```

> **Si Docker n'est pas installé** : Télécharger Docker Desktop depuis https://www.docker.com/products/docker-desktop/ — Choisir la version Windows (AMD64). Pendant l'installation, cocher "Use WSL 2 instead of Hyper-V". Redémarrer après installation.

---

### Étape 4.2 — Créer le fichier de variables d'environnement Docker

**Pourquoi** : Le `docker-compose.dev.yml` a besoin de variables pour les mots de passe, ports, et noms de bases de données. On les centralise dans un fichier `.env.docker` séparé du `.env` applicatif pour éviter toute confusion.

**Fichier à créer** : `infrastructure/docker/.env.docker`

```bash
# ============================================================================
# NINA-AES Platform — Variables Docker (environnement de développement)
# ============================================================================
# Ce fichier est utilisé UNIQUEMENT par docker-compose.dev.yml
# NE PAS commiter en production — les valeurs ici sont pour le dev local
# ============================================================================

# --- PostgreSQL 18 ---
POSTGRES_USER=nina_admin
POSTGRES_PASSWORD=nina_dev_2026_secure
POSTGRES_DB=nina_aes_db
POSTGRES_PORT=5432

# --- Redis 8.6 ---
REDIS_PASSWORD=nina_redis_dev_2026
REDIS_PORT=6379

# --- RabbitMQ 4.2.5 ---
RABBITMQ_DEFAULT_USER=nina_rabbit
RABBITMQ_DEFAULT_PASS=nina_rabbit_dev_2026
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672

# --- Elasticsearch 9.3 ---
ELASTIC_PASSWORD=nina_elastic_dev_2026
ES_PORT=9200
# Mode single-node pour le développement (pas de cluster)
ES_JAVA_OPTS=-Xms512m -Xmx512m

# --- MinIO ---
MINIO_ROOT_USER=nina_minio_admin
MINIO_ROOT_PASSWORD=nina_minio_dev_2026_secure
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001

# --- Keycloak 26.5 ---
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
KC_DB_USERNAME=nina_admin
KC_DB_PASSWORD=nina_dev_2026_secure
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=nina_kc_admin_2026
KC_PORT=8080

# --- Maildev (serveur SMTP de test) ---
MAILDEV_WEB_PORT=1080
MAILDEV_SMTP_PORT=1025
```

---

### Étape 4.3 — Créer le script d'initialisation PostgreSQL

**Pourquoi** : PostgreSQL a besoin d'extensions spécifiques pour le projet NINA-AES :
- **uuid-ossp** : Génère des UUID v4 pour les identifiants uniques (chaque enregistrement NINA, chaque entrée d'audit)
- **pgcrypto** : Fonctions de chiffrement (hashage des empreintes biométriques, chiffrement AES-256 des données sensibles)
- **pg_trgm** : Recherche par trigrammes (trouver "Mamadou" quand on cherche "Mamadu" — complémentaire à Elasticsearch)
- **unaccent** : Ignorer les accents dans les recherches (trouver "Sékou" quand on cherche "Sekou")

Le script crée aussi une base de données de test séparée pour ne pas polluer la base de développement.

**Fichier à créer** : `scripts/init-db.sql`

```sql
-- ============================================================================
-- NINA-AES Platform — Script d'initialisation PostgreSQL
-- ============================================================================
-- Ce script est exécuté automatiquement au premier démarrage du conteneur
-- PostgreSQL via le mécanisme docker-entrypoint-initdb.d/
-- ============================================================================

-- ===========================================
-- 1. Extensions sur la base principale
-- ===========================================

-- uuid-ossp : Génération d'identifiants UUID v4 uniques
-- Utilisé pour : citizen_id, audit_entry_id, document_id, etc.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto : Fonctions de chiffrement
-- Utilisé pour : hash des empreintes biométriques (digest()),
-- chiffrement AES-256 des données sensibles (pgp_sym_encrypt())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm : Index trigrammes pour la recherche floue
-- Utilisé pour : recherche approximative de noms bambara/français
-- Exemple : SELECT * FROM citizens WHERE name % 'Mamadu'
-- trouvera 'Mamadou', 'Mamady', etc.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- unaccent : Suppression des accents pour la recherche
-- Utilisé pour : normaliser 'Sékou' → 'Sekou', 'André' → 'Andre'
-- Essentiel car les agents de saisie ne sont pas cohérents avec les accents
CREATE EXTENSION IF NOT EXISTS "unaccent";

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

-- Installer les mêmes extensions sur la base de test
\c nina_aes_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Retour à la base principale
\c nina_aes_db;

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
-- 5. Message de confirmation
-- ===========================================
DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'NINA-AES Platform — Base de données initialisée';
    RAISE NOTICE 'Extensions : uuid-ossp, pgcrypto, pg_trgm, unaccent';
    RAISE NOTICE 'Bases : nina_aes_db, nina_aes_test, keycloak';
    RAISE NOTICE '============================================';
END
$$;
```

---

### Étape 4.4 — Créer la configuration RabbitMQ

**Pourquoi** : RabbitMQ est le **bus d'événements** du système. Quand un agent modifie un enregistrement NINA, l'identity-service publie un événement sur RabbitMQ. L'audit-service le reçoit et crée une entrée d'audit. Le notification-service le reçoit et envoie un SMS au citoyen. Sans configuration initiale, ces exchanges et queues n'existent pas et les services échouent silencieusement.

**Fichier à créer** : `infrastructure/docker/rabbitmq/rabbitmq.conf`

```ini
# ============================================================================
# NINA-AES Platform — Configuration RabbitMQ
# ============================================================================

# Activer le plugin de management (interface web sur :15672)
management.listener.port = 15672

# Limites de mémoire (adaptées au dev — 512 Mo max)
vm_memory_high_watermark.relative = 0.7

# Timeout des connexions consommateurs (60 secondes)
consumer_timeout = 60000

# Format des logs
log.console = true
log.console.level = info

# Timeout de heartbeat (détection de connexions mortes)
heartbeat = 30
```

**Fichier à créer** : `infrastructure/docker/rabbitmq/definitions.json`

```json
{
  "rabbit_version": "4.2.5",
  "vhosts": [
    {
      "name": "/"
    }
  ],
  "permissions": [
    {
      "user": "nina_rabbit",
      "vhost": "/",
      "configure": ".*",
      "write": ".*",
      "read": ".*"
    }
  ],
  "exchanges": [
    {
      "name": "nina.events",
      "vhost": "/",
      "type": "topic",
      "durable": true,
      "auto_delete": false,
      "internal": false,
      "arguments": {}
    },
    {
      "name": "nina.audit",
      "vhost": "/",
      "type": "fanout",
      "durable": true,
      "auto_delete": false,
      "internal": false,
      "arguments": {}
    },
    {
      "name": "nina.notifications",
      "vhost": "/",
      "type": "topic",
      "durable": true,
      "auto_delete": false,
      "internal": false,
      "arguments": {}
    },
    {
      "name": "nina.dlx",
      "vhost": "/",
      "type": "fanout",
      "durable": true,
      "auto_delete": false,
      "internal": false,
      "arguments": {}
    }
  ],
  "queues": [
    {
      "name": "identity.created",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "identity.updated",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "identity.correction.requested",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "identity.correction.validated",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "audit.log",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-message-ttl": 604800000
      }
    },
    {
      "name": "notification.sms",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 3600000
      }
    },
    {
      "name": "notification.email",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 3600000
      }
    },
    {
      "name": "notification.ussd",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-message-ttl": 300000
      }
    },
    {
      "name": "ai.analysis.requested",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "ai.analysis.completed",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "document.generation.requested",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "nina.dlx",
        "x-message-ttl": 86400000
      }
    },
    {
      "name": "dlx.parking",
      "vhost": "/",
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    }
  ],
  "bindings": [
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "identity.created",
      "destination_type": "queue",
      "routing_key": "identity.created",
      "arguments": {}
    },
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "identity.updated",
      "destination_type": "queue",
      "routing_key": "identity.updated",
      "arguments": {}
    },
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "identity.correction.requested",
      "destination_type": "queue",
      "routing_key": "identity.correction.requested",
      "arguments": {}
    },
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "identity.correction.validated",
      "destination_type": "queue",
      "routing_key": "identity.correction.validated",
      "arguments": {}
    },
    {
      "source": "nina.audit",
      "vhost": "/",
      "destination": "audit.log",
      "destination_type": "queue",
      "routing_key": "",
      "arguments": {}
    },
    {
      "source": "nina.notifications",
      "vhost": "/",
      "destination": "notification.sms",
      "destination_type": "queue",
      "routing_key": "notification.sms",
      "arguments": {}
    },
    {
      "source": "nina.notifications",
      "vhost": "/",
      "destination": "notification.email",
      "destination_type": "queue",
      "routing_key": "notification.email",
      "arguments": {}
    },
    {
      "source": "nina.notifications",
      "vhost": "/",
      "destination": "notification.ussd",
      "destination_type": "queue",
      "routing_key": "notification.ussd",
      "arguments": {}
    },
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "ai.analysis.requested",
      "destination_type": "queue",
      "routing_key": "ai.analysis.requested",
      "arguments": {}
    },
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "ai.analysis.completed",
      "destination_type": "queue",
      "routing_key": "ai.analysis.completed",
      "arguments": {}
    },
    {
      "source": "nina.events",
      "vhost": "/",
      "destination": "document.generation.requested",
      "destination_type": "queue",
      "routing_key": "document.generation.requested",
      "arguments": {}
    },
    {
      "source": "nina.dlx",
      "vhost": "/",
      "destination": "dlx.parking",
      "destination_type": "queue",
      "routing_key": "",
      "arguments": {}
    }
  ]
}
```

> **Explication des exchanges :**
> - `nina.events` (type: **topic**) : Bus principal. Les microservices publient des événements avec une routing key (ex: `identity.created`). Les queues abonnées à cette routing key reçoivent le message.
> - `nina.audit` (type: **fanout**) : Chaque action est dupliquée vers l'audit. Le fanout envoie à TOUTES les queues liées, sans filtrage.
> - `nina.notifications` (type: **topic**) : Notifications SMS, email, USSD routées par type.
> - `nina.dlx` (type: **fanout**) : Dead Letter Exchange — les messages qui échouent après X tentatives atterrissent ici pour investigation.

---

### Étape 4.5 — Créer le docker-compose.dev.yml

**Pourquoi** : C'est le fichier central de cette étape. Une seule commande (`docker compose up`) lance les 7 services d'infrastructure nécessaires au développement. Chaque service a un **healthcheck** qui vérifie qu'il est réellement prêt (pas juste démarré), et des **volumes nommés** pour que les données persistent entre les redémarrages.

**Fichier à créer** : `infrastructure/docker/docker-compose.dev.yml`

```yaml
# ============================================================================
# NINA-AES Platform — Docker Compose (Développement)
# ============================================================================
# Usage : docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
# Ou    : make docker-up (si le Makefile du Document 01 est en place)
#
# Services inclus :
#   - PostgreSQL 18  (port 5432)  — Base de données principale
#   - Redis 8.6      (port 6379)  — Cache et sessions
#   - RabbitMQ 4.2   (port 5672)  — Message broker
#   - Elasticsearch 9 (port 9200) — Recherche floue
#   - MinIO          (port 9000)  — Stockage objet
#   - Keycloak 26.5  (port 8080)  — Authentification IAM
#   - Maildev        (port 1080)  — Serveur SMTP de test
# ============================================================================

services:

  # ──────────────────────────────────────────────
  # PostgreSQL 18 — Base de données principale
  # ──────────────────────────────────────────────
  # Stocke : enregistrements NINA, audit trail, users, documents, rendez-vous
  # Extensions : uuid-ossp, pgcrypto, pg_trgm, unaccent
  postgres:
    image: postgres:18
    container_name: nina-postgres
    restart: unless-stopped
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-nina_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-nina_dev_2026_secure}
      POSTGRES_DB: ${POSTGRES_DB:-nina_aes_db}
      # Activer la locale française pour le tri alphabétique correct
      POSTGRES_INITDB_ARGS: "--locale=fr_FR.UTF-8 --data-checksums"
      # Fuseau horaire de Bamako (GMT+0, pas de changement d'heure)
      TZ: Africa/Bamako
    volumes:
      # Données persistantes
      - nina_pg_data:/var/lib/postgresql/data
      # Script d'initialisation exécuté au premier démarrage UNIQUEMENT
      - ../../scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      # pg_isready vérifie que PostgreSQL accepte les connexions
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-nina_admin} -d ${POSTGRES_DB:-nina_aes_db}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - nina-network

  # ──────────────────────────────────────────────
  # Redis 8.6 — Cache et sessions
  # ──────────────────────────────────────────────
  # Stocke : sessions Keycloak, sessions USSD (TTL 5 min),
  # cache des recherches fréquentes, rate limiting
  redis:
    image: redis:8.6-alpine
    container_name: nina-redis
    restart: unless-stopped
    ports:
      - "${REDIS_PORT:-6379}:6379"
    # Démarrer Redis avec mot de passe et persistence AOF
    # AOF (Append Only File) garantit qu'aucune session USSD n'est perdue
    # même si le conteneur redémarre en pleine interaction téléphonique
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD:-nina_redis_dev_2026}
      --appendonly yes
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    volumes:
      - nina_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-nina_redis_dev_2026}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - nina-network

  # ──────────────────────────────────────────────
  # RabbitMQ 4.2 — Message broker asynchrone
  # ──────────────────────────────────────────────
  # Transporte les événements entre microservices :
  # - identity.created → audit-service + notification-service
  # - correction.validated → identity-service + document-service
  # - notification.sms → notification-service (envoi SMS via Orange/AT)
  rabbitmq:
    image: rabbitmq:4.2-management-alpine
    container_name: nina-rabbitmq
    restart: unless-stopped
    ports:
      # Port AMQP (utilisé par les microservices)
      - "${RABBITMQ_PORT:-5672}:5672"
      # Port de l'interface web de management
      - "${RABBITMQ_MANAGEMENT_PORT:-15672}:15672"
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_DEFAULT_USER:-nina_rabbit}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_DEFAULT_PASS:-nina_rabbit_dev_2026}
    volumes:
      - nina_rabbit_data:/var/lib/rabbitmq
      # Configuration et définitions pré-chargées (exchanges, queues, bindings)
      - ./rabbitmq/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
      - ./rabbitmq/definitions.json:/etc/rabbitmq/definitions.json:ro
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "check_running"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 30s
    networks:
      - nina-network

  # ──────────────────────────────────────────────
  # Elasticsearch 9.3 — Recherche floue et phonétique
  # ──────────────────────────────────────────────
  # Permet de :
  # - Chercher "Mamadu" et trouver "Mamadou" (fuzzy matching)
  # - Chercher par phonétique (Soundex/Metaphone) pour les noms bambara
  # - Autocomplétion dans les formulaires de recherche NINA
  # - Indexer les 20M+ enregistrements pour des réponses < 100ms
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:9.3.2
    container_name: nina-elasticsearch
    restart: unless-stopped
    ports:
      - "${ES_PORT:-9200}:9200"
    environment:
      # Mode single-node (pas de cluster en dev)
      - discovery.type=single-node
      # Sécurité activée même en dev (bonne pratique)
      - xpack.security.enabled=true
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD:-nina_elastic_dev_2026}
      # Limiter la mémoire JVM en dev
      - ES_JAVA_OPTS=${ES_JAVA_OPTS:--Xms512m -Xmx512m}
      # Désactiver le machine learning (pas besoin en dev, économise la RAM)
      - xpack.ml.enabled=false
    volumes:
      - nina_es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -s -u elastic:${ELASTIC_PASSWORD:-nina_elastic_dev_2026} http://localhost:9200/_cluster/health | grep -q '\"status\":\"green\\|yellow\"'"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    # Elasticsearch a besoin de plus de mémoire virtuelle
    ulimits:
      memlock:
        soft: -1
        hard: -1
    networks:
      - nina-network

  # ──────────────────────────────────────────────
  # MinIO — Stockage objet souverain (compatible S3)
  # ──────────────────────────────────────────────
  # Stocke :
  # - Photos d'identité des citoyens (JPEG, max 5 Mo)
  # - Documents scannés (actes de naissance, justificatifs)
  # - Fiches Descriptives Individuelles générées en PDF
  # Pourquoi MinIO et pas S3 ? → Souveraineté numérique : les données
  # restent sur des serveurs contrôlés, pas chez Amazon
  minio:
    image: minio/minio:latest
    container_name: nina-minio
    restart: unless-stopped
    ports:
      # API S3 (utilisée par les microservices)
      - "${MINIO_API_PORT:-9000}:9000"
      # Console web d'administration
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-nina_minio_admin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-nina_minio_dev_2026_secure}
    volumes:
      - nina_minio_data:/data
    # Démarrer MinIO en mode serveur avec la console activée
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 20s
    networks:
      - nina-network

  # ──────────────────────────────────────────────
  # Keycloak 26.5 — Gestion d'identité et d'accès (IAM)
  # ──────────────────────────────────────────────
  # Centralise l'authentification de TOUS les acteurs du système :
  # - 6 rôles : citoyen, agent, superviseur, admin, auditeur, inspecteur
  # - OAuth2 + OpenID Connect (standards ouverts)
  # - MFA (TOTP + SMS) pour les agents
  # - Sessions gérées dans Redis (pas en mémoire)
  keycloak:
    image: quay.io/keycloak/keycloak:26.5.0
    container_name: nina-keycloak
    restart: unless-stopped
    ports:
      - "${KC_PORT:-8080}:8080"
    environment:
      # Connexion à PostgreSQL (base "keycloak" créée par init-db.sql)
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER:-nina_admin}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD:-nina_dev_2026_secure}
      # Compte administrateur Keycloak
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-nina_kc_admin_2026}
      # Mode développement (HTTP, pas de certificat TLS requis)
      KC_HOSTNAME_STRICT: "false"
      KC_HTTP_ENABLED: "true"
      KC_PROXY_HEADERS: xforwarded
      # Cache distribué désactivé en dev (single node)
      KC_CACHE: local
    # Démarrer en mode développement
    command: start-dev
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "exec 3<>/dev/tcp/localhost/8080 && echo -e 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && cat <&3 | grep -q '200\\|UP'"]
      interval: 20s
      timeout: 10s
      retries: 10
      start_period: 60s
    networks:
      - nina-network

  # ──────────────────────────────────────────────
  # Maildev — Serveur SMTP de test
  # ──────────────────────────────────────────────
  # Intercepte TOUS les emails envoyés par le notification-service en dev
  # Interface web sur :1080 pour voir les emails sans en envoyer de vrais
  # Remplace un vrai serveur SMTP (Orange Mali, etc.) en développement
  maildev:
    image: maildev/maildev:2.2.1
    container_name: nina-maildev
    restart: unless-stopped
    ports:
      # Interface web pour lire les emails interceptés
      - "${MAILDEV_WEB_PORT:-1080}:1080"
      # Port SMTP (les microservices envoient ici)
      - "${MAILDEV_SMTP_PORT:-1025}:1025"
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:1080/healthz || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s
    networks:
      - nina-network

# ──────────────────────────────────────────────
# Volumes nommés — Données persistantes entre redémarrages
# ──────────────────────────────────────────────
volumes:
  nina_pg_data:
    name: nina_pg_data
  nina_redis_data:
    name: nina_redis_data
  nina_rabbit_data:
    name: nina_rabbit_data
  nina_es_data:
    name: nina_es_data
  nina_minio_data:
    name: nina_minio_data

# ──────────────────────────────────────────────
# Réseau isolé — Tous les services communiquent ici
# ──────────────────────────────────────────────
networks:
  nina-network:
    name: nina-aes-network
    driver: bridge
```

---

### Étape 4.6 — Créer le script d'initialisation MinIO (buckets)

**Pourquoi** : MinIO a besoin de buckets pré-créés pour que les microservices puissent y stocker des fichiers dès le premier démarrage. Le script utilise le client `mc` (MinIO Client) intégré au conteneur.

**Fichier à créer** : `scripts/init-minio.sh`

```bash
#!/bin/bash
# ============================================================================
# NINA-AES Platform — Initialisation des buckets MinIO
# ============================================================================
# Usage : exécuter après le premier 'docker compose up'
#   bash scripts/init-minio.sh
# ============================================================================

set -e

echo "=== Initialisation MinIO — Création des buckets ==="

# Configurer le client MinIO pour se connecter au conteneur local
docker exec nina-minio mc alias set local http://localhost:9000 \
  "${MINIO_ROOT_USER:-nina_minio_admin}" \
  "${MINIO_ROOT_PASSWORD:-nina_minio_dev_2026_secure}" 2>/dev/null

# Créer le bucket pour les photos d'identité des citoyens
docker exec nina-minio mc mb local/nina-photos --ignore-existing
echo "  ✓ Bucket nina-photos créé (photos d'identité)"

# Créer le bucket pour les documents PDF générés (Fiches Descriptives)
docker exec nina-minio mc mb local/nina-documents --ignore-existing
echo "  ✓ Bucket nina-documents créé (PDF Fiches Descriptives)"

# Créer le bucket pour les documents scannés (actes de naissance, justificatifs)
docker exec nina-minio mc mb local/nina-scans --ignore-existing
echo "  ✓ Bucket nina-scans créé (documents scannés)"

# Créer le bucket pour les sauvegardes
docker exec nina-minio mc mb local/nina-backups --ignore-existing
echo "  ✓ Bucket nina-backups créé (sauvegardes)"

# Politique de lecture publique pour les photos (en dev seulement)
docker exec nina-minio mc anonymous set download local/nina-photos

echo ""
echo "=== MinIO initialisé avec succès ==="
echo "  Console : http://localhost:9001"
echo "  API     : http://localhost:9000"
```

---

### Étape 4.7 — Créer le script d'initialisation Elasticsearch (index + analyseurs)

**Pourquoi** : Elasticsearch a besoin d'index pré-configurés avec des analyseurs spécifiques pour la recherche floue sur les noms maliens. L'analyseur personnalisé combine : normalisation unicode → suppression des accents → tokenisation → filtre phonétique (pour trouver des noms qui se prononcent pareil mais s'écrivent différemment).

**Fichier à créer** : `scripts/init-elasticsearch.sh`

```bash
#!/bin/bash
# ============================================================================
# NINA-AES Platform — Initialisation Elasticsearch
# ============================================================================
# Usage : exécuter après le premier 'docker compose up'
#   bash scripts/init-elasticsearch.sh
# ============================================================================

set -e

ES_URL="http://localhost:9200"
ES_USER="elastic"
ES_PASS="${ELASTIC_PASSWORD:-nina_elastic_dev_2026}"

echo "=== Initialisation Elasticsearch — Index et analyseurs ==="

# Attendre qu'Elasticsearch soit prêt
echo "  Attente d'Elasticsearch..."
until curl -s -u "$ES_USER:$ES_PASS" "$ES_URL/_cluster/health" | grep -q '"status":"green\|yellow"'; do
  sleep 2
done
echo "  ✓ Elasticsearch est prêt"

# Créer l'index principal pour les citoyens NINA
# avec des analyseurs personnalisés pour les noms bambara/français
curl -s -u "$ES_USER:$ES_PASS" -X PUT "$ES_URL/nina_citizens" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "filter": {
        "french_stop": {
          "type": "stop",
          "stopwords": "_french_"
        },
        "nina_phonetic": {
          "type": "phonetic",
          "encoder": "double_metaphone",
          "replace": false
        },
        "nina_synonym": {
          "type": "synonym",
          "synonyms": [
            "mamadou,mamady,mamadu,mamadow",
            "mohamed,mohamad,mohammed,muhamed,mouhamad",
            "sekou,secou,sékou,seku",
            "oumar,omar,oumare,umar",
            "aminata,aminatou,aminta",
            "fatoumata,fatou,fatouma,fatu",
            "ibrahima,ibrahim,brehima,brahima",
            "moussa,musa,mussa,mousa",
            "issa,isa,hissa",
            "boubacar,boubakar,abubakar,abubacar"
          ]
        }
      },
      "analyzer": {
        "nina_name_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding",
            "nina_synonym",
            "nina_phonetic"
          ]
        },
        "nina_search_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "nina_number": {
        "type": "keyword"
      },
      "last_name": {
        "type": "text",
        "analyzer": "nina_name_analyzer",
        "search_analyzer": "nina_search_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "suggest": {
            "type": "completion",
            "analyzer": "nina_search_analyzer"
          }
        }
      },
      "first_names": {
        "type": "text",
        "analyzer": "nina_name_analyzer",
        "search_analyzer": "nina_search_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "suggest": {
            "type": "completion",
            "analyzer": "nina_search_analyzer"
          }
        }
      },
      "birth_date": {
        "type": "date",
        "format": "yyyy-MM-dd"
      },
      "birth_place": {
        "type": "text",
        "analyzer": "nina_name_analyzer",
        "fields": {
          "exact": { "type": "keyword" }
        }
      },
      "sex": {
        "type": "keyword"
      },
      "region_code": {
        "type": "keyword"
      },
      "cercle_code": {
        "type": "keyword"
      },
      "commune_code": {
        "type": "keyword"
      },
      "status": {
        "type": "keyword"
      },
      "created_at": {
        "type": "date"
      },
      "updated_at": {
        "type": "date"
      }
    }
  }
}' && echo ""
echo "  ✓ Index nina_citizens créé avec analyseurs phonétiques"

# Créer l'index pour les localités (régions, cercles, communes)
curl -s -u "$ES_USER:$ES_PASS" -X PUT "$ES_URL/nina_locations" \
  -H "Content-Type: application/json" \
  -d '{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "analyzer": {
        "location_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "code": { "type": "keyword" },
      "name": {
        "type": "text",
        "analyzer": "location_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "suggest": {
            "type": "completion",
            "analyzer": "location_analyzer"
          }
        }
      },
      "type": { "type": "keyword" },
      "parent_code": { "type": "keyword" },
      "country": { "type": "keyword" }
    }
  }
}' && echo ""
echo "  ✓ Index nina_locations créé"

echo ""
echo "=== Elasticsearch initialisé avec succès ==="
echo "  URL : $ES_URL"
echo "  Index : nina_citizens, nina_locations"
```

---

### Étape 4.8 — Mettre à jour le Makefile (commandes Docker)

**Pourquoi** : Le Makefile du Document 01 contenait des commandes Docker placeholder. Maintenant qu'on a le vrai `docker-compose.dev.yml`, on met à jour les commandes pour pointer vers le bon fichier et on ajoute les scripts d'initialisation.

**Ajouter au Makefile** (après les commandes Docker existantes) :

```makefile
# --- Docker (Infrastructure) ---
DOCKER_COMPOSE = docker compose -f infrastructure/docker/docker-compose.dev.yml --env-file infrastructure/docker/.env.docker

docker-up: ## Démarrer l'infrastructure (PostgreSQL, Redis, RabbitMQ, ES, MinIO, Keycloak, Maildev)
	$(DOCKER_COMPOSE) up -d
	@echo ""
	@echo "  Infrastructure NINA-AES démarrée !"
	@echo "  PostgreSQL   : localhost:5432"
	@echo "  Redis        : localhost:6379"
	@echo "  RabbitMQ     : localhost:15672 (admin UI)"
	@echo "  Elasticsearch: localhost:9200"
	@echo "  MinIO        : localhost:9001 (console)"
	@echo "  Keycloak     : localhost:8080"
	@echo "  Maildev      : localhost:1080"
	@echo ""

docker-down: ## Arrêter l'infrastructure
	$(DOCKER_COMPOSE) down

docker-down-v: ## Arrêter ET supprimer les volumes (PERTE DE DONNÉES)
	$(DOCKER_COMPOSE) down -v

docker-logs: ## Voir les logs de tous les conteneurs
	$(DOCKER_COMPOSE) logs -f

docker-ps: ## Voir l'état des conteneurs
	$(DOCKER_COMPOSE) ps

docker-init: docker-up ## Démarrer + initialiser MinIO et Elasticsearch
	@echo "  Attente que les services soient prêts (30s)..."
	@sleep 30
	bash scripts/init-minio.sh
	bash scripts/init-elasticsearch.sh
	@echo ""
	@echo "  ✅ Infrastructure complètement initialisée !"
```

---

### Étape 4.9 — Premier démarrage et vérification

**Pourquoi** : C'est le moment de vérité. On lance tout et on vérifie que chaque service démarre, passe son healthcheck, et est accessible.

**Commandes CLI — Bash** :

```bash
# Se placer à la racine du monorepo
cd C:\Users\lonel\Claude\nina-aes-platform-UQAR\nina-aes-platform-UQAR

# Démarrer l'infrastructure Docker
docker compose -f infrastructure/docker/docker-compose.dev.yml \
  --env-file infrastructure/docker/.env.docker up -d

# Vérifier l'état des conteneurs (attendre ~60s pour les healthchecks)
# Tous doivent afficher "healthy" dans la colonne STATUS
docker compose -f infrastructure/docker/docker-compose.dev.yml \
  --env-file infrastructure/docker/.env.docker ps

# Attendre que tout soit stable (surtout Keycloak et Elasticsearch)
sleep 60

# Initialiser MinIO (créer les buckets)
bash scripts/init-minio.sh

# Initialiser Elasticsearch (créer les index)
bash scripts/init-elasticsearch.sh
```

**Commandes CLI — PowerShell** :

```powershell
# Se placer à la racine du monorepo
cd C:\Users\lonel\Claude\nina-aes-platform-UQAR\nina-aes-platform-UQAR

# Démarrer l'infrastructure Docker
docker compose -f infrastructure/docker/docker-compose.dev.yml `
  --env-file infrastructure/docker/.env.docker up -d

# Vérifier l'état des conteneurs
docker compose -f infrastructure/docker/docker-compose.dev.yml `
  --env-file infrastructure/docker/.env.docker ps

# Attendre que tout soit stable
Start-Sleep -Seconds 60

# Initialiser MinIO et Elasticsearch via Git Bash
& "C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/lonel/Claude/nina-aes-platform-UQAR/nina-aes-platform-UQAR && bash scripts/init-minio.sh"
& "C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/lonel/Claude/nina-aes-platform-UQAR/nina-aes-platform-UQAR && bash scripts/init-elasticsearch.sh"
```

---

## 5. Tests de validation

### Test 1 — PostgreSQL (connexion + extensions)

```bash
# Se connecter à PostgreSQL et vérifier les extensions
docker exec -it nina-postgres psql -U nina_admin -d nina_aes_db -c "\dx"

# Sortie attendue : liste avec uuid-ossp, pgcrypto, pg_trgm, unaccent

# Vérifier que la base de test existe
docker exec -it nina-postgres psql -U nina_admin -c "\l" | grep nina_aes_test

# Vérifier que la base Keycloak existe
docker exec -it nina-postgres psql -U nina_admin -c "\l" | grep keycloak

# Test de la recherche floue avec pg_trgm
docker exec -it nina-postgres psql -U nina_admin -d nina_aes_db -c \
  "SELECT similarity('Mamadou', 'Mamadu');"
# Sortie attendue : un score entre 0.7 et 0.9 (noms similaires)
```

### Test 2 — Redis (connexion + ping)

```bash
# Tester la connexion Redis avec authentification
docker exec -it nina-redis redis-cli -a nina_redis_dev_2026 PING
# Sortie attendue : PONG

# Écrire et lire une valeur de test
docker exec -it nina-redis redis-cli -a nina_redis_dev_2026 SET test:nina "fonctionnel"
docker exec -it nina-redis redis-cli -a nina_redis_dev_2026 GET test:nina
# Sortie attendue : "fonctionnel"

# Nettoyer la valeur de test
docker exec -it nina-redis redis-cli -a nina_redis_dev_2026 DEL test:nina
```

### Test 3 — RabbitMQ (exchanges + queues)

```bash
# Vérifier les exchanges via l'API management
curl -s -u nina_rabbit:nina_rabbit_dev_2026 \
  http://localhost:15672/api/exchanges | python -m json.tool | grep "nina\."
# Sortie attendue : nina.events, nina.audit, nina.notifications, nina.dlx

# Vérifier les queues
curl -s -u nina_rabbit:nina_rabbit_dev_2026 \
  http://localhost:15672/api/queues | python -m json.tool | grep "name"
# Sortie attendue : identity.created, identity.updated, audit.log,
#   notification.sms, notification.email, ai.analysis.requested, etc.
```

**Alternative** : Ouvrir http://localhost:15672 dans le navigateur (login: nina_rabbit / nina_rabbit_dev_2026) et vérifier visuellement les exchanges et queues.

### Test 4 — Elasticsearch (index + recherche floue)

```bash
# Vérifier la santé du cluster
curl -s -u elastic:nina_elastic_dev_2026 http://localhost:9200/_cluster/health?pretty
# Sortie attendue : "status" : "green" ou "yellow"

# Vérifier que l'index nina_citizens existe
curl -s -u elastic:nina_elastic_dev_2026 http://localhost:9200/nina_citizens?pretty | head -5
# Sortie attendue : l'index avec ses mappings

# Insérer un document de test
curl -s -u elastic:nina_elastic_dev_2026 -X POST \
  "http://localhost:9200/nina_citizens/_doc/test1" \
  -H "Content-Type: application/json" \
  -d '{"nina_number":"119800100200001A","last_name":"Traoré","first_names":"Mamadou","birth_date":"1998-01-15","sex":"M"}'

# Recherche floue — chercher "Mamadu" doit trouver "Mamadou"
curl -s -u elastic:nina_elastic_dev_2026 -X POST \
  "http://localhost:9200/nina_citizens/_search?pretty" \
  -H "Content-Type: application/json" \
  -d '{"query":{"match":{"first_names":{"query":"Mamadu","fuzziness":"AUTO"}}}}'
# Sortie attendue : le document "Mamadou Traoré" apparaît dans les résultats

# Nettoyer le document de test
curl -s -u elastic:nina_elastic_dev_2026 -X DELETE \
  "http://localhost:9200/nina_citizens/_doc/test1"
```

### Test 5 — MinIO (buckets)

```bash
# Lister les buckets via l'API
docker exec nina-minio mc ls local/
# Sortie attendue : nina-photos, nina-documents, nina-scans, nina-backups
```

**Alternative** : Ouvrir http://localhost:9001 (login: nina_minio_admin / nina_minio_dev_2026_secure) et vérifier les buckets.

### Test 6 — Keycloak (accès admin)

```bash
# Vérifier que Keycloak répond
curl -s http://localhost:8080/health/ready
# Sortie attendue : {"status":"UP"}
```

**Alternative** : Ouvrir http://localhost:8080 → Administration Console (login: admin / nina_kc_admin_2026). On doit voir le dashboard Keycloak.

### Test 7 — Maildev (interface email)

```bash
# Vérifier que Maildev répond
curl -s http://localhost:1080/healthz
# Sortie attendue : OK
```

**Alternative** : Ouvrir http://localhost:1080 — on voit l'interface vide (aucun email intercepté encore).

---

## 6. Pièges courants & dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `docker compose up` échoue avec "port already in use" | Un autre service utilise le port (ex: PostgreSQL local sur 5432) | Changer le port dans `.env.docker` (ex: `POSTGRES_PORT=5433`) ou arrêter le service local |
| PostgreSQL démarre mais `init-db.sql` n'est pas exécuté | Le volume `nina_pg_data` contient déjà des données (d'un précédent démarrage) | Supprimer le volume : `docker volume rm nina_pg_data` puis relancer |
| Elasticsearch sort avec code 137 | Pas assez de mémoire (OOM killed) | Réduire `ES_JAVA_OPTS` à `-Xms256m -Xmx256m` dans `.env.docker`, ou augmenter la RAM allouée à Docker Desktop (Settings → Resources → Memory → 6 Go min) |
| Elasticsearch affiche "max virtual memory areas vm.max_map_count [65530] is too low" | Limite WSL2 par défaut | Sur PowerShell admin : `wsl -d docker-desktop sysctl -w vm.max_map_count=262144`. Pour persister : créer `C:\Users\lonel\.wslconfig` avec `[wsl2]\nkernelCommandLine=vm.max_map_count=262144` |
| Keycloak boucle sur "Waiting for database" | PostgreSQL n'a pas fini de démarrer | Le `depends_on: condition: service_healthy` devrait régler ça. Si persistant, relancer : `docker compose restart keycloak` |
| RabbitMQ n'a pas les queues/exchanges attendus | Le fichier `definitions.json` n'est pas chargé | Vérifier le chemin dans le volume. Ajouter `RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=-rabbitmq_management load_definitions "/etc/rabbitmq/definitions.json"` dans l'environment |
| MinIO healthcheck échoue | Le client `mc` n'est pas disponible dans les images récentes | Remplacer le healthcheck par : `test: ["CMD-SHELL", "curl -f http://localhost:9000/minio/health/live"]` |
| `init-minio.sh` échoue avec "mc: command not found" | Le script s'exécute hors du conteneur | Le script utilise `docker exec` — vérifier que le conteneur `nina-minio` est bien démarré |
| Les locales `fr_FR.UTF-8` ne sont pas disponibles dans PostgreSQL | L'image Docker n'inclut pas toutes les locales | Retirer `POSTGRES_INITDB_ARGS` ou utiliser `--locale=C.UTF-8` à la place. Les locales françaises ne sont pas critiques pour le dev |

---

## 7. Documentation à produire après cette étape

### ADR-002 — Choix de l'infrastructure de données

Créer `docs/architecture/adr-002-infrastructure-donnees.md` :

```markdown
# ADR-002 — Infrastructure de données pour NINA-AES Platform

## Statut
Accepté — 2026-04-07

## Contexte
Le système NINA-AES gère des données d'identité de 20+ millions de citoyens maliens,
avec des exigences de :
- Recherche floue multilingue (bambara, français, songhaï, etc.)
- Sessions stateful pour les interactions USSD (téléphones basiques)
- Communication asynchrone entre 11 microservices
- Stockage objet pour photos et documents
- Authentification centralisée avec 6 rôles

## Décisions

### PostgreSQL 18 comme base principale
- Maturité et fiabilité éprouvées pour les données critiques
- Extensions pg_trgm et unaccent pour la recherche floue côté SQL
- Support TDE (Transparent Data Encryption) pour le chiffrement au repos
- Prisma 7.6 comme ORM pour un typage fort TypeScript ↔ SQL

### Redis 8.6 pour le cache et les sessions
- Sessions USSD avec TTL de 5 minutes (protocole USSD stateful)
- Cache des recherches fréquentes (réduction de charge sur PostgreSQL)
- Rate limiting des APIs (protection contre les abus)

### RabbitMQ 4.2 comme message broker
- Préféré à Kafka : plus simple pour un développeur seul, suffisant pour le volume
- Exchanges topic pour le routage flexible des événements
- Dead Letter Exchange pour les messages en échec (pas de perte de données)

### Elasticsearch 9.3 pour la recherche avancée
- Analyseurs phonétiques (Double Metaphone) pour les noms sahéliens
- Autocomplétion (completion suggester) pour les formulaires
- Recherche floue native (Levenshtein intégré)

### MinIO pour le stockage objet
- Compatible S3 (API identique) mais hébergeable souverainement
- Pas de dépendance Amazon/Google/Azure pour les données biométriques
- Buckets séparés par type (photos, documents, scans)

### Keycloak 26.5 pour l'IAM
- Standard ouvert (OAuth2 + OIDC) — pas de lock-in vendor
- Support MFA natif (TOTP + SMS) requis pour les agents
- Realm dédié "nina-aes" avec 6 rôles pré-configurés

## Alternatives rejetées
- **MongoDB** au lieu de PostgreSQL : pas de support transactionnel ACID
  aussi solide, pas d'extensions de recherche floue natives
- **Apache Kafka** au lieu de RabbitMQ : surdimensionné pour un dev solo,
  complexité opérationnelle plus élevée
- **Amazon S3** au lieu de MinIO : viole le principe de souveraineté numérique
- **Auth0** au lieu de Keycloak : service SaaS US, pas souverain

## Conséquences
- (+) Chaque technologie est open source et auto-hébergeable
- (+) Docker Compose permet de reproduire l'infra en une commande
- (-) 7 conteneurs Docker consomment ~4-6 Go de RAM en dev
- (-) La courbe d'apprentissage est significative (7 technologies à maîtriser)
```

### Tableau récapitulatif des URLs de développement

Créer `docs/guides/urls-developpement.md` :

```markdown
# URLs de développement — NINA-AES Platform

| Service | URL | Identifiants |
|---|---|---|
| PostgreSQL | `localhost:5432` | nina_admin / nina_dev_2026_secure |
| Redis | `localhost:6379` | mot de passe : nina_redis_dev_2026 |
| RabbitMQ (Management) | http://localhost:15672 | nina_rabbit / nina_rabbit_dev_2026 |
| Elasticsearch | http://localhost:9200 | elastic / nina_elastic_dev_2026 |
| MinIO (Console) | http://localhost:9001 | nina_minio_admin / nina_minio_dev_2026_secure |
| MinIO (API S3) | http://localhost:9000 | idem |
| Keycloak (Admin) | http://localhost:8080 | admin / nina_kc_admin_2026 |
| Maildev | http://localhost:1080 | aucun (accès libre) |

> **Rappel** : ces identifiants sont pour le développement local UNIQUEMENT.
> En production, tous les secrets passent par HashiCorp Vault.
```

---

## 8. Mini-rapport d'étape (template)

```markdown
### Rapport — 02 Infrastructure Docker — [Date]
- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Difficultés rencontrées** :
  - [Ex: Elasticsearch OOM → augmenté RAM Docker Desktop à 6 Go]
  - [Ex: locales fr_FR.UTF-8 absentes → utilisé C.UTF-8]
- **Solutions trouvées** :
  - [Décrire les solutions]
- **RAM consommée par Docker** : X Go (visible dans Docker Desktop → Resources)
- **Prochaines actions** :
  - Passer au Document 03 — Packages partagés
- **Captures jointes** :
  - [ ] `docker compose ps` montrant 7 conteneurs healthy
  - [ ] Interface RabbitMQ avec les exchanges nina.*
  - [ ] Résultat recherche floue Elasticsearch "Mamadu" → "Mamadou"
  - [ ] Console MinIO avec les 4 buckets
  - [ ] Dashboard Keycloak accessible
```

---

## 9. Checklist de fin d'étape

- [ ] `infrastructure/docker/docker-compose.dev.yml` créé et fonctionnel
- [ ] `infrastructure/docker/.env.docker` créé (jamais commité → dans .gitignore)
- [ ] `scripts/init-db.sql` créé (extensions + bases test/keycloak)
- [ ] `infrastructure/docker/rabbitmq/rabbitmq.conf` créé
- [ ] `infrastructure/docker/rabbitmq/definitions.json` créé (3 exchanges + 12 queues)
- [ ] `scripts/init-minio.sh` créé et exécuté (4 buckets)
- [ ] `scripts/init-elasticsearch.sh` créé et exécuté (2 index avec analyseurs phonétiques)
- [ ] 7 conteneurs démarrés et **tous healthy** (`docker compose ps`)
- [ ] PostgreSQL : extensions installées, bases créées, recherche floue testée
- [ ] Redis : PING/PONG fonctionnel avec authentification
- [ ] RabbitMQ : exchanges et queues visibles dans l'UI management
- [ ] Elasticsearch : recherche "Mamadu" → trouve "Mamadou"
- [ ] MinIO : 4 buckets créés, console accessible
- [ ] Keycloak : dashboard admin accessible
- [ ] Maildev : interface web accessible
- [ ] Makefile mis à jour avec commandes Docker
- [ ] ADR-002 rédigé dans `docs/architecture/`
- [ ] Guide des URLs de dev dans `docs/guides/`
- [ ] Commit : `feat(infra): ajouter docker-compose avec PostgreSQL, Redis, RabbitMQ, ES, MinIO, Keycloak`
- [ ] Aucun secret en clair dans le code versionné

---

## 10. Pour aller plus loin

- **Docker Compose profiles** : [Documentation](https://docs.docker.com/compose/profiles/) — Permet de ne démarrer qu'un sous-ensemble de services (ex: `docker compose --profile core up` pour juste PostgreSQL + Redis)
- **PostgreSQL pg_trgm** : [Documentation](https://www.postgresql.org/docs/18/pgtrgm.html) — Comprendre les index GIN/GiST pour la recherche floue
- **Elasticsearch phonetic analysis** : [Plugin documentation](https://www.elastic.co/guide/en/elasticsearch/plugins/current/analysis-phonetic.html) — Double Metaphone, Soundex, etc.
- **RabbitMQ Dead Letter Exchanges** : [Documentation](https://www.rabbitmq.com/docs/dlx) — Gestion des messages en échec
- **MinIO Client (mc)** : [Documentation](https://min.io/docs/minio/linux/reference/minio-mc.html) — Commandes avancées
- **Keycloak Realm Export/Import** : [Guide](https://www.keycloak.org/server/importExport) — Exporter la config pour la reproduire
- **WSL2 performance tips** : [Microsoft docs](https://learn.microsoft.com/en-us/windows/wsl/wsl-config) — Optimiser `.wslconfig` pour Docker
