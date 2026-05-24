# `@nina-aes/logger` — Guide d'utilisation

> **Version** : 0.2.0 (mai 2026) **Statut** : Logger structuré opérationnel (sortie du stub
> précédent)

---

## 1. Pourquoi un logger structuré ?

Chaque action dans la plateforme NINA-AES doit être :

1. **Tracée** : pour permettre l'investigation forensique d'un incident.
2. **Corrélée** : pour suivre un parcours citoyen traversant 6 services.
3. **Sécurisée** : les NINA, biométries, mots de passe ne doivent JAMAIS apparaître en clair.
4. **Exploitable** : format JSON pour Loki / Grafana sans post-processing.

Le logger Pino encapsulé dans `@nina-aes/logger` répond aux 4 exigences en sortie de la boîte.

---

## 2. Setup minimal dans un service NestJS

### 2.1 Importer dans `AppModule`

```typescript
// services/<mon-service>/src/app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule, AllExceptionsFilter, CorrelationMiddleware } from '@nina-aes/logger/nestjs';

@Module({
  imports: [
    LoggerModule.forRoot({
      service: 'mon-service',
      environment: process.env.NODE_ENV,
      pretty: process.env.NODE_ENV === 'development',
      gitSha: process.env.GIT_SHA,
      lokiUrl: process.env.LOKI_URL,
    }),
  ],
  providers: [
    // Filtre d'exceptions GLOBAL — sans cela, les 500 fuiront le stack en clair
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // ⚠️ Middleware DOIT être PREMIER pour que tous les logs soient corrélés
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

### 2.2 Utiliser le logger dans un service

```typescript
import { Injectable } from '@nestjs/common';
import { InjectLogger, type StructuredLogger, maskNina } from '@nina-aes/logger';

@Injectable()
export class CitizenService {
  constructor(@InjectLogger() private readonly logger: StructuredLogger) {}

  async getByNina(nina: string) {
    this.logger.info({ ninaMasked: maskNina(nina) }, 'Recherche citoyen par NINA');
    // ... le correlationId est ajouté automatiquement à CHAQUE log
  }
}
```

---

## 3. Patterns recommandés

### 3.1 Toujours masquer les PII APPLICATIVEMENT, en plus du redact Pino

Pino masque déjà via la liste `PII_REDACT_PATHS`, mais cette défense de fond ne doit pas dispenser
d'un masquage explicite côté code :

```typescript
// ✅ BIEN — double sécurité
this.logger.info({ ninaMasked: maskNina(nina) }, 'OK');

// ❌ MAL — repose uniquement sur le redact, qui pourrait être contourné si
//        le champ s'appelle `customerId` au lieu de `nina`
this.logger.info({ customerId: nina }, 'OK');
```

### 3.2 Loggers enfants par opération

```typescript
const log = this.logger.withContext({ operation: 'submitCorrection' });
log.info({ correctionId }, 'Démarrage');
// Tous les logs émis via `log` partagent ce contexte
```

### 3.3 Sérialisation des erreurs

```typescript
try {
  await risky();
} catch (err) {
  // ✅ Utiliser la clé `err` — Pino active automatiquement le serializer
  this.logger.error({ err }, 'Échec opération risky');
  throw err;
}
```

---

## 4. Anti-patterns à BANNIR

| ❌ Mauvais                          | ✅ Bon                                                   |
| ----------------------------------- | -------------------------------------------------------- |
| `console.log('hello')`              | `logger.info('hello')`                                   |
| `new Logger('foo')` (NestJS direct) | `@InjectLogger()`                                        |
| `logger.info(\`nina=${nina}\`)`     | `logger.info({ ninaMasked: maskNina(nina) }, 'message')` |
| Logger un mot de passe pour debug   | JAMAIS — utiliser un debugger local                      |
| Catch silencieux : `catch(e) {}`    | Toujours logger avant de re-throw ou retourner           |

---

## 5. Cas particuliers

### 5.1 Code hors NestJS (scripts CLI, jobs cron)

```typescript
import { createLogger, runWithContext, generateCorrelationId } from '@nina-aes/logger';

const logger = createLogger({ service: 'cron-backup', environment: 'production' });

runWithContext({ correlationId: generateCorrelationId(), service: 'cron-backup' }, async () => {
  logger.info('Démarrage backup');
  await doBackup();
  logger.info('Backup terminé');
});
```

### 5.2 Tests unitaires

En environnement `NODE_ENV=test`, le logger est configuré au niveau `fatal` par défaut (pratiquement
silencieux). Pas de pollution stdout dans les suites Jest.

Pour tester un appel précis, mocker via `@nina-aes/logger` :

```typescript
import * as logger from '@nina-aes/logger';
jest.spyOn(logger, 'createLogger').mockReturnValue(mockLogger);
```

### 5.3 Communication inter-services (HTTP)

L'intercepteur HTTP qui SORTANT doit propager le header `X-Request-Id` :

```typescript
// Dans api-gateway, document-service, etc.
import { getContext } from '@nina-aes/logger';
import axios from 'axios';

axios.interceptors.request.use((config) => {
  const ctx = getContext();
  if (ctx) {
    config.headers['X-Request-Id'] = ctx.correlationId;
  }
  return config;
});
```

### 5.4 Listeners RabbitMQ

```typescript
import { runWithContext, generateCorrelationId } from '@nina-aes/logger';

channel.consume('citizen.created', (msg) => {
  // Si l'expéditeur a propagé le correlationId via les headers AMQP, on le réutilise
  const upstream = msg.properties.headers?.['x-request-id'] as string | undefined;
  const correlationId = upstream ?? generateCorrelationId();

  runWithContext({ correlationId, service: 'audit-service' }, () => processMessage(msg));
});
```

---

## 6. Migration depuis le stub précédent

L'ancien stub exportait `createLogger(service: string)`. Cette signature **continue de fonctionner**
— pas de breaking change immédiat. Migrer progressivement vers la signature moderne :

```typescript
// Avant (legacy — encore supporté)
import { createLogger } from '@nina-aes/logger';
const log = createLogger('mon-service');

// Après (recommandé)
import { createLogger } from '@nina-aes/logger';
const log = createLogger({
  service: 'mon-service',
  environment: process.env.NODE_ENV,
});
```

La signature `string` sera retirée à la version 1.0 du package.

---

## 7. Tests à exécuter avant un PR

```powershell
cd packages/logger
pnpm test           # Tests unitaires (redaction, correlation)
pnpm check-types    # Vérification TypeScript stricte
```

Tout PR modifiant `redaction.ts` doit avoir des tests dédiés ajoutés à
`__tests__/redaction.test.ts`.
