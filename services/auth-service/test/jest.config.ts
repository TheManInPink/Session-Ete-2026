import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/test/tsconfig.json',
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  // Les services TypeScript de ce package importent en `.js` (NodeNext) ;
  // ts-jest a besoin de réécrire ces extensions pour la résolution Jest.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '@nina-aes/database': '<rootDir>/../../packages/database/src/index.ts',
    '@nina-aes/utils': '<rootDir>/../../packages/utils/src/index.ts',
    '@nina-aes/shared-types': '<rootDir>/../../packages/shared-types/src/index.ts',
    '@nina-aes/config': '<rootDir>/../../packages/config/src/index.ts',
    '@nina-aes/auth-guards': '<rootDir>/../../packages/auth-guards/src/index.ts',
    '@nina-aes/vault-client': '<rootDir>/../../packages/vault-client/src/index.ts',
  },
};

export default config;
