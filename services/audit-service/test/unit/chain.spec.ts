/**
 * @file        chain.spec.ts
 * @description Tests unitaires des primitives de chaîne Merkle (chain.ts) :
 *              déterminisme du payloadHash, sensibilité du merkleHash, détection
 *              d'altération. Ces propriétés sont le cœur de la garantie
 *              d'inviolabilité du journal d'audit.
 * @module      audit-service/test
 */
import {
  GENESIS_HASH,
  computeMerkleHash,
  computePayloadHash,
  sha256Hex,
  type AuditChainFields,
} from '../../src/audit/chain.js';

const baseFields = (): AuditChainFields => ({
  userId: null,
  actorType: 'identity-service',
  action: 'citizen.created',
  entityType: 'citizen',
  entityId: 'c-001',
  oldValue: null,
  newValue: { nina: '112345678901A', name: 'Diallo' },
  ipAddress: '10.0.0.4',
  correlationId: 'corr-1',
  sourceEventId: 'evt-1',
});

describe('chain (primitives Merkle)', () => {
  it('GENESIS_HASH vaut 64 zéros', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
    expect(GENESIS_HASH).toHaveLength(64);
  });

  it('sha256Hex est stable et long de 64 hex', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
  });

  it('payloadHash est déterministe peu importe l’ordre des clés (JCS)', () => {
    const a = computePayloadHash(baseFields());
    const reordered: AuditChainFields = {
      sourceEventId: 'evt-1',
      action: 'citizen.created',
      newValue: { name: 'Diallo', nina: '112345678901A' }, // clés inversées
      actorType: 'identity-service',
      entityType: 'citizen',
      entityId: 'c-001',
      ipAddress: '10.0.0.4',
      correlationId: 'corr-1',
      oldValue: null,
      userId: null,
    };
    expect(computePayloadHash(reordered)).toBe(a);
  });

  it('payloadHash change si une valeur métier change', () => {
    const a = computePayloadHash(baseFields());
    const tampered = { ...baseFields(), newValue: { nina: '999999999999Z', name: 'Diallo' } };
    expect(computePayloadHash(tampered)).not.toBe(a);
  });

  it('merkleHash dépend du previousHash (chaînage)', () => {
    const payloadHash = computePayloadHash(baseFields());
    const occurredAt = new Date('2026-05-30T10:00:00.000Z');
    const h1 = computeMerkleHash({
      previousHash: GENESIS_HASH,
      payloadHash,
      occurredAt,
      sourceEventId: 'evt-1',
    });
    const h2 = computeMerkleHash({
      previousHash: 'f'.repeat(64),
      payloadHash,
      occurredAt,
      sourceEventId: 'evt-1',
    });
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('merkleHash dépend de occurredAt (anti-rejeu temporel)', () => {
    const payloadHash = computePayloadHash(baseFields());
    const h1 = computeMerkleHash({
      previousHash: GENESIS_HASH,
      payloadHash,
      occurredAt: new Date('2026-05-30T10:00:00.000Z'),
      sourceEventId: 'evt-1',
    });
    const h2 = computeMerkleHash({
      previousHash: GENESIS_HASH,
      payloadHash,
      occurredAt: new Date('2026-05-30T11:00:00.000Z'),
      sourceEventId: 'evt-1',
    });
    expect(h1).not.toBe(h2);
  });

  it('reproduit une chaîne de 3 maillons de façon déterministe', () => {
    const events = ['evt-1', 'evt-2', 'evt-3'];
    const occurredAt = new Date('2026-05-30T10:00:00.000Z');
    const build = (): string => {
      let prev = GENESIS_HASH;
      for (const id of events) {
        const payloadHash = computePayloadHash({ ...baseFields(), sourceEventId: id });
        prev = computeMerkleHash({
          previousHash: prev,
          payloadHash,
          occurredAt,
          sourceEventId: id,
        });
      }
      return prev;
    };
    expect(build()).toBe(build()); // déterministe
  });
});
