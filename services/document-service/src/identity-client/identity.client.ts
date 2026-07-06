/**
 * @file        identity.client.ts
 * @description Client HTTP vers identity-service (port 3001).
 *              En P0, communication HTTP+axios ; gRPC reporté Bloc B.
 *              Le service réceptionne aussi la chaîne d'ancêtres d'une
 *              Location pour matérialiser la hiérarchie 8 niveaux de la FDI.
 *
 *              🔒 CONTRAT D'AUTHENTIFICATION SERVICE-À-SERVICE (anti-IDOR A01) :
 *              ce client n'AGRÈGE PAS le Bearer du citoyen appelant — il
 *              s'authentifie en tant que SERVICE sur un CANAL INTERNE DE
 *              CONFIANCE (mTLS / PKI Vault + mesh Linkerd, cf. ADR-034 et
 *              doc 10 §12.2). Conséquence : le `NinaOwnershipGuard`
 *              d'identity-service (qui borne un citoyen à SON `:nina`) ne
 *              s'applique PAS à l'identité de l'appelant final — il ne voit que
 *              le service. La frontière d'autorisation par NINA est donc rendue
 *              CÔTÉ document-service, EN AMONT de tout appel ici, via
 *              `DocumentOwnershipService.assertCanAccess(user, nina)` :
 *                - POST /documents/fdi   → contrôle d'ownership sur `body.nina` ;
 *                - GET  /:id/download-url → contrôle d'ownership sur `doc.nina`.
 *              ⚠️ NE PAS appeler `fetchCitizen`/`fetchLocation` sans avoir
 *              d'abord garanti l'ownership : ce client renverrait la PII de
 *              N'IMPORTE QUEL NINA (c'est un canal de confiance, pas un point
 *              d'autorisation par utilisateur).
 *
 * @module      document-service/identity-client
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type { Env } from '../config/env.schema';
import type { CitizenDto, LocationWithAncestorsDto } from './types';

/** Référence hachée non réversible d'un NINA — corrélable en logs sans PII. */
function ninaRef(nina: string): string {
  return createHash('sha256').update(nina).digest('hex').slice(0, 8);
}

@Injectable()
export class IdentityClient {
  private readonly log = new Logger(IdentityClient.name);
  private readonly http: AxiosInstance;

  constructor(cfg: ConfigService<Env, true>) {
    const baseURL = cfg.get('IDENTITY_SERVICE_URL', { infer: true });
    this.http = axios.create({
      baseURL: `${baseURL}/api/v1`,
      timeout: 5_000,
      headers: { 'User-Agent': 'document-service/0.1.0' },
    });
  }

  /**
   * Récupère un citoyen par son NINA.
   *
   * @throws NotFoundException 404 — NINA inconnu / soft-deleted.
   */
  async fetchCitizen(nina: string): Promise<CitizenDto> {
    try {
      const { data } = await this.http.get<CitizenDto>(`/citizens/${encodeURIComponent(nina)}`);
      return data;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        throw new NotFoundException(
          `NINA (réf. ${ninaRef(nina)}) introuvable dans identity-service`,
        );
      }
      // 🔒 Jamais de NINA en clair dans les logs — référence hachée corrélable.
      this.log.error({ err, ninaRef: ninaRef(nina) }, 'fetchCitizen échoué');
      throw err;
    }
  }

  /**
   * Récupère une Location + sa chaîne d'ancêtres jusqu'à la racine
   * ("Mali > Bamako > Commune III"). Utilisé pour rendre les 8 niveaux
   * de la FDI (lieu de naissance + lieu de résidence).
   */
  async fetchLocation(locationId: string): Promise<LocationWithAncestorsDto> {
    try {
      const { data } = await this.http.get<LocationWithAncestorsDto>(
        `/locations/${encodeURIComponent(locationId)}`,
      );
      return data;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        throw new NotFoundException(`Location ${locationId} introuvable`);
      }
      this.log.error({ err, locationId }, 'fetchLocation échoué');
      throw err;
    }
  }

  /**
   * Healthcheck léger — utilisé par Terminus (cf. health.module.ts).
   *
   * @returns true si identity-service répond HTTP 200 sur /health.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.http.get('/health', { timeout: 2_000 });
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
