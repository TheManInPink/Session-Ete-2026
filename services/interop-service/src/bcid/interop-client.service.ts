/**
 * @file        interop-client.service.ts
 * @description Client SORTANT BCID-AES (doc 21 §7) : ce nœud (Mali) INTERROGE un
 *              partenaire (BFA/NER). Signe la requête en JWS Ed25519, l'envoie en
 *              mTLS (le cert client Mali est présenté par l'ingress sortant /
 *              sidecar), puis VÉRIFIE le JWS de réponse du partenaire.
 *
 *              ⚠️ Le transport mTLS sortant (présentation du cert client Mali)
 *              est assuré par l'infrastructure (egress NGINX / mesh). Ce service
 *              produit/consomme uniquement la couche applicative JWS — il ne
 *              porte pas la clé privée du cert mTLS (séparation des
 *              responsabilités). En dev, l'URL partenaire peut être un mock.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { Ed25519SignerService } from '../keys/ed25519-signer.service.js';
import { JwsService } from './jws.service.js';
import { PartnerRepository } from './partner.repository.js';
import { type AesCountry, type VerifyPurpose } from './bcid.constants.js';
import { VerifyNinaResponseSchema, type VerifyNinaResponse } from './dto/verify-nina.dto.js';

@Injectable()
export class InteropClientService {
  private readonly logger = new Logger(InteropClientService.name);
  private readonly selfCountry: AesCountry;
  private readonly selfIssuer: string;
  private readonly audiencePrefix: string;
  private readonly jwsTtl: string;
  private readonly timeoutMs: number;
  /** Map PAYS → URL de la passerelle partenaire. */
  private readonly endpoints: Map<string, string>;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly signer: Ed25519SignerService,
    private readonly jws: JwsService,
    private readonly partners: PartnerRepository,
  ) {
    this.selfCountry = cfg.get('INTEROP_SELF_COUNTRY', { infer: true });
    this.selfIssuer = cfg.get('INTEROP_SELF_ISSUER', { infer: true });
    this.audiencePrefix = cfg.get('INTEROP_AUDIENCE_PREFIX', { infer: true });
    this.jwsTtl = cfg.get('INTEROP_JWS_TTL', { infer: true });
    this.timeoutMs = cfg.get('INTEROP_OUTGOING_TIMEOUT_MS', { infer: true });
    this.endpoints = this.parseEndpoints(cfg.get('INTEROP_PARTNER_ENDPOINTS', { infer: true }));
  }

  /**
   * Interroge un partenaire pour vérifier un NINA chez lui.
   *
   * @param params.targetCountry Pays détenteur du NINA (BFA/NER).
   * @param params.nina          NINA à vérifier (14 chiffres + lettre).
   * @param params.purpose       Finalité (purpose limitation RGPD).
   * @returns La réponse minimaliste vérifiée du partenaire.
   * @throws NotFoundException        si le partenaire/endpoint est inconnu.
   * @throws ServiceUnavailableException si le partenaire est injoignable.
   * @throws BadGatewayException      si la réponse JWS est invalide/mal formée.
   */
  async verifyNinaWith(params: {
    targetCountry: AesCountry;
    nina: string;
    purpose: VerifyPurpose;
  }): Promise<VerifyNinaResponse> {
    const { targetCountry, nina, purpose } = params;
    const endpoint = this.endpoints.get(targetCountry);
    if (!endpoint) {
      throw new NotFoundException(`Aucune passerelle BCID-AES connue pour ${targetCountry}`);
    }
    const partner = await this.partners.findActiveByCountry(targetCountry);
    if (!partner) {
      throw new NotFoundException(`Partenaire ${targetCountry} non provisionné (clé publique)`);
    }

    // (1) Signer la requête : requestId == jti ; aud == aes:<targetCountry>.
    const requestId = randomUUID();
    const jwsRequest = await this.signer.sign(
      {
        nina,
        requesterCountry: this.selfCountry,
        purpose,
        requestId,
        timestamp: new Date().toISOString(),
      },
      {
        jti: requestId,
        iss: this.selfIssuer,
        aud: `${this.audiencePrefix}${targetCountry}`,
        ttl: this.jwsTtl,
      },
    );

    // (2) POST mTLS (transport assuré par l'egress) — corps = JWS compact.
    let jwsResponse: string;
    try {
      const res = await this.post(`${endpoint.replace(/\/$/, '')}/verify`, jwsRequest);
      jwsResponse = res;
    } catch (err) {
      this.logger.warn(`Appel sortant ${targetCountry} échoué : ${(err as Error).message}`);
      throw new ServiceUnavailableException(`Partenaire ${targetCountry} injoignable`);
    }

    // (3) Vérifier le JWS de réponse du partenaire (signature, iss/aud, nbf/exp).
    const payload = await this.jws.verifyResponse(jwsResponse, partner);
    const parsed = VerifyNinaResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadGatewayException(`Réponse ${targetCountry} non conforme au schéma BCID-AES`);
    }
    return parsed.data;
  }

  /** POST le JWS compact (Content-Type application/jose) avec timeout. */
  private async post(url: string, jwsCompact: string): Promise<string> {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/jose', Accept: 'application/jose' },
        body: jwsCompact,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(to);
    }
  }

  /** Parse la CSV `PAYS=URL,PAYS=URL` en Map. */
  private parseEndpoints(csv: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const pair of csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const idx = pair.indexOf('=');
      if (idx <= 0) continue;
      map.set(pair.slice(0, idx).trim().toUpperCase(), pair.slice(idx + 1).trim());
    }
    return map;
  }
}
