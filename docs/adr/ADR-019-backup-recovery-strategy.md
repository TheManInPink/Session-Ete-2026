# ADR-019 — Stratégie de sauvegarde et reprise après sinistre (pgBackRest + MinIO réplication + age cold storage souverain)

**Statut** : ✅ Accepté **Date** : 2026-05-16 **Décideurs** : Étudiant UQAR
(solo) **Contexte document** : [19 — Backup & Recovery](../19-BACKUP-RECOVERY.md)
**Complète** : [ADR-005 — PostgreSQL](./ADR-005-postgresql.md),
[ADR-010 — Infrastructure Docker Compose](./ADR-010-infrastructure-docker-compose.md),
[ADR-014 — Audit event-driven append-only](./ADR-014-audit-event-driven-append-only.md),
[ADR-017 — Observabilité LGTM](./ADR-017-observabilite-lgtm-stack.md)

---

## Contexte

NINA-AES Platform stocke des **données d'identité d'État** (~11 millions
de fiches NINA prévues à terme, chaîne Merkle d'audit append-only,
documents officiels FDI signés JWS Ed25519). Une perte de ces données est
**institutionnellement irrécupérable** :

- Les FDI émises avec QR JWT signés deviennent invérifiables
  (la clé privée CTDEC n'existe qu'en Vault — perdue avec lui = invalides)
- La chaîne Merkle d'audit (ADR-014) ne peut être reconstruite
  partiellement ; toute corruption = perte de la traçabilité légale 10 ans
- Les enrôlements RAVEC en cours perdent leur statut (vulnérables doivent
  recommencer ; agents mobiles perdent leurs files prioritaires)

Trois exigences fondamentales :

1. **RTO (Recovery Time Objective) < 4 h** : reprise du service public
   en moins de 4 h après n'importe quel sinistre (crash nœud, perte DC,
   corruption WAL, ransomware).
2. **RPO (Recovery Point Objective) < 1 h** : maximum 1 h de données
   perdues. Nécessite WAL archive avec flush ≤ 60 s.
3. **Souveraineté numérique absolue** : aucune copie de données NINA ne
   doit transiter par AWS, Azure, GCP, Backblaze (US). Stockage off-site
   uniquement EU souverain (Scaleway, OVH, Clever Cloud) ou AF
   (autre DC AES si disponible).

Contraintes pratiques :

- **Étudiant solo** : pas d'équipe SRE 24/7. Le DRP doit être
  exécutable par 1 personne avec un runbook clair.
- **Coût marginal** : storage souverain ~10-20 €/mois pour 100 GB en
  V1. Tenable sur budget projet universitaire.
- **K3s on-premise** : pas de managed Postgres avec backup automatique
  type RDS. On gère tout nous-mêmes.

---

## Décision

Stratégie 3-2-1 multi-couches :

1. **PostgreSQL — pgBackRest 2.55 + WAL archive**
   - **Full backup quotidien** (02:00 UTC) via CronJob K3s.
   - **Diff backup hebdomadaire** (dimanche 03:00 UTC).
   - **WAL archive continu** : `archive_command` + `archive_timeout=60s`
     → RPO < 1 h garanti.
   - **Chiffrement AES-256-CBC** natif pgBackRest, clé dans Vault.
   - **Rétention** : 7 full quotidiens + 4 diff hebdo + 12 mensuels + 7
     annuels (grand-père/père/fils classique).

2. **MinIO documents — réplication active-passive**
   - Bucket `nina-documents` (DC primaire CTDEC Bamako) répliqué async
     vers DC secondaire AES (Ouagadougou ou Niamey).
   - Lag cible < 5 min, surveillé via alerte Prometheus
     `MinIOReplicationLag`.

3. **Redis — RDB + AOF**
   - RDB snapshot toutes les 5 min si ≥ 100 changements.
   - AOF (Append-Only File) `appendfsync everysec` → perte max 1 s en
     cas de crash.
   - Backup quotidien des 2 fichiers vers MinIO interne.

4. **Cold storage off-site — chiffrement `age` (XChaCha20)**
   - Push hebdomadaire vers Scaleway Paris (ou OVH Strasbourg ou
     Cellar) du backup pgBackRest + MinIO snapshot agrégé.
   - Chiffrement supplémentaire avec **age** (modern crypto X25519).
     Clé privée distribuée en Shamir's Secret Sharing 3/5 aux admins
     CTDEC.

5. **Test restore E2E mensuel**
   - CronJob K3s lance `restore-test.sh` qui :
     1. Spin-up un Postgres container vierge
     2. Restore le dernier backup pgBackRest
     3. Vérifie counts + intégrité Merkle audit
     4. Logge le RTO mesuré dans Loki
   - Exit code ≠ 0 → alerte `RestoreTestFailed` critique.

6. **DRP drills trimestriels**
   - Chaque trimestre, exécution d'un scénario destructif sur staging :
     crash node, corruption WAL, perte MinIO, perte cluster K3s.
   - RTO mesuré et consigné dans `DRP-DRILL-LOG.md`.

7. **Runbook `DRP-RUNBOOK.md`**
   - 4 scénarios documentés step-by-step (T+0 → T+90 min).
   - Cible : qu'un admin sans contexte puisse exécuter sous 4 h.

---

## Conséquences positives

- **Triple redondance des données** : DB primaire + MinIO interne + DC
  secondaire AES + cold storage souverain = 4 copies, aucun single
  point of failure.
- **PITR fin** : WAL archive + pgBackRest restore `--type=time
  --target="..."` → restauration à n'importe quelle minute des 7 derniers
  jours.
- **RTO testé, pas postulé** : test restore mensuel automatique +
  drills trimestriels avec mesure. Pas de surprise le jour J.
- **Chiffrement défense en profondeur** : (a) AES-256-CBC pgBackRest
  natif, (b) age XChaCha20 sur cold storage, (c) Shamir 3/5 sur la clé
  age. Compromettre une couche ne suffit pas.
- **Souveraineté préservée** : 0 octet de NINA ne sort jamais de
  juridiction EU/AF. Pas de S3 AWS, pas de Backblaze US.
- **Coût maîtrisé** : Scaleway Paris ~10 €/100 GB/mois ; pgBackRest +
  MinIO + age = tous open-source. Tenable sur budget UQAR.
- **Conforme audit** : le DRP-RUNBOOK + DRILL-LOG démontrent à un
  auditeur ANSSI que la procédure existe, est testée, et est
  exécutable.

---

## Conséquences négatives

- **Complexité opérationnelle** : 4 CronJobs K3s + 2 buckets MinIO + 1
  cold storage + Vault PKI/Transit + Shamir keys. Courbe
  d'apprentissage ~5 jours étudiant solo.
- **Coût stockage cold** : ~10 €/mois pour 100 GB en V1 ; ~50 €/mois
  pour 1 TB en V2 (échelle production). À budgéter.
- **Restore complet long** : un full restore PostgreSQL avec 11M de
  citoyens prendrait ~2 h en V2 (lecture I/O + replay WAL). RTO 4 h
  tient mais c'est serré — optimisation via parallèle restore
  pgBackRest.
- **Drill trimestriel demande discipline** : sans intégration au
  calendrier scolaire / institutionnel, ça glisse. Mitigation : ticket
  Jira récurrent + chip dans GitHub Issues.
- **Shamir's distribution complexe** : 5 admins CTDEC doivent stocker
  leur part dans un coffre physique distinct, formation requise. Pas un
  défaut, mais une mise en œuvre lourde.

---

## Note sur la souveraineté numérique

Le risque principal est la **tentation Backblaze B2 ou Wasabi** pour le
cold storage (peu chers, S3-compatible, mais hébergés US). Le projet
NINA-AES interdit cette bascule :

1. **Liste blanche cold storage** : Scaleway Object Storage Paris (FR),
   OVH Object Storage Strasbourg (FR), Cellar Clever Cloud (FR),
   MinIO secondaire CTDEC ou AES. **Aucun autre**.
2. **Chiffrement double-couche** : même si le provider est souverain,
   on chiffre avec `age` côté client. Le provider ne voit que des
   octets aléatoires.
3. **Clé privée Shamir 3/5** : seuls 3 admins CTDEC simultanément
   peuvent déchiffrer. Aucun provider, aucun gouvernement étranger ne
   peut décrypter avec une demande judiciaire au seul Scaleway/OVH.
4. **Pas de Veeam / Acronis SaaS** : excluent par licence propriétaire
   + opérateur US/RU. Stack 100 % open-source.

Pour un déploiement gouvernemental réel, la recommandation est de
provisionner un 2ᵉ MinIO sur datacenter AES (Ouagadougou ou Niamey) et
de retirer complètement le cold storage tiers — autosuffisance totale.

---

## Alternatives rejetées

- **AWS RDS automated backups** : managed Postgres, backup automatique
  inclus. Rejeté par souveraineté (US). De toute façon incompatible
  avec K3s on-premise.

- **Backblaze B2** (cold storage) : pas cher (~5 $/TB/mois), S3-compat.
  Rejeté car hébergé US (Californie). Données NINA passeraient sous
  juridiction CLOUD Act.

- **Wasabi** (idem) : pas cher, hébergé US. Mêmes raisons de rejet.

- **Veeam Backup & Replication** : excellent produit entreprise, mais
  (a) licence propriétaire payante, (b) éditeur US (Veeam Software),
  (c) sur-dimensionné pour un projet universitaire.

- **Bareos / Bacula** (open-source enterprise backup) : pertinent mais
  (a) configuration XML/INI complexe, (b) pas de PITR Postgres natif —
  passe par `pg_dump` complet, donc RPO ~1 jour minimum, (c) écosystème
  vieillissant.

- **pg_dump simple via cron** (sans pgBackRest) : option « rapide » mais
  (a) pas de WAL archive = RPO 24 h minimum, (b) pas de full+diff
  efficace = bcp d'espace gaspillé, (c) pas de check intégrité
  automatique. Insuffisant pour données d'État.

- **Restic seul** (dedup + chiffrement + remote) : bon outil générique
  mais (a) pas adapté à Postgres en hot mode, nécessite arrêt service
  ou snapshot LVM, (b) PITR fin impossible. Acceptable en Phase 2 pour
  les volumes K8s génériques, pas pour la DB elle-même.

- **Snapshot Volume LVM / ZFS** : COW snapshots du volume Postgres.
  Rapide mais (a) ne capture pas l'état logique de Postgres (risque de
  corruption si dirty pages non flushed), (b) pas de PITR au niveau
  transaction. Complément possible, pas remplacement.

- **No off-site backup** (« le bucket MinIO interne suffit ») : option
  honnête en MVP universitaire. Rejetée car incompatible avec la 3-2-1
  rule et avec un agrément ANSSI/OCLEI réel.

- **Réplication synchrone Postgres** (streaming replication) :
  excellente pour la HA, mais ce n'est pas un backup — une corruption
  logique se propage instantanément aux réplicas. À utiliser EN PLUS
  des backups, pas À LA PLACE (cf. doc 19 §10 Patroni).

---

## Suivi

Métriques à observer pendant les 4 semaines suivant l'activation :

| Métrique                                                | Cible                | Outil de mesure                                    |
| ------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Backup quotidien réussi                                 | 100 % (30/30)        | CronJob status K3s + alerte `BackupJobFailed`     |
| Lag WAL archive                                         | < 60 s               | `pg_stat_archiver` query nightly                   |
| Lag MinIO replication                                   | < 5 min p95          | `minio_replication_lag_seconds` Prometheus        |
| Restore test mensuel                                    | RTO mesuré < 30 min  | Loki query `restore-test logs`                     |
| Chiffrement vérifié                                     | 100 % backups age-encrypted | manuel — `file *.tar.gz.age` retourne `data` |
| Espace disque cold storage                              | < quota + 10 %       | API Scaleway/OVH usage                             |
| DRP drill trimestriel exécuté                           | 1/trimestre          | `DRP-DRILL-LOG.md`                                 |
| RTO mesuré au DRP drill                                 | < 4 h                | log drill                                          |
| RPO mesuré au DRP drill                                 | < 1 h                | log drill                                          |
| Clé age accessible (3/5 Shamir reconstituable)          | 100 %                | test trimestriel reconstruction sandbox            |

Si **RTO mesuré dépasse 4 h** lors d'un drill, ou si **3 backups
consécutifs échouent**, déclencher une revue ADR (créer ADR-019-bis ou
amender avec « Révision YYYY-MM-DD »).
