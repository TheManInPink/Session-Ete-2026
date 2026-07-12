/**
 * @file        seed.ts
 * @description Script de seed Prisma — peuple la base NINA-AES avec :
 *                - 1 pays (Mali)
 *                - **20 entités niveau 1** : 19 régions + District de Bamako
 *                  (loi 2023, source : data/mali/regions.json)
 *                - **65 cercles confirmés** post-2023 (source : data/mali/cercles.json)
 *                - ~150 communes échantillon (pédagogiques, ~3-7 par cercle)
 *                - 10 institutions (CTDEC, DNEC, MAT, mairie, gouvernorat + 5 antennes RAVEC)
 *                - 6 centres d'enrôlement (profils opérationnels EnrollmentCenter)
 *                - 6 utilisateurs système (un par rôle UserRole)
 *
 *              Les niveaux 1 et 2 sont LUS depuis les fichiers JSON sous
 *              `data/mali/` (source de vérité — voir docs/data/mali-divisions.md).
 *              Le tableau `COMMUNES_PEDAGOGIQUES` ci-dessous reste en dur car
 *              il sert d'amorce de tests, pas de référentiel complet (819 communes
 *              au total au Mali — ingestion future via INSTAT).
 *
 *              Exécution : `pnpm --filter @nina-aes/database db:seed`
 *              (déclenche `tsx prisma/seed.ts`).
 *
 *              Idempotent : basé sur `upsert()` avec les clés uniques
 *              `code` (Location, Institution) et `keycloakId` (User).
 *              Peut être ré-exécuté sans duplication.
 *
 * @author      Étudiant UQAR
 * @date        Mai 2026 (mis à jour pour la loi 2023 — 19 régions + District)
 * @module      @nina-aes/database
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { expand as dotenvExpand } from 'dotenv-expand';

// Charge le .env racine + interpolation `${VAR}` AVANT d'importer prisma
// (sinon le client se construit avec la fallback string et échoue P1000).
const __dirname_pre = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname_pre, '../../../.env');
if (fs.existsSync(envPath)) {
  dotenvExpand(dotenv.config({ path: envPath, override: false }));
}

const { prisma, disconnectPrisma } = await import('../src/index.js');

// ──────────────────────────────────────────────────────────────────────────────
//  Chargement des référentiels JSON (data/mali/)
// ──────────────────────────────────────────────────────────────────────────────

const __dirname = __dirname_pre;
const DATA_MALI = path.resolve(__dirname, '../../../data/mali');

interface RegionRecord {
  code: string;
  nom_officiel: string;
  nom_court: string;
  chef_lieu: string;
  centroide: { lat: number; lng: number; estime: boolean };
}

interface CercleRecord {
  code: string;
  nom: string;
  region_code: string;
  centroide: { lat: number; lng: number; estime: boolean };
  confiance: 'haute' | 'moyenne' | 'basse';
  type_special?: string;
}

/** Lit un JSON typé depuis `data/mali/<file>`. */
function loadMaliJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_MALI, file), 'utf8');
  return JSON.parse(raw) as T;
}

const REGIONS_DATA = loadMaliJson<{ regions: RegionRecord[] }>('regions.json').regions;
const CERCLES_DATA = loadMaliJson<{ cercles: CercleRecord[] }>('cercles.json').cercles;

// ──────────────────────────────────────────────────────────────────────────────
//  Utilitaires
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Supprime les diacritiques et met en majuscules pour générer une clé de
 * recherche compatible trigram.
 */
function toAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[''`]/g, '')
    .toUpperCase();
}

/**
 * Crée ou met à jour une `Location`. Centralise la logique `upsert` pour
 * éviter la duplication de blocs `where / create / update`.
 */
async function upsertLocation(input: {
  code: string;
  name: string;
  level: number;
  parentCode?: string;
  latitude?: number;
  longitude?: number;
}): Promise<string> {
  let parentId: string | undefined;
  if (input.parentCode) {
    const parent = await prisma.location.findUnique({
      where: { code: input.parentCode },
      select: { id: true },
    });
    if (!parent) {
      throw new Error(`[seed] Parent "${input.parentCode}" introuvable pour "${input.code}"`);
    }
    parentId = parent.id;
  }

  const row = await prisma.location.upsert({
    where: { code: input.code },
    create: {
      code: input.code,
      name: input.name,
      nameAscii: toAscii(input.name),
      level: input.level,
      parentId,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
    update: {
      name: input.name,
      nameAscii: toAscii(input.name),
      level: input.level,
      parentId,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
    select: { id: true },
  });
  return row.id;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Données Mali : communes échantillon (régions + cercles via JSON officiels)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Communes échantillon par code de cercle. Données pédagogiques pour amorcer
 * les tests — **PAS un référentiel exhaustif** (819 communes au total au Mali).
 *
 * Les rattachements régionaux ont été mis à jour pour refléter la **loi 2023** :
 *   - Bougouni / Yanfolila → région ML-16 (Bougouni)
 *   - Koutiala / Yorosso  → région ML-17 (Koutiala)
 *   - Nioro / Yélimané    → région ML-12 (Nioro)
 *   - Kita                → région ML-13 (Kita)
 *   - Dioïla / Fana       → région ML-14 (Dioïla)
 *   - Nara                → région ML-15 (Nara)
 *   - San / Tominian      → région ML-18 (San)
 *   - Bandiagara/Bankass/Koro → région ML-19 (Bandiagara)
 *   - Douentza            → région ML-20 (Douentza)
 *
 * Pour les ~94 cercles non listés ici, le seed les insère sans commune en
 * dessous — l'enrichissement viendra via `scripts/enrich-cercles.py`.
 */
const COMMUNES_PEDAGOGIQUES: Record<string, string[]> = {
  // ── Région Kayes (ML-01) ──────────────────────────────────────────────────
  'ML-01-01': ['Kayes', 'Diamou', 'Liberté-Dembaya', 'Sadiola', 'Samé-Diomgoma', 'Ségala'],
  'ML-01-02': ['Bafoulabé', 'Mahina', 'Diokéli', 'Oualia', 'Gounfan'],
  'ML-01-03': ['Diéma', 'Béma', 'Diangounté-Camara', 'Fassoudébé', 'Lambidou'],
  'ML-01-04': ['Kéniéba', 'Baye', 'Dabia', 'Faléa', 'Sagalo'],

  // ── Région Nioro (ML-12, anciennement sous Kayes) ─────────────────────────
  'ML-12-01': ['Nioro du Sahel', 'Baniéré-Koré', 'Diaye-Coura', 'Sandaré', 'Youri'],

  // ── Région Kita (ML-13, anciennement sous Kayes) ──────────────────────────
  'ML-13-01': ['Kita', 'Badia', 'Bendougouba', 'Didiéni', 'Kita-Nord', 'Sébékoro'],

  // ── Région Koulikoro (ML-02) ──────────────────────────────────────────────
  'ML-02-01': ['Koulikoro', 'Doumba', 'Méguétan', 'Nyamina', 'Tienfala'],
  'ML-02-02': ['Banamba', 'Duguwolowula', 'Kiban', 'Madina-Sacko', 'Touba'],
  'ML-02-03': ['Kangaba', 'Balan-Bakama', 'Maramandougou', 'Nouga', 'Séléfougou'],
  'ML-02-04': ['Kati', 'Dialakoroba', 'Dio-Gare', 'Kambila', 'Mountougoula', 'Sanankoroba', 'Siby'],
  'ML-02-05': ['Kolokani', 'Didiéni', 'Guihoyo', 'Massantola', 'Nossombougou'],

  // ── Région Dioïla (ML-14, anciennement sous Koulikoro) ────────────────────
  'ML-14-01': ['Dioïla', 'Kilidougou', 'Massigui', "N'Garadougou"],
  'ML-14-02': ['Fana', 'Banco', 'Diébé', 'Niantjila'],

  // ── Région Nara (ML-15, anciennement sous Koulikoro) ──────────────────────
  'ML-15-01': ['Nara', 'Dabo', 'Dogofry', 'Koronga', 'Niamana'],

  // ── Région Sikasso (ML-03) ────────────────────────────────────────────────
  'ML-03-01': ['Sikasso', 'Danderesso', 'Kaboila', 'Kafouziéla', 'Klela', 'Natien', 'Zaniéna'],
  'ML-03-02': ['Kadiolo', 'Diou', 'Dioumatènè', 'Fourou', 'Loulouni', 'Zégoua'],
  'ML-03-03': ['Kolondiéba', 'Bougoula', 'Fakola', 'Kadiana', "N'Golodiana"],

  // ── Région Bougouni (ML-16, anciennement sous Sikasso) ────────────────────
  'ML-16-01': ['Bougouni', 'Débélin', 'Faragouaran', 'Garalo', 'Koumantou', 'Sanso'],
  'ML-16-02': ['Yanfolila', 'Baya', 'Gouanan', 'Koussan', 'Wassoulou-Ballé'],

  // ── Région Koutiala (ML-17, anciennement sous Sikasso) ────────────────────
  'ML-17-01': ['Koutiala', 'Diédougou', 'Fakolo', 'Kafo', "M'Péssoba", 'Songo-Doubacoré'],
  'ML-17-02': ['Yorosso', 'Boura', 'Karangasso', 'Koumbia', 'Mahou'],

  // ── Région Ségou (ML-04) ──────────────────────────────────────────────────
  'ML-04-01': ['Ségou', 'Cinzana', 'Diédougou', 'Farako', 'Markala', 'Pelengana', 'Sébougou'],
  'ML-04-02': ['Baraouéli', 'Boidié', 'Gouendo', 'Kalaké', "N'Gassola"],
  'ML-04-03': ['Bla', 'Béguéné', 'Diaramana', 'Fani', 'Kazangasso', 'Touna'],
  'ML-04-04': ['Macina', 'Boky-Wéré', 'Kokry-Centre', 'Kolongo', 'Monipébougou'],
  'ML-04-05': ['Niono', 'Mariko', 'Pogo', 'Siribala', 'Sokolo', 'Yérédon-Saniona'],

  // ── Région San (ML-18, anciennement sous Ségou) ───────────────────────────
  'ML-18-01': ['San', 'Dah', 'Kaniégué', 'Moribila', 'Sourountouna', 'Tène'],
  'ML-18-02': ['Tominian', 'Benena', 'Diora', 'Fangasso', 'Mandiakuy', 'Ouan'],

  // ── Région Mopti (ML-05) ──────────────────────────────────────────────────
  'ML-05-01': ['Mopti', 'Fatoma', 'Konna', 'Kounari', 'Sio', 'Socoura'],
  'ML-05-02': ['Djenné', 'Dandougou-Fakala', 'Kéwa', 'Madiama', 'Pondori'],
  'ML-05-03': ['Ténenkou', 'Diafarabé', 'Kareri', 'Sougoulbé', 'Togoro-Kotia'],
  'ML-05-04': ['Youwarou', 'Bimbéré-Tama', 'Déboye', 'Dongo', 'Farimaké'],

  // ── Région Bandiagara (ML-19, anciennement sous Mopti) ────────────────────
  'ML-19-01': ['Bandiagara', 'Dogani-Bèrè', 'Lowol-Guéou', 'Pignari', 'Sangha', 'Wadouba'],
  'ML-19-02': ['Bankass', 'Diallassagou', 'Koulogon-Habé', 'Ouenkoro', 'Sokoura'],
  'ML-19-03': ['Koro', 'Bamba', 'Barapiréli', 'Dougoutènè', 'Madougou', 'Youdiou'],

  // ── Région Douentza (ML-20, anciennement sous Mopti) ──────────────────────
  'ML-20-01': ['Douentza', 'Dallah', 'Gandamia', 'Hombori', 'Kérena', 'Koubewel-Koundia'],

  // ── Région Tombouctou (ML-06) ─────────────────────────────────────────────
  'ML-06-01': ['Tombouctou', 'Alafia', 'Ber', 'Bourem-Inaly', 'Lafia'],
  'ML-06-02': ['Diré', 'Binga', 'Bourem-Sidi-Amar', 'Haïbongo', 'Tindirma'],
  'ML-06-03': ['Goundam', 'Adarmalane', 'Bintagoungou', 'Douékiré', 'Essakane', "M'Bouna"],
  'ML-06-04': ['Gourma-Rharous', 'Bambara-Maoudé', 'Gossi', 'Inadiatafane', 'Rharous'],
  'ML-06-05': ['Niafunké', 'Banikane', 'Dianké', 'Léré', 'Soboundou'],

  // ── Région Gao (ML-07) ────────────────────────────────────────────────────
  'ML-07-01': ['Gao', 'Anchawadj', 'Gabéro', 'Gounzoureye', "N'Tillit", 'Sonni-Ali-Ber'],
  'ML-07-02': ['Ansongo', 'Bara', 'Bourra', 'Ouattagouna', 'Talataye', 'Tessit'],
  'ML-07-03': ['Bourem', 'Bamba', 'Taboye', 'Téméra'],

  // ── Région Ménaka (ML-11) ─────────────────────────────────────────────────
  'ML-11-01': ['Ménaka', 'Alata'],
  'ML-11-03': ['Andéramboukane', 'Tinahama'],

  // ── Région Kidal (ML-08) ──────────────────────────────────────────────────
  'ML-08-01': ['Kidal', 'Anéfis', 'Essouk'],
  'ML-08-03': ['Tessalit', 'Adjelhoc', 'Timtaghene'],

  // ── District de Bamako (ML-09) — 6 communes urbaines = niveau 2 ──────────
  'ML-09-01': [
    'Banconi',
    'Boulkassoumbougou',
    'Djélibougou',
    'Doumanzana',
    'Fadjiguila',
    'Korofina-Nord',
    'Sikoro',
  ],
  'ML-09-02': [
    'Bagadadji',
    'Bakaribougou',
    'Bougouba',
    'Hippodrome',
    'Médina-Coura',
    'Missira',
    'Niaréla',
  ],
  'ML-09-03': [
    'Bamako-Coura',
    'Centre-Commercial',
    'Dravéla',
    "N'Tomikorobougou",
    'Point-G',
    'Samé',
  ],
  'ML-09-04': [
    'Djicoroni-Para',
    'Hamdallaye',
    'Lafiabougou',
    'Sébénikoro',
    'Sibiribougou',
    'Taliko',
  ],
  'ML-09-05': [
    'Badalabougou',
    'Baco-Djicoroni',
    'Daoudabougou',
    'Kalaban-Coura',
    'Quartier-Mali',
    'Sabalibougou',
    'Torokorobougou',
  ],
  'ML-09-06': [
    'Banankabougou',
    'Djanèkèla',
    'Faladié',
    'Magnambougou',
    'Missabougou',
    'Sénou',
    'Sogoniko',
    'Yirimadio',
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
//  Seeds institutions / utilisateurs
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Institutions de référence : 5 institutions administratives (CTDEC, DNEC, MAT,
 * mairie, gouvernorat) + 5 antennes d'enrôlement RAVEC (régions). Les antennes
 * reçoivent un profil opérationnel `EnrollmentCenter` (cf. ENROLLMENT_CENTERS).
 */
const INSTITUTIONS: Array<{
  code: string;
  name: string;
  type: string;
  locationCode?: string;
  address?: string;
}> = [
  {
    code: 'CTDEC-BAMAKO',
    name: "Centre de Traitement des Données de l'État Civil",
    type: 'CTDEC',
    locationCode: 'ML-09',
    address: 'Rue Baba Diarra, BP 215, Bamako',
  },
  {
    code: 'DNEC-BAMAKO',
    name: "Direction Nationale de l'État Civil",
    type: 'DNEC',
    locationCode: 'ML-09',
    address: 'Bamako, Mali',
  },
  {
    code: 'MAT-BAMAKO',
    name: "Ministère de l'Administration Territoriale et de la Décentralisation",
    type: 'MINISTRY',
    locationCode: 'ML-09',
    address: 'Bamako, Mali',
  },
  {
    code: 'MAIRIE-COMM-IV',
    name: 'Mairie de la Commune IV du District de Bamako',
    type: 'MAIRIE',
    locationCode: 'ML-09-04',
    address: 'Lafiabougou, Commune IV',
  },
  {
    code: 'GOUV-KAYES',
    name: 'Gouvernorat de Kayes',
    type: 'GOUVERNORAT',
    locationCode: 'ML-01',
    address: 'Kayes',
  },
  // ── Antennes d'enrôlement régionales (RAVEC) — appointment-service ──────
  {
    code: 'ANTENNE-KATI',
    name: 'Antenne RAVEC de Kati',
    type: 'ANTENNE_RAVEC',
    locationCode: 'ML-02-04',
    address: 'Kati, région de Koulikoro',
  },
  {
    code: 'ANTENNE-KAYES',
    name: 'Antenne RAVEC de Kayes',
    type: 'ANTENNE_RAVEC',
    locationCode: 'ML-01-01',
    address: 'Kayes',
  },
  {
    code: 'ANTENNE-SIKASSO',
    name: 'Antenne RAVEC de Sikasso',
    type: 'ANTENNE_RAVEC',
    locationCode: 'ML-03-01',
    address: 'Sikasso',
  },
  {
    code: 'ANTENNE-SEGOU',
    name: 'Antenne RAVEC de Ségou',
    type: 'ANTENNE_RAVEC',
    locationCode: 'ML-04-01',
    address: 'Ségou',
  },
  {
    code: 'ANTENNE-MOPTI',
    name: 'Antenne RAVEC de Mopti',
    type: 'ANTENNE_RAVEC',
    locationCode: 'ML-05-01',
    address: 'Mopti',
  },
];

/**
 * Profils opérationnels des centres d'enrôlement (modèle `EnrollmentCenter`,
 * 1:1 avec `Institution`). Horaires en UTC (Mali = UTC+0). Fenêtre prioritaire
 * 07:00–09:00 réservée aux personnes vulnérables. Quotas : standard + prioritaire
 * = capacité/jour. Coordonnées = centroïdes officiels (data/mali).
 */
const ENROLLMENT_CENTERS: Array<{
  institutionCode: string;
  servicesOffered: string[];
  capacityPerDay: number;
  slotDurationMin: number;
  parallelDesks: number;
  standardQuota: number;
  priorityQuota: number;
  priorityFrom: string;
  priorityTo: string;
  openingHours: Record<string, [string, string] | null>;
  latitude: number;
  longitude: number;
}> = [
  {
    institutionCode: 'CTDEC-BAMAKO',
    servicesOffered: ['ENROLLMENT', 'CORRECTION', 'DOCUMENT_PICKUP', 'RENEWAL', 'INFO'],
    capacityPerDay: 200,
    slotDurationMin: 15,
    parallelDesks: 6,
    standardQuota: 160,
    priorityQuota: 40,
    priorityFrom: '07:00',
    priorityTo: '09:00',
    openingHours: {
      mon: ['07:30', '16:00'],
      tue: ['07:30', '16:00'],
      wed: ['07:30', '16:00'],
      thu: ['07:30', '16:00'],
      fri: ['07:30', '16:00'],
      sat: ['08:00', '12:00'],
      sun: null,
    },
    latitude: 12.6392,
    longitude: -8.0029,
  },
  ...(
    [
      { code: 'ANTENNE-KATI', lat: 12.7444, lng: -8.0731 },
      { code: 'ANTENNE-KAYES', lat: 14.4467, lng: -11.4444 },
      { code: 'ANTENNE-SIKASSO', lat: 11.3176, lng: -5.6665 },
      { code: 'ANTENNE-SEGOU', lat: 13.4318, lng: -6.2156 },
      { code: 'ANTENNE-MOPTI', lat: 14.4843, lng: -4.1827 },
    ] as const
  ).map((a) => ({
    institutionCode: a.code,
    servicesOffered: ['ENROLLMENT', 'CORRECTION', 'INFO'],
    capacityPerDay: 80,
    slotDurationMin: 20,
    parallelDesks: 2,
    standardQuota: 64,
    priorityQuota: 16,
    priorityFrom: '07:00',
    priorityTo: '09:00',
    openingHours: {
      mon: ['08:00', '15:00'],
      tue: ['08:00', '15:00'],
      wed: ['08:00', '15:00'],
      thu: ['08:00', '15:00'],
      fri: ['08:00', '15:00'],
      sat: null,
      sun: null,
    } as Record<string, [string, string] | null>,
    latitude: a.lat,
    longitude: a.lng,
  })),
];

/**
 * 6 utilisateurs système (un par rôle UserRole). Le CITOYEN de démo porte le
 * `sub` Keycloak réel (pinné dans le realm import pour `citoyen.demo`) afin que
 * l'échange SSO PC-04 résolve `findByKeycloakId` ; les autres keycloakId restent
 * des placeholders (doc 08).
 */
const USERS: Array<{
  keycloakId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'CITIZEN' | 'AGENT' | 'SUPERVISOR' | 'ADMIN' | 'AUDITOR' | 'ANTICORRUPTION_INSPECTOR';
  institutionCode?: string;
}> = [
  {
    keycloakId: '8bff2324-471d-42b8-a351-33da8aa46161',
    email: 'fatoumata.diallo@nina-aes.demo',
    username: 'citoyen.demo',
    firstName: 'Fatoumata',
    lastName: 'Diallo',
    role: 'CITIZEN',
  },
  {
    keycloakId: 'seed-agent-001',
    email: 'agent1@ctdec.gouv.ml',
    username: 'agent.keita',
    firstName: 'Modibo',
    lastName: 'Keita',
    role: 'AGENT',
    institutionCode: 'CTDEC-BAMAKO',
  },
  {
    keycloakId: 'seed-supervisor-001',
    email: 'supervisor1@ctdec.gouv.ml',
    username: 'sup.traore',
    firstName: 'Aminata',
    lastName: 'Traoré',
    role: 'SUPERVISOR',
    institutionCode: 'CTDEC-BAMAKO',
  },
  {
    keycloakId: 'seed-admin-001',
    email: 'admin1@dnec.gouv.ml',
    username: 'admin.coulibaly',
    firstName: 'Ibrahima',
    lastName: 'Coulibaly',
    role: 'ADMIN',
    institutionCode: 'DNEC-BAMAKO',
  },
  {
    keycloakId: 'seed-auditor-001',
    email: 'auditor1@mat.gouv.ml',
    username: 'auditor.sissoko',
    firstName: 'Mariam',
    lastName: 'Sissoko',
    role: 'AUDITOR',
    institutionCode: 'MAT-BAMAKO',
  },
  {
    keycloakId: 'seed-inspector-001',
    email: 'inspector1@sigac.gouv.ml',
    username: 'insp.cisse',
    firstName: 'Oumar',
    lastName: 'Cissé',
    role: 'ANTICORRUPTION_INSPECTOR',
    institutionCode: 'MAT-BAMAKO',
  },
];

// ──────────────────────────────────────────────────────────────────────────────
//  Main seed
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Exécute l'ensemble du seed. Idempotent.
 */
async function main(): Promise<void> {
  console.log('🌱 [seed] démarrage du seed NINA-AES…');

  // ------- Pays ------------------------------------------------------------
  await upsertLocation({
    code: 'ML',
    name: 'République du Mali',
    level: 0,
    latitude: 17.5707,
    longitude: -3.9962,
  });

  // ------- Régions (depuis data/mali/regions.json) -------------------------
  // Loi 2023 : 19 régions + District de Bamako = 20 entités niveau 1.
  for (const r of REGIONS_DATA) {
    await upsertLocation({
      code: r.code,
      name: r.nom_court,
      level: 1,
      parentCode: 'ML',
      latitude: r.centroide.lat,
      longitude: r.centroide.lng,
    });
  }
  console.log(`✅ [seed] ${REGIONS_DATA.length} régions (loi 2023)`);

  // ------- Cercles (depuis data/mali/cercles.json) -------------------------
  // 65 cercles confirmés ; les 94 manquants seront ajoutés par
  // scripts/enrich-cercles.py (cf. docs/data/mali-divisions.md §3.2).
  let cercleCount = 0;
  for (const c of CERCLES_DATA) {
    await upsertLocation({
      code: c.code,
      name: c.nom,
      level: 2,
      parentCode: c.region_code,
      latitude: c.centroide.lat,
      longitude: c.centroide.lng,
    });
    cercleCount++;
  }
  console.log(`✅ [seed] ${cercleCount} cercles confirmés post-2023`);

  // ------- Communes pédagogiques (échantillon, pas exhaustif) --------------
  // 819 communes existent au Mali ; ce seed n'en charge qu'une fraction
  // pour amorcer les tests. Source de vérité future : INSTAT Mali.
  let communeCount = 0;
  for (const [cercleCode, communes] of Object.entries(COMMUNES_PEDAGOGIQUES)) {
    let idx = 0;
    for (const nm of communes) {
      idx++;
      const communeCode = `${cercleCode}-${String(idx).padStart(3, '0')}`;
      await upsertLocation({
        code: communeCode,
        name: nm,
        level: 3,
        parentCode: cercleCode,
      });
      communeCount++;
    }
  }
  console.log(`✅ [seed] ${communeCount} communes échantillon (pédagogique)`);

  // ------- Institutions ----------------------------------------------------
  for (const inst of INSTITUTIONS) {
    let locationId: string | undefined;
    if (inst.locationCode) {
      const loc = await prisma.location.findUnique({
        where: { code: inst.locationCode },
        select: { id: true },
      });
      locationId = loc?.id;
    }
    await prisma.institution.upsert({
      where: { code: inst.code },
      create: {
        code: inst.code,
        name: inst.name,
        type: inst.type,
        address: inst.address,
        locationId,
      },
      update: {
        name: inst.name,
        type: inst.type,
        address: inst.address,
        locationId,
      },
    });
  }
  console.log(`✅ [seed] ${INSTITUTIONS.length} institutions`);

  // ------- Centres d'enrôlement (profils opérationnels) --------------------
  // 1:1 avec une Institution déjà seedée. Idempotent (upsert sur institutionId).
  for (const c of ENROLLMENT_CENTERS) {
    const inst = await prisma.institution.findUnique({
      where: { code: c.institutionCode },
      select: { id: true },
    });
    if (!inst) {
      console.warn(`⚠️  [seed] institution ${c.institutionCode} introuvable — centre ignoré`);
      continue;
    }
    const data = {
      servicesOffered: c.servicesOffered,
      capacityPerDay: c.capacityPerDay,
      slotDurationMin: c.slotDurationMin,
      parallelDesks: c.parallelDesks,
      standardQuota: c.standardQuota,
      priorityQuota: c.priorityQuota,
      priorityFrom: c.priorityFrom,
      priorityTo: c.priorityTo,
      openingHours: c.openingHours,
      latitude: c.latitude,
      longitude: c.longitude,
      isActive: true,
    };
    await prisma.enrollmentCenter.upsert({
      where: { institutionId: inst.id },
      create: { institutionId: inst.id, ...data },
      update: data,
    });
  }
  console.log(`✅ [seed] ${ENROLLMENT_CENTERS.length} centres d'enrôlement (profils)`);

  // ------- Utilisateurs ----------------------------------------------------
  for (const u of USERS) {
    let institutionId: string | undefined;
    if (u.institutionCode) {
      const inst = await prisma.institution.findUnique({
        where: { code: u.institutionCode },
        select: { id: true },
      });
      institutionId = inst?.id;
    }
    await prisma.user.upsert({
      where: { keycloakId: u.keycloakId },
      create: {
        keycloakId: u.keycloakId,
        email: u.email,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        institutionId,
        preferredLanguage: 'FR',
      },
      update: {
        email: u.email,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        institutionId,
      },
    });
  }
  console.log(`✅ [seed] ${USERS.length} utilisateurs (1 par rôle UserRole)`);

  // ------- Citoyen de démonstration (PC-04 self-service RDV) ----------------
  // Lie le compte Keycloak `citoyen.demo` (sub pinné dans le realm import) à un
  // enregistrement Citizen : requis par l'échange SSO (résolution du `nina` par
  // email, cf. findCitizenNinaByEmail) ET par la prise de RDV self-service
  // (`/appointments/me`, qui dérive le citizenId du NINA). birthPlace/residence
  // pointent sur une Location déjà seedée (commune si dispo, sinon région).
  const demoLocation =
    (await prisma.location.findFirst({ where: { level: 3 }, select: { id: true } })) ??
    (await prisma.location.findFirstOrThrow({ where: { level: 1 }, select: { id: true } }));
  await prisma.citizen.upsert({
    where: { nina: '18903102015042V' },
    create: {
      nina: '18903102015042V',
      firstName: 'Fatoumata',
      lastName: 'Diallo',
      firstNameAscii: 'Fatoumata',
      lastNameAscii: 'Diallo',
      birthDate: new Date('1989-03-10'),
      sex: 'FEMALE',
      email: 'fatoumata.diallo@nina-aes.demo',
      phoneNumber: '+22370000000',
      birthPlaceId: demoLocation.id,
      residenceId: demoLocation.id,
    },
    update: {
      email: 'fatoumata.diallo@nina-aes.demo',
      phoneNumber: '+22370000000',
    },
  });
  console.log('✅ [seed] citoyen de démonstration (NINA 18903102015042V ↔ citoyen.demo)');

  console.log('🌱 [seed] terminé avec succès.');
}

main()
  .catch((err) => {
    console.error('❌ [seed] erreur :', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
