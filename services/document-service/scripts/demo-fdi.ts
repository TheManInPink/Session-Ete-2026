/**
 * @file        demo-fdi.ts
 * @description Script de démonstration autonome : rend un PDF de FDI
 *              avec des données fictives — SANS appel à identity-service,
 *              Vault, MinIO, Postgres ou RabbitMQ.
 *
 *              Utilité :
 *                - Vérifier visuellement le rendu HTML/CSS sans monter
 *                  toute la stack docker compose
 *                - Servir de fixture pour le test de régression visuelle
 *                  (phase 10 future + doc 10 §14.3)
 *                - Démontrer le format A4 imprimable au tuteur UQAR
 *
 *              Usage :
 *                pnpm --filter @nina-aes/document-service demo:fdi
 *                  → écrit demo-fdi-fra.pdf à la racine du package
 *                  → écrit demo-fdi-bam.pdf (bamanankan)
 *
 *              Le QR contient un JWT factice (signé HS256 local) — la
 *              vérification offline réelle exige Vault + JWKS publié.
 *
 * @module      document-service/scripts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, sign as cryptoSign, generateKeyPairSync } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import * as Handlebars from 'handlebars';
import * as qrcode from 'qrcode';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { promises as fs } from 'node:fs';
import { launch } from 'puppeteer';
import { PDFDocument, AFRelationship } from 'pdf-lib';
import { canonicalJson } from '../src/fdi/canonical';
import { computeWatermark } from '../src/fdi/watermark';
import { formatNinaHelper } from '../src/templates/helpers/format-nina.helper';
import { formatDateHelper } from '../src/templates/helpers/format-date.helper';

// Fixture : un citoyen plausible Mali
const CITIZEN = {
  nina: '19850315123456A',
  firstName: 'Aliou',
  lastName: 'Traoré',
  birthDate: '1985-03-15',
  sex: 'MALE',
  maritalStatus: 'MARRIED',
  profession: 'Enseignant',
  photoUrl: null,
  fingerprintHash: null,
  father: { firstName: 'Mamadou', lastName: 'Traoré' },
  mother: { firstName: 'Aminata', lastName: 'Diarra' },
};

const BIRTH_PLACE = {
  location: { id: 'b1', code: 'ML-08-01-001', name: 'Bamako', level: 4, parentId: null },
  ancestors: [
    { id: 'r1', name: 'Mali', level: 0 },
    { id: 'r2', name: 'District de Bamako', level: 1 },
    { id: 'r3', name: 'Bamako', level: 2 },
    { id: 'r4', name: 'Commune III', level: 3 },
  ],
  path: 'Mali > District de Bamako > Bamako > Commune III > Bamako',
};

const RESIDENCE = BIRTH_PLACE;

async function renderHtml(lang: 'fra' | 'bam', qrToken: string): Promise<string> {
  // Helpers Handlebars
  Handlebars.registerHelper('formatNina', formatNinaHelper);
  Handlebars.registerHelper('formatDate', formatDateHelper);
  Handlebars.registerHelper('concat', (a, b) => `${a}${b}`);

  // Partials
  const srcDir = join(__dirname, '..', 'src');
  const filesDir = join(srcDir, 'templates', 'files');
  const partialsDir = join(filesDir, 'partials');
  for (const fname of await fs.readdir(partialsDir)) {
    if (!fname.endsWith('.hbs')) continue;
    Handlebars.registerPartial(
      fname.replace(/\.hbs$/, ''),
      await fs.readFile(join(partialsDir, fname), 'utf8'),
    );
  }

  // Template principal + CSS
  const template = Handlebars.compile(
    await fs.readFile(join(filesDir, 'fiche-descriptive.hbs'), 'utf8'),
  );
  const css = await fs.readFile(join(filesDir, 'fiche-descriptive.css'), 'utf8');

  // i18n
  if (!i18next.isInitialized) {
    await i18next.use(Backend).init({
      fallbackLng: 'fra',
      preload: ['fra', 'bam'],
      backend: { loadPath: join(srcDir, 'i18n', '{{lng}}.json') },
      interpolation: { escapeValue: false },
    });
  }
  const t = i18next.getFixedT(lang);

  const qrDataUrl = await qrcode.toDataURL(qrToken, {
    errorCorrectionLevel: 'H',
    margin: 1,
    scale: 6,
  });

  // Aplatissement de la place hierarchy (mêmes règles que TemplateService.flatten)
  const flatten = (loc: typeof BIRTH_PLACE): Record<string, string> => {
    const chain = [...loc.ancestors, loc.location];
    const byLevel: Record<number, string> = {};
    for (const node of chain) byLevel[node.level] = node.name;
    return {
      countryCode: 'ML',
      country: byLevel[0] ?? '',
      region: byLevel[1] ?? '',
      cercle: byLevel[2] ?? '',
      arrondissement: byLevel[3] ?? '',
      commune: byLevel[4] ?? '',
      quartier: '',
      fraction: '',
      hameau: '',
      secteur: '',
    };
  };

  return template({
    citizen: CITIZEN,
    birthPlace: flatten(BIRTH_PLACE),
    residence: flatten(RESIDENCE),
    document: {
      id: uuidv7(),
      serialNumber: 'FDI-2026-0000001',
      issuedAt: new Date().toISOString(),
      jti: uuidv7(),
      watermark: computeWatermark('127.0.0.1', 'demo-fdi/cli', 'demo-jti'),
    },
    language: lang,
    qrDataUrl,
    css,
    t: (k: string, opts?: Record<string, unknown>) => t(k, opts ?? {}),
  });
}

function fakeQrToken(): string {
  // JWT factice signé localement (RS256 ad-hoc) — démo, pas pour prod
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const header = { alg: 'RS256', typ: 'JWT', kid: 'demo-v1' };
  const issuedAt = new Date().toISOString();
  const fdi = {
    serialNumber: 'FDI-2026-0000001',
    type: 'FICHE_DESCRIPTIVE',
    language: 'fra',
    issuedAt,
    documentId: 'demo-doc',
  };
  const summary = {
    nina: CITIZEN.nina,
    firstName: CITIZEN.firstName,
    lastName: CITIZEN.lastName,
    birthDate: CITIZEN.birthDate,
    sex: 'M',
    birthPlace: 'Bamako',
  };
  const hash = createHash('sha256')
    .update(canonicalJson({ ...fdi, citizen: summary }))
    .digest('hex');
  const payload = {
    iss: 'urn:nina-aes:ctdec-bamako',
    sub: CITIZEN.nina,
    jti: uuidv7(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 180 * 86400,
    aud: ['urn:nina-aes:verifier'],
    fdi: { ...fdi, hash },
    citizen: summary,
    biometricHash: null,
    wm: 'demoabcd1234',
  };
  const hB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = cryptoSign('RSA-SHA256', Buffer.from(`${hB64}.${pB64}`), privateKey).toString(
    'base64url',
  );
  return `${hB64}.${pB64}.${sig}`;
}

async function renderPdf(lang: 'fra' | 'bam', outPath: string): Promise<void> {
  const token = fakeQrToken();
  const html = await renderHtml(lang, token);

  const browser = await launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const raw = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
    });

    const pdfDoc = await PDFDocument.load(raw);
    pdfDoc.setTitle('Fiche Descriptive Individuelle — DEMO');
    pdfDoc.setProducer('NINA-AES document-service demo');
    pdfDoc.setCreator('CTDEC — Bamako (DEMO)');
    await pdfDoc.attach(Buffer.from(token, 'utf8'), 'qr.jwt', {
      mimeType: 'application/jwt',
      description: 'JWT QR code (DEMO — clé éphémère)',
      afRelationship: AFRelationship.Source,
    });
    const finalPdf = await pdfDoc.save();
    await writeFile(outPath, Buffer.from(finalPdf));
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const outDir = join(__dirname, '..');

  console.log('Rendu FR...');
  await renderPdf('fra', join(outDir, 'demo-fdi-fra.pdf'));

  console.log('Rendu BM...');
  await renderPdf('bam', join(outDir, 'demo-fdi-bam.pdf'));

  console.log('OK — demo-fdi-fra.pdf + demo-fdi-bam.pdf écrits');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
