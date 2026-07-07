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
  type GatewayRoute,
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

  it('route /api/v1/centers vers appointment (répertoire public PC-04)', () => {
    expect(matchRoute('/api/v1/centers')?.serviceName).toBe('appointment');
    expect(matchRoute('/api/v1/centers/abc/availability')?.targetBaseUrl).toContain('3008');
  });

  it.each(['/api/v1/sgogt/messages', '/api/v1/directives', '/api/v1/elections/export'])(
    'route %s vers governance (port 3010, préfixes réels des controllers)',
    (path) => {
      const route = matchRoute(path);
      expect(route?.serviceName).toBe('governance');
      expect(route?.targetBaseUrl).toContain('3010');
    },
  );

  it("ne route PLUS /api/v1/governance (préfixe mort : le proxy ne réécrit pas l'URL)", () => {
    expect(matchRoute('/api/v1/governance/directives')).toBeUndefined();
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

  it('expose le répertoire des centres (PC-04) sans JWT', () => {
    const centers = GATEWAY_ROUTES.find((r) => r.publicPrefix === '/api/v1/centers')!;
    expect(isPublicEndpoint('/api/v1/centers', centers)).toBe(true);
    expect(isPublicEndpoint('/api/v1/centers/abc/availability', centers)).toBe(true);
  });
});

describe('proxy.routes — isPublicEndpoint (canal lanceur d’alerte SIGAC, PC-06)', () => {
  const sigac = GATEWAY_ROUTES.find((r) => r.serviceName === 'anticorruption')!;

  it('expose la clé publique procureur sans JWT', () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/public-key', sigac)).toBe(true);
  });

  it("expose l'intake de signalement scellé sans JWT", () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/reports', sigac)).toBe(true);
  });

  it('expose le suivi par token dynamique {token}/status sans JWT', () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/reports/wb-3f9a1c/status', sigac)).toBe(
      true,
    );
  });

  it('protège la file procureur (queue) et le scoring d’intégrité', () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/queue', sigac)).toBe(false);
    expect(isPublicEndpoint('/api/v1/sigac/integrity-scores', sigac)).toBe(false);
  });

  it('ne considère PLUS /api/v1/sigac/alerts comme public (routes inexistantes côté service)', () => {
    expect(isPublicEndpoint('/api/v1/sigac/alerts', sigac)).toBe(false);
    expect(isPublicEndpoint('/api/v1/sigac/alerts/status', sigac)).toBe(false);
  });
});

describe('proxy.routes — isPublicEndpoint (motifs à segments `:param`)', () => {
  /** Route fixture avec UNIQUEMENT un motif paramétré (isole le mécanisme). */
  const patternRoute: GatewayRoute = {
    publicPrefix: '/api/v1/sigac',
    targetBaseUrl: 'http://anticorruption-service:3009',
    serviceName: 'anticorruption',
    publicEndpoints: ['/api/v1/sigac/whistleblower/reports/:token/status'],
  };

  it('matche un token opaque (exactement UN segment non vide)', () => {
    expect(
      isPublicEndpoint('/api/v1/sigac/whistleblower/reports/AbC-123_x/status', patternRoute),
    ).toBe(true);
  });

  it('refuse un segment token vide (fail-closed)', () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/reports//status', patternRoute)).toBe(
      false,
    );
  });

  it('refuse un nombre de segments différent (préfixe seul, ou segments surnuméraires)', () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/reports', patternRoute)).toBe(false);
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/reports/a/b/status', patternRoute)).toBe(
      false,
    );
  });

  it('refuse un dernier segment littéral différent', () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/reports/abc/delete', patternRoute)).toBe(
      false,
    );
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
