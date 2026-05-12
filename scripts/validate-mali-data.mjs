#!/usr/bin/env node
/**
 * Validate consistency of data/mali/*.json files.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, "..", "data", "mali");

const BBOX_MALI = { minLat: 10.0, maxLat: 25.1, minLng: -12.3, maxLng: 4.3 };
const REGION_CODE = /^ML-\d{2}$/;
const CERCLE_CODE = /^ML-\d{2}-\d{2}$/;

const errors = [];
function err(msg) {
  errors.push(`  ❌ ${msg}`);
}

function load(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) {
    err(`Fichier introuvable : ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function inBbox(lat, lng) {
  return lat >= BBOX_MALI.minLat && lat <= BBOX_MALI.maxLat && lng >= BBOX_MALI.minLng && lng <= BBOX_MALI.maxLng;
}

console.log("🔎 [validate-mali-data] vérification des invariants…\n");

const regionsFile = load("regions.json");
const cerclesFile = load("cercles.json");
const geoFile = load("mali.geojson");

const regionCodes = new Set();
const cercleCodes = new Set();

console.log("  • Régions : codes uniques + format ML-NN");
for (const r of regionsFile.regions) {
  if (!REGION_CODE.test(r.code)) err(`Code région invalide : "${r.code}"`);
  if (regionCodes.has(r.code)) err(`Code région dupliqué : "${r.code}"`);
  regionCodes.add(r.code);
  if (!inBbox(r.centroide.lat, r.centroide.lng)) {
    err(`Centroïde région ${r.code} hors bbox Mali (${r.centroide.lat}, ${r.centroide.lng})`);
  }
}

console.log("  • Régions : métadonnées totaux");
const expectedTotal = regionsFile.totaux.regions + regionsFile.totaux.district;
if (expectedTotal !== regionsFile.totaux.total_niveau_1) {
  err(`Incohérence totaux : ${regionsFile.totaux.regions} + ${regionsFile.totaux.district} ≠ ${regionsFile.totaux.total_niveau_1}`);
}
if (regionCodes.size !== expectedTotal) {
  err(`Nombre de régions effectives (${regionCodes.size}) ≠ totaux annoncés (${expectedTotal})`);
}

console.log("  • Cercles : codes uniques + rattachement régional valide");
for (const c of cerclesFile.cercles) {
  if (!CERCLE_CODE.test(c.code)) err(`Code cercle invalide : "${c.code}"`);
  if (cercleCodes.has(c.code)) err(`Code cercle dupliqué : "${c.code}"`);
  cercleCodes.add(c.code);
  if (!regionCodes.has(c.region_code)) err(`Cercle ${c.code} (${c.nom}) référence une région inexistante : "${c.region_code}"`);
  if (c.code.slice(0, 5) !== c.region_code) err(`Cercle ${c.code} : préfixe (${c.code.slice(0, 5)}) ≠ region_code (${c.region_code})`);
  if (!inBbox(c.centroide.lat, c.centroide.lng)) err(`Centroïde cercle ${c.code} hors bbox Mali (${c.centroide.lat}, ${c.centroide.lng})`);
}

console.log("  • Chefs-lieux : présents comme cercles (cohérence référentielle)");
const cercleNoms = new Set(cerclesFile.cercles.map((c) => c.nom.toLowerCase()));
for (const r of regionsFile.regions) {
  if (r.code === "ML-09") continue;
  const expected = r.chef_lieu === "Nioro du Sahel" ? "nioro du sahel" : r.chef_lieu.toLowerCase();
  if (!cercleNoms.has(expected)) {
    console.warn(`  ⚠️  Chef-lieu "${r.chef_lieu}" de ${r.code} non trouvé comme cercle — peut-être à enrichir`);
  }
}

console.log("  • GeoJSON : couvre régions + cercles déclarés");
const geoRegionCodes = new Set(geoFile.features.filter((f) => f.properties.kind === "region" || f.properties.kind === "district").map((f) => f.properties.code));
const geoCercleCodes = new Set(geoFile.features.filter((f) => f.properties.kind === "cercle").map((f) => f.properties.code));
for (const code of regionCodes) {
  if (!geoRegionCodes.has(code)) err(`Région ${code} absente du GeoJSON`);
}
const cerclesEnGeo = [...cercleCodes].filter((c) => geoCercleCodes.has(c)).length;
console.log(`     ↳ ${cerclesEnGeo}/${cercleCodes.size} cercles présents dans le GeoJSON`);

console.log("");
if (errors.length > 0) {
  console.log(`❌ ${errors.length} erreur(s) détectée(s) :\n`);
  for (const e of errors) console.log(e);
  process.exit(1);
}

console.log("✅ Tous les invariants sont respectés.");
console.log(`   Régions     : ${regionCodes.size} (attendu 20)`);
console.log(`   Cercles     : ${cercleCodes.size} (attendu in fine 159)`);
console.log(`   Features GeoJSON : ${geoFile.features.length}`);
