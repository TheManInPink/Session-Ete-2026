/**
 * @file        jest.setup.ts
 * @description Global setup Jest : désactive le chargement automatique du
 *              fichier `.env` racine pendant les tests pour que les cas
 *              fournissent leurs propres environnements de validation.
 * @module      @nina-aes/config
 */

export default async function globalSetup(): Promise<void> {
  process.env.NINA_SKIP_DOTENV = '1';
}
