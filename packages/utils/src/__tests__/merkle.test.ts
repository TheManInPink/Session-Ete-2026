/**
 * @file        merkle.test.ts
 * @description Tests Jest pour le hachage Merkle des journaux d'audit.
 * @module      @nina-aes/utils
 */

import { computeMerkleHash, generateMerkleHash, verifyMerkleChain } from '../merkle';

/** Construit une chaîne valide de N entrées pour les tests. */
function buildChain(n: number): Array<{ data: string; hash: string; previousHash: string }> {
  const entries: Array<{ data: string; hash: string; previousHash: string }> = [];
  let prev = '';
  for (let i = 0; i < n; i++) {
    const data = `entry-${i}`;
    const hash = computeMerkleHash(data, prev);
    entries.push({ data, hash, previousHash: prev });
    prev = hash;
  }
  return entries;
}

describe('Merkle — computeMerkleHash', () => {
  it('produit un digest SHA-256 de 64 caractères hex', () => {
    const h = computeMerkleHash('payload', '');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('change si la donnée change', () => {
    expect(computeMerkleHash('a', '')).not.toBe(computeMerkleHash('b', ''));
  });

  it('change si le hash précédent change', () => {
    expect(computeMerkleHash('a', 'x')).not.toBe(computeMerkleHash('a', 'y'));
  });
});

describe('Merkle — generateMerkleHash (alias inversé)', () => {
  it('équivaut à computeMerkleHash avec les arguments permutés', () => {
    expect(generateMerkleHash('prev', 'data')).toBe(computeMerkleHash('data', 'prev'));
  });
});

describe('Merkle — verifyMerkleChain', () => {
  it('accepte une chaîne intacte', () => {
    expect(verifyMerkleChain(buildChain(5))).toBe(true);
  });

  it('détecte une falsification de donnée', () => {
    const chain = buildChain(5);
    chain[2]!.data = 'TAMPERED';
    expect(verifyMerkleChain(chain)).toBe(false);
  });

  it('détecte une rupture de chaînage (previousHash modifié)', () => {
    const chain = buildChain(5);
    chain[3]!.previousHash = 'a'.repeat(64);
    expect(verifyMerkleChain(chain)).toBe(false);
  });

  it('accepte une chaîne vide', () => {
    expect(verifyMerkleChain([])).toBe(true);
  });
});
