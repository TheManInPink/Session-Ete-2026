/**
 * @file        correction.client.ts
 * @description Client typé pour le module correction d'identity-service.
 *              Routes réelles (le code fait foi, cf. `correction.controller.ts`) :
 *                POST /api/v1/corrections               soumission
 *                GET  /api/v1/corrections               liste paginée (agent+)
 *                GET  /api/v1/corrections/:id           détail (join citoyen)
 *                PUT  /api/v1/corrections/:id/approve   décision agent
 *                PUT  /api/v1/corrections/:id/reject    décision agent (motif ≥ 20)
 *
 *              Normalisation : le backend liste sous la clé `data` et porte le
 *              NINA sur le join `citizen` — le client remet tout au contrat
 *              public (`items` + `nina` au premier niveau) pour que les
 *              consommateurs existants (PC-03/PC-05) ne changent pas.
 * @module      @nina-aes/api-client
 */

import type { ZodType } from 'zod';
import type { HttpClient } from '../core/http-client';
import { ApiValidationError } from '../core/errors';
import type { CorrectionApi, CorrectionListParams } from '../core/client.types';
import {
  CorrectionListResponseSchema,
  CorrectionListSchema,
  CorrectionRequestSchema,
  CorrectionWireItemSchema,
  MyCorrectionsResponseSchema,
  type CorrectionList,
  type CorrectionListResponse,
  type CorrectionRequest,
  type CorrectionWireItem,
  type CreateCorrectionDto,
  type MyCorrectionsResponse,
  type RejectCorrectionDto,
} from './correction.schema';

export class CorrectionClient implements CorrectionApi {
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
   * pour les agents (AD-02), sur tout le périmètre avec les filtres backend
   * `status` / `agent` (UUID relecteur) / `from` / `to` (dates ISO).
   *
   * Le backend renvoie `{ data, total, page, pageSize }` avec le NINA sur le
   * join `citizen` : on normalise vers {@link CorrectionList} (`items` +
   * `nina` au premier niveau), re-validé fail-closed.
   *
   * @param params - Filtres (nina, status, agent, from, to, page, pageSize).
   */
  async list(params: CorrectionListParams = {}): Promise<CorrectionList> {
    const raw = await this.http.request<CorrectionListResponse>({
      method: 'GET',
      path: '/api/v1/corrections',
      query: params,
      schema: CorrectionListResponseSchema,
    });
    const candidate = {
      items: raw.data.map((row) => this.withNina(row)),
      total: raw.total,
      page: raw.page,
      pageSize: raw.pageSize,
    };
    return this.parsePublic(CorrectionListSchema, candidate, '/api/v1/corrections');
  }

  /**
   * PC-05 — liste les corrections du citoyen AUTHENTIFIÉ.
   *
   * 🔒 Anti-IDOR / BOLA : aucun paramètre — le backend dérive le NINA du token
   * (`GET /corrections/me`). Contrairement à {@link list} (réservé aux agents et
   * qui ignore tout filtre `nina` côté serveur), un citoyen ne peut donc PAS
   * lister le dossier d'autrui. Réponse NON paginée, normalisée au contrat public.
   *
   * @returns Les corrections du citoyen (ordre antéchronologique).
   */
  async listMine(): Promise<CorrectionRequest[]> {
    const raw = await this.http.request<MyCorrectionsResponse>({
      method: 'GET',
      path: '/api/v1/corrections/me',
      schema: MyCorrectionsResponseSchema,
    });
    return raw.data.map((row) => this.toPublic(row, '/api/v1/corrections/me'));
  }

  /** Récupère le détail d'une correction par son id (join citoyen complet). */
  async getById(id: string): Promise<CorrectionRequest> {
    const row = await this.http.request<CorrectionWireItem>({
      method: 'GET',
      path: `/api/v1/corrections/${encodeURIComponent(id)}`,
      schema: CorrectionWireItemSchema,
    });
    return this.toPublic(row, `/api/v1/corrections/${id}`);
  }

  /** Annule une correction encore en `DRAFT` ou `SUBMITTED` (côté citoyen). */
  async cancel(id: string): Promise<CorrectionRequest> {
    return this.http.request<CorrectionRequest>({
      method: 'POST',
      path: `/api/v1/corrections/${encodeURIComponent(id)}/cancel`,
      schema: CorrectionRequestSchema,
    });
  }

  /**
   * AD-02 — approuve une correction `UNDER_REVIEW` (la modification est
   * appliquée au citoyen côté backend). Corps vide, rôle agent+ requis.
   *
   * @returns La correction décidée (`APPROVED`, `decidedAt` posé).
   */
  async approve(id: string): Promise<CorrectionRequest> {
    const row = await this.http.request<CorrectionWireItem>({
      method: 'PUT',
      path: `/api/v1/corrections/${encodeURIComponent(id)}/approve`,
      schema: CorrectionWireItemSchema,
    });
    return this.toPublic(row, `/api/v1/corrections/${id}/approve`);
  }

  /**
   * AD-02 — rejette une correction `UNDER_REVIEW` avec motif obligatoire
   * (min 20 caractères, validé côté backend).
   *
   * NB : la réponse brute du backend ne porte pas le join `citizen` (donc pas
   * de NINA reconstituable) — dans ce cas on relit le détail pour renvoyer un
   * objet conforme au contrat public.
   *
   * @returns La correction décidée (`REJECTED`, `decisionReason` posé).
   */
  async reject(id: string, dto: RejectCorrectionDto): Promise<CorrectionRequest> {
    const row = await this.http.request<CorrectionWireItem>({
      method: 'PUT',
      path: `/api/v1/corrections/${encodeURIComponent(id)}/reject`,
      body: dto,
      schema: CorrectionWireItemSchema,
    });
    if (row.nina === undefined && row.citizen === undefined) {
      return this.getById(id);
    }
    return this.toPublic(row, `/api/v1/corrections/${id}/reject`);
  }

  // ── Normalisation fil → contrat public ──────────────────────────────────────

  /** Remonte le NINA du join `citizen` au premier niveau si absent. */
  private withNina(row: CorrectionWireItem): Record<string, unknown> {
    return { ...row, nina: row.nina ?? row.citizen?.nina };
  }

  /** Valide un item normalisé contre le contrat public (fail-closed). */
  private toPublic(row: CorrectionWireItem, endpoint: string): CorrectionRequest {
    return this.parsePublic(CorrectionRequestSchema, this.withNina(row), endpoint);
  }

  /**
   * `.parse()` fail-closed converti en {@link ApiValidationError} pour rester
   * dans la taxonomie d'erreurs du client (même famille que la validation de
   * réponse du HttpClient).
   */
  private parsePublic<T>(schema: ZodType<T>, candidate: unknown, endpoint: string): T {
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      throw new ApiValidationError({
        endpoint,
        issues: parsed.error.issues,
        correlationId: 'client-normalize',
      });
    }
    return parsed.data;
  }
}
