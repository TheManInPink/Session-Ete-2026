/**
 * @file        jws.service.ts
 * @description Vérification du JWS Ed25519 d'un partenaire BCID-AES.
 *
 *              Utilise `jwtVerify` (et non `compactVerify` brut) pour valider
 *              nativement nbf/exp/aud/iss, avec l'algorithme FIGÉ à `EdDSA`
 *              (interdit l'algorithm-confusion / `alg:none` / HS256). La clé
 *              publique du pair (JWK Ed25519) provient de `aes_partners`
 *              (enregistrée lors de l'onboarding), jamais d'un header.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';
import { type AesPartner } from '@nina-aes/database';
import type { Env } from '../config/env.schema.js';
import { JWS_ALG } from './bcid.constants.js';
import { VerifyNinaRequestSchema, type VerifyNinaRequest } from './dto/verify-nina.dto.js';

/** Résultat d'une vérification JWS de requête. */
export interface VerifiedRequest {
  request: VerifyNinaRequest;
  jti: string;
}

@Injectable()
export class JwsService {
  private readonly selfCountry: string;
  private readonly audiencePrefix: string;
  private readonly clockTolerance: number;

  constructor(cfg: ConfigService<Env, true>) {
    this.selfCountry = cfg.get('INTEROP_SELF_COUNTRY', { infer: true });
    this.audiencePrefix = cfg.get('INTEROP_AUDIENCE_PREFIX', { infer: true });
    this.clockTolerance = cfg.get('INTEROP_CLOCK_TOLERANCE_SEC', { infer: true });
  }

  /** Audience attendue par CE nœud (ex. `aes:MLI`). */
  expectedAudience(): string {
    return `${this.audiencePrefix}${this.selfCountry}`;
  }

  /**
   * Vérifie le JWS de requête d'un partenaire et renvoie le payload métier validé.
   *
   * @param jwsCompact JWS compact reçu (Content-Type application/jose).
   * @param partner    Partenaire résolu depuis le cert mTLS (clé publique + iss).
   * @throws UnauthorizedException si la signature/alg/issuer/audience/nbf/exp est invalide.
   * @throws BadRequestException si le payload ne respecte pas le schéma BCID-AES.
   */
  async verifyRequest(jwsCompact: string, partner: AesPartner): Promise<VerifiedRequest> {
    const key = await importJWK(partner.publicKeyJwk as JWK, JWS_ALG);

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(jwsCompact, key, {
        algorithms: [JWS_ALG], // FIGÉ : aucune négociation (anti alg:none / HS256).
        issuer: partner.expectedIssuer, // iss == émetteur enregistré du pays pair.
        audience: this.expectedAudience(), // aud == nous.
        clockTolerance: this.clockTolerance, // ±2 min : même skew que l'anti-replay.
        requiredClaims: ['jti', 'iat', 'nbf', 'exp'],
      });
      payload = result.payload;
    } catch {
      // Signature invalide, alg interdit, iss/aud KO, nbf futur, exp dépassé…
      throw new UnauthorizedException('JWS de requête invalide');
    }

    const jti = payload.jti;
    if (!jti || typeof jti !== 'string') {
      throw new BadRequestException('JWS sans claim jti');
    }

    const parsed = VerifyNinaRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException('Payload verify-nina invalide (schéma BCID-AES)');
    }

    // Cohérence : le jti SIGNÉ (claim protégé) doit égaler le requestId MÉTIER.
    if (parsed.data.requestId !== jti) {
      throw new BadRequestException('Incohérence requestId/jti');
    }

    // Cohérence : le pays déclaré dans le payload doit correspondre au pays du
    // cert mTLS réel (le pays du cert reste la source de vérité — A01/A07).
    if (parsed.data.requesterCountry !== partner.country) {
      throw new UnauthorizedException('requesterCountry du payload ≠ pays du certificat mTLS');
    }

    return { request: parsed.data, jti };
  }

  /**
   * Vérifie un JWS de RÉPONSE renvoyé par un partenaire (client sortant). On
   * attend `iss` = émetteur du partenaire et `aud` = nous.
   *
   * @param jwsCompact JWS de réponse du partenaire.
   * @param partner    Partenaire interrogé.
   * @returns Le payload de réponse vérifié (claims techniques inclus).
   * @throws UnauthorizedException si la signature/claims sont invalides.
   */
  async verifyResponse(jwsCompact: string, partner: AesPartner): Promise<JWTPayload> {
    const key = await importJWK(partner.publicKeyJwk as JWK, JWS_ALG);
    try {
      const { payload } = await jwtVerify(jwsCompact, key, {
        algorithms: [JWS_ALG],
        issuer: partner.expectedIssuer,
        audience: this.expectedAudience(),
        clockTolerance: this.clockTolerance,
        requiredClaims: ['jti', 'iat', 'nbf', 'exp'],
      });
      return payload;
    } catch {
      throw new UnauthorizedException('JWS de réponse partenaire invalide');
    }
  }
}
