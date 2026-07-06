/**
 * @file        at-authenticity.guard.ts
 * @description Guard d'authenticité du webhook Africa's Talking (doc 14 §4.2).
 *
 *              SÉCURITÉ (OWASP A07:2021 — Identification/Authentication
 *              Failures) : le webhook `POST /ussd/callback` est PUBLIC (Africa's
 *              Talking ne présente pas de JWT). Sans authentification du caller,
 *              n'importe qui sur Internet peut POSTer un `phoneNumber` arbitraire
 *              et déclencher une consultation NINA / un signalement frauduleux /
 *              abuser du rate-limit. C'est la faille la plus grave du service :
 *              TOUTES les protections aval (binding phone↔NINA, rate-limit) sont
 *              contournables par injection de payloads forgés tant que ce guard
 *              n'est pas en place.
 *
 *              DÉFENSE EN PROFONDEUR — deux couches cumulées ici :
 *                1. IP allowlist des passerelles AT (`AT_GATEWAY_IP_ALLOWLIST`).
 *                   L'IP source est résolue par Express via `trust proxy`
 *                   (`TRUST_PROXY_HOPS`, posé dans main.ts) : `X-Real-IP` n'est
 *                   honoré QUE si la requête a transité par un proxy de
 *                   confiance (sinon il est usurpable par un client direct).
 *                   C'est de la défense en profondeur — l'IP seule reste
 *                   usurpable derrière un proxy mal configuré (doc 14 §4.2) ;
 *                   le SECRET partagé (couche 2) demeure la barrière réelle.
 *                2. Secret partagé comparé en TEMPS CONSTANT
 *                   (`AT_WEBHOOK_SHARED_SECRET`, `crypto.timingSafeEqual`).
 *              La 3ᵉ couche (mTLS) est terminée en amont (api-gateway / NGINX)
 *              et ne relève PAS de ce guard.
 *
 *              POSTURE FAIL-CLOSED EN PRODUCTION : si `NODE_ENV=production` et
 *              que la configuration de sécurité est absente (allowlist vide ou
 *              secret vide), TOUT appel est rejeté (403). En développement, le
 *              guard reste permissif pour permettre le simulateur local sans
 *              configuration supplémentaire.
 *
 *              Tout appel non authentifié est REJETÉ (403) AVANT d'atteindre la
 *              machine à états — donc AVANT tout accès PII. On NE log JAMAIS le
 *              payload (il peut contenir un `phoneNumber`) ; on ne trace que le
 *              motif de rejet pour le SOC.
 *
 * @module      ussd-service/ussd/guards
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { getConfig } from '@nina-aes/config';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

/**
 * Sous-ensemble structurel de la requête HTTP utilisé par le guard. On évite la
 * dépendance directe à `express` (non déclarée dans ce service) en ne typant que
 * ce dont on a besoin.
 *
 * - `ip`   : IP source résolue PAR Express en tenant compte de `trust proxy`
 *            (cf. main.ts). C'est la valeur de confiance : si aucun proxy n'est
 *            de confiance, c'est l'IP du pair TCP direct ; sinon, la première IP
 *            non-fiable de la chaîne `X-Forwarded-For`.
 * - `ips`  : chaîne `X-Forwarded-For` que Express a jugée DE CONFIANCE (vide si
 *            `trust proxy` n'a validé aucun saut). `ips.length > 0` prouve donc
 *            que la requête a réellement transité par un proxy de confiance.
 */
interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  ips?: string[];
}

/** En-tête convenu transportant le secret partagé Africa's Talking. */
const WEBHOOK_SECRET_HEADER = 'x-at-webhook-secret';
/** En-tête de confiance posé par NGINX / api-gateway portant l'IP source réelle. */
const REAL_IP_HEADER = 'x-real-ip';

@Injectable()
export class AtAuthenticityGuard implements CanActivate {
  /** En production, l'absence de config de sécurité = fail-closed (rejet). */
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(@InjectLogger() private readonly logger: StructuredLogger) {}

  /**
   * Autorise la requête uniquement si elle provient d'une passerelle AT connue
   * (IP allowlist) ET présente le secret partagé attendu (temps constant).
   *
   * @param ctx - Contexte d'exécution NestJS.
   * @returns `true` si la requête est authentique.
   * @throws ForbiddenException (403) si l'IP n'est pas autorisée, si le secret
   *         ne correspond pas, ou — en production — si la config est absente.
   */
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<HttpRequestLike>();
    const { ipAllowlistRaw, sharedSecret } = readSecurityConfig();

    const allowlist = parseCsv(ipAllowlistRaw);
    const expectedSecret = sharedSecret;

    // ── Fail-closed en production : sans config de sécurité, on REFUSE tout ──
    // (un webhook public sans authentification serait la faille même que ce
    // guard ferme). En dev, on reste permissif pour le simulateur local.
    if (this.isProduction && (allowlist.length === 0 || expectedSecret === '')) {
      this.logger.error(
        { allowlistConfigured: allowlist.length > 0, secretConfigured: expectedSecret !== '' },
        'Webhook USSD rejeté : configuration d’authenticité absente en production (fail-closed)',
      );
      throw new ForbiddenException('Webhook non configuré');
    }

    // ── Couche 1 — IP allowlist ─────────────────────────────────────────────
    // On lit l'IP réelle RÉSOLUE PAR EXPRESS via `trust proxy` (cf. main.ts).
    // `X-Real-IP` n'est honoré QUE si la requête a réellement transité par un
    // proxy de confiance (sinon il est usurpable par un client direct).
    if (allowlist.length > 0) {
      const sourceIp = readSourceIp(req);
      if (!allowlist.includes(sourceIp)) {
        // On NE log PAS le payload (peut contenir un phoneNumber) ; seulement
        // le motif pour le SOC. L'IP elle-même n'est pas journalisée ici pour
        // rester minimaliste (corrélation possible côté reverse-proxy).
        this.logger.warn(
          { reason: 'ip_not_allowed' },
          'Webhook USSD rejeté : source non autorisée',
        );
        throw new ForbiddenException('Source non autorisée');
      }
    }

    // ── Couche 2 — secret partagé en temps constant (anti-timing-attack) ────
    // Lorsqu'un secret est configuré, il DOIT correspondre. En dev sans secret
    // (expectedSecret === ''), cette couche est neutralisée (permissif local).
    if (expectedSecret !== '') {
      const presented = readHeader(req, WEBHOOK_SECRET_HEADER);
      if (!constantTimeEquals(presented, expectedSecret)) {
        this.logger.warn(
          { reason: 'bad_secret' },
          'Webhook USSD rejeté : signature webhook invalide',
        );
        throw new ForbiddenException('Signature webhook invalide');
      }
    }

    return true;
  }
}

/**
 * Lit la config d'authenticité depuis `@nina-aes/config` (schéma Zod centralisé,
 * cf. AT_GATEWAY_IP_ALLOWLIST / AT_WEBHOOK_SHARED_SECRET). En cas d'échec de
 * validation d'une variable SANS RAPPORT avec le webhook, on dégrade vers
 * `process.env` (mêmes défauts vides) plutôt que d'ouvrir ou de planter le
 * webhook — la posture fail-closed en production reste appliquée par l'appelant.
 */
function readSecurityConfig(): { ipAllowlistRaw: string; sharedSecret: string } {
  try {
    const cfg = getConfig();
    return {
      ipAllowlistRaw: cfg.AT_GATEWAY_IP_ALLOWLIST,
      sharedSecret: cfg.AT_WEBHOOK_SHARED_SECRET,
    };
  } catch {
    return {
      ipAllowlistRaw: process.env.AT_GATEWAY_IP_ALLOWLIST ?? '',
      sharedSecret: process.env.AT_WEBHOOK_SHARED_SECRET ?? '',
    };
  }
}

/** Découpe un CSV en valeurs non vides nettoyées (espaces retirés). */
function parseCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Lit un en-tête HTTP en chaîne unique (gère le cas tableau d'Express). */
function readHeader(req: HttpRequestLike, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Récupère l'IP source de CONFIANCE.
 *
 * SÉCURITÉ (anti-usurpation `X-Real-IP`) : on ne fait PLUS confiance à un
 * en-tête brut inconditionnellement. `app.set('trust proxy', N)` (main.ts) fait
 * que :
 *   - `req.ip`  = l'IP que Express a résolue selon le nombre de hops fiables ;
 *   - `req.ips` = la chaîne XFF jugée DE CONFIANCE — NON VIDE uniquement si la
 *     requête a vraiment traversé un proxy de confiance.
 *
 * On n'honore donc `X-Real-IP` (posé par NGINX) QUE si `req.ips` prouve la
 * présence d'un proxy de confiance. Un client direct qui injecte `X-Real-IP`
 * (sans proxy de confiance ⇒ `req.ips` vide) est ignoré : on retombe sur l'IP
 * du pair TCP (`req.ip`), qui ne sera pas dans l'allowlist → rejet.
 */
function readSourceIp(req: HttpRequestLike): string {
  const traversedTrustedProxy = (req.ips?.length ?? 0) > 0;
  if (traversedTrustedProxy) {
    const realIp = readHeader(req, REAL_IP_HEADER);
    if (realIp !== '') return realIp;
  }
  return req.ip ?? '';
}

/**
 * Comparaison à temps constant : évite qu'un attaquant déduise le secret octet
 * par octet via la mesure du temps de réponse. `timingSafeEqual` exige des
 * longueurs égales ; on court-circuite AVANT pour ne pas révéler la longueur du
 * secret par une exception (le court-circuit reste sûr car la valeur attendue
 * n'est pas dérivable de la simple inégalité de longueur).
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
