/**
 * @file        aggregator.module.ts
 * @description Module GLOBAL exposant {@link AggregatorService} et
 *              {@link OpenApiBaseHolder} (consommés par main.ts et le
 *              GatewayMetaController). Global et sans controller → neutre vis-à-vis
 *              de l'ordre d'enregistrement des routes.
 *
 * @module      api-gateway/aggregator
 */
import { Global, Module } from '@nestjs/common';
import { AggregatorService } from './aggregator.service.js';
import { OpenApiBaseHolder } from './openapi-base.holder.js';

@Global()
@Module({
  providers: [AggregatorService, OpenApiBaseHolder],
  exports: [AggregatorService, OpenApiBaseHolder],
})
export class AggregatorModule {}
