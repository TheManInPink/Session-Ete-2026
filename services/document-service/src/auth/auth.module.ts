/**
 * @file        auth.module.ts
 * @description Module global qui fournit {@link JWT_VERIFIER} pour
 *              les Guards de @nina-aes/auth-guards.
 *
 *              Le verifier (JwksJwtVerifier) charge le JWKS d'auth-service
 *              au boot et expose `verifyAccess()` synchrone (contrat
 *              imposé par JwtVerifier).
 *
 * @module      document-service/auth
 */
import { Global, Module } from '@nestjs/common';
import { JWT_VERIFIER } from '@nina-aes/auth-guards';
import { JwksJwtVerifier } from './jwks-jwt.verifier';

@Global()
@Module({
  providers: [JwksJwtVerifier, { provide: JWT_VERIFIER, useExisting: JwksJwtVerifier }],
  exports: [JWT_VERIFIER, JwksJwtVerifier],
})
export class AuthModule {}
