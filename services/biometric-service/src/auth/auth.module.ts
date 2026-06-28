/**
 * @file        auth.module.ts
 * @description Module global fournissant le `JWT_VERIFIER` (JWKS d'auth-service)
 *              consommé par les guards maison (JwtAuthGuard, RolesGuard).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/auth
 */
import { Global, Module } from '@nestjs/common';
import { JWT_VERIFIER } from '@nina-aes/auth-guards';
import { JwksJwtVerifier } from './jwks-jwt.verifier.js';
import { JwtAuthGuard, RolesGuard } from './guards/index.js';

@Global()
@Module({
  providers: [
    JwksJwtVerifier,
    { provide: JWT_VERIFIER, useExisting: JwksJwtVerifier },
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JWT_VERIFIER, JwksJwtVerifier, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
