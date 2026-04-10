/**
 * @file        index.ts
 * @description Validation centralisée des variables d'environnement via Zod.
 *              Chaque microservice importe et étend ce schéma de base.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      config
 */

import { z } from 'zod';

/**
 * Schéma de base des variables d'environnement communes à tous les services.
 * Chaque service peut l'étendre avec ses propres variables via `.extend()`.
 */
export const baseEnvSchema = z.object({
  /** Environnement d'exécution */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** URL de connexion PostgreSQL */
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://nina:nina_dev@localhost:5432/nina_aes'),

  /** URL de connexion Redis */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  /** URL du broker RabbitMQ */
  RABBITMQ_URL: z.string().default('amqp://nina:nina_dev@localhost:5672'),

  /** Clé secrète JWT (pour le dev — en prod, utiliser Vault) */
  JWT_SECRET: z
    .string()
    .min(32)
    .default('dev-jwt-secret-change-this-in-production-32chars'),

  /** Durée de validité du JWT (en secondes) */
  JWT_EXPIRATION: z.coerce.number().default(900), // 15 minutes
});

/** Type inféré du schéma de base */
export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Valide les variables d'environnement avec un schéma Zod.
 * Lance une erreur descriptive si la validation échoue.
 *
 * @param schema - Schéma Zod à utiliser pour la validation
 * @returns Les variables d'environnement validées et typées
 * @throws {Error} Si des variables obligatoires sont manquantes ou invalides
 */
export function validateEnv<T extends z.ZodType>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    console.error("❌ Variables d'environnement invalides :");
    console.error(JSON.stringify(formatted, null, 2));
    throw new Error('Configuration invalide — vérifiez votre fichier .env');
  }

  return result.data;
}

export { z };
