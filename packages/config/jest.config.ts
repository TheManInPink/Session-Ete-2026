/**
 * @file        jest.config.ts
 * @description Configuration Jest 30 + ts-jest pour `@nina-aes/config`.
 * @module      @nina-aes/config
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
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**'],
  clearMocks: true,
  verbose: false,
  // Empêche le chargement automatique de `.env` racine pendant les tests :
  // les tests fournissent leurs propres environnements via `validateEnv(schema, {…})`.
  globalSetup: '<rootDir>/src/__tests__/jest.setup.ts',
};

export default config;
