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
   * Crée un rendez-vous pour le citoyen AUTHENTIFIÉ (self-service, status initial
   * `SCHEDULED`) via `POST /api/v1/appointments/me`. Le `citizenId` n'est jamais
   * envoyé : le backend le dérive du NINA porté par le token (anti-IDOR), à
   * l'image de `POST /corrections`. Ne relâche donc PAS ADR-028 (le citoyen ne
   * peut agir que pour lui-même).
   *
   * ⚠️ Le portail ne câble ce bouton en mode **live** qu'une fois la couture de
   * jetons réconciliée (aujourd'hui le login web est émis par Keycloak, mais la
   * gateway/appointment-service vérifient le JWKS d'auth-service) — cf. scope
   * booking-live. En attendant, l'écran PC-04 reste en démo (mock).
   */
  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    return this.http.request<Appointment>({
      method: 'POST',
      path: '/api/v1/appointments/me',
      body: dto,
      schema: AppointmentSchema,
      idempotencyKey: `appt-${dto.centerId}-${dto.slot}`,
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
