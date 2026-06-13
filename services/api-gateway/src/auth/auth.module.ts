/**
 * @file        auth.module.ts
 * @description Module GLOBAL d'authentification du gateway. Fournit :
 *                - le {@link JWT_VERIFIER} (JwksJwtVerifier RS256),
 *                - le {@link UserContextSigner} (JWS HS256 X-User-Context),
 *                - le {@link GatewayAuthGuard} (enregistré en APP_GUARD dans
 *                  AppModule).
 *
 *              Global pour que le guard (résolu via APP_GUARD au niveau racine)
 *              et le ProxyController partagent les mêmes providers.
 *
 * @module      api-gateway/auth
 */
import { Global, Module } from '@nestjs/common';
import { JWT_VERIFIER } from '@nina-aes/auth-guards';
import { JwksJwtVerifier } from './jwks-jwt.verifier.js';
import { UserContextSigner } from './user-context.signer.js';
import { GatewayAuthGuard } from './gateway-auth.guard.js';

@Global()
@Module({
  providers: [
    JwksJwtVerifier,
    { provide: JWT_VERIFIER, useExisting: JwksJwtVerifier },
    UserContextSigner,
    GatewayAuthGuard,
  ],
  exports: [JWT_VERIFIER, JwksJwtVerifier, UserContextSigner, GatewayAuthGuard],
})
export class AuthModule {}
