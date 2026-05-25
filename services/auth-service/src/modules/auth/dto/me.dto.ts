/**
 * @file        me.dto.ts
 * @description Projection publique du user retournée par `GET /auth/me`.
 *
 *              Volontairement minimal — pas de `mfaSecret`, pas de
 *              `keycloakId` (interne), pas de timestamps soft-delete.
 *              Tout ajout doit passer une revue privacy (cf. doc 08 §3.5).
 *
 * @module      auth-service/modules/auth/dto
 */

import type { UserRole } from '../../../common/types.js';

export interface MeResponse {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phoneNumber: string | null;
  preferredLanguage: string;
  mfaEnabled: boolean;
  /** True si la session courante a passé le second facteur. */
  mfaVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
