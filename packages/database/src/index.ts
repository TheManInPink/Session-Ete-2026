/**
 * @file        index.ts
 * @description Client Prisma singleton pour tous les microservices NINA-AES.
 *
 *              Fournit :
 *                - Un singleton partagé (évite les connexions multiples en hot-reload).
 *                - Un logging différencié (verbeux en dev, erreurs-only en prod).
 *                - Une extension « soft-delete » : les `DELETE` sur les modèles
 *                  sensibles sont transformés en `UPDATE { deletedAt = now() }`
 *                  et les requêtes lecture filtrent automatiquement `deletedAt: null`.
 *
 *              Remarques Prisma 7 :
 *                - `$use()` a été retiré : on utilise exclusivement `$extends()`.
 *                - `datasources` / `datasourceUrl` ont été retirés du constructeur.
 *                  L'URL est fournie via `prisma.config.ts` (CLI) et la variable
 *                  d'environnement `DATABASE_URL` (runtime).
 *                - On utilise la forme callback de `Prisma.defineExtension` pour
 *                  préserver la propagation des types génériques (modèles exposés
 *                  sur le client étendu).
 *
 * @author      Étudiant UQAR
 * @date        Avril 2026
 * @module      @nina-aes/database
 */

import { PrismaClient, Prisma } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────────────────────────────────────

/** Variables d'environnement lues au démarrage (pas à chaque requête). */
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_DEV = NODE_ENV !== 'production' && NODE_ENV !== 'test';

/**
 * Niveaux de log Prisma.
 *   - En dev : queries + info + warn + error (pédagogique, facile à déboguer).
 *   - En prod : errors-only (réduit le bruit et le coût de journalisation).
 */
const LOG_LEVELS: Prisma.LogLevel[] = IS_DEV
  ? ['query', 'info', 'warn', 'error']
  : ['error'];

/**
 * Modèles sur lesquels le soft-delete est activé. Ajouter un modèle ici
 * suppose que sa table Prisma possède le champ `deletedAt: DateTime?`.
 */
const SOFT_DELETE_MODELS = new Set<string>([
  'Citizen',
  'User',
  'CorrectionRequest',
]);

// ──────────────────────────────────────────────────────────────────────────────
//  Création du client brut
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Construit un PrismaClient configuré.
 *
 * L'URL de connexion est lue par Prisma directement dans la variable
 * d'environnement `DATABASE_URL` — Prisma 7 a retiré `datasources` / `datasourceUrl`
 * du constructeur.
 *
 * @returns Un `PrismaClient` non étendu.
 */
function createBareClient(): PrismaClient {
  return new PrismaClient({
    log: LOG_LEVELS,
    errorFormat: IS_DEV ? 'pretty' : 'minimal',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
//  Extension soft-delete (Prisma 7 — $extends)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Ajoute `deletedAt: null` au `where` si l'appelant n'a pas déjà exprimé
 * une condition sur `deletedAt`. Permet de désactiver le filtre explicitement.
 *
 * @param args - Arguments de requête Prisma.
 * @returns Nouveaux arguments enrichis avec le filtre « non supprimé ».
 */
function applyNotDeleted<T extends { where?: Record<string, unknown> } | undefined>(
  args: T,
): T {
  const safe = (args ?? {}) as { where?: Record<string, unknown> };
  const where = safe.where ?? {};
  if (Object.prototype.hasOwnProperty.call(where, 'deletedAt')) return args;
  return {
    ...(safe as object),
    where: { ...where, deletedAt: null },
  } as unknown as T;
}

/**
 * Construit l'extension soft-delete en forme callback.
 *
 * La forme callback `(client) => client.$extends(...)` est préférée à la forme
 * objet car elle :
 *   1. reçoit le `client` correctement typé (évite les références circulaires
 *      quand on voudrait appeler `prisma.xxx.update()` depuis l'intérieur) ;
 *   2. préserve la propagation générique du TypeMap jusqu'au client étendu
 *      (les modèles restent exposés : `prisma.citizen`, `prisma.location`, …).
 *
 * Sémantique :
 *   - `delete`       → `update` avec `deletedAt = now()`
 *   - `deleteMany`   → `updateMany` avec `deletedAt = now()`
 *   - `findUnique`   → ajoute `deletedAt: null` dans `where` (sauf override)
 *   - `findFirst`    → idem
 *   - `findMany`     → idem
 *   - `count`        → idem
 *
 * Pour contourner le filtre (ex. écran admin qui affiche la corbeille), passer
 * `where: { deletedAt: { not: null } }` : l'extension respecte tout prédicat
 * explicite sur `deletedAt`.
 */
const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        async delete({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          const delegate = (client as unknown as Record<string, {
            update: (a: unknown) => Promise<unknown>;
          }>)[key];
          if (!delegate) return query(args);
          return delegate.update({
            ...(args as object),
            data: { deletedAt: new Date() },
          }) as unknown as ReturnType<typeof query>;
        },

        async deleteMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          const delegate = (client as unknown as Record<string, {
            updateMany: (a: unknown) => Promise<unknown>;
          }>)[key];
          if (!delegate) return query(args);
          return delegate.updateMany({
            ...(args as object),
            data: { deletedAt: new Date() },
          }) as unknown as ReturnType<typeof query>;
        },

        async findUnique({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args));
        },
        async findFirst({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args));
        },
        async findMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args));
        },
        async count({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args));
        },
      },
    },
  }),
);

// ──────────────────────────────────────────────────────────────────────────────
//  Singleton
// ──────────────────────────────────────────────────────────────────────────────

/** Construit et étend un client Prisma. */
function createExtendedClient() {
  return createBareClient().$extends(softDeleteExtension);
}

/** Type public du client étendu (re-exporté pour les consommateurs). */
export type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

/**
 * Bucket global pour conserver l'instance Prisma en développement. Évite la
 * fuite de connexions pendant le hot-reload de NestJS / Next.js.
 */
const globalForPrisma = globalThis as unknown as {
  __ninaAesPrisma?: ExtendedPrismaClient;
};

/**
 * Client Prisma étendu (soft-delete activé). À importer dans les microservices.
 *
 * @example
 * ```ts
 * import { prisma } from '@nina-aes/database';
 * const citizens = await prisma.citizen.findMany({ where: { sex: 'FEMALE' } });
 * ```
 */
export const prisma: ExtendedPrismaClient =
  globalForPrisma.__ninaAesPrisma ?? createExtendedClient();

if (IS_DEV) {
  globalForPrisma.__ninaAesPrisma = prisma;
}

/**
 * Ferme proprement la connexion Prisma. À appeler lors de l'arrêt du service
 * (NestJS `onApplicationShutdown`, SIGTERM Kubernetes).
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

// ──────────────────────────────────────────────────────────────────────────────
//  Ré-exports types
// ──────────────────────────────────────────────────────────────────────────────

export { PrismaClient, Prisma };
export default prisma;
