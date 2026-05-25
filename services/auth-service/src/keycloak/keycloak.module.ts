/**
 * @file        keycloak.module.ts
 * @description Expose {@link KeycloakAdminService} aux modules métier (auth, user).
 *
 * @module      auth-service/keycloak
 */

import { Global, Module } from '@nestjs/common';

import { KeycloakAdminService } from './keycloak-admin.service.js';
import { KeycloakAuthService } from './keycloak-auth.service.js';

@Global()
@Module({
  providers: [KeycloakAdminService, KeycloakAuthService],
  exports: [KeycloakAdminService, KeycloakAuthService],
})
export class KeycloakModule {}
