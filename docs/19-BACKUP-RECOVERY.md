# 19 — Sauvegardes et reprise après sinistre (pg_dump · MinIO réplication · Redis snapshots · DRP)

> **Bloc concerné** : Transversal (tous les blocs A → F) — appliqué dès que PostgreSQL contient des
> données seed/test métier ; durci pour le passage en production. **Prérequis** : documents 00 → 18
> complétés ; HashiCorp Vault opérationnel (doc 15) pour la clé de chiffrement des dumps ; stack
> observabilité (doc 17) pour surveiller les jobs de sauvegarde. **Durée estimée** : 10 à 14 heures
> pour un étudiant seul. **Livrables de cette étape** :
>
> - **pg_dump chiffré quotidien** de `nina_aes_db` + `keycloak` via `pgbackrest 2.55` ou `wal-g 3.1`
>   (Postgres 18 — full + incremental WAL)
> - **Chiffrement AES-256-GCM** des dumps avec clé Vault Transit (rotation 90j)
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
techniquement (les FDI doivent être ré-émises, les RDV reprogrammés, l'audit Merkle reconstruit),
mais **institutionnellement** (perte de confiance, contentieux juridique, agrément ANSSI suspendu).
Trois principes pédagogiques :

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

| Outil                            | Version      | Rôle                                                         |
| -------------------------------- | ------------ | ------------------------------------------------------------ |
| **pgBackRest**                   | `2.55.x`     | Backups Postgres avec full + diff + WAL archive              |
| **wal-g** (alternative)          | `3.1.x`      | Backups + WAL push vers S3-compat, plus léger que pgBackRest |
| **PostgreSQL**                   | `18.x`       | Already running (cf. doc 05 / ADR-005)                       |
| **MinIO**                        | `2025-09-07` | Object storage S3-compat — replication built-in              |
| **mc (MinIO Client)**            | `2025-09`    | CLI mc admin replicate, mc cp                                |
| **Redis**                        | `8.6`        | RDB snapshots + AOF (Append-Only File)                       |
| **HashiCorp Vault**              | `1.20`       | Clé de chiffrement Transit (rotation 90j)                    |
| **age (encryption)**             | `1.2.0`      | Chiffrement fichiers en + de pg_dump natif                   |
| **restic** (alternative)         | `0.18.x`     | Backup tool générique avec dedup + chiffrement               |
| **K3s CronJob**                  | `1.33`       | Orchestration jobs backup quotidiens                         |
| **Prometheus blackbox-exporter** | `0.27`       | Surveillance dispo des endpoints S3 de backup                |

> 🔒 Tous open-source / souverains. age est l'outil de chiffrement recommandé par modern crypto
> (XChaCha20-Poly1305, courbe X25519).

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

  component "Vault 1.20\nTransit: backup-key v3\n(rotation 90j)" as Vault
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
MinIO1 --> Cold   : mc cp hebdo + mensuel\n(chiffré age)

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
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass-file=/run/secrets/pgbackrest-cipher-pass

# Type S3 (MinIO interne) pour le repo secondaire
repo2-type=s3
repo2-s3-endpoint=minio.nina-aes.svc.cluster.local:9000
repo2-s3-bucket=nina-backups
repo2-s3-region=us-east-1
repo2-s3-key=${MINIO_BACKUP_KEY}
repo2-s3-key-secret=${MINIO_BACKUP_SECRET}
repo2-s3-uri-style=path
repo2-cipher-type=aes-256-cbc

start-fast=y
process-max=4
log-level-console=info
log-level-file=detail
compress-type=zst                 # zstd : meilleur ratio + plus rapide que gzip

[nina]
pg1-path=/var/lib/postgresql/data
pg1-port=5432
```

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
              image: redis:8.6-alpine
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

### Étape 4.5 — Chiffrement supplémentaire avec `age` (cold storage)

**Pourquoi** : les dumps poussés vers le cold storage (Scaleway Paris, OVH) quittent le datacenter
CTDEC. Même si pgBackRest chiffre en AES-256-CBC, on ajoute une couche `age` (clé asymétrique) pour
que seul le porteur de la clé privée — distribuée en Shamir's 3/5 aux 5 admins CTDEC — puisse
déchiffrer.

```bash
# Générer une paire de clés age (une fois, à la racine)
age-keygen -o ~/.age/nina-backup.key
# Public key affichée dans stdout — la copier dans Vault KV path:
#   secret/backups/age-public = "age1...."

# CronJob hebdomadaire : push vers cold storage
TS=$(date -u +%Y%m%dT%H%M%SZ)
mc cp --recursive minio-internal/nina-backups/postgres/latest/ /tmp/pg-${TS}/
tar czf - /tmp/pg-${TS}/ \
  | age -r $(vault kv get -field=age-public secret/backups) \
  | mc pipe scaleway-paris/nina-cold/${TS}.tar.gz.age
```

**Procédure de déchiffrement (DR drill)** :

```bash
# Récupérer la clé privée (3/5 admins doivent reconstituer Shamir)
vault operator generate-root -decode=$(cat /tmp/encoded) -otp=$(cat /tmp/otp)

# Déchiffrer
mc cp scaleway-paris/nina-cold/${TS}.tar.gz.age - \
  | age -d -i ~/.age/nina-backup.key \
  | tar xzf - -C /restore/
```

---

### Étape 4.6 — Script de restore E2E (testé mensuellement)

**Fichier à créer** : `infrastructure/scripts/restore-test.sh`

```bash
#!/usr/bin/env bash
# infrastructure/scripts/restore-test.sh
#
# Test mensuel de restore : spin-up un Postgres container vierge, restore
# le dernier dump pgBackRest, exécute des assertions sur les counts et hashes.
# Exit 0 si tout OK, exit 1 si une assertion échoue.
#
# Lancement : ./infrastructure/scripts/restore-test.sh

set -euo pipefail
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
TEST_DB_PORT=55432
TEST_CONTAINER="nina-restore-test-${TIMESTAMP}"

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
  -v "/tmp/restore-test-${TIMESTAMP}":/var/lib/postgresql/data \
  postgis/postgis:18-3.6

# attendre que Postgres soit prêt
until docker exec "${TEST_CONTAINER}" pg_isready -U nina_admin; do sleep 2; done

echo "[+] Restore depuis le dernier full backup pgBackRest"
docker exec "${TEST_CONTAINER}" pgbackrest --stanza=nina \
  --pg1-path=/var/lib/postgresql/data \
  --type=immediate \
  restore

echo "[+] Vérification : count des tables critiques"
COUNT_REGIONS=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM locations WHERE level=1")
COUNT_CITIZENS=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM citizens")
COUNT_AUDIT=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM audit_logs")

echo "    regions=${COUNT_REGIONS} citizens=${COUNT_CITIZENS} audit=${COUNT_AUDIT}"

if [ "${COUNT_REGIONS}" -lt 20 ]; then
  echo "[!] Pas assez de régions (attendu ≥ 20, trouvé ${COUNT_REGIONS})"
  exit 1
fi

echo "[+] Vérification : intégrité chaîne Merkle audit"
HASH_CHAIN_OK=$(docker exec "${TEST_CONTAINER}" psql -U nina_admin -d nina_aes_db -tAc "
  SELECT BOOL_AND(merkle_hash = compute_expected_hash(id, payload, prev_hash))
  FROM audit_logs
  WHERE created_at > NOW() - INTERVAL '7 days'
")

if [ "${HASH_CHAIN_OK}" != "t" ]; then
  echo "[!] Rupture de chaîne Merkle dans le backup restauré"
  exit 1
fi

echo "[✓] Restore test OK — RTO mesuré : $(( $(date +%s) - START_TIME )) s"
```

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

…

## Scénario C — Corruption du WAL archive (à 03:47 ce matin)

…

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

| Symptôme                                                          | Cause probable                             | Solution                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pgbackrest stanza-create` : `ERROR: archive_command must be set` | Postgres pas configuré pour le WAL archive | Ajouter `archive_mode=on` + `archive_command=...` dans `postgresql.conf` et redémarrer |
| Backup full quotidien prend > 4 h                                 | Pas de compression / I/O lent              | `compress-type=zst` + provisionner SSD NVMe pour `repo1-path`                          |
| WAL archive disque saturé                                         | Retention pas configurée                   | `repo1-retention-full=7` + `pgbackrest expire` dans le cron                            |
| Restore : `ERROR: WAL segment ... not found`                      | WAL trop ancien purgé avant le full backup | Toujours vérifier `pgbackrest --stanza=nina check` avant nuit                          |
| MinIO replication stuck                                           | Lien réseau coupé entre les 2 DC           | `mc admin replicate resync start minio-internal --site minio-secondaire`               |
| Redis : AOF fichier > 50 GB                                       | `auto-aof-rewrite-percentage` pas atteint  | `redis-cli BGREWRITEAOF` manuel ; surveiller `aof_pending_rewrite`                     |
| age : `decryption failed`                                         | Clé privée corrompue ou mauvaise           | Vérifier `age-keygen -y < ~/.age/nina-backup.key` → public match                       |
| CronJob backup en `Error` toutes les nuits                        | Secret expiré (rotation Vault)             | Renouveler via `vault kv put secret/backups/...`                                       |
| Test restore-test échoue avec count=0                             | Backup pris avant le seed                  | Décaler le 1er backup post-seed ; ou marquer le test comme « warmup phase »            |
| Cold storage upload échoue intermittemment                        | Bande passante saturée                     | Programmer en heures creuses (02-05 UTC) ; bandwidth-limit `mc --limit 10MiB`          |
| DRP drill T1 dépasse 4 h                                          | Étape manuelle non scriptée                | Identifier le goulot (souvent : provisionning pod + restore WAL) → automatiser         |

---

## 7. Documentation à produire

- `docs/adr/ADR-019-backup-recovery-strategy.md` — décision pgBackRest + réplication MinIO + cold
  storage age vs alternatives.
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

```markdown
### Rapport — Backup & DRP — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **pgBackRest** : ✅ stanza initialisé, full backup quotidien actif
- **WAL archive** : ✅ archive_command pousse vers MinIO, lag < 60 s
- **Redis RDB+AOF** : ✅ snapshots toutes les 5 min, AOF fsync every-second
- **MinIO replication** : ✅ active-passive vers DC secondaire, lag < 5 min
- **Cold storage age** : ✅ chiffré XChaCha20-Poly1305, clé Shamir 3/5
- **Rétention** : 7d/4w/12m/7y configurée et vérifiée
- **Script restore-test** : ✅ vert ; RTO mesuré = X min (< 4 h)
- **DRP-RUNBOOK** : ✅ 4 scénarios documentés
- **DRP-DRILL trimestriel** : 1/4 exécuté
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** : drill Scénario B (perte DC) prévu QQ
- **Captures jointes** : pgbackrest-info.png, minio-replication-status.png, restore-test-success.png
```

---

## 9. Checklist de fin d'étape

- [ ] `postgresql.conf` activé pour WAL archive + `archive_mode=on`
- [ ] `pgbackrest.conf` créé avec 2 repos (local + MinIO)
- [ ] `stanza-create` + 1er full backup réussi
- [ ] CronJob `backup-postgres-daily` actif, exit 0 sur 7 derniers runs
- [ ] CronJob `backup-postgres-weekly` (diff) actif
- [ ] Redis configuré RDB + AOF
- [ ] CronJob `backup-redis-snapshot` actif
- [ ] MinIO replication active-passive opérationnelle (lag < 5 min)
- [ ] Cold storage cible souveraine sélectionnée (Scaleway/OVH/Cellar) + bucket créé
- [ ] Clé `age` générée, publique dans Vault, privée en Shamir 3/5
- [ ] Script `restore-test.sh` créé et exécuté manuellement avec succès
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
- **immutable backups (S3 Object Lock)** : protection contre ransomware — un backup ne peut PAS être
  supprimé pendant N jours, même par root. MinIO supporte via `mc retention set --mode COMPLIANCE`.
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

_Document 19 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
