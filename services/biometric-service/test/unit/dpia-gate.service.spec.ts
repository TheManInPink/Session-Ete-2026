/**
 * @file        dpia-gate.service.spec.ts
 * @description Tests du GATE DPIA/RGPD bloquant (DPIA §10) :
 *                - production + DPIA NON signée → REFUS de démarrer (throw au boot) ;
 *                - production + DPIA signée → démarrage autorisé ;
 *                - dev/test + DPIA non signée → démarrage toléré (warning), gate ouvert.
 * @module      biometric-service/test
 */
import type { ConfigService } from '@nestjs/config';
import { DpiaGateService } from '../../src/governance/dpia-gate.service.js';
import type { Env } from '../../src/config/env.schema.js';

function gate(nodeEnv: string, signed: boolean): DpiaGateService {
  const env: Partial<Record<keyof Env, unknown>> = {
    NODE_ENV: nodeEnv,
    BIOMETRIC_DPIA_SIGNED: signed,
  };
  const cfg = { get: (k: keyof Env) => env[k] } as unknown as ConfigService<Env, true>;
  return new DpiaGateService(cfg);
}

describe('DpiaGateService — gate de gouvernance bloquant', () => {
  it('PRODUCTION + DPIA NON signée → refuse de démarrer', () => {
    expect(() => gate('production', false).onModuleInit()).toThrow(/GATE DE GOUVERNANCE/);
  });

  it('PRODUCTION + DPIA signée → démarrage autorisé (gate ouvert)', () => {
    const g = gate('production', true);
    expect(() => g.onModuleInit()).not.toThrow();
    expect(g.isOpen()).toBe(true);
  });

  it('DEV + DPIA non signée → démarrage toléré (gate ouvert=false)', () => {
    const g = gate('development', false);
    expect(() => g.onModuleInit()).not.toThrow();
    expect(g.isOpen()).toBe(false);
  });
});
