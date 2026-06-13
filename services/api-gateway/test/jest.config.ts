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
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  // Mappe les packages workspace ESM (logger, observability) vers des stubs CJS
  // — le runtime CommonJS de ts-jest ne peut pas `require` de l'ESM. Puis
  // permet les imports relatifs en `.js` (ESM-style) dans le code source.
  // ⚠️ Ordre important : les entrées spécifiques @nina-aes AVANT le motif générique.
  moduleNameMapper: {
    '^@nina-aes/logger/nestjs$': '<rootDir>/test/mocks/logger-nestjs.ts',
    '^@nina-aes/logger$': '<rootDir>/test/mocks/logger.ts',
    '^@nina-aes/observability$': '<rootDir>/test/mocks/observability.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  // Le boot Nest (routing.spec) + les fetch downstream avec timeout peuvent
  // dépasser le défaut de 5 s sur machine lente.
  testTimeout: 20000,
};

export default config;
