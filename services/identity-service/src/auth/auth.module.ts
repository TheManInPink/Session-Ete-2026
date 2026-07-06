/**
 * @file        auth.module.ts
 * @description Module GLOBAL d'authentification d'identity-service.
 *
 *              Fournit :
 *                - le token DI {@link JWT_VERIFIER} (lié à {@link JwksJwtVerifier},
 *                  vérification RS256 via le JWKS d'auth-service) ;
 *                - les guards locaux {@link JwtAuthGuard}, {@link RolesGuard},
 *                  {@link NinaOwnershipGuard}.
 *
 *              `@Global()` : pas besoin de réimporter AuthModule dans chaque
 *              module métier pour résoudre les guards / le verifier.
 *
 *              ADR-027 : les CLASSES `@Injectable()` (guards, verifier) vivent
 *              DANS le service (jamais dans un package workspace partagé).
 *
 * @module      identity-service/auth
 */

import { Global, Module } from '@nestjs/common';

import { JWT_VERIFIER } from './auth.types';
import { JwksJwtVerifier } from './jwks-jwt.verifier';
import { JwtAuthGuard, RolesGuard, NinaOwnershipGuard } from './guards';

@Global()
@Module({
  providers: [
    JwksJwtVerifier,
    // Le guard injecte le verifier via le token abstrait JWT_VERIFIER :
    // remplaçable (ex. mock en test) sans toucher au guard.
    { provide: JWT_VERIFIER, useExisting: JwksJwtVerifier },
    JwtAuthGuard,
    RolesGuard,
    NinaOwnershipGuard,
  ],
  exports: [JWT_VERIFIER, JwksJwtVerifier, JwtAuthGuard, RolesGuard, NinaOwnershipGuard],
})
export class AuthModule {}
