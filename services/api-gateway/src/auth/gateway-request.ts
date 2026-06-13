/**
 * @file        gateway-request.ts
 * @description Type de la requête Express enrichie par {@link GatewayAuthGuard}.
 *              Le guard attache l'identité vérifiée et le JWS interne déjà signé
 *              afin que le {@link ProxyController} n'ait plus qu'à les relayer.
 *
 * @module      api-gateway/auth
 */
import type { Request } from 'express';
import type { AuthSubject } from '@nina-aes/auth-guards';

/** Requête entrante après passage du guard d'authentification du gateway. */
export interface GatewayRequest extends Request {
  /** Sujet authentifié (présent uniquement sur les routes protégées). */
  gatewayUser?: AuthSubject;
  /** JWS HS256 `X-User-Context` prêt à être propagé au service aval. */
  userContextJws?: string;
}
