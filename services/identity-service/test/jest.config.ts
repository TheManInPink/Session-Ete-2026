import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    // `rootDir: '..'` ⇒ rootDir = services/identity-service. Pour atteindre
    // <repo>/packages il faut remonter de DEUX niveaux (services/ puis la racine).
    '@nina-aes/database': '<rootDir>/../../packages/database/src/index.ts',
    '@nina-aes/utils': '<rootDir>/../../packages/utils/src/index.ts',
    '@nina-aes/shared-types': '<rootDir>/../../packages/shared-types/src/index.ts',
    '@nina-aes/config': '<rootDir>/../../packages/config/src/index.ts',
  },
};

export default config;
