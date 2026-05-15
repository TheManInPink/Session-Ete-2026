/**
 * @file        correction.client.ts
 * @description Client typé pour `correction-service` (port 3005).
 * @module      @nina-aes/api-client
 */

import type { HttpClient } from '../core/http-client';
import {
  CorrectionListSchema,
  CorrectionRequestSchema,
  type CorrectionList,
  type CorrectionRequest,
  type CreateCorrectionDto,
} from './correction.schema';

export class CorrectionClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Soumet une nouvelle demande de correction.
   *
   * @returns La demande créée avec son id et son statut initial (`UNDER_REVIEW`).
   */
  async submit(dto: CreateCorrectionDto): Promise<CorrectionRequest> {
    return this.http.request<CorrectionRequest>({
      method: 'POST',
      path: '/api/v1/corrections',
      body: dto,
      schema: CorrectionRequestSchema,
      idempotencyKey: `corr-${dto.nina}-${dto.field}-${Date.now()}`,
    });
  }

  /**
   * Liste les corrections — pour le citoyen, filtré sur son propre NINA ;
   * pour les agents, sur tout le périmètre.
   *
   * @param params - Filtres (status, page, pageSize).
   */
  async list(params: {
    nina?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<CorrectionList> {
    return this.http.request<CorrectionList>({
      method: 'GET',
      path: '/api/v1/corrections',
      query: params,
      schema: CorrectionListSchema,
    });
  }

  /** Récupère le détail d'une correction par son id. */
  async getById(id: string): Promise<CorrectionRequest> {
    return this.http.request<CorrectionRequest>({
      method: 'GET',
      path: `/api/v1/corrections/${encodeURIComponent(id)}`,
      schema: CorrectionRequestSchema,
    });
  }

  /** Annule une correction encore en `DRAFT` ou `SUBMITTED` (côté citoyen). */
  async cancel(id: string): Promise<CorrectionRequest> {
    return this.http.request<CorrectionRequest>({
      method: 'POST',
      path: `/api/v1/corrections/${encodeURIComponent(id)}/cancel`,
      schema: CorrectionRequestSchema,
    });
  }
}
