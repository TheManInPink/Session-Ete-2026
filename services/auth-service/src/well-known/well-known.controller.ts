/**
 * @file        well-known.controller.ts
 * @description Expose `GET /.well-known/jwks.json` hors préfixe `api/v1`,
 *              en proxy vers Keycloak avec cache (voir {@link JwksService}).
 * @module      auth-service
 */

import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '@nina-aes/auth-guards';

import { JwksService } from '../jwks/jwks.service';

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly jwksService: JwksService) {}

  /**
   * Proxy JWKS — permet aux autres services de valider les JWT sans appeler Keycloak directement.
   * En-tête `Cache-Control` cohérent avec le TTL mémoire (10 min).
   */
  @Public()
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=600')
  async getJwks() {
    return this.jwksService.getKeycloakJwks();
  }
}
