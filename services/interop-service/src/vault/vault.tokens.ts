/**
 * @file        vault.tokens.ts
 * @description Token DI du client Vault, isolé du module pour éviter qu'un import
 *              du token entraîne le chargement (ESM) du package `@nina-aes/
 *              vault-client` (utile pour le mocking en test ts-jest CommonJS).
 * @module      interop-service/vault
 */

/** Token DI pour le client Vault. */
export const VAULT_CLIENT = 'VAULT_CLIENT';
