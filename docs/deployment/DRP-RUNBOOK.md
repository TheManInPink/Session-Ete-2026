# DRP-RUNBOOK.md — Plan de reprise après sinistre NINA-AES (Disaster Recovery Plan)

> **Document actionnable** (à copier-coller sous pression, à 3 h du matin, par une personne
> stressée). Compagnon opérationnel de [`docs/19-BACKUP-RECOVERY.md`](../19-BACKUP-RECOVERY.md) (qui
> décrit la stratégie 3-2-1, pgBackRest, la réplication MinIO, le chiffrement off-site et le câblage
> cron), de
> [`docs/adr/ADR-019-backup-recovery-strategy.md`](../adr/ADR-019-backup-recovery-strategy.md)
> (décision d'architecture backup/restore) et de
> [`docs/adr/ADR-007-merkle-audit.md`](../adr/ADR-007-merkle-audit.md) (hash-chain SHA-256 d'audit,
> vérifiée à chaque restore).
>
> **Audience** : l'étudiant (rôle d'astreinte/DBA on-call de fait), futur CISO CTDEC, équipe SOC,
> direction CTDEC, auditeur ANSSI/OCLEI.
>
> **Pourquoi ce document existe** : un système d'identité d'État qui perd ses données d'enrôlement
> est **irrécupérable** — pas seulement techniquement (FDI à ré-émettre, RDV à reprogrammer,
> hash-chain d'audit à reconstruire), mais **institutionnellement** (perte de confiance,
> contentieux, agrément suspendu). Sous sinistre, **on ne réfléchit pas à la procédure** : on la
> rédige à froid, on l'exécute à chaud. Chaque scénario ci-dessous est une suite d'étapes numérotées
> et minutées.
>
> **RTO cible global** : **< 4 h** (Recovery Time Objective — délai max de remise en service). **RPO
> cible global** : **< 1 h** (Recovery Point Objective — perte de données max acceptable).
>
> **Classification** : `CONFIDENTIEL — DIFFUSION RESTREINTE`. Aucune valeur réelle de secret, token,
> ou coordonnée nominative ici (placeholders uniquement).

> ⏳ **HONNÊTETÉ SOUTENANCE — statut d'implémentation** : à la date de ce document, **aucun** des
> artefacts d'exécution référencés (`infrastructure/pgbackrest/pgbackrest.conf`, CronJobs
> `backup-postgres-*` / `backup-redis-snapshot` / `restore-test-monthly`,
> `infrastructure/scripts/restore-test.sh`) n'est encore committé — le dépôt ne contient à ce jour
> que `infrastructure/scripts/seed-locations.sql` et
> `infrastructure/k8s/cronjobs/vault-rotation.yaml`. Ce runbook est le **livrable documentaire /
> cible Phase 2** : il décrit la procédure **conçue**, pas une chaîne déjà rodée en production. Les
> durées « T+XX » sont des **estimations cibles** à confirmer par les drills trimestriels (§6).
> Chaque bloc non implémenté porte le marqueur ⏳ **« conçu, Phase 2 »**.

---

## 0. Conventions & pré-requis communs (à lire AVANT tout scénario)

**Pourquoi lire cette section d'abord** : tous les scénarios supposent un même point de départ (être
authentifié sur Vault, connaître les chemins de backup, savoir où sont les clés de vérification). On
factorise ici pour ne pas le répéter sous pression.

### 0.1 Le réflexe non négociable : VÉRIFIER LA SIGNATURE AVANT DE RESTAURER

> 🔒 **CANON SÉCURITÉ — règle d'or du DRP** : un dump est un fichier qui a **quitté** la base. Entre
> le `pg_dump` et le `restore`, il a pu transiter par un cold storage off-site, être manipulé par un
> opérateur, ou être ciblé par un attaquant cherchant à **réinjecter des données falsifiées** dans
> le registre d'identité national. **On ne restaure JAMAIS un dump dont la signature Ed25519 n'a pas
> été vérifiée.** Restaurer un dump altéré = corrompre volontairement la source de vérité de l'État.

Rappel du modèle cryptographique (cf. doc 19 §4.5 et CANON projet) :

| Couche                    | Algorithme                                  | Rôle                                                            |
| ------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Chiffrement off-site      | `age` — XChaCha20-Poly1305 (X25519)         | AEAD authentifié, confidentialité hors périmètre CTDEC          |
| Chiffrement in-perimeter  | Vault Transit `aes256-gcm96` (rotation 90j) | AEAD authentifié, enveloppe DEK pour artefacts MinIO interne    |
| **Signature des dumps**   | **Ed25519 (in-process `openssl`)**          | **Intégrité / anti-tampering — vérifiée AVANT chaque restore**  |
| Couche interne pgBackRest | `aes-256-cbc` (NON authentifié)             | Défense en profondeur uniquement — **jamais l'unique garantie** |

> ⚠️ **Ed25519 NE CHIFFRE PAS** : Ed25519 sert **uniquement** à signer (intégrité). Le chiffrement
> est assuré par `age` (off-site) ou Vault Transit AES-256-GCM (in-perimeter). Vault Transit **ne
> supporte PAS** Ed25519 (ADR-026/034) → la signature est faite **in-process** (`openssl ed25519`),
> jamais via Transit. Les deux mécanismes Shamir du projet sont distincts : Shamir **Vault** =
> déverrouiller Vault ; Shamir **`age`** (outil externe, 3/5) = reconstituer la clé privée de
> déchiffrement off-site. Ne pas les confondre.

### 0.2 Fonction réutilisable — vérification de signature Ed25519

```bash
# verify_dump_signature <archive> <sigfile> — vérifie la signature Ed25519 détachée
# d'un dump AVANT toute extraction/restauration (anti-tampering off-site).
#
# La clé PUBLIQUE de signature est publiée dans Vault KV :
#   secret/backups/sign-ed25519-public  (et copie locale ~/.age/nina-sign-ed25519.pub)
# La clé PRIVÉE de signature N'EST JAMAIS sur la machine de restore : seuls les
# dumps ARRIVENT signés. On ne (re)signe pas pendant une reprise.
#
# Retourne 0 si la signature est valide, 1 sinon (=> ABORT du restore).
verify_dump_signature() {
  local archive="$1" sig="$2"
  [ -f "${sig}" ]     || { echo "[!] manifeste .sig absent — ABORT"; return 1; }
  [ -f "${archive}" ] || { echo "[!] archive absente — ABORT";       return 1; }
  openssl pkeyutl -verify \
    -pubin -inkey "${HOME}/.age/nina-sign-ed25519.pub" \
    -rawin -in "${archive}" \
    -sigfile "${sig}" \
    || { echo "[!] Signature Ed25519 INVALIDE — dump altéré, ABORT restore"; return 1; }
  echo "[✓] Signature Ed25519 valide — dump intègre, restore autorisé"
}
```

### 0.3 Fonction réutilisable — déchiffrement off-site (`age` + Shamir 3/5)

```bash
# decrypt_offsite <objet.age> <sortie> — déchiffre un artefact cold storage.
# La clé privée age est reconstituée depuis 3/5 parts Shamir (outil EXTERNE dédié,
# hors-ligne, sur poste admin) — PAS `vault operator generate-root` (qui ne sert
# qu'au root token Vault, rien à voir avec la clé age).
decrypt_offsite() {
  local enc="$1" out="$2"
  # Pré-requis : ~/.age/nina-backup.key reconstitué via recombinaison Shamir age (3 parts/5).
  age -d -i "${HOME}/.age/nina-backup.key" -o "${out}" "${enc}" \
    || { echo "[!] Déchiffrement age échoué — clé incomplète ou objet corrompu"; return 1; }
}
```

### 0.4 Fonction réutilisable — validation d'intégrité de la hash-chain d'audit (ADR-007)

> 🔒 **CANON AUDIT (ADR-007)** : l'audit NINA-AES est une **HASH-CHAIN SHA-256 LINÉAIRE**, **PAS un
> arbre de Merkle**. Règle : `hash(N) = SHA-256( hash(N-1) || serialize(entry(N)) )`. La chaîne
> n'est opposable que si sa **racine est ancrée chez un tiers** (OCLEI / Vérificateur Général).
> Après tout restore, on **revérifie le chaînage** : une rupture révèle exactement où la corruption
> a tronqué l'historique. Colonnes réelles du schéma (`packages/database/prisma/schema.prisma`,
> model `AuditLog`) : `id` (ordre, BigInt autoincr.), `merkle_hash` (hash chaîné courant),
> `previous_hash` (pointeur précédent), `payload_hash` (SHA-256 du payload **déjà canonicalisé**
> JCS/RFC 8785).

```bash
# verify_audit_chain <container> — vérification PARTIELLE de la hash-chain SHA-256.
#
# ⚠️ HONNÊTETÉ : la sérialisation canonique serialize(entry) (JCS RFC 8785) est faite
# CÔTÉ audit-service et N'EST PAS reproductible en SQL pur. SQL peut seulement vérifier
# la relation de chaînage entre merkle_hash persisté et previous_hash || payload_hash :
#   merkle_hash(N) == SHA-256( previous_hash(N) || payload_hash(N) )
# => vérification d'anti-tampering GROSSIÈRE. Un 'f' = rupture POSSIBLE à corréler,
# PAS une preuve cryptographique autonome. Vérification EXACTE = audit-service (⏳ Phase 2).
verify_audit_chain() {
  local container="$1"
  docker exec "${container}" psql -U nina_admin -d nina_aes_db -tAc "
    WITH chained AS (
      SELECT id, merkle_hash,
        encode(digest(convert_to(coalesce(previous_hash,'') || payload_hash,'UTF8'),'sha256'),'hex')
          AS recomputed_hash
      FROM audit_logs ORDER BY id
    )
    SELECT BOOL_AND(merkle_hash = recomputed_hash) FROM chained
  "
  # NB : digest()/encode() exigent l'extension pgcrypto (présente dans le schéma NINA-AES).
}
```

### 0.5 Cellule de crise & matrice d'escalade

| Rôle                        | Responsabilité dans le DRP                                          | Quand l'appeler          |
| --------------------------- | ------------------------------------------------------------------- | ------------------------ |
| **Astreinte / DBA on-call** | Pilote la procédure technique de restore                            | T+0, dès la détection    |
| **CISO CTDEC**              | Valide l'intégrité, autorise la bascule, déclenche la communication | T+0 (scénarios B/C), T+5 |
| **Réseau / Infra**          | Bascule DNS/endpoints, promotion DC secondaire                      | Scénario B (T+15)        |
| **Direction CTDEC**         | Décision politique (annonce publique, suspension de service)        | Scénario B (perte de DC) |
| **OCLEI / Vérif. Gén.**     | Tiers d'ancrage de la racine d'audit — à notifier si chaîne touchée | Scénario C               |

---

## Tableau de bord des scénarios

| #     | Scénario                               | RTO cible | RPO cible | Durée procédure cible | Bascule                          |
| ----- | -------------------------------------- | --------- | --------- | --------------------- | -------------------------------- |
| **A** | Perte PostgreSQL (crash nœud primaire) | < 4 h     | < 1 h     | ~90 min               | In-place (PITR)                  |
| **B** | Perte du datacenter primaire           | < 4 h     | < 1 h     | ~210 min              | DC secondaire AES                |
| **C** | Corruption du journal d'audit          | < 4 h     | < 1 h     | ~90 min               | In-place (PITR avant corruption) |
| **D** | Lag de réplication MinIO               | < 4 h     | < 1 h     | ~60 min               | Resync / promotion miroir        |

> 🔒 **Tenue du RPO < 1 h** : garanti par le WAL archiving Postgres (`archive_timeout=60s`, doc 19
> §4.1) qui permet le Point-In-Time Recovery (PITR), et par la réplication MinIO async (< 5 min de
> lag nominal). Le RPO réel sous sinistre = fenêtre entre le dernier WAL archivé off-site et
> l'incident.

---

## Scénario A — Perte de PostgreSQL (crash total du nœud primaire)

> **RTO cible : < 4 h** · **RPO cible : < 1 h** · Durée procédure cible : ~90 min · Bascule :
> in-place PITR

**Hypothèse** : le nœud PostgreSQL primaire est perdu (panne matérielle, corruption du volume, crash
kernel). MinIO et le reste de la stack sont sains. On restaure **au point dans le temps** le plus
récent possible depuis pgBackRest (full + WAL archive).

**Détection** :

- Alerte `ServiceDown` sur `postgres-exporter` (Prometheus, doc 17).
- `identity-service` / `enrollment-service` retournent des 5xx massifs (pool de connexions mort).
- `kubectl get pods -n nina-aes` montre le pod Postgres en `CrashLoopBackOff` ou `Error`.

### Procédure (durée cible 90 min)

| T+       | Action                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- |
| **T+0**  | Déclencher la cellule de crise (astreinte + CISO CTDEC). Horodater l'incident (RPO de référence).   |
| **T+5**  | Isoler le nœud crashé pour éviter un split-brain : `kubectl cordon node-postgres-primary`.          |
| **T+10** | Vérifier l'intégrité du repo backup AVANT de provisionner : `pgbackrest --stanza=nina check`.       |
| **T+15** | Provisionner un pod Postgres neuf (`postgis/postgis:18-3.6`) sur un nœud sain, **data-dir VIDE**.   |
| **T+20** | **VÉRIFIER LA SIGNATURE Ed25519** du dump le plus récent (§0.2) — ABORT si invalide.                |
| **T+25** | Lancer le restore PITR (voir bloc ci-dessous).                                                      |
| **T+45** | Démarrer Postgres en mode recovery, attendre `pg_is_in_recovery() = f`.                             |
| **T+55** | **Valider l'intégrité** : counts tables critiques + hash-chain d'audit (§0.4).                      |
| **T+75** | Repointer les services NestJS (`DATABASE_URL` via Vault dynamic secret), `kubectl rollout restart`. |
| **T+85** | Smoke test API (`curl -fsS https://<gw>/health` + un enrôlement lecture seule).                     |
| **T+90** | Déclarer la reprise. RTO ≈ 90 min < 4 h cible. **Communiquer** (§A.comm).                           |

```bash
# T+20 — VÉRIFICATION DE SIGNATURE (réflexe §0.1) avant tout restore
verify_dump_signature /restore/pg-latest.tar.gz /restore/pg-latest.tar.gz.sig || exit 1

# T+25 — RESTORE PITR : on restaure dans un data-dir VIDE et DÉDIÉ (jamais par-dessus
# un répertoire vivant — pgBackRest a un comportement indéfini sinon, cf. doc 19 §4.6).
# --type=time : remonte au point cohérent le plus proche AVANT l'incident.
pgbackrest --stanza=nina \
  --pg1-path=/var/lib/postgresql/data \
  --type=time \
  --target="2026-MM-DD HH:MM:SS UTC" \
  --target-action=promote \
  --delta \
  restore
```

```bash
# T+45 — attendre la fin du recovery
psql -U nina_admin -d nina_aes_db -tAc "SELECT pg_is_in_recovery();"   # attendu : f

# T+55 — VALIDATION D'INTÉGRITÉ
psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM citizens;"    # > 0
psql -U nina_admin -d nina_aes_db -tAc "SELECT COUNT(*) FROM audit_logs;"  # cohérent
verify_audit_chain nina-postgres-new   # attendu : t (sinon corréler — cf. Scénario C)
```

### A.comm — Communication

- **Interne** : message cellule de crise « Postgres restauré au point T-Xmin, RPO réel = Xmin,
  services repointés ». Consigner dans le canal incident.
- **Métier (CTDEC)** : si l'indisponibilité a dépassé 15 min, notifier les guichets d'enrôlement
  (les RDV de la fenêtre sont à reprogrammer si des transactions ont été perdues dans le RPO).
- **Audit** : noter l'incident dans le journal d'audit (l'événement de restore est lui-même audité).

---

## Scénario B — Perte du datacenter primaire (sinistre majeur)

> **RTO cible : < 4 h** · **RPO cible : < 1 h** · Durée procédure cible : ~210 min · Bascule : DC
> secondaire AES

**Hypothèse** : le DC CTDEC Bamako est **inaccessible** (incendie, coupure réseau prolongée, saisie,
catastrophe). Aucune sonde primaire ne répond, MinIO primaire injoignable. On bascule sur le **DC
secondaire AES** (Ouagadougou ou Niamey) + le **cold storage souverain** (Scaleway Paris / OVH
Strasbourg / Cellar — jamais AWS/Azure/GCP, CANON souveraineté).

**RPO** : ≤ lag de réplication MinIO (< 5 min pour les documents) **+** ≤ 1 h pour Postgres (dernier
WAL archivé poussé off-site). RPO global dominé par la fenêtre d'archivage WAL → **≤ 1 h** tenu.

**Détection** :

- Effondrement simultané de **toutes** les sondes du DC primaire (Prometheus blackbox, `/health`).
- MinIO primaire (`minio-internal`) injoignable sur tous ses endpoints.
- Confirmation hors-bande (téléphone direction CTDEC) qu'il s'agit bien d'un sinistre DC, pas d'une
  partition réseau transitoire.

### Procédure (durée cible 210 min)

| T+        | Action                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| **T+0**   | Cellule de crise « DC down » : CISO + DBA + Réseau + **Direction CTDEC** (décision politique requise).     |
| **T+15**  | Activer le DC secondaire AES. Promouvoir MinIO secondaire `R-only` hot-standby → `R/W`.                    |
| **T+30**  | Récupérer le dernier dump Postgres valide. Priorité : repo S3 répliqué ; à défaut : cold storage off-site. |
| **T+45**  | **VÉRIFIER LA SIGNATURE Ed25519** (§0.2) AVANT restore. Déchiffrer (`age` + Shamir 3/5 si cold storage).   |
| **T+75**  | Provisionner Postgres neuf sur DC secondaire + **restore PITR** au dernier point cohérent.                 |
| **T+135** | Start recovery, `pg_is_in_recovery() = f`, **valider intégrité** (counts + hash-chain §0.4).               |
| **T+165** | Déployer la stack NestJS sur DC secondaire, repointer `DATABASE_URL` + endpoints MinIO (via Vault).        |
| **T+195** | Smoke tests : auth Keycloak, `/health`, lecture d'un document depuis le miroir MinIO.                      |
| **T+210** | Déclarer la bascule. RTO ≈ 210 min < 4 h. **Communiquer la fenêtre RPO réelle** aux parties prenantes.     |

```bash
# T+15 — Promotion du MinIO secondaire de hot-standby (R-only) vers R/W
mc admin replicate status minio-secondaire        # constater l'état avant promotion
# interrompre la réplication entrante et repasser le bucket en écriture
mc admin replicate rm minio-secondaire minio-internal   # casser le lien (primaire mort)
# (les buckets miroir nina-backups-mirror / nina-documents-mirror deviennent sources)

# T+30/T+45 — Récupérer + déchiffrer + VÉRIFIER le dernier dump depuis le cold storage
TS=<dernier_timestamp_valide>
mc cp scaleway-paris/nina-cold/${TS}.tar.gz.age     /restore/${TS}.tar.gz.age
mc cp scaleway-paris/nina-cold/${TS}.tar.gz.sig.age /restore/${TS}.tar.gz.sig.age
decrypt_offsite /restore/${TS}.tar.gz.age     /restore/${TS}.tar.gz       # age + Shamir 3/5
decrypt_offsite /restore/${TS}.tar.gz.sig.age /restore/${TS}.tar.gz.sig
verify_dump_signature /restore/${TS}.tar.gz /restore/${TS}.tar.gz.sig || exit 1   # ABORT si altéré

# T+75 — RESTORE PITR sur le DC secondaire (data-dir vide + dédié)
tar xzf /restore/${TS}.tar.gz -C /restore/extracted/
pgbackrest --stanza=nina --type=time \
  --target="2026-MM-DD HH:MM:SS UTC" --delta restore
```

> ⚠️ **Limite honnête (soutenance)** : la promotion du DC secondaire est ici **manuelle** (pas de
> failover automatique). Un RTO < 30 min nécessiterait **Patroni + réplication streaming** (doc 19
> §10) — ⏳ **conçu, Phase 2**. La réplication MinIO de l'Object Lock vers le DC secondaire est
> aussi ⏳ Phase 2 (le lock se propage si le bucket cible est `--with-lock`).

### B.comm — Communication

- **Direction CTDEC** : décision d'annonce publique (suspension/dégradation de service à l'échelle
  nationale). Le DBA fournit RTO estimé + RPO réel.
- **OCLEI / Vérificateur Général** : informer que la racine d'audit a été restaurée depuis le DC
  secondaire et **ré-ancrée** ; fournir le hash de racine post-restore pour comparaison avec
  l'ancrage tiers (sécurité ADR-007).
- **Citoyens / guichets** : communiqué via canaux officiels (USSD/SMS dégradé toléré), fenêtre de
  RPO annoncée honnêtement (« transactions des X dernières minutes possiblement à re-soumettre »).

---

## Scénario C — Corruption du journal d'audit (hash-chain / WAL corrompu)

> **RTO cible : < 4 h** (objectif interne ~2 h) · **RPO cible : < 1 h** · Durée procédure cible :
> ~90 min

**Hypothèse** : une rupture de la **hash-chain d'audit SHA-256** (ADR-007) est détectée — soit par
un segment WAL corrompu (bug disque, écriture partielle, corruption silencieuse) que
`archive_command` a poussé, soit par la fonction `verify_audit_chain` qui retourne `f` sur une plage
récente. Le restore PITR au-delà du point corrompu échoue (`ERROR: invalid record length` /
`WAL segment ... not found`), **ou** la chaîne d'audit ne se recalcule plus. C'est le scénario le
plus sensible : l'audit est la **source de vérité opposable** de l'État.

**RPO** : on perd au pire les transactions **postérieures** au dernier point sain — soit jusqu'à la
corruption (≤ 1 h si l'archivage est régulier, `archive_timeout=60s`).

**Détection** :

- `verify_audit_chain` (§0.4) retourne `f` ou vide sur une fenêtre récente.
- `pgbackrest check` / le restore-test mensuel signale l'échec → alerte `RestoreTestFailed`.
- Une rupture de chaîne **après ancrage tiers** : la racine d'audit re-calculée ≠ racine ancrée chez
  OCLEI ⇒ **incident de sécurité majeur** (falsification possible), pas une simple corruption
  disque.

### Procédure (durée cible 90 min)

| T+       | Action                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| **T+0**  | **FIGER la situation** : `archive_mode=off` ou stopper l'archivage. Ne PAS écraser les WAL sains restants.      |
| **T+5**  | Qualifier : corruption disque (bénigne) **vs** rupture de chaîne post-ancrage (incident sécurité → §0.5).       |
| **T+10** | Identifier le **dernier point sain** : `pgbackrest info` + `pgbackrest --set=<backup> verify`.                  |
| **T+20** | **VÉRIFIER LA SIGNATURE Ed25519** du backup full retenu (§0.2) — garantir que la base de restore est intègre.   |
| **T+25** | Restore PITR **juste AVANT** le point corrompu, dans un data-dir vide/dédié (bloc ci-dessous).                  |
| **T+45** | Start Postgres, `pg_is_in_recovery() = f`, puis **re-vérifier la hash-chain** (§0.4) → doit redevenir `t`.      |
| **T+60** | Quantifier la perte (transactions entre le point sain et l'incident). Rejouer si possible (cf. ci-dessous).     |
| **T+75** | **Purger les WAL corrompus** du repo + relancer un **full backup propre** pour ré-ancrer la chaîne d'archivage. |
| **T+90** | Ré-activer l'archivage, smoke test, **ré-ancrer la racine d'audit chez OCLEI**, déclarer la reprise.            |

```bash
# T+10 — Localiser le dernier point sain (plage WAL + checksums du repo)
pgbackrest --stanza=nina info                       # liste full/diff + plages WAL
pgbackrest --stanza=nina --set=<backup_id> verify   # vérifie les checksums du repo

# T+25 — Restore PITR JUSTE AVANT le WAL/segment corrompu (data-dir vide + dédié)
pgbackrest --stanza=nina --type=time \
  --target="2026-MM-DD 03:46:00 UTC" \
  --target-action=promote --delta restore

# T+45 — La hash-chain doit redevenir cohérente ; une rupture résiduelle révèle
# exactement où la corruption a tronqué l'historique.
verify_audit_chain nina-postgres-new                # attendu : t

# T+60 — Rejouer les transactions perdues depuis une source applicative si possible :
#   - file RabbitMQ nina.events (événements métier non encore consommés)
#   - journaux d'enrôlement applicatifs
# (rejeu idempotent uniquement — sinon documenter la perte dans le RPO)

# T+75 — Purger les WAL corrompus + full backup propre pour ré-ancrer l'archivage
pgbackrest --stanza=nina --type=full backup
```

> 🔒 **Ancrage tiers (ADR-007)** : après reconstruction, recalculer la **racine** de la hash-chain
> et la **ré-ancrer chez OCLEI / Vérificateur Général**. Tant que la nouvelle racine n'est pas
> ancrée, la chaîne restaurée n'est **pas opposable**. Si l'ancienne racine ancrée ≠ chaîne
> reconstruite sur une plage **antérieure** à la corruption, c'est la marque d'une **falsification**
> (pas d'une panne) → escalade sécurité, conservation des preuves (Legal Hold MinIO sur les dumps
> concernés).

> 💡 **Prévention** : `data_checksums=on` (Postgres), `rdbchecksum`/WAL checksums, `pg_amcheck`
> weekly (doc 19 §10) détectent la corruption **avant** qu'elle ne se propage dans 7 jours
> d'archives. Object Lock COMPLIANCE garantit qu'un WAL sain archivé ne peut pas être écrasé par une
> version corrompue.

### C.comm — Communication

- **OCLEI / Vérificateur Général** : notification obligatoire — fournir l'ancien hash de racine, le
  nouveau, la plage de transactions affectée. C'est le tiers garant de l'intégrité de l'audit.
- **CISO** : si rupture post-ancrage → ouvrir un dossier d'incident de sécurité (falsification
  possible), pas un simple ticket d'exploitation.
- **Métier** : lister les transactions perdues entre le point sain et l'incident pour re-traitement.

---

## Scénario D — Lag de réplication MinIO (documents non répliqués)

> **RTO cible : < 4 h** · **RPO cible : < 1 h** · Durée procédure cible : ~60 min · Bascule : resync
> / promotion miroir

**Hypothèse** : la réplication MinIO `nina-documents` → `nina-documents-mirror` (et `nina-backups` →
secondaire) accumule du **retard** (lag > 5 min) ou est **bloquée**. Les documents (FDI signées,
photos d'identité, scans justificatifs) écrits sur le primaire **ne sont pas encore** sur le miroir
→ si le DC primaire tombe maintenant (Scénario B), ces objets sont **perdus**. Ce scénario est un
**précurseur** : on le traite pour ne pas violer le RPO en cas de sinistre ultérieur.

**Détection** :

- Alerte Prometheus `MinIOReplicationLag` : `minio_replication_lag_seconds > 300` pendant 5 min
  (règle doc 17 / doc 19 §4.4), `runbook: docs/deployment/DRP-RUNBOOK.md#scenario-d`.
- `mc admin replicate status minio-internal` montre un backlog croissant.

### Procédure (durée cible 60 min)

| T+       | Action                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| **T+0**  | Constater le lag : `mc admin replicate status minio-internal` (taille du backlog, dernière réplication). |
| **T+5**  | Diagnostiquer la cause : lien réseau inter-DC coupé ? saturation bande passante ? miroir plein/down ?    |
| **T+15** | Selon la cause : relancer le lien, libérer de l'espace miroir, ou rétablir le réseau (cf. §D.causes).    |
| **T+25** | Forcer un **resync** du backlog : `mc replicate resync start minio-internal/nina-documents ...`.         |
| **T+45** | **Valider** que le lag retombe < 5 min (`mc admin replicate status`) + comparer les counts d'objets.     |
| **T+55** | Vérifier l'intégrité d'un échantillon (ETag/checksum d'un document récent présent sur les deux sites).   |
| **T+60** | Clore l'incident. Si le lag ne retombe pas → escalade vers reconstruction du miroir (⏳ Phase 2).        |

```bash
# T+0 — État de la réplication et taille du backlog
mc admin replicate status minio-internal
mc replicate ls minio-internal/nina-documents

# T+25 — Relancer la synchro du backlog (réconcilie les objets en retard)
mc replicate resync start minio-internal/nina-documents \
  --remote-bucket nina-documents-mirror
mc admin replicate resync start minio-internal --site minio-secondaire   # repo backups

# T+45 — VALIDATION : le lag doit retomber sous le seuil RPO
mc admin replicate status minio-internal | grep -i lag    # attendu : < 300 s

# T+55 — Contrôle d'intégrité d'un objet témoin (même ETag des deux côtés)
mc stat minio-internal/nina-documents/<objet_recent>
mc stat minio-secondaire/nina-documents-mirror/<objet_recent>
# Les champs ETag / checksum doivent correspondre.
```

### D.causes — Causes fréquentes & remèdes

| Cause                                   | Remède                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Lien réseau inter-DC coupé              | Rétablir le lien, puis `mc admin replicate resync start ... --site ...`       |
| Bande passante saturée (heures pleines) | `mc ... --limit 10MiB` (bandwidth-limit), planifier le rattrapage 02-05 UTC   |
| Miroir secondaire plein                 | Étendre le volume MinIO secondaire / purger les objets expirés hors rétention |
| Miroir down                             | Redémarrer MinIO secondaire, vérifier l'Object Lock avant resync              |

> ⚠️ **Garde-fou RPO** : tant que le lag dépasse 5 min, le **Scénario B est dégradé** — un sinistre
> DC primaire pendant ce lag perd les documents non répliqués. Tant que le lag n'est pas résorbé,
> **geler les opérations critiques** générant de nouveaux documents si possible, et **prioriser** le
> rattrapage. ⏳ La réplication active-active (vs active-passive) réduirait cette fenêtre — Phase 2.

### D.comm — Communication

- **Interne** : alerte SOC « lag MinIO X min, RPO documents dégradé, resync en cours ».
- **Si lag > 1 h non résorbé** : notifier le CISO (le RPO documentaire dépasse alors la cible).

---

## 5. Validation post-reprise (checklist commune à tous les scénarios)

Après **chaque** reprise (A/B/C/D), exécuter cette checklist avant de déclarer l'incident clos :

- [ ] Signature Ed25519 du/des dump(s) restauré(s) **vérifiée** (§0.2) — aucun restore sans cette
      étape.
- [ ] `pg_is_in_recovery()` retourne `f` (recovery terminé).
- [ ] Counts des tables critiques cohérents (`citizens`, `audit_logs`,
      `locations WHERE level=1 ≥ 20`).
- [ ] **Hash-chain d'audit** re-vérifiée (§0.4) → `t` (ou écart **expliqué** et tracé).
- [ ] Racine d'audit **ré-ancrée chez OCLEI** si la chaîne a été touchée (scénarios B/C).
- [ ] Services NestJS repointés (`DATABASE_URL` / endpoints MinIO via Vault) et `rollout` OK.
- [ ] Smoke tests : `/health`, auth Keycloak, un enrôlement lecture, lecture d'un document MinIO.
- [ ] RPO réel **mesuré** (fenêtre dernier point sain → incident) et **communiqué**.
- [ ] RTO réel **mesuré** (T+0 → reprise déclarée) et consigné dans le drill log (§6).
- [ ] Entrée d'audit de l'incident de restore créée (l'opération de reprise est elle-même auditée).
- [ ] Post-mortem planifié (cause racine, point d'amélioration du DRP).

---

## 6. Tests trimestriels (DRP drill) & registre

**Pourquoi** : _un DRP non testé est un DRP qui ne marche pas_. Une fois par trimestre, on exécute
**volontairement** un scénario destructif sur **staging** et on **chronomètre** la reprise. Si on
dépasse le RTO de 4 h, le DRP est **ajusté** (étape goulot identifiée et automatisée).

| Trimestre | Scénario joué                        | Commande d'injection (staging)                                                                         | Cible     |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------- |
| **T1**    | A — crash nœud Postgres              | `kubectl drain node-postgres-primary --ignore-daemonsets --force`                                      | RTO < 4 h |
| **T2**    | C — corruption d'un segment WAL      | `docker exec nina-postgres dd if=/dev/urandom of=/var/lib/postgresql/data/pg_wal/<seg> bs=1M count=10` | RTO < 4 h |
| **T3**    | D — crash MinIO primaire / lag forcé | `docker stop nina-minio` (vérifier bascule miroir, perte < 5 min)                                      | RTO < 4 h |
| **T4**    | B — perte K3s entière (cold restore) | Restore complet depuis cold storage Scaleway (durée mesurée bout-en-bout)                              | RTO < 4 h |

> ⏳ **HONNÊTETÉ** : ces drills sont **conçus** (Phase 2). Aucun n'a encore été exécuté tant que
> `restore-test.sh` et les CronJobs ne sont pas committés. Le registre ci-dessous est le **modèle à
> remplir** après chaque drill réel.

### Drill log (registre — `docs/deployment/DRP-DRILL-LOG.md` ⏳ à initialiser)

```markdown
| Date       | Scénario | RTO mesuré | RPO mesuré | Résultat | Goulot identifié              | Action corrective               |
| ---------- | -------- | ---------- | ---------- | -------- | ----------------------------- | ------------------------------- |
| JJ/MM/2026 | A        | \_\_ min   | \_\_ min   | ✅/❌    | (ex. provisionning pod + WAL) | (ex. scripter le provisionning) |
| JJ/MM/2026 | C        | \_\_ min   | \_\_ min   | ⏳       | —                             | —                               |
```

Chaque drill ship son output vers Loki (doc 17) ; Alertmanager déclenche `RestoreTestFailed` si le
code de sortie ≠ 0. Le registre détaillé vit dans `docs/deployment/DRP-DRILL-LOG.md` (⏳ Phase 2).

---

## 7. Pièges courants & dépannage (DRP)

| Symptôme                                                       | Cause probable                             | Solution                                                                              |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `restore` : `ERROR: ... directory not empty`                   | Data-dir vivant non purgé avant restore    | Stopper Postgres + vider le data-dir dédié, ou ajouter `--delta` (doc 19 §4.6)        |
| Restore : `ERROR: WAL segment ... not found`                   | WAL trop ancien purgé / segment corrompu   | Scénario C : PITR juste avant le segment + `pgbackrest verify`                        |
| `Signature Ed25519 INVALIDE — dump altéré`                     | Dump off-site tampered ou mauvaise clé pub | **ABORT le restore**, alerter sécurité, vérifier `nina-sign-ed25519.pub` (Shamir 3/5) |
| Déchiffrement `age` : `decryption failed`                      | Clé privée incomplète (< 3 parts Shamir)   | Recombiner 3/5 parts via l'outil Shamir externe (pas `vault generate-root`)           |
| `vault write transit/encrypt` : `unsupported key type ed25519` | Tentative de signer via Vault Transit      | Ed25519 NON supporté par Transit → signer in-process (`openssl ed25519`)              |
| Hash-chain `verify_audit_chain` retourne `f`                   | Rupture réelle OU pré-image app-side diff. | Corréler : si post-ancrage OCLEI ≠ → incident sécurité ; sinon Scénario C             |
| MinIO replication stuck (Scénario D)                           | Lien réseau coupé entre les 2 DC           | `mc admin replicate resync start minio-internal --site minio-secondaire`              |
| DRP drill dépasse 4 h                                          | Étape manuelle non scriptée                | Identifier le goulot (souvent provisionning pod + WAL) → automatiser (Phase 2)        |
| Promotion DC secondaire lente (Scénario B)                     | Failover manuel (pas de Patroni)           | ⏳ Phase 2 : Patroni + réplication streaming (RTO → < 30 min)                         |

---

## 8. Références

- [`docs/19-BACKUP-RECOVERY.md`](../19-BACKUP-RECOVERY.md) — stratégie 3-2-1, pgBackRest, MinIO
  replication, chiffrement `age`/Transit, signature Ed25519, Object Lock WORM, câblage cron. **Ce
  runbook est le livrable §4.7 de ce document** (déplacé sous `docs/deployment/`).
- [`docs/adr/ADR-019-backup-recovery-strategy.md`](../adr/ADR-019-backup-recovery-strategy.md) —
  décision d'architecture backup/restore.
- [`docs/adr/ADR-007-merkle-audit.md`](../adr/ADR-007-merkle-audit.md) — hash-chain SHA-256 d'audit
  - ancrage tiers (OCLEI / Vérificateur Général).
- [`docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md`](../adr/ADR-034-security-hardening-vault-mtls-owasp.md)
  — Vault Transit `aes256-gcm96`/`rsa-4096`, **pas** Ed25519.
- [`docs/security/SECURITY-RUNBOOK.md`](../security/SECURITY-RUNBOOK.md) — runbook incident sécurité
  (rotation secrets, révocation) — complémentaire (scénario C escalade sécurité).
- [`docs/security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — modèle de menace (ransomware,
  tampering off-site, falsification d'audit).
- NIST SP 800-34 _Contingency Planning Guide for Federal Information Systems_.
- <https://pgbackrest.org/user-guide.html> ·
  <https://min.io/docs/minio/linux/administration/bucket-replication.html> ·
  <https://age-encryption.org/v1>

---

_DRP-RUNBOOK — Version 1.0 (4 scénarios A/B/C/D · RTO < 4 h / RPO < 1 h · vérif. signature Ed25519
avant restore · validation hash-chain SHA-256 ADR-007 · drills trimestriels) — Juin 2026_ _NINA-AES
Platform — UQAR — CONFIDENTIEL — DIFFUSION RESTREINTE_
