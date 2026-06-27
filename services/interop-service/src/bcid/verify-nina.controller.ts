/**
 * @file        verify-nina.controller.ts
 * @description Endpoint ENTRANT BCID-AES `POST /api/v1/interop/verify` : reçoit
 *              un JWS Ed25519 signé d'un pays partenaire et répond par un JWS
 *              signé contenant la réponse MINIMALISTE (privacy by design).
 *
 *              Sécurité = mTLS ET JWS (défense en profondeur, jamais l'un OU
 *              l'autre). Ordre canonique strict (doc 21 §4.2) :
 *                (0) cert mTLS RÉEL (ingress) → identité du pair
 *                (1) assertPeerKnown (aes_partners, non révoqué)
 *                (2) verifyJws (EdDSA figé, nbf/exp/iss/aud, jti)
 *                (2bis) ANTI-REPLAY (fenêtre timestamp + Redis SET NX) AVANT métier
 *                (3) rate-limit (1000/h/pays, fail-closed)
 *                (4) checkNina (lecture seule)
 *                (5) logVerification (audit, NINA haché)
 *                (6) signResponse (JWS Ed25519, aud:aes:<pair>)
 *
 *              Route marquée `@Public()` : l'authentification N'EST PAS un JWT
 *              interne mais le couple mTLS + JWS partenaire.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { randomUUID } from 'node:crypto';
import { Body, Controller, Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@nina-aes/auth-guards';
import type { Request } from 'express';
import { AntiReplayService } from '../replay/anti-replay.service.js';
import { AesRateLimitService } from '../throttle/aes-rate-limit.service.js';
import { DerivePeerService } from '../peer/derive-peer.service.js';
import { JwsService } from './jws.service.js';
import { VerifyNinaService, type IncomingContext } from './verify-nina.service.js';

@ApiTags('interop')
@Public()
@Controller('interop')
export class VerifyNinaController {
  constructor(
    private readonly peer: DerivePeerService,
    private readonly jws: JwsService,
    private readonly antiReplay: AntiReplayService,
    private readonly rateLimit: AesRateLimitService,
    private readonly verify: VerifyNinaService,
  ) {}

  /**
   * Vérifie un NINA pour un pays partenaire et renvoie une réponse signée (JWS).
   * Le corps est le JWS compact brut (Content-Type: application/jose).
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/jose')
  @ApiOperation({
    summary:
      'BCID-AES verify-nina (entrant). Requête JWS Ed25519 + cert mTLS ⇒ réponse JWS minimaliste.',
  })
  @ApiOkResponse({ description: 'JWS compact signé par ce nœud (réponse minimaliste).' })
  async verifyNina(@Body() jwsCompact: string, @Req() req: Request): Promise<string> {
    const startedAt = Date.now();

    // (0) Identité du pair = cert mTLS RÉEL (ingress), JAMAIS un header client.
    const mtlsPeer = this.peer.derivePeer(req);

    // (1) Le cert pair doit être connu et non révoqué (aes_partners).
    const partner = await this.verify.assertPeerKnown(mtlsPeer.country, mtlsPeer.certFingerprint);

    // (2) Vérifier le JWS Ed25519 (alg figé) + nbf/exp/iss/aud + extraire le jti.
    const { request, jti } = await this.jws.verifyRequest(jwsCompact, partner);

    // (2bis) ANTI-REPLAY — AVANT toute logique métier (le @unique DB ne suffit pas).
    await this.antiReplay.assertNotReplayed(jti, request.requestId, request.timestamp);

    // (3) Rate-limit glissant 1000/h/pays — fail-CLOSED si Redis KO.
    await this.rateLimit.enforce(partner.country);

    // (4) Logique métier : lecture seule du NINA.
    const response = await this.verify.checkNina(request);

    // (6) Signer la réponse JWS Ed25519 (aud:aes:<pair>) — bug aud:undefined corrigé.
    const jwsResponse = await this.verify.signResponse(response, partner.country);

    // (5) Audit append-only (NINA haché ; jamais en clair dans les logs).
    const ctx: IncomingContext = {
      partner,
      jti,
      correlationId: this.correlationId(req),
      clientIp: this.clientIp(req),
      startedAt,
    };
    await this.verify.logVerification({ request, response, ctx, jwsResponse });

    return jwsResponse;
  }

  /** Corrélation : en-tête interne posé par l'ingress, sinon UUID neuf. */
  private correlationId(req: Request): string {
    const raw = req.headers['x-correlation-id'];
    const id = Array.isArray(raw) ? raw[0] : raw;
    return id ?? randomUUID();
  }

  /** IP source (best-effort, tronquée côté audit si nécessaire). */
  private clientIp(req: Request): string | null {
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }
}
