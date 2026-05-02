# 05 — Infrastructure Docker Compose

> ⚠️ **Mise à jour mai 2026** — voir [`CHANGELOG.md`](./CHANGELOG.md) §4.
> Points à connaître avant de copier les commandes de ce document :
>
> - **Image Postgres** : utiliser `postgis/postgis:18-3.6` (l'image alpine
>   officielle ne fournit pas PostGIS et n'a pas la locale `fr_FR.UTF-8`).
> - **Locale Postgres** : ICU obligatoire (`--locale-provider=icu
>   --icu-locale=fr-FR --encoding=UTF8 --data-checksums`).
> - **Volume Postgres** : monter `/var/lib/postgresql` (parent), pas `/data`
>   (Postgres 18 a changé son layout).
> - **Compose & .env** : préfixer **toutes** les commandes par
>   `--env-file .env` (le `.env` racine n'est pas découvert automatiquement
>   par compose v2 quand le YAML est dans `infrastructure/docker/`). Le
>   script `pnpm docker:up` inclut déjà `--env-file .env`.
> - **Interpolations** `${VAR :-default}` avec espace = **invalide** —
>   toujours coller `${VAR:-default}` sans espace.
> - **Images obsolètes** à corriger dans `docker-compose.dev.yml` initial :
>   `bitnami/minio:latest` (n'existe plus → `quay.io/minio/minio:latest`),
>   `hashicorp/vault:2.0` (inexistant → `hashicorp/vault:1.18`).

> **Bloc concerné** : Transversal (tous les blocs A → F) **Prérequis** : Documents 00, 01, 02, 03 et
> 04 complétés ; Docker Desktop installé et fonctionnel **Durée estimée** : 8 à 12 heures pour un
> étudiant seul **Livrables de cette étape** :
>
> - Fichier `docker-compose.dev.yml` complet avec 8 conteneurs d'infrastructure
> - Script `scripts/init-db.sql` pour l'initialisation PostgreSQL
> - Fichier `.env.example` documenté avec toutes les variables d'environnement
> - Tous les conteneurs en état « healthy » (`docker compose ps`)
> - Validation de connectivité depuis le poste Windows vers chaque service
> - Fichier `docs/adr/ADR-010-infrastructure-docker-compose.md` dans le repo

---

## 1. Objectif pédagogique

L'infrastructure d'un système distribué comprend tous les **services de support** dont les
microservices ont besoin pour fonctionner : base de données, cache, message broker, stockage objet,
moteur de recherche, serveur d'identité, gestionnaire de secrets. Sans ces services, aucun
microservice ne peut démarrer.

Docker Compose permet de lancer toute cette infrastructure en **une seule commande**, de manière
reproductible, sur n'importe quel poste de développement.

Dans cette étape, on apprend à :

- **Conteneuriser l'infrastructure** — Chaque service (PostgreSQL, Redis, etc.) tourne dans un
  conteneur Docker isolé. On ne pollue pas le poste Windows avec des installations système. On peut
  tout supprimer et recommencer en 30 secondes.

- **Configurer des healthchecks** — Docker ne sait pas si PostgreSQL est « prêt » juste parce que le
  conteneur est « running ». Un healthcheck exécute une commande périodique (`pg_isready`,
  `redis-cli ping`) pour vérifier que le service accepte des connexions. Sans healthcheck, un
  microservice pourrait tenter de se connecter à une base qui n'a pas fini de démarrer.

- **Gérer la persistance** — Les conteneurs Docker sont éphémères : quand on les supprime, leurs
  données disparaissent. Les **volumes nommés** (`postgres_data`, `redis_data`) stockent les données
  sur le disque de l'hôte, indépendamment du cycle de vie du conteneur.

- **Comprendre le réseau Docker** — Les conteneurs communiquent entre eux via un réseau bridge dédié
  (`nina-aes-network`). Dans ce réseau, chaque conteneur est adressable par son **nom de service**
  (ex: `postgres`, `redis`), pas par `localhost`. Mais depuis le poste Windows, on accède aux
  services via `localhost:port` grâce au port mapping.

- **Sécuriser l'environnement de développement** — Même en dev, chaque service a un mot de passe.
  Les variables sensibles sont dans `.env` (non commité). Le fichier `.env.example` sert de
  documentation sans exposer de secrets.

💡 **Principe fondamental** : En développement, les microservices (NestJS, FastAPI) tournent **en
local** (hors Docker) pour bénéficier du hot-reload. Seule l'infrastructure de données tourne dans
Docker. En production (document 20), tout sera conteneurisé.

---

## 2. Technologies utilisées (avec versions à jour — avril 2026)

### 2.1 Orchestration

| Technologie        | Version | Rôle                                             | Documentation officielle                 |
| ------------------ | ------- | ------------------------------------------------ | ---------------------------------------- |
| **Docker Engine**  | 29.2+   | Moteur de conteneurs (daemon + CLI)              | https://docs.docker.com/engine/          |
| **Docker Compose** | 2.35+   | Orchestration multi-conteneurs (fichier YAML)    | https://docs.docker.com/compose/         |
| **Docker Desktop** | 4.x     | Interface graphique + daemon Docker sous Windows | https://docs.docker.com/desktop/windows/ |

### 2.2 Services d'infrastructure

| Service             | Image Docker                     | Version         | Port(s)      | Rôle dans NINA-AES                                           | RAM estimée |
| ------------------- | -------------------------------- | --------------- | ------------ | ------------------------------------------------------------ | ----------- |
| **PostgreSQL**      | `postgres:17-alpine`             | 17.x            | 5432         | Base de données principale (identités NINA, audit, sessions) | ~100 Mo     |
| **Redis**           | `redis:7-alpine`                 | 7.x             | 6379         | Cache, sessions USSD (TTL 5 min), queues temporaires         | ~30 Mo      |
| **RabbitMQ**        | `rabbitmq:4-management-alpine`   | 4.x             | 5672 / 15672 | Message broker inter-services (audit, notifications, IA)     | ~150 Mo     |
| **MinIO**           | `minio/minio:latest`             | RELEASE.2026-xx | 9000 / 9001  | Stockage objet S3-compatible (photos, PDF, documents)        | ~100 Mo     |
| **Elasticsearch**   | `elasticsearch:8.17.0`           | 8.17            | 9200         | Recherche floue sur les noms NINA (pg_trgm + ES)             | ~512 Mo     |
| **Keycloak**        | `quay.io/keycloak/keycloak:26.1` | 26.1            | 8080         | Serveur d'identité OAuth2/OIDC, RBAC 6 rôles, MFA            | ~400 Mo     |
| **HashiCorp Vault** | `hashicorp/vault:1.18`           | 1.18            | 8200         | Gestion centralisée des secrets (clés JWT, certificats mTLS) | ~50 Mo      |
| **Maildev**         | `maildev/maildev:2.2.1`          | 2.2.1           | 1080 / 1025  | Serveur SMTP de développement (capture des emails)           | ~30 Mo      |

**RAM totale estimée** : ~1,4 Go pour l'ensemble de l'infrastructure Docker.

⚠️ **Configuration minimale requise** : 16 Go de RAM sur le poste Windows. Docker Desktop doit être
configuré avec au moins **4 Go de RAM** allouée (Paramètres → Resources → Memory).

### 2.3 Pourquoi ces versions spécifiques ?

| Choix                               | Justification                                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL **17** et non 18         | PostgreSQL 18 est sorti en 2026 mais l'image Docker Alpine n'est pas encore stabilisée en avril 2026. La version 17-alpine est mature et inclut toutes les extensions nécessaires (pg_trgm, unaccent, pgcrypto, uuid-ossp). |
| Redis **7** et non 8                | Redis 7-alpine est la dernière version avec une image Alpine stable. Redis 8 existe mais l'image officielle n'est pas encore en Alpine au moment du développement.                                                          |
| Elasticsearch **8.17** et non 9     | Elasticsearch 9.x n'a pas d'image Docker officielle stable en avril 2026. La version 8.17 est la dernière LTS et supporte toutes les fonctionnalités de recherche floue nécessaires.                                        |
| Keycloak **26.1** et non 26.5       | L'image Quay.io officielle de Keycloak 26.1 est stable et bien documentée. La version 26.5 est en preview.                                                                                                                  |
| Images **Alpine** quand disponibles | Les images Alpine sont 3 à 5× plus petites que les images Debian/Ubuntu. `postgres:17-alpine` fait ~85 Mo contre ~420 Mo pour `postgres:17`.                                                                                |

---

## 3. Architecture réseau — Topologie des conteneurs

### 3.1 Diagramme de topologie réseau

Ce diagramme montre comment les conteneurs Docker communiquent entre eux et avec le poste de
développement Windows.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     POSTE WINDOWS (hôte Docker)                         │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │  Microservices en local (hors Docker)                          │     │
│  │                                                                 │     │
│  │  identity-service  :3001  ─┐                                    │     │
│  │  auth-service      :3002  ─┤                                    │     │
│  │  ai-service        :3003  ─┤  Accèdent à l'infra Docker via    │     │
│  │  document-service  :3004  ─┤  localhost:PORT                    │     │
│  │  notification-svc  :3005  ─┤                                    │     │
│  │  interop-service   :3006  ─┤                                    │     │
│  │  audit-service     :3007  ─┤                                    │     │
│  │  appointment-svc   :3008  ─┤                                    │     │
│  │  anticorruption    :3009  ─┤                                    │     │
│  │  governance-svc    :3010  ─┤                                    │     │
│  │  vulnerability-svc :3011  ─┘                                    │     │
│  │                                                                 │     │
│  │  citizen           :4000   (Next.js)                            │     │
│  │  admin             :4001   (Next.js)                            │     │
│  │  governance        :4002   (Next.js)                            │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│         │                                                                │
│         │  Port mapping (localhost:PORT → container:PORT)                │
│         ▼                                                                │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                   nina-aes-network (bridge)                      │    │
│  │                                                                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ postgres │  │  redis   │  │ rabbitmq │  │  minio   │        │    │
│  │  │ :5432    │  │  :6379   │  │ :5672    │  │ :9000    │        │    │
│  │  │          │  │          │  │ :15672   │  │ :9001    │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  │                                                                  │    │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐   │    │
│  │  │elasticsearch │  │ keycloak │  │  vault   │  │  maildev  │   │    │
│  │  │ :9200        │  │ :8080    │  │  :8200   │  │  :1080    │   │    │
│  │  │              │  │          │  │          │  │  :1025    │   │    │
│  │  └──────────────┘  └──────────┘  └──────────┘  └───────────┘   │    │
│  │                                                                  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Volumes persistants (sur le disque Windows via Docker VM) :             │
│  postgres_data │ redis_data │ rabbitmq_data │ minio_data │ es_data      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Diagramme des dépendances inter-conteneurs

```mermaid
graph TB
    subgraph "Réseau nina-aes-network"
        PG["PostgreSQL :5432"]
        RD["Redis :6379"]
        RMQ["RabbitMQ :5672"]
        MINIO["MinIO :9000"]
        ES["Elasticsearch :9200"]
        KC["Keycloak :8080"]
        VAULT["Vault :8200"]
        MAIL["Maildev :1025"]
    end

    KC -->|"depends_on: service_healthy"| PG

    subgraph "Services locaux (hors Docker)"
        ID["identity-service :3001"]
        AUTH["auth-service :3002"]
        AI["ai-service :3003"]
        DOC["document-service :3004"]
        NOTIF["notification-service :3005"]
        AUDIT["audit-service :3007"]
    end

    ID -->|"DATABASE_URL"| PG
    ID -->|"REDIS_URL"| RD
    ID -->|"ELASTICSEARCH_URL"| ES
    AUTH -->|"KEYCLOAK_URL"| KC
    AUTH -->|"JWT_SECRET via"| VAULT
    AI -->|"DATABASE_URL"| PG
    DOC -->|"MINIO_ENDPOINT"| MINIO
    DOC -->|"DATABASE_URL"| PG
    NOTIF -->|"SMTP_HOST"| MAIL
    NOTIF -->|"RABBITMQ_URL"| RMQ
    AUDIT -->|"DATABASE_URL"| PG
    AUDIT -->|"RABBITMQ_URL"| RMQ
```

### 3.3 Communication : réseau interne vs accès externe

| Depuis                         | Vers                                            | Adresse utilisée   | Exemple                                                           |
| ------------------------------ | ----------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| Conteneur → Conteneur          | Un autre conteneur du même réseau               | **Nom du service** | Keycloak → `postgres:5432`                                        |
| Poste Windows → Conteneur      | Un conteneur via port mapping                   | **localhost:PORT** | `psql -h localhost -p 5432`                                       |
| Microservice local → Conteneur | L'infra Docker depuis un service NestJS/FastAPI | **localhost:PORT** | `DATABASE_URL=postgresql://nina:nina_dev@localhost:5432/nina_aes` |

⚠️ **Point clé** : À l'intérieur du réseau Docker, les conteneurs se voient par **nom de service**
(`postgres`, `redis`). Depuis l'extérieur (poste Windows), on utilise **`localhost`** avec le port
mappé.

---

## 4. PostgreSQL 17 — Base de données principale

### 4.1 Pourquoi PostgreSQL ?

PostgreSQL est le choix n°1 pour un système d'identité nationale car il offre :

- **Extensions pour la recherche floue** : `pg_trgm` (trigrams) permet de trouver « Mamadou » quand
  on cherche « Mamadu ». `unaccent` normalise « Sékou » en « Sekou ».
- **UUID natif** : `uuid-ossp` génère des identifiants UUID v4 uniques sans collision.
- **Fonctions cryptographiques** : `pgcrypto` fournit `gen_random_bytes`, `crypt`, `digest` pour le
  hashing de mots de passe côté base.
- **Transactions ACID** : Chaque opération sur un enregistrement NINA est atomique — pas de données
  partiellement écrites.
- **Conformité SQL** : PostgreSQL est le SGBD le plus conforme au standard SQL:2023.

### 4.2 Configuration Docker Compose

```yaml
# docker-compose.dev.yml — Section PostgreSQL

postgres:
  # Image Alpine : plus légère (~85 Mo vs ~420 Mo pour postgres:17)
  image: postgres:17-alpine

  # Nom explicite pour les commandes docker exec
  container_name: nina-postgres

  # Redémarrage automatique sauf si arrêté manuellement
  restart: unless-stopped

  # Port mapping : localhost:5432 → conteneur:5432
  ports:
    - '5432:5432'

  # Variables d'environnement pour la création initiale de la BDD
  environment:
    POSTGRES_USER: nina # Utilisateur principal
    POSTGRES_PASSWORD: nina_dev # Mot de passe de développement
    POSTGRES_DB: nina_aes # Base de données créée au démarrage

  # Volumes montés
  volumes:
    # Volume nommé pour la persistance des données
    - postgres_data:/var/lib/postgresql/data

    # Script d'initialisation exécuté au PREMIER démarrage uniquement
    # Le :ro signifie "read-only" (le conteneur ne peut pas modifier le script)
    - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init.sql:ro

  # Healthcheck : vérifie que PostgreSQL accepte les connexions
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U nina -d nina_aes']
    interval: 10s # Vérification toutes les 10 secondes
    timeout: 5s # Timeout si pas de réponse en 5s
    retries: 5 # 5 échecs consécutifs → conteneur "unhealthy"

  # Réseau dédié au projet
  networks:
    - nina-network
```

### 4.3 Script d'initialisation (`scripts/init-db.sql`)

Ce script est monté dans `/docker-entrypoint-initdb.d/` du conteneur PostgreSQL. Docker exécute
automatiquement tous les fichiers `.sql` et `.sh` de ce dossier **au premier démarrage** (quand le
volume `postgres_data` est vide).

```sql
-- scripts/init-db.sql

-- ═══════════════════════════════════════════════════
-- NINA-AES Platform — Initialisation PostgreSQL
-- Exécuté automatiquement au premier démarrage du conteneur
-- ═══════════════════════════════════════════════════

-- Se connecter à la base principale
\c nina_aes;

-- ── Extension 1 : uuid-ossp ──
-- Génère des UUID v4 pour les clés primaires
-- Usage : SELECT uuid_generate_v4();
-- Prisma utilise @default(uuid()) qui délègue à cette extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Extension 2 : pgcrypto ──
-- Fonctions cryptographiques natives PostgreSQL
-- Usage : gen_random_uuid(), crypt('password', gen_salt('bf')), digest('data', 'sha256')
-- Utilisé par le service d'audit pour le hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Extension 3 : pg_trgm ──
-- Index trigrams pour la recherche floue
-- Un trigram est une séquence de 3 caractères : "Mamadou" → {"  M", " Ma", "Mam", "ama", "mad", "ado", "dou", "ou "}
-- Permet : SELECT * FROM nina_records WHERE nom % 'Mamadu'; -- trouve "Mamadou"
-- Permet : SELECT similarity('Mamadu', 'Mamadou'); -- retourne ~0.5
-- Nécessite un index GIN : CREATE INDEX ON nina_records USING gin (nom gin_trgm_ops);
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Extension 4 : unaccent ──
-- Supprime les accents et diacritiques d'une chaîne
-- Usage : SELECT unaccent('Sékou Touré') → 'Sekou Toure'
-- Combiné avec pg_trgm pour une recherche insensible aux accents
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── Base de données de test ──
-- Isolée de la base de dev pour que les tests ne polluent pas les données
SELECT 'CREATE DATABASE nina_aes_test'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'nina_aes_test'
)\gexec

-- Mêmes extensions sur la base de test
\c nina_aes_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Retour sur la base principale
\c nina_aes;

-- Confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ NINA-AES — Extensions activées : uuid-ossp, pgcrypto, pg_trgm, unaccent';
END $$;
```

### 4.4 Validation de PostgreSQL

```powershell
# Vérifier que le conteneur est sain
docker compose -f docker-compose.dev.yml ps postgres
# STATUS doit afficher "healthy"

# Se connecter en ligne de commande
docker exec -it nina-postgres psql -U nina -d nina_aes

# Vérifier les extensions installées
# (dans psql)
\dx
#  uuid-ossp | 1.1 | public | generate universally unique identifiers (UUIDs)
#  pgcrypto  | 1.3 | public | cryptographic functions
#  pg_trgm   | 1.6 | public | text similarity measurement and index searching using trigrams
#  unaccent  | 1.1 | public | text search dictionary that removes accents

# Tester la recherche floue
SELECT similarity('Mamadu', 'Mamadou');
# ≈ 0.5 (50% de similarité)

# Tester la suppression d'accents
SELECT unaccent('Sékou Touré');
# 'Sekou Toure'

# Vérifier la base de test
\l
# nina_aes      | nina | UTF8
# nina_aes_test | nina | UTF8

# Quitter psql
\q
```

### 4.5 Connexion depuis les microservices

Les microservices NestJS/FastAPI se connectent à PostgreSQL via la variable `DATABASE_URL` :

```
DATABASE_URL=postgresql://nina:nina_dev@localhost:5432/nina_aes
                         ^^^^  ^^^^^^^^  ^^^^^^^^^  ^^^^  ^^^^^^^^
                         user  password  host       port  database
```

Le client Prisma (dans `packages/database`) utilise cette URL pour se connecter.

---

## 5. Redis 7 — Cache et sessions USSD

### 5.1 Rôle de Redis dans NINA-AES

Redis est un **store clé-valeur en mémoire** ultra-rapide (< 1 ms par opération). Dans NINA-AES, il
remplit trois rôles :

| Rôle                  | Détail                                                                                                           | TTL                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Cache de requêtes** | Résultats de recherche NINA mis en cache pour éviter les requêtes SQL répétées                                   | 5 min                     |
| **Sessions USSD**     | État des sessions USSD en cours (`*123*NINA#`). Chaque session a un TTL de 5 minutes (timeout Africa's Talking). | 5 min                     |
| **Rate limiting**     | Compteurs de requêtes par IP/utilisateur pour la protection contre les abus                                      | 1 min (fenêtre glissante) |

### 5.2 Configuration Docker Compose

```yaml
redis:
  # Image Alpine pour la légèreté
  image: redis:7-alpine
  container_name: nina-redis
  restart: unless-stopped

  ports:
    - '6379:6379'

  # Commande personnalisée :
  # --appendonly yes    : Active la persistance AOF (Append-Only File)
  #                       Chaque écriture est loguée sur disque → résistance aux crashes
  # --requirepass       : Mot de passe obligatoire pour toutes les commandes
  command: redis-server --appendonly yes --requirepass nina_dev

  volumes:
    # Persistance des données Redis (AOF + snapshots RDB)
    - redis_data:/data

  healthcheck:
    # Le -a fournit le mot de passe pour la commande PING
    test: ['CMD', 'redis-cli', '-a', 'nina_dev', 'ping']
    interval: 10s
    timeout: 5s
    retries: 5

  networks:
    - nina-network
```

### 5.3 Validation de Redis

```powershell
# Vérifier le conteneur
docker compose -f docker-compose.dev.yml ps redis

# Se connecter en ligne de commande
docker exec -it nina-redis redis-cli -a nina_dev

# Tester les opérations de base
127.0.0.1:6379> SET test:hello "world"
# OK
127.0.0.1:6379> GET test:hello
# "world"

# Simuler une session USSD avec TTL de 5 minutes
127.0.0.1:6379> SET ussd:session:+22370000001 '{"step":"menu","lang":"fr"}' EX 300
# OK
127.0.0.1:6379> TTL ussd:session:+22370000001
# (integer) 298  (secondes restantes)

# Vérifier la persistance AOF
127.0.0.1:6379> CONFIG GET appendonly
# 1) "appendonly"
# 2) "yes"

# Nettoyer et quitter
127.0.0.1:6379> DEL test:hello ussd:session:+22370000001
127.0.0.1:6379> QUIT
```

### 5.4 Connexion depuis les microservices

```
REDIS_URL=redis://:nina_dev@localhost:6379
                   ^^^^^^^^  ^^^^^^^^^  ^^^^
                   password   host      port
```

⚠️ **Note** : L'URL Redis avec mot de passe commence par `redis://:password@` (double deux-points
avant le mot de passe, car il n'y a pas de nom d'utilisateur).

---

## 6. RabbitMQ 4 — Message broker inter-services

### 6.1 Rôle de RabbitMQ dans NINA-AES

RabbitMQ est le **broker de messages** qui permet la communication asynchrone entre microservices.
Quand un service a besoin de notifier un autre service sans attendre sa réponse, il publie un
message dans RabbitMQ.

**Exemples de flux asynchrones** :

| Producteur         | Message                                             | Consommateur                              |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| `identity-service` | `nina.created` — un enregistrement NINA a été créé  | `audit-service` (trace dans le journal)   |
| `identity-service` | `nina.created` — même événement                     | `ai-service` (analyse IA des erreurs)     |
| `ai-service`       | `correction.proposed` — une correction est suggérée | `notification-service` (email à l'agent)  |
| `auth-service`     | `user.logged_in` — connexion réussie                | `audit-service` (trace la connexion)      |
| `document-service` | `document.generated` — un PDF a été généré          | `notification-service` (email au citoyen) |

### 6.2 Topologie des exchanges et queues

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RabbitMQ — Topologie                             │
│                                                                         │
│  ┌───────────────────────┐     ┌─────────────────────────────────────┐  │
│  │ Exchange: nina.events │     │ Exchange: nina.notifications       │  │
│  │ Type: topic           │     │ Type: direct                       │  │
│  │                       │     │                                     │  │
│  │ Routing keys:         │     │ Routing keys:                      │  │
│  │  nina.created         │     │  email                             │  │
│  │  nina.updated         │     │  sms                               │  │
│  │  nina.deleted         │     │  push                              │  │
│  │  correction.proposed  │     │                                     │  │
│  │  correction.approved  │     └──────┬──────┬──────────────────────┘  │
│  │  correction.rejected  │            │      │                         │
│  └──────┬────────┬───────┘            │      │                         │
│         │        │                    │      │                         │
│         ▼        ▼                    ▼      ▼                         │
│  ┌──────────┐ ┌──────────┐   ┌──────────┐ ┌──────────┐               │
│  │ Queue:   │ │ Queue:   │   │ Queue:   │ │ Queue:   │               │
│  │ audit    │ │ ai       │   │ email    │ │ sms      │               │
│  │ .events  │ │ .analyze │   │ .send    │ │ .send    │               │
│  └──────────┘ └──────────┘   └──────────┘ └──────────┘               │
│       │            │              │             │                      │
│       ▼            ▼              ▼             ▼                      │
│  audit-service  ai-service   notification   notification              │
│                              -service       -service                  │
│                                                                         │
│  ┌───────────────────────┐                                              │
│  │ Exchange: nina.dlx    │  ← Dead Letter Exchange                     │
│  │ Type: fanout          │    Messages non traités après 3 tentatives  │
│  └───────────┬───────────┘    sont routés ici pour investigation       │
│              ▼                                                          │
│  ┌───────────────────────┐                                              │
│  │ Queue: dead.letters   │                                              │
│  └───────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Configuration Docker Compose

```yaml
rabbitmq:
  # Image avec plugin management (interface web d'administration)
  image: rabbitmq:4-management-alpine
  container_name: nina-rabbitmq
  restart: unless-stopped

  ports:
    - '5672:5672' # Port AMQP (protocole de messagerie)
    - '15672:15672' # Interface web d'administration

  environment:
    RABBITMQ_DEFAULT_USER: nina # Utilisateur admin
    RABBITMQ_DEFAULT_PASS: nina_dev # Mot de passe admin

  volumes:
    # Persistance des queues et messages
    - rabbitmq_data:/var/lib/rabbitmq

  healthcheck:
    # rabbitmq-diagnostics ping vérifie que le noeud Erlang est opérationnel
    test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping']
    interval: 15s # Intervalle plus long car RabbitMQ est plus lent à démarrer
    timeout: 10s
    retries: 5

  networks:
    - nina-network
```

### 6.4 Validation de RabbitMQ

```powershell
# Vérifier le conteneur
docker compose -f docker-compose.dev.yml ps rabbitmq

# Accéder à l'interface web d'administration
# Ouvrir dans le navigateur : http://localhost:15672
# Login : nina / nina_dev

# Vérifier via CLI
docker exec -it nina-rabbitmq rabbitmqctl status
# Doit afficher : "Status of node rabbit@..."

# Lister les queues (vide au démarrage)
docker exec -it nina-rabbitmq rabbitmqctl list_queues
# Listing queues for vhost / ...
```

**Interface web RabbitMQ** (`http://localhost:15672`) :

- Onglet **Queues** : liste des queues avec nombre de messages en attente
- Onglet **Exchanges** : liste des exchanges (topic, direct, fanout)
- Onglet **Connections** : connexions actives des microservices
- Onglet **Channels** : canaux de communication ouverts

---

## 7. MinIO, Elasticsearch, Keycloak, Vault, Maildev

### 7.1 MinIO — Stockage objet S3-compatible

MinIO remplace Amazon S3 en local. Il stocke les fichiers binaires (photos d'identité, PDF des
fiches descriptives, documents scannés).

```yaml
minio:
  image: minio/minio:latest
  container_name: nina-minio
  restart: unless-stopped

  ports:
    - '9000:9000' # API S3 (pour les microservices)
    - '9001:9001' # Console web d'administration

  environment:
    MINIO_ROOT_USER: nina_minio # Équivalent de AWS_ACCESS_KEY_ID
    MINIO_ROOT_PASSWORD: nina_minio_dev # Équivalent de AWS_SECRET_ACCESS_KEY

  # Commande de lancement :
  # server /data          : chemin de stockage des objets
  # --console-address     : port de la console web séparé du port API
  command: server /data --console-address ":9001"

  volumes:
    - minio_data:/data

  healthcheck:
    # mc (MinIO Client) vérifie que le serveur répond
    test: ['CMD', 'mc', 'ready', 'local']
    interval: 15s
    timeout: 10s
    retries: 5

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir la console web : http://localhost:9001
# Login : nina_minio / nina_minio_dev

# Créer les buckets nécessaires via la console web ou via mc CLI :
docker exec -it nina-minio mc alias set local http://localhost:9000 nina_minio nina_minio_dev
docker exec -it nina-minio mc mb local/nina-documents
docker exec -it nina-minio mc mb local/nina-photos
```

**Buckets prévus** :

| Bucket           | Contenu                                                    | Service producteur |
| ---------------- | ---------------------------------------------------------- | ------------------ |
| `nina-documents` | Fiches Descriptives Individuelles (PDF signés), récépissés | `document-service` |
| `nina-photos`    | Photos d'identité des citoyens                             | `identity-service` |

### 7.2 Elasticsearch 8 — Recherche floue

Elasticsearch complète `pg_trgm` pour la recherche floue avancée sur les noms NINA. Il est
particulièrement efficace pour la recherche multi-critères combinant nom, prénom, date de naissance
et lieu.

```yaml
elasticsearch:
  image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
  container_name: nina-elasticsearch
  restart: unless-stopped

  ports:
    - '9200:9200'

  environment:
    # Mode single-node (pas de cluster en dev)
    - discovery.type=single-node

    # Désactiver la sécurité X-Pack en développement
    # (simplification — en production, TLS + auth activés)
    - xpack.security.enabled=false

    # Limiter la mémoire JVM à 512 Mo
    # (Elasticsearch est gourmand — 512 Mo suffit pour le dev)
    - ES_JAVA_OPTS=-Xms512m -Xmx512m

    # Nom du cluster
    - cluster.name=nina-aes

  volumes:
    - es_data:/usr/share/elasticsearch/data

  healthcheck:
    # Vérifier le statut du cluster (green ou yellow acceptable en single-node)
    test:
      [
        'CMD-SHELL',
        "curl -s http://localhost:9200/_cluster/health | grep -q
        '\"status\":\"green\"\\|\"status\":\"yellow\"'",
      ]
    interval: 15s
    timeout: 10s
    retries: 10 # Plus de retries car ES est lent à démarrer

  networks:
    - nina-network
```

**Validation** :

```powershell
# Vérifier la santé du cluster
curl http://localhost:9200/_cluster/health?pretty
# "status" : "green" (ou "yellow" en single-node, c'est normal)

# Vérifier la version
curl http://localhost:9200
# "version" : { "number" : "8.17.0" }

# Créer un index de test pour les enregistrements NINA
curl -X PUT "http://localhost:9200/nina_records" -H "Content-Type: application/json" -d "{
  \"settings\": {
    \"analysis\": {
      \"analyzer\": {
        \"nina_analyzer\": {
          \"type\": \"custom\",
          \"tokenizer\": \"standard\",
          \"filter\": [\"lowercase\", \"asciifolding\"]
        }
      }
    }
  },
  \"mappings\": {
    \"properties\": {
      \"nina\": { \"type\": \"keyword\" },
      \"nom\": { \"type\": \"text\", \"analyzer\": \"nina_analyzer\" },
      \"prenoms\": { \"type\": \"text\", \"analyzer\": \"nina_analyzer\" },
      \"dateNaissance\": { \"type\": \"date\" },
      \"lieuNaissance\": { \"type\": \"text\", \"analyzer\": \"nina_analyzer\" }
    }
  }
}"
```

### 7.3 Keycloak 26 — Serveur d'identité (OAuth2 / OIDC)

Keycloak gère l'authentification et l'autorisation de tous les utilisateurs de la NINA-AES Platform.
Il implémente les protocoles OAuth2 et OpenID Connect, et fournit le RBAC avec les 6 rôles du
système.

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:26.1
  container_name: nina-keycloak
  restart: unless-stopped

  ports:
    - '8080:8080' # Console d'administration

  environment:
    # Keycloak utilise PostgreSQL comme backend
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/nina_aes
    KC_DB_USERNAME: nina
    KC_DB_PASSWORD: nina_dev

    # Configuration réseau
    KC_HOSTNAME: localhost
    KC_HOSTNAME_STRICT: 'false' # Accepter les connexions non-HTTPS en dev
    KC_HTTP_ENABLED: 'true' # Activer HTTP (pas uniquement HTTPS)
    KC_HEALTH_ENABLED: 'true' # Activer l'endpoint /health

    # Compte administrateur initial
    KEYCLOAK_ADMIN: admin
    KEYCLOAK_ADMIN_PASSWORD: admin_dev

  # Mode développement (rechargement à chaud, pas de cache de thèmes)
  command: start-dev

  # Keycloak dépend de PostgreSQL — ne démarre QUE quand PG est healthy
  depends_on:
    postgres:
      condition: service_healthy

  healthcheck:
    # Vérifier l'endpoint de santé Keycloak
    test:
      [
        'CMD-SHELL',
        "exec 3<>/dev/tcp/localhost/8080 && echo -e 'GET /health/ready HTTP/1.1\\r\\nHost:
        localhost\\r\\n\\r\\n' >&3 && cat <&3 | grep -q '200\\|UP'",
      ]
    interval: 20s # Intervalle plus long (Keycloak démarre lentement)
    timeout: 10s
    retries: 10
    start_period: 30s # Attendre 30s avant le premier check

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir la console d'administration : http://localhost:8080
# Login : admin / admin_dev

# Vérifier l'endpoint de santé
curl http://localhost:8080/health/ready
# {"status":"UP","checks":[...]}
```

**Configuration Keycloak pour NINA-AES** (à faire manuellement ou via API, détaillé dans le
document 08) :

| Élément | Valeur                                                               | Rôle                                              |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Realm   | `nina-aes`                                                           | Isoler les utilisateurs NINA du realm master      |
| Client  | `nina-platform`                                                      | Application frontend (citizen, admin, governance) |
| Rôles   | `citoyen`, `agent`, `superviseur`, `admin`, `auditeur`, `inspecteur` | 6 rôles RBAC                                      |
| Flow    | `browser` + `direct-grant`                                           | Login web + API (grant_type=password pour dev)    |

### 7.4 HashiCorp Vault — Gestion des secrets

Vault est le **coffre-fort numérique** du projet. En production, il stocke les clés privées JWT
RS256, les certificats mTLS inter-pays, et les secrets de chaque microservice. En dev, il tourne en
mode « dev-server » (données en mémoire, non chiffrées).

```yaml
vault:
  image: hashicorp/vault:1.18
  container_name: nina-vault
  restart: unless-stopped

  ports:
    - '8200:8200' # API + UI → http://localhost:8200

  environment:
    # Token racine pour le mode développement
    VAULT_DEV_ROOT_TOKEN_ID: dev-root-token
    # Adresse d'écoute
    VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200

  # IPC_LOCK empêche le swap de la mémoire du processus Vault
  # (les secrets ne doivent jamais se retrouver sur disque via le swap)
  cap_add:
    - IPC_LOCK

  healthcheck:
    test: ['CMD', 'vault', 'status']
    interval: 10s
    timeout: 5s
    retries: 5

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir l'UI web : http://localhost:8200
# Token : dev-root-token

# Vérifier le statut
docker exec -it nina-vault vault status
# Sealed: false  (en mode dev, Vault est automatiquement "unsealed")

# Stocker un secret de test
docker exec -it nina-vault vault kv put secret/jwt-keys private-key="test-key-content"
# Success! Data written to: secret/data/jwt-keys

# Lire le secret
docker exec -it nina-vault vault kv get secret/jwt-keys
# Key            Value
# ---            -----
# private-key    test-key-content
```

**Secrets prévus dans Vault** :

| Chemin                   | Contenu                                     | Service consommateur               |
| ------------------------ | ------------------------------------------- | ---------------------------------- |
| `secret/jwt-keys`        | Clés privée/publique RSA 2048 bits          | `auth-service`, `document-service` |
| `secret/aes-certs`       | Certificats mTLS inter-pays (MLI, BFA, NER) | `interop-service`                  |
| `secret/database`        | URL PostgreSQL de production                | Tous les services                  |
| `secret/africas-talking` | Clé API Africa's Talking (production)       | `notification-service`             |

### 7.5 Maildev — Serveur SMTP de développement

Maildev capture **tous les emails** envoyés par le `notification-service` sans les transmettre
réellement. C'est un « bac à sable » pour les emails.

```yaml
maildev:
  image: maildev/maildev:2.2.1
  container_name: nina-maildev
  restart: unless-stopped

  ports:
    - '1080:1080' # Interface web (visualiser les emails capturés)
    - '1025:1025' # Port SMTP (le notification-service envoie ici)

  # Pas de volume (les emails capturés sont perdus au redémarrage)
  # Pas de healthcheck (service non critique)

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir l'interface web : http://localhost:1080
# (vide au démarrage — des emails apparaîtront quand notification-service enverra)

# Tester l'envoi SMTP manuellement (PowerShell)
Send-MailMessage -From "test@nina-aes.ml" -To "citoyen@example.com" `
  -Subject "Test NINA-AES" -Body "Email de test depuis Maildev" `
  -SmtpServer "localhost" -Port 1025
# L'email apparaît immédiatement dans http://localhost:1080
```

---

## 8. Volumes, réseau et opérations courantes

### 8.1 Volumes nommés — Persistance des données

Les volumes Docker sont stockés dans la VM Docker Desktop. Ils survivent à l'arrêt et au redémarrage
des conteneurs.

```yaml
volumes:
  postgres_data: # Base de données PostgreSQL (~100 Mo après seeds)
    driver: local
  redis_data: # Snapshots RDB + fichier AOF Redis (~10 Mo)
    driver: local
  rabbitmq_data: # Configuration et état des queues RabbitMQ (~20 Mo)
    driver: local
  minio_data: # Objets stockés (photos, PDF) — taille variable
    driver: local
  es_data: # Index Elasticsearch (~50 Mo après indexation)
    driver: local
```

**Commandes de gestion des volumes** :

```powershell
# Lister tous les volumes Docker du projet
docker volume ls | Select-String "nina"

# Voir la taille des volumes
docker system df -v | Select-String "nina"

# Supprimer un volume spécifique (⚠️ perte de données)
docker volume rm nina-aes-platform_postgres_data

# Supprimer TOUS les volumes du projet (⚠️ reset complet)
docker compose -f docker-compose.dev.yml down -v
```

### 8.2 Réseau bridge dédié

```yaml
networks:
  nina-network:
    driver: bridge # Réseau bridge isolé (pas le réseau par défaut Docker)
    name: nina-aes-network # Nom explicite pour les commandes docker network
```

**Inspecter le réseau** :

```powershell
# Voir les conteneurs connectés au réseau
docker network inspect nina-aes-network

# Résultat : liste de tous les conteneurs avec leur IP interne
# nina-postgres      172.18.0.2
# nina-redis         172.18.0.3
# nina-rabbitmq      172.18.0.4
# ... etc.
```

### 8.3 Opérations courantes — Aide-mémoire

| Opération                   | Commande                                                    | Raccourci Makefile |
| --------------------------- | ----------------------------------------------------------- | ------------------ |
| **Démarrer tout**           | `docker compose -f docker-compose.dev.yml up -d`            | `make docker-up`   |
| **Arrêter tout**            | `docker compose -f docker-compose.dev.yml down`             | `make docker-down` |
| **Voir les logs**           | `docker compose -f docker-compose.dev.yml logs -f`          | `make docker-logs` |
| **Logs d'un seul service**  | `docker compose -f docker-compose.dev.yml logs -f postgres` | —                  |
| **État des conteneurs**     | `docker compose -f docker-compose.dev.yml ps`               | `make docker-ps`   |
| **Redémarrer un service**   | `docker compose -f docker-compose.dev.yml restart redis`    | —                  |
| **Reset complet**           | `docker compose -f docker-compose.dev.yml down -v`          | —                  |
| **Shell dans un conteneur** | `docker exec -it nina-postgres bash`                        | —                  |
| **Espace disque Docker**    | `docker system df`                                          | —                  |
| **Nettoyage Docker**        | `docker system prune -a --volumes`                          | —                  |

### 8.4 Ordre de démarrage et dépendances

Docker Compose gère automatiquement l'ordre de démarrage grâce à `depends_on` et
`condition: service_healthy` :

```
1. postgres     → Démarre en premier (pas de dépendance)
2. redis        → Démarre en parallèle avec postgres
3. rabbitmq     → Démarre en parallèle avec postgres
4. minio        → Démarre en parallèle avec postgres
5. elasticsearch → Démarre en parallèle avec postgres
6. vault        → Démarre en parallèle avec postgres
7. maildev      → Démarre en parallèle avec postgres
8. keycloak     → Attend que postgres soit HEALTHY avant de démarrer
```

Seul Keycloak a une dépendance explicite vers PostgreSQL (il stocke ses données dans la même base).
Les autres services n'ont pas de dépendance inter-conteneurs.

⚠️ **Temps de démarrage typique** :

| Service       | Temps avant « healthy » | Raison                                          |
| ------------- | ----------------------- | ----------------------------------------------- |
| PostgreSQL    | ~5 s                    | Rapide (image légère, peu d'init)               |
| Redis         | ~3 s                    | Très rapide (pur in-memory)                     |
| RabbitMQ      | ~15 s                   | Erlang VM + plugins management                  |
| MinIO         | ~8 s                    | Rapide                                          |
| Elasticsearch | ~30-60 s                | JVM lente à démarrer + allocation mémoire       |
| Keycloak      | ~30-45 s                | JVM + attente PostgreSQL + init du realm master |
| Vault         | ~5 s                    | Rapide (mode dev)                               |
| Maildev       | ~3 s                    | Rapide (Node.js léger)                          |

**Temps total avant que tout soit opérationnel** : environ **60-90 secondes** après
`docker compose up -d`.

---

## 9. Troubleshooting — Problèmes courants et solutions

### 9.1 Tableau de diagnostic

| Symptôme                                                                                        | Cause probable                                                      | Solution                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker compose up` échoue avec « port already in use »                                         | Un autre service utilise le port (ex: PostgreSQL installé en local) | Trouver le PID : `netstat -ano \| findstr :5432` puis `taskkill /PID XXXX /F`. Ou changer le port dans docker-compose.                                                                                             |
| Conteneur en état « unhealthy »                                                                 | Le service n'a pas fini de démarrer                                 | Attendre 60s et revérifier. Si persistant : `docker compose logs <service>` pour voir l'erreur.                                                                                                                    |
| `keycloak` ne démarre pas                                                                       | PostgreSQL pas encore prêt                                          | Vérifier `docker compose ps postgres` → doit être « healthy ». Si non, checker les logs postgres.                                                                                                                  |
| Elasticsearch « unhealthy » avec `max virtual memory areas vm.max_map_count [65530] is too low` | Paramètre Linux/WSL2 trop bas pour ES                               | Dans un terminal WSL2 : `wsl -d docker-desktop sysctl -w vm.max_map_count=262144`. Pour persister : ajouter dans `%USERPROFILE%\.wslconfig` la ligne `[wsl2]\nkernelCommandLine = sysctl.vm.max_map_count=262144`. |
| Redis « NOAUTH Authentication required »                                                        | Le mot de passe n'est pas fourni dans l'URL                         | Vérifier `REDIS_URL=redis://:nina_dev@localhost:6379` (noter le `:` avant `nina_dev`).                                                                                                                             |
| MinIO « Access Denied »                                                                         | Mauvais credentials                                                 | Vérifier `MINIO_ACCESS_KEY=nina_minio` et `MINIO_SECRET_KEY=nina_minio_dev` dans le `.env`.                                                                                                                        |
| Docker est très lent sous Windows                                                               | Docker Desktop utilise trop/pas assez de RAM                        | Paramètres Docker Desktop → Resources → augmenter à 4 Go RAM minimum, 4 CPUs.                                                                                                                                      |
| `init-db.sql` ne s'exécute pas                                                                  | Le volume `postgres_data` existe déjà                               | Le script ne s'exécute qu'au premier démarrage. Supprimer le volume : `docker volume rm nina-aes-platform_postgres_data` puis relancer.                                                                            |
| Espace disque Docker plein                                                                      | Images et volumes non utilisés                                      | `docker system prune -a --volumes` (⚠️ supprime tout ce qui n'est pas utilisé).                                                                                                                                    |
| RabbitMQ management UI inaccessible                                                             | Plugin management pas activé                                        | L'image `rabbitmq:4-management-alpine` inclut le plugin. Si version sans `-management`, le port 15672 ne fonctionne pas.                                                                                           |

### 9.2 Commandes de diagnostic avancées

```powershell
# ── Voir les logs d'un conteneur en erreur ──
docker compose -f docker-compose.dev.yml logs --tail=50 postgres

# ── Vérifier la connectivité réseau entre conteneurs ──
docker exec nina-postgres ping nina-redis
# Si ping n'est pas installé (Alpine) :
docker exec nina-postgres sh -c "echo > /dev/tcp/nina-redis/6379 && echo OK"

# ── Vérifier l'utilisation mémoire de chaque conteneur ──
docker stats --no-stream

# ── Inspecter un conteneur en détail ──
docker inspect nina-postgres | Select-String -Pattern '"IPAddress"'

# ── Forcer la recréation d'un conteneur ──
docker compose -f docker-compose.dev.yml up -d --force-recreate postgres

# ── Vérifier que tous les healthchecks passent ──
docker compose -f docker-compose.dev.yml ps --format "table {{.Name}}\t{{.Status}}"
# Tous doivent afficher "(healthy)" dans le statut
```

---

## 10. Variables d'environnement — Référence complète

Le fichier `.env.example` contient toutes les variables nécessaires. Voici la documentation
détaillée par catégorie :

### 10.1 PostgreSQL

| Variable            | Valeur dev                                           | Utilisé par                      | Description                              |
| ------------------- | ---------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| `POSTGRES_USER`     | `nina`                                               | Docker Compose                   | Utilisateur PostgreSQL créé au démarrage |
| `POSTGRES_PASSWORD` | `nina_dev`                                           | Docker Compose                   | Mot de passe PostgreSQL                  |
| `POSTGRES_DB`       | `nina_aes`                                           | Docker Compose                   | Base de données créée au démarrage       |
| `DATABASE_URL`      | `postgresql://nina:nina_dev@localhost:5432/nina_aes` | Prisma, tous les services NestJS | URL de connexion complète                |

### 10.2 Redis

| Variable         | Valeur dev                         | Utilisé par                   | Description                  |
| ---------------- | ---------------------------------- | ----------------------------- | ---------------------------- |
| `REDIS_URL`      | `redis://:nina_dev@localhost:6379` | Services NestJS (cache, USSD) | URL avec mot de passe        |
| `REDIS_HOST`     | `localhost`                        | Config alternative            | Hôte seul (certains clients) |
| `REDIS_PORT`     | `6379`                             | Config alternative            | Port seul                    |
| `REDIS_PASSWORD` | `nina_dev`                         | Config alternative            | Mot de passe seul            |

### 10.3 RabbitMQ

| Variable            | Valeur dev                            | Utilisé par                | Description       |
| ------------------- | ------------------------------------- | -------------------------- | ----------------- |
| `RABBITMQ_URL`      | `amqp://nina:nina_dev@localhost:5672` | Services NestJS (messages) | URL AMQP complète |
| `RABBITMQ_HOST`     | `localhost`                           | Config alternative         | Hôte seul         |
| `RABBITMQ_USER`     | `nina`                                | Docker Compose + config    | Utilisateur AMQP  |
| `RABBITMQ_PASSWORD` | `nina_dev`                            | Docker Compose + config    | Mot de passe AMQP |

### 10.4 MinIO

| Variable                 | Valeur dev       | Utilisé par        | Description                          |
| ------------------------ | ---------------- | ------------------ | ------------------------------------ |
| `MINIO_ENDPOINT`         | `localhost`      | `document-service` | Hôte MinIO                           |
| `MINIO_PORT`             | `9000`           | `document-service` | Port API S3                          |
| `MINIO_ACCESS_KEY`       | `nina_minio`     | `document-service` | Access key (= AWS_ACCESS_KEY_ID)     |
| `MINIO_SECRET_KEY`       | `nina_minio_dev` | `document-service` | Secret key (= AWS_SECRET_ACCESS_KEY) |
| `MINIO_BUCKET_DOCUMENTS` | `nina-documents` | `document-service` | Bucket pour les PDF                  |
| `MINIO_BUCKET_PHOTOS`    | `nina-photos`    | `identity-service` | Bucket pour les photos               |

### 10.5 Elasticsearch

| Variable                   | Valeur dev              | Utilisé par        | Description                         |
| -------------------------- | ----------------------- | ------------------ | ----------------------------------- |
| `ELASTICSEARCH_URL`        | `http://localhost:9200` | `identity-service` | URL du cluster ES                   |
| `ELASTICSEARCH_INDEX_NINA` | `nina_records`          | `identity-service` | Index pour les enregistrements NINA |

### 10.6 Keycloak

| Variable                 | Valeur dev                | Utilisé par               | Description             |
| ------------------------ | ------------------------- | ------------------------- | ----------------------- |
| `KEYCLOAK_URL`           | `http://localhost:8080`   | `auth-service`, frontends | URL du serveur Keycloak |
| `KEYCLOAK_REALM`         | `nina-aes`                | `auth-service`            | Realm dédié au projet   |
| `KEYCLOAK_CLIENT_ID`     | `nina-platform`           | Frontends Next.js         | ID du client OAuth2     |
| `KEYCLOAK_CLIENT_SECRET` | `change-me-in-production` | `auth-service`            | Secret du client OAuth2 |

### 10.7 Vault

| Variable      | Valeur dev              | Utilisé par       | Description                        |
| ------------- | ----------------------- | ----------------- | ---------------------------------- |
| `VAULT_ADDR`  | `http://localhost:8200` | Tous les services | URL de l'API Vault                 |
| `VAULT_TOKEN` | `dev-root-token`        | Tous les services | Token racine (dev mode uniquement) |

### 10.8 SMTP (Maildev)

| Variable      | Valeur dev            | Utilisé par            | Description          |
| ------------- | --------------------- | ---------------------- | -------------------- |
| `SMTP_HOST`   | `localhost`           | `notification-service` | Serveur SMTP         |
| `SMTP_PORT`   | `1025`                | `notification-service` | Port SMTP (Maildev)  |
| `SMTP_SECURE` | `false`               | `notification-service` | TLS désactivé en dev |
| `SMTP_FROM`   | `noreply@nina-aes.ml` | `notification-service` | Adresse expéditeur   |

---

## 11. Mini-rapport d'étape (template)

```markdown
### Rapport — 05 Infrastructure Docker Compose — [Date]

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Conteneurs démarrés** : X/8 (postgres, redis, rabbitmq, minio, elasticsearch, keycloak, vault,
  maildev)
- **Conteneurs healthy** : X/8
- **RAM Docker utilisée** : X Go (via `docker stats`)
- **Difficultés rencontrées** :
  - [ex: Elasticsearch nécessite vm.max_map_count=262144 sous WSL2]
  - [ex: Keycloak met 45s à démarrer, timeout healthcheck augmenté]
- **Solutions trouvées** :
  - [ex: ajout de .wslconfig avec kernelCommandLine]
  - [ex: start_period: 30s dans le healthcheck Keycloak]
- **Validations effectuées** :
  - [ ] psql : extensions vérifiées (uuid-ossp, pgcrypto, pg_trgm, unaccent)
  - [ ] redis-cli : PING → PONG
  - [ ] RabbitMQ Management UI : http://localhost:15672
  - [ ] MinIO Console : http://localhost:9001
  - [ ] Elasticsearch : curl http://localhost:9200 → cluster info
  - [ ] Keycloak : http://localhost:8080 → login admin
  - [ ] Vault UI : http://localhost:8200 → login avec token
  - [ ] Maildev : http://localhost:1080 → interface email
- **Prochaines actions** :
  - Passer au document 06-DATABASE-SCHEMA-PRISMA.md
```

---

## 12. Checklist de fin d'étape

### Docker Compose

- [ ] Le fichier `docker-compose.dev.yml` est présent et syntaxiquement valide
- [ ] `docker compose -f docker-compose.dev.yml config` ne produit aucune erreur
- [ ] `docker compose -f docker-compose.dev.yml up -d` lance les 8 conteneurs sans erreur
- [ ] `docker compose -f docker-compose.dev.yml ps` affiche les 8 conteneurs en état « healthy » (ou
      « running » pour maildev)

### PostgreSQL

- [ ] Connexion réussie : `docker exec -it nina-postgres psql -U nina -d nina_aes`
- [ ] Extensions installées : `\dx` montre uuid-ossp, pgcrypto, pg_trgm, unaccent
- [ ] Base de test existe : `\l` montre `nina_aes_test`
- [ ] Recherche floue fonctionnelle : `SELECT similarity('Mamadu', 'Mamadou');` retourne ~0.5

### Redis

- [ ] `docker exec -it nina-redis redis-cli -a nina_dev ping` retourne `PONG`
- [ ] Opérations SET/GET/EX fonctionnelles
- [ ] Persistance AOF activée (`CONFIG GET appendonly` → `yes`)

### RabbitMQ

- [ ] Interface web accessible : `http://localhost:15672` (nina / nina_dev)
- [ ] `rabbitmqctl status` exécutable sans erreur

### MinIO

- [ ] Console web accessible : `http://localhost:9001` (nina_minio / nina_minio_dev)
- [ ] Buckets `nina-documents` et `nina-photos` créés

### Elasticsearch

- [ ] `curl http://localhost:9200` retourne les infos du cluster (version 8.17.0)
- [ ] Statut du cluster : `green` ou `yellow`

### Keycloak

- [ ] Console accessible : `http://localhost:8080` (admin / admin_dev)
- [ ] Endpoint de santé : `curl http://localhost:8080/health/ready` → `UP`

### Vault

- [ ] UI accessible : `http://localhost:8200` (token: dev-root-token)
- [ ] `vault status` → Sealed: false
- [ ] Opérations kv put/get fonctionnelles

### Maildev

- [ ] Interface web accessible : `http://localhost:1080`

### Fichiers et documentation

- [ ] `.env.example` contient toutes les variables (70+)
- [ ] `.env` est créé et dans le `.gitignore`
- [ ] `scripts/init-db.sql` est présent et monté dans PostgreSQL
- [ ] `docs/adr/ADR-010-infrastructure-docker-compose.md` créé
- [ ] Commit Git : `docs(infra): add 05-INFRASTRUCTURE-DOCKER-COMPOSE.md`
- [ ] Mini-rapport rédigé
- [ ] Aucun secret réel en clair dans les fichiers commités

---

## 13. Pour aller plus loin

### Lectures recommandées

- **Docker Compose Specification** (https://docs.docker.com/compose/compose-file/) — Référence
  complète du format YAML de Docker Compose. Documente chaque directive (services, networks,
  volumes, healthcheck, depends_on, etc.).
- **PostgreSQL Extensions** (https://www.postgresql.org/docs/17/contrib.html) — Liste complète des
  extensions contrib PostgreSQL. Utile pour comprendre pg_trgm et unaccent en profondeur.
- **Redis Persistence** (https://redis.io/docs/management/persistence/) — Documentation officielle
  sur les stratégies de persistance Redis (RDB vs AOF vs les deux). Explique pourquoi
  `--appendonly yes` est le choix le plus sûr.
- **RabbitMQ Tutorials** (https://www.rabbitmq.com/tutorials) — 6 tutoriels progressifs couvrant les
  patterns de messagerie : work queues, pub/sub, routing, topics, RPC.
- **Keycloak Admin Guide** (https://www.keycloak.org/docs/latest/server_admin/) — Configuration des
  realms, clients, rôles, authentification flows.
- **HashiCorp Vault Learn** (https://developer.hashicorp.com/vault/tutorials) — Tutoriels
  interactifs : KV secrets engine, dynamic secrets, Transit encryption.

### Alternatives techniques considérées

| Alternative                                  | Pourquoi elle n'a pas été retenue                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Podman Compose** au lieu de Docker Compose | Podman est sans daemon (daemonless) et plus sécurisé, mais Docker Desktop est mieux supporté sous Windows et a une meilleure intégration VS Code.                                                                                     |
| **MySQL / MariaDB** au lieu de PostgreSQL    | MySQL ne supporte pas `pg_trgm` pour la recherche floue. La recherche fulltext MySQL est moins performante pour le matching de noms africains avec accents et translittérations.                                                      |
| **Memcached** au lieu de Redis               | Memcached est pur cache (pas de persistance, pas de TTL par clé, pas de structures de données). Redis couvre les 3 rôles (cache + sessions + rate limiting).                                                                          |
| **Apache Kafka** au lieu de RabbitMQ         | Kafka est conçu pour le streaming d'événements haute performance (millions/sec). RabbitMQ est plus adapté pour le messaging requête-réponse avec 1000 messages/sec max — suffisant pour NINA-AES. Plus simple à configurer et opérer. |
| **Amazon S3** au lieu de MinIO               | S3 est un service cloud AWS, incompatible avec l'objectif de souveraineté numérique. MinIO est S3-compatible et auto-hébergeable.                                                                                                     |
| **Auth0** au lieu de Keycloak                | Auth0 est un SaaS cloud (pas auto-hébergeable). Keycloak est open source, auto-hébergeable, et offre un contrôle total sur les données d'identité.                                                                                    |
| **AWS Secrets Manager** au lieu de Vault     | Service cloud AWS, pas auto-hébergeable. Vault est open source avec une édition community gratuite.                                                                                                                                   |

---

_Document 05 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
