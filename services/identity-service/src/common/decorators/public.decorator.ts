/**
 * @file        public.decorator.ts
 * @description Marqueur « endpoint public » — court-circuite le
 *              {@link JwtAuthGuard} (et donc toute exigence d'authentification),
 *              même quand le guard est appliqué au niveau du contrôleur.
 *
 *              À n'utiliser QUE sur des routes dont l'exposition publique est
 *              un choix de conception explicite et documenté (ex. : référentiel
 *              géographique en lecture seule, validation de format NINA).
 *              JAMAIS sur une route exposant des données personnelles (NINA,
 *              état civil) — ce serait une fuite (OWASP A01).
 *
 * @example
 *   `@Public()
 *    @Get('locations') list() { ... }`
 *
 * @module      identity-service/common
 */

import { SetMetadata } from '@nestjs/common';

/** Clé de métadonnée lue par {@link JwtAuthGuard}. */
export const IS_PUBLIC_KEY = 'identity:is_public';

/** Annote une route (ou un contrôleur) comme publique. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
