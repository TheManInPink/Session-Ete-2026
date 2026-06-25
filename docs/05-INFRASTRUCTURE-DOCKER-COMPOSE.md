# 05 — Infrastructure Docker Compose

> ⚠️ **Mise à jour 2026-05-23** — voir [`CHANGELOG.md`](./CHANGELOG.md) §4. Points à connaître avant
> de copier les commandes de ce document :
>
> - **Image Postgres** : utiliser `postgis/postgis:18-3.6` (l'image alpine officielle ne fournit pas
>   PostGIS et n'a pas la locale `fr_FR.UTF-8`).
> - **Locale Postgres** : ICU obligatoire
>   (`--locale-provider=icu --icu-locale=fr-FR --encoding=UTF8 --data-checksums`).
> - **Volume Postgres** : monter `/var/lib/postgresql` (parent), pas `/data` (Postgres 18 a changé
>   son layout).
> - **Compose & .env** : préfixer **toutes** les commandes par `--env-file .env` (le `.env` racine
>   n'est pas découvert automatiquement par compose v2 quand le YAML est dans
>   `infrastructure/docker/`). Le script `pnpm docker:up` inclut déjà `--env-file .env`.
> - **Interpolations** `${VAR :-default}` avec espace = **invalide** — toujours coller
>   `${VAR:-default}` sans espace.
> - **MinIO — fin de support amont** : le repo `minio/minio` a été archivé le 2026-04-25 et plus
>   aucune image n'est publiée sur Docker Hub depuis le 2025-10-23. On pinne sur la **dernière
>   release officielle disponible** : `minio/minio:RELEASE.2025-09-07T16-13-09Z` côté serveur, et
>   `minio/mc:RELEASE.2025-08-13T08-35-41Z` côté client (le client a son propre calendrier de
>   release, antérieur à celui du serveur). Migration à planifier avant la prochaine CVE bloquante —
>   alternatives évaluées : `cgr.dev/chainguard/minio` (drop-in patché), fork communautaire
>   `pgsty/minio`, ou successeur S3-compatible Garage / RustFS / SeaweedFS.
> - **Vault 2.0 — saut majeur (2026-05-19)** : `hashicorp/vault:2.0.1` est la dernière stable. Seule
>   breaking change container : la capacité Linux `IPC_LOCK` est désormais posée sur le binaire à la
>   build ; le runtime doit **toujours** déclarer `cap_add: [IPC_LOCK]` (déjà en place dans
>   `docker-compose.dev.yml`). Le mode `start-dev`, les `VAULT_DEV_*` et le listener HTTP sur 8200
>   ne changent pas.
> - **Healthchecks corrigés (mai 2026)** :
>   - `rabbitmq` : `rabbitmq-diagnostics -q check_running` (l'ancien `ping check_running` mélangeait
>     deux sous-commandes et faisait toujours échouer le healthcheck).
>   - `vault` : préfixer par `VAULT_ADDR=http://127.0.0.1:8200` (le binaire `vault status` par
>     défaut parle HTTPS alors que `start-dev` écoute en HTTP).
>   - `keycloak` : sonder le port management **9000** (`/health/ready`), pas le port API 8080 — KC
>     25+ n'expose plus les endpoints health sur 8080.
> - **Kibana — clés de chiffrement obligatoires** : sans
>   `XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY`, `XPACK_SECURITY_ENCRYPTIONKEY` et
>   `XPACK_REPORTING_ENCRYPTIONKEY` (≥32 chars chacune), le plugin Fleet boucle sur
>   `FleetEncryptedSavedObjectEncryptionKeyRequired`. Variables alimentées par
>   `KIBANA_ENCRYPTION_KEY`, `KIBANA_SECURITY_ENCRYPTION_KEY`, `KIBANA_REPORTING_ENCRYPTION_KEY` du
>   `.env`. **Doivent rester stables** entre redémarrages, sinon les objets chiffrés (intégrations
>   Fleet, règles d'alerting) deviennent illisibles.
> - **Reset password `kibana_system`** : après premier boot d'Elasticsearch, exécuter
>   `docker exec nina-elasticsearch curl -s -u "elastic:$ELASTIC_PASSWORD" -X POST "http://localhost:9200/_security/user/kibana_system/_password" -H "Content-Type: application/json" -d '{"password":"<même valeur que ELASTIC_PASSWORD>"}'`
>   puis recréer le conteneur Kibana. Sans ça, Kibana retourne `"level":"unavailable"`
>   (security_exception).

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

## 2. Technologies utilisées (avec versions à jour — 2026-05-23)

### 2.1 Orchestration

| Technologie        | Version | Rôle                                             | Documentation officielle                 |
| ------------------ | ------- | ------------------------------------------------ | ---------------------------------------- |
| **Docker Engine**  | 29.2+   | Moteur de conteneurs (daemon + CLI)              | https://docs.docker.com/engine/          |
| **Docker Compose** | 2.35+   | Orchestration multi-conteneurs (fichier YAML)    | https://docs.docker.com/compose/         |
| **Docker Desktop** | 4.x     | Interface graphique + daemon Docker sous Windows | https://docs.docker.com/desktop/windows/ |

### 2.2 Services d'infrastructure

| Service             | Image Docker                                 | Version                          | Port(s)      | Rôle dans NINA-AES                                           | RAM estimée |
| ------------------- | -------------------------------------------- | -------------------------------- | ------------ | ------------------------------------------------------------ | ----------- |
| **PostgreSQL**      | `postgis/postgis:18-3.6`                     | 18.x + PostGIS 3.6               | 5432         | Base de données principale (identités NINA, audit, sessions) | ~120 Mo     |
| **Redis**           | `redis:8.6.3-alpine`                         | 8.6.3                            | 6379         | Cache, sessions USSD (TTL 5 min), queues temporaires         | ~30 Mo      |
| **RabbitMQ**        | `rabbitmq:4.2.4-management-alpine`           | 4.2.4                            | 5672 / 15672 | Message broker inter-services (audit, notifications, IA)     | ~150 Mo     |
| **MinIO** ⚠️        | `minio/minio:RELEASE.2025-09-07T16-13-09Z`   | dernière release officielle      | 9000 / 9001  | Stockage objet S3-compatible (photos, PDF, documents)        | ~100 Mo     |
| **Elasticsearch**   | `nina-aes/elasticsearch:9.4.1` (build local) | 9.4.1 + plugin analysis-phonetic | 9200         | Recherche floue sur les noms NINA (pg_trgm + ES)             | ~512 Mo     |
| **Kibana**          | `docker.elastic.co/kibana/kibana:9.4.1`      | 9.4.1                            | 5601         | Console de visualisation Elasticsearch (dev)                 | ~300 Mo     |
| **Keycloak**        | `quay.io/keycloak/keycloak:26.6.2`           | 26.6.2                           | 8080         | Serveur d'identité OAuth2/OIDC, RBAC 6 rôles, MFA            | ~400 Mo     |
| **HashiCorp Vault** | `hashicorp/vault:2.0.1`                      | 2.0.1 (saut majeur 1.x → 2.x)    | 8200         | Gestion centralisée des secrets (clés JWT, certificats mTLS) | ~50 Mo      |
| **Maildev**         | `maildev/maildev:2.2.1`                      | 2.2.1                            | 1080 / 1025  | Serveur SMTP de développement (capture des emails)           | ~30 Mo      |

⚠️ MinIO : repo amont archivé le 2026-04-25 — voir bandeau en tête de document.

**RAM totale estimée** : ~1,7 Go pour l'ensemble de l'infrastructure Docker (ajout de Kibana).

⚠️ **Configuration minimale requise** : 16 Go de RAM sur le poste Windows. Docker Desktop doit être
configuré avec au moins **4 Go de RAM** allouée (Paramètres → Resources → Memory).

### 2.3 Pourquoi ces versions spécifiques ?

| Choix                                  | Justification                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL **18** + PostGIS **3.6**    | PostgreSQL 18 stabilisé en 2026 avec layout `/var/lib/postgresql` (parent) requis pour `pg_upgrade --link`. L'image `postgis/postgis:18-3.6` est Debian-based mais fournit PostGIS, pg_trgm, unaccent, pgcrypto, uuid-ossp.  |
| Redis **8.6.3** (pin patch)            | Pin sur la patch la plus récente (2026-05) pour reproductibilité ; le tag flottant `8.6-alpine` est OK en dev mais glisse à chaque release patch — à éviter en CI/prod.                                                      |
| Elasticsearch **9.4.1** / Kibana 9.4.1 | ES 9.4.1 est la dernière stable (release 2026-05-12). Kibana **doit** suivre la même `major.minor` qu'Elasticsearch.                                                                                                         |
| Keycloak **26.6.2**                    | Dernière patch de la branche 26.6 (Workflows, JWT Authorization Grant, Zero-downtime patch promus de preview à GA). Pas de breaking change vs 26.5 pour notre setup `start-dev` + `KC_DB=postgres` + `KC_BOOTSTRAP_ADMIN_*`. |
| Vault **2.0.1** (saut majeur)          | Sortie le 2026-05-19. Seule breaking change container : `IPC_LOCK` posé à la build → le runtime doit toujours `cap_add: [IPC_LOCK]` (déjà fait). Dev mode, `VAULT_DEV_*` et listener HTTP inchangés.                         |
| MinIO **2025-10-15** (pinné)           | Repo amont archivé (avril 2026). Pin sur la dernière release officielle — à migrer (Chainguard / Garage / RustFS) avant la prochaine CVE bloquante.                                                                          |
| Images **Alpine** quand disponibles    | Les images Alpine sont 3 à 5× plus petites que Debian/Ubuntu. Exception : Postgres+PostGIS — l'Alpine officielle ne fournit pas PostGIS, on garde le Debian.                                                                 |

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
│  │  citizen           :4001   (Next.js)                            │     │
│  │  admin             :4002   (Next.js)                            │     │
│  │  governance        :4003   (Next.js)                            │     │
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

| Depuis                         | Vers                                            | Adresse utilisée   | Exemple                                                                                |
| ------------------------------ | ----------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Conteneur → Conteneur          | Un autre conteneur du même réseau               | **Nom du service** | Keycloak → `postgres:5432`                                                             |
| Poste Windows → Conteneur      | Un conteneur via port mapping                   | **localhost:PORT** | `psql -h localhost -p 5432`                                                            |
| Microservice local → Conteneur | L'infra Docker depuis un service NestJS/FastAPI | **localhost:PORT** | `DATABASE_URL=postgresql://nina_admin:${POSTGRES_PASSWORD}@localhost:5432/nina_aes_db` |

⚠️ **Point clé** : À l'intérieur du réseau Docker, les conteneurs se voient par **nom de service**
(`postgres`, `redis`). Depuis l'extérieur (poste Windows), on utilise **`localhost`** avec le port
mappé.

---

## 4. PostgreSQL 18 + PostGIS — Base de données principale

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

> 🔒 **Secrets externalisés (P0)** — Dans tous les extraits qui suivent, **aucun mot de passe n'est
> écrit en clair**. Chaque valeur sensible est interpolée depuis `.env` via `${VAR}` (compose v2).
> Le `.env` réel n'est jamais commité (`.gitignore`) ; seul `.env.example` documente les **noms** de
> variables avec des valeurs placeholder. En production, ces valeurs ne viennent **pas** de `.env`
> mais sont injectées par **Vault** (Agent sidecar / `vault agent template` ou CSI Secrets Store) —
> voir §7.4 et le bandeau « Migration Vault » à la fin de cette section.

```yaml
# docker-compose.dev.yml — Section PostgreSQL
# ⚠ Le pin réel (postgis/postgis:18-3.6) est dans le bandeau d'en-tête + §2.2.
#   Ci-dessous on épingle PAR DIGEST (immutabilité, anti-supply-chain) : voir §7.6.

postgres:
  # Image PostGIS Debian épinglée par DIGEST SHA-256 (pas seulement par tag).
  # Un tag est mutable (peut être réécrit côté registre) ; un digest est immuable.
  # Remplacer <sha256-postgis-18-3.6> par la valeur résolue via `docker buildx imagetools inspect`.
  image: postgis/postgis:18-3.6@sha256:<sha256-postgis-18-3.6>

  # Nom explicite pour les commandes docker exec
  container_name: nina-postgres

  # Redémarrage automatique sauf si arrêté manuellement
  restart: unless-stopped

  # Port mapping : localhost:5432 → conteneur:5432
  # 🔒 Durcissement : en prod, NE PAS publier 5432 vers l'hôte (accès via réseau interne
  #    uniquement). Voir §7.6 « segmentation réseau ».
  ports:
    - '5432:5432'

  # Variables d'environnement pour la création initiale de la BDD.
  # 🔒 P0 : toutes interpolées depuis .env — AUCUN secret en clair dans le YAML.
  environment:
    POSTGRES_USER: ${POSTGRES_USER} # ex. nina_admin (dans .env)
    # _FILE permet de lire le secret depuis un fichier monté (Docker/K8s secret)
    # plutôt qu'une variable d'env visible dans `docker inspect`. Préféré en prod.
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD} # jamais commité — fourni par .env (dev) / Vault (prod)
    POSTGRES_DB: ${POSTGRES_DB} # ex. nina_aes_db

  # Volumes montés
  volumes:
    # Volume nommé pour la persistance des données
    - postgres_data:/var/lib/postgresql/data

    # Script d'initialisation exécuté au PREMIER démarrage uniquement
    # Le :ro signifie "read-only" (le conteneur ne peut pas modifier le script)
    - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init.sql:ro

  # Healthcheck : vérifie que PostgreSQL accepte les connexions
  # 🔒 On référence les variables, pas les valeurs littérales.
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
    interval: 10s # Vérification toutes les 10 secondes
    timeout: 5s # Timeout si pas de réponse en 5s
    retries: 5 # 5 échecs consécutifs → conteneur "unhealthy"

  # 🔒 Durcissement runtime (cf. §7.6) — empêche l'escalade de privilèges et
  #    interdit l'écriture hors des volumes déclarés.
  security_opt:
    - no-new-privileges:true
  # Note : Postgres a besoin d'écrire dans /var/lib/postgresql et /run → read_only:true
  # exige des tmpfs explicites ; documenté en §7.6 (à activer en Phase 2).

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
\c nina_aes_db;

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
-- Permet : SELECT * FROM citizens WHERE last_name_ascii % 'Mamadu'; -- trouve "Mamadou"
-- Permet : SELECT similarity('Mamadu', 'Mamadou'); -- retourne ~0.5
-- Index GIN déclaré côté Prisma : idx_citizens_lastname_trgm (cf. schema.prisma)
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
\c nina_aes_db;

-- Confirmation
DO $$
BEGIN
  RAISE NOTICE '✅ NINA-AES — Extensions activées : uuid-ossp, pgcrypto, pg_trgm, unaccent';
END $$;
```

### 4.4 Validation de PostgreSQL

```powershell
# Vérifier que le conteneur est sain
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml ps postgres
# STATUS doit afficher "healthy"
# Raccourci équivalent : pnpm run docker:ps | Select-String postgres

# Se connecter en ligne de commande
docker exec -it nina-postgres psql -U nina_admin -d nina_aes_db

# Vérifier les extensions installées
# (dans psql)
\dx
#  citext    | 1.8   | public     | data type for case-insensitive character strings
#  pg_trgm   | 1.6   | public     | text similarity measurement and index searching using trigrams
#  pgcrypto  | 1.4   | public     | cryptographic functions
#  plpgsql   | 1.0   | pg_catalog | PL/pgSQL procedural language
#  postgis   | 3.6.3 | public     | PostGIS geometry and geography spatial types and functions
#  unaccent  | 1.1   | public     | text search dictionary that removes accents
#  uuid-ossp | 1.1   | public     | generate universally unique identifiers (UUIDs)

# Tester la recherche floue
SELECT similarity('Mamadu', 'Mamadou');
# ≈ 0.5 (50% de similarité)

# Tester la suppression d'accents
SELECT unaccent('Sékou Touré');
# 'Sekou Toure'

# Vérifier les bases (depuis postgres pour éviter le filtrage par DB courante)
\c postgres
\l
#       Name      |   Owner    | Encoding | ...
# ----------------+------------+----------+----
#  nina_aes_db    | nina_admin | UTF8     | ...
#  nina_aes_test  | nina_admin | UTF8     | ...
#  keycloak       | nina_admin | UTF8     | ...

# Quitter psql
\q
```

### 4.5 Connexion depuis les microservices

Les microservices NestJS/FastAPI se connectent à PostgreSQL via la variable `DATABASE_URL` :

```
DATABASE_URL=postgresql://nina_admin:${POSTGRES_PASSWORD}@localhost:5432/nina_aes_db
                          ^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^ ^^^^ ^^^^^^^^^^^
                          user       password (depuis .env) host    port database
```

Le client Prisma (dans `packages/database`) utilise cette URL pour se connecter.

---

## 5. Redis 8 — Cache et sessions USSD

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
  # Image Alpine épinglée par DIGEST (cohérent avec le pin 8.6.3 du bandeau / §2.2).
  image: redis:8.6.3-alpine@sha256:<sha256-redis-8.6.3-alpine>
  container_name: nina-redis
  restart: unless-stopped

  ports:
    - '6379:6379'

  # Commande personnalisée :
  # --appendonly yes    : Active la persistance AOF (Append-Only File)
  #                       Chaque écriture est loguée sur disque → résistance aux crashes
  # --requirepass       : Mot de passe obligatoire pour toutes les commandes
  # 🔒 P0 : le mot de passe est interpolé depuis .env (${REDIS_PASSWORD}), jamais en clair.
  command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}

  volumes:
    # Persistance des données Redis (AOF + snapshots RDB)
    - redis_data:/data

  healthcheck:
    # Le -a fournit le mot de passe pour la commande PING (référencé via .env).
    test: ['CMD-SHELL', 'redis-cli -a "$REDIS_PASSWORD" ping']
    interval: 10s
    timeout: 5s
    retries: 5

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

### 5.3 Validation de Redis

```powershell
# Vérifier le conteneur
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml ps redis
# Raccourci équivalent : pnpm run docker:ps | Select-String redis

# Se connecter en ligne de commande
# Le mot de passe vient du .env — on le passe via $env:REDIS_PASSWORD (jamais en clair).
# Note PowerShell: si le mot de passe contient un `!` final, le protéger (single-quotes
# ou stop-parsing `--%`) pour éviter l'expansion d'historique.
docker exec -it nina-redis redis-cli -a "$env:REDIS_PASSWORD"

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
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379
                   ^^^^^^^^^^^^^^^^^ ^^^^^^^^^ ^^^^
                   password (.env)   host      port
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
  # Image avec plugin management (interface web d'administration), épinglée par DIGEST.
  image: rabbitmq:4.2.4-management-alpine@sha256:<sha256-rabbitmq-4.2.4-mgmt-alpine>
  container_name: nina-rabbitmq
  restart: unless-stopped

  ports:
    - '5672:5672' # Port AMQP (protocole de messagerie)
    - '15672:15672' # Interface web d'administration

  # 🔒 P0 : identifiants admin interpolés depuis .env, jamais en clair.
  environment:
    RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER} # ex. nina_rabbit (dans .env)
    RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD} # fourni par .env (dev) / Vault (prod)

  volumes:
    # Persistance des queues et messages
    - rabbitmq_data:/var/lib/rabbitmq

  healthcheck:
    # ✅ Correctif (bandeau d'en-tête) : `check_running` est la BONNE sous-commande.
    #    L'ancien `rabbitmq-diagnostics -q ping check_running` mélangeait deux sous-commandes
    #    (`ping` ET `check_running`) et échouait toujours. `check_running` seul vérifie que
    #    l'application RabbitMQ (pas seulement le nœud Erlang) est démarrée et accepte le trafic.
    test: ['CMD', 'rabbitmq-diagnostics', '-q', 'check_running']
    interval: 15s # Intervalle plus long car RabbitMQ est plus lent à démarrer
    timeout: 10s
    retries: 5

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

### 6.4 Validation de RabbitMQ

```powershell
# Vérifier le conteneur
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml ps rabbitmq
# Raccourci équivalent : pnpm run docker:ps | Select-String rabbitmq

# Accéder à l'interface web d'administration
# Ouvrir dans le navigateur : http://localhost:15672
# Login : ${RABBITMQ_USER} / ${RABBITMQ_PASSWORD} (valeurs dans .env, jamais commitées)

# Vérifier via CLI
docker exec -it nina-rabbitmq rabbitmqctl status
# Doit afficher : "Status of node rabbit@..."

# Lister les queues (12 queues pré-chargées via infrastructure/docker/rabbitmq/definitions.json)
docker exec -it nina-rabbitmq rabbitmqctl list_queues
# Listing queues for vhost / ...
# name                              messages
# identity.created                  0
# identity.updated                  0
# identity.correction.requested     0
# identity.correction.validated     0
# audit.log                         0
# notification.email                0
# notification.sms                  0
# notification.ussd                 0
# ai.analysis.requested             0
# ai.analysis.completed             0
# document.generation.requested     0
# dlx.parking                       0

# Lister les exchanges nina.* (4 pré-chargés)
docker exec -it nina-rabbitmq rabbitmqctl list_exchanges name type | findstr "nina."
# nina.audit          fanout
# nina.dlx            fanout
# nina.events         topic
# nina.notifications  topic
```

**Interface web RabbitMQ** (`http://localhost:15672`) :

- Onglet **Queues** : les 12 queues `identity.*`, `audit.*`, `notification.*`, `ai.*`, `document.*`,
  `dlx.*` avec leur nombre de messages en attente.
- Onglet **Exchanges** : les 4 exchanges `nina.*` (audit/dlx en fanout, events/notifications en
  topic), plus les exchanges AMQP par défaut.
- Onglet **Connections** : connexions actives des microservices (vide tant qu'aucun service NestJS
  n'est lancé).
- Onglet **Channels** : canaux de communication ouverts.

> Topologie modifiable dans `infrastructure/docker/rabbitmq/definitions.json` et rechargée au
> redémarrage du conteneur via `load_definitions` (cf. `rabbitmq.conf`).

---

## 7. MinIO, Elasticsearch, Keycloak, Vault, Maildev

### 7.1 MinIO — Stockage objet S3-compatible

MinIO remplace Amazon S3 en local. Il stocke les fichiers binaires (photos d'identité, PDF des
fiches descriptives, documents scannés).

```yaml
minio:
  # Image épinglée par DIGEST sur la dernière release officielle (repo amont archivé —
  # voir bandeau d'en-tête). JAMAIS `:latest` : non reproductible et non auditable.
  image: minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:<sha256-minio-2025-09-07>
  container_name: nina-minio
  restart: unless-stopped

  ports:
    - '9000:9000' # API S3 (pour les microservices)
    - '9001:9001' # Console web d'administration

  # 🔒 P0 : credentials root interpolés depuis .env, jamais en clair.
  environment:
    MINIO_ROOT_USER: ${MINIO_ACCESS_KEY} # Équivalent de AWS_ACCESS_KEY_ID
    MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY} # Équivalent de AWS_SECRET_ACCESS_KEY

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

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir la console web : http://localhost:9001
# Login : ${MINIO_ACCESS_KEY} / ${MINIO_SECRET_KEY} (valeurs dans .env, jamais commitées)

# Créer les 4 buckets via le script idempotent (recommandé)
bash scripts/init-minio.sh
# Crée nina-photos, nina-documents, nina-scans, nina-backups
# (re-exécutable sans erreur grâce à --ignore-existing)
```

<details>
<summary>Équivalent manuel via mc CLI (debug / compréhension)</summary>

```powershell
# Les identifiants viennent du .env — on les lit ici via $env: (jamais en clair dans le doc).
# `$env:MINIO_ACCESS_KEY` / `$env:MINIO_SECRET_KEY` sont chargés depuis .env par le shell appelant.
docker exec -it nina-minio mc alias set local http://localhost:9000 "$env:MINIO_ACCESS_KEY" "$env:MINIO_SECRET_KEY"
docker exec -it nina-minio mc mb local/nina-photos    --ignore-existing
docker exec -it nina-minio mc mb local/nina-documents --ignore-existing
docker exec -it nina-minio mc mb local/nina-scans     --ignore-existing
docker exec -it nina-minio mc mb local/nina-backups   --ignore-existing

# ⛔ INTERDIT — NE JAMAIS exposer nina-photos (ni AUCUN bucket NINA) en accès anonyme :
#   docker exec -it nina-minio mc anonymous set download local/nina-photos   # ← FAILLE PII
# Les photos d'identité sont des données BIOMÉTRIQUES (PII sensible). Un bucket en
# `anonymous download` = n'importe qui sur le réseau peut télécharger toutes les photos
# sans authentification. Tous les buckets restent PRIVÉS (politique par défaut), même en dev.
#
# ✅ Accès LÉGITIME aux objets : URLs présignées générées côté `document-service` /
#    `identity-service`, à durée de vie courte (ex. 5 min), scellées par les credentials
#    du service. L'app demande l'objet → le service vérifie le droit (RBAC) → renvoie une
#    presigned URL temporaire. Voir l'équivalent mc ci-dessous (debug uniquement) :
#       docker exec -it nina-minio mc share download --expire 5m local/nina-photos/<objet>
```

</details>

**Buckets prévus** :

| Bucket           | Contenu                                                    | Service producteur                   | Politique d'accès                                 |
| ---------------- | ---------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `nina-photos`    | Photos d'identité des citoyens — **PII biométrique**       | `identity-service`                   | 🔒 **PRIVÉ** — URLs présignées courtes uniquement |
| `nina-documents` | Fiches Descriptives Individuelles (PDF signés), récépissés | `document-service`                   | 🔒 PRIVÉ — URLs présignées (récépissé citoyen)    |
| `nina-scans`     | Documents scannés (actes de naissance, justificatifs)      | `enrollment-service`, `auth-service` | 🔒 PRIVÉ — accès agent authentifié                |
| `nina-backups`   | Sauvegardes périodiques (dump PG, exports audit, ES)       | jobs cron / `audit-service`          | 🔒 PRIVÉ — chiffré au repos, accès opérateur seul |

> ⚠️ **PII biométrique — règle non négociable** : aucun bucket NINA n'est jamais en lecture anonyme,
> **même en développement**. Les photos et scans sont des données personnelles sensibles (biométrie
> faciale). L'accès se fait exclusivement par **URL présignée** à durée de vie courte, émise par un
> service après contrôle RBAC. Documenté dans la section §7.6 « Durcissement & threat model infra »
> et dans `docs/security/THREAT-MODEL.md`.

### 7.2 Elasticsearch 9 — Recherche floue

Elasticsearch complète `pg_trgm` pour la recherche floue avancée sur les noms NINA. Il est
particulièrement efficace pour la recherche multi-critères combinant nom, prénom, date de naissance
et lieu.

```yaml
elasticsearch:
  # Build local 9.4.1 (cohérent avec §2.2 — plugin analysis-phonetic), épinglé par digest.
  image: nina-aes/elasticsearch:9.4.1@sha256:<sha256-nina-es-9.4.1>
  container_name: nina-elasticsearch
  restart: unless-stopped

  ports:
    - '9200:9200'

  environment:
    # Mode single-node (pas de cluster en dev)
    - discovery.type=single-node

    # ✅ COHÉRENCE SÉCURITÉ : la sécurité X-Pack est ACTIVÉE (auth obligatoire).
    #    Auparavant `xpack.security.enabled=false` contredisait le healthcheck qui
    #    s'authentifiait avec `-u elastic:...` → incohérence corrigée. On reste authentifié
    #    partout (healthcheck, scripts init, microservices).
    - xpack.security.enabled=true

    # Mot de passe du superuser `elastic` — interpolé depuis .env (P0), jamais en clair.
    - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}

    # TLS HTTP : désactivé en dev pour simplifier (auth déjà active). En prod : ACTIVÉ
    #   (xpack.security.http.ssl.enabled=true + certificats Vault PKI). Voir §7.6.
    - xpack.security.http.ssl.enabled=false
    - xpack.security.transport.ssl.enabled=false

    # Limiter la mémoire JVM à 512 Mo
    # (Elasticsearch est gourmand — 512 Mo suffit pour le dev)
    - ES_JAVA_OPTS=-Xms512m -Xmx512m

    # Nom du cluster
    - cluster.name=nina-aes

  volumes:
    - es_data:/usr/share/elasticsearch/data

  healthcheck:
    # Vérifier le statut du cluster (green ou yellow acceptable en single-node).
    # 🔒 S'authentifie via ${ELASTIC_PASSWORD} (cohérent avec xpack.security.enabled=true).
    test:
      [
        'CMD-SHELL',
        "curl -s -u elastic:$ELASTIC_PASSWORD http://localhost:9200/_cluster/health | grep -q
        '\"status\":\"green\"\\|\"status\":\"yellow\"'",
      ]
    interval: 15s
    timeout: 10s
    retries: 10 # Plus de retries car ES est lent à démarrer

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

> ✅ **Incohérence résolue** : avant ce durcissement, le bloc déclarait
> `xpack.security.enabled=false` alors que le healthcheck (et les scripts d'init) appelaient l'API
> avec `-u elastic:…`. Sur un ES sans sécurité, ce `-u` est ignoré et masque le fait que **n'importe
> qui** pouvait lire les index `nina_citizens` (noms + lieux de naissance = PII). La sécurité est
> désormais **activée**, et le reset du mot de passe `kibana_system` (cf. bandeau d'en-tête) devient
> obligatoire au premier boot.

**Validation** :

```powershell
# Vérifier la santé du cluster (xpack.security activé → -u requis).
# Le mot de passe vient du .env — on ne l'écrit pas en clair ($env:ELASTIC_PASSWORD en PowerShell).
curl -u "elastic:$env:ELASTIC_PASSWORD" http://localhost:9200/_cluster/health?pretty
# "status" : "green" (ou "yellow" en single-node, c'est normal)

# Vérifier la version
curl -u "elastic:$env:ELASTIC_PASSWORD" http://localhost:9200
# "version" : { "number" : "9.4.1" }

# Créer les index réels (recommandé) — nina_citizens (avec phonétique
# double_metaphone + synonymes noms Mali) + nina_locations.
bash scripts/init-elasticsearch.sh
# Idempotent : --fail-with-body sur les PUT, exit non-zéro si l'un échoue.
# Topologie + analyseurs définis dans le script (source de vérité).
```

<details>
<summary>Démo manuelle : créer un index simple <code>nina_test_demo</code> (didactique)</summary>

```powershell
# ⚠ Cet index est UNIQUEMENT pour comprendre l'API ES — ne pas le confondre
#   avec nina_citizens créé par init-elasticsearch.sh (analyseurs plus riches:
#   phonetic + synonymes pour les noms maliens).
curl -u "elastic:$env:ELASTIC_PASSWORD" -X PUT "http://localhost:9200/nina_test_demo" -H "Content-Type: application/json" -d "{
  \"settings\": {
    \"analysis\": {
      \"analyzer\": {
        \"demo_analyzer\": {
          \"type\": \"custom\",
          \"tokenizer\": \"standard\",
          \"filter\": [\"lowercase\", \"asciifolding\"]
        }
      }
    }
  },
  \"mappings\": {
    \"properties\": {
      \"nina_number\":    { \"type\": \"keyword\" },
      \"last_name\":      { \"type\": \"text\", \"analyzer\": \"demo_analyzer\" },
      \"first_names\":    { \"type\": \"text\", \"analyzer\": \"demo_analyzer\" },
      \"birth_date\":     { \"type\": \"date\" },
      \"birth_place\":    { \"type\": \"text\", \"analyzer\": \"demo_analyzer\" }
    }
  }
}"

# Nettoyer
curl -u "elastic:$env:ELASTIC_PASSWORD" -X DELETE "http://localhost:9200/nina_test_demo"
```

</details>

### 7.3 Keycloak 26 — Serveur d'identité (OAuth2 / OIDC)

Keycloak gère l'authentification et l'autorisation de tous les utilisateurs de la NINA-AES Platform.
Il implémente les protocoles OAuth2 et OpenID Connect, et fournit le RBAC avec les 6 rôles du
système.

```yaml
keycloak:
  image: quay.io/keycloak/keycloak:26.6.2@sha256:<sha256-keycloak-26.6.2>
  container_name: nina-keycloak
  restart: unless-stopped

  ports:
    - '8080:8080' # Console d'administration

  # 🔒 P0 : DB password + identifiants admin bootstrap interpolés depuis .env, jamais en clair.
  environment:
    # Keycloak utilise PostgreSQL comme backend
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB}
    KC_DB_USERNAME: ${POSTGRES_USER}
    KC_DB_PASSWORD: ${POSTGRES_PASSWORD}

    # Configuration réseau
    KC_HOSTNAME: localhost
    KC_HOSTNAME_STRICT: 'false' # Accepter les connexions non-HTTPS en dev
    KC_HTTP_ENABLED: 'true' # Activer HTTP (pas uniquement HTTPS) — DEV uniquement
    KC_HEALTH_ENABLED: 'true' # Activer l'endpoint /health

    # Compte administrateur initial (bootstrap).
    # ⚠ KC 26 : KEYCLOAK_ADMIN/_PASSWORD sont dépréciés → KC_BOOTSTRAP_ADMIN_*.
    KC_BOOTSTRAP_ADMIN_USERNAME: ${KEYCLOAK_ADMIN_USER}
    KC_BOOTSTRAP_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}

  # Mode développement (rechargement à chaud, pas de cache de thèmes)
  command: start-dev

  # Keycloak dépend de PostgreSQL — ne démarre QUE quand PG est healthy
  depends_on:
    postgres:
      condition: service_healthy

  healthcheck:
    # ✅ Correctif (bandeau d'en-tête) : KC 25+ expose /health/ready sur le port
    #    MANAGEMENT 9000 (pas le 8080 API). On sonde donc localhost:9000.
    test:
      [
        'CMD-SHELL',
        "exec 3<>/dev/tcp/localhost/9000 && echo -e 'GET /health/ready HTTP/1.1\\r\\nHost:
        localhost\\r\\n\\r\\n' >&3 && cat <&3 | grep -q '200\\|UP'",
      ]
    interval: 20s # Intervalle plus long (Keycloak démarre lentement)
    timeout: 10s
    retries: 10
    start_period: 30s # Attendre 30s avant le premier check

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir la console d'administration : http://localhost:8080
# Login : ${KEYCLOAK_ADMIN_USER} / ${KEYCLOAK_ADMIN_PASSWORD} (valeurs dans .env, jamais commitées)

# Vérifier que Keycloak répond (endpoint public du realm master)
curl http://localhost:8080/realms/master
# {"realm":"master","public_key":"MII...","token-service":"http://localhost:8080/realms/master/protocol/openid-connect","account-service":"...","tokens-not-before":0}

# Note: /health/ready de Keycloak est exposé sur le port management 9000
# INTERNE au conteneur — non publié vers l'hôte par notre docker-compose.
# Pour le tester il faudrait soit publier le 9000, soit exec dans le container :
#   docker exec nina-keycloak curl http://localhost:9000/health/ready
# (curl n'est pas installé dans l'image Keycloak — utiliser wget ou ajouter
# une image avec curl si nécessaire pour le healthcheck applicatif.)
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
  image: hashicorp/vault:2.0.1@sha256:<sha256-vault-2.0.1> # saut majeur 1.x → 2.x (2026-05-19)
  container_name: nina-vault
  restart: unless-stopped

  ports:
    - '8200:8200' # API + UI → http://localhost:8200

  # 🔒 P0 : le token racine DEV est interpolé depuis .env (jamais en clair).
  # ⚠ Le mode `start-dev` stocke les secrets EN MÉMOIRE, NON CHIFFRÉS, avec un token
  #   racine connu → STRICTEMENT réservé au poste local. Voir « Migration Vault » ci-dessous.
  environment:
    # Token racine pour le mode développement
    VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_DEV_ROOT_TOKEN}
    # Adresse d'écoute
    VAULT_DEV_LISTEN_ADDRESS: 0.0.0.0:8200

  # IPC_LOCK empêche le swap de la mémoire du processus Vault
  # (les secrets ne doivent jamais se retrouver sur disque via le swap).
  # Avec Vault 2.0 la capacité est posée à la build mais reste OBLIGATOIRE
  # au runtime — sans cap_add, le binaire échouera à mlock().
  cap_add:
    - IPC_LOCK

  healthcheck:
    # VAULT_ADDR en HTTP (start-dev écoute HTTP, le client par défaut parle HTTPS).
    test: ['CMD', 'vault', 'status', '-address=http://127.0.0.1:8200']
    interval: 10s
    timeout: 5s
    retries: 5

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

> 🔐 **Migration Vault (du dev-mode vers le mode production)** — _concept, non implémenté (Phase 2)_
> :
>
> | Aspect              | Dev (`start-dev`, ce doc)                     | Production (cible — `docs/security/SECURITY-RUNBOOK.md`)                          |
> | ------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
> | Stockage            | En mémoire, **non chiffré**, perdu au restart | Backend persistant (Raft intégré) **chiffré**                                     |
> | Scellement          | Auto-unseal permanent (dev)                   | **Auto-unseal souverain** (Transit d'un Vault amont on-premise), PAS AWS KMS      |
> | Authentification    | Token racine fixe (`${VAULT_DEV_ROOT_TOKEN}`) | **AppRole** (services) + **Kubernetes auth** (pods) avec leases courts            |
> | Token long-lived    | Toléré en dev local seulement                 | **INTERDIT** — jamais de `VAULT_TOKEN` statique (cf. canon sécurité / ADR-034)    |
> | Distribution secret | `.env` lu par compose                         | Vault Agent sidecar (`vault agent template`) ou CSI Secrets Store → fichier monté |
> | TLS                 | HTTP local                                    | mTLS strict (Linkerd) + PKI Vault, rotation cert/JWKS automatique (ADR-034)       |
>
> En production, les services ne lisent **plus** `.env` : ils s'authentifient à Vault via
> AppRole/SA, obtiennent un lease court, et Vault injecte les secrets (DB, MinIO, RabbitMQ, clés JWT
> RS256) dans un fichier monté. Aucun secret ne transite par une variable d'environnement visible
> dans `docker inspect`. Référence : ADR-026/034 + `docs/security/SECURITY-RUNBOOK.md`.

**Validation** :

```powershell
# Ouvrir l'UI web : http://localhost:8200
# Token : ${VAULT_DEV_ROOT_TOKEN}  (défini dans .env, injecté via VAULT_DEV_ROOT_TOKEN_ID)

# Vérifier le statut (VAULT_ADDR requis : le client défaut HTTPS, notre dev = HTTP)
docker exec -e VAULT_ADDR=http://localhost:8200 nina-vault vault status
# Sealed: false  (en mode dev, Vault est automatiquement "unsealed")

# Stocker un secret de test (VAULT_TOKEN lu depuis le .env de l'hôte → jamais en clair ici)
docker exec -e VAULT_ADDR=http://localhost:8200 -e VAULT_TOKEN="$env:VAULT_DEV_ROOT_TOKEN" \
  nina-vault vault kv put secret/jwt-keys private-key="test-key-content"
# Success! Data written to: secret/data/jwt-keys

# Lire le secret
docker exec -e VAULT_ADDR=http://localhost:8200 -e VAULT_TOKEN="$env:VAULT_DEV_ROOT_TOKEN" \
  nina-vault vault kv get secret/jwt-keys
# Key            Value
# ---            -----
# private-key    test-key-content

# Astuce: pour éviter de répéter -e à chaque commande, entrer dans un shell:
#   docker exec -e VAULT_ADDR=http://localhost:8200 -e VAULT_TOKEN="$env:VAULT_DEV_ROOT_TOKEN" \
#     -it nina-vault sh
# puis 'vault kv put/get/...' sans flags supplémentaires.
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
  image: maildev/maildev:2.2.1@sha256:<sha256-maildev-2.2.1>
  container_name: nina-maildev
  restart: unless-stopped

  ports:
    - '1080:1080' # Interface web (visualiser les emails capturés)
    - '1025:1025' # Port SMTP (le notification-service envoie ici)

  # Pas de volume (les emails capturés sont perdus au redémarrage)
  # Pas de healthcheck (service non critique)

  security_opt:
    - no-new-privileges:true

  networks:
    - nina-network
```

**Validation** :

```powershell
# Ouvrir l'interface web : http://localhost:1080
# (vide au démarrage — des emails apparaîtront quand notification-service enverra)

# Tester via l'API REST Maildev (le plus simple, multi-plateforme)
curl http://localhost:1080/email
# [] au démarrage, puis [ { "from": [...], "to": [...], "subject": "...", "html": "...", ... } ]
# après un envoi.

# Tester l'envoi SMTP manuellement depuis Windows PowerShell 5.1 :
Send-MailMessage -From "test@nina-aes.ml" -To "citoyen@example.com" `
  -Subject "Test NINA-AES" -Body "Email de test depuis Maildev" `
  -SmtpServer "localhost" -Port 1025
# L'email apparaît immédiatement dans http://localhost:1080

# ⚠ Send-MailMessage est officiellement DÉPRÉCIÉ par Microsoft
# (https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/send-mailmessage).
# Il fonctionne encore sur Windows PowerShell 5.1 mais émettra un warning.
# Pour PowerShell 7+, utiliser MailKit via le module Send-MailKitMessage :
#   Install-Module Send-MailKitMessage -Scope CurrentUser
# Ou simplement passer par l'API HTTP du notification-service quand il sera up.
```

### 7.6 Durcissement & threat model infra

> 🎯 **But** : cette section décrit le **modèle de menace** de l'infrastructure et les
> contre-mesures. En dev local, certaines sont relâchées (HTTP, ports publiés, `start-dev`) ; la
> cible production est tracée dans `docs/security/THREAT-MODEL.md`,
> `docs/security/SECURITY-RUNBOOK.md` et **ADR-034** (mTLS strict Linkerd + PKI Vault + rotation
> clés/JWKS + scans CI). Statut ci-dessous : ✅ = appliqué dans ce doc, ⏳ = conçu, à implémenter en
> Phase 2.

#### 7.6.1 Secrets — zéro secret en clair

- ✅ **Portée du doc (extraits)** : dans **les extraits YAML reproduits dans ce document**, chaque
  mot de passe (Postgres, Redis, RabbitMQ, MinIO, Keycloak, Elasticsearch, Vault) est interpolé en
  **`${VAR}` nu** (sans valeur par défaut). C'est la **cible** que le compose réel doit atteindre. ⚠
  Honnêteté : cette affirmation ne porte **que** sur les extraits ci-dessus — **pas** sur le fichier
  livré, qui présente encore le drift décrit au point suivant. (Anciennement ce point prétendait «
  le YAML ne contient aucun littéral » et renvoyait à un grep censé « ne retourner aucune valeur » :
  c'était un **overclaim** — le compose committé contient bien des secrets en clair, cf.
  ci-dessous.)
- ⏳ **DRIFT À CORRIGER (P0, code)** : le fichier réel
  `infrastructure/docker/docker-compose.dev.yml` utilise encore des **fallbacks
  `${VAR:-mot_de_passe_dev}`** qui exposent **6 secrets en clair committés** sur la branche. Les 6
  valeurs littérales (avec leur variable primaire telle qu'écrite dans le compose livré) :
  - `POSTGRES_PASSWORD` → `${POSTGRES_PASSWORD:-nina_dev_2026!}` (réutilisé par `KC_DB_PASSWORD`)
  - `REDIS_PASSWORD` → `${REDIS_PASSWORD:-redis_dev_2026!}` (env **et** healthcheck `redis-cli -a`)
  - `RABBITMQ_DEFAULT_PASS` → `${RABBITMQ_DEFAULT_PASS:-${RABBITMQ_PASSWORD:-rabbit_dev_2026!}}`
  - `MINIO_ROOT_PASSWORD` → `${MINIO_ROOT_PASSWORD:-${MINIO_SECRET_KEY:-minio_dev_2026!}}`
  - `ELASTIC_PASSWORD` → `${ELASTIC_PASSWORD:-${ELASTICSEARCH_PASSWORD:-elastic_dev_2026!}}` (env,
    healthcheck, et propagé à Kibana)
  - `KC_BOOTSTRAP_ADMIN_PASSWORD` →
    `${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-keycloak_admin_2026!}}`

  Ces littéraux doivent être **retirés du YAML** (interpolation `${VAR}` nue, sans `:-default`), de
  sorte qu'un `.env` manquant fasse **échouer** le `compose up` au lieu de démarrer avec un mot de
  passe public connu de tous.

- ✅ `.env` jamais commité (`.gitignore`) ; `.env.example` documente uniquement les **noms** + des
  placeholders. Commande de contrôle du drift (compte les **valeurs littérales distinctes** encore
  présentes) :
  `git grep -hoE ':-[a-z_]+_(dev|admin)_2026!' infrastructure/docker/docker-compose.dev.yml | sort -u | wc -l`
  → **retourne `6` aujourd'hui**, doit retourner **`0`** une fois le P0 appliqué. (Le pattern brut
  sans `sort -u` matche ~10 lignes car certains secrets — `redis`, `elastic` — apparaissent aussi
  dans les healthchecks/propagations ; c'est bien **6 secrets uniques** qui fuient.)
- ⏳ **Production = Vault** (cf. « Migration Vault », §7.4) : AppRole / Kubernetes auth + leases
  courts ; **jamais** de `VAULT_TOKEN` long-lived. Secrets injectés par Vault Agent / CSI Secrets
  Store dans un fichier monté, pas en variable d'env (invisible dans `docker inspect`).

#### 7.6.2 Chaîne d'approvisionnement (supply chain)

- ✅ **Pinning par digest SHA-256** : chaque image est épinglée `name:tag@sha256:…` (pas seulement
  par tag mutable). Un tag peut être réécrit côté registre ; un digest est immuable et auditable.
  Résoudre les digests : `docker buildx imagetools inspect <image>:<tag>`.
- ⏳ **Scan Trivy en CI** : bloquer le merge si une image contient une CVE `HIGH`/`CRITICAL`.

  ```bash
  # ⏳ à câbler dans le pipeline CI (Phase 2)
  # Scanne chaque image épinglée et échoue (exit≠0) sur HIGH/CRITICAL.
  trivy image --severity HIGH,CRITICAL --exit-code 1 \
    postgis/postgis:18-3.6@sha256:<digest>
  # Variante filesystem (scanne le compose + Dockerfiles) :
  trivy config infrastructure/docker/
  ```

- ⏳ **Miroir registry on-premise (souveraineté)** : ne pas dépendre de Docker Hub / quay.io en
  prod. Miroir interne CTDEC (Harbor / registry:2) qui réplique et signe les images approuvées.
  Évite la fuite de métadonnées vers des registres étrangers et garantit la disponibilité hors
  connexion. ⚠ Pas d'AWS ECR public ni Cloudflare sur le cœur (cohérent avec le canon souveraineté).
- ⏳ **Signature d'images** (cosign) + vérification d'admission (policy controller) en cluster.

#### 7.6.3 Durcissement runtime des conteneurs

| Mesure                      | Effet                                                                 | Statut                                                       |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `no-new-privileges:true`    | Interdit l'escalade de privilèges (setuid) dans le conteneur          | ✅ posé sur chaque service                                   |
| `read_only: true` + `tmpfs` | Système de fichiers en lecture seule ; écritures cantonnées aux tmpfs | ⏳ Phase 2 (Postgres/ES ont besoin de chemins inscriptibles) |
| `user:` non-root            | Le process ne tourne pas en UID 0 (réduit l'impact d'une évasion)     | ⏳ Phase 2 (images Debian root par défaut)                   |
| `cap_drop: [ALL]`           | Retire toutes les capabilities Linux, on ne ré-ajoute que le strict   | ⏳ (Vault garde `IPC_LOCK`)                                  |
| `pids_limit` / `mem_limit`  | Limite l'épuisement de ressources (DoS local)                         | ⏳ Phase 2                                                   |

```yaml
# ⏳ Exemple cible (Phase 2) — durcissement complet d'un service stateless :
#   read_only + tmpfs + user non-root + cap_drop. À NE PAS appliquer tel quel à
#   Postgres/ES (ils écrivent hors volumes) sans tmpfs adaptés.
example-hardened-service:
  image: some/image:tag@sha256:<digest>
  read_only: true # FS racine en lecture seule
  tmpfs:
    - /tmp # zone scratch éphémère en RAM
  user: '10001:10001' # UID/GID non privilégié
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL # on retire tout, on ne ré-ajoute que si nécessaire
```

#### 7.6.4 Chiffrement en transit — TLS / mTLS

- En **dev**, on parle HTTP en local (simplicité) : ES `http.ssl.enabled=false`, Keycloak
  `KC_HTTP_ENABLED=true`, Vault `start-dev` en HTTP. **Acceptable uniquement sur `localhost`**.
- ⏳ En **prod** : **mTLS strict** entre tous les services via **Linkerd** (sidecar), certificats
  issus de la **PKI Vault**, rotation automatique des certificats et des JWKS — couvert par
  **ADR-034**. Aucun trafic inter-service en clair. TLS terminé au mesh, pas par chaque app.
- ⏳ TLS HTTP activé sur ES (`xpack.security.http.ssl.enabled=true`) et Keycloak (HTTPS) avec certs
  Vault, pas de certificat auto-signé long-lived.

#### 7.6.5 Segmentation réseau & exposition

- ✅ Réseau bridge dédié `nina-aes-network` (isolé du réseau Docker par défaut).
- ⏳ **Ne pas publier les ports data en prod** : Postgres (5432), Redis (6379), ES (9200), RabbitMQ
  (5672) **ne doivent pas** être mappés vers l'hôte — accès via réseau interne uniquement. Seuls les
  ingress applicatifs (api-gateway) sont exposés. En dev local, les ports sont publiés pour le
  confort (psql, redis-cli) — relâchement assumé.
- ⏳ **NetworkPolicy** (en cluster) : segmenter en zones (data / app / edge) et n'autoriser que les
  flux légitimes (ex. seul `document-service` joint MinIO ; seul Keycloak joint Postgres).
- ✅ **PII biométrique (MinIO)** : aucun bucket en accès anonyme, **même en dev** (cf. §7.1). Accès
  exclusivement par **URL présignée** courte émise après contrôle RBAC.

#### 7.6.6 Menaces principales & contre-mesures (synthèse)

| Menace                                                   | Contre-mesure                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuite de secrets (clair dans le repo / `docker inspect`) | ✅ extraits du doc en `${VAR}` nu ; ⏳ **P0** retirer les `:-…_dev_2026!` du compose réel (§7.6.1) ; ⏳ Vault + `_FILE`/fichier monté en prod |
| Exfiltration des photos biométriques                     | ✅ buckets privés + URL présignées courtes ; ⏳ chiffrement au repos MinIO                                                                    |
| Lecture non authentifiée des index ES (noms = PII)       | ✅ `xpack.security.enabled=true` ; ⏳ TLS HTTP + RBAC ES                                                                                      |
| Image compromise / CVE                                   | ✅ pin par digest ; ⏳ scan Trivy CI + miroir on-premise + cosign                                                                             |
| Évasion de conteneur / escalade privilèges               | ✅ `no-new-privileges` ; ⏳ read-only + non-root + `cap_drop: [ALL]`                                                                          |
| Sniffing inter-services                                  | ⏳ mTLS strict Linkerd + PKI Vault (ADR-034)                                                                                                  |
| Exposition réseau excessive                              | ✅ réseau dédié ; ⏳ ports data non publiés + NetworkPolicy en prod                                                                           |

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
# Lister tous les volumes Docker du projet (5 attendus)
docker volume ls | Select-String "nina"
# local     nina-elasticsearch-data
# local     nina-minio-data
# local     nina-postgres-data
# local     nina-rabbitmq-data
# local     nina-redis-data

# Voir la taille des volumes
docker system df -v | Select-String "nina"

# Supprimer un volume spécifique (⚠️ perte de données)
# Note : les volumes ont des noms explicites via `name:` dans le compose,
# donc PAS de préfixe project généré du type `nina-aes-platform_postgres_data`.
docker volume rm nina-postgres-data

# Supprimer TOUS les volumes du projet (⚠️ reset complet — perte totale)
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml down -v
# Raccourcis équivalents :
#   pnpm run docker:down   → arrête sans toucher aux volumes
#   pnpm run docker:reset  → arrête + wipe les 5 volumes (équivalent à la ligne ci-dessus)
# Après un docker:reset, reprovisionner avec :
#   pnpm run docker:up
#   bash scripts/init-minio.sh
#   bash scripts/init-elasticsearch.sh
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
# Voir les conteneurs connectés au réseau (sortie JSON détaillée)
docker network inspect nina-aes-network

# Pour juste la liste IP ↔ container (plus lisible) :
docker network inspect nina-aes-network --format "{{range .Containers}}{{.Name}}: {{.IPv4Address}}`n{{end}}"
# Exemple — 9 conteneurs, IPs dynamiques attribuées selon l'ordre de démarrage :
#   nina-keycloak:      172.18.0.2/16
#   nina-elasticsearch: 172.18.0.3/16
#   nina-maildev:       172.18.0.4/16
#   nina-minio:         172.18.0.5/16
#   nina-kibana:        172.18.0.6/16
#   nina-redis:         172.18.0.7/16
#   nina-vault:         172.18.0.8/16
#   nina-rabbitmq:      172.18.0.9/16
#   nina-postgres:      172.18.0.10/16
```

> ⚠ Les IPs internes (172.18.0.x) sont **attribuées dynamiquement** par Docker selon l'ordre de
> démarrage des conteneurs — ne pas s'y fier dans le code. Les services se résolvent par **nom DNS**
> (`postgres`, `redis`, `rabbitmq`, …) à travers la résolution DNS embedded de Docker sur le réseau
> bridge `nina-aes-network`.

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
| Redis « NOAUTH Authentication required »                                                        | Le mot de passe n'est pas fourni dans l'URL                         | Vérifier `REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379` (noter le `:` avant le mot de passe).                                                                                                               |
| MinIO « Access Denied »                                                                         | Mauvais credentials                                                 | Vérifier que `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` du `.env` correspondent à `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` du conteneur.                                                                             |
| Docker est très lent sous Windows                                                               | Docker Desktop utilise trop/pas assez de RAM                        | Paramètres Docker Desktop → Resources → augmenter à 4 Go RAM minimum, 4 CPUs.                                                                                                                                      |
| `init-db.sql` ne s'exécute pas                                                                  | Le volume `postgres_data` existe déjà                               | Le script ne s'exécute qu'au premier démarrage. Supprimer le volume : `docker volume rm nina-aes-platform_postgres_data` puis relancer.                                                                            |
| Espace disque Docker plein                                                                      | Images et volumes non utilisés                                      | `docker system prune -a --volumes` (⚠️ supprime tout ce qui n'est pas utilisé).                                                                                                                                    |
| RabbitMQ management UI inaccessible                                                             | Plugin management pas activé                                        | L'image `rabbitmq:4.2.4-management-alpine` inclut le plugin. Si version sans `-management`, le port 15672 ne fonctionne pas.                                                                                       |

### 9.2 Commandes de diagnostic avancées

```powershell
# ── Voir les logs d'un conteneur en erreur ──
pnpm run docker:logs --tail 50 postgres
# Équivalent direct :
# docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml logs --tail=50 postgres

# ── Vérifier la connectivité réseau entre conteneurs ──
# ⚠ ping N'EST PAS installé dans la plupart des images (postgis, redis-alpine,
#   rabbitmq-alpine, etc.). Utiliser /dev/tcp via bash (PAS sh — c'est une
#   feature bash, sh/dash renvoie "Directory nonexistent") :
docker exec nina-postgres bash -c "echo > /dev/tcp/nina-redis/6379 && echo OK"
# Pour les images sans bash (alpine), utiliser nc si disponible :
# docker exec nina-redis nc -zv nina-postgres 5432

# ── Vérifier l'utilisation mémoire de chaque conteneur ──
docker stats --no-stream

# ── Inspecter un conteneur en détail (filtrer l'IP) ──
docker inspect nina-postgres | Select-String -Pattern '"IPAddress"'
# Variante --format (sans piping PowerShell, retourne juste l'IP) :
docker inspect nina-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

# ── Forcer la recréation d'un conteneur ──
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml up -d --force-recreate postgres

# ── Vérifier que tous les healthchecks passent ──
pnpm run docker:ps --format "table {{.Name}}\t{{.Status}}"
# Tous doivent afficher "(healthy)" dans le statut
```

---

## 10. Variables d'environnement — Référence complète

Le fichier `.env.example` contient toutes les variables nécessaires. Voici la documentation
détaillée par catégorie.

> 🔒 **P0** : la colonne « Valeur `.env.example` » ne contient que des **placeholders**, jamais de
> secret réel. Sur le poste de dev, copier `.env.example` → `.env` et remplacer chaque
> `__CHANGE_ME__*` par une valeur générée (`openssl rand -base64 24`). `.env` reste non commité. En
> production, ces valeurs ne viennent **pas** de `.env` mais de Vault (cf. §7.4).

### 10.1 PostgreSQL

| Variable            | Valeur `.env.example`                                                | Utilisé par                      | Description                                  |
| ------------------- | -------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- |
| `POSTGRES_USER`     | `nina_admin`                                                         | Docker Compose                   | Utilisateur PostgreSQL créé au démarrage     |
| `POSTGRES_PASSWORD` | `__CHANGE_ME__PG`                                                    | Docker Compose                   | Mot de passe PostgreSQL (généré localement)  |
| `POSTGRES_DB`       | `nina_aes_db`                                                        | Docker Compose                   | Base de données créée au démarrage           |
| `DATABASE_URL`      | `postgresql://nina_admin:__CHANGE_ME__PG@localhost:5432/nina_aes_db` | Prisma, tous les services NestJS | URL de connexion (réutilise le mot de passe) |

### 10.2 Redis

| Variable         | Valeur `.env.example`                        | Utilisé par                   | Description                  |
| ---------------- | -------------------------------------------- | ----------------------------- | ---------------------------- |
| `REDIS_URL`      | `redis://:__CHANGE_ME__REDIS@localhost:6379` | Services NestJS (cache, USSD) | URL avec mot de passe        |
| `REDIS_HOST`     | `localhost`                                  | Config alternative            | Hôte seul (certains clients) |
| `REDIS_PORT`     | `6379`                                       | Config alternative            | Port seul                    |
| `REDIS_PASSWORD` | `__CHANGE_ME__REDIS`                         | Docker Compose + config       | Mot de passe seul            |

### 10.3 RabbitMQ

| Variable            | Valeur `.env.example`                                | Utilisé par                | Description       |
| ------------------- | ---------------------------------------------------- | -------------------------- | ----------------- |
| `RABBITMQ_URL`      | `amqp://nina_rabbit:__CHANGE_ME__RMQ@localhost:5672` | Services NestJS (messages) | URL AMQP complète |
| `RABBITMQ_HOST`     | `localhost`                                          | Config alternative         | Hôte seul         |
| `RABBITMQ_USER`     | `nina_rabbit`                                        | Docker Compose + config    | Utilisateur AMQP  |
| `RABBITMQ_PASSWORD` | `__CHANGE_ME__RMQ`                                   | Docker Compose + config    | Mot de passe AMQP |

### 10.4 MinIO

| Variable                 | Valeur `.env.example` | Utilisé par        | Description                             |
| ------------------------ | --------------------- | ------------------ | --------------------------------------- |
| `MINIO_ENDPOINT`         | `localhost`           | `document-service` | Hôte MinIO                              |
| `MINIO_PORT`             | `9000`                | `document-service` | Port API S3                             |
| `MINIO_ACCESS_KEY`       | `nina_minio_admin`    | `document-service` | Access key (= AWS_ACCESS_KEY_ID)        |
| `MINIO_SECRET_KEY`       | `__CHANGE_ME__MINIO`  | `document-service` | Secret key (= AWS_SECRET_ACCESS_KEY)    |
| `MINIO_BUCKET_DOCUMENTS` | `nina-documents`      | `document-service` | Bucket pour les PDF                     |
| `MINIO_BUCKET_PHOTOS`    | `nina-photos`         | `identity-service` | Bucket photos (PRIVÉ — URLs présignées) |

### 10.5 Elasticsearch

| Variable                   | Valeur `.env.example`   | Utilisé par                  | Description                                                |
| -------------------------- | ----------------------- | ---------------------------- | ---------------------------------------------------------- |
| `ELASTICSEARCH_URL`        | `http://localhost:9200` | `identity-service`           | URL du cluster ES                                          |
| `ELASTIC_PASSWORD`         | `__CHANGE_ME__ES`       | Docker Compose, scripts init | Mot de passe superuser `elastic` (xpack.security activé)   |
| `ELASTICSEARCH_INDEX_NINA` | `nina_citizens`         | `identity-service`           | Index principal (créé par `scripts/init-elasticsearch.sh`) |

### 10.6 Keycloak

| Variable                  | Valeur `.env.example`    | Utilisé par               | Description                                   |
| ------------------------- | ------------------------ | ------------------------- | --------------------------------------------- |
| `KEYCLOAK_URL`            | `http://localhost:8080`  | `auth-service`, frontends | URL du serveur Keycloak                       |
| `KEYCLOAK_REALM`          | `nina-aes`               | `auth-service`            | Realm dédié au projet                         |
| `KEYCLOAK_CLIENT_ID`      | `nina-platform`          | Frontends Next.js         | ID du client OAuth2                           |
| `KEYCLOAK_CLIENT_SECRET`  | `__CHANGE_ME__KC_CLIENT` | `auth-service`            | Secret du client OAuth2                       |
| `KEYCLOAK_ADMIN_USER`     | `admin`                  | Docker Compose            | Admin bootstrap (KC_BOOTSTRAP_ADMIN_USERNAME) |
| `KEYCLOAK_ADMIN_PASSWORD` | `__CHANGE_ME__KC_ADMIN`  | Docker Compose            | Mot de passe admin bootstrap                  |

### 10.7 Vault

| Variable               | Valeur `.env.example`   | Utilisé par       | Description                                           |
| ---------------------- | ----------------------- | ----------------- | ----------------------------------------------------- |
| `VAULT_ADDR`           | `http://localhost:8200` | Tous les services | URL de l'API Vault                                    |
| `VAULT_DEV_ROOT_TOKEN` | `__CHANGE_ME__VAULT`    | Docker Compose    | Token racine **dev mode uniquement** (jamais en prod) |
| `VAULT_TOKEN`          | `__CHANGE_ME__VAULT`    | Services (dev)    | En prod : remplacé par AppRole/K8s auth + lease court |

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

- [ ] Connexion réussie : `docker exec -it nina-postgres psql -U nina_admin -d nina_aes_db`
- [ ] Extensions installées : `\dx` montre uuid-ossp, pgcrypto, pg_trgm, unaccent
- [ ] Base de test existe : `\l` montre `nina_aes_test`
- [ ] Recherche floue fonctionnelle : `SELECT similarity('Mamadu', 'Mamadou');` retourne ~0.5

### Redis

- [ ] `docker exec -it nina-redis redis-cli -a "$env:REDIS_PASSWORD" ping` retourne `PONG`
- [ ] Opérations SET/GET/EX fonctionnelles
- [ ] Persistance AOF activée (`CONFIG GET appendonly` → `yes`)

### RabbitMQ

- [ ] Interface web accessible : `http://localhost:15672` (identifiants depuis `.env` :
      `RABBITMQ_USER`/`RABBITMQ_PASSWORD`)
- [ ] `rabbitmqctl status` exécutable sans erreur

### MinIO

- [ ] Console web accessible : `http://localhost:9001` (identifiants `.env` :
      `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`)
- [ ] Buckets `nina-documents` et `nina-photos` créés — **tous PRIVÉS** (aucun accès anonyme)
- [ ] Vérifié : `nina-photos` n'est PAS en `anonymous download` (PII biométrique)

### Elasticsearch

- [ ] `curl -u "elastic:$env:ELASTIC_PASSWORD" http://localhost:9200` retourne les infos du cluster
      (version 9.4.1)
- [ ] `xpack.security.enabled=true` (auth obligatoire) ; mot de passe `kibana_system` réinitialisé
      au premier boot
- [ ] Statut du cluster : `green` ou `yellow`

### Keycloak

- [ ] Console accessible : `http://localhost:8080` (identifiants `.env` :
      `KEYCLOAK_ADMIN_USER`/`KEYCLOAK_ADMIN_PASSWORD`)
- [ ] Endpoint de santé (port management 9000) : `docker exec nina-keycloak ... /health/ready` →
      `UP`

### Vault

- [ ] UI accessible : `http://localhost:8200` (token : `VAULT_DEV_ROOT_TOKEN` depuis `.env`)
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
- **PostgreSQL Extensions** (https://www.postgresql.org/docs/18/contrib.html) — Liste complète des
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
