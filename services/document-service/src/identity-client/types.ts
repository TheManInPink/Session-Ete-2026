/**
 * @file        types.ts
 * @description Types DTO retournés par identity-service vers document-service.
 * @module      document-service/identity-client
 */

/** Sexe du citoyen, aligné enum Prisma `Sex`. */
export type CitizenSex = 'MALE' | 'FEMALE' | 'UNKNOWN';

/** Statut matrimonial aligné enum Prisma `MaritalStatus`. */
export type CitizenMaritalStatus =
  | 'SINGLE'
  | 'MARRIED'
  | 'DIVORCED'
  | 'WIDOWED'
  | 'SEPARATED'
  | 'CIVIL_UNION';

/** Localisation administrative (1 niveau). */
export interface LocationDto {
  id: string;
  code: string;
  name: string;
  level: number;
  parentId: string | null;
}

/** Localisation enrichie de la chaîne d'ancêtres jusqu'à la racine. */
export interface LocationWithAncestorsDto {
  location: LocationDto;
  ancestors: { id: string; name: string; level: number }[];
  path: string;
}

/** Parent (père ou mère) tel qu'exposé par identity-service. */
export interface ParentDto {
  id: string;
  firstName: string;
  lastName: string;
  nina: string | null;
  sex: CitizenSex;
  birthDate: string | null;
}

/**
 * Citoyen complet retourné par `GET /api/v1/citizens/:nina`.
 * `birthPlace` et `residence` sont la LOCATION FEUILLE — pour obtenir
 * la chaîne hiérarchique, appeler {@link IdentityClient.fetchLocation}.
 */
export interface CitizenDto {
  id: string;
  nina: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: CitizenSex;
  maritalStatus: CitizenMaritalStatus;
  profession: string | null;
  photoUrl: string | null;
  photoHash: string | null;
  fingerprintHash: string | null;
  preferredLanguage: string;
  birthPlace: LocationDto;
  residence: LocationDto;
  father: ParentDto | null;
  mother: ParentDto | null;
}
