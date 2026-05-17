/**
 * @file        roles.decorator.ts
 * @description Décorateur `@Roles(...)` pour annoter une route avec les rôles
 *              autorisés. Lu par `RolesGuard`.
 *
 *              Usage : `@Roles(UserRole.AGENT, UserRole.SUPERVISOR)`
 *
 * @module      identity-service/common
 */

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@nina-aes/shared-types';

/** Clé metadata utilisée par RolesGuard pour récupérer les rôles requis. */
export const ROLES_KEY = 'roles';

/**
 * Annote une route ou un contrôleur avec la liste des rôles autorisés.
 *
 * @param roles - Un ou plusieurs rôles autorisés. Si vide, la route est ouverte.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
