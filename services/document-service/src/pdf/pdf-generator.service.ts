/**
 * @file        pdf-generator.service.ts
 * @description Pool Puppeteer (puppeteer-cluster, CONCURRENCY_CONTEXT) qui
 *              convertit du HTML en Buffer PDF A4. Le pool absorbe ~100 PDF/min
 *              avec 4 instances browser persistantes (économie ~250 ms par
 *              spawn vs `puppeteer.launch` à chaque requête — cf. doc 10 §13).
 *
 *              Au boot : lance le cluster. À l'extinction : ferme proprement.
 *
 * @module      document-service/pdf
 */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cluster } from 'puppeteer-cluster';
import type { Env } from '../config/env.schema';

@Injectable()
export class PdfGeneratorService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(PdfGeneratorService.name);
  private cluster: Cluster<{ html: string }, Buffer> | null = null;
  private readonly poolSize: number;

  constructor(cfg: ConfigService<Env, true>) {
    this.poolSize = cfg.get('FDI_PUPPETEER_POOL_SIZE', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    this.cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: this.poolSize,
      puppeteerOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Lissage des fonts désactivé pour rendu pixel-stable cross-build
          // (utile pour les tests de régression visuelle phase 10)
          '--font-render-hinting=none',
        ],
      },
      timeout: 30_000,
      retryLimit: 1,
    });

    await this.cluster.task(async ({ page, data }) => {
      await page.setContent(data.html, { waitUntil: 'networkidle0' });
      await page.emulateMediaType('screen');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
        tagged: true, // accessibilité PDF/UA
      });
      return Buffer.from(pdf);
    });

    this.log.log(`Puppeteer cluster prêt (${this.poolSize} contextes)`);
  }

  /**
   * Convertit le HTML rendu (cf. {@link TemplateService.render}) en PDF A4.
   *
   * @throws Error si le pool n'est pas prêt ou si le rendu Chromium échoue.
   */
  async fromHtml(html: string): Promise<Buffer> {
    if (!this.cluster) throw new Error('Puppeteer cluster non initialisé');
    return this.cluster.execute({ html });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.cluster) {
      await this.cluster.idle();
      await this.cluster.close();
      this.cluster = null;
      this.log.log('Puppeteer cluster fermé');
    }
  }
}
