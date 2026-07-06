/**
 * @file        proxy.headers.spec.ts
 * @description Tests du filtrage d'en-têtes forwardés — dont l'ANTI-CORRÉLATION
 *              du canal lanceur d'alerte SIGAC : sur une route publique anonyme,
 *              aucun en-tête identifiant (IP relayée, empreinte navigateur,
 *              cookie, corrélation/trace) ne doit atteindre le service aval.
 */
import {
  ANONYMOUS_STRIP_HEADERS,
  buildForwardedHeaders,
} from '../../src/modules/proxy/proxy.service.js';
import { isPublicEndpoint, matchRoute } from '../../src/modules/proxy/proxy.routes.js';

/** En-têtes représentatifs d'une requête navigateur réelle. */
const BROWSER_HEADERS = {
  host: 'api.nina-aes.ml',
  connection: 'keep-alive',
  'content-length': '128',
  'content-type': 'application/json',
  'x-forwarded-for': '41.207.10.5',
  'x-real-ip': '41.207.10.5',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13)',
  referer: 'https://nina-aes.ml/fr/signalement',
  cookie: 'access_token=abc; theme=dark',
  'x-correlation-id': 'corr-1700000000000-xyz',
  'x-request-id': 'corr-1700000000000-xyz',
  traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
  'accept-language': 'fr-FR,fr;q=0.9',
  authorization: 'Bearer eyJ...',
};

describe('buildForwardedHeaders — en-têtes hop-by-hop', () => {
  it.each(['host', 'connection', 'content-length'])(
    'retire toujours %s (mode authentifié comme anonyme)',
    (h) => {
      expect(buildForwardedHeaders(BROWSER_HEADERS, false)).not.toHaveProperty(h);
      expect(buildForwardedHeaders(BROWSER_HEADERS, true)).not.toHaveProperty(h);
    },
  );

  it('joint les valeurs de type tableau', () => {
    const out = buildForwardedHeaders({ 'x-multi': ['a', 'b'] }, false);
    expect(out['x-multi']).toBe('a,b');
  });

  it('ignore les valeurs undefined', () => {
    const out = buildForwardedHeaders({ 'x-empty': undefined }, false);
    expect(out).not.toHaveProperty('x-empty');
  });
});

describe('buildForwardedHeaders — route PROTÉGÉE (anonymous=false)', () => {
  const out = buildForwardedHeaders(BROWSER_HEADERS, false);

  it('propage les en-têtes identifiants (comportement historique inchangé)', () => {
    expect(out['x-forwarded-for']).toBe('41.207.10.5');
    expect(out['User-Agent']).toBe('Mozilla/5.0 (Linux; Android 13)');
    expect(out['x-correlation-id']).toBe('corr-1700000000000-xyz');
    expect(out['authorization']).toBe('Bearer eyJ...');
    expect(out['content-type']).toBe('application/json');
  });
});

describe('buildForwardedHeaders — canal ANONYME (anonymous=true)', () => {
  const out = buildForwardedHeaders(BROWSER_HEADERS, true);

  it.each([...ANONYMOUS_STRIP_HEADERS])('retire %s (anti-corrélation)', (h) => {
    // Vérifie insensiblement à la casse : aucune clé restante ne matche.
    const remaining = Object.keys(out).map((k) => k.toLowerCase());
    expect(remaining).not.toContain(h);
  });

  it('retire IP relayée, User-Agent (casse mixte), cookie, corrélation et trace', () => {
    expect(out).not.toHaveProperty('x-forwarded-for');
    expect(out).not.toHaveProperty('x-real-ip');
    expect(out).not.toHaveProperty('User-Agent');
    expect(out).not.toHaveProperty('cookie');
    expect(out).not.toHaveProperty('x-correlation-id');
    expect(out).not.toHaveProperty('x-request-id');
    expect(out).not.toHaveProperty('traceparent');
    expect(out).not.toHaveProperty('referer');
    expect(out).not.toHaveProperty('accept-language');
  });

  it('conserve les en-têtes fonctionnels non identifiants (content-type)', () => {
    expect(out['content-type']).toBe('application/json');
  });
});

describe('anti-corrélation pilotée par isPublicEndpoint (routes SIGAC réelles)', () => {
  const sigac = matchRoute('/api/v1/sigac/whistleblower/reports');

  it('les 3 routes whistleblower publiques déclenchent le mode anonyme', () => {
    expect(sigac).toBeDefined();
    for (const p of [
      '/api/v1/sigac/whistleblower/public-key',
      '/api/v1/sigac/whistleblower/reports',
      '/api/v1/sigac/whistleblower/reports/abc123/status',
    ]) {
      expect(isPublicEndpoint(p, sigac!)).toBe(true);
    }
  });

  it("la file procureur (authentifiée) N'EST PAS anonyme → corrélation conservée", () => {
    expect(isPublicEndpoint('/api/v1/sigac/whistleblower/queue', sigac!)).toBe(false);
  });
});
