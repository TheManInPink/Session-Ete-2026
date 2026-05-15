/**
 * @file        jest.config.ts
 * @description Configuration Jest 30 + ts-jest pour `@nina-aes/utils`.
 *              Utilise le preset ESM-friendly et `node:` core modules.
 * @module      @nina-aes/utils
 */

import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // ts-jest s'aligne sur le tsconfig hérité du monorepo.
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 85, statements: 85 },
  },
  clearMocks: true,
  verbose: false,
};

export default config;
