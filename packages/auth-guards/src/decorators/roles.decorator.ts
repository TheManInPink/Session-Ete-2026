/**
 * @file        roles.decorator.ts
 * @description Déclare la liste des rôles autorisés sur un endpoint ou un
 *              controller — consommé par {@link RolesGuard}.
 *
 * @example
 *   `@Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
 *    @Get('admin/dashboard') dashboard() { ... }`
 *
 * @module      @nina-aes/auth-guards
 */

import { SetMetadata } from '@nestjs/common';

/** Clé de métadonnée lue par {@link RolesGuard}. */
export const ROLES_KEY = 'nina_aes:auth_guards:roles';

export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
