/**
 * @file        test/mocks/observability.ts
 * @description Mock Jest de `@nina-aes/observability` (package ESM). Évite
 *              d'embarquer PrometheusModule + le SDK OTel dans les tests (et la
 *              collision de registre prom-client global entre suites).
 */
import { Module, type DynamicModule } from '@nestjs/common';

@Module({})
export class ObservabilityModule {
  static forRoot(cfg: unknown): DynamicModule {
    void cfg; // signature compatible avec le vrai ObservabilityModule.forRoot(config)
    return { module: ObservabilityModule, global: true, providers: [], exports: [] };
  }
}

export function startOtelTracing(serviceName: string): void {
  void serviceName; // no-op en test
}

export function shutdownOtelTracing(): Promise<void> {
  return Promise.resolve();
}
