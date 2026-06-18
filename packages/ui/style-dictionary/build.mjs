/**
 * build.mjs — Pipeline Style Dictionary 4 NINA-AES.
 *
 * Source de vérité : docs/design-system/tokens.json (format DTCG / Style Dictionary 4).
 * Génère :
 *   - src/styles/tokens.css  → échelles de couleur dans `@theme` (utilitaires Tailwind v4)
 *                              + rôles sémantiques et mode sombre dans `:root`.
 *   - style-dictionary/generated/tokens.mjs → carte JS des valeurs résolues (consommateurs
 *                              RN / JS hors CSS).
 *
 * IMPORTANT : `src/styles/tokens.css` est GÉNÉRÉ — ne pas l'éditer à la main. Toute
 * modification de valeur passe par tokens.json puis `pnpm --filter @nina-aes/ui tokens:build`.
 *
 * Pourquoi un format CSS custom plutôt que `css/variables` par défaut :
 *   - Les ÉCHELLES de couleur doivent vivre dans `@theme` (seul bloc qui génère des
 *     utilitaires en Tailwind v4) avec leurs valeurs résolues (hsl littéral).
 *   - Les RÔLES sémantiques (`--bg`, `--primary`, …) doivent rester dans `:root`, exprimés
 *     en `var(--color-…)` (références), et être surchargeables en mode sombre
 *     (`:root[data-theme='dark']`) — ce qu'un `@theme` statique ne permet pas.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import StyleDictionary from 'style-dictionary';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '..', '..', '..');
const tokensSource = path.join(repoRoot, 'docs', 'design-system', 'tokens.json');

/** `{color.neutral.50}` → `var(--color-neutral-50)`. */
function refToVar(value) {
  const match = /^\{([^}]+)\}$/.exec(String(value).trim());
  return match ? `var(--${match[1].split('.').join('-')})` : String(value);
}

/** Valeur résolue d'un token (DTCG ou legacy). */
const resolved = (t) => (t.value !== undefined ? t.value : t.$value);
/** Valeur d'origine (avant résolution des références). */
const original = (t) => (t.original?.$value !== undefined ? t.original.$value : t.original?.value);

const HEADER = `/**
 * tokens.css — GÉNÉRÉ par Style Dictionary (packages/ui/style-dictionary/build.mjs).
 * NE PAS ÉDITER À LA MAIN. Source de vérité : docs/design-system/tokens.json.
 * Régénérer : pnpm --filter @nina-aes/ui tokens:build
 *
 * Échelles de couleur dans @theme → utilitaires Tailwind v4 (bg-primary-50, text-success-700…).
 * Rôles sémantiques + mode sombre dans :root (consommés par le @theme inline de globals.css).
 */`;

/**
 * Format CSS NINA-AES — reconstruit manuellement la structure attendue à partir du
 * dictionnaire résolu.
 */
StyleDictionary.registerFormat({
  name: 'nina/tokens-css',
  format: ({ dictionary }) => {
    const tokens = dictionary.allTokens;
    const byRoot = (root) => tokens.filter((t) => t.path[0] === root);

    // Échelles de couleur : tout `color.*` SAUF les sous-groupes intermédiaires `*.hsl.*`.
    const colorScale = byRoot('color').filter((t) => !t.path.includes('hsl'));
    const semantic = byRoot('semantic');
    const semanticDark = byRoot('semanticDark');
    const spacing = byRoot('spacing');
    const radius = byRoot('radius');
    const shadow = byRoot('shadow');

    const themeBlock = colorScale.map((t) => `  --${t.path.join('-')}: ${resolved(t)};`).join('\n');

    // Rôle → `--<role>: var(--color-…)` (slice(1) retire le préfixe semantic/semanticDark).
    const roleLine = (t) => `    --${t.path.slice(1).join('-')}: ${refToVar(original(t))};`;
    const litLine = (prefix) => (t) =>
      `    --${prefix}-${t.path.slice(1).join('-')}: ${resolved(t)};`;

    const rootBlock = [
      semantic.map(roleLine).join('\n'),
      spacing.map(litLine('space')).join('\n'),
      radius.map(litLine('radius')).join('\n'),
      shadow.map(litLine('shadow')).join('\n'),
    ]
      .filter(Boolean)
      .join('\n\n');

    const darkBlock = semanticDark.map(roleLine).join('\n');

    return `${HEADER}

@layer theme, base, components, utilities;

@theme {
${themeBlock}
}

@layer theme {
  :root {
${rootBlock}
  }

  :root[data-theme='dark'] {
${darkBlock}
  }
}
`;
  },
});

const sd = new StyleDictionary({
  source: [tokensSource],
  usesDtcg: true,
  platforms: {
    css: {
      // Pas de transform de valeur : on préserve les valeurs telles qu'écrites (hsl littéral) ;
      // la résolution des références ({color.…}) reste automatique. `name/kebab` donne aux tokens
      // un nom unique (évite l'avertissement de collision — non utilisé par le format, qui
      // construit les noms de variables depuis `token.path`).
      buildPath: `${packageRoot}/`,
      transforms: ['name/kebab'],
      files: [{ destination: 'src/styles/tokens.css', format: 'nina/tokens-css' }],
    },
    js: {
      buildPath: `${packageRoot}/`,
      transformGroup: 'js',
      files: [{ destination: 'style-dictionary/generated/tokens.mjs', format: 'javascript/esm' }],
    },
  },
});

await sd.buildAllPlatforms();
console.log('✅ tokens générés depuis', path.relative(repoRoot, tokensSource));
