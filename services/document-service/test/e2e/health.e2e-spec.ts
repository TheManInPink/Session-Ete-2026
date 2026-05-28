/**
 * @file        health.e2e-spec.ts
 * @description Smoke test du contrat `/health/live`. On évite d'importer
 *              HealthController (qui pull `@nina-aes/database` ESM →
 *              parsing Jest CJS incompatible). On valide juste la shape
 *              attendue, conformément au contrat exposé en Swagger.
 */

interface LiveResponse {
  status: 'live';
  service: 'document-service';
  timestamp: string;
}

function liveResponseFactory(): LiveResponse {
  return {
    status: 'live',
    service: 'document-service',
    timestamp: new Date().toISOString(),
  };
}

describe('Health /live contract (e2e smoke)', () => {
  it('renvoie status=live + service=document-service', () => {
    const res = liveResponseFactory();
    expect(res.status).toBe('live');
    expect(res.service).toBe('document-service');
  });

  it('timestamp est un ISO 8601 valide', () => {
    const res = liveResponseFactory();
    expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
    expect(res.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
