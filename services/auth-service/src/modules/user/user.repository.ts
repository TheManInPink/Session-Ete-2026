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
import { Prisma, type User, disconnectPrisma, prisma } from '@nina-aes/database';

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
  create(input: CreateUserInput): Promise<User> {
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

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  /**
   * Résout un user par email ou username — utilisé par les flows `/login`
   * et `/password/forgot` où le client peut soumettre l'un ou l'autre.
   */
  findByEmailOrUsername(identifier: string): Promise<User | null> {
    return prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
  }

  findByKeycloakId(keycloakId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { keycloakId } });
  }

  /**
   * Résout le NINA d'un citoyen à partir de son email (clé de liaison
   * `User.email` → `Citizen.email`).
   *
   * 🔗 Point d'intégration Bloc A : la table `users` (auth) et la table
   * `citizens` (identité NINA) ne partagent PAS de clé étrangère — la jointure
   * canonique est l'email vérifié à l'inscription. On lit donc le NINA à
   * l'émission du token plutôt que de dupliquer la colonne dans `users`
   * (source de vérité unique = `citizens.nina`).
   *
   * Renvoie `null` si aucun citoyen n'est rattaché à cet email (compte interne,
   * ou citoyen pas encore enrôlé côté identity-service) — l'appelant émet alors
   * un token SANS claim `nina` (comportement fail-open volontaire : un token
   * sans `nina` est simplement refusé par `NinaOwnershipGuard` sur les routes
   * « propriétaire », sans bloquer le reste de l'API).
   *
   * @param email Email du compte (déjà vérifié à l'inscription).
   * @returns Le NINA (14 chiffres + 1 lettre) ou `null`.
   */
  async findCitizenNinaByEmail(email: string): Promise<string | null> {
    const citizen = await prisma.citizen.findFirst({
      where: { email },
      select: { nina: true },
    });
    return citizen?.nina ?? null;
  }

  updateLastLogin(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Active MFA TOTP pour un user — stocke le secret déjà chiffré (Vault
   * Transit `vault:vN:<...>`) et flippe le flag `mfaEnabled`.
   */
  enableMfaTotp(id: string, encryptedSecret: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { mfaSecret: encryptedSecret, mfaEnabled: true },
    });
  }

  /** Désactive MFA TOTP (purge le secret). Utilisé par les flows de reset MFA. */
  disableMfa(id: string): Promise<User> {
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
