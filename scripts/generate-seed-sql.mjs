#!/usr/bin/env node
/**
 * @file        scripts/generate-seed-sql.mjs
 * @description Génère `infrastructure/scripts/seed-locations.sql` à partir
 *              des fichiers JSON canoniques `data/mali/regions.json` et
 *              `data/mali/cercles.json`.
 *
 *              Pourquoi un générateur plutôt qu'un SQL maintenu à la main ?
 *                - Source de vérité unique : les JSON. Le SQL est dérivé.
 *                - Idempotence garantie : INSERT ... ON CONFLICT DO UPDATE.
 *                - Cohérence : toute modif des JSON régénère le SQL sans
 *                  risque de drift (drift constaté §9.2 historique).
 *                - Validation : `pnpm run validate:data` vérifie les
 *                  invariants AVANT la génération.
 *
 *              Schéma cible : `geo_ref` (geographic reference) isolé du
 *              schéma `public.locations` géré par Prisma. Les apps NestJS
 *              continuent d'utiliser les tables Prisma ; `geo_ref` sert
 *              de référentiel statique (ex : requêtes de bootstrap sans
 *              ORM, scripts de migration, vues matérialisées).
 *
 *              Usage :
 *                node scripts/generate-seed-sql.mjs
 *                # ou via make :
 *                make seed-locations-generate
 *
 * @author      NINA-AES Platform
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Chargement des sources canoniques ────────────────────────────────────────
const regionsData = JSON.parse(
  readFileSync(resolve(ROOT, 'data/mali/regions.json'), 'utf-8'),
);
const cerclesData = JSON.parse(
  readFileSync(resolve(ROOT, 'data/mali/cercles.json'), 'utf-8'),
);

const regions = regionsData.regions;
const cercles = cerclesData.cercles;

console.log(`📥 Chargé ${regions.length} régions + ${cercles.length} cercles`);

// ── Échantillon minimal de communes (stub pédagogique) ───────────────────────
// 6 communes urbaines du District de Bamako + chefs-lieux des 3 plus grandes
// villes maliennes hors Bamako. Source : MATD Mali, listes communales.
// À étendre quand un dataset INSTAT complet (819 communes) sera disponible.
const communesSample = [
  // ── District de Bamako (ML-09) : 6 communes urbaines historiques
  { code: 'ML-09-C01', name: 'Commune I',   parent: 'ML-09', lat: 12.6750, lng: -7.9650 },
  { code: 'ML-09-C02', name: 'Commune II',  parent: 'ML-09', lat: 12.6500, lng: -7.9900 },
  { code: 'ML-09-C03', name: 'Commune III', parent: 'ML-09', lat: 12.6500, lng: -8.0100 },
  { code: 'ML-09-C04', name: 'Commune IV',  parent: 'ML-09', lat: 12.6250, lng: -8.0500 },
  { code: 'ML-09-C05', name: 'Commune V',   parent: 'ML-09', lat: 12.6000, lng: -8.0200 },
  { code: 'ML-09-C06', name: 'Commune VI',  parent: 'ML-09', lat: 12.5750, lng: -7.9400 },
  // ── Échantillons hors Bamako (chefs-lieux principaux)
  { code: 'ML-02-C01', name: 'Kati',   parent: 'ML-02-04', lat: 12.7475, lng: -8.0700 }, // Cercle Kati
  { code: 'ML-05-C01', name: 'Mopti',  parent: 'ML-05-01', lat: 14.4843, lng: -4.1827 }, // Cercle Mopti
  { code: 'ML-04-C01', name: 'Ségou',  parent: 'ML-04-01', lat: 13.4318, lng: -6.2156 }, // Cercle Ségou
  { code: 'ML-03-C01', name: 'Sikasso',parent: 'ML-03-01', lat: 11.3176, lng: -5.6665 }, // Cercle Sikasso
];

// ── Helpers d'échappement SQL ────────────────────────────────────────────────
const esc = (s) => String(s).replace(/'/g, "''");
const num = (n) => (typeof n === 'number' ? n.toFixed(6) : 'NULL');
const insertRow = (cols, vals) =>
  `INSERT INTO geo_ref.${cols.table} (${cols.fields.join(', ')}) VALUES (${vals}) ` +
  `ON CONFLICT (code) DO UPDATE SET ${cols.fields
    .filter((f) => f !== 'code')
    .map((f) => `${f} = EXCLUDED.${f}`)
    .join(', ')};`;

// ── Génération du SQL ────────────────────────────────────────────────────────
const lines = [];

// En-tête
lines.push(`-- ═══════════════════════════════════════════════════════════════`);
lines.push(`-- NINA-AES — Référentiel géographique Mali (seed SQL)`);
lines.push(`-- ═══════════════════════════════════════════════════════════════`);
lines.push(`--`);
lines.push(`-- ⚠️  FICHIER GÉNÉRÉ — Ne pas éditer à la main.`);
lines.push(`--    Source de vérité : data/mali/regions.json + cercles.json`);
lines.push(`--    Régénération : node scripts/generate-seed-sql.mjs`);
lines.push(`--                 (ou : make seed-locations-generate)`);
lines.push(`--`);
lines.push(`-- Contenu :`);
lines.push(`--   - ${regions.length} régions (niveau 1)`);
lines.push(`--   - ${cercles.length} cercles (niveau 2 ; total officiel attendu : 159)`);
lines.push(`--   - ${communesSample.length} communes (échantillon Bamako + chefs-lieux principaux)`);
lines.push(`--   - 0 arrondissements (niveau 3) — à ingérer ultérieurement via INSTAT`);
lines.push(`--   - 0 villages (niveau 6) — hors scope V1 (volume 12 712, source INSTAT requise)`);
lines.push(`--`);
lines.push(`-- Idempotent : INSERT ... ON CONFLICT (code) DO UPDATE.`);
lines.push(`-- Schéma isolé : \`geo_ref\` — n'interfère pas avec public.locations (Prisma).`);
lines.push(`-- ═══════════════════════════════════════════════════════════════`);
lines.push('');
lines.push(`SET client_encoding = 'UTF8';`);
lines.push(`SET search_path = public;`);
lines.push('');

// ── Schema + tables ──────────────────────────────────────────────────────────
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`-- Schema dédié au référentiel géographique statique`);
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`CREATE SCHEMA IF NOT EXISTS geo_ref;`);
lines.push(`COMMENT ON SCHEMA geo_ref IS 'Référentiel géographique Mali (régions, cercles, communes, arrondissements). Source de vérité : data/mali/*.json. Régénéré par scripts/generate-seed-sql.mjs.';`);
lines.push('');

lines.push(`-- Table régions (niveau 1) — 19 régions + District de Bamako`);
lines.push(`CREATE TABLE IF NOT EXISTS geo_ref.regions (`);
lines.push(`  code            TEXT PRIMARY KEY,`);
lines.push(`  name_official   TEXT NOT NULL,`);
lines.push(`  name_short      TEXT NOT NULL,`);
lines.push(`  chef_lieu       TEXT NOT NULL,`);
lines.push(`  lat             NUMERIC(10, 7) NOT NULL,`);
lines.push(`  lng             NUMERIC(10, 7) NOT NULL,`);
lines.push(`  is_district     BOOLEAN NOT NULL DEFAULT FALSE,`);
lines.push(`  langues         TEXT[] NOT NULL DEFAULT '{}',`);
lines.push(`  statut_2023     TEXT,`);
lines.push(`  centroide_estime BOOLEAN NOT NULL DEFAULT FALSE`);
lines.push(`);`);
lines.push(`COMMENT ON TABLE geo_ref.regions IS '20 entités niveau 1 (19 régions + 1 District autonome de Bamako).';`);
lines.push('');

lines.push(`-- Table cercles (niveau 2) — 159 attendus, ${cercles.length} confirmés`);
lines.push(`CREATE TABLE IF NOT EXISTS geo_ref.cercles (`);
lines.push(`  code        TEXT PRIMARY KEY,`);
lines.push(`  name        TEXT NOT NULL,`);
lines.push(`  region_code TEXT NOT NULL REFERENCES geo_ref.regions(code) ON UPDATE CASCADE,`);
lines.push(`  lat         NUMERIC(10, 7) NOT NULL,`);
lines.push(`  lng         NUMERIC(10, 7) NOT NULL,`);
lines.push(`  confiance   TEXT NOT NULL DEFAULT 'haute' CHECK (confiance IN ('haute', 'moyenne', 'basse')),`);
lines.push(`  centroide_estime BOOLEAN NOT NULL DEFAULT FALSE`);
lines.push(`);`);
lines.push(`CREATE INDEX IF NOT EXISTS cercles_region_idx ON geo_ref.cercles (region_code);`);
lines.push('');

lines.push(`-- Table communes (niveau 4) — échantillon initial`);
lines.push(`CREATE TABLE IF NOT EXISTS geo_ref.communes (`);
lines.push(`  code        TEXT PRIMARY KEY,`);
lines.push(`  name        TEXT NOT NULL,`);
lines.push(`  parent_code TEXT NOT NULL,`);
lines.push(`  lat         NUMERIC(10, 7),`);
lines.push(`  lng         NUMERIC(10, 7)`);
lines.push(`);`);
lines.push(`CREATE INDEX IF NOT EXISTS communes_parent_idx ON geo_ref.communes (parent_code);`);
lines.push('');

lines.push(`-- Table arrondissements (niveau 3) — réservée, vide pour V1`);
lines.push(`CREATE TABLE IF NOT EXISTS geo_ref.arrondissements (`);
lines.push(`  code        TEXT PRIMARY KEY,`);
lines.push(`  name        TEXT NOT NULL,`);
lines.push(`  cercle_code TEXT NOT NULL REFERENCES geo_ref.cercles(code) ON UPDATE CASCADE`);
lines.push(`);`);
lines.push('');

// ── INSERT régions ───────────────────────────────────────────────────────────
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`-- Régions (niveau 1) — ${regions.length} entités`);
lines.push(`-- ───────────────────────────────────────────────────────────────`);
for (const r of regions) {
  const isDistrict = r.nom_officiel?.toLowerCase().includes('district') ? 'TRUE' : 'FALSE';
  const langues = `ARRAY[${(r.langues_principales ?? []).map((l) => `'${l}'`).join(', ')}]::TEXT[]`;
  const vals = [
    `'${esc(r.code)}'`,
    `'${esc(r.nom_officiel)}'`,
    `'${esc(r.nom_court)}'`,
    `'${esc(r.chef_lieu)}'`,
    num(r.centroide?.lat ?? 0),
    num(r.centroide?.lng ?? 0),
    isDistrict,
    langues,
    r.statut_2023 ? `'${esc(r.statut_2023)}'` : 'NULL',
    r.centroide?.estime ? 'TRUE' : 'FALSE',
  ].join(', ');
  lines.push(
    insertRow(
      {
        table: 'regions',
        fields: ['code', 'name_official', 'name_short', 'chef_lieu', 'lat', 'lng', 'is_district', 'langues', 'statut_2023', 'centroide_estime'],
      },
      vals,
    ),
  );
}
lines.push('');

// ── INSERT cercles ───────────────────────────────────────────────────────────
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`-- Cercles (niveau 2) — ${cercles.length} confirmés / 159 attendus`);
lines.push(`-- ───────────────────────────────────────────────────────────────`);
for (const c of cercles) {
  const vals = [
    `'${esc(c.code)}'`,
    `'${esc(c.nom)}'`,
    `'${esc(c.region_code)}'`,
    num(c.centroide?.lat ?? 0),
    num(c.centroide?.lng ?? 0),
    `'${esc(c.confiance ?? 'haute')}'`,
    c.centroide?.estime ? 'TRUE' : 'FALSE',
  ].join(', ');
  lines.push(
    insertRow(
      {
        table: 'cercles',
        fields: ['code', 'name', 'region_code', 'lat', 'lng', 'confiance', 'centroide_estime'],
      },
      vals,
    ),
  );
}
lines.push('');

// ── INSERT communes ──────────────────────────────────────────────────────────
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`-- Communes (échantillon ${communesSample.length} entrées)`);
lines.push(`-- ───────────────────────────────────────────────────────────────`);
for (const com of communesSample) {
  const vals = [
    `'${esc(com.code)}'`,
    `'${esc(com.name)}'`,
    `'${esc(com.parent)}'`,
    num(com.lat),
    num(com.lng),
  ].join(', ');
  lines.push(
    insertRow(
      {
        table: 'communes',
        fields: ['code', 'name', 'parent_code', 'lat', 'lng'],
      },
      vals,
    ),
  );
}
lines.push('');

// ── Statistiques ─────────────────────────────────────────────────────────────
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`-- Message de fin`);
lines.push(`-- ───────────────────────────────────────────────────────────────`);
lines.push(`DO $$`);
lines.push(`DECLARE`);
lines.push(`  n_regions INTEGER;`);
lines.push(`  n_cercles INTEGER;`);
lines.push(`  n_communes INTEGER;`);
lines.push(`BEGIN`);
lines.push(`  SELECT COUNT(*) INTO n_regions  FROM geo_ref.regions;`);
lines.push(`  SELECT COUNT(*) INTO n_cercles  FROM geo_ref.cercles;`);
lines.push(`  SELECT COUNT(*) INTO n_communes FROM geo_ref.communes;`);
lines.push(`  RAISE NOTICE '============================================';`);
lines.push(`  RAISE NOTICE '✅ NINA-AES — Référentiel Mali seedé';`);
lines.push(`  RAISE NOTICE '   Régions   : % / 20 (19 régions + District)',  n_regions;`);
lines.push(`  RAISE NOTICE '   Cercles   : % / 159 attendus',                n_cercles;`);
lines.push(`  RAISE NOTICE '   Communes  : % (échantillon)',                 n_communes;`);
lines.push(`  RAISE NOTICE '   Arrondissements : 0 (à ingérer V2 via INSTAT)';`);
lines.push(`  RAISE NOTICE '   Villages         : 0 (hors scope V1, 12 712 attendus via INSTAT)';`);
lines.push(`  RAISE NOTICE '============================================';`);
lines.push(`END $$;`);
lines.push('');

// ── Écriture du fichier ──────────────────────────────────────────────────────
const output = lines.join('\n');
const outputPath = resolve(ROOT, 'infrastructure/scripts/seed-locations.sql');
writeFileSync(outputPath, output, 'utf-8');

console.log(`✅ ${outputPath}`);
console.log(`   ${regions.length} régions + ${cercles.length} cercles + ${communesSample.length} communes`);
console.log(`   ${output.length} caractères, ${lines.length} lignes`);
