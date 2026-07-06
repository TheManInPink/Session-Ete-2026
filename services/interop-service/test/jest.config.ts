import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/unit/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/test/tsconfig.json',
        diagnostics: { ignoreCodes: ['TS151001', 'TS151002'] },
      },
    ],
  },
  moduleNameMapper: {
    // `@nina-aes/database` ne publie que de l'ESM (`"type": "module"`,
    // `dist/src/index.js`) et vit sous `node_modules` en symlink workspace —
    // donc HORS du périmètre de `transformIgnorePatterns` (qui ne cible que
    // `.pnpm/`). Le runtime CommonJS de Jest ne peut donc pas charger son dist
    // ESM (`SyntaxError: Cannot use import statement outside a module`, cf.
    // l'`import()` réel de soft-delete-bypass.int.spec.ts). On le mappe vers la
    // SOURCE TS : ts-jest (mode non-ESM) la recompile en CommonJS. Les specs qui
    // mockent le module (`jest.mock('@nina-aes/database', factory)`) ne sont pas
    // affectées — le factory prime sur le mapper.
    '^@nina-aes/database$': '<rootDir>/../../packages/database/src/index.ts',
    // Permet les imports relatifs en `.js` (ESM-style) dans le code source.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // `jose@6` et `@noble/*` ne publient QUE de l'ESM : par défaut Jest ignore
  // `node_modules`, on les ré-inclut donc dans la transformation ts-jest (qui
  // ré-écrit l'ESM en CommonJS pour l'exécution des tests).
  transformIgnorePatterns: ['/node_modules/\\.pnpm/(?!(jose@|@noble\\+))'],
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
