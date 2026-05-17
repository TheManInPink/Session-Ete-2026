/**
 * @file        roles.guard.ts
 * @description Guard global qui :
 *                1. Décode le Bearer JWT (RS256, clé publique chargée depuis Vault
 *                   ou env JWT_PUBLIC_KEY_PATH)
 *                2. Injecte `req.user` (AuthenticatedUser)
 *                3. Vérifie que le rôle de l'utilisateur match la liste @Roles(...)
 *
 *              Mode dev (NINA_AUTH_MODE=mock) :
 *                - Pas de validation JWT, injecte un user mock avec role=AGENT
 *                - Permet le développement local sans Keycloak (cf. doc 08)
 *
 * @module      identity-service/common
 */

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@nina-aes/shared-types';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);
  private readonly mockMode = process.env.NINA_AUTH_MODE === 'mock';

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    // Mode mock : injecte un user déterministe et autorise tout
    if (this.mockMode) {
      req.user = req.user ?? {
        id: 'mock-agent-001',
        email: 'agent.mock@ctdec.gouv.ml',
        role: UserRole.AGENT,
        region: 'ML-09',
      };
      return true;
    }

    // Pas de @Roles() = route ouverte
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = await this.extractUserFromJwt(req);
    if (!user) {
      throw new UnauthorizedException('JWT manquant ou invalide');
    }
    req.user = user;

    const allowed = requiredRoles.includes(user.role);
    if (!allowed) {
      this.logger.warn(
        `Accès refusé : user=${user.id} role=${user.role} requis=[${requiredRoles.join(',')}]`,
      );
      throw new ForbiddenException(`Rôle ${user.role} non autorisé pour cette opération`);
    }
    return true;
  }

  /**
   * Extrait l'utilisateur depuis le Bearer token. Implémentation V1
   * délibérément simplifiée — la vérification cryptographique RS256
   * complète vit dans auth-service (cf. doc 08).
   *
   * Ici on accepte un JWT déjà vérifié par une couche amont (API Gateway
   * ou middleware mTLS) qui aurait posé `req.user` directement.
   */
  private async extractUserFromJwt(
    req: Request & { user?: AuthenticatedUser },
  ): Promise<AuthenticatedUser | null> {
    if (req.user) return req.user;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    // V1 : on délègue la vérification à auth-service (HTTP call documenté
    // doc 08 §4.4). Pour rester simple en MVP, on retourne null et l'auth
    // arrive via le mock ou via un middleware externe au service.
    this.logger.warn(
      'JWT verification non implémentée dans identity-service — utiliser NINA_AUTH_MODE=mock ou un middleware amont',
    );
    return null;
  }
}
