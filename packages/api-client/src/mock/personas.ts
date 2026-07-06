/**
 * @file        personas.ts
 * @description Identités **synthétiques** partagées par les fixtures mock.
 *
 *              Les identifiants sont alignés sur les sessions mock des apps
 *              (`packages/auth` + `apps/<app>/lib/auth/session.ts`) pour que
 *              les écrans puissent comparer « moi » ↔ données sans adaptation :
 *              l'inbox SGOGT mock est adressée au MÊME id que la session mock
 *              de l'app governance.
 *
 *              ⚠️ Données fictives : aucun lien avec des personnes réelles.
 *
 * @module      @nina-aes/api-client
 */

import { uuidFrom } from './deterministic';

/** NINA mock par défaut (Fatoumata Diallo, lettre de contrôle V valide). */
export const DEFAULT_MOCK_NINA = '18903102015042V';

/**
 * Identifiant utilisateur de la session mock **governance** — MÊME valeur que
 * `MOCK_OFFICIAL.id` dans `apps/governance/lib/auth/session.ts` (persona
 * « Général Issa Ousmane Coulibaly »). L'inbox SGOGT mock lui est adressée.
 */
export const MOCK_GOVERNANCE_USER_ID = 'mock-gov-001';

/** Entrée d'annuaire mock (les `MessageView` ne portent que des ids). */
export interface MockGovernanceOfficial {
  id: string;
  name: string;
  title: string;
}

/**
 * Annuaire mock des hauts fonctionnaires — permet aux écrans GOV-01/GOV-02
 * d'afficher un nom à partir des `senderId`/`createdById` des fixtures.
 * En mode live, ce mapping viendra d'un futur annuaire backend.
 */
export const MOCK_GOVERNANCE_DIRECTORY: readonly MockGovernanceOfficial[] = [
  {
    id: MOCK_GOVERNANCE_USER_ID,
    name: 'Général Issa Ousmane Coulibaly',
    title: "Ministère de l'Intérieur",
  },
  {
    id: uuidFrom('gov-user-primature'),
    name: 'Dr Aminata Maïga',
    title: 'Secrétaire générale de la Primature',
  },
  {
    id: uuidFrom('gov-user-dnec'),
    name: 'Colonel Souleymane Dembélé',
    title: "Directeur national de l'état civil (DNEC)",
  },
  {
    id: uuidFrom('gov-user-securite'),
    name: 'Commissaire Awa Sangaré',
    title: 'Direction de la sécurité intérieure',
  },
];

/**
 * UUID déterministe du relecteur mock côté admin (le champ `reviewedBy` du
 * schéma exige un UUID — l'id de session mock admin `mock-agent-001` n'en est
 * pas un). Posé par `approve`/`reject` du mock.
 */
export const MOCK_ADMIN_REVIEWER_ID = uuidFrom('user-mock-agent-001');

/** Second relecteur mock (variété pour le filtre `agent` d'AD-02). */
export const MOCK_SECOND_REVIEWER_ID = uuidFrom('user-mock-agent-002');
