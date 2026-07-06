/**
 * @file        identity.client.ts
 * @description Client typé pour identity-service (port 3001).
 *              Endpoints couverts (alignés sur citizen.controller.ts, cf.
 *              doc 07 §2146 — le gateway forwarde le chemin INCHANGÉ) :
 *                `GET /citizens/:nina`      (findByNina, NinaOwnershipGuard)
 *                `GET /citizens`            (search + pagination, agent+)
 *                `GET /citizens/by-id/:id`  (findById par UUID, agent+)
 *
 * @module      @nina-aes/api-client
 */

import { citizenDtoSchema, ninaSchema, paginationQuerySchema } from '@nina-aes/shared-types';
import { z } from 'zod';
import type { HttpClient } from '../core/http-client';
import type { IdentityApi } from '../core/client.types';

/**
 * Variante "complète" du Citoyen renvoyé par l'API
 * (inclut id, createdAt, updatedAt — pas dans le DTO d'entrée).
 *
 * Exportée pour que le client *mock* valide ses fixtures avec le même schéma.
 */
export const CitizenResponseSchema = citizenDtoSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Citizen = z.infer<typeof CitizenResponseSchema>;

export const CitizenSearchResultSchema = z.object({
  data: z.array(CitizenResponseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type CitizenSearchResult = z.infer<typeof CitizenSearchResultSchema>;

/** Client typé pour les endpoints identity-service. */
export class IdentityClient implements IdentityApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Récupère un citoyen par son NINA (15 caractères).
   * @throws {ApiError} 404 si le NINA n'existe pas.
   */
  async getByNina(nina: string): Promise<Citizen> {
    const validated = ninaSchema.parse(nina);
    // Route réelle : `@Get(':nina')` (findByNina). Le préfixe `by-nina/` n'existe
    // PAS côté controller — l'envoyer heurtait `@Get(':nina')` avec nina="by-nina"
    // (échec ninaSchema) puis 404. Anti-IDOR assuré backend par NinaOwnershipGuard.
    return this.http.request<Citizen>({
      method: 'GET',
      path: `/api/v1/citizens/${encodeURIComponent(validated)}`,
      schema: CitizenResponseSchema,
    });
  }

  /** Recherche fuzzy par nom/région avec pagination. */
  async search(params: {
    q?: string;
    region?: string;
    page?: number;
    pageSize?: number;
  }): Promise<CitizenSearchResult> {
    const pagination = paginationQuerySchema.parse({
      page: params.page,
      pageSize: params.pageSize,
    });
    // Route réelle : `@Get()` sur `/citizens` (search + pagination via @Query).
    // Le suffixe `/search` heurtait `@Get(':nina')` avec nina="search".
    return this.http.request<CitizenSearchResult>({
      method: 'GET',
      path: '/api/v1/citizens',
      query: { q: params.q, region: params.region, ...pagination },
      schema: CitizenSearchResultSchema,
    });
  }

  /** Récupère un citoyen par son UUID interne (agent+). */
  async getById(id: string): Promise<Citizen> {
    // Route réelle : `@Get('by-id/:id')`. Sans le préfixe `by-id/`, l'UUID
    // heurtait `@Get(':nina')` (échec ninaSchema, jamais findById).
    return this.http.request<Citizen>({
      method: 'GET',
      path: `/api/v1/citizens/by-id/${encodeURIComponent(id)}`,
      schema: CitizenResponseSchema,
    });
  }
}
