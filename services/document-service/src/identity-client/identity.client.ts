/**
 * @file        identity.client.ts
 * @description Client HTTP vers identity-service (port 3001).
 *              En P0, communication HTTP+axios ; gRPC reporté Bloc B.
 *              Le service réceptionne aussi la chaîne d'ancêtres d'une
 *              Location pour matérialiser la hiérarchie 8 niveaux de la FDI.
 * @module      document-service/identity-client
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type { Env } from '../config/env.schema';
import type { CitizenDto, LocationWithAncestorsDto } from './types';

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
        throw new NotFoundException(`NINA ${nina} introuvable dans identity-service`);
      }
      this.log.error({ err, nina }, 'fetchCitizen échoué');
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
