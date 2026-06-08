/**
 * @file        template.registry.ts
 * @description Moteur de rendu des templates multilingues.
 *
 *              Charge un fichier JSON par langue (`locales/<lang>.json`) au
 *              démarrage. Le rendu :
 *                1. valide la présence des variables obligatoires (catalogue) ;
 *                2. sélectionne le contenu de la langue demandée, avec
 *                   **fallback FR** si la langue ou la clé est absente ;
 *                3. interpole les `{variables}` ;
 *                4. refuse tout placeholder non substitué (anti « SMS avec
 *                   {id} brut »).
 *
 *              ⚠️  i18n : FR (référence) et BM (bamanankan) sont traduits.
 *              Les 6 autres langues retombent sur FR en attendant une
 *              relecture par un locuteur natif (cf. README §i18n).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/templates
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { LANGUAGES, NotificationChannel, type Lang } from '../channels/channel.types.js';
import { TEMPLATE_BY_KEY, TEMPLATES } from './template.catalog.js';
import type { LocaleFile, RenderedTemplate, TemplateDef } from './template.types.js';

/** Langue de référence : toujours présente et complète. */
const FALLBACK_LANG: Lang = 'FR';

/** Erreur de rendu (clé/canal inconnus, variable manquante). → mappée en 400. */
export class TemplateRenderError extends Error {
  constructor(
    message: string,
    readonly code: 'TEMPLATE_NOT_FOUND' | 'CHANNEL_NOT_FOUND' | 'MISSING_VARIABLE',
  ) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

@Injectable()
export class TemplateRegistry {
  private readonly logger = new Logger(TemplateRegistry.name);
  private readonly locales = new Map<Lang, LocaleFile>();

  constructor() {
    for (const lang of LANGUAGES) {
      try {
        const path = join(__dirname, 'locales', `${lang.toLowerCase()}.json`);
        this.locales.set(lang, JSON.parse(readFileSync(path, 'utf8')) as LocaleFile);
      } catch (err) {
        // FR est obligatoire ; son absence est fatale.
        if (lang === FALLBACK_LANG) {
          throw new Error(`Fichier de langue FR introuvable : ${(err as Error).message}`, {
            cause: err,
          });
        }
        this.logger.warn(`Langue ${lang} non chargée (fallback FR) : ${(err as Error).message}`);
        this.locales.set(lang, {});
      }
    }
    this.logger.log(`Templates chargés : ${TEMPLATES.length} clés × ${LANGUAGES.length} langues`);
  }

  /** Catalogue des templates (métadonnées) — pour GET /templates. */
  list(): readonly TemplateDef[] {
    return TEMPLATES;
  }

  /** Vrai si la clé existe au catalogue. */
  has(key: string): boolean {
    return TEMPLATE_BY_KEY.has(key);
  }

  /**
   * Rend un template pour un canal et une langue donnés.
   *
   * @param key      Clé de template (ex. `mfa-code`).
   * @param channel  Canal cible (SMS/EMAIL/PUSH/USSD).
   * @param lang     Langue demandée (fallback FR).
   * @param vars     Variables d'interpolation.
   * @returns Le contenu rendu (+ langue réellement utilisée).
   * @throws TemplateRenderError si clé/canal inconnus ou variable manquante.
   */
  render(
    key: string,
    channel: NotificationChannel,
    lang: Lang,
    vars: Record<string, string | number>,
  ): RenderedTemplate {
    const def = TEMPLATE_BY_KEY.get(key);
    if (!def) {
      throw new TemplateRenderError(`Template inconnu : "${key}"`, 'TEMPLATE_NOT_FOUND');
    }

    // Variables obligatoires présentes ?
    const missing = def.requiredVars.filter((v) => vars[v] === undefined || vars[v] === null);
    if (missing.length > 0) {
      throw new TemplateRenderError(
        `Variables manquantes pour "${key}" : ${missing.join(', ')}`,
        'MISSING_VARIABLE',
      );
    }

    // Canal SMS et USSD partagent le contenu "sms" ; PUSH aussi (titre+corps).
    const slot: 'sms' | 'email' = channel === NotificationChannel.EMAIL ? 'email' : 'sms';

    const { content, usedLang } = this.resolve(key, slot, lang);
    if (!content) {
      throw new TemplateRenderError(
        `Canal ${channel} indisponible pour le template "${key}"`,
        'CHANNEL_NOT_FOUND',
      );
    }

    if (typeof content === 'string') {
      return { body: this.interpolate(content, vars), language: usedLang };
    }
    return {
      subject: this.interpolate(content.subject, vars),
      body: this.interpolate(content.body, vars),
      language: usedLang,
    };
  }

  /**
   * Résout le contenu d'un (clé, slot) dans la langue demandée, avec fallback
   * FR si absent.
   */
  private resolve(
    key: string,
    slot: 'sms' | 'email',
    lang: Lang,
  ): { content: string | { subject: string; body: string } | undefined; usedLang: Lang } {
    const wanted = this.locales.get(lang)?.[key]?.[slot];
    if (wanted !== undefined) return { content: wanted, usedLang: lang };
    const fr = this.locales.get(FALLBACK_LANG)?.[key]?.[slot];
    return { content: fr, usedLang: FALLBACK_LANG };
  }

  /**
   * Remplace les `{nom}` par leur valeur. Lève si un placeholder reste
   * non substitué (variable non fournie alors qu'attendue par le texte).
   */
  private interpolate(template: string, vars: Record<string, string | number>): string {
    const rendered = template.replace(/\{(\w+)\}/g, (_m, name: string) =>
      vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
    );
    const leftover = rendered.match(/\{(\w+)\}/);
    if (leftover) {
      throw new TemplateRenderError(
        `Variable non fournie dans le texte : ${leftover[0]}`,
        'MISSING_VARIABLE',
      );
    }
    return rendered;
  }
}
