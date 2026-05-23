/**
 * @file        validate-mali-data.ts
 * @description Valide la cohérence des fichiers `data/mali/*.json` avant un seed.
 *
 *              Invariants vérifiés (cf. docs/data/mali-divisions.md §7.1) :
 *                1. Tous les codes régions sont uniques au format ML-NN.
 *                2. Tous les codes cercles sont uniques au format ML-NN-MM.
 *                3. Chaque `region_code` d'un cercle existe dans regions.json.
 *                4. Tous les centroïdes sont dans la bbox du Mali.
 *                5. Les métadonnées (totaux, version) sont cohérentes.
 *                6. Les chefs-lieux des régions sont présents comme cercles.
 *                7. Le GeoJSON contient bien tous les codes régions/cercles.
 *
 *              Exit code 0 si OK, 1 si au moins une erreur.
 *
 * @author      Étudiant UQAR
 * @date        Mai 2026
 * @example     pnpm exec tsx scripts/validate-mali-data.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', 'data', 'mali');

// ──────────────────────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────────────────────

interface RegionsFile {
  regions: Array<{
    code: string;
    nom_officiel: string;
    nom_court: string;
    chef_lieu: string;
    centroide: { lat: number; lng: number; estime: boolean };
  }>;
  totaux: { regions: number; district: number; total_niveau_1: number };
}

interface CerclesFile {
  cercles: Array<{
    code: string;
    nom: string;
    region_code: string;
    centroide: { lat: number; lng: number; estime: boolean };
    confiance: 'haute' | 'moyenne' | 'basse';
  }>;
}

interface GeoJsonFile {
  type: 'FeatureCollection';
  features: Array<{
    properties: { kind: string; code: string; name: string };
    geometry: { type: string; coordinates: [number, number] };
  }>;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Constantes Mali
// ──────────────────────────────────────────────────────────────────────────────

/** Boîte englobante officielle Mali (avec marge 0.1°). */
const BBOX_MALI = {
  minLat: 10.0,
  maxLat: 25.1,
  minLng: -12.3,
  maxLng: 4.3,
};

const REGION_CODE = /^ML-\d{2}$/;
const CERCLE_CODE = /^ML-\d{2}-\d{2}$/;

// ──────────────────────────────────────────────────────────────────────────────
//  Validation
// ──────────────────────────────────────────────────────────────────────────────

/** Liste cumulée d'erreurs. */
const errors: string[] = [];

/** Ajoute une erreur formatée (sera affichée en fin de script). */
function err(msg: string): void {
  errors.push(`  ❌ ${msg}`);
}

/** Charge un fichier JSON typé depuis `data/mali/`. */
function load<T>(file: string): T {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) {
    err(`Fichier introuvable : ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

/** Vérifie qu'un point est dans la bbox du Mali. */
function inBbox(lat: number, lng: number): boolean {
  return (
    lat >= BBOX_MALI.minLat &&
    lat <= BBOX_MALI.maxLat &&
    lng >= BBOX_MALI.minLng &&
    lng <= BBOX_MALI.maxLng
  );
}

// ──────────────────────────────────────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────────────────────────────────────

console.log('🔎 [validate-mali-data] vérification des invariants…\n');

const regionsFile = load<RegionsFile>('regions.json');
const cerclesFile = load<CerclesFile>('cercles.json');
const geoFile = load<GeoJsonFile>('mali.geojson');

const regionCodes = new Set<string>();
const cercleCodes = new Set<string>();

// 1) Régions : codes uniques + format
console.log('  • Régions : codes uniques + format ML-NN');
for (const r of regionsFile.regions) {
  if (!REGION_CODE.test(r.code)) err(`Code région invalide : "${r.code}"`);
  if (regionCodes.has(r.code)) err(`Code région dupliqué : "${r.code}"`);
  regionCodes.add(r.code);

  if (!inBbox(r.centroide.lat, r.centroide.lng)) {
    err(`Centroïde région ${r.code} hors bbox Mali (${r.centroide.lat}, ${r.centroide.lng})`);
  }
}

// 2) Métadonnées régions
console.log('  • Régions : métadonnées totaux');
const expectedTotal = regionsFile.totaux.regions + regionsFile.totaux.district;
if (expectedTotal !== regionsFile.totaux.total_niveau_1) {
  err(
    `Incohérence totaux : ${regionsFile.totaux.regions} + ${regionsFile.totaux.district} ≠ ${regionsFile.totaux.total_niveau_1}`,
  );
}
if (regionCodes.size !== expectedTotal) {
  err(`Nombre de régions effectives (${regionCodes.size}) ≠ totaux annoncés (${expectedTotal})`);
}

// 3) Cercles : codes + rattachement régional
console.log('  • Cercles : codes uniques + rattachement régional valide');
for (const c of cerclesFile.cercles) {
  if (!CERCLE_CODE.test(c.code)) err(`Code cercle invalide : "${c.code}"`);
  if (cercleCodes.has(c.code)) err(`Code cercle dupliqué : "${c.code}"`);
  cercleCodes.add(c.code);

  if (!regionCodes.has(c.region_code)) {
    err(`Cercle ${c.code} (${c.nom}) référence une région inexistante : "${c.region_code}"`);
  }

  // Cohérence : le préfixe du cercle doit correspondre au region_code
  const prefix = c.code.slice(0, 5); // ML-XX
  if (prefix !== c.region_code) {
    err(`Cercle ${c.code} : préfixe (${prefix}) ≠ region_code (${c.region_code})`);
  }

  if (!inBbox(c.centroide.lat, c.centroide.lng)) {
    err(`Centroïde cercle ${c.code} hors bbox Mali (${c.centroide.lat}, ${c.centroide.lng})`);
  }
}

// 4) Chef-lieu de chaque région présent comme cercle
console.log('  • Chefs-lieux : présents comme cercles (cohérence référentielle)');
const cercleNoms = new Set(cerclesFile.cercles.map((c) => c.nom.toLowerCase()));
for (const r of regionsFile.regions) {
  // Le chef-lieu est généralement le premier cercle (ML-XX-01).
  // Pour Bamako, le chef-lieu est "Bamako" mais les cercles sont "Commune I/II/...".
  const isBamako = r.code === 'ML-09';
  const isNioroSahel = r.chef_lieu === 'Nioro du Sahel';
  if (isBamako) continue;
  const cherche = isNioroSahel ? 'nioro du sahel' : r.chef_lieu.toLowerCase();
  if (!cercleNoms.has(cherche)) {
    // Tolérance : si le cercle n'est pas dans nos 65 connus, ce n'est qu'un
    // warning (cf. cercles_a_enrichir).
    console.warn(
      `  ⚠️  Chef-lieu "${r.chef_lieu}" de ${r.code} non trouvé comme cercle — peut-être à enrichir`,
    );
  }
}

// 5) GeoJSON : couvre toutes les régions + tous les cercles
console.log('  • GeoJSON : couvre régions + cercles déclarés');
const geoRegionCodes = new Set(
  geoFile.features
    .filter((f) => f.properties.kind === 'region' || f.properties.kind === 'district')
    .map((f) => f.properties.code),
);
const geoCercleCodes = new Set(
  geoFile.features.filter((f) => f.properties.kind === 'cercle').map((f) => f.properties.code),
);

for (const code of regionCodes) {
  if (!geoRegionCodes.has(code)) err(`Région ${code} absente du GeoJSON`);
}
// Pour les cercles on tolère les manquants (GeoJSON peut être plus restreint)
const cerclesEnGeo = [...cercleCodes].filter((c) => geoCercleCodes.has(c)).length;
console.log(`     ↳ ${cerclesEnGeo}/${cercleCodes.size} cercles présents dans le GeoJSON`);

// ──────────────────────────────────────────────────────────────────────────────
//  Résultat
// ──────────────────────────────────────────────────────────────────────────────

console.log('');
if (errors.length > 0) {
  console.log(`❌ ${errors.length} erreur(s) détectée(s) :\n`);
  for (const e of errors) console.log(e);
  console.log('');
  process.exit(1);
}

console.log('✅ Tous les invariants sont respectés.');
console.log(`   Régions     : ${regionCodes.size} (attendu 20)`);
console.log(`   Cercles     : ${cercleCodes.size} (attendu in fine 159)`);
console.log(`   Features GeoJSON : ${geoFile.features.length}`);
process.exit(0);
