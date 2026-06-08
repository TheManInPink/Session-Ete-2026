/**
 * @file        centers.service.ts
 * @description Logique métier des centres : projection des lignes Prisma vers
 *              les formes publiques, filtres (région, cercle, services, ouvert
 *              maintenant, recherche géographique par rayon) et calcul des
 *              disponibilités (créneaux STANDARD/PRIORITAIRE) sur un intervalle.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { haversineKm } from '../common/geo.util.js';
import {
  classifyKind as classifySlotKind,
  computeDayAvailability,
  isOpenAt,
} from './slots.util.js';
import { hhmmToMinutes, startOfUtcDay, utcDateKey, utcMinutesOfDay } from '../common/time.util.js';
import { CentersRepository, type CenterRow } from './centers.repository.js';
import type {
  CenterDetail,
  CenterSlotConfig,
  CenterSummary,
  DayAvailability,
  DayOccupancy,
  OpeningHours,
  SlotKind,
} from './center.types.js';

/** Filtres de la liste des centres. */
export interface ListCentersFilter {
  regionCode?: string;
  cercleCode?: string;
  service?: string;
  openNow?: boolean;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

/** Critères de suggestion de centre le plus proche disponible. */
export interface SuggestFilter {
  lat: number;
  lng: number;
  from?: string;
  to?: string;
  priority?: boolean;
  service?: string;
}

/** Une suggestion : centre + premier créneau disponible + distance. */
export interface CenterSuggestion {
  center: CenterSummary;
  firstSlot: string;
  date: string;
  kind: SlotKind;
  distanceKm: number;
}

@Injectable()
export class CentersService {
  private readonly horizonDays: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly repo: CentersRepository,
  ) {
    this.horizonDays = cfg.get('APPOINTMENT_BOOKING_HORIZON_DAYS', { infer: true });
  }

  /** Liste les centres actifs avec filtres optionnels. */
  async listCenters(filter: ListCentersFilter, now: Date = new Date()): Promise<CenterSummary[]> {
    const rows = await this.repo.findActiveCenters();
    const names = await this.resolveLocationNames(rows);

    let centers = rows.map((r) => this.toSummary(r, names, now));

    if (filter.regionCode) {
      centers = centers.filter((c) => c.locationCode?.startsWith(filter.regionCode!));
    }
    if (filter.cercleCode) {
      centers = centers.filter((c) => c.locationCode?.startsWith(filter.cercleCode!));
    }
    if (filter.service) {
      const svc = filter.service.toUpperCase();
      centers = centers.filter((c) => c.servicesOffered.includes(svc));
    }
    if (filter.openNow) {
      centers = centers.filter((c) => c.openNow);
    }

    // Recherche géographique : distance + (filtre rayon) + tri par proximité.
    if (filter.lat !== undefined && filter.lng !== undefined) {
      const { lat, lng } = filter;
      centers = centers.map((c) => ({
        ...c,
        distanceKm: round1(haversineKm(lat, lng, c.latitude, c.longitude)),
      }));
      if (filter.radiusKm !== undefined) {
        centers = centers.filter((c) => (c.distanceKm ?? Infinity) <= filter.radiusKm!);
      }
      centers.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return centers;
  }

  /** Détail d'un centre par son `centerId` (= institutionId). */
  async getCenter(centerId: string, now: Date = new Date()): Promise<CenterDetail> {
    const row = await this.requireCenter(centerId);
    const names = await this.resolveLocationNames([row]);
    return this.toDetail(row, names, now);
  }

  /**
   * Disponibilités d'un centre sur un intervalle de dates [from, to].
   *
   * @param centerId UUID de l'institution.
   * @param fromStr  Date ISO (YYYY-MM-DD) de début ; défaut = aujourd'hui.
   * @param toStr    Date ISO de fin ; défaut = from + 7 jours.
   */
  async getAvailability(
    centerId: string,
    fromStr?: string,
    toStr?: string,
    now: Date = new Date(),
  ): Promise<{ centerId: string; days: DayAvailability[] }> {
    const row = await this.requireCenter(centerId);
    const config = this.toSlotConfig(row);

    const today = startOfUtcDay(now);
    const from = fromStr ? startOfUtcDay(new Date(`${fromStr}T00:00:00Z`)) : today;
    if (Number.isNaN(from.getTime())) throw new BadRequestException('Paramètre "from" invalide');

    const defaultTo = new Date(from.getTime() + 7 * 86_400_000);
    const to = toStr ? startOfUtcDay(new Date(`${toStr}T00:00:00Z`)) : defaultTo;
    if (Number.isNaN(to.getTime())) throw new BadRequestException('Paramètre "to" invalide');

    if (to < from) throw new BadRequestException('"to" doit être postérieur ou égal à "from"');
    const horizon = new Date(today.getTime() + this.horizonDays * 86_400_000);
    if (from < today) throw new BadRequestException('"from" ne peut pas être dans le passé');
    if (to > horizon) {
      throw new BadRequestException(`Intervalle au-delà de l'horizon (${this.horizonDays} jours)`);
    }

    // Une seule requête pour tout l'intervalle, puis agrégation par jour.
    const end = new Date(to.getTime() + 86_400_000); // borne haute exclue = lendemain du dernier jour
    const schedules = await this.repo.findActiveSchedules(centerId, from, end);
    const byDay = this.occupancyByDay(schedules, config);

    const days: DayAvailability[] = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
      const occ = byDay.get(utcDateKey(d)) ?? emptyOccupancy();
      days.push(computeDayAvailability(config, new Date(d), occ));
    }
    return { centerId, days };
  }

  /**
   * Suggère le centre le plus proche disposant d'un créneau disponible (de la
   * nature demandée) dans l'intervalle. Renvoie une liste classée par distance.
   */
  async suggest(filter: SuggestFilter, now: Date = new Date()): Promise<CenterSuggestion[]> {
    const rows = await this.repo.findActiveCenters();
    const names = await this.resolveLocationNames(rows);
    const wantKind: SlotKind = filter.priority ? 'PRIORITY' : 'STANDARD';

    // Pré-filtre service + tri par distance pour limiter les calculs.
    const ranked = rows
      .map((r) => ({
        r,
        summary: this.toSummary(r, names, now),
        distanceKm: round1(
          haversineKm(filter.lat, filter.lng, Number(r.latitude), Number(r.longitude)),
        ),
      }))
      .filter(({ r }) =>
        filter.service
          ? r.servicesOffered.map((s) => s.toUpperCase()).includes(filter.service!.toUpperCase())
          : true,
      )
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const suggestions: CenterSuggestion[] = [];
    for (const { r, summary, distanceKm } of ranked) {
      const { days } = await this.getAvailability(r.institutionId, filter.from, filter.to, now);
      const found = days
        .flatMap((day) => day.slots.map((slot) => ({ date: day.date, slot })))
        .find((x) => x.slot.kind === wantKind && x.slot.remaining > 0);
      if (found) {
        suggestions.push({
          center: { ...summary, distanceKm },
          firstSlot: found.slot.start,
          date: found.date,
          kind: wantKind,
          distanceKm,
        });
      }
      if (suggestions.length >= 3) break; // 3 alternatives suffisent
    }
    return suggestions;
  }

  // ── Helpers projection ────────────────────────────────────────────────

  /** Charge le centre ou lève 404. */
  private async requireCenter(centerId: string): Promise<CenterRow> {
    const row = await this.repo.findByInstitutionId(centerId);
    if (!row) throw new NotFoundException('Centre introuvable');
    return row;
  }

  /** Construit la config de créneaux (sous-ensemble pur) depuis une ligne. */
  private toSlotConfig(row: CenterRow): CenterSlotConfig {
    return {
      slotDurationMin: row.slotDurationMin,
      parallelDesks: row.parallelDesks,
      capacityPerDay: row.capacityPerDay,
      standardQuota: row.standardQuota,
      priorityQuota: row.priorityQuota,
      priorityFromMin: hhmmToMinutes(row.priorityFrom),
      priorityToMin: hhmmToMinutes(row.priorityTo),
      openingHours: (row.openingHours ?? {}) as OpeningHours,
    };
  }

  /** Collecte + résout les noms de région/cercle pour un lot de centres. */
  private async resolveLocationNames(rows: CenterRow[]): Promise<Map<string, string>> {
    const codes = new Set<string>();
    for (const r of rows) {
      const lc = r.institution.location?.code;
      if (!lc) continue;
      const region = regionCodeOf(lc);
      const cercle = cercleCodeOf(lc);
      if (region) codes.add(region);
      if (cercle) codes.add(cercle);
    }
    return this.repo.findLocationNames([...codes]);
  }

  /** Projette une ligne en résumé public. */
  private toSummary(row: CenterRow, names: Map<string, string>, now: Date): CenterSummary {
    const inst = row.institution;
    const locationCode = inst.location?.code ?? null;
    const regionCode = locationCode ? regionCodeOf(locationCode) : null;
    const cercleCode = locationCode ? cercleCodeOf(locationCode) : null;
    return {
      id: inst.id,
      code: inst.code,
      name: inst.name,
      type: inst.type,
      address: inst.address,
      phoneNumber: inst.phoneNumber,
      locationCode,
      regionCode,
      regionName: regionCode ? (names.get(regionCode) ?? null) : null,
      cercleCode,
      cercleName: cercleCode ? (names.get(cercleCode) ?? null) : null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      servicesOffered: row.servicesOffered,
      isActive: row.isActive,
      openNow: isOpenAt((row.openingHours ?? {}) as OpeningHours, now),
    };
  }

  /** Projette une ligne en détail public. */
  private toDetail(row: CenterRow, names: Map<string, string>, now: Date): CenterDetail {
    return {
      ...this.toSummary(row, names, now),
      capacityPerDay: row.capacityPerDay,
      slotDurationMin: row.slotDurationMin,
      parallelDesks: row.parallelDesks,
      standardQuota: row.standardQuota,
      priorityQuota: row.priorityQuota,
      priorityWindow: { from: row.priorityFrom, to: row.priorityTo },
      openingHours: (row.openingHours ?? {}) as OpeningHours,
      timezone: row.timezone,
    };
  }

  /** Agrège les heures de RDV en occupation par jour (perSlot + comptes/nature). */
  private occupancyByDay(
    schedules: { scheduledAt: Date }[],
    config: CenterSlotConfig,
  ): Map<string, DayOccupancy> {
    const byDay = new Map<string, DayOccupancy>();
    for (const { scheduledAt } of schedules) {
      const key = utcDateKey(scheduledAt);
      let occ = byDay.get(key);
      if (!occ) {
        occ = emptyOccupancy();
        byDay.set(key, occ);
      }
      const iso = scheduledAt.toISOString();
      occ.perSlot.set(iso, (occ.perSlot.get(iso) ?? 0) + 1);
      occ.total += 1;
      const kind = classifySlotKind(
        utcMinutesOfDay(scheduledAt),
        config.priorityFromMin,
        config.priorityToMin,
      );
      if (kind === 'PRIORITY') occ.priorityCount += 1;
      else occ.standardCount += 1;
    }
    return byDay;
  }
}

/** Occupation vide. */
function emptyOccupancy(): DayOccupancy {
  return { perSlot: new Map(), standardCount: 0, priorityCount: 0, total: 0 };
}

/** Code région = 2 premiers segments du code administratif (ex. ML-02). */
function regionCodeOf(code: string): string | null {
  const seg = code.split('-');
  return seg.length >= 2 ? seg.slice(0, 2).join('-') : null;
}

/** Code cercle = 3 premiers segments (ex. ML-02-04), si présents. */
function cercleCodeOf(code: string): string | null {
  const seg = code.split('-');
  return seg.length >= 3 ? seg.slice(0, 3).join('-') : null;
}

/** Arrondi à 1 décimale. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
