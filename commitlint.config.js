/**
 * @file        commitlint.config.js
 * @description Configuration commitlint — Conventional Commits.
 *              Chaque commit doit suivre le format :
 *              type(scope): description
 *
 *              Types autorisés : feat, fix, docs, style, refactor,
 *              perf, test, build, ci, chore, revert
 * @author      Étudiant UQAR
 * @date        2026
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scopes autorisés (noms des services et packages)
    'scope-enum': [
      2,
      'always',
      [
        'identity',
        'auth',
        'ai',
        'document',
        'notification',
        'interop',
        'audit',
        'appointment',
        'anticorruption',
        'governance',
        'vulnerability',
        'citizen',
        'admin',
        'governance-app',
        'mobile',
        'kiosk',
        'shared-types',
        'database',
        'config',
        'utils',
        'ui',
        'infra',
        'ci',
        'docs',
        'deps',
        'monorepo',
      ],
    ],
    // Le scope est optionnel (pour les commits transversaux)
    'scope-empty': [0],
    // Longueur max du sujet : 100 caractères
    'header-max-length': [2, 'always', 100],
  },
};
