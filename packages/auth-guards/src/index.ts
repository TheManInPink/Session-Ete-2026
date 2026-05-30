/**
 * @file        index.ts
 * @description Point d'entrée de `@nina-aes/auth-guards`.
 *
 *              ⚠️  Package **type-only / metadata-only** (depuis 0.2.0) :
 *              ne contient AUCUNE classe `@Injectable()` Nest. Le partage
 *              de classes DI Nest entre packages workspace cause la
 *              duplication physique de `@nestjs/core` côté pnpm store et
 *              casse l'identité de `Reflector` (UnknownDependenciesException).
 *
 *              Surface exportée :
 *                - Types : {@link AuthSubject}, {@link JwtVerifier}, {@link UserRole}
 *                - Token DI : {@link JWT_VERIFIER}
 *                - Décorateurs (SetMetadata uniquement, pas de DI) :
 *                  {@link Public}, {@link Roles}, {@link RequireMfa}
 *                - Clés de métadonnées : {@link IS_PUBLIC_KEY},
 *                  {@link ROLES_KEY}, {@link REQUIRE_MFA_KEY}
 *
 *              Les classes Guards (`JwtAuthGuard`, `RolesGuard`, `MfaGuard`)
 *              vivent désormais **dans chaque service** (`src/auth/guards/`).
 *              Voir ADR-027.
 *
 * @module      @nina-aes/auth-guards
 */

export * from './types.js';
export * from './decorators/public.decorator.js';
export * from './decorators/roles.decorator.js';
export * from './decorators/require-mfa.decorator.js';

/** Version exportée pour debug / health-check. */
export const AUTH_GUARDS_PACKAGE_VERSION = '0.2.0';
