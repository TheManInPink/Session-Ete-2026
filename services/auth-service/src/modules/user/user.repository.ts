/**
 * @file        user.repository.ts
 * @description Couche d'accès Prisma pour les opérations user du auth-service.
 *
 *              Travaille avec le client étendu (`@nina-aes/database`) qui
 *              applique automatiquement le soft-delete (`deletedAt: null`).
 *              N'expose que les méthodes utiles aux flows d'auth — pas un
 *              repository CRUD complet (cf. user-service pour le reste).
 *
 * @module      auth-service/modules/user
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma, disconnectPrisma, prisma } from '@nina-aes/database';

/** Création initiale d'un user à la fin du flow `/register/verify`. */
export interface CreateUserInput {
  keycloakId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Prisma.UserCreateInput['role'];
  phoneNumber?: string | null;
  preferredLanguage?: Prisma.UserCreateInput['preferredLanguage'];
}

@Injectable()
export class UserRepository implements OnModuleDestroy {
  /** Crée un user. Lève `Prisma.PrismaClientKnownRequestError` (P2002) si email/username existe. */
  create(input: CreateUserInput) {
    return prisma.user.create({
      data: {
        keycloakId: input.keycloakId,
        email: input.email,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        phoneNumber: input.phoneNumber ?? null,
        preferredLanguage: input.preferredLanguage ?? 'FR',
      },
    });
  }

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  findByKeycloakId(keycloakId: string) {
    return prisma.user.findUnique({ where: { keycloakId } });
  }

  updateLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Active MFA TOTP pour un user — stocke le secret déjà chiffré (Vault
   * Transit `vault:vN:<...>`) et flippe le flag `mfaEnabled`.
   */
  enableMfaTotp(id: string, encryptedSecret: string) {
    return prisma.user.update({
      where: { id },
      data: { mfaSecret: encryptedSecret, mfaEnabled: true },
    });
  }

  /** Désactive MFA TOTP (purge le secret). Utilisé par les flows de reset MFA. */
  disableMfa(id: string) {
    return prisma.user.update({
      where: { id },
      data: { mfaSecret: null, mfaEnabled: false },
    });
  }

  async onModuleDestroy(): Promise<void> {
    // disconnectPrisma est idempotent — sûr si plusieurs modules le déclenchent.
    await disconnectPrisma().catch(() => undefined);
  }
}
