/**
 * @file        template.service.ts
 * @description Rendu HTML de la FDI à partir des données citoyen + document.
 *              Charge les templates Handlebars + partials au boot, configure
 *              i18next avec 4 langues (fra/bam/snk/fuv), insère le QR data URL.
 *
 *              Le HTML produit est ensuite envoyé à Puppeteer (phase 6) pour
 *              produire le PDF A4 final.
 *
 * @module      document-service/templates
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import * as Handlebars from 'handlebars';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import * as qrcode from 'qrcode';
import { formatNinaHelper } from './helpers/format-nina.helper';
import { formatDateHelper } from './helpers/format-date.helper';
import type { CitizenDto, LocationWithAncestorsDto } from '../identity-client/types';

/** Entrée minimale pour rendre une FDI complète. */
export interface RenderInput {
  /** Citoyen retourné par identity-service. */
  citizen: CitizenDto;
  /** Chaîne d'ancêtres du lieu de naissance (8 niveaux). */
  birthPlace: LocationWithAncestorsDto;
  /** Chaîne d'ancêtres du lieu de résidence (8 niveaux). */
  residence: LocationWithAncestorsDto;
  /** Métadonnées du document. */
  document: {
    id: string;
    serialNumber: string;
    issuedAt: string; // ISO 8601
    jti: string;
    watermark: string;
  };
  language: 'fra' | 'bam' | 'snk' | 'fuv';
  /** Token JWT brut à encoder dans le QR. */
  qrToken: string;
}

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly log = new Logger(TemplateService.name);
  private compiled!: HandlebarsTemplateDelegate;
  private css!: string;

  async onModuleInit(): Promise<void> {
    Handlebars.registerHelper('formatNina', formatNinaHelper);
    Handlebars.registerHelper('formatDate', formatDateHelper);
    Handlebars.registerHelper('concat', (a, b) => `${a}${b}`);

    const filesDir = join(__dirname, 'files');
    const partialsDir = join(filesDir, 'partials');

    // Enregistrement de tous les partials
    for (const fname of await fs.readdir(partialsDir)) {
      if (!fname.endsWith('.hbs')) continue;
      const src = await fs.readFile(join(partialsDir, fname), 'utf8');
      Handlebars.registerPartial(fname.replace(/\.hbs$/, ''), src);
    }

    // Template principal + CSS inliné
    this.compiled = Handlebars.compile(
      await fs.readFile(join(filesDir, 'fiche-descriptive.hbs'), 'utf8'),
      { noEscape: false },
    );
    this.css = await fs.readFile(join(filesDir, 'fiche-descriptive.css'), 'utf8');

    // i18next 4 langues, fallback fra
    await i18next.use(Backend).init({
      fallbackLng: 'fra',
      preload: ['fra', 'bam', 'snk', 'fuv'],
      backend: { loadPath: join(__dirname, '..', 'i18n', '{{lng}}.json') },
      interpolation: { escapeValue: false },
    });

    this.log.log('Templates Handlebars + i18n 4 langues chargés');
  }

  /**
   * Rend le HTML final + retourne le SHA-256 du HTML pour intégrité.
   */
  async render(input: RenderInput): Promise<{ html: string; sha256Html: string }> {
    const qrDataUrl = await qrcode.toDataURL(input.qrToken, {
      errorCorrectionLevel: 'H', // 30 % de redondance, résistant pliage/usure
      margin: 1,
      scale: 6,
    });
    const t = i18next.getFixedT(input.language);
    const html = this.compiled({
      citizen: input.citizen,
      birthPlace: this.flatten(input.birthPlace),
      residence: this.flatten(input.residence),
      document: input.document,
      language: input.language,
      qrDataUrl,
      css: this.css,
      t: (key: string, opts?: Record<string, unknown>) => t(key, opts ?? {}),
    });
    const sha256Html = createHash('sha256').update(html).digest('hex');
    return { html, sha256Html };
  }

  /**
   * Aplatit une LocationWithAncestorsDto en propriétés nommées par niveau
   * (country, region, cercle, …) pour l'affichage tabulaire FDI.
   * Si un niveau manque, la chaîne est vide.
   */
  private flatten(loc: LocationWithAncestorsDto): Record<string, string> {
    const chain = [...loc.ancestors, loc.location];
    const byLevel: Record<number, string> = {};
    for (const node of chain) byLevel[node.level] = node.name;
    const root = chain.find((n) => n.level === 0);
    return {
      countryCode: root?.name === 'Mali' ? 'ML' : '',
      country: byLevel[0] ?? '',
      region: byLevel[1] ?? '',
      cercle: byLevel[2] ?? '',
      arrondissement: byLevel[3] ?? '',
      commune: byLevel[4] ?? '',
      quartier: byLevel[5] ?? '',
      fraction: byLevel[6] ?? '',
      hameau: byLevel[7] ?? '',
      secteur: '',
    };
  }
}
