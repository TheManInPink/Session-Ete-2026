/**
 * @file        sigac.client.ts
 * @description Client typé pour `anticorruption-service` (port 3009, FastAPI).
 *              Conçu pour le signalement **strictement anonyme** : l'appel ne
 *              porte JAMAIS d'`Authorization` header (skipAuth: true).
 * @module      @nina-aes/api-client
 */

import type { HttpClient } from '../core/http-client';
import type { SigacApi } from '../core/client.types';
import {
  AnonymousAlertReceiptSchema,
  AnonymousAlertStatusSchema,
  type AnonymousAlertDto,
  type AnonymousAlertReceipt,
  type AnonymousAlertStatus,
} from './sigac.schema';

export class SigacClient implements SigacApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Soumet un signalement anonyme.
   *
   * Particularités sécurité :
   *   - `skipAuth: true` : pas d'`Authorization` header (anonyme)
   *   - pas d'idempotency key (un même rapporteur peut soumettre plusieurs alertes)
   *   - le proxy en amont strippe les headers `X-Forwarded-For` / `User-Agent`
   *   - aucun cookie n'est posé par cet endpoint
   */
  async submit(dto: AnonymousAlertDto): Promise<AnonymousAlertReceipt> {
    return this.http.request<AnonymousAlertReceipt>({
      method: 'POST',
      path: '/api/v1/sigac/alerts/anonymous',
      body: dto,
      schema: AnonymousAlertReceiptSchema,
      skipAuth: true,
    });
  }

  /**
   * Consulte le statut d'une instruction via le token anonyme.
   * Aucune PII n'est retournée — seulement le statut + notes publiques.
   */
  async getStatus(trackingToken: string): Promise<AnonymousAlertStatus> {
    return this.http.request<AnonymousAlertStatus>({
      method: 'GET',
      path: `/api/v1/sigac/alerts/by-token/${encodeURIComponent(trackingToken)}`,
      schema: AnonymousAlertStatusSchema,
      skipAuth: true,
    });
  }
}
