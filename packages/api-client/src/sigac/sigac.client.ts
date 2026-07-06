/**
 * @file        sigac.client.ts
 * @description Client typé pour `anticorruption-service` (port 3009, FastAPI).
 *              Conçu pour le signalement **strictement anonyme** : l'appel ne
 *              porte JAMAIS d'`Authorization` header (skipAuth: true).
 * @module      @nina-aes/api-client
 */

import type { HttpClient } from '../core/http-client';
import {
  SigacPublicKeySchema,
  SealedReportReceiptSchema,
  WhistleblowerStatusResponseSchema,
  WhistleblowerQueueSchema,
  type SigacPublicKey,
  type SealedReportRequest,
  type SealedReportReceipt,
  type WhistleblowerStatusResponse,
  type WhistleblowerQueue,
} from './sigac.schema';

export class SigacClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Récupère la clé publique du procureur pour sceller un signalement CÔTÉ
   * NAVIGATEUR (le serveur ne déchiffre jamais). Endpoint public (`skipAuth`).
   *
   * @returns `{ scheme, cipher_kid, public_key }` — `public_key` peut être vide
   *          si le backend n'est pas configuré : l'appelant DOIT alors refuser
   *          de soumettre (ne jamais retomber sur un envoi en clair).
   */
  async getPublicKey(): Promise<SigacPublicKey> {
    return this.http.request<SigacPublicKey>({
      method: 'GET',
      path: '/api/v1/sigac/whistleblower/public-key',
      schema: SigacPublicKeySchema,
      skipAuth: true,
    });
  }

  /**
   * Dépose un signalement **déjà scellé** (chiffré côté navigateur).
   *
   * Sécurité :
   *   - `skipAuth: true` : aucun `Authorization` (anonyme)
   *   - le transport anonyme omet le cookie ET le `X-Correlation-Id` horodaté
   *   - le corps ne contient QUE du ciphertext + métadonnées de scellement
   *   - pas d'idempotency key (un rapporteur peut déposer plusieurs alertes)
   */
  async submitSealedReport(req: SealedReportRequest): Promise<SealedReportReceipt> {
    return this.http.request<SealedReportReceipt>({
      method: 'POST',
      path: '/api/v1/sigac/whistleblower/reports',
      body: req,
      schema: SealedReportReceiptSchema,
      skipAuth: true,
    });
  }

  /**
   * Consulte le statut d'une instruction via le token de suivi anonyme.
   * Aucune PII retournée — seulement le statut du cycle de vie.
   */
  async getReportStatus(trackingToken: string): Promise<WhistleblowerStatusResponse> {
    return this.http.request<WhistleblowerStatusResponse>({
      method: 'GET',
      path: `/api/v1/sigac/whistleblower/reports/${encodeURIComponent(trackingToken)}/status`,
      schema: WhistleblowerStatusResponseSchema,
      skipAuth: true,
    });
  }

  /**
   * AD-03 — file procureur des signalements scellés (buckets grossiers + jour,
   * JAMAIS de contenu déchiffré : le déchiffrement se fait hors-ligne).
   *
   * Contrairement à `submit`/`getStatus` (anonymes), cet endpoint est
   * **authentifié** (réservé INSPECTOR/PROSECUTOR côté serveur) : pas de
   * `skipAuth`, l'`Authorization` du transport courant est envoyée.
   */
  async getQueue(): Promise<WhistleblowerQueue> {
    return this.http.request<WhistleblowerQueue>({
      method: 'GET',
      path: '/api/v1/sigac/whistleblower/queue',
      schema: WhistleblowerQueueSchema,
    });
  }
}
