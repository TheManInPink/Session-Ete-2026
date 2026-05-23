/**
 * @file        observability.module.ts
 * @description Module NestJS d'observabilité unique. À importer dans
 *              le `AppModule` de chaque microservice Bloc A pour
 *              obtenir :
 *                1. Endpoint /metrics (Prometheus format)
 *                2. Métriques HTTP histogram + counter par défaut
 *                3. Default Node metrics (heap, GC, event loop lag)
 *                4. Labels uniformes (service, version, env)
 *
 *              Pour les métriques métier custom (ex. NINA validés,
 *              corrections soumises), utiliser le helper `BusinessMetrics`
 *              dans `metrics.ts`.
 *
 *              Pour le tracing OTel, appeler `startOtelTracing()` AVANT
 *              `NestFactory.create()` (cf. main.ts du service).
 *
 * @module      @nina-aes/observability
 */

import { Module, DynamicModule, Global } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { BusinessMetrics } from './metrics.js';
import type { ObservabilityConfig } from './types.js';

@Global()
@Module({})
export class ObservabilityModule {
  /**
   * Configure le module observability avec un nom de service requis
   * et une liste optionnelle de paramètres.
   *
   * Exemple d'usage (services/identity-service/src/app.module.ts) :
   *
   * ```ts
   * imports: [
   *   ObservabilityModule.forRoot({
   *     serviceName: 'identity-service',
   *     serviceVersion: process.env.SERVICE_VERSION ?? '0.1.0',
   *     env: (process.env.ENV ?? 'dev') as 'dev' | 'staging' | 'prod',
   *   }),
   *   // ... autres modules
   * ],
   * ```
   *
   * @param config - Paramètres du module
   * @returns Le DynamicModule à importer
   */
  static forRoot(config: ObservabilityConfig): DynamicModule {
    return {
      module: ObservabilityModule,
      imports: [
        PrometheusModule.register({
          defaultMetrics: { enabled: true },
          defaultLabels: {
            service: config.serviceName,
            version: config.serviceVersion ?? 'unknown',
            env: config.env ?? process.env.ENV ?? 'dev',
          },
          path: config.metricsPath ?? '/metrics',
        }),
      ],
      providers: [BusinessMetrics],
      exports: [BusinessMetrics, PrometheusModule],
    };
  }
}
