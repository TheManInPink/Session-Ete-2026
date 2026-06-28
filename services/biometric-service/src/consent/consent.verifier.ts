/**
 * @file        consent.verifier.ts
 * @description Vérification du JWS de CONSENTEMENT biométrique (EdDSA / Ed25519)
 *              contre la clé publique ANCRÉE du citoyen (CONSENT-PROTOCOL §4,
 *              doc 25 §4.6). C'est la preuve juridique opposable de la base légale
 *              du traitement (DPIA §2 — socle RGPD-équivalent + consentement +
 *              DPIA, PAS de loi 2024-XX non adoptée).
 *
 *              Chaîne de confiance (échec ⇒ 403 UNIFORME, anti-oracle) :
 *                1) lire l'en-tête JWS NON vérifié → `kid` annoncé (sert seulement
 *                   à résoudre l'ancre) ; exiger `alg=EdDSA` + `typ` applicatif ;
 *                2) RÉSOUDRE le `kid` via le registre souverain : clé ENRÔLÉE pour
 *                   CE citizenId, non expirée, non révoquée (jamais une clé fournie
 *                   dans le JWS) ;
 *                3) vérifier la SIGNATURE Ed25519 contre cette clé ancrée, et elle
 *                   seule (liste blanche d'algorithmes FERMÉE — `alg:none` /
 *                   confusion HS/RS impossibles) ;
 *                4) vérifier les CLAIMS : `sub == citizenId`, `iss == cit:<id>`,
 *                   `intent == BIOMETRIC_CONSENT`, `aud`, fenêtre `nbf/exp`,
 *                   `scope` dans l'allow-list EXACTE (jamais par sous-chaîne),
 *                   anti-rejeu (`jti` non déjà vu) ;
 *                5) vérifier que le consentement n'a pas été RÉVOQUÉ.
 *
 *              ⚠️  ANTI-PATTERNS BANNIS (CONSENT-PROTOCOL §8) :
 *                - `alg:none` / confusion HS/RS → liste blanche `["EdDSA"]` fermée ;
 *                - clé fournie dans le JWS → on RÉSOUT le `kid` dans le registre ;
 *                - test du scope par sous-chaîne → allow-list EXACTE par égalité ;
 *                - `or` non parenthésé dans les claims → chaque condition est un
 *                  terme `&&` à part entière (pas de court-circuit d'authz) ;
 *                - message d'erreur détaillé → 403 uniforme.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';
import { prisma } from '@nina-aes/database';
import type { Env } from '../config/env.schema.js';
import { CitizenKeyringService } from './citizen-keyring.service.js';

/** Périmètres EXACTS autorisés pour un consentement d'enrôlement (allow-list). */
const ALLOWED_CONSENT_SCOPES: ReadonlySet<string> = new Set(['enroll:FINGERPRINT', 'enroll:FACE']);

/** Type applicatif attendu du jeton (anti-confusion de jeton). */
const EXPECTED_TYP = 'nina-bio-consent+jws';

/** Claims de consentement attendus (sous-ensemble utilisé). */
interface ConsentClaims {
  sub?: string;
  iss?: string;
  intent?: string;
  scope?: string | string[];
  aud?: string;
  channel?: string;
  lang?: string;
  iat?: number;
  nbf?: number;
  exp?: number;
  jti?: string;
}

/** Résultat d'une vérification de consentement réussie. */
export interface VerifiedConsent {
  /** `kid` de la clé citoyen signataire (ancre de confiance). */
  signerKid: string;
  /** Nonce unique (anti-rejeu, corrélation preuve). */
  jti: string;
  /** Périmètre accordé (ex. `enroll:FINGERPRINT`). */
  scope: string;
  /** Canal de recueil. */
  channel: string;
  /** Langue effectivement présentée. */
  lang: string;
  /** Bornes temporelles signées. */
  issuedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ConsentVerifier {
  private readonly audience: string;
  private readonly clockToleranceSec: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly keyring: CitizenKeyringService,
  ) {
    this.audience = cfg.get('BIOMETRIC_CONSENT_AUDIENCE', { infer: true });
    this.clockToleranceSec = cfg.get('BIOMETRIC_CONSENT_CLOCK_TOLERANCE_SEC', { infer: true });
  }

  /**
   * Vérifie un JWS de consentement contre la clé publique ANCRÉE du citoyen.
   *
   * @param consentJws JWS compact (header.payload.signature, base64url).
   * @param citizenId  Citoyen ciblé par l'endpoint (anti-IDOR : doit == `sub`).
   * @returns Détails du consentement vérifié.
   * @throws ForbiddenException 403 (UNIFORME) si une étape échoue.
   */
  async verify(consentJws: string, citizenId: string): Promise<VerifiedConsent> {
    const parts = consentJws.split('.');
    if (parts.length !== 3) this.reject();
    const [hB64, pB64, sigB64] = parts as [string, string, string];

    // 1) En-tête NON vérifié → kid + contrôle alg/typ (liste blanche fermée).
    let header: { alg?: string; typ?: string; kid?: string };
    let claims: ConsentClaims;
    try {
      header = JSON.parse(Buffer.from(hB64, 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(pB64, 'base64url').toString('utf8'));
    } catch {
      this.reject();
    }
    if (header!.alg !== 'EdDSA' || header!.typ !== EXPECTED_TYP || !header!.kid) {
      this.reject();
    }

    // 2) Ancrage : résoudre le kid dans le registre souverain (jamais une clé du JWS).
    const anchored = await this.keyring.resolveCitizenPublicKey(citizenId, header!.kid!);
    if (!anchored) this.reject();

    // 3) Signature Ed25519 contre la clé ANCRÉE (signing input = header.payload).
    //    ⚠️  NON-MALLÉABILITÉ (CONSENT-PROTOCOL §8 anti-rejeu / preuve opposable,
    //    DPIA §2) — `@noble/ed25519` v2 vérifie par DÉFAUT en mode ZIP-215
    //    (`zip215: true`), PERMISSIF : il accepte des `S` non canoniques et des
    //    points d'ordre faible, donc une SECONDE signature distincte-mais-valide
    //    peut exister pour le MÊME payload. Le JWS de consentement étant une PREUVE
    //    JURIDIQUE OPPOSABLE, on EXIGE `zip215: false` (RFC 8032 strict) : `S`
    //    canonique imposé → la signature est UNIQUE (non malléable), cohérent avec
    //    l'anti-rejeu `jti` (une preuve = un octet de signature).
    const signingInput = new TextEncoder().encode(`${hB64}.${pB64}`);
    const sigOk = await ed
      .verifyAsync(
        new Uint8Array(Buffer.from(sigB64, 'base64url')),
        new Uint8Array(signingInput),
        new Uint8Array(anchored!.publicKey),
        { zip215: false },
      )
      .catch(() => false);
    if (!sigOk) this.reject();

    // 4) Claims : sujet/intention/audience/fenêtre/scope (chaque terme && — pas de
    //    `or` non parenthésé qui court-circuiterait l'authz).
    const now = Math.floor(Date.now() / 1000);
    const tol = this.clockToleranceSec;
    const scope = this.singleScope(claims!.scope);
    const claimsOk =
      claims!.sub === citizenId &&
      claims!.iss === `cit:${citizenId}` &&
      claims!.intent === 'BIOMETRIC_CONSENT' &&
      claims!.aud === this.audience &&
      typeof claims!.exp === 'number' &&
      (claims!.nbf ?? now) - tol <= now &&
      now < claims!.exp + tol &&
      scope !== null &&
      ALLOWED_CONSENT_SCOPES.has(scope);
    if (!claimsOk || !claims!.jti || typeof claims!.iat !== 'number') {
      this.reject();
    }

    // 5) Anti-rejeu + révocation (état le plus volatil en dernier).
    const jti = claims!.jti!;
    const existing = await prisma.biometricConsent.findUnique({
      where: { jti },
      select: { revokedAt: true },
    });
    if (existing) {
      // jti déjà consommé = rejeu, OU consentement révoqué → 403 uniforme.
      this.reject();
    }

    return {
      signerKid: header!.kid!,
      jti,
      scope: scope!,
      channel: typeof claims!.channel === 'string' ? claims!.channel : 'unknown',
      lang: typeof claims!.lang === 'string' ? claims!.lang : 'fr',
      issuedAt: new Date(claims!.iat! * 1000),
      expiresAt: new Date(claims!.exp! * 1000),
    };
  }

  /**
   * Normalise le claim `scope` (string ou liste) en UN périmètre exact présent
   * dans l'allow-list, ou `null`. Comparaison par ÉGALITÉ (jamais sous-chaîne).
   *
   * @param raw Valeur brute du claim `scope`.
   */
  private singleScope(raw: string | string[] | undefined): string | null {
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const v of values) {
      if (ALLOWED_CONSENT_SCOPES.has(v)) return v;
    }
    return null;
  }

  /** Rejet UNIFORME (anti-oracle) — ne révèle jamais l'étape échouée. */
  private reject(): never {
    throw new ForbiddenException('CONSENT_INVALID');
  }
}
