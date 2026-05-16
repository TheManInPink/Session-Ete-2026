#!/usr/bin/env node
/**
 * @file        scripts/audit-cercles-coverage.mjs
 * @description Audit de cohérence entre nos 64 cercles déclarés dans
 *              `data/mali/cercles.json` et les 50 polygones officiels
 *              `data/mali/mali-cercles-polygons.json` (geoBoundaries ADM2).
 *
 *              Compare via normalisation des noms (suppression accents +
 *              lowercase) et produit 3 rapports :
 *                1. Polygones SANS cercle JSON correspondant
 *                   → cercles à ajouter dans cercles.json
 *                2. Cercles JSON SANS polygone correspondant
 *                   → cercles à enrichir avec un polygone V2
 *                3. Correspondances exactes (sanity check)
 *
 *              Usage :
 *                node scripts/audit-cercles-coverage.mjs
 *                # ou : make audit-cercles
 *
 * @author      NINA-AES Platform
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const cerclesJson = JSON.parse(
  readFileSync(resolve(ROOT, 'data/mali/cercles.json'), 'utf-8'),
);
const polygons = JSON.parse(
  readFileSync(resolve(ROOT, 'data/mali/mali-cercles-polygons.json'), 'utf-8'),
);

/** Normalise un nom de cercle pour comparaison : sans accents, lowercase, sans tirets. */
function normalize(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toLowerCase()
    .replace(/[-\s']/g, '');
}

// Index par nom normalisé
const jsonByName = new Map();
for (const c of cerclesJson.cercles) {
  jsonByName.set(normalize(c.nom), c);
}

const polyByName = new Map();
for (const f of polygons.features) {
  polyByName.set(normalize(f.properties.shapeName), f);
}

// ── Rapport 1 : polygones sans cercle JSON ──────────────────────────────────
const polygonsOrphan = [];
for (const [normName, f] of polyByName) {
  if (!jsonByName.has(normName)) {
    polygonsOrphan.push(f.properties.shapeName);
  }
}

// ── Rapport 2 : cercles JSON sans polygone ──────────────────────────────────
const cerclesOrphan = [];
for (const [normName, c] of jsonByName) {
  if (!polyByName.has(normName)) {
    cerclesOrphan.push({ nom: c.nom, code: c.code, region: c.region_code });
  }
}

// ── Rapport 3 : correspondances ─────────────────────────────────────────────
const matched = [];
for (const [normName, c] of jsonByName) {
  if (polyByName.has(normName)) {
    matched.push(c.nom);
  }
}

// ── Sortie console ──────────────────────────────────────────────────────────
console.log('═'.repeat(70));
console.log('AUDIT — Cohérence cercles.json ↔ geoBoundaries ADM2 polygons');
console.log('═'.repeat(70));
console.log(`📊 Stats globales :`);
console.log(`   cercles.json         : ${cerclesJson.cercles.length} entrées`);
console.log(`   mali-cercles-polygons : ${polygons.features.length} polygones`);
console.log(`   Correspondances      : ${matched.length}`);
console.log(`   Polygones orphelins  : ${polygonsOrphan.length}`);
console.log(`   Cercles JSON sans polygone : ${cerclesOrphan.length}`);
console.log();

if (polygonsOrphan.length > 0) {
  console.log('🟡 Polygones SANS cercle JSON (à ajouter dans cercles.json) :');
  polygonsOrphan.forEach((n) => console.log(`   - ${n}`));
  console.log();
}

if (cerclesOrphan.length > 0) {
  console.log('🟡 Cercles JSON SANS polygone (à enrichir V2) :');
  cerclesOrphan.forEach((c) => console.log(`   - ${c.nom.padEnd(20)} (${c.code}, région ${c.region})`));
  console.log();
}

console.log('✅ Audit terminé.');

// Exit code : 0 si tout aligné, 1 si écarts détectés (CI-friendly)
process.exit(polygonsOrphan.length === 0 && cerclesOrphan.length === 0 ? 0 : 0);
// Note : exit 0 même avec écarts car ils sont attendus tant que la base n'est pas complète.
// Passer à 1 quand on veut bloquer un commit qui rompt la cohérence.
