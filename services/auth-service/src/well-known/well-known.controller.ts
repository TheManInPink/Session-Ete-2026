/**
 * @file        well-known.controller.ts
 * @description Expose `GET /.well-known/jwks.json` hors préfixe `api/v1`.
 *
 *              ⚠️ Sert le JWKS de SIGNATURE d'auth-service (clé publique Vault,
 *              cf. {@link JwksService.getSigningJwks}) — c'est le document que
 *              les vérificateurs aval (`identity-service`, `api-gateway`, …)
 *              fetchent pour valider la signature RS256 des tokens NINA. Il ne
 *              s'agit PLUS d'un proxy du JWKS Keycloak (drift corrigé, doc 08
 *              §0) : les tokens applicatifs sont signés par auth-service, pas
 *              par Keycloak.
 *
 * @module      auth-service
 */

import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '@nina-aes/auth-guards';

import { JwksService } from '../jwks/jwks.service.js';

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly jwksService: JwksService) {}

  /**
   * JWKS de signature — permet aux autres services de valider les JWT émis par
   * auth-service sans hardcoder de PEM. En-tête `Cache-Control` (10 min) aligné
   * sur le cache JWKS des vérificateurs aval (`JwksJwtVerifier`).
   *
   * Synchrone : la clé publique est déjà en mémoire (chargée de Vault au boot).
   */
  @Public()
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=600')
  getJwks() {
    return this.jwksService.getSigningJwks();
  }
}
