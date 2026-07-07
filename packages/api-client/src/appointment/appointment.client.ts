/**
 * @file        appointment.client.ts
 * @description Client typé pour `appointment-service` (port 3008).
 * @module      @nina-aes/api-client
 */

import type { HttpClient } from '../core/http-client';
import type { AppointmentApi, CentersQuery, SlotsQuery } from '../core/client.types';
import {
  AppointmentListSchema,
  AppointmentSchema,
  CentersListSchema,
  SlotsListSchema,
  type Appointment,
  type AppointmentList,
  type CenterSummary,
  type CreateAppointmentDto,
  type SlotsList,
} from './appointment.schema';

export class AppointmentClient implements AppointmentApi {
  constructor(private readonly http: HttpClient) {}

  /**
   * Liste les centres d'enrôlement (CTDEC / antennes RAVEC), optionnellement
   * filtrés par région (`ML-XX`). Public côté backend (aucun secret).
   */
  async listCenters(params: CentersQuery = {}): Promise<CenterSummary[]> {
    return this.http.request<CenterSummary[]>({
      method: 'GET',
      path: '/api/v1/centers',
      query: params,
      schema: CentersListSchema,
    });
  }

  /**
   * Liste les créneaux disponibles pour une plage de dates et un centre.
   * Si le citoyen est marqué `vulnerable`, le serveur renverra automatiquement
   * les créneaux prioritaires (P1 / P2) en plus des standards.
   */
  async getAvailableSlots(params: SlotsQuery): Promise<SlotsList> {
    return this.http.request<SlotsList>({
      method: 'GET',
      path: '/api/v1/appointments/slots',
      query: params,
      schema: SlotsListSchema,
    });
  }

  /** Crée un rendez-vous (status initial : `SCHEDULED`). */
  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    return this.http.request<Appointment>({
      method: 'POST',
      path: '/api/v1/appointments',
      body: dto,
      schema: AppointmentSchema,
      idempotencyKey: `appt-${dto.centerId}-${dto.scheduledAt}`,
    });
  }

  /** Liste les RDV du citoyen connecté. */
  async listMine(): Promise<AppointmentList> {
    return this.http.request<AppointmentList>({
      method: 'GET',
      path: '/api/v1/appointments/me',
      schema: AppointmentListSchema,
    });
  }

  /** Annule un RDV (uniquement avant `completedAt`). */
  async cancel(id: string): Promise<Appointment> {
    return this.http.request<Appointment>({
      method: 'POST',
      path: `/api/v1/appointments/${encodeURIComponent(id)}/cancel`,
      schema: AppointmentSchema,
    });
  }
}
