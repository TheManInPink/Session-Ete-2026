#!/usr/bin/env tsx
/**
 * @file        verify-chain.ts
 * @description Vérification OFFLINE et INDÉPENDANTE de la chaîne d'audit.
 *
 *              Ne dépend QUE de `pg`, `@noble/hashes`, `@noble/ed25519` et
 *              `canonicalize` — AUCUN import du code applicatif. C'est la
 *              « preuve indépendante » : un inspecteur peut recalculer la chaîne
 *              sans faire confiance au service audit-service.
 *
 *              La logique de hash est volontairement DUPLIQUÉE depuis
 *              `src/audit/chain.ts` (toute modification doit être répercutée).
 *
 * Usage :
 *   DATABASE_URL=postgres://...                                          \
 *   AUDIT_PUBLIC_KEY_ED25519=<hex>                                       \
 *   pnpm --filter @nina-aes/audit-service verify:chain -- --from 1 --to 1000000 --verify-sig
 *
 * Codes de sortie : 0 OK · 1 intervalle vide · 2 payload altéré ·
 *                   3 merkle rompu · 4 signature invalide · 99 erreur.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/scripts
 */
import { Client } from 'pg';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import * as ed from '@noble/ed25519';

const GENESIS_HASH = '0'.repeat(64);

/** SHA-256 hexadécimal (identique à src/audit/chain.ts). */
function sha256Hex(input: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

/** JSON canonique (clés triées récursivement) — IDENTIQUE à src/audit/chain.ts. */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** Objet canonique du payload métier (MÊME ordre/normalisation que chain.ts). */
function canonicalObject(row: AuditRow): Record<string, unknown> {
  return {
    action: row.action,
    actorType: row.actor_type,
    correlationId: row.correlation_id ?? null,
    entityId: row.entity_id ?? null,
    entityType: row.entity_type,
    ipAddress: row.ip_address ?? null,
    newValue: row.new_value ?? null,
    oldValue: row.old_value ?? null,
    sourceEventId: row.source_event_id,
    userId: row.user_id ?? null,
  };
}

function computePayloadHash(row: AuditRow): string {
  return sha256Hex(canonicalJson(canonicalObject(row)));
}

function computeMerkleHash(prev: string, payloadHash: string, row: AuditRow): string {
  const iso = new Date(row.occurred_at).toISOString();
  return sha256Hex(`${prev}|${payloadHash}|${iso}|${row.source_event_id}`);
}

/** Ligne SQL d'audit_logs (colonnes snake_case). */
interface AuditRow {
  id: string;
  user_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  payload_hash: string;
  previous_hash: string;
  merkle_hash: string;
  source_event_id: string;
  correlation_id: string | null;
  occurred_at: string | Date;
}

/** Lit un argument `--name <value>` de la ligne de commande. */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main(): Promise<void> {
  const fromId = arg('from', '1');
  const toId = arg('to', String(Number.MAX_SAFE_INTEGER));
  const verifySig = process.argv.includes('--verify-sig');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<AuditRow>(
    `SELECT id, user_id, actor_type, action, entity_type, entity_id,
            old_value, new_value, ip_address, payload_hash, previous_hash,
            merkle_hash, source_event_id, correlation_id, occurred_at
       FROM audit_logs
      WHERE id >= $1 AND id <= $2
      ORDER BY id ASC`,
    [fromId, toId],
  );

  if (rows.length === 0) {
    console.log('❌ Aucun log dans l’intervalle.');
    await client.end();
    process.exit(1);
  }

  let expectedPrev = rows[0]!.previous_hash;
  let checked = 0;
  for (const row of rows) {
    const payloadHash = computePayloadHash(row);
    if (payloadHash !== row.payload_hash) {
      console.error(`❌ payload altéré sur id=${row.id}`);
      await client.end();
      process.exit(2);
    }
    const merkle = computeMerkleHash(expectedPrev, payloadHash, row);
    if (merkle !== row.merkle_hash) {
      console.error(`❌ merkle rompu sur id=${row.id}`);
      console.error(`   attendu ${merkle.slice(0, 16)}… · stocké ${row.merkle_hash.slice(0, 16)}…`);
      await client.end();
      process.exit(3);
    }
    expectedPrev = row.merkle_hash;
    checked++;
  }
  console.log(
    `✅ Chaîne valide : ${checked} logs vérifiés (id ${rows[0]!.id} → ${rows[rows.length - 1]!.id}).`,
  );
  if (rows[0]!.previous_hash === GENESIS_HASH) {
    console.log('   ↳ démarrage à la racine GENESIS (chaîne complète depuis l’origine).');
  }

  if (verifySig) {
    const pubHex = process.env.AUDIT_PUBLIC_KEY_ED25519;
    if (!pubHex) {
      console.error('❌ AUDIT_PUBLIC_KEY_ED25519 non défini (requis pour --verify-sig).');
      await client.end();
      process.exit(99);
    }
    const pub = Uint8Array.from(Buffer.from(pubHex, 'hex'));
    const roots = await client.query<{
      chain_root_hash: string;
      signed_at: string | Date;
      signature: string;
    }>(
      `SELECT chain_root_hash, signed_at, signature
         FROM audit_roots
        WHERE last_log_id >= $1 AND last_log_id <= $2
        ORDER BY id ASC`,
      [fromId, toId],
    );
    for (const r of roots.rows) {
      const msg = new TextEncoder().encode(
        `${r.chain_root_hash}|${new Date(r.signed_at).toISOString()}`,
      );
      const ok = await ed.verifyAsync(Uint8Array.from(Buffer.from(r.signature, 'hex')), msg, pub);
      if (!ok) {
        console.error(
          `❌ signature Ed25519 INVALIDE pour racine ${r.chain_root_hash.slice(0, 16)}…`,
        );
        await client.end();
        process.exit(4);
      }
    }
    console.log(`✅ ${roots.rows.length} racine(s) Ed25519 vérifiée(s).`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
