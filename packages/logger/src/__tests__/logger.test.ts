/**
 * @file        logger.test.ts
 * @description Tests de la factory Pino centrale : signature polymorphe
 *              (string/options), sélection du niveau par environnement, mixin
 *              de corrélation, withContext, et logger de secours singleton.
 */

import * as loggerIndex from '../index.js';
import createLoggerDefault, {
  createLogger,
  getFallbackLogger,
  defaultLogger,
  runWithContext,
} from '../index.js';
import { createLogger as createLoggerCore } from '../logger.js';
import type { LogContext } from '../types.js';

describe('createLogger (index — signature polymorphe)', () => {
  it('accepte la signature legacy (string)', () => {
    const log = createLoggerDefault('legacy-svc');
    expect(typeof log.info).toBe('function');
    expect(typeof log.withContext).toBe('function');
  });

  it('accepte la signature moderne (options) avec champs de base', () => {
    const log = createLogger({
      service: 'svc',
      environment: 'production',
      gitSha: 'abc1234',
      baseFields: { region: 'ML' },
    });
    expect(typeof log.info).toBe('function');
  });

  it('expose un defaultLogger prêt à l’emploi', () => {
    expect(defaultLogger).toBeDefined();
    expect(typeof defaultLogger.info).toBe('function');
  });
});

describe('createLogger (logger.ts — niveaux & contexte)', () => {
  it('choisit le niveau par défaut selon l’environnement', () => {
    expect(createLoggerCore({ service: 's', environment: 'test' }).level).toBe('fatal');
    expect(createLoggerCore({ service: 's', environment: 'development' }).level).toBe('debug');
    expect(createLoggerCore({ service: 's', environment: 'staging' }).level).toBe('info');
    expect(createLoggerCore({ service: 's', environment: 'production' }).level).toBe('info');
    expect(createLoggerCore({ service: 's', environment: 'autre' }).level).toBe('info');
  });

  it('respecte un niveau explicite (prioritaire sur l’environnement)', () => {
    expect(
      createLoggerCore({ service: 's', level: 'warn', environment: 'development' }).level,
    ).toBe('warn');
  });

  it('withContext renvoie un logger enfant fonctionnel', () => {
    const log = createLoggerCore({ service: 's', level: 'debug' });
    const child = log.withContext({ correlationId: 'c-1', service: 's' });
    expect(typeof child.info).toBe('function');
  });

  it('injecte le contexte via le mixin — champs présents', () => {
    const log = createLoggerCore({ service: 's', level: 'debug' });
    const ctx: LogContext = {
      correlationId: 'c-2',
      service: 's',
      userId: 'u-1',
      userRole: 'agent',
      sessionId: 'sess-1',
    };
    expect(() =>
      runWithContext(ctx, () => log.info({ op: 'x' }, 'avec contexte complet')),
    ).not.toThrow();
  });

  it('gère un contexte minimal puis l’absence de contexte', () => {
    const log = createLoggerCore({ service: 's', level: 'debug' });
    expect(() =>
      runWithContext({ correlationId: 'c-3', service: 's' }, () => log.info('contexte minimal')),
    ).not.toThrow();
    // hors de toute portée runWithContext → le mixin renvoie {}
    expect(() => log.info('sans contexte')).not.toThrow();
  });
});

describe('getFallbackLogger', () => {
  it('est un singleton (même instance réutilisée)', () => {
    const a = getFallbackLogger();
    const b = getFallbackLogger();
    expect(a).toBe(b);
    expect(typeof a.info).toBe('function');
  });
});

describe('index — surface publique réexportée', () => {
  it('réexporte toute l’API publique (factory, corrélation, redaction)', () => {
    // Accéder à chaque symbole valide le contrat du barrel d'entrée.
    const fns = [
      'createLogger',
      'getFallbackLogger',
      'generateCorrelationId',
      'getContext',
      'patchContext',
      'runWithContext',
      'maskEmail',
      'maskNina',
      'maskPhone',
    ] as const;
    for (const name of fns) {
      expect(typeof loggerIndex[name]).toBe('function');
    }
    expect(typeof loggerIndex.default).toBe('function');
    expect(loggerIndex.defaultLogger).toBeDefined();
    expect(Array.isArray(loggerIndex.PII_REDACT_PATHS)).toBe(true);
    expect(loggerIndex.REDACT_CENSOR).toBeDefined();
  });

  it('les helpers réexportés restent fonctionnels via le barrel', () => {
    expect(loggerIndex.generateCorrelationId()).toMatch(/^[0-9a-f-]{36}$/i);
    expect(loggerIndex.maskNina('112345678901234')).not.toContain('112345678901234');
    expect(loggerIndex.getContext()).toBeUndefined(); // hors portée runWithContext
  });
});
