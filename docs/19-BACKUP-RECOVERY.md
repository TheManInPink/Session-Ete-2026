# 19 — Sauvegardes et reprise après sinistre (pg_dump · MinIO réplication · Redis snapshots · DRP)

> **Bloc concerné** : Transversal (tous les blocs A → F) — appliqué dès que PostgreSQL contient des
> données seed/test métier ; durci pour le passage en production. **Prérequis** : documents 00 → 18
> complétés ; HashiCorp Vault opérationnel (doc 15) pour la clé de chiffrement des dumps ; stack
> observabilité (doc 17) pour surveiller les jobs de sauvegarde. **Durée estimée** : 10 à 14 heures
> pour un étudiant seul. **Livrables de cette étape** :
>
> - **pg_dump chiffré quotidien** de `nina_aes_db` + `keycloak` via `pgbackrest 2.55` ou `wal-g 3.1`
>   (Postgres 18 — full + incremental WAL)
> - **Chiffrement AES-256-GCM** (AEAD) des dumps via clé Vault Transit `aes256-gcm96` (auto-rotation
>   90j) + enveloppe `age` (XChaCha20-Poly1305) pour l'off-site
> - **Signature Ed25519** des dumps (in-process, Vault Transit ne supporte pas Ed25519) vérifiée au
>   restore (anti-tampering)
> - **Object Lock COMPLIANCE** (WORM) sur le bucket de backups — contrôle anti-ransomware de base
> - **Réplication MinIO bucket** `nina-documents` vers MinIO secondaire (mode `active-active` ou
>   `replication`)
> - **Snapshots Redis** : RDB + AOF (Append-Only File) — TTL des sessions USSD respecté, queues
>   éphémères ignorées
> - **Stockage off-site** : copie chiffrée vers S3-compatible souverain (Scaleway Paris, OVH
>   Strasbourg, ou MinIO secondaire CTDEC)
> - **Rétention** : 7j journaliers + 4 hebdo + 12 mensuels + 7 annuels (grand-père/père/fils)
> - **Scripts restore testés mensuellement** : 1 script bash + 1 test E2E qui spin-up un container
>   Postgres, restore le dernier dump, vérifie l'intégrité (hash + count).
> - **Plan de reprise après sinistre (DRP)** documenté :
>   - **RTO** (Recovery Time Objective) : **< 4 h**
>   - **RPO** (Recovery Point Objective) : **< 1 h**
> - **Runbook** : `docs/observability/DRP-RUNBOOK.md` (scénarios + procédures)
> - `docs/adr/ADR-019-backup-recovery-strategy.md`

---

## 1. Objectif pédagogique

Un système d'identité d'État qui perd les données d'enrôlement est **irrécupérable** — pas seulement
techniquement (les FDI doivent être ré-émises, les RDV reprogrammés, la hash-chain d'audit SHA-256
reconstruite — ADR-007), mais **institutionnellement** (perte de confiance, contentieux juridique,
agrément ANSSI suspendu). Trois principes pédagogiques :

1. **Un backup non testé n'est pas un backup**. La fréquence des dumps importe peu si la procédure
   de restore n'a jamais été exécutée. Cette étape livre un test automatique mensuel qui exécute le
   scénario complet (dump → upload → download → restore → vérification).

2. **3-2-1 rule**. Trois copies des données, sur deux supports différents, dont une off-site.
   Concrètement :
   - **Copie 1** : DB primaire `nina_aes_db` sur Postgres K3s CTDEC
   - **Copie 2** : MinIO interne CTDEC (`backups-bucket`, chiffré)
   - **Copie 3** : MinIO secondaire (datacenter géographiquement distant — Ouagadougou si Mali
     principal, ou bucket Scaleway/OVH chiffré)

3. **Le DRP est un exercice, pas un document**. Documenter le RTO/RPO ne suffit pas. Cette étape
   inclut un **test trimestriel** où on coupe volontairement un nœud Postgres et on chronomètre la
   reprise. Si on dépasse les 4 h, le DRP est ajusté.

> 💡 **Souveraineté** : les copies off-site doivent rester dans un datacenter souverain ou allié.
> Pas de S3 AWS, pas de Azure Blob, pas de Google Cloud Storage. La liste retenue : MinIO secondaire
> CTDEC, Scaleway Paris, OVH Strasbourg, Cellar Clever Cloud. Tous opèrent sous juridiction
> européenne ou africaine.

---

## 2. Technologies utilisées (versions mai 2026)

| Outil                            | Version           | Rôle                                                         |
| -------------------------------- | ----------------- | ------------------------------------------------------------ |
| **pgBackRest**                   | `2.55.x`          | Backups Postgres avec full + diff + WAL archive              |
| **wal-g** (alternative)          | `3.1.x`           | Backups + WAL push vers S3-compat, plus léger que pgBackRest |
| **PostgreSQL**                   | `18.x`            | Already running (cf. doc 05 / ADR-005)                       |
| **MinIO**                        | `2025-09-07`      | Object storage S3-compat — replication built-in              |
| **mc (MinIO Client)**            | `2025-09`         | CLI mc admin replicate, mc cp                                |
| **Redis**                        | `8.6`             | RDB snapshots + AOF (Append-Only File)                       |
| **HashiCorp Vault**              | `2.0.1` _(drift)_ | Clé de chiffrement Transit AES-256-GCM (rotation 90j)        |
| **age (encryption)**             | `1.2.0`           | Chiffrement fichiers en + de pg_dump natif                   |
| **restic** (alternative)         | `0.18.x`          | Backup tool générique avec dedup + chiffrement               |
| **K3s CronJob**                  | `1.33`            | Orchestration jobs backup quotidiens                         |
| **Prometheus blackbox-exporter** | `0.27`            | Surveillance dispo des endpoints S3 de backup                |

> 🔒 Tous open-source / souverains. age est l'outil de chiffrement recommandé par modern crypto
> (XChaCha20-Poly1305, courbe X25519).
>
> ⚠️ **Drift de version Vault NON résolu (honnêteté soutenance)** : trois valeurs coexistent
> aujourd'hui dans le dépôt et **ne sont PAS alignées** :
>
> - `infrastructure/docker/docker-compose.dev.yml:352` épingle **`hashicorp/vault:2.0.1`** (valeur
>   réellement déployée en dev — vérifiable par `Grep`) ;
> - `docs/adr/ADR-034-...:52` affiche **`1.18`** ;
> - les versions antérieures de ce document affichaient **`1.20`**.
>
> Il n'existe **aucune** harmonisation effective : la justification « pour rester aligné avec
> docker-compose.dev.yml » était **factuellement fausse** (le compose est sur `2.0.1`, pas `1.20`).
> Ce document s'aligne donc désormais sur la valeur **réellement déployée (`2.0.1`)** ; la
> réconciliation de l'ADR-034 et du doc 15 (qui affichent encore `1.18`) reste un **drift connu à
> corriger** (⏳ Phase 2, hors périmètre DOCS-ONLY de ce fichier). Les fonctionnalités Transit
> utilisées ici (`aes256-gcm96`, `auto_rotate_period`) sont disponibles sur l'ensemble de ces
> versions.

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_BackupRecovery
title Sauvegardes et reprise après sinistre — flux 3-2-1

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam component { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam cloud     { BackgroundColor #ECFDF5; BorderColor #059669 }

package "DC primaire CTDEC (Bamako)" {
  database "PostgreSQL 18\nnina_aes_db + keycloak" as PG
  database "Redis 8.6\nsessions USSD + cache" as Redis
  component "MinIO interne\nbucket: nina-documents" as MinIO1

  component "K3s CronJob\nbackup-postgres-daily\n@ 02:00 UTC" as Cron1
  component "K3s CronJob\nbackup-redis-snapshot\n@ 02:15 UTC" as Cron2
  component "pgBackRest 2.55" as PBR

  component "Vault 2.0.1\nTransit: backup-key v3\n(rotation 90j)" as Vault
}

cloud "DC secondaire AES\n(Ouagadougou ou Niamey)" {
  component "MinIO secondaire\nbucket: nina-backups-mirror" as MinIO2
}

cloud "Cold storage off-site\n(souverain EU/AF)" {
  component "Scaleway Paris\nou OVH Strasbourg\nou Cellar souverain" as Cold
}

PG    --> PBR : pg_dump + WAL archive
Redis --> Cron2 : rdb + aof
Cron1 --> PBR
PBR   --> Vault : encrypt AES-256-GCM
PBR   --> MinIO1 : push backups-bucket/postgres/...
Cron2 --> MinIO1 : push backups-bucket/redis/...

MinIO1 --> MinIO2 : mc replicate\n(async, < 5 min lag)
MinIO1 --> Cold   : mc cp hebdo + mensuel\n(signé Ed25519 + chiffré age)

note bottom of Vault
  La clé Transit "backup-key"
  est ROTATED tous les 90j
  par Vault scheduled rotation.
  Les anciens dumps restent
  déchiffrables (versions
  conservées 7 ans).
end note

note right of MinIO2
  Replication MinIO :
  active-passive (R/W primaire,
  R-only secondaire en mode
  hot-standby pour DR drill).
end note

note right of Cold
  Rétention finale :
  - 7 daily
  - 4 weekly
  - 12 monthly
  - 7 yearly
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Activer le WAL archiving Postgres + pgBackRest

**Pourquoi** : sans WAL archive, on peut restaurer à 02:00 ce matin mais pas à 03:47 ce matin (point
dans le temps). Le WAL archive permet le **Point-In-Time Recovery (PITR)** → RPO < 1 h tenu.

**Fichier(s) à modifier** : `infrastructure/docker/postgres/postgresql.conf` (ajouts),
`pgbackrest.conf`.

```ini
# infrastructure/docker/postgres/postgresql.conf — ajouts
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=nina archive-push %p'
archive_timeout = 60s             # force flush toutes les 60s même si peu d'activité
max_wal_size = 4GB
min_wal_size = 80MB
```

```ini
# infrastructure/pgbackrest/pgbackrest.conf
[global]
repo1-path=/var/lib/pgbackrest
repo1-retention-full=7            # garde 7 full backups (1/jour × 7)
repo1-retention-diff=2

# (CORRECTIF P0 — confidentialité + intégrité) pgBackRest expose `aes-256-cbc`
# comme SEUL cipher-type natif. CBC n'est PAS authentifié (pas d'AEAD) → un dump
# chiffré est MALLÉABLE : un attaquant ayant accès au stockage off-site peut
# permuter/altérer des blocs sans être détecté à ce niveau. Pour NINA-AES (audit
# d'État, anti-ransomware), on NE se contente PAS du chiffrement interne de
# pgBackRest pour la couche off-site : on enveloppe le dump dans une couche
# AEAD authentifiée — `age` (XChaCha20-Poly1305) à l'Étape 4.5, ou
# `gpg --cipher-algo AES256` (qui ajoute un MDC), ou AES-256-GCM via Vault
# Transit. La signature Ed25519 (Étape 4.5) fournit l'intégrité de bout en bout.
# On conserve le cipher interne pgBackRest comme défense en profondeur, mais on
# documente explicitement qu'il NE doit pas être l'unique garantie.
repo1-cipher-type=aes-256-cbc     # couche interne (défense en profondeur) — PAS authentifiée
repo1-cipher-pass-file=/run/secrets/pgbackrest-cipher-pass

# Type S3 (MinIO interne) pour le repo secondaire
repo2-type=s3
repo2-s3-endpoint=minio.nina-aes.svc.cluster.local:9000
repo2-s3-bucket=nina-backups
repo2-s3-region=us-east-1         # string placeholder par défaut de MinIO (PAS un hébergement US) — le stockage reste souverain (MinIO interne CTDEC / EU)
repo2-s3-key=${MINIO_BACKUP_KEY}
repo2-s3-key-secret=${MINIO_BACKUP_SECRET}
repo2-s3-uri-style=path
repo2-cipher-type=aes-256-cbc
# (CORRECTIF P0) Le repo secondaire avait un cipher-type SANS cipher-pass-file :
# pgBackRest aurait refusé le backup ("cipher pass file required"). On fournit
# une passphrase DISTINCTE de repo1 (compromission d'un repo ≠ compromission de
# l'autre). La couche AEAD off-site (Étape 4.5) reste la garantie principale.
repo2-cipher-pass-file=/run/secrets/pgbackrest-cipher-pass-repo2

start-fast=y
process-max=4
log-level-console=info
log-level-file=detail
compress-type=zst                 # zstd : meilleur ratio + plus rapide que gzip

[nina]
pg1-path=/var/lib/postgresql/data
pg1-port=5432
```

> 🔒 **Note crypto (canon sécurité)** : AES-256-**CBC** n'est pas un mode authentifié (AEAD). Le
> livrable annonce du **AES-256-GCM** : c'est la couche applicative (Vault Transit `aes256-gcm96`,
> Étape 4.5bis) + l'enveloppe `age` (XChaCha20-Poly1305) qui la fournissent. Le cipher interne
> pgBackRest (`aes-256-cbc`) est conservé uniquement comme couche additionnelle, jamais comme seul
> rempart. ⏳ Migration éventuelle vers `wal-g` (AEAD natif) en Phase 2.

**Initialiser pgBackRest** (à exécuter 1 fois) :

```bash
# Créer le stanza
docker exec nina-postgres pgbackrest --stanza=nina --log-level-console=info stanza-create

# Vérifier la config
docker exec nina-postgres pgbackrest --stanza=nina check

# 1er full backup
docker exec nina-postgres pgbackrest --stanza=nina --type=full backup
```

---

### Étape 4.2 — CronJob backup quotidien Postgres

**Fichier(s) à créer** : `infrastructure/k8s/cronjobs/backup-postgres.yaml`

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-postgres-daily
  namespace: nina-aes
spec:
  schedule: '0 2 * * *' # 02:00 UTC tous les jours
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 7
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: pgbackrest
              image: pgbackrest/pgbackrest:2.55.0
              command:
                - /bin/bash
                - -c
                - |
                  set -euo pipefail
                  echo "[$(date -u)] start daily full backup"
                  pgbackrest --stanza=nina --type=full backup
                  echo "[$(date -u)] expire old backups"
                  pgbackrest --stanza=nina expire
                  echo "[$(date -u)] backup OK"
              envFrom:
                - secretRef: { name: pgbackrest-secrets }
              volumeMounts:
                - { name: pgdata, mountPath: /var/lib/postgresql/data, readOnly: true }
                - { name: pgbackrest-conf, mountPath: /etc/pgbackrest }
          volumes:
            - { name: pgdata, persistentVolumeClaim: { claimName: nina-postgres-pvc } }
            - { name: pgbackrest-conf, configMap: { name: pgbackrest-conf } }
```

**Job hebdomadaire** (diff backup, plus court) :

```yaml
metadata: { name: backup-postgres-weekly }
spec:
  schedule: '0 3 * * 0' # dimanche 03:00 UTC
  # ... pareil mais type=diff au lieu de full
```

---

### Étape 4.3 — Redis snapshots (RDB + AOF)

**Pourquoi** : les sessions USSD vivent en Redis (TTL 5 min, cf. doc 14). Une perte de Redis =
utilisateurs USSD doivent recommencer leur saisie. Le AOF (Append-Only File) permet une restauration
**fine** (chaque commande journalisée), le RDB un dump périodique.

**Fichier(s) à modifier** : `infrastructure/docker/redis/redis.conf` (ajouts).

```ini
# Persistence RDB (snapshot toutes les 5 min si ≥ 100 changements)
save 300 100
save 60 10000
dbfilename nina-redis.rdb
dir /data
rdbcompression yes
rdbchecksum yes

# Persistence AOF (journal append-only — sécurité maximale)
appendonly yes
appendfilename "nina-appendonly.aof"
appendfsync everysec              # fsync 1x/s : compromis perf/sécurité
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

**CronJob backup Redis** :

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: backup-redis-snapshot, namespace: nina-aes }
spec:
  schedule: '15 2 * * *' # 02:15 UTC
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: redis-backup
              image: redis:8.6.3-alpine
              command:
                - /bin/sh
                - -c
                - |
                  set -e
                  TS=$(date -u +%Y%m%dT%H%M%SZ)
                  redis-cli -h redis BGSAVE
                  # attendre fin BGSAVE
                  while [ "$(redis-cli -h redis LASTSAVE)" = "${LASTSAVE_BEFORE}" ]; do sleep 2; done
                  # copier le RDB et AOF
                  mc cp /data/nina-redis.rdb     minio-internal/nina-backups/redis/${TS}-nina.rdb
                  mc cp /data/nina-appendonly.aof minio-internal/nina-backups/redis/${TS}-nina.aof
                  echo "[$(date -u)] Redis backup OK"
              env:
                - { name: LASTSAVE_BEFORE, value: '0' }
              volumeMounts:
                - { name: redis-data, mountPath: /data }
```

---

### Étape 4.4 — Réplication MinIO bucket

**Pourquoi** : les documents (FDI signées, photos d'identité, scans CNI de pièces justificatives)
sont volumineux et ne tiennent pas dans pg_dump. On utilise la réplication MinIO **native** (mode
`active-passive` : écritures sur DC primaire, miroir async sur DC secondaire).

```bash
# 1) Provisionner les buckets sur les 2 MinIO
#    (CORRECTIF P0 — anti-ransomware) Le bucket de BACKUPS est créé avec
#    Object Lock ACTIVÉ (--with-lock). Object Lock ne peut PAS être activé
#    après coup sur un bucket existant → il faut le poser à la création.
mc mb --with-lock minio-internal/nina-backups
mc mb minio-internal/nina-documents
mc mb minio-secondaire/nina-documents-mirror

# 2) Configurer la cible de réplication
mc admin replicate add \
  minio-internal       minio-secondaire \
  --remote-bucket nina-documents-mirror

# 3) Définir la règle (réplique tout, async)
mc replicate add minio-internal/nina-documents \
  --remote-bucket nina-documents-mirror \
  --priority 1 \
  --replicate "delete,delete-marker,existing-objects" \
  --tags "domain=nina-aes"

# 4) Vérifier
mc replicate ls minio-internal/nina-documents
mc admin replicate status minio-internal
```

**Object Lock (WORM) — contrôle anti-ransomware de base** :

**Pourquoi** : un ransomware (ou un admin compromis) qui chiffre/supprime les backups rend le DRP
inutile. **Object Lock** en mode `COMPLIANCE` rend les objets de backup **immuables** pendant N
jours — **même `root` ne peut pas les supprimer** avant expiration de la rétention. C'est le
contrôle de base WORM (Write-Once-Read-Many) exigé pour un système d'identité d'État.

```bash
# Rétention par défaut sur le bucket de backups : 30 jours en COMPLIANCE.
# COMPLIANCE (vs GOVERNANCE) = même un compte privilégié ne peut PAS lever
# la rétention ni supprimer l'objet avant échéance → protection ransomware.
mc retention set --default COMPLIANCE 30d minio-internal/nina-backups

# Vérifier la politique appliquée
mc retention info minio-internal/nina-backups

# (optionnel) Legal Hold sur un dump "preuve" (litige/audit) — sans échéance
mc legalhold set minio-internal/nina-backups/postgres/2026-XX-XX-full
```

> ⚠️ **Garde-fou rétention** : la durée Object Lock COMPLIANCE doit être ≥ la fenêtre de détection
> d'incident (ici 30j > cycle backup 7j) mais ≤ la rétention métier, sinon le bucket gonfle
> indéfiniment (les objets ne peuvent pas être purgés avant échéance). ⏳ Réplication de l'Object
> Lock vers le DC secondaire = Phase 2 (MinIO propage le lock si le bucket cible est aussi
> `--with-lock`).

**Healthcheck via Prometheus** :

```yaml
# Règle alerting Prometheus (ajout à rules/nina-aes-slo.yml — cf. doc 17)
- alert: MinIOReplicationLag
  expr: minio_replication_lag_seconds > 300
  for: 5m
  labels: { severity: warning }
  annotations:
    summary: 'MinIO replication lag > 5 min — DR drill compromis'
    runbook: 'docs/observability/DRP-RUNBOOK.md#minio-replication-lag'
```

---

### Étape 4.5 — Chiffrement supplémentaire `age` + signature Ed25519 (cold storage)

**Pourquoi** : les dumps poussés vers le cold storage (Scaleway Paris, OVH) quittent le datacenter
CTDEC. Comme le cipher interne pgBackRest est du CBC **non authentifié** (cf. Étape 4.1), on ajoute
une couche **AEAD** `age` (XChaCha20-Poly1305, X25519) **et** une **signature Ed25519** du dump,
pour que (a) seul le porteur de la clé privée puisse déchiffrer et (b) toute altération soit
détectée au restore.

> ⚠️ **Correctif Shamir (confusion levée)** : la clé privée `age` est protégée par un **partage
> Shamir (SSS) de son fichier de clé**, réalisé via un **outil externe dédié** (PAS une
> fonctionnalité native de `age` — `age` n'offre aucun Shamir Secret Sharing intégré de son fichier
> de clé), **et non** par `vault operator generate-root`. Cette dernière commande sert UNIQUEMENT à
> régénérer un **root token Vault** à partir des **unseal/recovery keys de Vault** — elle n'a **rien
> à voir** avec la clé `age` du backup. Les deux mécanismes de Shamir sont distincts : (1) Shamir
> Vault = déverrouiller Vault ; (2) Shamir `age` = reconstituer la clé privée de déchiffrement
> off-site. Ne pas les confondre.

```bash
# Générer une paire de clés age (une fois, à la racine)
age-keygen -o ~/.age/nina-backup.key
# Public key affichée dans stdout — la copier dans Vault KV path:
#   secret/backups/age-public = "age1...."

# Générer une paire Ed25519 pour SIGNER les dumps (signature ≠ chiffrement —
# Ed25519 ne fait QUE de la signature, cf. canon sécurité). Vault Transit ne
# supporte PAS Ed25519 → génération IN-PROCESS via `age`/openssl, clé privée
# elle aussi partagée en Shamir 3/5.
openssl genpkey -algorithm ed25519 -out ~/.age/nina-sign-ed25519.key
openssl pkey -in ~/.age/nina-sign-ed25519.key -pubout -out ~/.age/nina-sign-ed25519.pub
#   secret/backups/sign-ed25519-public = "<base64 SPKI>"

# Découper la clé PRIVÉE age en parts Shamir 3/5 (seuil 3, 5 porteurs)
age-keygen -y ~/.age/nina-backup.key   # vérif : recalcule la pubkey
# (distribution Shamir des fichiers privés via outil dédié — cf. ADR-019)
```

```bash
# CronJob hebdomadaire : signer PUIS chiffrer PUIS pousser vers cold storage
TS=$(date -u +%Y%m%dT%H%M%SZ)
mc cp --recursive minio-internal/nina-backups/postgres/latest/ /tmp/pg-${TS}/
tar czf /tmp/pg-${TS}.tar.gz /tmp/pg-${TS}/

# 1) SIGNER l'archive en clair (Ed25519) → manifeste détaché .sig
openssl pkeyutl -sign \
  -inkey ~/.age/nina-sign-ed25519.key \
  -rawin -in /tmp/pg-${TS}.tar.gz \
  -out /tmp/pg-${TS}.tar.gz.sig

# 2) CHIFFRER (age, AEAD) l'archive ET sa signature
age -r "$(vault kv get -field=age-public secret/backups)" \
  -o /tmp/pg-${TS}.tar.gz.age      /tmp/pg-${TS}.tar.gz
age -r "$(vault kv get -field=age-public secret/backups)" \
  -o /tmp/pg-${TS}.tar.gz.sig.age  /tmp/pg-${TS}.tar.gz.sig

# 3) PUSH off-site (les deux objets)
mc cp /tmp/pg-${TS}.tar.gz.age     scaleway-paris/nina-cold/${TS}.tar.gz.age
mc cp /tmp/pg-${TS}.tar.gz.sig.age scaleway-paris/nina-cold/${TS}.tar.gz.sig.age
```

**Procédure de déchiffrement + vérification de signature (DR drill)** :

```bash
# Reconstituer la clé privée age depuis 3/5 parts Shamir (PAS generate-root)
#   → outil de recombinaison Shamir age, hors-ligne, sur poste admin

# Déchiffrer l'archive ET sa signature
mc cp scaleway-paris/nina-cold/${TS}.tar.gz.age - \
  | age -d -i ~/.age/nina-backup.key > /restore/pg-${TS}.tar.gz
mc cp scaleway-paris/nina-cold/${TS}.tar.gz.sig.age - \
  | age -d -i ~/.age/nina-backup.key > /restore/pg-${TS}.tar.gz.sig

# VÉRIFIER la signature Ed25519 AVANT d'extraire (anti-tampering)
openssl pkeyutl -verify \
  -pubin -inkey ~/.age/nina-sign-ed25519.pub \
  -rawin -in /restore/pg-${TS}.tar.gz \
  -sigfile /restore/pg-${TS}.tar.gz.sig \
  || { echo "[!] Signature invalide — dump altéré, ABORT"; exit 1; }

tar xzf /restore/pg-${TS}.tar.gz -C /restore/
```

**Fonction réutilisée par `restore-test.sh`** (Étape 4.6) :

```bash
# verify_dump_signature <datadir> — vérifie le manifeste .sig Ed25519 du dump
# restauré. Retourne 0 si la signature est valide, 1 sinon.
verify_dump_signature() {
  local datadir="$1"
  local manifest="${datadir}/../dump.tar.gz"
  local sig="${datadir}/../dump.tar.gz.sig"
  [ -f "${sig}" ] || { echo "[!] manifeste .sig absent"; return 1; }
  openssl pkeyutl -verify \
    -pubin -inkey "${HOME}/.age/nina-sign-ed25519.pub" \
    -rawin -in "${manifest}" \
    -sigfile "${sig}"
}
```

---

### Étape 4.5bis — Chiffrement AES-256-GCM via Vault Transit (rotation 90j)

**Pourquoi** : le livrable annonce du **AES-256-GCM** (AEAD) avec **clé Vault Transit rotée tous les
90 jours**. On câble réellement ce moteur — il fournit un chiffrement authentifié pour les artefacts
qui restent dans le périmètre CTDEC (repo MinIO interne), complémentaire à `age` pour l'off-site.

```bash
# 1) Activer le moteur Transit (une fois) + créer la clé de backup AES-256-GCM
vault secrets enable transit
vault write -f transit/keys/backup-key type=aes256-gcm96
#   type=aes256-gcm96 = AES-256 en mode GCM (AEAD authentifié), 96-bit nonce

# 2) Activer la ROTATION AUTOMATIQUE 90 jours (Vault ≥ 1.15 : auto-rotation native ;
#    déployé ici en 2.0.1 — cf. note de drift de version §2)
vault write transit/keys/backup-key/config \
  auto_rotate_period=2160h          # 90 j × 24 h = 2160 h
# Les anciennes versions de clé restent disponibles au déchiffrement
# (min_decryption_version=1) → les vieux dumps restent lisibles 7 ans.
```

```bash
# 3) Chiffrer un artefact (le tar du dump) avec la clé Transit courante
#    Transit chiffre des PETITS blobs (≤ quelques MiB) → on chiffre soit la
#    passphrase pgBackRest (enveloppe), soit un manifeste, pas le dump entier.
#    Pattern recommandé : ENVELOPE ENCRYPTION (Transit chiffre une DEK locale).
DEK=$(openssl rand -base64 32)                       # clé de données éphémère
ENC_DEK=$(vault write -field=ciphertext transit/encrypt/backup-key \
  plaintext="$(printf '%s' "${DEK}" | base64)")      # DEK scellée par Transit
# Chiffrer le dump avec la DEK (AES-256-GCM via openssl), stocker ENC_DEK à côté
printf '%s' "${ENC_DEK}" > /tmp/pg-${TS}.dek.vault

# 4) Au restore : déchiffrer la DEK via Transit, puis le dump
DEK=$(vault write -field=plaintext transit/decrypt/backup-key \
  ciphertext="$(cat /tmp/pg-${TS}.dek.vault)" | base64 -d)
```

> 🔒 **Canon sécurité** : Vault Transit **supporte** `aes256-gcm96` et `rsa-4096`, mais **PAS**
> Ed25519 (cf. ADR-026/034). C'est pourquoi la **signature** des dumps (Étape 4.5) est faite
> **in-process** (`openssl ed25519`), tandis que le **chiffrement** symétrique authentifié passe par
> Transit. La rotation 90j est portée par `auto_rotate_period`, pas par un cron maison.

---

### Étape 4.6 — Script de restore E2E (testé mensuellement)

**Fichier à créer** : `infrastructure/scripts/restore-test.sh`

```bash
#!/usr/bin/env bash
# infrastructure/scripts/restore-test.sh
#
# Test mensuel de restore : spin-up un Postgres container vierge, restore
# le dernier dump pgBackRest dans un data-dir DÉDIÉ ET VIDE, exécute des
# assertions sur les counts et une vérification PARTIELLE de la chaîne de hash
# (hash-chain SHA-256, ADR-007 — la formule exacte est app-side, cf. §4.6).
# Exit 0 si tout OK, exit 1 si une assertion échoue.
#
# Lancement : ./infrastructure/scripts/restore-test.sh

set -euo pipefail

# (CORRECTIF P0) START_TIME doit être initialisé AVANT toute mesure de RTO,
# sinon `$(( ... - START_TIME ))` plante avec `set -u` ("unbound variable").
START_TIME=$(date +%s)

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
TEST_DB_PORT=55432
TEST_CONTAINER="nina-restore-test-${TIMESTAMP}"

# (CORRECTIF P0) On restaure dans un data-dir VIDE et DÉDIÉ au test.
# pgBackRest `restore` REFUSE par défaut d'écraser un répertoire de données
# vivant (présence de PG_VERSION → comportement indéfini / corruption). On crée
# donc un volume hôte vierge et on laisse le conteneur l'initialiser, PUIS on
# vide ce répertoire juste avant le restore (pgBackRest veut un dir vide).
RESTORE_DATADIR="/tmp/restore-test-${TIMESTAMP}/pgdata"
mkdir -p "${RESTORE_DATADIR}"

cleanup() {
  docker rm -f "${TEST_CONTAINER}" >/dev/null 2>&1 || true
  rm -rf "/tmp/restore-test-${TIMESTAMP}"
}
trap cleanup EXIT

echo "[+] Spin-up Postgres container vierge sur port ${TEST_DB_PORT}"
docker run -d --name "${TEST_CONTAINER}" \
  -e POSTGRES_PASSWORD=test-restore \
  -e POSTGRES_USER=nina_admin \
  -e POSTGRES_DB=nina_aes_db \
  -p ${TEST_DB_PORT}:5432 \
  -v "${RESTORE_DATADIR}":/var/lib/postgresql/data \
  postgis/postgis:18-3.6

# attendre que Postgres soit prêt
until docker exec "${TEST_CONTAINER}" pg_isready -U nina_admin; do sleep 2; done

echo "[+] Stop Postgres + purge du data-dir (pgBackRest exige un répertoire vide)"
docker exec "${TEST_CONTAINER}" pg_ctl -D /var/lib/postgresql/data -m fast stop || true
# (CORRECTIF P0) NE JAMAIS restaurer par-dessus un data-dir vivant : on le vide
# d'abord. `--delta` permet à pgBackRest de réconcilier proprement le contenu.
docker exec "${TEST_CONTAINER}" bash -c 'rm -rf /var/lib/postgresql/data/* /var/lib/postgresql/data/.* 2>/dev/null || true'

echo "[+] Restore depuis le dernier full backup pgBackRest (data-dir vide, --delta)"
docker exec "${TEST_CONTAINER}" pgbackrest --stanza=nina \
  --pg1-path=/var/lib/postgresql/data \
  --type=immediate \
  --delta \
  restore

echo "[+] Redémarrer Postgres pour rejouer le recovery sur le data-dir restauré"
docker exec "${TEST_CONTAINER}" pg_ctl -D /var/lib/postgresql/data -w start
until docker exec "${TEST_CONTAINER}" pg_isready -U nina_admin; do sleep 2; done

echo "[+] Vérification : count des tables critiques"
COUNT_REGIONS=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM locations WHERE level=1")
COUNT_CITIZENS=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM citizens")
COUNT_AUDIT=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM audit_logs")

echo "    regions=${COUNT_REGIONS} citizens=${COUNT_CITIZENS} audit=${COUNT_AUDIT}"

if [ "${COUNT_REGIONS}" -lt 20 ]; then
  echo "[!] Pas assez de régions (attendu ≥ 20, trouvé ${COUNT_REGIONS})"
  exit 1
fi

# (CORRECTIF P0 + CANON ADR-007) L'audit NINA-AES est une HASH-CHAIN SHA-256,
# PAS un arbre de Merkle. La fonction `compute_expected_hash(...)` de la version
# initiale n'existe nulle part dans le schéma (fonction fantôme) : elle est
# supprimée. On vérifie ici une PROPRIÉTÉ PARTIELLE en SQL pur, avec les VRAIES
# colonnes du schéma (cf. packages/database/prisma/schema.prisma, model
# AuditLog) :
#   - `id`           : clé d'ordre (BigInt autoincrement) — il N'Y A PAS de `seq` ;
#   - `merkle_hash`  : le hash chaîné de l'entrée courante (PAS `entry_hash`) ;
#   - `previous_hash`: le pointeur vers le hash de l'entrée précédente (PAS `prev_hash`) ;
#   - `payload_hash` : SHA-256 du payload JSON déjà CANONICALISÉ (JCS, RFC 8785)
#                      côté audit-service — il N'Y A PAS de colonne `payload` brute.
#
# Règle ADR-007 : hash(N) = SHA-256( hash(N-1) || serialize(entry(N)) ).
# ⚠️ HONNÊTETÉ : la sérialisation canonique `serialize(entry)` est faite
# CÔTÉ APPLICATION (audit-service, JCS RFC 8785) et n'est PAS reproductible en
# SQL pur. On NE peut donc PAS recalculer `merkle_hash` de bout en bout ici.
# Ce que SQL PEUT vérifier sans l'app, c'est la relation de chaînage entre
# `merkle_hash` déjà persisté et `previous_hash || payload_hash` :
#   merkle_hash(N) == SHA-256( previous_hash(N) || payload_hash(N) )
# Cette forme suppose serialize(entry(N)) ≡ payload_hash(N) ; si l'audit-service
# inclut d'autres champs dans le pré-image, cette vérification est une
# APPROXIMATION (vérification partielle, anti-tampering grossier) — la formule
# exacte vit côté audit-service. ⏳ Reproduction fidèle = Phase 2.
echo "[+] Vérification (PARTIELLE) : cohérence de la hash-chain SHA-256 (ADR-007)"
HASH_CHAIN_OK=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "
  WITH chained AS (
    SELECT
      id,
      merkle_hash,
      previous_hash,
      payload_hash,
      encode(
        digest(
          convert_to(coalesce(previous_hash, '') || payload_hash, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) AS recomputed_hash
    FROM audit_logs
    WHERE created_at > NOW() - INTERVAL '7 days'
    ORDER BY id
  )
  SELECT BOOL_AND(merkle_hash = recomputed_hash)
  FROM chained
")

if [ "${HASH_CHAIN_OK}" != "t" ]; then
  # ⚠️ Un 't' = OK ; un 'f' ou vide PEUT signifier soit une vraie rupture, soit
  # simplement que la pré-image exacte diffère de `previous_hash || payload_hash`
  # (sérialisation app-side). Traiter le résultat comme un signal à corréler,
  # PAS comme une preuve cryptographique autonome — cf. note ⏳ Phase 2 ci-dessus.
  echo "[!] Cohérence hash-chain non confirmée en SQL (rupture OU formule app-side)"
  exit 1
fi
# NB : digest()/encode() exigent l'extension `pgcrypto` (présente dans le schéma
# NINA-AES). La vérification cryptographique EXACTE (sérialisation canonique JCS
# du payload) ne peut être faite QUE par l'audit-service — ⏳ Phase 2.

echo "[+] Vérification : signature Ed25519 des dumps (cf. Étape 4.5)"
# Le manifeste signé accompagne chaque dump ; on vérifie qu'il n'a pas été
# altéré entre le backup et le restore (anti-tampering off-site).
verify_dump_signature "${RESTORE_DATADIR}" || {
  echo "[!] Signature Ed25519 du dump invalide — dump potentiellement altéré"
  exit 1
}

echo "[✓] Restore test OK — RTO mesuré : $(( $(date +%s) - START_TIME )) s"
```

> ⚠️ **Bugs corrigés dans ce script (audit honnêteté soutenance)** : la version initiale (1) ne
> définissait jamais `START_TIME` (crash `set -u` sur la ligne RTO), (2) montait
> `/tmp/restore-test-...` directement comme data-dir et lançait `restore` par-dessus un répertoire
> **vivant** initialisé par l'image Docker — comportement **indéfini** côté pgBackRest, et (3)
> appelait `compute_expected_hash(...)`, une fonction SQL **qui n'existe pas** dans le schéma. La
> requête « corrigée » initiale référençait en outre des colonnes **inexistantes** (`seq`,
> `entry_hash`, `prev_hash`, `payload`) : le schéma réel (`packages/database/prisma/schema.prisma`,
> model `AuditLog`) expose `id`, `merkle_hash`, `previous_hash`, `payload_hash`. La requête a été
> réécrite sur ces vraies colonnes et **présentée honnêtement comme une vérification PARTIELLE** —
> la sérialisation canonique JCS (RFC 8785) qui entre dans le hash est faite **côté audit-service**
> et n'est PAS reproductible en SQL pur. Le terme « Merkle » est par ailleurs incorrect : l'audit
> est une **hash-chain SHA-256** (ADR-007), pas un arbre de Merkle. La fonction
> `verify_dump_signature` est définie à l'Étape 4.5 (signature Ed25519).
>
> ⏳ **Statut réel** : ce script (`infrastructure/scripts/restore-test.sh`) **n'est PAS encore
> committé** — le dépôt ne contient à ce jour que `infrastructure/scripts/seed-locations.sql`. Le
> bloc ci-dessus est le **livrable documentaire / cible Phase 2**, pas un artefact actif.

**CronJob mensuel** :

```yaml
metadata: { name: restore-test-monthly, namespace: nina-aes }
spec:
  schedule: '0 4 1 * *' # 1er du mois, 04:00 UTC
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: restore-test
              image: ghcr.io/nina-aes/restore-test:latest # image qui embarque le script
              command: ['/usr/local/bin/restore-test.sh']
```

L'output est shippé vers Loki (doc 17) — Alertmanager déclenche `RestoreTestFailed` si exit code
≠ 0.

---

### Étape 4.7 — Plan de reprise après sinistre (DRP)

**Fichier à créer** : `docs/observability/DRP-RUNBOOK.md`

````markdown
# DRP RUNBOOK — Disaster Recovery Plan NINA-AES

> **RTO cible** : < 4 h · **RPO cible** : < 1 h

## Scénario A — Crash Postgres primaire (perte totale du nœud)

**Détection** : alerte `ServiceDown` sur `postgres-exporter` ; le service identity-service retourne
5xx massivement.

**Procédure (durée cible 90 min)** :

1. **T+0** : déclencher la cellule de crise (CISO CTDEC + DBA on-call).
2. **T+5** : isoler le nœud crashé (`kubectl cordon node-postgres-primary`).
3. **T+10** : provisionner un nouveau pod Postgres (`postgis/postgis:18-3.6`) sur un nœud sain
   (StatefulSet `nina-postgres` → replica 2 mais nous utilisons 1 — donc on créé un manifest
   temporaire).
4. **T+15** : exécuter le restore pgBackRest :
   ```bash
   pgbackrest --stanza=nina --type=time --target="2026-MM-DD HH:MM:SS UTC" restore
   ```
````

5. **T+45** : start Postgres en mode recovery, attendre `pg_is_in_recovery() = f`.
6. **T+60** : valider intégrité (`SELECT COUNT(*) FROM citizens`, etc.).
7. **T+75** : repointer les services NestJS vers le nouveau pod (mise à jour `DATABASE_URL` via
   Vault dynamic secret).
8. **T+85** : smoke test API (`curl /api/nina/health`).
9. **T+90** : déclarer la reprise. RTO = 90 min < 4 h cible.

## Scénario B — Perte du DC primaire (sinistre majeur)

**Hypothèse** : le datacenter CTDEC Bamako est inaccessible (incendie, coupure réseau prolongée,
saisie). On bascule sur le DC secondaire AES (Ouagadougou/Niamey) + le cold storage souverain.

**RTO cible** : < 4 h · **RPO** : ≤ lag de réplication MinIO (< 5 min pour les documents) + ≤ 1 h
pour Postgres (dernier WAL archivé poussé off-site). On accepte donc un **RPO ≤ 1 h** dominé par la
fenêtre d'archivage WAL vers le repo secondaire/cold.

**Procédure (durée cible 210 min)** :

1. **T+0** : la cellule de crise constate la perte du DC primaire (aucune sonde ne répond, MinIO
   primaire injoignable). Déclencher le plan « DC down » (CISO + DBA + réseau + direction CTDEC).
2. **T+15** : activer le DC secondaire AES. Promouvoir le MinIO secondaire (`nina-backups-mirror` /
   `nina-documents-mirror`) de `R-only` hot-standby vers `R/W` (`mc admin replicate resync`
   interrompu, bucket repassé en écriture).
3. **T+30** : récupérer le dernier dump Postgres valide. Priorité : repo secondaire S3 (MinIO
   interne répliqué) ; à défaut, cold storage off-site (`scaleway-paris/nina-cold/<TS>.tar.gz.age`).
4. **T+45** : **vérifier la signature Ed25519** du dump (Étape 4.5) AVANT restore — un dump altéré
   doit être rejeté. Déchiffrer (`age` + Shamir 3/5 si cold storage).
5. **T+75** : provisionner un Postgres neuf sur le DC secondaire et **restore PITR** au dernier
   point cohérent :
   ```bash
   pgbackrest --stanza=nina --type=time \
     --target="2026-MM-DD HH:MM:SS UTC" --delta restore
   ```
6. **T+135** : start en mode recovery, attendre `pg_is_in_recovery() = f`, valider l'intégrité
   (counts + hash-chain SHA-256 ADR-007).
7. **T+165** : déployer la stack applicative NestJS sur le DC secondaire, repointer `DATABASE_URL`
   et les endpoints MinIO vers les instances secondaires (via Vault).
8. **T+195** : smoke tests (auth Keycloak, `/health`, lecture d'un document depuis le miroir).
9. **T+210** : déclarer la bascule. **RTO = 210 min < 4 h cible**. Communiquer la fenêtre de RPO
   réelle (entre dernier WAL archivé et incident) aux parties prenantes.

> ⚠️ **Limite honnête (soutenance)** : la promotion du DC secondaire est ici **manuelle** (pas de
> failover automatique). Le passage à un RTO < 30 min nécessite Patroni + réplication streaming (cf.
> §10) — ⏳ **conçu, Phase 2**.

## Scénario C — Corruption du WAL archive (à 03:47 ce matin)

**Hypothèse** : un segment WAL est corrompu (bug disque, écriture partielle, corruption silencieuse)
et le `archive_command` a poussé un WAL invalide. Le restore PITR au-delà du WAL corrompu échoue
(`ERROR: invalid record length` / `WAL segment ... not found`).

**RTO cible** : < 2 h · **RPO** : on perd au pire les transactions **postérieures** au dernier WAL
sain — soit jusqu'à la corruption (≤ 1 h si l'archivage est régulier, `archive_timeout=60s`).

**Procédure (durée cible 90 min)** :

1. **T+0** : `pgbackrest check` ou le restore-test mensuel signale l'échec ; alerte
   `RestoreTestFailed`. **Ne PAS** continuer à archiver par-dessus (figer la situation).
2. **T+10** : identifier le **dernier WAL sain** :
   ```bash
   pgbackrest --stanza=nina info                # liste full/diff + plage WAL
   pgbackrest --stanza=nina --set=<backup> verify  # vérifie checksums repo
   ```
3. **T+25** : choisir la cible PITR **juste AVANT** le WAL corrompu :
   ```bash
   pgbackrest --stanza=nina --type=time \
     --target="2026-MM-DD 03:46:00 UTC" \
     --target-action=promote --delta restore
   ```
   On restaure dans un data-dir **vide et dédié** (jamais par-dessus le vivant — cf. Étape 4.6).
4. **T+45** : start Postgres, vérifier `pg_is_in_recovery() = f` puis la **hash-chain SHA-256**
   (ADR-007) : une rupture de chaîne révèle exactement où la corruption a tronqué l'historique.
5. **T+60** : quantifier la perte (transactions entre 03:46 et l'incident) ; rejouer si possible
   depuis une source applicative (file RabbitMQ `nina.events`, journaux d'enrôlement).
6. **T+75** : **purger les WAL corrompus** du repo et relancer un **full backup propre** pour
   ré-ancrer la chaîne d'archivage :
   ```bash
   pgbackrest --stanza=nina --type=full backup
   ```
7. **T+90** : ré-activer l'archivage, smoke test, déclarer la reprise. **RTO = 90 min < 2 h**.

> 💡 **Prévention** : `rdbchecksum`/`wal` checksums Postgres (`data_checksums=on`)
>
> - `pg_amcheck` weekly (§10) détectent la corruption **avant** qu'elle ne se propage dans 7 jours
>   d'archives. Object Lock COMPLIANCE garantit qu'un WAL sain archivé ne peut pas être écrasé par
>   une version corrompue.

````

---

### Étape 4.8 — Test trimestriel chaos engineering

**Pourquoi** : un DRP non testé est un DRP qui ne marche pas. Une fois par
trimestre, on exécute volontairement un scénario destructif sur staging :

```bash
# Trimestre 1 — Crash node Postgres
kubectl drain node-postgres-primary --ignore-daemonsets --force
# Chronométrer la reprise jusqu'à API healthy

# Trimestre 2 — Corruption d'un segment WAL (volontaire)
docker exec nina-postgres bash -c 'dd if=/dev/urandom of=/var/lib/postgresql/data/pg_wal/0000000100000001 bs=1M count=10'
# → forcer un PITR à T-5min

# Trimestre 3 — Crash MinIO primaire
docker stop nina-minio
# → vérifier que les services NestJS basculent sur MinIO secondaire (réplication asynchrone — perte acceptée < 5min)

# Trimestre 4 — Crash global (perte K3s entière)
# → restore complet depuis cold storage (Scaleway), durée mesurée
````

Le résultat de chaque drill est consigné dans `docs/observability/DRP-DRILL-LOG.md`.

---

## 5. Validation locale

```powershell
# 1) Forcer un backup manuel pgBackRest
kubectl exec -it deploy/postgres -- pgbackrest --stanza=nina --type=full backup

# 2) Lister les backups disponibles
kubectl exec -it deploy/postgres -- pgbackrest --stanza=nina info

# 3) Exécuter le script restore-test
./infrastructure/scripts/restore-test.sh

# 4) Vérifier la réplication MinIO
mc admin replicate status minio-internal
mc replicate ls minio-internal/nina-documents

# 5) Vérifier la chaîne age (chiffrement off-site)
age-keygen -y < ~/.age/nina-backup.key     # check public key valide

# 6) Snapshot Redis manuel
docker exec nina-redis redis-cli BGSAVE
docker exec nina-redis ls -la /data/

# 7) Vérifier le runbook DRP
ls docs/observability/DRP-RUNBOOK.md
```

---

## 6. Pièges courants & dépannage

| Symptôme                                                          | Cause probable                              | Solution                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pgbackrest stanza-create` : `ERROR: archive_command must be set` | Postgres pas configuré pour le WAL archive  | Ajouter `archive_mode=on` + `archive_command=...` dans `postgresql.conf` et redémarrer |
| Backup full quotidien prend > 4 h                                 | Pas de compression / I/O lent               | `compress-type=zst` + provisionner SSD NVMe pour `repo1-path`                          |
| WAL archive disque saturé                                         | Retention pas configurée                    | `repo1-retention-full=7` + `pgbackrest expire` dans le cron                            |
| Restore : `ERROR: WAL segment ... not found`                      | WAL trop ancien purgé avant le full backup  | Toujours vérifier `pgbackrest --stanza=nina check` avant nuit                          |
| MinIO replication stuck                                           | Lien réseau coupé entre les 2 DC            | `mc admin replicate resync start minio-internal --site minio-secondaire`               |
| Redis : AOF fichier > 50 GB                                       | `auto-aof-rewrite-percentage` pas atteint   | `redis-cli BGREWRITEAOF` manuel ; surveiller `aof_pending_rewrite`                     |
| age : `decryption failed`                                         | Clé privée corrompue ou mauvaise            | Vérifier `age-keygen -y < ~/.age/nina-backup.key` → public match                       |
| CronJob backup en `Error` toutes les nuits                        | Secret expiré (rotation Vault)              | Renouveler via `vault kv put secret/backups/...`                                       |
| Test restore-test échoue avec count=0                             | Backup pris avant le seed                   | Décaler le 1er backup post-seed ; ou marquer le test comme « warmup phase »            |
| Cold storage upload échoue intermittemment                        | Bande passante saturée                      | Programmer en heures creuses (02-05 UTC) ; bandwidth-limit `mc --limit 10MiB`          |
| DRP drill T1 dépasse 4 h                                          | Étape manuelle non scriptée                 | Identifier le goulot (souvent : provisionning pod + restore WAL) → automatiser         |
| `restore` : `ERROR: ... directory not empty`                      | Data-dir vivant non purgé avant restore     | Stopper Postgres + vider le data-dir (Étape 4.6) ou ajouter `--delta`                  |
| `mc retention set` : `Object Lock not enabled`                    | Bucket créé sans `--with-lock`              | Recréer le bucket avec `mc mb --with-lock` (lock impossible à activer après coup)      |
| `pgbackrest` : `cipher pass file required`                        | `repoN-cipher-type` sans `cipher-pass-file` | Fournir `repoN-cipher-pass-file` pour CHAQUE repo chiffré (cf. Étape 4.1)              |
| Restore : `Signature invalide — dump altéré`                      | Dump off-site tampered ou mauvaise clé pub  | Rejeter le dump, alerter sécurité ; vérifier `nina-sign-ed25519.pub` (Shamir 3/5)      |
| `vault write transit/encrypt` : `unsupported key type ed25519`    | Tentative de signer via Vault Transit       | Ed25519 NON supporté par Transit → signer in-process (`openssl ed25519`, Étape 4.5)    |

---

## 7. Documentation à produire

- `docs/adr/ADR-019-backup-recovery-strategy.md` — décision pgBackRest + réplication MinIO + cold
  storage age (AEAD) + signature Ed25519 des dumps + Vault Transit AES-256-GCM (rotation 90j) +
  Object Lock COMPLIANCE (anti-ransomware) vs alternatives.
- `docs/observability/DRP-RUNBOOK.md` — 4 scénarios documentés (perte Postgres, perte DC, corruption
  WAL, perte cluster K3s).
- `docs/observability/DRP-DRILL-LOG.md` — registre des tests trimestriels : date, scénario, RTO
  mesuré, points d'amélioration.
- `infrastructure/pgbackrest/README.md` — comment retrouver un dump particulier, comment auditer la
  chaîne de restore.
- Mise à jour `docs/CHANGELOG.md` §17 : livrables backup + DRP.
- Mise à jour `docs/17-MONITORING-OBSERVABILITY.md` §4.6 : ajout des 3 règles d'alerting backup
  (`BackupJobFailed`, `RestoreTestFailed`, `MinIOReplicationLag`).

---

## 8. Mini-rapport d'étape (template)

> ⚠️ **État réel à la date de ce document (honnêteté soutenance)** : AUCUN des artefacts livrables
> ci-dessous n'est encore committé. Le dépôt contient seulement
> `infrastructure/scripts/seed-locations.sql` (PAS `restore-test.sh`),
> `infrastructure/k8s/cronjobs/vault-rotation.yaml` (PAS les CronJobs backup/restore), **aucun**
> `infrastructure/pgbackrest/pgbackrest.conf`, et **aucun** `docs/observability/DRP-RUNBOOK.md`. Le
> template ci-dessous est donc **un modèle à remplir une fois l'implémentation faite** : les
> marqueurs sont mis à `⏳ conçu, Phase 2` tant que l'artefact correspondant n'est pas en place.
> Remplacer par `✅` UNIQUEMENT après exécution réellement vérifiée.

```markdown
### Rapport — Backup & DRP — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **pgBackRest** : ⏳ conçu, Phase 2 — stanza/full backup à initialiser (pgbackrest.conf non
  committé)
- **WAL archive** : ⏳ conçu, Phase 2 — archive_command à activer dans postgresql.conf
- **Redis RDB+AOF** : ⏳ conçu, Phase 2 — redis.conf à durcir (RDB + AOF)
- **MinIO replication** : ⏳ conçu, Phase 2 — règle active-passive à provisionner
- **Cold storage age** : ⏳ conçu, Phase 2 — chiffrement XChaCha20-Poly1305 + signature Ed25519 +
  Shamir `age` 3/5
- **Vault Transit** : ⏳ conçu, Phase 2 — `backup-key` aes256-gcm96 + auto-rotation 90j à câbler
- **Object Lock WORM** : ⏳ conçu, Phase 2 — bucket `nina-backups` COMPLIANCE 30j à créer
- **Rétention** : ⏳ conçu, Phase 2 — politique 7d/4w/12m/7y à configurer
- **Script restore-test** : ⏳ conçu, Phase 2 — `restore-test.sh` non committé (seed-locations.sql
  seul présent)
- **DRP-RUNBOOK** : ⏳ conçu, Phase 2 — `docs/observability/DRP-RUNBOOK.md` non créé
- **DRP-DRILL trimestriel** : ⏳ conçu, Phase 2 — aucun drill exécuté
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** : committer pgbackrest.conf + CronJobs + restore-test.sh + DRP-RUNBOOK
- **Captures jointes** : (à produire après implémentation)
```

---

## 9. Checklist de fin d'étape

> ⚠️ **TOUTES les cases ci-dessous sont l'état CIBLE (Phase 2), pas l'état acquis.** À ce jour,
> aucun des artefacts référencés n'est committé : ni `pgbackrest.conf`, ni les CronJobs
> `backup-postgres-*` / `backup-redis-snapshot` / `restore-test-monthly`, ni `restore-test.sh`, ni
> `DRP-RUNBOOK.md`. Les mentions « actif », « exit 0 sur 7 derniers runs », « opérationnelle »
> décrivent le comportement ATTENDU une fois l'étape réalisée — elles ne doivent PAS être présentées
> comme déjà vérifiées en soutenance.

- [ ] `postgresql.conf` activé pour WAL archive + `archive_mode=on`
- [ ] `pgbackrest.conf` créé avec 2 repos (local + MinIO)
- [ ] `stanza-create` + 1er full backup réussi
- [ ] CronJob `backup-postgres-daily` actif, exit 0 sur 7 derniers runs
- [ ] CronJob `backup-postgres-weekly` (diff) actif
- [ ] Redis configuré RDB + AOF
- [ ] CronJob `backup-redis-snapshot` actif
- [ ] MinIO replication active-passive opérationnelle (lag < 5 min)
- [ ] Bucket `nina-backups` créé avec **Object Lock** + rétention COMPLIANCE 30j (anti-ransomware)
- [ ] Vault Transit `backup-key` (`aes256-gcm96`) créé + `auto_rotate_period=2160h` (90j)
- [ ] Cold storage cible souveraine sélectionnée (Scaleway/OVH/Cellar) + bucket créé
- [ ] Clé `age` générée, publique dans Vault, privée en Shamir `age` 3/5 (≠ Shamir Vault)
- [ ] Clé Ed25519 de **signature des dumps** générée (in-process, pas Transit), privée en Shamir 3/5
- [ ] Script `restore-test.sh` créé (START_TIME initialisé, data-dir vide, hash-chain SHA-256, vérif
      signature Ed25519) et exécuté manuellement avec succès
- [ ] CronJob `restore-test-monthly` actif
- [ ] `DRP-RUNBOOK.md` rédigé avec 4 scénarios
- [ ] `DRP-DRILL-LOG.md` initialisé
- [ ] 3 règles d'alerting Prometheus ajoutées (cf. doc 17)
- [ ] 1er drill trimestriel exécuté → RTO mesuré < 4 h
- [ ] `ADR-019` rédigé
- [ ] `docs/CHANGELOG.md` §17 + `docs/00-README-INDEX.md` mis à jour
- [ ] Tag Git `backup-mvp` posé après validation tutorat
- [ ] Commit conventionnel :
      `feat(backup): pgBackRest + MinIO replication + age cold + DRP + ADR-019`

---

## 10. Pour aller plus loin

- **Patroni + Repmgr** : haute disponibilité Postgres avec failover automatique en < 30 s. Pertinent
  en Phase 2 quand le cluster passe à 3+ nœuds. Réduit RTO de 90 min → 5 min.
- **Continuous Archiving + Logical Replication** : pour propagation AES-cross-pays (Mali → BFA →
  Niger) sans transit de pg_dump complets.
- **Restic / Borg** : alternative tout-en-un (dedup + snapshot + chiffrement
  - remote). Plus simple que pgBackRest mais moins adapté à Postgres pur (manque PITR fin via WAL).
- **immutable backups (S3 Object Lock)** : **contrôle de base CONÇU** (Étape 4.4), non plus
  optionnel — bucket `nina-backups` prévu en COMPLIANCE 30j (⏳ bucket pas encore créé, Phase 2).
  Extension Phase 2 : propager le lock vers le DC secondaire + cold storage, et passer la rétention
  à la durée légale métier.
- **Tape archival LTO-9** : pour rétention > 7 ans à coût marginal (~1 TB = 10 $). Hors scope V1
  (logistique physique CTDEC).
- **Backup vérification via `pg_amcheck`** : intégrité physique des tables
  - index. Compatible Postgres 18, à intégrer dans le cron weekly.
- **Lectures recommandées** :
  - <https://pgbackrest.org/configuration.html>
  - <https://min.io/docs/minio/linux/administration/bucket-replication.html>
  - <https://age-encryption.org/v1>
  - NIST SP 800-34 _Contingency Planning Guide_
  - PostgreSQL High Availability Cookbook (Schönig, 2017)

---

_Document 19 — Version 1.1 (harden : GCM/AEAD, Object Lock WORM, signature Ed25519, hash-chain
SHA-256, DRP B/C, Shamir clarifié) — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
