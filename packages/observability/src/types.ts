/**
 * @file        types.ts
 * @description Types partagés du module observability.
 */

/** Configuration consolidée du module observability. */
export interface ObservabilityConfig {
  /** Nom du service (label Prometheus + OTel + Pino). */
  serviceName: string;

  /** Version du service (depuis package.json — utilisée comme label). */
  serviceVersion?: string;

  /** Environnement déployé : dev / staging / prod. */
  env?: 'dev' | 'staging' | 'prod' | 'test';

  /** Endpoint OTel Collector (gRPC). Défaut : http://otel-collector:4317. */
  otlpEndpoint?: string;

  /** URL Loki HTTP pour le transport Pino. Défaut : http://loki:3100. */
  lokiUrl?: string;

  /** Niveau de log Pino (debug | info | warn | error). Défaut : info. */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Si true, expose `/metrics` à la racine du service (recommandé).
   * Par défaut true.
   */
  exposeMetrics?: boolean;

  /**
   * Path personnalisé du endpoint metrics (défaut `/metrics`).
   * Utiliser uniquement si conflit avec une route métier.
   */
  metricsPath?: string;
}
