/**
 * @file        typecheck.ts
 * @description Placeholder satisfaisant `tsc --noEmit` à la racine du monorepo.
 *
 *              Le `tsconfig.json` racine n'est pas destiné à compiler du code
 *              applicatif — chaque workspace (`packages/*`, `services/*`,
 *              `apps/*`) possède son propre `tsconfig.json`. Pour vérifier
 *              les types **de l'ensemble du monorepo**, utilisez l'une des
 *              commandes suivantes (depuis la racine) :
 *
 *                # 1) Toutes les workspaces, en parallèle (plus rapide)
 *                pnpm -r check-types
 *
 *                # 2) Via Turborepo (respecte le graphe + cache)
 *                pnpm exec turbo run check-types
 *
 *                # 3) Une seule workspace
 *                pnpm --filter @nina-aes/database check-types
 *
 *              Ce fichier existe uniquement pour qu'un appel direct à
 *              `pnpm exec tsc --noEmit` à la racine ne tombe pas sur l'erreur
 *              TS18003 (« No inputs were found »).
 *
 * @author      Étudiant UQAR
 * @date        2026
 */

export {};
