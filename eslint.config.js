/**
 * @file        eslint.config.js
 * @description Configuration ESLint racine (flat config v9+).
 *
 *              Délègue à `@repo/eslint-config/base` pour les règles
 *              communes (Turbo, TypeScript ESLint, prettier-disable).
 *
 *              Cette config est utilisée par :
 *                - lint-staged dans `.husky/pre-commit` (fichiers stagés)
 *                - `pnpm exec eslint <path>` invocations ad-hoc
 *
 *              Chaque workspace (apps/*, packages/*, services/*) peut
 *              fournir son propre `eslint.config.js` qui étend ce
 *              fichier OU réimporte directement `@repo/eslint-config/*`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 */

import { config as baseConfig } from '@repo/eslint-config/base';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Ignorer les artefacts générés et les répertoires non-pertinents
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      'graphify-out/**',
      'data/_raw/**',
      'docs/**',
      '.husky/_/**',
      // Fichiers de config JS qui n'ont pas besoin d'être lintés
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
      // Fichiers de bootstrap turbo et autres
      '**/turbo.json',
    ],
  },
];
