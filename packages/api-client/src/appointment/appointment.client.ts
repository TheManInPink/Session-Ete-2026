/**
 * @file        appointment.client.ts
 * @description Client typé pour `appointment-service` (port 3008).
 * @module      @nina-aes/api-client
 */

import type { HttpClient } from '../core/http-client';
import type { AppointmentApi, AvailabilityQuery, CentersQuery } from '../core/client.types';
import {
  AppointmentListSchema,
  AppointmentSchema,
  CenterAvailabilitySchema,
  CentersListSchema,
  type Appointment,
  type AppointmentList,
  type CenterAvailability,
  type CenterSummary,
  type CreateAppointmentDto,
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
   * Disponibilités d'un centre sur une fenêtre de dates : créneaux STANDARD /
   * PRIORITAIRE par jour, avec le nombre de places réellement restantes. Public
   * côté backend (`GET /api/v1/centers/:id/availability`, lecture seule). La
   * fenêtre `[fromDate, toDate]` doit rester dans l'horizon serveur
   * (`APPOINTMENT_BOOKING_HORIZON_DAYS`, 30 j par défaut), sinon le backend
   * renvoie 400.
   */
  async getAvailability(params: AvailabilityQuery): Promise<CenterAvailability> {
    const { centerId, fromDate, toDate } = params;
    return this.http.request<CenterAvailability>({
      method: 'GET',
      path: `/api/v1/centers/${encodeURIComponent(centerId)}/availability`,
      query: { from: fromDate, to: toDate },
      schema: CenterAvailabilitySchema,
    });
  }

  /**
   * Crée un rendez-vous (status initial : `SCHEDULED`).
   *
   * ⚠️ Réservé côté backend au personnel / portail de confiance
   * (`POST /api/v1/appointments`, rôles AGENT/SUPERVISOR/ADMIN — le rôle CITIZEN
   * est **volontairement exclu**, cf. ADR-028 : pas encore de liaison forte
   * `JWT.sub ↔ Citizen.id`). L'ouverture de la réservation en self-service
   * citoyen fait l'objet d'un chantier dédié (BFF médié résolvant l'identité
   * côté serveur).
   */
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
