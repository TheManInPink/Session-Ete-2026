/**
 * @file        prisma.config.ts
 * @description Configuration Prisma 7 — Fournit l'URL de connexion PostgreSQL
 *              pour Prisma Migrate (CLI) et Prisma Studio.
 *
 *              Prisma 7 a supprimé `url = env("DATABASE_URL")` du schema.prisma
 *              ET le champ `datasources` du constructeur `PrismaClient`. L'URL
 *              est désormais déclarée ici sous `datasource.url` ; le runtime
 *              applicatif (cf. `src/index.ts`) lit `DATABASE_URL` via la
 *              variable d'environnement chargée par `@nina-aes/config`.
 *
 *              Particularité : Prisma CLI **ne charge pas** automatiquement le
 *              fichier `.env` à la racine du monorepo (il ne regarde que dans
 *              le dossier du schéma). On charge donc nous-mêmes `.env` racine
 *              ET on étend les références `${VAR}` (ex.
 *              `DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@…`).
 *
 * @see         https://pris.ly/d/config-datasource
 * @author      Étudiant UQAR
 * @date        2026
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { expand as dotenvExpand } from 'dotenv-expand';
import { defineConfig } from 'prisma/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Localise le `.env` à la racine du monorepo en remontant depuis ce fichier
 * jusqu'à trouver un dossier contenant `pnpm-workspace.yaml`.
 *
 * @returns Chemin absolu vers `.env` si trouvé, sinon `null`.
 */
function locateMonorepoEnv(): string | null {
  let dir = __dirname;
  const { root } = path.parse(dir);
  for (let i = 0; i < 8; i++) {
    const envPath = path.join(dir, '.env');
    const wsPath = path.join(dir, 'pnpm-workspace.yaml');
    if (fs.existsSync(envPath) && fs.existsSync(wsPath)) return envPath;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

// Charge `.env` racine + expand les `${VAR}` AVANT de lire DATABASE_URL.
const ENV_PATH = locateMonorepoEnv();
if (ENV_PATH) {
  const parsed = dotenv.config({ path: ENV_PATH, override: false });
  dotenvExpand(parsed);
}

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://nina_admin:nina_dev_2026@localhost:5432/nina_aes_db?schema=public';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: DATABASE_URL,
    // Base fantôme pour `prisma migrate diff --from-migrations` / `migrate dev`
    // (rejoue les migrations sur une base jetable). Optionnelle : non requise en
    // production (`migrate deploy` n'en a pas besoin).
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
