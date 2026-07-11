/**
 * @file        sso-exchange.dto.ts
 * @description DTO du `POST /auth/sso/exchange` (échange SSO citoyen, ADR-036).
 *
 *              `keycloakToken` = access token Keycloak du citoyen (obtenu par
 *              le portail via le flow Authorization Code + PKCE). Il est vérifié
 *              cryptographiquement par {@link KeycloakTokenVerifier} — le schéma
 *              ne fait qu'un pré-filtre de forme (borne haute anti-abus).
 *
 * @module      auth-service/modules/auth/dto
 */

import { z } from 'zod';

export const SsoExchangeSchema = z.object({
  keycloakToken: z.string().trim().min(1).max(8192),
});

export type SsoExchangeDto = z.infer<typeof SsoExchangeSchema>;
