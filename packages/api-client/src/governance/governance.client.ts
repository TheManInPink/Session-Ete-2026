/**
 * @file        governance.client.ts
 * @description Client typé pour governance-service (Bloc C2) : messagerie
 *              officielle signée SGOGT (GOV-01) + directives Kanban (GOV-02).
 *
 *              Toutes les routes sont **authentifiées** (JWT + rôle
 *              institutionnel) — aucune n'utilise `skipAuth`. La signature JWS
 *              RS256 des messages est produite côté serveur (Vault Transit,
 *              ADR-026/034) : le client n'envoie jamais de signature.
 *
 * @module      @nina-aes/api-client
 */

import type { HttpClient } from '../core/http-client';
import { z } from 'zod';
import type {
  DirectiveListParams,
  GovernanceApi,
  GovernanceDirectivesApi,
  GovernanceSgogtApi,
  SgogtInboxParams,
} from '../core/client.types';
import {
  DirectiveViewSchema,
  MessageViewSchema,
  SgogtAckResultSchema,
  SgogtVerifyResultSchema,
  type CreateDirectiveDto,
  type DirectiveView,
  type MessageView,
  type RespondSgogtMessageDto,
  type SendSgogtMessageDto,
  type SgogtAckResult,
  type SgogtVerifyResult,
  type TransitionDirectiveDto,
} from './governance.schema';

/** Boîte de réception : le backend renvoie un tableau `MessageView[]` nu. */
const InboxSchema = z.array(MessageViewSchema);

/** Liste Kanban : tableau `DirectiveView[]` nu (pas d'enveloppe paginée). */
const DirectiveListSchema = z.array(DirectiveViewSchema);

/** Sous-client messagerie SGOGT (GOV-01). */
class SgogtClient implements GovernanceSgogtApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Émet un message officiel — il sera signé (JWS RS256) et chaîné côté
   * serveur avec la clé Transit du fonctionnaire authentifié.
   */
  async send(dto: SendSgogtMessageDto): Promise<MessageView> {
    return this.http.request<MessageView>({
      method: 'POST',
      path: '/api/v1/sgogt/messages',
      body: dto,
      schema: MessageViewSchema,
    });
  }

  /**
   * Boîte de réception du fonctionnaire connecté (anti-IDOR côté serveur :
   * seuls SES messages sont renvoyés).
   *
   * @param params - Pagination (`page` défaut 1, `pageSize` défaut 50).
   */
  async inbox(params: SgogtInboxParams = {}): Promise<MessageView[]> {
    return this.http.request<MessageView[]>({
      method: 'GET',
      path: '/api/v1/sgogt/messages',
      query: params,
      schema: InboxSchema,
    });
  }

  /** Vérifie la signature + cohérence claims↔colonnes d'un message. */
  async verify(id: string): Promise<SgogtVerifyResult> {
    return this.http.request<SgogtVerifyResult>({
      method: 'GET',
      path: `/api/v1/sgogt/messages/${encodeURIComponent(id)}/verify`,
      schema: SgogtVerifyResultSchema,
    });
  }

  /**
   * Accuse réception d'un message (ACK **signé par le lecteur** côté serveur —
   * non-répudiation de lecture). Pose `readAt` et passe le statut à `READ`.
   */
  async ack(id: string): Promise<SgogtAckResult> {
    return this.http.request<SgogtAckResult>({
      method: 'POST',
      path: `/api/v1/sgogt/messages/${encodeURIComponent(id)}/ack`,
      schema: SgogtAckResultSchema,
    });
  }

  /**
   * Répond à un message (clôt la décision) : le serveur crée un NOUVEAU
   * message signé du même fil, adressé à l'émetteur initial.
   *
   * @returns Le message-réponse créé.
   */
  async respond(id: string, dto: RespondSgogtMessageDto): Promise<MessageView> {
    return this.http.request<MessageView>({
      method: 'POST',
      path: `/api/v1/sgogt/messages/${encodeURIComponent(id)}/respond`,
      body: dto,
      schema: MessageViewSchema,
    });
  }
}

/** Sous-client directives Kanban (GOV-02). */
class DirectivesClient implements GovernanceDirectivesApi {
  constructor(private readonly http: HttpClient) {}

  /** Crée une directive (statut initial `DRAFT`). */
  async create(dto: CreateDirectiveDto): Promise<DirectiveView> {
    return this.http.request<DirectiveView>({
      method: 'POST',
      path: '/api/v1/directives',
      body: dto,
      schema: DirectiveViewSchema,
    });
  }

  /**
   * Liste paginée des directives, filtrable par colonne Kanban.
   *
   * @param params - `status` optionnel + pagination (`pageSize` défaut 50).
   */
  async list(params: DirectiveListParams = {}): Promise<DirectiveView[]> {
    return this.http.request<DirectiveView[]>({
      method: 'GET',
      path: '/api/v1/directives',
      query: params,
      schema: DirectiveListSchema,
    });
  }

  /**
   * Applique une transition de cycle de vie (drop Kanban). Le serveur rejette
   * 400 toute transition illégale (cf. `DIRECTIVE_LEGAL_TRANSITIONS`) et 409
   * une transition concurrente déjà appliquée.
   */
  async transition(id: string, dto: TransitionDirectiveDto): Promise<DirectiveView> {
    return this.http.request<DirectiveView>({
      method: 'POST',
      path: `/api/v1/directives/${encodeURIComponent(id)}/transition`,
      body: dto,
      schema: DirectiveViewSchema,
    });
  }
}

/** Façade du domaine gouvernance (`api.governance.sgogt` / `.directives`). */
export class GovernanceClient implements GovernanceApi {
  readonly sgogt: GovernanceSgogtApi;
  readonly directives: GovernanceDirectivesApi;

  constructor(http: HttpClient) {
    this.sgogt = new SgogtClient(http);
    this.directives = new DirectivesClient(http);
  }
}
