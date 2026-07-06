/**
 * @file        verify-nina.dto.ts
 * @description Schémas Zod STRICTS du verbe BCID-AES `verify-nina` :
 *              requête minimaliste (entrante/sortante) et réponse minimaliste
 *              (privacy by design — JAMAIS de nom/prénom/photo).
 *
 *              Ces schémas valident le PAYLOAD APPLICATIF extrait du JWS (et non
 *              un body HTTP brut) : le transport est un JWS compact signé
 *              Ed25519. La validation Zod s'exécute APRÈS `jwtVerify`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid/dto
 */
import { z } from 'zod';
import { AES_COUNTRIES, NINA_PATTERN, VERIFY_PURPOSES } from '../bcid.constants.js';

/**
 * Requête `verify-nina`. `requestId` (= `jti` du JWS) et `timestamp` sont
 * OBLIGATOIRES : ils alimentent l'anti-replay (§4.2bis). `requestId` est un UUID
 * pour garantir l'unicité côté émetteur.
 *
 * NB : le payload JWS contient aussi des claims TECHNIQUES (iat/nbf/exp/iss/aud/
 * jti). Le `z.object` par défaut de Zod STRIPPE les clés inconnues : on ne
 * valide donc QUE le contrat applicatif et on ignore proprement ces claims.
 */
export const VerifyNinaRequestSchema = z.object({
  nina: z.string().regex(NINA_PATTERN, 'NINA invalide (14 chiffres + 1 lettre)'),
  requesterCountry: z.enum(AES_COUNTRIES),
  purpose: z.enum(VERIFY_PURPOSES),
  requestId: z.uuid('requestId doit être un UUID'),
  timestamp: z.iso.datetime({ offset: true, message: 'timestamp ISO 8601 requis' }),
});

/** Type métier de la requête verify-nina (sans les claims JWS techniques). */
export type VerifyNinaRequest = z.infer<typeof VerifyNinaRequestSchema>;

/**
 * Réponse `verify-nina` MINIMALISTE (privacy by design). On ne renvoie JAMAIS
 * de nom, prénom, photo, biométrie : le pays demandeur ne peut pas reconstruire
 * une base parallèle des citoyens.
 *   - exists      : le NINA est connu côté pays répondeur.
 *   - valid       : le NINA est actif (non révoqué/décédé/fraude).
 *   - vulnerable  : indication file prioritaire (null = donnée absente).
 *   - lastUpdated : date (YYYY-MM-DD) de dernière mise à jour de la fiche.
 */
export const VerifyNinaResponseSchema = z.object({
  exists: z.boolean(),
  valid: z.boolean(),
  vulnerable: z.boolean().nullable(),
  lastUpdated: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'lastUpdated au format YYYY-MM-DD')
    .nullable(),
});

/** Type métier de la réponse verify-nina. */
export type VerifyNinaResponse = z.infer<typeof VerifyNinaResponseSchema>;
