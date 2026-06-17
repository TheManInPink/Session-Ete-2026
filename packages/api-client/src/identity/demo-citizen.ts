/**
 * @file        demo-citizen.ts
 * @description Générateur de profil citoyen **déterministe** pour le mode démo.
 *
 *              C'est l'implémentation « mock » de la couture identité : tant que
 *              identity-service (doc 07) n'est pas branché, `generateDemoCitizen`
 *              recrée un profil riche et reproductible à partir du seul NINA
 *              (nom, prénom, profession, situation matrimoniale, parents, région).
 *              Le même NINA produit toujours le même citoyen — indispensable pour
 *              des captures d'écran stables et une démo rejouable.
 *
 *              ⚠️  Données SYNTHÉTIQUES : aucun lien avec une personne réelle.
 *              Quand le backend sera livré, remplacer l'appel par :
 *                  const citizen = await api.identity.getByNina(nina);
 *              La forme {@link DemoCitizen} est volontairement alignée sur le
 *              `citizenDtoSchema` (@nina-aes/shared-types) pour que la bascule
 *              mock → réel ne touche que la couche données, pas la vue.
 *
 * @module      @nina-aes/api-client
 */

/** Relation d'un parent (sous-ensemble de `parentSchema`). */
export interface DemoParent {
  firstName: string;
  lastName: string;
}

/** Profil citoyen synthétique reproductible (côté mock de la couture identité). */
export interface DemoCitizen {
  nina: string;
  firstName: string;
  lastName: string;
  /** Initiales pour le placeholder photo (ex. « M.K »). */
  initials: string;
  sex: 'MALE' | 'FEMALE';
  /** Situation matrimoniale (clé `MaritalStatus`). */
  maritalStatus: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
  /** Profession accordée au sexe (ex. « Enseignante »). */
  profession: string;
  /** Année de naissance reconstituée (`19XX`). */
  birthYear: string;
  /** Mois de naissance (2 chiffres). */
  birthMonth: string;
  /** Code région RAVEC (1 chiffre). */
  regionCode: string;
  /** Nom de la région correspondant au code (ex. « Koulikoro »). */
  regionName: string;
  cercleCode: string;
  communeCode: string;
  father: DemoParent;
  mother: DemoParent;
}

// ── Hash déterministe (FNV-1a 32 bits) ───────────────────────────────────────

/**
 * Hash FNV-1a 32 bits d'une chaîne. Le `salt` permet de dériver plusieurs
 * valeurs indépendantes du même NINA (un salt par attribut).
 */
function fnv1a(input: string, salt = ''): number {
  let h = 0x811c9dc5;
  const s = salt + input;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Choisit un élément d'un tableau de façon déterministe (NINA + salt). */
function pick<T>(arr: readonly T[], nina: string, salt: string): T {
  return arr[fnv1a(nina, salt) % arr.length]!;
}

// ── Réservoirs de noms (maliens, synthétiques) ───────────────────────────────

const FIRST_NAMES_M = [
  'Modibo',
  'Amadou',
  'Ibrahim',
  'Boubacar',
  'Seydou',
  'Oumar',
  'Moussa',
  'Bakary',
  'Adama',
  'Cheick',
  'Souleymane',
  'Mamadou',
  'Drissa',
  'Yacouba',
  'Aliou',
  'Issa',
  'Sékou',
  'Abdoulaye',
] as const;

const FIRST_NAMES_F = [
  'Fatoumata',
  'Aminata',
  'Mariam',
  'Kadiatou',
  'Aïssata',
  'Rokia',
  'Oumou',
  'Djénéba',
  'Hawa',
  'Assitan',
  'Bintou',
  'Nana',
  'Salimata',
  'Fanta',
  'Ramata',
  'Coumba',
  'Maïmouna',
  'Kadidia',
] as const;

const LAST_NAMES = [
  'Diallo',
  'Traoré',
  'Coulibaly',
  'Keïta',
  'Konaté',
  'Diarra',
  'Sangaré',
  'Touré',
  'Cissé',
  'Sidibé',
  'Camara',
  'Kanté',
  'Maïga',
  'Doumbia',
  'Dembélé',
  'Sissoko',
  'Fofana',
  'Bagayoko',
  'Sow',
  'Bah',
] as const;

/** 15 professions courantes, accordées au sexe. */
const PROFESSIONS: ReadonlyArray<{ m: string; f: string }> = [
  { m: 'Agriculteur', f: 'Agricultrice' },
  { m: 'Enseignant', f: 'Enseignante' },
  { m: 'Commerçant', f: 'Commerçante' },
  { m: 'Éleveur', f: 'Éleveuse' },
  { m: 'Artisan', f: 'Artisane' },
  { m: 'Couturier', f: 'Couturière' },
  { m: 'Infirmier', f: 'Infirmière' },
  { m: 'Maraîcher', f: 'Maraîchère' },
  { m: 'Pêcheur', f: 'Pêcheuse' },
  { m: 'Menuisier', f: 'Menuisière' },
  { m: 'Fonctionnaire', f: 'Fonctionnaire' },
  { m: 'Marchand', f: 'Marchande' },
  { m: 'Forgeron', f: 'Potière' },
  { m: 'Tailleur', f: 'Coiffeuse' },
  { m: 'Chauffeur', f: 'Sage-femme' },
];

/** Distribution réaliste (marié·e surreprésenté). */
const MARITAL = ['SINGLE', 'MARRIED', 'MARRIED', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;

/** Régions administratives du Mali, indexées par le code région RAVEC (1 chiffre). */
const REGIONS: Record<string, string> = {
  '0': 'District / hors-zone',
  '1': 'Kayes',
  '2': 'Koulikoro',
  '3': 'Sikasso',
  '4': 'Ségou',
  '5': 'Mopti',
  '6': 'Tombouctou',
  '7': 'Gao',
  '8': 'Kidal',
  '9': 'Bamako (District)',
};

// ── Générateur ───────────────────────────────────────────────────────────────

/**
 * Recrée un profil citoyen synthétique **déterministe** à partir d'un NINA.
 *
 * @param nina - NINA en 15 caractères (sera normalisé en majuscules sans espaces).
 * @returns Un {@link DemoCitizen} stable pour ce NINA.
 */
export function generateDemoCitizen(nina: string): DemoCitizen {
  const n = (nina ?? '').replace(/[\s\-_.]+/g, '').toUpperCase();

  const sex: 'MALE' | 'FEMALE' = n[0] === '2' ? 'FEMALE' : 'MALE';
  const firstNamePool = sex === 'FEMALE' ? FIRST_NAMES_F : FIRST_NAMES_M;

  const firstName = pick(firstNamePool, n, 'first');
  const lastName = pick(LAST_NAMES, n, 'last');
  const prof = pick(PROFESSIONS, n, 'prof');
  const profession = sex === 'FEMALE' ? prof.f : prof.m;
  const maritalStatus = pick(MARITAL, n, 'marital');

  const regionCode = n.substring(5, 6) || '0';

  return {
    nina: n,
    firstName,
    lastName,
    initials: `${firstName[0] ?? ''}.${lastName[0] ?? ''}`,
    sex,
    maritalStatus,
    profession,
    birthYear: `19${n.substring(1, 3)}`,
    birthMonth: n.substring(3, 5),
    regionCode,
    regionName: REGIONS[regionCode] ?? `ML-${regionCode}`,
    cercleCode: n.substring(6, 8),
    communeCode: n.substring(8, 11),
    // Le père porte le patronyme ; la mère un nom de jeune fille distinct.
    father: { firstName: pick(FIRST_NAMES_M, n, 'father'), lastName },
    mother: {
      firstName: pick(FIRST_NAMES_F, n, 'mother'),
      lastName: pick(LAST_NAMES, n, 'motherName'),
    },
  };
}
