/**
 * @file        jest.config.cjs
 * @description Configuration Jest 30 + ts-jest pour `@nina-aes/vault-client`.
 *
 *              Spécificités :
 *                - Le package est ESM (`"type": "module"` dans
 *                  package.json) et utilise des imports avec extension
 *                  `.js` dans les sources TS (cf. NodeNext). ts-jest
 *                  compile en CJS pour les tests + on strip `.js` des
 *                  paths via moduleNameMapper.
 *                - On ignore `dist/` sinon Jest scanne aussi les
 *                  `.test.js` compilés (qui sont ESM et plantent en CJS)
 *                  et les `.test.d.ts` (qui ne sont pas exécutables).
 *                - Extension `.cjs` (pas `.ts`) pour éviter d'exiger
 *                  ts-node juste pour charger la config.
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // tsconfig override : on force commonjs pour les tests même si le
        // package est ESM en runtime (NodeNext dans tsconfig.json). Sinon
        // ts-jest émet `import` statements que Jest CJS ne sait pas
        // exécuter (SyntaxError: Cannot use import statement outside a module).
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          ignoreDeprecations: '6.0',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          target: 'ES2022',
          types: ['node', 'jest'],
        },
        useESM: false,
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  // Les sources TS écrivent `from '../index.js'` (NodeNext) ; ts-jest a
  // besoin que Jest résolve ces specifiers vers le `.ts` correspondant.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**'],
  clearMocks: true,
  verbose: false,
};
