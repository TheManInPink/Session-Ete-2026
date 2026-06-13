/**
 * @file        user-context.signer.ts
 * @description Émet et vérifie le header interne `X-User-Context` — un JWS
 *              compact HS256 transportant l'identité de l'appelant vers les
 *              services aval.
 *
 *              POURQUOI un JWS plutôt que des headers en clair (`X-User-Id`) :
 *              un service aval ne doit JAMAIS faire confiance à un en-tête
 *              d'identité non signé, car un attaquant ayant atteint le réseau
 *              interne pourrait le forger. Le gateway signe le contexte avec un
 *              secret partagé (HS256, `GATEWAY_HS256_SECRET`, distribué par
 *              Vault) ; les services aval vérifient cette signature avant de
 *              faire confiance à `sub`/`role`. C'est la matérialisation du
 *              principe « vérifier le JWT une seule fois » : RS256 coûteux à la
 *              frontière, HS256 bon marché en interne.
 *
 *              Le token est volontairement à durée de vie TRÈS courte
 *              (`GATEWAY_USER_CONTEXT_TTL_SEC`, défaut 60 s) : il n'a de sens
 *              que le temps d'un appel proxifié, ce qui limite la fenêtre de
 *              rejeu si un en-tête fuite dans un log.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/auth
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { AuthSubject } from '@nina-aes/auth-guards';
import type { Env } from '../config/env.schema.js';

/** Émetteur fixe du JWS interne — vérifié par les consommateurs aval. */
export const USER_CONTEXT_ISSUER = 'nina-aes-api-gateway';

/** Claims portés par le JWS interne `X-User-Context`. */
export interface UserContextClaims extends JwtPayload {
  /** Identifiant utilisateur (= `sub` du JWT d'origine). */
  sub: string;
  /** Rôle applicatif (citizen, agent, admin, …). */
  role: string;
  /** L'utilisateur a-t-il satisfait la MFA. */
  mfa: boolean;
  /** Courriel, si présent dans le token d'origine. */
  email?: string;
}

@Injectable()
export class UserContextSigner {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(cfg: ConfigService<Env, true>) {
    this.secret = cfg.get('GATEWAY_HS256_SECRET', { infer: true });
    this.ttlSeconds = cfg.get('GATEWAY_USER_CONTEXT_TTL_SEC', { infer: true });
  }

  /**
   * Signe un contexte utilisateur en JWS HS256 compact.
   *
   * @param subject Sujet authentifié issu de la vérification RS256.
   * @returns Le JWS compact à placer dans `X-User-Context`.
   */
  sign(subject: AuthSubject): string {
    // `sub` est porté par le payload (jamais aussi par les options, sinon
    // jsonwebtoken lève). `iss`/`exp` sont posés via les options.
    return jwt.sign(
      {
        sub: subject.userId,
        role: subject.role,
        mfa: subject.mfa,
        ...(subject.email ? { email: subject.email } : {}),
      },
      this.secret,
      { algorithm: 'HS256', issuer: USER_CONTEXT_ISSUER, expiresIn: this.ttlSeconds },
    );
  }

  /**
   * Vérifie un JWS interne (utilisé par les tests et, à terme, par un helper
   * partagé côté services aval). `algorithms: ['HS256']` est explicite pour
   * éviter l'attaque de confusion d'algorithme (`alg: none` / RS↔HS).
   *
   * @param token JWS compact extrait de `X-User-Context`.
   * @returns Les claims vérifiés.
   * @throws UnauthorizedException si la signature est invalide ou le token expiré.
   */
  verify(token: string): UserContextClaims {
    try {
      return jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: USER_CONTEXT_ISSUER,
      }) as UserContextClaims;
    } catch {
      throw new UnauthorizedException('USER_CONTEXT_INVALID');
    }
  }
}
