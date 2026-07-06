# 17 — Monitoring & Observabilité (Prometheus, Grafana, Loki, Tempo, OpenTelemetry)

> **Bloc concerné** : Transversal (tous les blocs A → F) — observabilité appliquée dès que les
> microservices Bloc A passent en intégration continue. **Prérequis** : documents 00 → 16 complétés
> ; chaîne `pnpm run verify:repo` opérationnelle ; `infrastructure/docker/docker-compose.dev.yml` à
> jour ; `@nina-aes/logger` déjà en Pino v0.2.0 (redact paths + corrélation + module NestJS) — il
> **reste** à ajouter le transport Loki et le hook NINA message-libre (cf. CHANGELOG §2 à rectifier
> : la ligne « stub » est obsolète). **Durée estimée** : 16 à 22 heures pour un étudiant seul.
> **Statut global de ce document : conçu / cible Phase 2 — rien de la stack n'est encore déployé**
> (ni OTel SDK, ni `nestjs-prometheus`, ni `infrastructure/observability/`). **Livrables de cette
> étape** :
>
> - Stack LGTM souveraine déployée en local via Docker Compose :
>   - **Prometheus 3.4** (collecte métriques, retention 15j)
>   - **Grafana 12.3** (dashboards, alerting unifié)
>   - **Loki 3.5** (logs structurés, retention 30j)
>   - **Tempo 2.7** (traces distribuées OTLP)
>   - **Promtail 3.5** (shipping des logs containers)
>   - **OpenTelemetry Collector 0.119** (router OTLP → Prometheus/Loki/Tempo)
>   - **Alertmanager 0.28** (routing alertes vers récepteurs **souverains** : email/SMTP on-prem,
>     Matrix, webhook interne — **jamais** Slack/PagerDuty/Opsgenie US, cf. CANON souveraineté)
> - `@nina-aes/logger` réécrit en **Pino 9** avec transport Loki HTTP + sanitisation automatique des
>   PII (NINA, biométrie, dateNaissance)
> - Endpoints `/metrics` (Prometheus exposition format) sur les 11 services :
>   - NestJS via `nestjs-prometheus@7` + middleware HTTP histogram
>   - FastAPI via `prometheus-fastapi-instrumentator@7`
> - Instrumentation OpenTelemetry auto (NestJS + FastAPI) → Tempo via OTLP gRPC
> - 6 dashboards Grafana provisionnés (golden signals + DB Postgres + Redis + RabbitMQ + Pino logs +
>   JVM/Node heap)
> - 12 règles d'alerting (latence p95 > 500 ms, 5xx > 1 %, saturation disque, queue RabbitMQ
>   backlog, Postgres connection pool > 80 %)
> - Runbook `docs/observability/RUNBOOK.md` (procédure de triage par alerte)
> - `docs/adr/ADR-017-observabilite-lgtm-stack.md`

---

## 1. Objectif pédagogique

Un système d'identité d'État sans observabilité est **indéfendable** devant un audit : on ne peut
pas démontrer qu'un service est sain, qu'une attaque n'a pas eu lieu, ni reconstruire un incident a
posteriori. Cette étape installe les trois piliers canoniques de l'observabilité moderne :

| Pilier        | Question répondue                                             | Outil canonique |
| ------------- | ------------------------------------------------------------- | --------------- |
| **Métriques** | « Combien ? À quelle vitesse ? Depuis quand dégradé ? »       | Prometheus      |
| **Logs**      | « Qu'a fait exactement le service à 14h32 pour citoyen X ? »  | Loki            |
| **Traces**    | « Pourquoi cette requête a pris 8 secondes ? Quel maillon ? » | Tempo (OTLP)    |

Trois leçons pédagogiques :

1. **Instrumenter une fois, observer partout**. OpenTelemetry est un standard ouvert (CNCF) qui
   découple le code applicatif du backend d'observabilité. On peut basculer de Tempo vers Jaeger ou
   Grafana Cloud en changeant uniquement l'endpoint de l'OTel Collector, sans toucher au code des
   services.

2. **PII jamais en clair dans les logs**. Un log « `info: created citizen NINA=18903102015042V` »
   est une fuite de donnée souveraine. Deux défenses **complémentaires** sont nécessaires, car le
   `redact array` de Pino ne caviardise QUE les **champs structurés** (`nina`, `fingerprintHash`,
   `dateNaissance`) — il **ne touche pas** au message libre de premier argument :
   - le **redact array** (`paths`) pour les clés structurées ;
   - un **hook `formatters.log` / `messageKey` + regex NINA** qui scanne le message texte ET les
     valeurs string et remplace tout NINA brut (`\b\d{14}[A-Z]\b`) par `***NINA-REDACTED***` AVANT
     que le transport Loki ne reçoive l'entrée. Ainsi un NINA glissé dans une interpolation de
     message (`` `created ${nina}` ``) ne fuit jamais et n'est **jamais indexable** dans Loki.

   Le test unitaire `logger.redact.test.ts` valide les deux chemins : champ structuré ET NINA inséré
   dans le message libre. Règle absolue : **aucun NINA ne devient un label Loki** (cardinalité +
   fuite) — il reste, au mieux, dans un corps de log caviardé.

3. **Alertes actionnables seulement**. Une alerte qui ne demande rien à personne est du bruit.
   Chaque règle Alertmanager pointe vers une entrée du `RUNBOOK.md` avec un protocole « si vous
   voyez ceci, faites cela ». Pas de protocole = pas d'alerte.

> 💡 **Souveraineté** : la stack LGTM (Loki + Grafana + Tempo + Mimir) est entièrement open-source
> (AGPL/Apache 2.0). On la déploie soi-même. Aucun ping vers Datadog/NewRelic/Splunk — les logs
> d'enrôlement NINA restent dans le cluster CTDEC.

---

## 2. Technologies utilisées (versions mai 2026)

| Composant                                 | Version   | Rôle                                                                      |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------- |
| **Prometheus**                            | `3.4.1`   | Collecte + stockage série temporelles, retention 15j                      |
| **Grafana**                               | `12.3.0`  | Dashboards, alerting unifié, datasources Prometheus/Loki/Tempo            |
| **Loki**                                  | `3.5.0`   | Stockage logs indexés par labels (TSDB-like), retention 30j               |
| **Tempo**                                 | `2.7.1`   | Stockage traces distribuées OTLP, retention 7j                            |
| **Promtail**                              | `3.5.0`   | Agent shipping logs containers → Loki                                     |
| **OpenTelemetry Collector**               | `0.119.0` | Routeur OTLP → Prometheus (metrics) + Loki (logs) + Tempo (traces)        |
| **Alertmanager**                          | `0.28.1`  | Routing + dédoublonnage + silence des alertes Prometheus                  |
| **Pino (Node)**                           | `9.6.0`   | Logger structuré JSON, < 1 µs/log, transport Loki HTTP                    |
| **pino-loki**                             | `2.4.0`   | Transport HTTP Loki avec batching                                         |
| **nestjs-prometheus**                     | `7.2.0`   | Module NestJS qui expose `/metrics` + métriques HTTP par défaut           |
| **prometheus-fastapi-instrumentator**     | `7.0.2`   | Middleware FastAPI auto-instrumenté                                       |
| **@opentelemetry/sdk-node**               | `0.205.0` | OTel SDK Node + auto-instr. (API `resourceFromAttributes`, non dépréciée) |
| **opentelemetry-instrumentation-fastapi** | `0.50b0`  | OTel auto-instrumentation FastAPI                                         |
| **structlog (Python)**                    | `25.1.0`  | Logger structuré JSON Python — sortie compat. Promtail                    |

> 🔒 Tous open-source, AGPL/Apache 2.0. Aucune dépendance SaaS US.

---

## 3. Architecture / Schéma

```plantuml
@startuml NINA-AES_Observability
title Stack observabilité LGTM — flux de données

skinparam backgroundColor #FAFAFA
skinparam shadowing false
skinparam component { BackgroundColor #EEF2FF; BorderColor #4F46E5 }
skinparam database  { BackgroundColor #FEF3C7; BorderColor #D97706 }
skinparam cloud     { BackgroundColor #ECFDF5; BorderColor #059669 }

package "Cluster K3s (ou Docker Compose dev)" {
  package "ns: services" {
    component "identity-service\n+ pino + OTel SDK\n+ /metrics" as Identity
    component "ai-service\n+ structlog + OTel\n+ /metrics" as AI
    component "auth-service\n+ pino + OTel\n+ /metrics" as Auth
    component "… (8 autres)" as Others
  }

  package "ns: observability" {
    component "OpenTelemetry\nCollector 0.119" as OTel
    component "Prometheus 3.4\n(scrape /metrics)" as Prom
    component "Loki 3.5\n(logs)" as Loki
    component "Tempo 2.7\n(traces)" as Tempo
    component "Promtail 3.5\n(tail logs Docker)" as Promtail
    component "Grafana 12.3" as Grafana
    component "Alertmanager 0.28" as AM
    database "Volumes\npersistants" as Vol
  }
}

Identity --> OTel : OTLP gRPC (traces + metrics)
AI       --> OTel : OTLP HTTP (traces + metrics)
Auth     --> OTel : OTLP gRPC
Others   --> OTel

Identity ..> Loki  : pino HTTP transport (logs JSON)
AI       ..> Loki  : structlog → stdout → Promtail
Auth     ..> Loki  : pino HTTP transport
Promtail --> Loki  : push containers stdout

OTel --> Prom  : exporter prometheusremotewrite
OTel --> Loki  : exporter loki
OTel --> Tempo : exporter otlp

Prom  <-- Grafana : datasource
Loki  <-- Grafana : datasource
Tempo <-- Grafana : datasource

Prom  --> AM : règles alerting → notif
AM    --> Grafana : routage alertes UI

Prom  -down-> Vol
Loki  -down-> Vol
Tempo -down-> Vol

note bottom of OTel
  Le Collector est le **single
  point of routing**. Le code
  applicatif émet vers UN endpoint ;
  le collector éclate vers les 3
  backends. Bascule Loki→ElasticSearch
  ou Tempo→Jaeger = 1 ligne YAML.
end note
@enduml
```

---

## 4. Étapes d'implémentation

### Étape 4.1 — Réécrire `@nina-aes/logger` (Pino + transport Loki + redact PII)

**Pourquoi** : Pino est le logger Node le plus rapide (< 1 µs / log), JSON natif, ecosystem mature
pour les transports.

> ⚠️ **État réel du package (à NE PAS écraser)** : `@nina-aes/logger` n'est **plus un stub**. Il est
> déjà à la v0.2.0 et fournit le factory Pino (`logger.ts`), le masquage par `redact.paths`
> (`redaction.ts` — chemins NINA/biométrie/secrets), la corrélation `AsyncLocalStorage`
> (`correlation.ts`), les helpers `maskNina/maskEmail/maskPhone`, et un sous-module NestJS
> (`./nestjs`). **Ce qui MANQUE encore** et constitue le livrable de cette étape : (a) le
> **transport Loki** (`pino-loki`, absent des dépendances) ; (b) le **hook NINA sur le message
> libre** (le `redact.paths` actuel ne couvre QUE les clés structurées, pas un NINA glissé dans le
> `msg`). Le code ci-dessous est un **schéma cible illustratif** : il doit être **intégré dans la
> structure existante** (ajout du transport dans `logger.ts` + ajout du hook), **jamais** réécrire
> `index.ts` d'un bloc, sous peine de perdre corrélation, helpers et module NestJS déjà livrés.
> **Statut : conçu, intégration Phase 2.**

**Fichier(s) à modifier** : `packages/logger/src/logger.ts` (ajout transport Loki + hook NINA) —
**ne pas** remplacer `index.ts` qui réexporte la structure existante.

```ts
// SCHÉMA CIBLE ILLUSTRATIF — à INTÉGRER dans packages/logger/src/logger.ts
// (ajout transport Loki + hook scrubNina). NE PAS écraser index.ts/redaction.ts/
// correlation.ts/nestjs déjà livrés (cf. encadré ci-dessus). Statut : conçu, Phase 2.
/**
 * @file Logger NINA-AES — Pino structuré JSON + transport Loki + redact PII.
 *
 * Variables d'environnement consommées :
 *   LOG_LEVEL          : debug | info | warn | error (défaut: info)
 *   LOG_TRANSPORT      : pretty | loki | both (défaut: pretty en dev, loki en prod)
 *   LOKI_URL           : http://loki:3100 (requis si transport loki)
 *   LOKI_TENANT_ID     : nina-aes (optionnel, isolation multi-tenant)
 *   SERVICE_NAME       : identity-service (label loki obligatoire)
 *   SERVICE_VERSION    : 1.2.3 (depuis package.json — label loki)
 *   ENV                : dev | staging | prod (label loki)
 */
import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

/** Champs à **toujours** caviardiser (cf. RGPD + souveraineté NINA). */
const PII_REDACT_PATHS = [
  // NINA brut (15 chars) → "***REDACTED***"
  'nina',
  'ninaRaw',
  '*.nina',
  '*.ninaRaw',
  // Biométrie
  'fingerprintHash',
  '*.fingerprintHash',
  'faceEmbedding',
  // Données personnelles
  'dateNaissance',
  'dateOfBirth',
  '*.dateNaissance',
  // Secrets accidentels
  'password',
  'token',
  'refreshToken',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  'req.headers.authorization',
  'req.headers.cookie',
];

/**
 * Regex NINA brut : 14 chiffres + 1 lettre de contrôle (ex. 18903102015042V).
 * Utilisée pour caviardiser le **message libre** et toute valeur string, car
 * `redact.paths` ne couvre QUE les clés structurées listées plus haut.
 */
const NINA_REGEX = /\b\d{14}[A-Z]\b/g;
const NINA_CENSOR = '***NINA-REDACTED***';

/** Caviarde récursivement tout NINA brut trouvé dans les valeurs string d'un objet. */
function scrubNina<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(NINA_REGEX, NINA_CENSOR) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(scrubNina) as unknown as T;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value as Record<string, unknown>)) {
      (value as Record<string, unknown>)[k] = scrubNina((value as Record<string, unknown>)[k]);
    }
  }
  return value;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown> | Error): void;
  /** Sous-logger contextualisé (ex: par requête HTTP). */
  child(bindings: Record<string, unknown>): Logger;
}

function buildOptions(serviceName: string): LoggerOptions {
  const env = process.env.ENV ?? 'dev';
  const level = (process.env.LOG_LEVEL as LogLevel) ?? 'info';
  return {
    level,
    base: {
      service: serviceName,
      version: process.env.SERVICE_VERSION ?? 'unknown',
      env,
    },
    redact: {
      paths: PII_REDACT_PATHS,
      censor: '***REDACTED***',
    },
    // Hook NINA : scanne le **message libre** + les valeurs string AVANT émission.
    // `redact.paths` ne caviarde que les clés connues ; ce hook attrape un NINA
    // glissé dans une interpolation de message ou une clé non listée.
    hooks: {
      logMethod(args, method) {
        const scrubbed = args.map((a) =>
          typeof a === 'string' || (a && typeof a === 'object') ? scrubNina(a) : a,
        );
        return method.apply(this, scrubbed as Parameters<typeof method>);
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
}

function buildTransport(): pino.TransportTargetOptions[] | undefined {
  const mode = process.env.LOG_TRANSPORT ?? (process.env.ENV === 'prod' ? 'loki' : 'pretty');
  const targets: pino.TransportTargetOptions[] = [];

  if (mode === 'pretty' || mode === 'both') {
    targets.push({
      target: 'pino-pretty',
      level: 'debug',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
    });
  }
  if (mode === 'loki' || mode === 'both') {
    const lokiUrl = process.env.LOKI_URL;
    if (!lokiUrl) throw new Error('[logger] LOKI_URL required when LOG_TRANSPORT=loki');
    targets.push({
      target: 'pino-loki',
      level: 'info',
      options: {
        host: lokiUrl,
        labels: {
          service: process.env.SERVICE_NAME ?? 'unknown',
          env: process.env.ENV ?? 'dev',
        },
        batching: true,
        interval: 5,
        timeout: 30_000,
      },
    });
  }
  return targets.length > 0 ? targets : undefined;
}

export function createLogger(serviceName: string): Logger {
  const transport = buildTransport();
  const base: PinoLogger = pino(
    buildOptions(serviceName),
    transport ? pino.transport({ targets: transport }) : undefined,
  );

  const wrap = (p: PinoLogger): Logger => ({
    debug: (m, meta) => p.debug(meta ?? {}, m),
    info: (m, meta) => p.info(meta ?? {}, m),
    warn: (m, meta) => p.warn(meta ?? {}, m),
    error: (m, meta) => {
      if (meta instanceof Error) p.error({ err: meta }, m);
      else p.error(meta ?? {}, m);
    },
    child: (bindings) => wrap(p.child(bindings)),
  });
  return wrap(base);
}

export default createLogger;
```

**Tests à ajouter** : compléter `packages/logger/src/__tests__/redaction.test.ts` (fichier déjà
existant — il teste `maskNina/maskEmail/maskPhone` ; lui ajouter les deux cas ci-dessous : champ
structuré ET NINA dans le message libre).

```ts
import { createLogger } from '../index';

describe('logger PII redact', () => {
  it('redacts nina field', () => {
    const captured: string[] = [];
    const origStdout = process.stdout.write.bind(process.stdout);
    // @ts-expect-error monkey-patch test
    process.stdout.write = (chunk: any) => {
      captured.push(String(chunk));
      return true;
    };
    try {
      const log = createLogger('identity-service');
      log.info('created citizen', { nina: '18903102015042V', name: 'Test' });
    } finally {
      // @ts-expect-error restore
      process.stdout.write = origStdout;
    }
    const all = captured.join('');
    expect(all).not.toContain('18903102015042V');
    expect(all).toContain('***REDACTED***');
  });

  it('redacts a NINA embedded in the free-text message', () => {
    const captured: string[] = [];
    const origStdout = process.stdout.write.bind(process.stdout);
    // @ts-expect-error monkey-patch test
    process.stdout.write = (chunk: any) => {
      captured.push(String(chunk));
      return true;
    };
    try {
      const log = createLogger('identity-service');
      // NINA glissé dans le message libre (PAS dans un champ structuré).
      log.info('created citizen 18903102015042V from terminal X');
    } finally {
      // @ts-expect-error restore
      process.stdout.write = origStdout;
    }
    const all = captured.join('');
    expect(all).not.toContain('18903102015042V');
    expect(all).toContain('***NINA-REDACTED***');
  });
});
```

**Dépendance à AJOUTER** dans `packages/logger/package.json` (les autres sont déjà présentes :
`pino@^9.5.0`, `pino-pretty@^11.3.0`, `pino-http`, `uuid`) :

```jsonc
{
  "dependencies": {
    // seule nouveauté de cette étape : le transport Loki
    "pino-loki": "^2.4.0",
  },
}
```

---

### Étape 4.2 — Endpoint `/metrics` Prometheus côté NestJS

**Pourquoi** : Prometheus scrape les services via HTTP. Chaque service NestJS expose `GET /metrics`
au format texte Prometheus. `nestjs-prometheus` ajoute en bonus les histogrammes HTTP (latence
p50/p95/p99 par route) automatiquement.

```ts
// services/<service>/src/observability/metrics.module.ts
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true }, // Node heap, GC, event loop lag
      defaultLabels: {
        service: process.env.SERVICE_NAME ?? 'unknown',
        env: process.env.ENV ?? 'dev',
      },
      path: '/metrics',
    }),
  ],
})
export class MetricsModule {}
```

**À importer dans chaque `AppModule`** :

```ts
@Module({
  imports: [MetricsModule /* … autres modules */],
})
export class AppModule {}
```

**Métriques métier custom** (ex. nombre de NINA validés) :

```ts
// services/identity-service/src/citizen/citizen.metrics.ts
import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class CitizenMetrics {
  constructor(
    @InjectMetric('citizens_validated_total')
    public readonly validated: Counter<'result'>,
    @InjectMetric('nina_check_duration_seconds')
    public readonly checkDuration: Histogram<string>,
  ) {}
}
```

> 💡 Convention de nommage Prometheus : `<service>_<subject>_<unit>` (ex.
> `identity_citizens_validated_total`). Snake_case obligatoire.

---

### Étape 4.3 — Endpoint `/metrics` Prometheus côté FastAPI

```python
# services/ai-service/app/observability.py
from prometheus_fastapi_instrumentator import Instrumentator
from fastapi import FastAPI

def instrument(app: FastAPI) -> None:
    """Active /metrics + métriques HTTP par défaut + labels service/env."""
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health"],
    ).instrument(app).expose(
        app,
        endpoint="/metrics",
        include_in_schema=False,
    )
```

```python
# services/ai-service/app/main.py
from fastapi import FastAPI
from .observability import instrument

app = FastAPI(title="ai-service")
instrument(app)
# … routes
```

**Métriques métier custom** :

```python
from prometheus_client import Counter, Histogram

NINA_DETECTED = Counter(
    "ai_nina_errors_detected_total",
    "Nombre d'erreurs NINA détectées",
    ["error_class"],
)
INFERENCE_LATENCY = Histogram(
    "ai_inference_duration_seconds",
    "Latence inference IA",
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)
```

---

### Étape 4.4 — Instrumentation OpenTelemetry (traces)

**NestJS** — fichier à charger **avant** `NestFactory.create()` :

```ts
// services/<service>/src/observability/otel.ts
import { readFileSync } from 'node:fs';
import { credentials } from '@grpc/grpc-js';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
// ⚠️ API OTel ≥ 1.x : `new Resource()` est DÉPRÉCIÉ → `resourceFromAttributes`.
// `SemanticResourceAttributes` est remplacé par les constantes `ATTR_*` (incubating
// pour DEPLOYMENT_ENVIRONMENT_NAME). Ne pas régresser vers l'ancienne API.
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions/incubating';

/**
 * Construit les credentials gRPC pour l'export OTLP.
 * Souveraineté + intégrité : en staging/prod l'export est **TLS (mTLS)**, jamais en clair.
 * Le collector OTel reçoit alors uniquement des clients porteurs d'un certificat valide
 * de la PKI interne (cf. ADR-034). Le mode insecure n'est toléré qu'en `dev`.
 */
function otlpCredentials() {
  if ((process.env.ENV ?? 'dev') === 'dev' && process.env.OTEL_EXPORTER_OTLP_INSECURE === 'true') {
    return credentials.createInsecure();
  }
  const ca = readFileSync(process.env.OTEL_EXPORTER_OTLP_CA ?? '/etc/nina/tls/ca.crt');
  // mTLS : on présente le certificat client du service (PKI interne ADR-034).
  const cert = process.env.OTEL_EXPORTER_OTLP_CLIENT_CERT
    ? readFileSync(process.env.OTEL_EXPORTER_OTLP_CLIENT_CERT)
    : undefined;
  const key = process.env.OTEL_EXPORTER_OTLP_CLIENT_KEY
    ? readFileSync(process.env.OTEL_EXPORTER_OTLP_CLIENT_KEY)
    : undefined;
  return credentials.createSsl(ca, key, cert);
}

export function startOtel(serviceName: string): void {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '0.0.0',
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.ENV ?? 'dev',
    }),
    traceExporter: new OTLPTraceExporter({
      // gRPC over TLS : préfixe https:// + credentials mTLS (cf. otlpCredentials()).
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'https://otel-collector:4317',
      credentials: otlpCredentials(),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // bruit
      }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown().catch(() => undefined));
}
```

```ts
// services/<service>/src/main.ts
import { startOtel } from './observability/otel';
startOtel(process.env.SERVICE_NAME ?? 'unknown'); // EN PREMIER
import { NestFactory } from '@nestjs/core';
// … reste
```

**FastAPI** :

```python
# services/ai-service/app/otel.py
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
import os

def init_tracing(service_name: str) -> None:
    provider = TracerProvider(resource=Resource.create({
        "service.name": service_name,
        "service.version": os.environ.get("SERVICE_VERSION", "0.0.0"),
        # clé sémantique recommandée : deployment.environment.name
        "deployment.environment.name": os.environ.get("ENV", "dev"),
    }))

    # Souveraineté + intégrité : export OTLP en TLS/mTLS hors dev (cf. ADR-034).
    # `insecure=True` UNIQUEMENT en dev local ; sinon credentials gRPC TLS avec CA
    # interne + certificat client (mTLS) de la PKI NINA.
    env = os.environ.get("ENV", "dev")
    if env == "dev" and os.environ.get("OTEL_EXPORTER_OTLP_INSECURE") == "true":
        exporter = OTLPSpanExporter(
            endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317"),
            insecure=True,
        )
    else:
        from grpc import ssl_channel_credentials  # gRPC TLS

        def _read(path: str | None):
            return open(path, "rb").read() if path else None

        creds = ssl_channel_credentials(
            root_certificates=_read(os.environ.get("OTEL_EXPORTER_OTLP_CA", "/etc/nina/tls/ca.crt")),
            private_key=_read(os.environ.get("OTEL_EXPORTER_OTLP_CLIENT_KEY")),
            certificate_chain=_read(os.environ.get("OTEL_EXPORTER_OTLP_CLIENT_CERT")),
        )
        exporter = OTLPSpanExporter(
            endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "otel-collector:4317"),
            credentials=creds,  # TLS/mTLS, PAS insecure
        )

    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
```

```python
# services/ai-service/app/main.py
from .otel import init_tracing
init_tracing("ai-service")

from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

app = FastAPI()
FastAPIInstrumentor.instrument_app(app)
```

---

### Étape 4.5 — Stack observabilité dans `docker-compose.dev.yml`

**Fichier(s) à modifier** : `infrastructure/docker/docker-compose.dev.yml` (ajout d'un profil
`observability`).

```yaml
  # ── OpenTelemetry Collector — routeur OTLP ────────────────────
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.119.0
    container_name: nina-otel-collector
    profiles: [observability]
    command: ['--config=/etc/otelcol/config.yml']
    volumes:
      - ./observability/otel-collector.yml:/etc/otelcol/config.yml:ro
    ports:
      - '4317:4317'   # OTLP gRPC
      - '4318:4318'   # OTLP HTTP
    depends_on:
      - prometheus
      - loki
      - tempo

  # ── Prometheus 3.4 ─────────────────────────────────────────────
  prometheus:
    image: prom/prometheus:v3.4.1
    container_name: nina-prometheus
    profiles: [observability]
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.enable-remote-write-receiver'
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./observability/rules:/etc/prometheus/rules:ro
      - nina-prometheus-data:/prometheus
    ports: ['9090:9090']
    healthcheck:
      test: ['CMD', 'wget', '-q', '--spider', 'http://localhost:9090/-/healthy']
      interval: 30s

  # ── Loki 3.5 ──────────────────────────────────────────────────
  loki:
    image: grafana/loki:3.5.0
    container_name: nina-loki
    profiles: [observability]
    command: ['-config.file=/etc/loki/local-config.yml']
    volumes:
      - ./observability/loki.yml:/etc/loki/local-config.yml:ro
      - nina-loki-data:/loki
    ports: ['3100:3100']

  # ── Promtail 3.5 (ships container logs to Loki) ───────────────
  promtail:
    image: grafana/promtail:3.5.0
    container_name: nina-promtail
    profiles: [observability]
    command: ['-config.file=/etc/promtail/config.yml']
    volumes:
      - ./observability/promtail.yml:/etc/promtail/config.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on: [loki]

  # ── Tempo 2.7 (traces OTLP) ───────────────────────────────────
  tempo:
    image: grafana/tempo:2.7.1
    container_name: nina-tempo
    profiles: [observability]
    command: ['-config.file=/etc/tempo/config.yml']
    volumes:
      - ./observability/tempo.yml:/etc/tempo/config.yml:ro
      - nina-tempo-data:/var/tempo
    ports:
      - '3200:3200'   # API HTTP
      - '9095:9095'   # tempo OTLP gRPC ingest (interne)

  # ── Grafana 12.3 ──────────────────────────────────────────────
  grafana:
    image: grafana/grafana:12.3.0
    container_name: nina-grafana
    profiles: [observability]
    environment:
      # ── Compte admin local : secret injecté depuis Vault (KV) au boot ──────
      # JAMAIS admin/admin. Le mot de passe vient de Vault via `__FILE` (fichier
      # monté par l'agent Vault) — aucun secret en clair dans compose/.env.
      # En dev, `pnpm vault:bootstrap` provisionne secret/observability/grafana.
      GF_SECURITY_ADMIN_USER__FILE: /run/secrets/grafana_admin_user
      GF_SECURITY_ADMIN_PASSWORD__FILE: /run/secrets/grafana_admin_password
      GF_USERS_ALLOW_SIGN_UP: 'false'
      GF_AUTH_ANONYMOUS_ENABLED: 'false'
      GF_FEATURE_TOGGLES_ENABLE: traceqlEditor
      # ── SSO Keycloak (OIDC) — l'auth réelle passe par l'IdP souverain ─────
      # Le compte admin local reste un "break-glass" ; les opérateurs se
      # connectent via Keycloak (rôles mappés Editor/Admin). Réutilise le realm
      # NINA (ADR-013). Secrets client_id/secret également via Vault `__FILE`.
      GF_AUTH_GENERIC_OAUTH_ENABLED: 'true'
      GF_AUTH_GENERIC_OAUTH_NAME: Keycloak
      GF_AUTH_GENERIC_OAUTH_CLIENT_ID__FILE: /run/secrets/grafana_oidc_client_id
      GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET__FILE: /run/secrets/grafana_oidc_client_secret
      GF_AUTH_GENERIC_OAUTH_SCOPES: 'openid email profile roles'
      GF_AUTH_GENERIC_OAUTH_AUTH_URL: ${KEYCLOAK_URL}/realms/nina/protocol/openid-connect/auth
      GF_AUTH_GENERIC_OAUTH_TOKEN_URL: ${KEYCLOAK_URL}/realms/nina/protocol/openid-connect/token
      GF_AUTH_GENERIC_OAUTH_API_URL: ${KEYCLOAK_URL}/realms/nina/protocol/openid-connect/userinfo
      GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH: "contains(realm_access.roles[*], 'grafana-admin') && 'Admin' || contains(realm_access.roles[*], 'grafana-editor') && 'Editor' || 'Viewer'"
      GF_AUTH_GENERIC_OAUTH_TLS_CLIENT_CA: /etc/nina/tls/ca.crt
      GF_SERVER_ROOT_URL: ${GRAFANA_ROOT_URL:-https://grafana.nina.local}
    volumes:
      - ./observability/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./observability/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - nina-grafana-data:/var/lib/grafana
    ports: ['3000:3000']
    depends_on: [prometheus, loki, tempo]

  # ── Alertmanager 0.28 ─────────────────────────────────────────
  alertmanager:
    image: prom/alertmanager:v0.28.1
    container_name: nina-alertmanager
    profiles: [observability]
    command: ['--config.file=/etc/alertmanager/config.yml']
    volumes:
      - ./observability/alertmanager.yml:/etc/alertmanager/config.yml:ro
    ports: ['9093:9093']

volumes:
  nina-prometheus-data:
  nina-loki-data:
  nina-tempo-data:
  nina-grafana-data:
```

**Démarrage** :

```powershell
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml `
  --profile observability up -d

# Ouverture des UIs
# Grafana : connexion via Keycloak (bouton « Sign in with Keycloak »).
# Le compte admin local est un break-glass — son secret vient de Vault
# (cf. `pnpm vault:bootstrap`), JAMAIS admin/admin.
Start-Process http://localhost:3000   # Grafana (SSO Keycloak OIDC)
Start-Process http://localhost:9090   # Prometheus
Start-Process http://localhost:9093   # Alertmanager
```

---

### Étape 4.6 — Configurations (fichiers à créer dans `infrastructure/observability/`)

**`prometheus.yml`** :

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: nina-aes-dev
    env: ${ENV:-dev}

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - '/etc/prometheus/rules/*.yml'

scrape_configs:
  - job_name: 'nina-services'
    static_configs:
      - targets:
          - 'identity-service:3001'
          - 'auth-service:3002'
          - 'audit-service:3007'
          - 'document-service:3004'
          - 'ai-service:3003'
          - 'anticorruption-service:3009'
    metrics_path: /metrics

  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8888'] # self metrics du collector

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

**`otel-collector.yml`** :

```yaml
receivers:
  otlp:
    protocols:
      # mTLS côté réception : seuls les services porteurs d'un cert PKI interne
      # peuvent pousser traces/metrics/logs (cf. ADR-034). En dev local on peut
      # commenter le bloc `tls` ; en staging/prod il est OBLIGATOIRE.
      grpc:
        endpoint: 0.0.0.0:4317
        tls:
          ca_file: /etc/nina/tls/ca.crt
          cert_file: /etc/nina/tls/otel-collector.crt
          key_file: /etc/nina/tls/otel-collector.key
          client_ca_file: /etc/nina/tls/ca.crt # exige un cert client => mTLS
      http:
        endpoint: 0.0.0.0:4318
        tls:
          ca_file: /etc/nina/tls/ca.crt
          cert_file: /etc/nina/tls/otel-collector.crt
          key_file: /etc/nina/tls/otel-collector.key

processors:
  batch:
    timeout: 5s
    send_batch_size: 1000
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  # Défense en profondeur : caviarde tout NINA brut résiduel dans le corps des
  # logs AVANT export Loki (au cas où un service mal instrumenté oublierait le
  # hook Pino). Un NINA ne doit JAMAIS être indexé par Loki.
  transform/redact-nina:
    log_statements:
      - context: log
        statements:
          - replace_pattern(body, "\\b\\d{14}[A-Z]\\b", "***NINA-REDACTED***")

exporters:
  prometheusremotewrite:
    endpoint: http://prometheus:9090/api/v1/write
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
  otlp/tempo:
    endpoint: tempo:9095
    # Intégrité du flux de traces : TLS/mTLS vers Tempo (cf. ADR-034).
    # `insecure: true` est RÉSERVÉ au dev local jetable ; en staging/prod on
    # présente le certificat client du collector (PKI interne). Ne pas régresser.
    tls:
      insecure: false
      ca_file: /etc/nina/tls/ca.crt
      cert_file: /etc/nina/tls/otel-collector.crt
      key_file: /etc/nina/tls/otel-collector.key

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheusremotewrite]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, transform/redact-nina, batch]
      exporters: [loki]
```

**`rules/nina-aes-slo.yml`** (12 règles d'alerting) :

```yaml
groups:
  - name: nina-aes-slo
    interval: 30s
    rules:
      - alert: HighLatencyP95
        expr:
          histogram_quantile(0.95, sum by (le, service)
          (rate(http_request_duration_seconds_bucket[5m]))) > 0.5
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: 'p95 latency > 500ms sur {{ $labels.service }}'
          runbook: 'docs/observability/RUNBOOK.md#high-latency-p95'

      - alert: HighError5xxRate
        expr:
          sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service)
          (rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: 'Taux 5xx > 1% sur {{ $labels.service }}'
          runbook: 'docs/observability/RUNBOOK.md#error-rate-5xx'

      - alert: ServiceDown
        expr: up{job="nina-services"} == 0
        for: 2m
        labels: { severity: critical }
        annotations:
          summary: 'Service {{ $labels.instance }} DOWN'
          runbook: 'docs/observability/RUNBOOK.md#service-down'

      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.10
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: 'Disque < 10% libre sur {{ $labels.mountpoint }}'
          runbook: 'docs/observability/RUNBOOK.md#disk-space-low'

      - alert: PostgresConnectionsHigh
        expr: sum by (datname) (pg_stat_activity_count) / pg_settings_max_connections > 0.8
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: 'Pool Postgres > 80% sur {{ $labels.datname }}'
          runbook: 'docs/observability/RUNBOOK.md#postgres-connections-high'

      - alert: RabbitMQQueueBacklog
        expr: rabbitmq_queue_messages_ready > 1000
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: 'Queue {{ $labels.queue }} a {{ $value }} messages en attente'
          runbook: 'docs/observability/RUNBOOK.md#rabbitmq-queue-backlog'

      - alert: NinaValidationFailureSpike
        expr: rate(identity_citizens_validated_total{result="failure"}[5m]) > 1
        for: 5m
        labels: { severity: warning, domain: business }
        annotations:
          summary: 'Pic de NINA invalides — attaque ou bug ?'
          runbook: 'docs/observability/RUNBOOK.md#nina-validation-spike'

      - alert: AIInferenceLatencyP99
        expr:
          histogram_quantile(0.99, sum by (le) (rate(ai_inference_duration_seconds_bucket[5m]))) >
          2.0
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: 'p99 inference IA > 2s — modèle dégradé ou file pleine'
          runbook: 'docs/observability/RUNBOOK.md#ai-inference-latency-p99'

      - alert: NodeHeapPressure
        expr: nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.9
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: 'Heap Node > 90% sur {{ $labels.service }} — risque OOM'
          runbook: 'docs/observability/RUNBOOK.md#node-heap-pressure'

      - alert: EventLoopLag
        expr: nodejs_eventloop_lag_seconds > 0.1
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: 'Event loop lag > 100ms sur {{ $labels.service }}'
          runbook: 'docs/observability/RUNBOOK.md#event-loop-lag'

      - alert: LokiIngestionDown
        expr: rate(loki_distributor_lines_received_total[5m]) == 0
        for: 5m
        labels: { severity: critical, domain: observability }
        annotations:
          summary: 'Loki ne reçoit plus de logs — perte de traçabilité'
          runbook: 'docs/observability/RUNBOOK.md#loki-ingestion-down'

      - alert: AuditChainBreak
        # CANON ADR-007/014 : l'audit est une HASH-CHAIN SHA-256, PAS un arbre de
        # Merkle. La métrique compte les ruptures de chaînage de hash (hash(n) !=
        # hash(prev) attendu). Ne pas renommer en "merkle".
        expr: increase(audit_hashchain_break_total[1h]) > 0
        for: 1m
        labels: { severity: critical, domain: security }
        annotations:
          summary: '🚨 Rupture de hash-chain audit (SHA-256) — INTERVENTION IMMÉDIATE'
          runbook: 'docs/observability/RUNBOOK.md#audit-chain-break'
```

> 🔒 **`AuditChainBreak`** est l'alerte la plus critique : elle signifie qu'un attaquant a manipulé
> les logs d'audit. L'intégrité repose sur une **hash-chain SHA-256** (ADR-007/014), pas sur un
> arbre de Merkle. Procédure runbook (`docs/observability/RUNBOOK.md#audit-chain-break`) = isolation
> immédiate + ANSSI / CISO CTDEC contactés.

**`alertmanager.yml`** — récepteurs **souverains** uniquement (CANON souveraineté : pas de Slack /
PagerDuty / Opsgenie US sur le cœur) :

```yaml
# Routage vers des récepteurs auto-hébergés : SMTP on-prem, Matrix (Synapse
# interne) et webhook on-prem. AUCUN SaaS US. Les secrets (mot de passe SMTP,
# access_token Matrix, URL webhook) sont injectés depuis Vault au déploiement
# via les variantes `*_file` — jamais en clair dans ce YAML.
global:
  resolve_timeout: 5m
  smtp_smarthost: 'mailhog:1025' # dev ; en prod : relais SMTP souverain CTDEC
  smtp_from: 'alertmanager@nina.local'

route:
  receiver: 'email-ops' # défaut
  group_by: [alertname, service]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    # Critiques sécurité (ex. AuditChainBreak) → Matrix + email, escalade rapide.
    - matchers: ['severity="critical"']
      receiver: 'matrix-soc'
      group_wait: 10s
      repeat_interval: 1h
      continue: true
    - matchers: ['domain="security"']
      receiver: 'webhook-soc'

receivers:
  - name: 'email-ops'
    email_configs:
      - to: 'ops@ctdec.gov.ml'
        auth_password_file: /run/secrets/alertmanager_smtp_password # Vault
        send_resolved: true

  - name: 'matrix-soc'
    # Pont Matrix on-prem (Synapse souverain). PAS de Slack/PagerDuty.
    webhook_configs:
      - url: 'http://matrix-webhook:9088/alerts'
        http_config:
          authorization:
            type: Bearer
            credentials_file: /run/secrets/alertmanager_matrix_token # Vault
        send_resolved: true

  - name: 'webhook-soc'
    # Webhook interne (SIEM / orchestrateur d'incidents on-prem).
    webhook_configs:
      - url: 'http://soc-incident-bridge:8080/nina/alerts'
        send_resolved: true
```

> 🔒 **Souveraineté des alertes** : Slack, PagerDuty et Opsgenie sont des SaaS US ; une alerte
> contient des métadonnées d'État (nom de service, gravité, parfois IP source). On les route donc
> exclusivement vers email SMTP on-prem, Matrix (Synapse souverain) ou webhook interne. Le mock
> historique « Slack/PagerDuty » est remplacé par MailHog (dev) puis le relais SMTP CTDEC (prod).

---

### Étape 4.7 — Dashboards Grafana (provisioning JSON)

**Structure** : `infrastructure/observability/grafana/provisioning/`

```text
provisioning/
├── datasources/
│   └── all.yml                # Prometheus + Loki + Tempo en datasources
├── dashboards/
│   └── nina-aes.yml           # provider qui charge dashboards/*.json
dashboards/
├── golden-signals.json        # latence + traffic + erreurs + saturation
├── nina-business.json         # NINA validés, IA détections, audit hash-chain SHA-256
├── postgres.json              # connections, locks, slow queries
├── redis.json                 # hit rate, memory, evictions
├── rabbitmq.json              # queues, consumers, ack rate
└── node-runtime.json          # heap, GC, event loop lag (Node + Python GIL)
```

**`provisioning/datasources/all.yml`** :

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: tempo
          matcherRegex: 'trace_id=(\w+)'
          name: TraceID
          url: '$${__value.raw}'
  - name: Tempo
    type: tempo
    uid: tempo
    access: proxy
    url: http://tempo:3200
    jsonData:
      tracesToLogsV2:
        datasourceUid: loki
```

> 💡 Les JSON dashboards sont longs (1-2 KB chacun). On les génère en exportant depuis l'UI Grafana
> puis on les commit. Versionner permet aussi de **revues PR** des changements de dashboards.

---

### Étape 4.8 — Runbook de triage

**Fichier à créer** : `docs/observability/RUNBOOK.md` ⏳ **(produit en Wave 4)**. Chaque règle
d'alerting de l'étape 4.6 porte une annotation `runbook:` qui pointe vers une **ancre** de ce
fichier ; le runbook doit donc exposer, au minimum, une section par ancre référencée :

| Alerte                       | Ancre runbook attendue       |
| ---------------------------- | ---------------------------- |
| `HighLatencyP95`             | `#high-latency-p95`          |
| `HighError5xxRate`           | `#error-rate-5xx`            |
| `ServiceDown`                | `#service-down`              |
| `DiskSpaceLow`               | `#disk-space-low`            |
| `PostgresConnectionsHigh`    | `#postgres-connections-high` |
| `RabbitMQQueueBacklog`       | `#rabbitmq-queue-backlog`    |
| `NinaValidationFailureSpike` | `#nina-validation-spike`     |
| `AIInferenceLatencyP99`      | `#ai-inference-latency-p99`  |
| `NodeHeapPressure`           | `#node-heap-pressure`        |
| `EventLoopLag`               | `#event-loop-lag`            |
| `LokiIngestionDown`          | `#loki-ingestion-down`       |
| `AuditChainBreak`            | `#audit-chain-break`         |

Extrait (les 3 procédures critiques rédigées en premier) :

```markdown
# RUNBOOK — Procédures de triage NINA-AES

> Une alerte qui ne pointe pas vers une procédure est du bruit.

## `HighLatencyP95`

1. Ouvrir Grafana → dashboard "Golden Signals" → filtre service en alerte
2. Identifier la route : la p95 est-elle élevée sur 1 endpoint ou tous ?
3. Si 1 endpoint : ouvrir Tempo via "View traces" → traces les + lentes
4. Causes fréquentes : N+1 Prisma, pool DB saturé, Elasticsearch lent
5. Mitigation immédiate : `kubectl scale deploy/<service> --replicas=4`
6. Suivi : ticket Jira `obs-<NN>` avec lien dashboard

## `AuditChainBreak`

🚨 **CRITIQUE — INTERVENTION IMMÉDIATE**

1. **Isoler** : `kubectl scale deploy/audit-service --replicas=0`
2. **Notifier** : email CISO CTDEC + appel ANSSI Mali (+223 ...)
3. **Préserver** : `pg_dump nina_aes_db.audit_logs > /backup/audit-incident-$(date +%s).sql`
4. **Investiguer** : Loki query `{service="audit-service"} |= "hashchain"` (chaîne SHA-256,
   ADR-007/014)
5. **Ne pas redéployer** sans go formel du CISO

## `NinaValidationSpike`

1. Identifier la source :
   `sum by (ip) (rate(http_requests_total{path="/nina/validate",status="400"}[5m]))`
2. Si 1 IP dominante → blocage WAF (cf. doc 15)
3. Si dispersé → bug applicatif récent (`git log --since 1.hour`)
4. Si attaque distribuée → alerte SOC + rate-limit serré (5 req/min/IP)

…
```

---

## 5. Validation locale

```powershell
# 1) Stack démarrée
docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml `
  --profile observability ps

# 2) Endpoints /metrics répondent
curl http://localhost:3001/metrics | Select-String "http_request_duration_seconds"
curl http://localhost:3003/metrics | Select-String "ai_inference_duration_seconds"

# 3) Prometheus voit tous les targets UP
Start-Process http://localhost:9090/targets
# → tous les jobs en état "UP" (vert)

# 4) Loki reçoit des logs
curl -G 'http://localhost:3100/loki/api/v1/query_range' `
  --data-urlencode 'query={service="identity-service"}' `
  --data-urlencode 'limit=10'

# 5) Tempo reçoit des traces
# Générer du trafic d'abord :
1..50 | ForEach-Object { curl http://localhost:3001/api/health }
Start-Process http://localhost:3000   # Grafana → Tempo → Search

# 6) Grafana provisionning OK
# Connexion via Keycloak (SSO OIDC) → menu Dashboards → 6 dashboards visibles.
# (Le compte admin local break-glass a son mot de passe dans Vault, pas admin/admin.)

# 7) Test redact PII
pnpm --filter @nina-aes/logger test
# → "redacts nina field" ✅
```

---

## 6. Pièges courants & dépannage

| Symptôme                                               | Cause probable                                     | Solution                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Prometheus target `DOWN` mais le service tourne        | Service écoute `127.0.0.1` au lieu de `0.0.0.0`    | Forcer `app.listen(port, '0.0.0.0')` dans NestJS                                                            |
| Loki refuse logs : `entry too far behind`              | Horloge du runner desynchronisée                   | NTP obligatoire ; `chrony` ou `ntpd` actif sur les hôtes                                                    |
| Tempo : trace incomplète (un seul span)                | OTel SDK pas démarré AVANT le serveur HTTP         | Vérifier que `startOtel()` est appelé **avant** `NestFactory.create()`                                      |
| Pino transport `loki` : flood d'erreurs `ECONNREFUSED` | Loki pas encore prêt au boot du service            | Pino retry built-in ; si persistent, healthcheck `depends_on: { condition: service_healthy }`               |
| Grafana dashboards vides à la 1ère ouverture           | Provisioning lu uniquement au boot Grafana         | `docker compose restart grafana` après modif des JSON                                                       |
| Alertmanager envoie 10 mails en 5 min                  | Pas de `group_interval` configuré                  | Dans `alertmanager.yml` : `group_by: [alertname, service]` + `group_interval: 5m`                           |
| Métrique custom NestJS jamais visible                  | Métrique enregistrée mais pas exposée              | Importer `MetricsModule` au `AppModule`, vérifier `Counter.inc()` est appelé                                |
| FastAPI : `/metrics` 404                               | `Instrumentator.expose(app)` non appelé            | Voir étape 4.3, ordre : `instrument().expose()`                                                             |
| Cardinality explosion Prometheus (RAM > 4 GB)          | Label avec valeur dynamique (ex. `user_id`)        | Audit : `topk(10, count by (__name__)({__name__=~".+"}))` ; supprimer labels haute cardinality              |
| `pino-pretty` en prod                                  | Devrait être JSON brut pour Loki                   | `LOG_TRANSPORT=loki` (pas `both`) en prod                                                                   |
| Loki retient logs > 30j                                | Compactor lent ou retention pas appliquée          | `loki.yml` : `compactor.retention_enabled: true` + `retention_period: 720h`                                 |
| Grafana : bouton Keycloak absent / `invalid_client`    | `GF_AUTH_GENERIC_OAUTH_*` ou secret Vault manquant | Vérifier `pnpm vault:bootstrap` (secret/observability/grafana) + client OIDC `grafana` dans le realm `nina` |
| NINA brut visible dans Loki                            | Service non instrumenté avec le hook Pino          | Vérifier `createLogger()` (hook NINA) ; filet collector `transform/redact-nina` actif                       |

---

## 7. Documentation à produire

- `docs/adr/ADR-017-observabilite-lgtm-stack.md` — décision LGTM vs ELK vs SaaS.
- `docs/observability/RUNBOOK.md` — 1 entrée par règle Alertmanager (12 minimum).
- `docs/observability/SLOs.md` — Service Level Objectives chiffrés :
  - Disponibilité 99.5 % `/api/nina/*`
  - p95 latence < 500 ms sur tous les endpoints publics
  - 0 rupture de hash-chain SHA-256 audit (ADR-007/014 ; alerte critique sans tolérance)
- Secrets Vault (KV `secret/observability/`) à provisionner via `pnpm vault:bootstrap` :
  `grafana_admin_user/password`, `grafana_oidc_client_id/secret`, `alertmanager_smtp_password`,
  `alertmanager_matrix_token`. Client OIDC `grafana` (mappers de rôles) à créer dans le realm `nina`
  (ADR-013). ⏳ **Provisioning réel = Phase 2** ; ce document fournit la configuration cible.
- Certificats PKI pour l'export OTLP (mTLS, ADR-034) : `otel-collector.crt/key` + CA interne montés
  dans le collector et les services. ⏳ **Émission = Phase 2** (chaîne PKI doc 15/ADR-034).
- Mise à jour `docs/02-ARCHITECTURE-GLOBALE.md` : section « Observabilité » pointant vers ce
  document + diagramme PlantUML.
- Mise à jour `docs/CHANGELOG.md` §2 : `@nina-aes/logger` passe de `stub` à `Pino + Loki ✅`.

---

## 8. Mini-rapport d'étape (template)

> ⚠️ **Template vierge** : les ✅ ci-dessous sont des **exemples de format**, PAS un état réel. À ce
> jour aucune ligne n'est acquise (la stack n'est pas déployée). Ne cocher ✅ qu'après vérification
> effective ; sinon laisser ⏳. Pour la soutenance : présenter ce document comme « conçu, Phase 2 ».

```markdown
### Rapport — Monitoring & Observabilité — JJ/MM/2026

- **Status** : ✅ Terminé / ⏳ En cours / ❌ Bloqué
- **Temps réel passé** : X heures
- **Logger Pino + redact PII** : ✅ test `redacts nina field` vert
- **Endpoints /metrics** : ✅ 6/6 services exposent (identity, auth, audit, document, ai,
  anticorruption)
- **OTel SDK** : ✅ traces visibles dans Tempo pour les 6 services
- **Prometheus** : ✅ 6 targets UP, retention 15j confirmée
- **Loki** : ✅ logs JSON indexés par labels {service, env, level}
- **Tempo** : ✅ trace search par TraceID fonctionnel
- **Grafana** : ✅ 6 dashboards provisionnés
- **Alertmanager** : ✅ 12 règles évaluées, test fire+silence ok
- **Runbook** : ✅ 12 entrées rédigées
- **Difficultés rencontrées** :
- **Solutions trouvées** :
- **Prochaines actions** : SLO dashboard (doc 18 testing), exporters Postgres/Redis
- **Captures jointes** : grafana-golden-signals.png, tempo-trace.png, runbook-toc.png
```

---

## 9. Checklist de fin d'étape

- [ ] `@nina-aes/logger` réécrit (Pino + transport Loki + redact PII)
- [ ] Test `redacts nina field` vert dans `packages/logger/src/__tests__/`
- [ ] 6 services NestJS / FastAPI exposent `/metrics` (200 OK + format Prometheus)
- [ ] `startOtel()` appelé en première ligne de `main.ts` / `main.py`
- [ ] Stack observability `docker compose --profile observability up -d` démarre
- [ ] Prometheus `/targets` : 100 % UP
- [ ] Loki reçoit des logs (`logcli` ou Grafana Explore)
- [ ] Tempo affiche des traces complètes (multi-spans cross-services)
- [ ] 6 dashboards Grafana visibles et alimentés
- [ ] 12 règles d'alerting évaluées (`Status: firing/inactive` dans UI Prometheus)
- [ ] Alertmanager teste un envoi mail souverain (vers MailHog SMTP 1025 / UI 8025 en dev)
- [ ] `RUNBOOK.md` couvre les 12 alertes
- [ ] `SLOs.md` rédigé
- [ ] `ADR-017` rédigé
- [ ] `docs/CHANGELOG.md` mis à jour (§2 logger + nouvelle entrée §15)
- [ ] Aucun NINA brut dans Loki (champ ET message libre) :
      `logcli query '{service=~".+"} |~ "\\b[0-9]{14}[A-Z]\\b"' → 0 hit`
- [ ] Grafana derrière Keycloak OIDC ; mot de passe admin local via Vault (jamais admin/admin)
- [ ] Export OTLP en TLS/mTLS hors dev (collector + Tempo) ; `insecure` réservé au dev local
- [ ] Alertmanager route vers récepteurs souverains uniquement (email/Matrix/webhook on-prem)
- [ ] Chaque règle d'alerting porte une annotation `runbook:` pointant vers
      `docs/observability/RUNBOOK.md#…`
- [ ] Tag Git `observability-mvp` posé après validation tutorat
- [ ] Commit conventionnel : `feat(observability): LGTM stack + Pino + OTel + 12 alertes + runbook`

---

## 10. Pour aller plus loin

- **Mimir** (remplaçant scalable de Prometheus) : remote-write Prometheus → Mimir pour rétention
  longue (> 1 an) et déduplication multi-cluster. Utile quand 2-3 clusters K3s pays-membres (Mali,
  BFA, Niger) consolident leurs métriques au niveau AES.
- **eBPF / Pixie / Coroot** : observabilité automatique sans instrumentation via eBPF — capture
  HTTP/gRPC kernel-level. Complément aux instrumentations applicatives.
- **Synthetic monitoring** : Grafana Synthetic Monitoring (k6 hosted) ou Blackbox Exporter pour
  tester `/api/health` depuis 3 zones (Bamako, Ouagadougou, Niamey).
- **SLO Generator** (Pyrra, Sloth) : génération automatique des règles d'alerting Prometheus depuis
  une déclaration SLO YAML (e.g. « 99.9 % des requêtes /nina sous 500 ms »).
- **Loki + Vector** : Vector (Rust, perf) en remplacement de Promtail si la charge log dépasse 50
  MB/s.
- **Tempo + Profiling** : Pyroscope intégré dans Tempo pour continuous profiling Node.js
  (flamegraphs auto).
- **Lectures recommandées** :
  - <https://sre.google/sre-book/monitoring-distributed-systems/> (Google SRE Book ch. 6)
  - <https://www.brendangregg.com/usemethod.html> (USE method)
  - <https://grafana.com/docs/loki/latest/best-practices/>
  - <https://opentelemetry.io/docs/concepts/signals/>
  - Charity Majors — _Observability Engineering_ (O'Reilly 2022)

---

_Document 17 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
