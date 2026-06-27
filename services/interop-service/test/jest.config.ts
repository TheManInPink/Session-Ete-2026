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
  // Permet les imports relatifs en `.js` (ESM-style) dans le code source.
  moduleNameMapper: {
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
