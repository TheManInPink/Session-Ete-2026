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
  type CorrectionList,
  type CorrectionRequest,
  type CreateCorrectionDto,
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
  AnonymousAlertReceiptSchema,
  AnonymousAlertStatusSchema,
  type AnonymousAlertDto,
  type AnonymousAlertReceipt,
  type AnonymousAlertStatus,
} from '../sigac/sigac.schema';
import type {
  ApiClient,
  CorrectionListParams,
  IdentitySearchParams,
  SlotsQuery,
} from '../core/client.types';

// ── Helpers déterministes ─────────────────────────────────────────────────────

/** Hash FNV-1a 32 bits → graine reproductible. */
function seedOf(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

/** UUID v4 **déterministe** (valide RFC 4122) dérivé d'une graine textuelle. */
function uuidFrom(seedText: string): string {
  let state = seedOf(seedText);
  const nibble = (): string => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state & 0xf).toString(16);
  };
  let h = '';
  for (let i = 0; i < 32; i++) h += nibble();
  // Variant (1 nibble dans {8,9,a,b}) imposé à la 17e position.
  const variant = ((parseInt(h.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Horodatage fixe (pas de `Date.now()` → reproductible). */
const FIXED_NOW = '2026-06-01T09:00:00.000Z';

/** NINA mock par défaut (Fatoumata Diallo, lettre de contrôle V valide). */
const DEFAULT_MOCK_NINA = '18903102015042V';

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

/** Construit une demande de correction valide (statut paramétrable). */
function buildCorrection(
  nina: string,
  overrides: Partial<CorrectionRequest> & Pick<CorrectionRequest, 'field' | 'proposedValue'>,
): CorrectionRequest {
  const seedText = `${nina}-${overrides.field}-${overrides.proposedValue}`;
  const candidate: CorrectionRequest = {
    id: uuidFrom(`corr-${seedText}`),
    citizenId: uuidFrom(`citizen-${nina}`),
    nina,
    field: overrides.field,
    currentValue: overrides.currentValue ?? '—',
    proposedValue: overrides.proposedValue,
    reason: overrides.reason ?? 'Justification fournie par le citoyen.',
    justificationDocUrl: overrides.justificationDocUrl ?? null,
    aiScore: overrides.aiScore ?? null,
    aiVerdict: overrides.aiVerdict ?? null,
    status: overrides.status ?? 'UNDER_REVIEW',
    reviewedBy: overrides.reviewedBy ?? null,
    decidedAt: overrides.decidedAt ?? null,
    decisionReason: overrides.decisionReason ?? null,
    createdAt: overrides.createdAt ?? FIXED_NOW,
    updatedAt: overrides.updatedAt ?? FIXED_NOW,
  };
  return CorrectionRequestSchema.parse(candidate);
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

// ── Fabrique du client mock ───────────────────────────────────────────────────

/**
 * Crée un {@link ApiClient} **mock** (fixtures déterministes, zéro réseau).
 *
 * @example
 * const api = createMockApiClient();
 * const citizen = await api.identity.getByNina('18903102015042V');
 */
export function createMockApiClient(): ApiClient {
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
      async list(params: CorrectionListParams = {}): Promise<CorrectionList> {
        const nina = params.nina ?? DEFAULT_MOCK_NINA;
        const all: CorrectionRequest[] = [
          buildCorrection(nina, {
            field: 'birthPlace',
            proposedValue: 'Sikasso',
            status: 'UNDER_REVIEW',
            aiScore: 87,
            aiVerdict: 'HIGH',
            createdAt: '2026-05-10T10:00:00.000Z',
          }),
          buildCorrection(nina, {
            field: 'profession',
            proposedValue: 'Couturière',
            status: 'APPROVED',
            aiScore: 95,
            aiVerdict: 'HIGH',
            createdAt: '2026-04-22T10:00:00.000Z',
            decidedAt: '2026-04-25T14:30:00.000Z',
          }),
        ];
        const items = params.status ? all.filter((c) => c.status === params.status) : all;
        const candidate: CorrectionList = {
          items,
          total: items.length,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 20,
        };
        return CorrectionListSchema.parse(candidate);
      },
      async getById(id: string): Promise<CorrectionRequest> {
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
        return buildCorrection(DEFAULT_MOCK_NINA, {
          field: 'birthPlace',
          proposedValue: 'Sikasso',
          status: 'CANCELLED',
          id,
        });
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
      async submit(dto: AnonymousAlertDto): Promise<AnonymousAlertReceipt> {
        const seedText = `${dto.category}-${dto.description.slice(0, 32)}`;
        const candidate: AnonymousAlertReceipt = {
          trackingToken: `vault:v3:${uuidFrom(seedText).replace(/-/g, '')}`,
          alertId: uuidFrom(`alert-${seedText}`),
          estimatedSeverity: 'MEDIUM',
          classifiedCategory: dto.category,
          createdAt: FIXED_NOW,
        };
        return AnonymousAlertReceiptSchema.parse(candidate);
      },
      async getStatus(trackingToken: string): Promise<AnonymousAlertStatus> {
        const candidate: AnonymousAlertStatus = {
          trackingToken,
          status: 'RECEIVED',
          publicNotes: [],
        };
        return AnonymousAlertStatusSchema.parse(candidate);
      },
    },
  };
}
