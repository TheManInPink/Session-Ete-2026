/**
 * @file        proxy.routes.spec.ts
 * @description Tests de la table de routage : matching de préfixe, endpoints
 *              publics, énumération des avals distincts, vue publique sans fuite
 *              d'URL interne.
 */
import {
  GATEWAY_ROUTES,
  distinctDownstreams,
  isPublicEndpoint,
  listRoutesPublic,
  matchRoute,
} from '../../src/modules/proxy/proxy.routes.js';

describe('proxy.routes — matchRoute', () => {
  it('route /api/v1/citizens vers identity', () => {
    expect(matchRoute('/api/v1/citizens/123')?.serviceName).toBe('identity');
  });

  it('route /api/v1/biometric vers biometric (port 3012, ajout PROMPT 3.7)', () => {
    const route = matchRoute('/api/v1/biometric/match');
    expect(route?.serviceName).toBe('biometric');
    expect(route?.targetBaseUrl).toContain('3012');
  });

  it('route /api/v1/ussd vers ussd', () => {
    expect(matchRoute('/api/v1/ussd/callback')?.serviceName).toBe('ussd');
  });

  it('renvoie undefined pour un chemin inconnu', () => {
    expect(matchRoute('/api/v1/inconnu/x')).toBeUndefined();
  });

  it('renvoie undefined hors préfixe /api/v1', () => {
    expect(matchRoute('/health')).toBeUndefined();
  });
});

describe('proxy.routes — isPublicEndpoint', () => {
  const authRoute = GATEWAY_ROUTES.find((r) => r.serviceName === 'auth')!;

  it('considère /api/v1/auth/login comme public', () => {
    expect(isPublicEndpoint('/api/v1/auth/login', authRoute)).toBe(true);
  });

  it('considère /api/v1/auth/me comme protégé', () => {
    expect(isPublicEndpoint('/api/v1/auth/me', authRoute)).toBe(false);
  });

  it('expose le webhook USSD sans auth', () => {
    const ussd = GATEWAY_ROUTES.find((r) => r.serviceName === 'ussd')!;
    expect(isPublicEndpoint('/api/v1/ussd/callback', ussd)).toBe(true);
  });
});

describe('proxy.routes — distinctDownstreams', () => {
  it('liste 14 services aval distincts', () => {
    const services = distinctDownstreams().map((d) => d.serviceName);
    expect(new Set(services).size).toBe(14);
    expect(services).toEqual(
      expect.arrayContaining([
        'identity',
        'auth',
        'ai',
        'document',
        'notification',
        'interop',
        'audit',
        'appointment',
        'anticorruption',
        'governance',
        'vulnerability',
        'biometric',
        'enrollment',
        'ussd',
      ]),
    );
  });

  it('déduplique identity (visé par /citizens, /corrections, /locations)', () => {
    const identity = distinctDownstreams().filter((d) => d.serviceName === 'identity');
    expect(identity).toHaveLength(1);
  });
});

describe('proxy.routes — listRoutesPublic', () => {
  it("ne divulgue jamais l'URL interne du service (topologie)", () => {
    const routes = listRoutesPublic();
    for (const r of routes) {
      expect(r).not.toHaveProperty('targetBaseUrl');
      expect(r.publicPrefix.startsWith('/api/v1/')).toBe(true);
      expect(Array.isArray(r.publicEndpoints)).toBe(true);
    }
  });
});
