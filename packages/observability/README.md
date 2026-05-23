# @nina-aes/observability

Module NestJS partagé pour l'observabilité des microservices Bloc A :

- **Métriques** Prometheus (HTTP + Node defaults + métier custom)
- **Tracing** OpenTelemetry → Jaeger (OTLP gRPC)
- **Logs** Pino structuré JSON avec **redaction PII** automatique

Implémentation de la spec [doc 17 + ADR-017](../../docs/17-MONITORING-OBSERVABILITY.md).

## Usage type

### main.ts (avant tout NestFactory)

```ts
// services/identity-service/src/main.ts
import { startOtelTracing } from '@nina-aes/observability';

// ⚠️ DOIT être appelé AVANT tout import applicatif
startOtelTracing('identity-service');

// puis seulement après
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3001, '0.0.0.0');
}
bootstrap();
```

### app.module.ts

```ts
import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@nina-aes/observability';

@Module({
  imports: [
    ObservabilityModule.forRoot({
      serviceName: 'identity-service',
      env: (process.env.ENV ?? 'dev') as 'dev' | 'staging' | 'prod',
    }),
    // ... vos modules métier
  ],
})
export class AppModule {}
```

### Métriques métier custom

```ts
import { Injectable } from '@nestjs/common';
import { BusinessMetrics } from '@nina-aes/observability';

@Injectable()
export class CitizenService {
  constructor(private readonly metrics: BusinessMetrics) {}

  async validate(nina: string): Promise<boolean> {
    const ok = await this.doValidate(nina);
    this.metrics.ninaValidated.inc({
      result: ok ? 'success' : 'failure',
      region: nina.substring(5, 6),
    });
    return ok;
  }
}
```

### Logger Pino

```ts
import { createPinoLogger } from '@nina-aes/observability';

const logger = createPinoLogger({ serviceName: 'identity-service' });

logger.info({ nina: '18903102015042V', operation: 'create' }, 'Citizen créé');
// → log JSON sans le NINA : { ..., "nina": "***REDACTED***", "operation": "create" }
```

## Variables d'environnement

| Variable                      | Défaut               | Description                       |
| ----------------------------- | -------------------- | --------------------------------- |
| `SERVICE_VERSION`             | `0.1.0`              | Label Prometheus + OTel           |
| `ENV`                         | `dev`                | Label uniforme `dev/staging/prod` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://jaeger:4317` | OTLP gRPC                         |
| `LOKI_URL`                    | `http://loki:3100`   | URL Pino transport Loki           |
| `LOG_LEVEL`                   | `info`               | Niveau Pino                       |

## Doc associée

- `docs/17-MONITORING-OBSERVABILITY.md` — architecture LGTM
- `docs/adr/ADR-017-observabilite-lgtm-stack.md` — décision
- `infrastructure/monitoring/` — stack Docker + dashboards Grafana
