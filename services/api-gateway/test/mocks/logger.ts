/**
 * @file        test/mocks/logger.ts
 * @description Mock Jest de `@nina-aes/logger` (le vrai package est ESM, que le
 *              runtime CommonJS de ts-jest ne peut pas `require`). Mappé via
 *              `moduleNameMapper` dans test/jest.config.ts. N'affecte QUE les
 *              tests — le build/runtime réels utilisent le vrai package.
 */

/** Surface minimale du logger structuré utilisée par le code du gateway. */
export type StructuredLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
};

/** En test, aucun contexte de corrélation actif. */
export function getContext(): { correlationId?: string } | undefined {
  return undefined;
}
