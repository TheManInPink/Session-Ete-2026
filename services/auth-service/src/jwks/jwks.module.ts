/**
 * @file        jwks.module.ts
 * @description Expose {@link JwksService} de façon globale.
 *
 *              JwksService rend DEUX services : le JWKS de SIGNATURE d'auth-service
 *              (servi sur `/.well-known/jwks.json` par le WellKnownController) et
 *              un PROXY du JWKS Keycloak (consommé par {@link KeycloakTokenVerifier}
 *              pour l'échange SSO citoyen — ADR-036). Le second consommateur vit
 *              dans le `KeycloakModule`, d'où l'extraction dans un module `@Global`
 *              (auparavant simple provider de l'AppModule, non injectable ailleurs).
 *
 * @module      auth-service/jwks
 */

import { Global, Module } from '@nestjs/common';

import { JwksService } from './jwks.service.js';

@Global()
@Module({
  providers: [JwksService],
  exports: [JwksService],
})
export class JwksModule {}
