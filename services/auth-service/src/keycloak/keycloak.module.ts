/**
 * @file        keycloak.module.ts
 * @description Expose les services Keycloak aux modules métier (auth, user) :
 *              {@link KeycloakAdminService} (provisioning), {@link KeycloakAuthService}
 *              (grant password) et {@link KeycloakTokenVerifier} (vérification des
 *              access tokens Keycloak pour l'échange SSO citoyen — ADR-036).
 *
 * @module      auth-service/keycloak
 */

import { Global, Module } from '@nestjs/common';

import { KeycloakAdminService } from './keycloak-admin.service.js';
import { KeycloakAuthService } from './keycloak-auth.service.js';
import { KeycloakTokenVerifier } from './keycloak-token.verifier.js';

@Global()
@Module({
  providers: [KeycloakAdminService, KeycloakAuthService, KeycloakTokenVerifier],
  exports: [KeycloakAdminService, KeycloakAuthService, KeycloakTokenVerifier],
})
export class KeycloakModule {}
