/**
 * @file        prisma.config.ts
 * @description Configuration Prisma 7 — Fournit l'URL de connexion PostgreSQL
 *              pour Prisma Migrate (CLI) et Prisma Studio.
 *
 *              Prisma 7 a supprimé `url = env("DATABASE_URL")` du schema.prisma.
 *              L'URL est maintenant configurée ici pour les outils CLI,
 *              et dans le constructeur PrismaClient pour le runtime.
 *
 * @see         https://pris.ly/d/config-datasource
 * @author      Étudiant UQAR
 * @date        2026
 */

import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  migrate: {
    async url() {
      return (
        process.env.DATABASE_URL ?? 'postgresql://nina:nina_dev@localhost:5432/nina_aes'
      );
    },
  },

  studio: {
    async url() {
      return (
        process.env.DATABASE_URL ?? 'postgresql://nina:nina_dev@localhost:5432/nina_aes'
      );
    },
  },
});
