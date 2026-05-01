/**
 * @file        commitlint.config.js
 * @description Configuration commitlint — Conventional Commits.
 *              Chaque commit doit suivre le format :
 *              type(scope): description
 *              Impose le format Conventional Commits sur tous les messages de commit.
 *              Voir : https://www.conventionalcommits.org/fr/v1.0.0/
 *
 *              Types autorisés : feat, fix, docs, style, refactor,
 *              perf, test, build, ci, chore, revert
 * @author      Étudiant UQAR
 * @date        2026
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types autorisés pour les messages de commit
    'type-enum': [
      2, // Niveau erreur (bloque le commit)
      'always',
      [
        'feat',     // Nouvelle fonctionnalité
        'fix',      // Correction de bug
        'docs',     // Documentation uniquement
        'style',    // Formatage, points-virgules manquants, etc. (pas de changement logique)
        'refactor', // Refactorisation du code (ni feat, ni fix)
        'perf',     // Amélioration de performance
        'test',     // Ajout ou correction de tests
        'build',    // Changements au système de build ou dépendances externes
        'ci',       // Changements aux fichiers de CI
        'chore',    // Autres changements qui ne modifient pas src ou test
        'revert',   // Annule un commit précédent
      ],
    ],
    // Scopes autorisés (noms des services et packages)
    'scope-enum': [
      2, // Niveau avertissement (ne bloque pas)
      'always',
      [
        'identity',       // identity-service
        'auth',           // auth-service
        'ai',             // ai-service
        'document',       // document-service
        'notification',   // notification-service
        'interop',        // interop-service
        'audit',          // audit-service
        'appointment',    // appointment-service
        'anticorruption', // anticorruption-service
        'governance',     // governance-service
        'vulnerability',  // vulnerability-service
        'citizen',        // app citizen
        'admin',          // app admin
        'gov',            // app governance
        'mobile',         // app mobile
        'kiosk',          // app kiosk
        'shared-types',   // package shared-types
        'database',       // package database
        'config',         // package config
        'utils',          // package utils
        'ui',             // package ui
        'infra',          // infrastructure
        'ci',             // CI/CD
        'deps',           // dépendances
        'monorepo',       // configuration monorepo
      ],
    ],
    // Le scope est optionnel (pour les commits transversaux)
    'scope-empty': [0],
    // Longueur max du sujet : 100 caractères
    'header-max-length': [2, 'always', 100],
  },
};
