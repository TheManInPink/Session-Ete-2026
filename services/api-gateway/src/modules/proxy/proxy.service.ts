/**
 * @file        proxy.service.ts
 * @description Service qui forward les requêtes HTTP vers les services aval,
 *              avec circuit breaker Opossum et propagation du correlationId.
 *
 *              POURQUOI CIRCUIT BREAKER : si un service aval devient lent ou
 *              KO, sans protection le gateway accumulerait les requêtes en
 *              timeout et finirait par tomber lui aussi (panne en cascade).
 *              Opossum interrompt le circuit après N échecs sur une fenêtre
 *              temporelle et renvoie immédiatement une 503 jusqu'à ce que le
 *              service aval guérisse (half-open → closed automatique).
 *
 *              UN BREAKER PAR SERVICE (et pas un global) : permet de couper
 *              UNIQUEMENT le service en panne sans pénaliser les autres.
 *
 * @module      api-gateway/proxy
 */

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import CircuitBreaker from 'opossum';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import { getContext } from '@nina-aes/logger';
import type { StructuredLogger } from '@nina-aes/logger';

import type { GatewayRoute } from './proxy.routes.js';

/**
 * Timeout par défaut (ms) — partagé entre le circuit breaker et axios pour
 * garantir que les deux couches déclenchent dans le même ordre de grandeur.
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Options par défaut du circuit breaker (sensées pour le contexte AES, où
 * la latence réseau peut être élevée en zones rurales).
 */
const BREAKER_DEFAULTS: CircuitBreaker.Options = {
  timeout: DEFAULT_TIMEOUT_MS, // dépassé = échec
  errorThresholdPercentage: 50, // 50% d'échecs → open
  resetTimeout: 30000, // 30s avant tentative half-open
  rollingCountTimeout: 10000, // fenêtre de 10s
  rollingCountBuckets: 10,
};

/**
 * Payload normalisé reçu par le proxy depuis le controller.
 */
export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, unknown>;
  /** Identifiant utilisateur extrait du JWT (peut être undefined sur routes publiques). */
  userId?: string;
  userRole?: string;
}

/**
 * Réponse normalisée envoyée au controller.
 */
export interface ProxyResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: unknown;
}

@Injectable()
export class ProxyService {
  /** Map service → breaker. Créé paresseusement à la première requête. */
  private readonly breakers = new Map<
    string,
    CircuitBreaker<[GatewayRoute, ProxyRequest], ProxyResponse>
  >();

  /** Client HTTP réutilisé pour bénéficier du connection pooling. */
  private readonly httpClient: AxiosInstance;

  constructor(@InjectLogger() private readonly logger: StructuredLogger) {
    this.httpClient = axios.create({
      validateStatus: () => true, // on relaie le status tel quel
      maxRedirects: 0, // pas de follow auto — c'est le client final qui décide
    });
  }

  /**
   * Forward une requête vers le service aval indiqué par la route.
   *
   * @param route - Route trouvée par `matchRoute(path)`.
   * @param req - Payload de la requête entrante.
   * @returns Réponse du service aval (status, headers, body).
   *
   * @throws HttpException(503, E_GW_001) si le service aval est indisponible.
   * @throws HttpException(503, E_GW_002) si le circuit est ouvert.
   * @throws HttpException(504, E_GW_TIMEOUT) si timeout dépassé.
   */
  async forward(route: GatewayRoute, req: ProxyRequest): Promise<ProxyResponse> {
    const breaker = this.getBreakerFor(route);
    try {
      return await breaker.fire(route, req);
    } catch (err: unknown) {
      // Opossum encapsule l'erreur dans son enveloppe — on identifie le cas
      // "circuit ouvert" via le message.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Breaker is open')) {
        throw new HttpException(
          {
            code: 'E_GW_002',
            message: 'Service temporairement indisponible (circuit ouvert)',
            details: { service: route.serviceName },
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (message.includes('Timed out')) {
        throw new HttpException(
          {
            code: 'E_GW_TIMEOUT',
            message: 'Service en aval trop lent',
            details: { service: route.serviceName },
          },
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      // Erreur HTTP générique (réseau, DNS, etc.)
      this.logger.error(
        { err, service: route.serviceName, path: req.path },
        'Échec proxy vers service aval',
      );
      throw new HttpException(
        {
          code: 'E_GW_001',
          message: 'Service indisponible',
          details: { service: route.serviceName },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Récupère (ou crée à la volée) le circuit breaker du service.
   */
  private getBreakerFor(
    route: GatewayRoute,
  ): CircuitBreaker<[GatewayRoute, ProxyRequest], ProxyResponse> {
    const existing = this.breakers.get(route.serviceName);
    if (existing) return existing;

    const breaker = new CircuitBreaker<[GatewayRoute, ProxyRequest], ProxyResponse>(
      (r, rq) => this.doForward(r, rq),
      { ...BREAKER_DEFAULTS, timeout: route.timeoutMs ?? BREAKER_DEFAULTS.timeout },
    );

    // Instrumentation : on log les transitions du circuit
    breaker.on('open', () => this.logger.warn({ service: route.serviceName }, 'Circuit OUVERT'));
    breaker.on('halfOpen', () =>
      this.logger.info({ service: route.serviceName }, 'Circuit HALF-OPEN'),
    );
    breaker.on('close', () => this.logger.info({ service: route.serviceName }, 'Circuit FERMÉ'));
    breaker.on('reject', () =>
      this.logger.debug({ service: route.serviceName }, 'Requête rejetée (circuit ouvert)'),
    );

    this.breakers.set(route.serviceName, breaker);
    return breaker;
  }

  /**
   * Exécute l'appel HTTP réel. Cette méthode est wrappée par Opossum.
   *
   * POURQUOI dans une méthode séparée : Opossum a besoin d'une fonction
   * SYNC pour wrapper ; on lui passe une closure qui appelle celle-ci.
   */
  private async doForward(route: GatewayRoute, req: ProxyRequest): Promise<ProxyResponse> {
    const targetUrl = `${route.targetBaseUrl}${req.path}`;
    const ctx = getContext();

    // Headers à propager : on supprime ceux qui ne doivent pas voyager
    // (Authorization sera remplacé par X-User-Context plus tard).
    const forwardedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lk = k.toLowerCase();
      // Ne PAS propager : Host, Connection, Content-Length (axios le recalcule),
      // Authorization (sera remplacé par X-User-Context côté JWT middleware).
      if (['host', 'connection', 'content-length'].includes(lk)) continue;
      if (Array.isArray(v)) forwardedHeaders[k] = v.join(',');
      else if (v !== undefined) forwardedHeaders[k] = v;
    }

    // Propagation du correlationId
    if (ctx?.correlationId) {
      forwardedHeaders['x-request-id'] = ctx.correlationId;
    }
    // Propagation du contexte utilisateur (sera signé JWS dans une version
    // future ; pour le MVP on envoie en clair sur le réseau interne mTLS).
    if (req.userId) {
      forwardedHeaders['x-user-id'] = req.userId;
      if (req.userRole) forwardedHeaders['x-user-role'] = req.userRole;
    }

    const config: AxiosRequestConfig = {
      url: targetUrl,
      method: req.method,
      headers: forwardedHeaders,
      data: req.body,
      params: req.query,
      timeout: route.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    this.logger.debug(
      { service: route.serviceName, method: req.method, path: req.path },
      'Forward vers service aval',
    );

    const response = await this.httpClient.request(config);

    // Normalise les headers (Axios retourne RawAxiosHeaders, on aplatit)
    const responseHeaders: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(response.headers)) {
      if (v !== undefined) responseHeaders[k] = v as string | string[];
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: response.data,
    };
  }
}
