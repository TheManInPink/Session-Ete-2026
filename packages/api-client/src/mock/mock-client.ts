/**
 * @file        mock-client.ts
 * @description Implémentation **mock** de {@link ApiClient}.
 *
 *              Renvoie des fixtures **déterministes** (le même argument produit
 *              toujours la même réponse → captures rejouables) tout en passant
 *              par **les mêmes schémas Zod** que le client réel. Conséquence
 *              sécurité/qualité : les données mock ne peuvent pas « dériver » de
 *              la forme réelle sans faire échouer le `.parse()` — fail-closed,
 *              y compris en démo.
 *
 *              Les domaines corrections (vue agent AD-02) et gouvernance
 *              (GOV-01/GOV-02) sont **stateful en mémoire** : chaque instance
 *              (`createMockApiClient()`) part d'un état initial déterministe et
 *              les mutations (approve/reject, ack/respond, transition) mutent
 *              cet état pour que l'UI reflète la décision pendant la session.
 *
 *              Aucune E/S réseau : utilisable hors-ligne, sans backend, sans
 *              cookie — idéal pour les tests e2e et les démos sans `docker:up`.
 *
 * @module      @nina-aes/api-client
 */

import { generateDemoCitizen } from '../identity/demo-citizen';
import { CitizenResponseSchema, CitizenSearchResultSchema } from '../identity/identity.client';
import type { Citizen, CitizenSearchResult } from '../identity/identity.client';
import {
  CorrectionListSchema,
  CorrectionRequestSchema,
  RejectCorrectionDtoSchema,
  type CorrectionList,
  type CorrectionRequest,
  type CreateCorrectionDto,
  type RejectCorrectionDto,
} from '../correction/correction.schema';
import {
  AppointmentListSchema,
  AppointmentSchema,
  SlotsListSchema,
  type Appointment,
  type AppointmentList,
  type CreateAppointmentDto,
  type SlotsList,
} from '../appointment/appointment.schema';
import {
  SigacPublicKeySchema,
  SealedReportRequestSchema,
  SealedReportReceiptSchema,
  WhistleblowerStatusResponseSchema,
  WhistleblowerQueueSchema,
  type SigacPublicKey,
  type SealedReportRequest,
  type SealedReportReceipt,
  type WhistleblowerStatusResponse,
  type WhistleblowerQueue,
} from '../sigac/sigac.schema';
import {
  CreateDirectiveDtoSchema,
  DirectiveViewSchema,
  MessageViewSchema,
  RespondSgogtMessageDtoSchema,
  SendSgogtMessageDtoSchema,
  SgogtAckResultSchema,
  SgogtVerifyResultSchema,
  TransitionDirectiveDtoSchema,
  isDirectiveTransitionAllowed,
  type CreateDirectiveDto,
  type DirectiveView,
  type MessageView,
  type RespondSgogtMessageDto,
  type SendSgogtMessageDto,
  type SgogtAckResult,
  type SgogtVerifyResult,
  type TransitionDirectiveDto,
} from '../governance/governance.schema';
import { type AdminDashboardStats } from '../admin-dashboard/admin-dashboard.schema';
import type {
  ApiClient,
  CorrectionListParams,
  DirectiveListParams,
  IdentitySearchParams,
  SgogtInboxParams,
  SlotsQuery,
} from '../core/client.types';
import { ApiError } from '../core/errors';
import { FIXED_NOW, hexFrom, isoHoursFrom, seedOf, uuidFrom } from './deterministic';
import { DEFAULT_MOCK_NINA, MOCK_ADMIN_REVIEWER_ID, MOCK_GOVERNANCE_USER_ID } from './personas';
import { buildCorrection, buildCorrectionStore } from './corrections.fixtures';
import { buildDirectiveStore, buildSgogtInbox, fakeJws } from './governance.fixtures';
import { buildMockAdminDashboardStats } from './admin-dashboard.fixtures';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Erreur HTTP simulée (même taxonomie `ApiError` que le client réel). */
function mockApiError(status: 400 | 403 | 404, code: string, message: string): ApiError {
  const statusText = status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : 'Bad Request';
  return new ApiError({
    status,
    statusText,
    payload: { code, message },
    correlationId: 'mock',
  });
}

/** Tri déterministe `createdAt` décroissant (départage par id). */
function byCreatedAtDesc<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id.localeCompare(b.id);
}

/** Découpe une page (page 1-indexée). */
function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

/** Construit une localisation (locationSchema) non vide à partir de noms. */
function buildLocation(seedText: string, regionName: string, cercle: string, commune: string) {
  return {
    id: uuidFrom(`loc-${seedText}`),
    countryCode: 'MLI',
    pays: 'Mali',
    région: regionName,
    cercle: cercle || regionName,
    commune: commune || regionName,
    quartier: 'Centre',
    fraction: 'Fraction 1',
    village: regionName,
    hameau: 'Hameau 1',
  };
}

/** Construit un `Citizen` complet et valide à partir d'un profil démo. */
function buildCitizen(nina: string): Citizen {
  const d = generateDemoCitizen(nina);
  const candidate = {
    nina: d.nina,
    firstName: d.firstName,
    lastName: d.lastName,
    sex: d.sex,
    birthDate: `${d.birthYear}-${d.birthMonth}-15`,
    birthPlace: buildLocation(`${d.nina}-bp`, d.regionName, d.cercleCode, d.communeCode),
    residence: buildLocation(`${d.nina}-res`, d.regionName, d.cercleCode, d.communeCode),
    maritalStatus: d.maritalStatus,
    profession: d.profession,
    parents: [
      { relation: 'FATHER' as const, firstName: d.father.firstName, lastName: d.father.lastName },
      { relation: 'MOTHER' as const, firstName: d.mother.firstName, lastName: d.mother.lastName },
    ],
    id: uuidFrom(`citizen-${d.nina}`),
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  // Fail-closed : même en mock on valide la forme renvoyée.
  return CitizenResponseSchema.parse(candidate);
}

/** Construit un rendez-vous valide. */
function buildAppointment(
  centerId: string,
  scheduledAt: string,
  overrides: Partial<Appointment> = {},
): Appointment {
  const seed = seedOf(`${centerId}-${scheduledAt}`);
  const candidate: Appointment = {
    id: overrides.id ?? uuidFrom(`appt-${centerId}-${scheduledAt}`),
    citizenId: overrides.citizenId ?? uuidFrom('citizen-self'),
    centerId,
    centerName: overrides.centerName ?? 'CTDEC Bamako',
    status: overrides.status ?? 'SCHEDULED',
    priority: overrides.priority ?? 'P3',
    queueNumber: overrides.queueNumber ?? (seed % 40) + 1,
    scheduledAt,
    completedAt: overrides.completedAt ?? null,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? FIXED_NOW,
  };
  return AppointmentSchema.parse(candidate);
}

/**
 * Token de suivi anonyme ALÉATOIRE (mock) — 16 octets URL-safe base64, à
 * l'image de `secrets.token_urlsafe(16)` du backend. Imprévisible par
 * construction : un token de lanceur d'alerte ne doit JAMAIS être déterministe.
 */
function randomTrackingToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** File procureur SIGAC : 6 signalements scellés (buckets + jour seulement). */
function buildWhistleblowerQueue(): WhistleblowerQueue {
  const reports = [
    [
      'wb-report-1',
      'FINANCIAL_OR_POWER',
      'HIGH_CRIT',
      '2026-05-30',
      'RECEIVED',
      'SEALED_BOX_X25519',
      'proc-x25519-v1',
    ],
    [
      'wb-report-2',
      'FINANCIAL_OR_POWER',
      'LOW_MED',
      '2026-05-29',
      'ACKNOWLEDGED',
      'SEALED_BOX_X25519',
      'proc-x25519-v1',
    ],
    [
      'wb-report-3',
      'FRAUD_OR_LEAK',
      'HIGH_CRIT',
      '2026-05-28',
      'UNDER_INVESTIGATION',
      'SEALED_BOX_X25519',
      'proc-x25519-v1',
    ],
    [
      'wb-report-4',
      'FRAUD_OR_LEAK',
      'LOW_MED',
      '2026-05-25',
      'CLOSED_UNFOUNDED',
      'RSA_OAEP_4096',
      'proc-rsa-v1',
    ],
    [
      'wb-report-5',
      'OTHER_BUCKET',
      'LOW_MED',
      '2026-05-27',
      'RECEIVED',
      'SEALED_BOX_X25519',
      'proc-x25519-v1',
    ],
    [
      'wb-report-6',
      'OTHER_BUCKET',
      'HIGH_CRIT',
      '2026-05-31',
      'RECEIVED',
      'SEALED_BOX_X25519',
      'proc-x25519-v1',
    ],
  ] as const;
  return WhistleblowerQueueSchema.parse({
    count: reports.length,
    reports: reports.map(([slug, classification, severity, day, status, scheme, kid]) => ({
      id: uuidFrom(slug),
      classification_bucket: classification,
      severity_bucket: severity,
      received_day: day,
      status,
      scheme,
      cipher_kid: kid,
    })),
  });
}

// ── Fabrique du client mock ───────────────────────────────────────────────────

/**
 * Crée un {@link ApiClient} **mock** (fixtures déterministes, zéro réseau).
 *
 * Chaque instance possède son propre état en mémoire (50 corrections vue
 * agent, inbox SGOGT, Kanban de directives) ; les mutations sont visibles pour
 * la durée de vie de l'instance — un nouveau `createMockApiClient()` repart de
 * l'état initial.
 *
 * @example
 * const api = createMockApiClient();
 * const citizen = await api.identity.getByNina('18903102015042V');
 */
export function createMockApiClient(): ApiClient {
  // État mutable de l'instance (déterministe à la création).
  const correctionStore = buildCorrectionStore();
  const messageStore = buildSgogtInbox();
  const directiveStore = buildDirectiveStore();
  let sentMessageSeq = 0;
  let createdDirectiveSeq = 0;

  /** Retrouve une correction du magasin ou lève un 404 simulé. */
  function requireCorrection(id: string): CorrectionRequest {
    const found = correctionStore.find((c) => c.id === id);
    if (!found) {
      throw mockApiError(404, 'CORRECTION_NOT_FOUND', `Correction ${id} introuvable`);
    }
    return found;
  }

  /** Garde le même invariant que le backend : décision sur UNDER_REVIEW only. */
  function requireUnderReview(correction: CorrectionRequest): void {
    if (correction.status !== 'UNDER_REVIEW') {
      throw mockApiError(
        400,
        'CORRECTION_NOT_UNDER_REVIEW',
        `Correction ${correction.id} pas en état UNDER_REVIEW (état actuel : ${correction.status})`,
      );
    }
  }

  /** Retrouve un message SGOGT ou lève un 404 simulé. */
  function requireMessage(id: string): MessageView {
    const found = messageStore.find((m) => m.id === id);
    if (!found) {
      throw mockApiError(404, 'SGOGT_MESSAGE_NOT_FOUND', 'Message introuvable');
    }
    return found;
  }

  /** Anti-IDOR simulé : seul le destinataire peut acquitter/répondre. */
  function requireRecipient(message: MessageView): void {
    if (message.recipientId !== MOCK_GOVERNANCE_USER_ID) {
      throw mockApiError(403, 'SGOGT_NOT_RECIPIENT', 'SGOGT_NOT_RECIPIENT');
    }
  }

  return {
    identity: {
      async getByNina(nina: string): Promise<Citizen> {
        return buildCitizen(nina);
      },
      // L'id UUID ne permet pas de reconstruire un NINA déterministe : on
      // renvoie le citoyen mock par défaut (paramètre volontairement omis —
      // une méthode sans argument satisfait `getById(id: string)`).
      async getById(): Promise<Citizen> {
        return buildCitizen(DEFAULT_MOCK_NINA);
      },
      async search(params: IdentitySearchParams): Promise<CitizenSearchResult> {
        const citizen = buildCitizen(DEFAULT_MOCK_NINA);
        const candidate: CitizenSearchResult = {
          data: params.q ? [citizen] : [],
          pagination: {
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 20,
            totalItems: params.q ? 1 : 0,
            totalPages: params.q ? 1 : 0,
          },
        };
        return CitizenSearchResultSchema.parse(candidate);
      },
    },

    correction: {
      async submit(dto: CreateCorrectionDto): Promise<CorrectionRequest> {
        return buildCorrection(dto.nina, {
          field: dto.field,
          proposedValue: dto.proposedValue,
          reason: dto.reason,
          justificationDocUrl: dto.justificationDocUrl ?? null,
          status: 'UNDER_REVIEW',
        });
      },
      /**
       * Vue citoyenne (`{ nina }`) ET vue agent (sans `nina`) sur le même
       * magasin de 50 demandes : les filtres backend (status/agent/from/to)
       * et la pagination sont appliqués en mémoire.
       */
      async list(params: CorrectionListParams = {}): Promise<CorrectionList> {
        let filtered = correctionStore.filter(
          (c) =>
            (params.nina === undefined || c.nina === params.nina) &&
            (params.status === undefined || c.status === params.status) &&
            (params.agent === undefined || c.reviewedBy === params.agent) &&
            (params.from === undefined || c.createdAt.slice(0, 10) >= params.from.slice(0, 10)) &&
            (params.to === undefined || c.createdAt.slice(0, 10) <= params.to.slice(0, 10)),
        );
        filtered = [...filtered].sort(byCreatedAtDesc);
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;
        return CorrectionListSchema.parse({
          items: paginate(filtered, page, pageSize),
          total: filtered.length,
          page,
          pageSize,
        });
      },
      /**
       * PC-05 — corrections du citoyen AUTHENTIFIÉ (self-scoped). En mock, le
       * « token » est le citoyen canonique (`DEFAULT_MOCK_NINA`) : on filtre le
       * magasin sur SON NINA — équivalent de la route backend `/corrections/me`
       * (NINA dérivé du token), jamais de dossier d'autrui.
       */
      async listMine(): Promise<CorrectionRequest[]> {
        return correctionStore
          .filter((c) => c.nina === DEFAULT_MOCK_NINA)
          .sort(byCreatedAtDesc)
          .map((c) => CorrectionRequestSchema.parse({ ...c }));
      },
      async getById(id: string): Promise<CorrectionRequest> {
        const found = correctionStore.find((c) => c.id === id);
        if (found) return CorrectionRequestSchema.parse({ ...found });
        // Repli historique : fixture déterministe pour tout id inconnu.
        return buildCorrection(DEFAULT_MOCK_NINA, {
          field: 'birthPlace',
          proposedValue: 'Sikasso',
          status: 'UNDER_REVIEW',
          aiScore: 87,
          aiVerdict: 'HIGH',
          id,
        });
      },
      async cancel(id: string): Promise<CorrectionRequest> {
        const found = correctionStore.find((c) => c.id === id);
        if (found) {
          found.status = 'CANCELLED';
          found.updatedAt = FIXED_NOW;
          return CorrectionRequestSchema.parse({ ...found });
        }
        return buildCorrection(DEFAULT_MOCK_NINA, {
          field: 'birthPlace',
          proposedValue: 'Sikasso',
          status: 'CANCELLED',
          id,
        });
      },
      /** AD-02 — mute l'état en mémoire (l'UI reflète la décision). */
      async approve(id: string): Promise<CorrectionRequest> {
        const correction = requireCorrection(id);
        requireUnderReview(correction);
        correction.status = 'APPROVED';
        correction.reviewedBy = MOCK_ADMIN_REVIEWER_ID;
        correction.decidedAt = FIXED_NOW;
        correction.updatedAt = FIXED_NOW;
        return CorrectionRequestSchema.parse({ ...correction });
      },
      /** AD-02 — motif obligatoire (min 20 caractères, comme le backend). */
      async reject(id: string, dto: RejectCorrectionDto): Promise<CorrectionRequest> {
        const parsed = RejectCorrectionDtoSchema.parse(dto);
        const correction = requireCorrection(id);
        requireUnderReview(correction);
        correction.status = 'REJECTED';
        correction.reviewedBy = MOCK_ADMIN_REVIEWER_ID;
        correction.decidedAt = FIXED_NOW;
        correction.decisionReason = parsed.reason;
        correction.updatedAt = FIXED_NOW;
        return CorrectionRequestSchema.parse({ ...correction });
      },
    },

    appointment: {
      async getAvailableSlots(params: SlotsQuery): Promise<SlotsList> {
        const centerId = params.centerId ?? uuidFrom('center-ctdec-bamako');
        // 3 créneaux à partir de `fromDate` (déterministe, sans `new Date()`).
        const candidate: SlotsList = {
          slots: ['09:00', '10:00', '11:00'].map((time, i) => ({
            startsAt: `${params.fromDate}T${time}:00.000Z`,
            centerId,
            centerName: 'CTDEC Bamako',
            priority: 'P3' as const,
            queueNumber: i + 1,
          })),
        };
        return SlotsListSchema.parse(candidate);
      },
      async create(dto: CreateAppointmentDto): Promise<Appointment> {
        return buildAppointment(dto.centerId, dto.scheduledAt, { notes: dto.reason });
      },
      async listMine(): Promise<AppointmentList> {
        const candidate: AppointmentList = {
          items: [
            buildAppointment(uuidFrom('center-ctdec-bamako'), '2026-05-20T09:00:00.000Z', {
              centerName: 'CTDEC Bamako',
              status: 'SCHEDULED',
            }),
          ],
          total: 1,
        };
        return AppointmentListSchema.parse(candidate);
      },
      async cancel(id: string): Promise<Appointment> {
        return buildAppointment(uuidFrom('center-ctdec-bamako'), '2026-05-20T09:00:00.000Z', {
          id,
          status: 'CANCELLED',
        });
      },
    },

    sigac: {
      /**
       * Clé publique procureur (mock) : une clé X25519 VALIDE, pour que le
       * scellement libsodium côté navigateur réussisse réellement en démo (on
       * exerce le vrai chemin crypto). Le mock ne déchiffre jamais.
       */
      async getPublicKey(): Promise<SigacPublicKey> {
        return SigacPublicKeySchema.parse({
          scheme: 'SEALED_BOX_X25519',
          cipher_kid: 'mock-x25519-v1',
          public_key: 'U1nZ3Y0pivh2XDd0Pl7l12PzyxE0f7dg50+Q3d9seWI=',
        });
      },
      /**
       * Dépôt scellé (mock) : valide le contrat d'entrée, ignore le ciphertext
       * et renvoie un reçu à token ALÉATOIRE (un token de suivi doit être
       * imprévisible — jamais dérivé de manière déterministe).
       */
      async submitSealedReport(req: SealedReportRequest): Promise<SealedReportReceipt> {
        SealedReportRequestSchema.parse(req);
        return SealedReportReceiptSchema.parse({
          report_id: req.report_id ?? crypto.randomUUID(),
          tracking_token: randomTrackingToken(),
          status: 'RECEIVED',
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async getReportStatus(_trackingToken: string): Promise<WhistleblowerStatusResponse> {
        return WhistleblowerStatusResponseSchema.parse({ status: 'RECEIVED' });
      },
      /** AD-03 — file procureur (statique : aucune mutation côté client). */
      async getQueue(): Promise<WhistleblowerQueue> {
        return buildWhistleblowerQueue();
      },
    },

    governance: {
      sgogt: {
        /** Le persona mock est TOUJOURS l'émetteur (comme `req.user` en vrai). */
        async send(dto: SendSgogtMessageDto): Promise<MessageView> {
          const parsed = SendSgogtMessageDtoSchema.parse(dto);
          sentMessageSeq += 1;
          const slug = `out-${sentMessageSeq}`;
          const message = MessageViewSchema.parse({
            id: uuidFrom(`sgogt-msg-${slug}`),
            threadId: parsed.threadId ?? uuidFrom(`sgogt-thread-${slug}`),
            senderId: MOCK_GOVERNANCE_USER_ID,
            recipientId: parsed.recipientId,
            subject: parsed.subject,
            body: parsed.body,
            priority: parsed.priority,
            status: 'SENT',
            ttlEscalateAt: isoHoursFrom(FIXED_NOW, parsed.priority === 'CRITICAL' ? 4 : 24),
            escalatedToId: null,
            readAt: null,
            respondedAt: null,
            jwsSignature: fakeJws(`sgogt-msg-${slug}`),
            chainHash: hexFrom(`sgogt-chain-${slug}`, 64),
            createdAt: FIXED_NOW,
          });
          messageStore.push(message);
          return message;
        },
        /** Boîte de réception du persona (les messages émis n'y figurent pas). */
        async inbox(params: SgogtInboxParams = {}): Promise<MessageView[]> {
          const page = Math.max(1, params.page ?? 1);
          const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
          const mine = messageStore
            .filter((m) => m.recipientId === MOCK_GOVERNANCE_USER_ID)
            .sort(byCreatedAtDesc);
          return paginate(mine, page, pageSize).map((m) => MessageViewSchema.parse({ ...m }));
        },
        /** Les fixtures sont réputées intègres → toujours `{ valid: true }`. */
        async verify(id: string): Promise<SgogtVerifyResult> {
          requireMessage(id);
          return SgogtVerifyResultSchema.parse({ valid: true });
        },
        /** Pose `readAt` + statut READ, renvoie un ACK JWS factice plausible. */
        async ack(id: string): Promise<SgogtAckResult> {
          const message = requireMessage(id);
          requireRecipient(message);
          message.readAt = message.readAt ?? FIXED_NOW;
          if (message.status === 'SENT') message.status = 'READ';
          return SgogtAckResultSchema.parse({
            message: { ...message },
            ackJws: fakeJws(`sgogt-ack-${id}`),
          });
        },
        /** Crée la réponse (nouveau message du fil) + clôt l'original. */
        async respond(id: string, dto: RespondSgogtMessageDto): Promise<MessageView> {
          const parsed = RespondSgogtMessageDtoSchema.parse(dto);
          const original = requireMessage(id);
          requireRecipient(original);
          sentMessageSeq += 1;
          const slug = `reply-${sentMessageSeq}`;
          const reply = MessageViewSchema.parse({
            id: uuidFrom(`sgogt-msg-${slug}`),
            threadId: original.threadId,
            senderId: MOCK_GOVERNANCE_USER_ID,
            recipientId: original.senderId,
            subject: `RE: ${original.subject}`.slice(0, 300),
            body: parsed.body,
            priority: original.priority,
            status: 'SENT',
            ttlEscalateAt: isoHoursFrom(FIXED_NOW, original.priority === 'CRITICAL' ? 4 : 24),
            escalatedToId: null,
            readAt: null,
            respondedAt: null,
            jwsSignature: fakeJws(`sgogt-msg-${slug}`),
            chainHash: hexFrom(`sgogt-chain-${slug}`, 64),
            createdAt: FIXED_NOW,
          });
          messageStore.push(reply);
          original.readAt = original.readAt ?? FIXED_NOW;
          original.respondedAt = FIXED_NOW;
          original.status = 'RESPONDED';
          return reply;
        },
      },
      directives: {
        async create(dto: CreateDirectiveDto): Promise<DirectiveView> {
          const parsed = CreateDirectiveDtoSchema.parse(dto);
          createdDirectiveSeq += 1;
          const directive = DirectiveViewSchema.parse({
            id: uuidFrom(`directive-new-${createdDirectiveSeq}`),
            title: parsed.title,
            description: parsed.description,
            status: 'DRAFT',
            priority: parsed.priority,
            createdById: MOCK_GOVERNANCE_USER_ID,
            assigneeId: parsed.assigneeId ?? null,
            // Normalisation UTC comme le backend (`new Date(...).toISOString()`).
            deadline: parsed.deadline ? new Date(parsed.deadline).toISOString() : null,
            escalationLevel: 0,
            rejectionReason: null,
            completedAt: null,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          });
          directiveStore.push(directive);
          return directive;
        },
        async list(params: DirectiveListParams = {}): Promise<DirectiveView[]> {
          const page = Math.max(1, params.page ?? 1);
          const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
          const filtered = directiveStore
            .filter((d) => params.status === undefined || d.status === params.status)
            .sort(byCreatedAtDesc);
          return paginate(filtered, page, pageSize).map((d) => DirectiveViewSchema.parse({ ...d }));
        },
        /**
         * Applique la MÊME machine à états que le serveur
         * (`DIRECTIVE_LEGAL_TRANSITIONS`) — transition illégale ⇒ ApiError 400.
         */
        async transition(id: string, dto: TransitionDirectiveDto): Promise<DirectiveView> {
          const parsed = TransitionDirectiveDtoSchema.parse(dto);
          const directive = directiveStore.find((d) => d.id === id);
          if (!directive) {
            throw mockApiError(404, 'DIRECTIVE_NOT_FOUND', 'Directive introuvable');
          }
          if (!isDirectiveTransitionAllowed(directive.status, parsed.toStatus)) {
            throw mockApiError(
              400,
              'DIRECTIVE_ILLEGAL_TRANSITION',
              `Transition Kanban invalide : ${directive.status} → ${parsed.toStatus}`,
            );
          }
          directive.status = parsed.toStatus;
          if (parsed.assigneeId !== undefined) directive.assigneeId = parsed.assigneeId;
          if (parsed.toStatus === 'COMPLETED') directive.completedAt = FIXED_NOW;
          if (parsed.toStatus === 'REJECTED') directive.rejectionReason = parsed.note ?? null;
          directive.updatedAt = FIXED_NOW;
          return DirectiveViewSchema.parse({ ...directive });
        },
      },
    },

    adminDashboard: {
      /** AD-01/AD-03 — mêmes chiffres que `apps/admin/lib/mock-dashboard.ts`. */
      async getStats(): Promise<AdminDashboardStats> {
        return buildMockAdminDashboardStats();
      },
    },
  };
}

// Constantes mock utiles aux apps (personas / annuaire / fils de discussion).
export {
  DEFAULT_MOCK_NINA,
  MOCK_ADMIN_REVIEWER_ID,
  MOCK_GOVERNANCE_DIRECTORY,
  MOCK_GOVERNANCE_USER_ID,
  MOCK_SECOND_REVIEWER_ID,
  type MockGovernanceOfficial,
} from './personas';
export { MOCK_SGOGT_THREAD_IDS } from './governance.fixtures';
