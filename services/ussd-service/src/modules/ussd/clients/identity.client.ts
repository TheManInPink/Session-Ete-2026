/**
 * @file        identity.client.ts
 * @description Client HTTP minimal vers `identity-service` pour le lookup
 *              NINA → fiche citoyen (doc 14 §4.5).
 *
 *              POURQUOI un client dédié plutôt que de dupliquer la logique :
 *              le binding phone↔NINA (anti-énumération) exige de connaître le
 *              `phoneNumber` officiel enregistré pour un NINA. Cette donnée est
 *              la propriété de `identity-service` ; on la consulte via son API
 *              REST `GET /api/v1/citizens/:nina` (cf. citizen.controller.ts),
 *              SANS réimplémenter la validation ni le modèle de données.
 *
 *              SÉCURITÉ DE LA CHAÎNE : la route identity est AUTHENTIFIÉE
 *              (JwtAuthGuard + ownership). L'appel inter-service présente donc
 *              un jeton de service (`USSD_IDENTITY_SERVICE_TOKEN`, injecté via
 *              Vault) en `Authorization: Bearer`. Le binding phone↔NINA est
 *              ensuite appliqué CÔTÉ ussd-service (handler de consultation),
 *              jamais délégué à l'identité du caller USSD.
 *
 *              DÉGRADATION DOUCE : tout échec réseau / HTTP renvoie `null`
 *              (citoyen « introuvable ») ; on ne propage jamais une stack au
 *              webhook (l'opérateur fermerait la session).
 *
 *              ⏳ ÉTAT (MVP) : si aucun `IDENTITY_SERVICE_URL` n'est joignable,
 *              le lookup renvoie `null` et le parcours retombe sur « introuvable ».
 *
 * @module      ussd-service/ussd/clients
 */

import { Injectable } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import { maskNina } from '@nina-aes/logger';
import type { StructuredLogger } from '@nina-aes/logger';

/** Sous-ensemble de la fiche citoyen utile aux parcours USSD. */
export interface CitizenSummary {
  id: string;
  nina: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  /** Numéro officiel enregistré — clé du binding phone↔NINA. */
  phoneNumber: string | null;
  /** Langue préférée (code ISO court, ex. `FR`, `BM`). */
  preferredLanguage?: string;
  /** Catégorie de vulnérabilité (déclenche la file prioritaire). */
  vulnerabilityCategory?: string | null;
  /** Commune de résidence (résumé fiche). */
  residenceCode?: string | null;
}

@Injectable()
export class IdentityClient {
  private readonly http: AxiosInstance;

  constructor(@InjectLogger() private readonly logger: StructuredLogger) {
    const baseURL =
      process.env.IDENTITY_SERVICE_URL ??
      `http://localhost:${process.env.IDENTITY_SERVICE_PORT ?? 3001}`;
    // Jeton de service inter-microservices (Vault) — la route identity est
    // protégée par JWT. Absent en dev local : l'appel échouera proprement (401)
    // et le client dégradera en `null`.
    const serviceToken = process.env.USSD_IDENTITY_SERVICE_TOKEN ?? '';

    this.http = axios.create({
      baseURL,
      timeout: 2_000, // budget USSD serré (cible UX < 500 ms, marge réseau).
      headers: serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {},
    });
  }

  /**
   * Récupère la fiche citoyen par NINA. Renvoie `null` si introuvable ou en cas
   * d'erreur (dégradation douce — jamais d'exception propagée au webhook).
   *
   * @param nina - NINA normalisé (15 caractères).
   * @returns La fiche résumée, ou `null`.
   */
  async getByNina(nina: string): Promise<CitizenSummary | null> {
    try {
      const { data } = await this.http.get<Record<string, unknown>>(
        `/api/v1/citizens/${encodeURIComponent(nina)}`,
      );
      return this.toSummary(data);
    } catch (err) {
      // On NE log NI le NINA en clair NI le payload ; seulement le NINA masqué.
      this.logger.warn(
        { ninaMasked: maskNina(nina), err: errMessage(err) },
        'Lookup identity échoué — dégradation en introuvable',
      );
      return null;
    }
  }

  /** Projette la réponse identity (laxe) vers le résumé typé USSD. */
  private toSummary(data: Record<string, unknown>): CitizenSummary | null {
    const id = typeof data.id === 'string' ? data.id : undefined;
    const nina = typeof data.nina === 'string' ? data.nina : undefined;
    if (!id || !nina) return null;
    return {
      id,
      nina,
      firstName: asString(data.firstName),
      lastName: asString(data.lastName),
      birthDate: asString(data.birthDate),
      phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : null,
      preferredLanguage:
        typeof data.preferredLanguage === 'string' ? data.preferredLanguage : undefined,
      vulnerabilityCategory:
        typeof data.vulnerabilityCategory === 'string' ? data.vulnerabilityCategory : null,
      residenceCode: typeof data.residenceCode === 'string' ? data.residenceCode : null,
    };
  }
}

/** Coercition sûre vers string (valeurs absentes → chaîne vide). */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Message d'erreur compact, sans fuite de détails sensibles. */
function errMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return `HTTP ${err.response?.status ?? 'network'}`;
  return err instanceof Error ? err.name : 'unknown';
}
