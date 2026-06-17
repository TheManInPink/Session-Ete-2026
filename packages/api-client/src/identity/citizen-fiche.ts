/**
 * @file        citizen-fiche.ts
 * @description Modèle de vue « Fiche citoyen » (PC-02) + adaptateurs.
 *
 *              L'écran PC-02 a besoin d'un objet de présentation stable
 *              ({@link CitizenFiche}) qui peut être alimenté indifféremment par :
 *                - le générateur démo `generateDemoCitizen` (mode mock) ;
 *                - la réponse réelle `Citizen` d'identity-service (mode live).
 *
 *              Les **codes** structurels (région, cercle, commune, lettre de
 *              contrôle) ne figurent pas ici : ils se dérivent du NINA lui-même
 *              via `parseNina()` côté écran, donc indépendamment de la source.
 *              Ici on ne porte que les champs « registre » (noms, profession,
 *              filiation, statut matrimonial…).
 *
 * @module      @nina-aes/api-client
 */

import type { Citizen } from './identity.client';
import type { DemoCitizen } from './demo-citizen';

/** Données de présentation d'une fiche citoyen (source-agnostique). */
export interface CitizenFiche {
  nina: string;
  firstName: string;
  lastName: string;
  fullName: string;
  /** Initiales pour le placeholder photo (ex. « M.K »). */
  initials: string;
  /** Clé de sexe (`MALE` | `FEMALE` | `UNKNOWN`). */
  sex: string;
  /** Clé de situation matrimoniale (`SINGLE`, `MARRIED`, …). */
  maritalStatus: string;
  profession: string;
  /** Libellé de naissance prêt à afficher (ex. « 03/1989 » ou « 1989-03-10 »). */
  birthLabel: string;
  /** Vrai si la date est reconstituée (mode démo) → afficher « (estimé) ». */
  birthEstimated: boolean;
  /** Nom de la région de résidence (ou de naissance en repli). */
  regionName: string;
  /** Nom du cercle si connu (null en mode démo → l'écran affiche le code NINA). */
  cercleName: string | null;
  /** Nom de la commune si connue (null en mode démo). */
  communeName: string | null;
  father: { firstName: string; lastName: string };
  mother: { firstName: string; lastName: string };
  /** Vrai si la fiche provient de données synthétiques (mode démo). */
  synthetic: boolean;
}

/**
 * Adapte un profil démo déterministe en {@link CitizenFiche}.
 *
 * @param d - Profil renvoyé par `generateDemoCitizen`.
 */
export function ficheFromDemo(d: DemoCitizen): CitizenFiche {
  return {
    nina: d.nina,
    firstName: d.firstName,
    lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`,
    initials: d.initials,
    sex: d.sex,
    maritalStatus: d.maritalStatus,
    profession: d.profession,
    birthLabel: `${d.birthMonth}/${d.birthYear}`,
    birthEstimated: true,
    regionName: d.regionName,
    // En démo on ne dispose que des codes (affichés via parseNina côté écran).
    cercleName: null,
    communeName: null,
    father: { firstName: d.father.firstName, lastName: d.father.lastName },
    mother: { firstName: d.mother.firstName, lastName: d.mother.lastName },
    synthetic: true,
  };
}

/**
 * Adapte un `Citizen` réel (identity-service) en {@link CitizenFiche}.
 *
 * @param c - Réponse validée d'identity-service.
 */
export function ficheFromCitizen(c: Citizen): CitizenFiche {
  const father = c.parents.find((p) => p.relation === 'FATHER');
  const mother = c.parents.find((p) => p.relation === 'MOTHER');
  // `residence`/`birthPlace` sont garantis non-null par `citizenDtoSchema`
  // (locationSchema requis, champs min(1)). Le chaînage optionnel + repli `'—'`
  // restent défensifs face à une réponse API malformée (fail-safe d'affichage).
  const region = c.residence?.région ?? c.birthPlace?.région ?? '—';

  return {
    nina: c.nina,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: `${c.firstName} ${c.lastName}`,
    initials: `${c.firstName.charAt(0)}.${c.lastName.charAt(0)}`,
    sex: c.sex,
    maritalStatus: c.maritalStatus,
    profession: c.profession,
    birthLabel: c.birthDate,
    birthEstimated: false,
    regionName: region,
    cercleName: c.residence?.cercle ?? null,
    communeName: c.residence?.commune ?? null,
    father: {
      firstName: father?.firstName ?? '—',
      lastName: father?.lastName ?? c.lastName,
    },
    mother: {
      firstName: mother?.firstName ?? '—',
      lastName: mother?.lastName ?? '—',
    },
    synthetic: false,
  };
}
