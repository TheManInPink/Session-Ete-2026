/**
 * @file        index.ts
 * @description Client Prisma singleton pour tous les microservices.
 *              Utilise le pattern singleton pour éviter les connexions multiples
 *              en développement (hot-reload NestJS).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      database
 */

import { PrismaClient } from '@prisma/client';

/** Instance globale pour éviter les connexions multiples en dev (hot-reload) */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Client Prisma singleton.
 * En développement, l'instance est stockée sur `globalThis` pour survivre
 * aux rechargements à chaud de NestJS. En production, une nouvelle instance
 * est créée normalement.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export default prisma;
