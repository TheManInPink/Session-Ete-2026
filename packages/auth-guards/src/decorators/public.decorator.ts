/**
 * @file        public.decorator.ts
 * @description Marqueur « endpoint public » — bypass `JwtAuthGuard` même
 *              si celui-ci est appliqué globalement (`APP_GUARD`).
 *
 * @example
 *   `@Public()
 *    @Post('login') login(...) { ... }`
 *
 * @module      @nina-aes/auth-guards
 */

import { SetMetadata } from '@nestjs/common';

/** Clé de métadonnée lue par {@link JwtAuthGuard}. */
export const IS_PUBLIC_KEY = 'nina_aes:auth_guards:is_public';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
