/**
 * @file        breaker.module.ts
 * @description Module GLOBAL exposant {@link BreakerRegistry} (producteur :
 *              ProxyService ; consommateur : GatewayMetaController). Global et
 *              sans controller pour rester neutre vis-à-vis de l'ordre
 *              d'enregistrement des routes.
 *
 * @module      api-gateway/infrastructure/breaker
 */
import { Global, Module } from '@nestjs/common';
import { BreakerRegistry } from './breaker.registry.js';

@Global()
@Module({
  providers: [BreakerRegistry],
  exports: [BreakerRegistry],
})
export class BreakerModule {}
