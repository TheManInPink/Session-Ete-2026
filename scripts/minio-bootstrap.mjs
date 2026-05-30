#!/usr/bin/env node
/**
 * @file        scripts/minio-bootstrap.mjs
 * @description Bootstrap idempotent du MinIO dev pour `pnpm docker:up`.
 *              Attend que le container `nina-minio` soit healthy puis crée
 *              les 4 buckets utilisés par les services + applique les
 *              policies/versioning attendues.
 *
 *              Pendant du script `scripts/vault-bootstrap.mjs` (même
 *              philosophie : Node, idempotent, cross-platform, intégré au
 *              flow `pnpm docker:up`). Remplace l'ancienne sidecar
 *              `minio-init` du docker-compose qui ne créait qu'un seul
 *              bucket et dupliquait `scripts/init-minio.sh` partiellement.
 *
 *              Buckets gérés :
 *                - nina-photos     → photos d'identité (anonymous read en dev)
 *                - nina-documents  → PDFs FDI (versioning activé)
 *                - nina-scans      → actes de naissance scannés
 *                - nina-backups    → dumps pgBackRest
 *
 *              Stratégie d'invocation : `docker exec nina-minio mc ...`
 *              (le client mc est embarqué dans l'image MinIO serveur, pas
 *              besoin d'ajouter le binaire mc côté hôte ni d'introduire
 *              le SDK npm `minio` au root du monorepo). Tous les sous-commandes
 *              mc utilisées sont idempotentes (`--ignore-existing`,
 *              `mc version enable` sur bucket déjà versionné = no-op,
 *              `mc anonymous set download` re-applicable sans erreur).
 *
 *              Utilisation :
 *                pnpm minio:bootstrap   (depuis n'importe où dans le repo)
 *                pnpm docker:up         (l'appelle automatiquement après vault:bootstrap)
 *
 *              Variables d'env (toutes optionnelles) :
 *                MINIO_CONTAINER_NAME  défaut nina-minio
 *                MINIO_ROOT_USER       défaut nina_minio_admin
 *                MINIO_ROOT_PASSWORD   défaut minio_dev_2026!
 *                MINIO_HEALTH_URL      défaut http://localhost:9000/minio/health/live
 *                LOG_LEVEL             info|debug (défaut info)
 *
 * @author      Étudiant UQAR
 * @date        2026
 */

import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CONTAINER = process.env.MINIO_CONTAINER_NAME || 'nina-minio';
const ROOT_USER = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'nina_minio_admin';
const ROOT_PASS =
  process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minio_dev_2026!';
const HEALTH_URL = process.env.MINIO_HEALTH_URL || 'http://localhost:9000/minio/health/live';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const log = (msg) => console.log(`\x1b[32m[minio-bootstrap]\x1b[0m ${msg}`);
const debug = (msg) =>
  LOG_LEVEL === 'debug' && console.log(`\x1b[90m[minio-bootstrap] ${msg}\x1b[0m`);
const warn = (msg) => console.warn(`\x1b[33m[minio-bootstrap] ⚠️  ${msg}\x1b[0m`);
const die = (msg, code = 1) => {
  console.error(`\x1b[31m[minio-bootstrap] ❌ ${msg}\x1b[0m`);
  process.exit(code);
};

/**
 * Exécute `docker exec <container> mc <args>` et retourne stdout.
 * `throwOnFail=false` permet aux callers de gérer eux-mêmes l'erreur
 * (utile pour les commandes idempotentes dont l'échec « déjà fait »
 * n'est pas une erreur).
 */
function mc(args, { throwOnFail = true } = {}) {
  debug(`mc ${args.join(' ')}`);
  const r = spawnSync('docker', ['exec', CONTAINER, 'mc', ...args], {
    encoding: 'utf8',
  });
  if (r.status !== 0 && throwOnFail) {
    throw new Error(`mc ${args.join(' ')} → ${r.status}\n${r.stderr || r.stdout}`);
  }
  return { status: r.status, stdout: r.stdout?.trim() ?? '', stderr: r.stderr?.trim() ?? '' };
}

/** Poll /minio/health/live jusqu'à 60s — laisse MinIO démarrer. */
async function waitForMinio() {
  const deadline = Date.now() + 60_000;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.status === 200) {
        debug(`${HEALTH_URL} → 200`);
        return;
      }
      lastErr = new Error(`status=${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(1000);
  }
  die(`MinIO ${HEALTH_URL} non disponible après 60s : ${lastErr?.message}`);
}

/** Crée ou met à jour l'alias `local` (idempotent — surécrit sans warning). */
function setAlias() {
  const r = mc(['alias', 'set', 'local', 'http://localhost:9000', ROOT_USER, ROOT_PASS]);
  log(`✓ alias mc local configuré (user=${ROOT_USER})`);
  return r;
}

/** Crée un bucket si absent (idempotent via --ignore-existing). */
function ensureBucket(name) {
  mc(['mb', '--ignore-existing', `local/${name}`]);
  log(`✓ bucket local/${name}`);
}

/** Active le versioning sur un bucket (no-op si déjà activé). */
function enableVersioning(name) {
  const r = mc(['version', 'enable', `local/${name}`], { throwOnFail: false });
  if (r.status === 0) {
    log(`✓ versioning activé sur local/${name}`);
  } else {
    debug(`version enable ${name} → ${r.status} (${r.stderr})`);
  }
}

/** Applique une policy anonymous (idempotent — re-applicable). */
function setAnonymousDownload(name) {
  const r = mc(['anonymous', 'set', 'download', `local/${name}`], { throwOnFail: false });
  if (r.status === 0) {
    log(`✓ anonymous read sur local/${name}`);
  } else {
    warn(`anonymous set download ${name} → ${r.status} (${r.stderr})`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  log(`Cible : container ${CONTAINER} (health ${HEALTH_URL})`);
  await waitForMinio();
  log('MinIO accessible');

  setAlias();

  // 4 buckets standards (cf. scripts/init-minio.sh + docs)
  const BUCKETS = ['nina-photos', 'nina-documents', 'nina-scans', 'nina-backups'];
  for (const b of BUCKETS) ensureBucket(b);

  // Versioning sur les PDFs FDI (rollback facile en dev — cf. ADR document-service)
  enableVersioning('nina-documents');

  // Anonymous read sur les photos uniquement (dev seulement — pas de PII directe)
  setAnonymousDownload('nina-photos');

  log('');
  log('✅ Bootstrap terminé');
  log(`   • ${BUCKETS.length} buckets prêts ; versioning sur nina-documents`);
  log(`   • Console : http://localhost:9001  ·  API : http://localhost:9000`);
  log('');
  warn('Anonymous read sur nina-photos = DEV uniquement. En prod, IAM + pre-signed URLs.');
}

main().catch((err) => die(err.message ?? String(err)));
