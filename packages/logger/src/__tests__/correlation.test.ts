/**
 * @file        correlation.test.ts
 * @description Tests de la propagation AsyncLocalStorage du correlationId.
 */

import { generateCorrelationId, getContext, patchContext, runWithContext } from '../correlation.js';

describe('generateCorrelationId', () => {
  it('génère un UUID v7 valide (8-4-4-4-12 hex)', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('est unique entre deux appels rapprochés', () => {
    expect(generateCorrelationId()).not.toBe(generateCorrelationId());
  });

  it('est lexicographiquement croissant dans le temps (propriété UUID v7)', () => {
    const a = generateCorrelationId();
    // Forcer un petit délai pour avancer l'horloge millième
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        const b = generateCorrelationId();
        expect(b > a).toBe(true);
        resolve();
      }, 5),
    );
  });
});

describe('runWithContext + getContext', () => {
  it('expose le contexte dans la portée', () => {
    runWithContext({ correlationId: 'test-1', service: 'unit' }, () => {
      expect(getContext()?.correlationId).toBe('test-1');
    });
  });

  it('retourne undefined hors de toute portée', () => {
    expect(getContext()).toBeUndefined();
  });

  it('isole les portées concurrentes (async)', async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithContext({ correlationId: 'A', service: 's' }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        seen.push(getContext()?.correlationId ?? 'lost');
      }),
      runWithContext({ correlationId: 'B', service: 's' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(getContext()?.correlationId ?? 'lost');
      }),
    ]);
    expect(seen.sort()).toEqual(['A', 'B']);
  });
});

describe('patchContext', () => {
  it('enrichit le contexte courant', () => {
    runWithContext({ correlationId: 'p1', service: 's' }, () => {
      patchContext({ userId: 'u-1', userRole: 'AGENT' });
      const ctx = getContext();
      expect(ctx?.userId).toBe('u-1');
      expect(ctx?.userRole).toBe('AGENT');
      expect(ctx?.correlationId).toBe('p1'); // préservé
    });
  });

  it('throw si appelé hors portée', () => {
    expect(() => patchContext({ userId: 'x' })).toThrow(/hors de toute portée/);
  });
});
