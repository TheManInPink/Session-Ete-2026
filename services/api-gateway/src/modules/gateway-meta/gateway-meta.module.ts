/**
 * @file        gateway-meta.module.ts
 * @description Assemble le {@link GatewayMetaController}. Ses dépendances
 *              (BreakerRegistry, AggregatorService, OpenApiBaseHolder) viennent
 *              de modules GLOBAUX — pas besoin de les ré-importer ici.
 *
 * @module      api-gateway/gateway-meta
 */
import { Module } from '@nestjs/common';
import { GatewayMetaController } from './gateway-meta.controller.js';

@Module({
  controllers: [GatewayMetaController],
})
export class GatewayMetaModule {}
