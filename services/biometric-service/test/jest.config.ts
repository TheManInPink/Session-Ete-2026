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
  // `@noble/ed25519` est ESM pur (`"type":"module"`). Par défaut Jest ignore
  // `node_modules` à la transformation → on lève l'exclusion pour CE package
  // afin que ts-jest le transpile en CommonJS (le consent.verifier spec signe de
  // vrais JWS Ed25519). Les autres ESM (`@nina-aes/vault-client`) sont MOCKÉS
  // dans les specs concernées plutôt que transformés.
  transformIgnorePatterns: ['node_modules/(?!\\.pnpm/@noble\\+ed25519|@noble/ed25519)'],
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
