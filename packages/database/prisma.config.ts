/**
 * @file        prisma.config.ts
 * @description Configuration Prisma 7 — Fournit l'URL de connexion PostgreSQL
 *              pour Prisma Migrate (CLI) et Prisma Studio.
 *
 *              Prisma 7 a supprimé `url = env("DATABASE_URL")` du schema.prisma
 *              ET le champ `datasources` du constructeur `PrismaClient`.
 *              L'URL est désormais déclarée ici sous `datasource.url`, et le
 *              runtime lit DATABASE_URL via la variable d'environnement.
 *
 * @see         https://pris.ly/d/config-datasource
 * @author      Étudiant UQAR
 * @date        2026
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nina:nina_dev@localhost:5432/nina_aes';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: DATABASE_URL,
  },
});
