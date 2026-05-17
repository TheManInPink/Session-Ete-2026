import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReact from 'eslint-plugin-react';
import globals from 'globals';
import { config as baseConfig } from './base.js';

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config[]} */
export const config = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  {
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    // version littérale (pas "detect") : eslint-plugin-react@7.37.5 utilise
    // `context.getFilename()` dans son détecteur de version, méthode supprimée
    // dans ESLint 10 → crash `contextOrFilename.getFilename is not a function`.
    // Toutes les apps Next.js consomment React 19, on hardcode 19.0 ici.
    settings: { react: { version: '19.0' } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform.
      'react/react-in-jsx-scope': 'off',
      // En TypeScript, les props sont validées par les types (e.g.
      // `LabelHTMLAttributes<HTMLLabelElement>`). `react/prop-types`
      // ne sait pas suivre l'héritage des types React et produit
      // des faux positifs sur `className`, `ref`, etc.
      'react/prop-types': 'off',
    },
  },
];
