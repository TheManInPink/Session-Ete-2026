/**
 * @file        tracing.ts
 * @description Initialisation OpenTelemetry NodeSDK + exporter OTLP gRPC
 *              vers le collecteur Jaeger (ou Tempo).
 *
 *              CRITIQUE : doit être appelé AVANT
 *              `NestFactory.create()` et AVANT tout `import` de modules
 *              applicatifs, sinon les auto-instrumentations ne
 *              s'attachent pas correctement (notamment Prisma, ioredis,
 *              http natif).
 *
 *              Usage type (`services/<svc>/src/main.ts`) :
 *              ```ts
 *              import { startOtelTracing } from '@nina-aes/observability';
 *              startOtelTracing('identity-service');
 *
 *              import { NestFactory } from '@nestjs/core';
 *              // ... reste de l'app
 *              ```
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | undefined;

/**
 * Configure et démarre le SDK OTel pour ce process.
 *
 * @param serviceName - nom du service (ex. 'identity-service')
 * @param options - options optionnelles (endpoint OTLP, version)
 */
export function startOtelTracing(
  serviceName: string,
  options?: {
    otlpEndpoint?: string;
    serviceVersion?: string;
  },
): void {
  if (sdk) {
    console.warn(`[otel] SDK déjà démarré pour ${serviceName}`);
    return;
  }

  const endpoint =
    options?.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://jaeger:4317';

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: options?.serviceVersion ?? process.env.SERVICE_VERSION ?? '0.1.0',
      'deployment.environment': process.env.ENV ?? 'dev',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs trop bruyant en dev (chaque .json lu trace)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // dns idem (résolutions docker = bruit)
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.info(`[otel] Tracing démarré pour ${serviceName} → ${endpoint}`);

  // Shutdown propre sur SIGTERM (K8s envoie SIGTERM avant SIGKILL)
  const shutdown = (signal: string): void => {
    console.info(`[otel] ${signal} reçu — flush des spans…`);
    sdk?.shutdown().then(
      () => console.info('[otel] Shutdown OK'),
      (err) => console.error('[otel] Shutdown error', err),
    );
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Arrêt forcé du SDK OTel (tests / hot-reload).
 */
export async function shutdownOtelTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}
