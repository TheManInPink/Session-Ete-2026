#!/usr/bin/env node
/**
 * @file        scripts/vault-bootstrap.mjs
 * @description Bootstrap idempotent du Vault dev pour `pnpm docker:up`.
 *              Active les engines `kv-v2` et `transit`, puis seed les
 *              secrets minimaux requis par les services actuellement
 *              implémentés (auth-service + document-service).
 *
 *              Conçu pour fonctionner AVEC le mode dev (Vault inmem,
 *              perdu à chaque restart du container) : ré-exécuté
 *              automatiquement après `docker:up`, il restaure tout en
 *              ~2 secondes sans casser un Vault déjà seedé.
 *
 *              Secrets gérés :
 *                - kv/data/auth/jwt              → {private_pem, public_pem, kid}
 *                  consommé par services/auth-service/src/vault/vault.service.ts
 *                - transit/keys/auth-mfa-secret  → AES-256-GCM96 (TOTP MFA)
 *                  consommé via VAULT_TRANSIT_MFA_KEY
 *                - transit/keys/nina-qr-signing  → RSA-3072 non exportable
 *                  signature des QR FDI (ADR-026)
 *
 *              Le script `infrastructure/vault/seed-secrets.sh` reste
 *              l'oracle pour le seed COMPLET (incluant Keycloak, MinIO,
 *              database creds, SIGAC) — invoqué manuellement quand ces
 *              services sont effectivement câblés.
 *
 *              Utilisation :
 *                pnpm vault:bootstrap   (depuis n'importe où dans le repo)
 *                pnpm docker:up         (l'appelle automatiquement)
 *
 *              Variables d'env (toutes optionnelles) :
 *                VAULT_ADDR    défaut http://localhost:8200
 *                VAULT_TOKEN   défaut nina-dev
 *                LOG_LEVEL     info|debug (défaut info)
 *
 * @author      Étudiant UQAR
 * @date        2026
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const VAULT_ADDR = process.env.VAULT_ADDR || 'http://localhost:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || 'nina-dev';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const log = (msg) => console.log(`\x1b[32m[vault-bootstrap]\x1b[0m ${msg}`);
const debug = (msg) =>
  LOG_LEVEL === 'debug' && console.log(`\x1b[90m[vault-bootstrap] ${msg}\x1b[0m`);
const warn = (msg) => console.warn(`\x1b[33m[vault-bootstrap] ⚠️  ${msg}\x1b[0m`);
const die = (msg, code = 1) => {
  console.error(`\x1b[31m[vault-bootstrap] ❌ ${msg}\x1b[0m`);
  process.exit(code);
};

/**
 * Appel HTTP brut vers l'API Vault. Lève si HTTP >=400 sauf si
 * `allowedStatuses` contient le code (utile pour les checks `key exists`
 * qui renvoient 404).
 */
async function vault(method, path, body, allowedStatuses = []) {
  const url = `${VAULT_ADDR}/v1/${path}`;
  debug(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: {
      'X-Vault-Token': VAULT_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (res.status >= 400 && !allowedStatuses.includes(res.status)) {
    throw new Error(`Vault ${method} ${path} → ${res.status} ${text}`);
  }
  if (allowedStatuses.includes(res.status)) return { _status: res.status };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Poll /v1/sys/health jusqu'à 60 s pour laisser Vault démarrer. */
async function waitForVault() {
  const deadline = Date.now() + 60_000;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${VAULT_ADDR}/v1/sys/health`);
      // 200 = initialisé + unsealed + active ; 429 = standby ; 472/473 = standby DR
      if ([200, 429, 472, 473].includes(res.status)) {
        debug(`/sys/health → ${res.status}`);
        return;
      }
      lastErr = new Error(`status=${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(1000);
  }
  die(`Vault ${VAULT_ADDR} non disponible après 60s : ${lastErr?.message}`);
}

/**
 * Active un secrets engine. Vault renvoie 400 si déjà monté — on l'ignore.
 * @returns true si nouvellement activé, false si déjà présent.
 */
async function ensureEngine(path, type, options = {}) {
  const result = await vault('POST', `sys/mounts/${path}`, { type, options }, [400]);
  if (result?._status === 400) {
    debug(`engine ${path}/ déjà actif`);
    return false;
  }
  log(`✓ engine ${type} monté sur ${path}/`);
  return true;
}

/** Lit un secret KV v2. Retourne null si 404. */
async function readKv(mount, path) {
  const r = await vault('GET', `${mount}/data/${path}`, null, [404]);
  return r?._status === 404 ? null : r?.data?.data;
}

/** Écrit un secret KV v2 (overwrite, idempotent). */
async function writeKv(mount, path, data) {
  await vault('POST', `${mount}/data/${path}`, { data });
}

/** Existe ? (transit keys, idempotent check) */
async function transitKeyExists(name) {
  const r = await vault('GET', `transit/keys/${name}`, null, [404]);
  return r?._status !== 404;
}

/** Crée une clé Transit si absente. */
async function ensureTransitKey(name, params) {
  if (await transitKeyExists(name)) {
    debug(`transit/keys/${name} déjà présente`);
    return false;
  }
  await vault('POST', `transit/keys/${name}`, params);
  log(`✓ transit/keys/${name} créée (${params.type})`);
  return true;
}

/** Génère une paire RSA 2048 RS256 (assez pour dev — prod=4096). */
function generateRsaKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privatePem: privateKey, publicPem: publicKey };
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
  log(`Cible : ${VAULT_ADDR}`);
  await waitForVault();
  log('Vault accessible');

  // 1. Engines
  await ensureEngine('kv', 'kv', { version: '2' });
  await ensureEngine('transit', 'transit');

  // 2. kv/data/auth/jwt (idempotent : on garde la paire existante si présente)
  const existing = await readKv('kv', 'auth/jwt');
  if (existing?.private_pem && existing?.public_pem && existing?.kid) {
    log(`· kv/data/auth/jwt déjà seedé (kid=${existing.kid}) — skip`);
  } else {
    const { privatePem, publicPem } = generateRsaKeypair();
    const kid = `dev-rs256-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;
    await writeKv('kv', 'auth/jwt', {
      private_pem: privatePem,
      public_pem: publicPem,
      kid,
      algorithm: 'RS256',
      generated_at: new Date().toISOString(),
    });
    log(`✓ kv/data/auth/jwt seedé (kid=${kid}, RSA 2048)`);
  }

  // 3. Transit keys
  await ensureTransitKey('auth-mfa-secret', {
    type: 'aes256-gcm96',
    exportable: false,
    deletion_allowed: false,
  });
  await ensureTransitKey('nina-qr-signing', {
    type: 'rsa-3072',
    exportable: false,
    deletion_allowed: false,
  });

  log('');
  log('✅ Bootstrap terminé');
  log('   • auth-service peut maintenant booter sur :3002');
  log('   • document-service peut signer des QR FDI');
  log('');
  warn('Secrets de DEV uniquement. En prod, suivre docs/15-SECURITY-HARDENING.md §4.');
}

main().catch((err) => die(err.message ?? String(err)));
