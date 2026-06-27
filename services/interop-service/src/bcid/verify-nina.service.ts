/**
 * @file        verify-nina.service.ts
 * @description Logique métier du verbe BCID-AES `verify-nina` (entrant) :
 *              résolution du partenaire, lecture en SEULE LECTURE du NINA,
 *              construction de la réponse MINIMALISTE (privacy by design),
 *              journalisation d'audit (recherche via hash SHA-256 UNIQUEMENT ;
 *              le NINA n'est JAMAIS persisté en clair, cf. logVerification), et
 *              signature JWS Ed25519 de la réponse.
 *
 *              Ordre canonique (orchestré par le contrôleur) :
 *                cert mTLS → assertPeerKnown → verifyJws → anti-replay →
 *                rate-limit → checkNina → logVerification → signResponse.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma, type AesPartner } from '@nina-aes/database';
import type { Env } from '../config/env.schema.js';
import { Ed25519SignerService } from '../keys/ed25519-signer.service.js';
import { PartnerRepository } from './partner.repository.js';
import { REQUEST_TYPE_VERIFY_NINA, type AesCountry, type VerifyResult } from './bcid.constants.js';
import {
  VerifyNinaResponseSchema,
  type VerifyNinaRequest,
  type VerifyNinaResponse,
} from './dto/verify-nina.dto.js';

/** Contexte d'un appel entrant (issu du cert mTLS réel + corrélation). */
export interface IncomingContext {
  partner: AesPartner;
  jti: string;
  correlationId: string;
  clientIp: string | null;
  startedAt: number;
}

@Injectable()
export class VerifyNinaService {
  private readonly logger = new Logger(VerifyNinaService.name);
  private readonly selfCountry: AesCountry;
  private readonly selfIssuer: string;
  private readonly audiencePrefix: string;
  private readonly jwsTtl: string;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly partners: PartnerRepository,
    private readonly signer: Ed25519SignerService,
  ) {
    this.selfCountry = cfg.get('INTEROP_SELF_COUNTRY', { infer: true });
    this.selfIssuer = cfg.get('INTEROP_SELF_ISSUER', { infer: true });
    this.audiencePrefix = cfg.get('INTEROP_AUDIENCE_PREFIX', { infer: true });
    this.jwsTtl = cfg.get('INTEROP_JWS_TTL', { infer: true });
  }

  /**
   * Résout le partenaire à partir du cert mTLS réel (pays + fingerprint). Rejet
   * si le cert est inconnu/révoqué/expiré (`aes_partners`).
   *
   * @param country     Pays issu du cert mTLS.
   * @param fingerprint SHA-256 (hex) du cert pair.
   * @throws ForbiddenException si le partenaire n'est pas connu/actif.
   */
  async assertPeerKnown(country: string, fingerprint: string): Promise<AesPartner> {
    const partner = await this.partners.findActiveByFingerprint(country, fingerprint);
    if (!partner) {
      throw new ForbiddenException(`Certificat pair inconnu ou révoqué pour ${country}`);
    }
    return partner;
  }

  /**
   * Vérifie l'existence et la validité d'un NINA en LECTURE SEULE et renvoie la
   * réponse MINIMALISTE (jamais de nom/prénom/photo).
   *
   * ⚠️ SÉCURITÉ — détection des NINA RÉVOQUÉS (décès/fraude) au poste frontière :
   * le client Prisma `@nina-aes/database` active une extension « soft-delete »
   * qui INJECTE automatiquement `deletedAt: null` dans tout `where` de lecture
   * SUR le modèle `Citizen` — SAUF si l'appelant nomme déjà la clé `deletedAt`
   * au PREMIER niveau du `where` (cf. `applyNotDeleted`, hasOwnProperty). Un
   * `findUnique({ where: { nina } })` filtrerait donc les NINA révoqués
   * (`deletedAt != null`) et répondrait `{ exists:false }` (NO_MATCH) au lieu de
   * `{ exists:true, valid:false }` (REVOKED) : le pays pair ne distinguerait
   * plus « NINA inconnu » de « NINA connu-mais-révoqué », ce qui ANNIHILE un but
   * central du BCID-AES.
   *
   * Parade : on lit via `findFirst` (et non `findUnique`, qui n'accepte pas de
   * prédicat sur un champ non-unique) en plaçant `deletedAt: { not: undefined }`
   * comme clé EXPLICITE de premier niveau. Prisma traite `not: undefined` comme
   * « pas de filtre » (matche null ET non-null), mais la PRÉSENCE de la clé
   * `deletedAt` neutralise l'auto-injection de l'extension → les enregistrements
   * révoqués restent visibles. Le verdict reste porté par `deletedAt === null`.
   *
   * @param request Requête verify-nina validée (issue du JWS).
   * @returns Réponse minimaliste { exists, valid, vulnerable, lastUpdated }.
   */
  async checkNina(request: VerifyNinaRequest): Promise<VerifyNinaResponse> {
    const citizen = await prisma.citizen.findFirst({
      where: { nina: request.nina, deletedAt: { not: undefined } },
      select: { vulnerabilityCategory: true, updatedAt: true, deletedAt: true },
    });

    if (!citizen) {
      return { exists: false, valid: false, vulnerable: null, lastUpdated: null };
    }

    // `deletedAt` non nul = NINA révoqué (décès, fraude avérée). Comme on lit ici
    // SANS le filtre soft-delete (cf. bloc ci-dessus), un citoyen révoqué REMONTE
    // bien avec `exists:true` ; seul `valid` bascule à false → verdict REVOKED.
    const response: VerifyNinaResponse = {
      exists: true,
      valid: citizen.deletedAt === null,
      vulnerable: citizen.vulnerabilityCategory !== null,
      lastUpdated: citizen.updatedAt.toISOString().slice(0, 10),
    };
    return VerifyNinaResponseSchema.parse(response);
  }

  /** Mappe la réponse métier vers le verdict journalisé `result`. */
  resultOf(response: VerifyNinaResponse): VerifyResult {
    if (!response.exists) return 'NO_MATCH';
    if (!response.valid) return 'REVOKED';
    return 'MATCH';
  }

  /**
   * Signe la réponse minimaliste en JWS Ed25519 adressée au pays pair.
   *
   * @param response    Réponse minimaliste.
   * @param peerCountry Pays destinataire (issu du cert mTLS) — corrige le bug
   *                    historique `aud:aes:undefined` (doc 21 §4.2).
   * @returns Le JWS compact de réponse.
   */
  async signResponse(response: VerifyNinaResponse, peerCountry: string): Promise<string> {
    return this.signer.sign(
      { ...response },
      {
        jti: randomUUID(),
        iss: this.selfIssuer,
        aud: `${this.audiencePrefix}${peerCountry}`, // ✅ aud:aes:BFA correct
        ttl: this.jwsTtl,
      },
    );
  }

  /**
   * Journalise la vérification (append-only). Le NINA est HACHÉ (SHA-256) dans
   * `requestedNinaHash` — c'est cette colonne, et ELLE SEULE, qui sert aux
   * recherches/jointures/corrélation d'audit (data-minimization).
   *
   * ⚠️ PRIVACY by design : le NINA n'est JAMAIS persisté EN CLAIR dans
   * `aes_verification_logs`. Persister une PII transfrontalière en clair dans une
   * table requêtable serait une fuite massive en cas de compromission DB ; le hash
   * SHA-256 suffit à corréler/auditer. Si un audit légal exige le NINA en clair,
   * le pays demandeur le détient déjà dans sa requête signée (JWS). NE PAS
   * réintroduire de colonne NINA en clair (cf. revue sécurité Bloc B).
   */
  async logVerification(params: {
    request: VerifyNinaRequest;
    response: VerifyNinaResponse;
    ctx: IncomingContext;
    jwsResponse: string;
  }): Promise<void> {
    const { request, response, ctx, jwsResponse } = params;
    const ninaHash = createHash('sha256').update(request.nina).digest('hex');
    const result = this.resultOf(response);

    try {
      await this.partners.createVerificationLog({
        requesterCountry: request.requesterCountry,
        responderCountry: this.selfCountry,
        requestedNinaHash: ninaHash,
        requestType: REQUEST_TYPE_VERIFY_NINA,
        requestId: request.requestId,
        jti: ctx.jti,
        purpose: request.purpose,
        result,
        responseExists: response.exists,
        responseValid: response.valid,
        latencyMs: Date.now() - ctx.startedAt,
        // `signature` (legacy, 128 chars) ← empreinte compacte du JWS de réponse.
        signature: createHash('sha256').update(jwsResponse).digest('hex'),
        jwsSignature: jwsResponse,
        correlationId: ctx.correlationId,
        clientIp: ctx.clientIp,
      });
    } catch (err) {
      // Le dernier filet `@unique(requestId)` peut lever en cas de course extrême
      // (P2002) — l'anti-replay Redis l'a normalement déjà rejeté en amont. On
      // logge sans masquer : la réponse signée reste valide pour le partenaire.
      this.logger.warn(
        `Journalisation interop échouée (requestId=${request.requestId}) : ${(err as Error).message}`,
      );
    }
  }
}
