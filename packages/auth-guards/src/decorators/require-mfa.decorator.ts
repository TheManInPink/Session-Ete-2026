/**
 * @file        require-mfa.decorator.ts
 * @description Exige que le claim `mfa === true` soit présent dans l'access
 *              token — consommé par {@link MfaGuard}.
 *
 *              Indépendant de {@link Roles} : un endpoint peut être protégé
 *              par MFA seul (ex. opérations de configuration sensibles).
 *
 * @module      @nina-aes/auth-guards
 */

import { SetMetadata } from '@nestjs/common';

/** Clé de métadonnée lue par {@link MfaGuard}. */
export const REQUIRE_MFA_KEY = 'nina_aes:auth_guards:require_mfa';

export const RequireMfa = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_MFA_KEY, true);
