/**
 * @file        commitlint.config.js
 * @description Configuration commitlint — Conventional Commits NINA-AES.
 *
 *              Format imposé :
 *                type(scope): description
 *
 *              Référence : https://www.conventionalcommits.org/fr/v1.0.0/
 *              Voir CONTRIBUTING.md §3 pour la grammaire détaillée + exemples.
 *
 * @author      Étudiant UQAR
 * @date        2026
 */

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // ─── Types autorisés ────────────────────────────────────────────
    // Niveau 2 (= erreur, bloque le commit)
    'type-enum': [
      2,
      'always',
      [
        'feat', // Nouvelle fonctionnalité
        'fix', // Correction de bug
        'docs', // Documentation uniquement (markdown, JSDoc, README)
        'style', // Formatage, points-virgules (pas de changement logique)
        'refactor', // Refactorisation (ni feat, ni fix)
        'perf', // Amélioration de performance
        'test', // Ajout ou correction de tests
        'build', // Système de build ou dépendances externes
        'ci', // Fichiers CI/CD
        'chore', // Tâches diverses (config, outils internes)
        'revert', // Annule un commit précédent
        'data', // Mise à jour de données (data/mali, schemas/, seeds)
      ],
    ],

    // ─── Scopes autorisés ───────────────────────────────────────────
    // Niveau 2 — bloque le commit (cohérence garantie inter-sessions).
    // 4 familles : SERVICES, APPS, PACKAGES, TRANSVERSE.
    'scope-enum': [
      2,
      'always',
      [
        // ── Microservices Bloc A (ports 3000..3014) ───────────────
        'api-gateway', // api-gateway (3000) — point d'entrée unique
        'identity', // identity-service (3001)
        'auth', // auth-service (3002)
        'ai', // ai-service (3003)
        'document', // document-service (3004)
        'notification', // notification-service (3005)
        'interop', // interop-service (3006) — Bloc B
        'audit', // audit-service (3007)
        'appointment', // appointment-service (3008)
        'sigac', // anticorruption-service (3009) — Bloc D
        'sgogt', // governance-service module SGOGT (Bloc C2)
        'governance', // governance-service global (Bloc C3 + transversal)
        'vulnerability', // vulnerability-service (3011) — Bloc C1

        // ── Apps frontend / mobile ────────────────────────────────
        'citizen', // apps/citizen (Next.js)
        'admin', // apps/admin (Next.js)
        'gov', // apps/governance (Next.js)
        'mobile', // apps/mobile (Expo)
        'kiosk', // apps/kiosk (Electron — Bloc E)
        'ussd', // simulateur USSD + ussd-service

        // ── Packages partagés ─────────────────────────────────────
        'shared-types',
        'database', // packages/database (Prisma)
        'config', // packages/config (Zod env)
        'utils', // packages/utils (NINA, Merkle, crypto)
        'ui', // packages/ui (design system)
        'auth-pkg', // packages/auth (BFF session helpers)
        'api-client', // packages/api-client (REST DTOs)
        'i18n', // packages/i18n (8 langues)
        'logger', // packages/logger (Pino → Loki)
        'test-fixtures', // packages/test-fixtures (factories Faker)

        // ── Transverse / infra ────────────────────────────────────
        'infra', // infrastructure/ (docker, k3s, helm, terraform)
        'docker', // docker-compose, Dockerfiles
        'k3s', // K3s + Helm chart (doc 20)
        'ci', // workflows GitHub Actions, husky, dependabot
        'deps', // mises à jour de dépendances (Dependabot)
        'biometrics', // Bloc F (vision V1)
        'monorepo', // turbo.json, pnpm-workspace, scripts globaux
        'data', // data/mali (référentiel) — utilisé avec type `data`
        'mali', // alias court pour data Mali
        'security', // doc 15 sécurité, Vault, mTLS
        'observability', // doc 17 LGTM, Pino, OTel
        'testing', // doc 18 pyramide tests
        'backup', // doc 19 backup + DRP
        'docs', // documentation transverse (DOCUMENTATION-MAP, etc.)
      ],
    ],

    // Le scope est optionnel pour les commits vraiment transverses
    // (ex. `chore: bump pnpm version`). Niveau 0 = pas de règle.
    'scope-empty': [0],

    // ─── Longueur ───────────────────────────────────────────────────
    // Sujet max 100 chars (lecture confortable git log + GitHub UI)
    'header-max-length': [2, 'always', 100],

    // Body : ligne max 100 chars (wrap propre pour `git log --no-pager`)
    'body-max-line-length': [1, 'always', 100],

    // Footer : aucune contrainte stricte (BREAKING CHANGE peut être long)
    'footer-max-line-length': [0],

    // ─── Lowercase strict sur le type ───────────────────────────────
    'type-case': [2, 'always', 'lower-case'],

    // Le sujet n'a pas besoin d'être uppercase (français = capitale rare)
    'subject-case': [0],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
  },
};
