/**
 * Configuration Jest pour @nina-aes/logger.
 *
 * POURQUOI .cjs : le package racine est en `"type": "module"`. Jest et
 * ts-jest gèrent mieux la résolution de config en CommonJS explicite ici.
 *
 * NodeNext + .js dans les imports TS : on configure ts-jest pour réécrire
 * les imports `.js` vers leurs sources `.ts` en mode test (voir moduleNameMapper).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Réécrit les imports `./foo.js` vers `./foo.ts` (compat NodeNext + ts-jest)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
    '!src/nestjs/**', // sous-package NestJS testé via les services qui l'utilisent
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
