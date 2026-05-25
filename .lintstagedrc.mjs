/**
 * @file        .lintstagedrc.mjs
 * @description Configuration lint-staged (form fonction).
 *
 *              Permet de filtrer les fichiers AVANT de les passer aux
 *              outils, évitant les erreurs sur les fichiers de config
 *              ESLint (eslint.config.js) qui sont eux-mêmes en ignores.
 *
 *              Cf. CONTRIBUTING.md §4 + docs/16-CICD-GITHUB-ACTIONS.md.
 */

// Fichiers à ne JAMAIS passer aux linters (config files self-referent
// + sorties auto-générées comme le snapshot graphify)
const NEVER_LINT = (path) => {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  return (
    /(eslint|prettier|jest|playwright|stylelint|commitlint|babel|webpack|vite|tailwind|postcss|turbo)\.config\.[cm]?js$/i.test(
      lower,
    ) ||
    /\.lintstagedrc(\.[cm]?js)?$/i.test(lower) ||
    /\.prettierrc(\.[cm]?js)?$/i.test(lower) ||
    /\.eslintrc(\.[cm]?js)?$/i.test(lower) ||
    lower.endsWith('eslint.config.js') ||
    lower.endsWith('eslint.config.mjs') ||
    lower.endsWith('eslint.config.cjs') ||
    // Snapshot graphify auto-généré (graphify update .) — cache/*.json
    // et graph.json sont énormes et minifiés, prettier les casserait.
    lower.includes('graphify-out/cache/') ||
    lower.endsWith('graphify-out/graph.json')
  );
};

/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx,js,jsx,mjs,cjs}': (files) => {
    const linted = files.filter((f) => !NEVER_LINT(f));
    if (linted.length === 0) return [];
    const quoted = linted.map((f) => `"${f}"`).join(' ');
    return [
      `eslint --fix --max-warnings=0 --no-error-on-unmatched-pattern --no-warn-ignored ${quoted}`,
      `prettier --write --ignore-unknown ${quoted}`,
    ];
  },

  '*.py': (files) => {
    if (files.length === 0) return [];
    const quoted = files.map((f) => `"${f}"`).join(' ');
    return [
      `ruff check --fix --exit-non-zero-on-fix ${quoted}`,
      `ruff format ${quoted}`,
    ];
  },

  '*.{json,md,yml,yaml,css,scss}': (files) => {
    const linted = files.filter((f) => !NEVER_LINT(f));
    if (linted.length === 0) return [];
    const quoted = linted.map((f) => `"${f}"`).join(' ');
    return [`prettier --write ${quoted}`];
  },

  // Le plugin `prettier-plugin-prisma` v5.x est incompatible Prisma 7
  // (cherche `prisma/build/types.js` qui n'existe plus). On utilise donc
  // directement `prisma format` — l'outil officiel, garanti aligné avec
  // la version installée. Sur Windows lint-staged passe les paths via
  // cmd.exe ; pas de double-quote autour de --schema= pour éviter que
  // les guillemets soient préservés littéralement dans le path.
  '*.prisma': (files) => {
    if (files.length === 0) return [];
    return files.map((f) => `pnpm exec prisma format --schema=${f}`);
  },
};
