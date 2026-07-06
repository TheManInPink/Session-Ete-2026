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

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { expand as expandDotenv } from 'dotenv-expand';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ──────────────────────────────────────────────────────────────────────────────
//  Pre-load .env (avant l'instantiation top-level de `prisma`)
// ──────────────────────────────────────────────────────────────────────────────
// `prisma` est créé à l'import-time (singleton). Les services Nest qui
// l'importent au top de leurs controllers font évaluer ce module AVANT que
// `ConfigModule.forRoot()` ait pu charger leur .env. Si on attend que Nest
// charge l'env, on plante.
//
// Stratégie : remonter l'arbre des dossiers depuis `cwd()` à la recherche
// d'un `.env` (typiquement le `.env` racine du monorepo). Si trouvé, on le
// charge avec expansion `${VAR}`. Idempotent : si DATABASE_URL est déjà set
// dans l'env hôte, ce loader ne l'écrase pas (comportement dotenv par défaut).
function preloadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      expandDotenv(loadDotenv({ path: candidate }));
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
preloadRootEnv();

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
const LOG_LEVELS: Prisma.LogLevel[] = IS_DEV ? ['query', 'info', 'warn', 'error'] : ['error'];

/**
 * Modèles sur lesquels le soft-delete est activé. Ajouter un modèle ici
 * suppose que sa table Prisma possède le champ `deletedAt: DateTime?`.
 */
const SOFT_DELETE_MODELS = new Set<string>(['Citizen', 'User', 'CorrectionRequest']);

// ──────────────────────────────────────────────────────────────────────────────
//  Création du client brut
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Construit un PrismaClient configuré.
 *
 * Prisma 7.7+ utilise par défaut le moteur « client » qui exige un driver
 * adapter — pour PostgreSQL on utilise `@prisma/adapter-pg` qui s'appuie
 * sur le driver natif `pg`. L'URL de connexion est lue dans `DATABASE_URL`
 * (chargée par `@nina-aes/config` qui supporte l'interpolation `${VAR}`
 * dans le `.env` racine).
 *
 * @returns Un `PrismaClient` non étendu.
 */
function createBareClient(): PrismaClient {
  // Fail loud si DATABASE_URL n'est pas chargée. Le fallback historique (avec
  // un mot de passe codé en dur) provoquait des bugs silencieux 28P01 quand
  // un service oubliait `envFilePath: ['../../.env']` dans son ConfigModule —
  // le PrismaPg adapter se connectait avec des credentials obsolètes.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Each NestJS service must load the root .env via ' +
        "`ConfigModule.forRoot({ envFilePath: ['../../.env', '.env'], expandVariables: true })`.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
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
function applyNotDeleted<T extends { where?: Record<string, unknown> } | undefined>(args: T): T {
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
        async delete({
          model,
          args,
          query,
        }: {
          model: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          const delegate = (
            client as unknown as Record<string, { update: (a: unknown) => Promise<unknown> }>
          )[key];
          if (!delegate) return query(args);
          return delegate.update({
            ...(args as object),
            data: { deletedAt: new Date() },
          }) as unknown as ReturnType<typeof query>;
        },

        async deleteMany({
          model,
          args,
          query,
        }: {
          model: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const key = model.charAt(0).toLowerCase() + model.slice(1);
          const delegate = (
            client as unknown as Record<string, { updateMany: (a: unknown) => Promise<unknown> }>
          )[key];
          if (!delegate) return query(args);
          return delegate.updateMany({
            ...(args as object),
            data: { deletedAt: new Date() },
          }) as unknown as ReturnType<typeof query>;
        },

        // NB : on type explicitement les binding elements car Prisma 7.x
        // ne propage pas toujours le générique du TypeMap jusqu'aux
        // callbacks `$allModels.*` (TS7031). `args`/`query` restent
        // structurellement compatibles avec ce que Prisma fournit ; on
        // re-cast côté retour si nécessaire.
        async findUnique({
          model,
          args,
          query,
        }: {
          model: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args as { where?: Record<string, unknown> } | undefined));
        },
        async findFirst({
          model,
          args,
          query,
        }: {
          model: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args as { where?: Record<string, unknown> } | undefined));
        },
        async findMany({
          model,
          args,
          query,
        }: {
          model: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args as { where?: Record<string, unknown> } | undefined));
        },
        async count({
          model,
          args,
          query,
        }: {
          model: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          return query(applyNotDeleted(args as { where?: Record<string, unknown> } | undefined));
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
// Re-export les types de modèles générés — évite aux consommateurs (services)
// de devoir taper `Prisma.UserGetPayload<{}>` ou de référencer des chemins
// .pnpm internes dans leurs .d.ts (cf. TS4023 sur les declaration emits).
export type {
  User,
  Citizen,
  Parent,
  CorrectionRequest,
  AuditLog,
  AuditRoot,
  Appointment,
  AesVerificationLog,
  AesPartner,
  CorruptionAlert,
  GovernanceDirective,
  DirectiveRecipient,
  GovernanceMessage,
  SgogtSignedMessage,
  SgogtEscalationEvent,
  GovernanceTask,
  GovernanceTaskEvent,
  ElectoralPseudonym,
  ElectoralExportLog,
  DgeExportQuota,
  VulnerabilityRecord,
  Institution,
  ElectoralRecord,
  KioskSession,
  Notification,
  Location,
  EnrollmentCenter,
  PriorityQueueEntry,
  MobileAgent,
  OfflineEnrollmentBatch,
  OfflineEnrollmentRecord,
  BiometricTemplate,
  BiometricConsent,
  BiometricAccessLog,
} from '@prisma/client';
export { BiometricKind } from '@prisma/client';
export default prisma;
