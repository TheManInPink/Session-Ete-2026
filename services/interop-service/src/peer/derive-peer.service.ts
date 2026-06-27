/**
 * @file        derive-peer.service.ts
 * @description Dérivation de l'identité du pays pair à partir du certificat mTLS
 *              RÉEL terminé par l'ingress NGINX (doc 21 §4.7) — JAMAIS d'un
 *              en-tête d'identité fourni par le client (A01/A07).
 *
 *              Chaîne de confiance :
 *                handshake TLS (cert client) → NGINX vérifie vs CA AES →
 *                en-têtes `ssl-client-*` SERVEUR-ONLY (strippés en entrée,
 *                réécrits après vérif) → derivePeer() recalcule le fingerprint
 *                SHA-256 EN INTERNE (on ne fait PAS confiance à un fingerprint
 *                pré-calculé fourni en header) → table `aes_partners`.
 *
 *              ⚠️ On NE lit JAMAIS `X-AES-Peer-Country` / `X-AES-Peer-Cert-*` :
 *              ces en-têtes sont 100 % contrôlés par le client. Le pays est
 *              dérivé du SubjectDN/CN du cert vérifié, pas d'une valeur déclarée.
 *
 *              Mode DEV : si `INTEROP_TRUST_INGRESS_HEADERS=false` (pas d'ingress
 *              en local), on autorise une simulation explicite via
 *              `INTEROP_DEV_PEER_*` — INTERDITE en production (cf. env.schema).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/peer
 */
import { createHash, X509Certificate } from 'node:crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.schema.js';
import { AES_COUNTRIES, type AesCountry } from '../bcid/bcid.constants.js';

/** Identité du pair issue du handshake mTLS (jamais d'un header client). */
export interface MtlsPeer {
  country: AesCountry;
  certFingerprint: string;
}

@Injectable()
export class DerivePeerService {
  private readonly logger = new Logger(DerivePeerService.name);
  private readonly trustIngress: boolean;
  private readonly verifyHeader: string;
  private readonly certHeader: string;
  private readonly devPeerCountry?: AesCountry;
  private readonly devPeerFingerprint?: string;

  constructor(cfg: ConfigService<Env, true>) {
    this.trustIngress = cfg.get('INTEROP_TRUST_INGRESS_HEADERS', { infer: true });
    this.verifyHeader = cfg.get('INTEROP_MTLS_VERIFY_HEADER', { infer: true }).toLowerCase();
    this.certHeader = cfg.get('INTEROP_MTLS_CERT_HEADER', { infer: true }).toLowerCase();
    this.devPeerCountry = cfg.get('INTEROP_DEV_PEER_COUNTRY', { infer: true });
    this.devPeerFingerprint = cfg.get('INTEROP_DEV_PEER_FINGERPRINT', { infer: true });
  }

  /**
   * Dérive `{ country, certFingerprint }` du cert mTLS vérifié.
   *
   * @param req Requête Express (en-têtes réécrits par l'ingress).
   * @throws ForbiddenException si le handshake n'est pas vérifié / cert absent /
   *         pays non dérivable.
   */
  derivePeer(req: Request): MtlsPeer {
    if (!this.trustIngress) return this.deriveDevPeer();

    // (1) Le handshake DOIT avoir réussi côté ingress (sinon trafic non-mTLS).
    const verify = this.header(req, this.verifyHeader);
    if (verify?.toUpperCase() !== 'SUCCESS') {
      throw new ForbiddenException('mTLS non vérifié (ssl-client-verify != SUCCESS)');
    }

    // (2) PEM injecté (url-encodé par NGINX) → recalcul du fingerprint EN INTERNE.
    const rawPem = this.header(req, this.certHeader);
    if (!rawPem) throw new ForbiddenException('Certificat pair mTLS absent');
    const pem = this.normalizePem(rawPem);
    const fingerprint = this.fingerprintFromPem(pem);

    // (3) Pays dérivé du SubjectDN/CN du cert vérifié (jamais d'un header déclaré).
    const country = this.countryFromPem(pem);
    if (!country) {
      throw new ForbiddenException('Pays pair non dérivable du certificat mTLS');
    }

    return { country, certFingerprint: fingerprint };
  }

  /** Lit un en-tête (insensible à la casse), première valeur si tableau. */
  private header(req: Request, name: string): string | undefined {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  }

  /** Décode + normalise un PEM transmis url-encodé par l'ingress. */
  private normalizePem(raw: string): string {
    let pem = raw;
    try {
      // NGINX `auth-tls-pass-certificate-to-upstream` transmet le PEM url-encodé.
      if (pem.includes('%')) pem = decodeURIComponent(pem);
    } catch {
      // Déjà décodé : on garde tel quel.
    }
    return pem.replace(/\r/g, '').trim();
  }

  /**
   * SHA-256 (hex) du DER du certificat. On extrait le bloc base64 entre les
   * délimiteurs PEM, on le re-encode en DER, puis on hashe — exactement la même
   * empreinte que celle enregistrée dans `aes_partners.certFingerprint`.
   */
  private fingerprintFromPem(pem: string): string {
    const match = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!match) throw new ForbiddenException('Certificat pair mTLS mal formé (PEM invalide)');
    const der = Buffer.from(match[1]!.replace(/\s+/g, ''), 'base64');
    return createHash('sha256').update(der).digest('hex');
  }

  /**
   * Dérive le pays AES du Subject du certificat. Convention d'émission CA AES :
   * le Subject porte le code pays ISO alpha-3 dans une RDN DÉDIÉE — `C` (country)
   * ou `OU` (organizational unit) — ex. `CN=interop.dgec.bf, OU=BFA, C=BF`. On
   * PARSE réellement le cert avec `node:crypto` X509Certificate (le Subject est
   * dans le DER, pas en clair dans le base64 du PEM).
   *
   * 🔒 Durcissement (revue sécurité) :
   *   1. on ne scanne QUE les RDN `C`/`OU` (pas `CN`/`O`, susceptibles de
   *      contenir un FQDN/raison sociale où un token pays apparaîtrait par
   *      coïncidence — ex. `O=Agence BFA-NER`) ;
   *   2. on rejette (→ null) tout cert dont le Subject désigne PLUSIEURS pays AES
   *      distincts : l'identité du pair doit être NON AMBIGUË (sinon le résultat
   *      dépendrait de l'ordre de `AES_COUNTRIES`).
   *
   * La source reste le cert vérifié par l'ingress, jamais une valeur déclarée par
   * le client. `findActiveByFingerprint` lie ensuite pays + fingerprint.
   */
  private countryFromPem(pem: string): AesCountry | null {
    let subject: string;
    try {
      subject = new X509Certificate(pem).subject; // ex. "CN=interop.dgec.bf\nOU=BFA\nC=BF"
    } catch {
      return null;
    }

    // Valeurs des RDN dédiées au pays uniquement (C / OU), une par ligne.
    // X509Certificate.subject sépare les RDN par '\n' : "C=...\nOU=...\nCN=...".
    const countryRdnValues = subject
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(C|OU)=/i.test(line))
      .map((line) => line.slice(line.indexOf('=') + 1));

    const matched = new Set<AesCountry>();
    for (const value of countryRdnValues) {
      for (const c of AES_COUNTRIES) {
        // Token pays délimité (ex. OU=BFA). `\b` évite les faux positifs partiels.
        if (new RegExp(`\\b${c}\\b`).test(value)) matched.add(c);
      }
    }

    // Ambiguïté : 0 → non dérivable, ≥2 → refus (cert mal émis, on ne devine pas).
    if (matched.size !== 1) {
      if (matched.size > 1) {
        this.logger.warn(
          `Subject mTLS ambigu : ${matched.size} pays AES distincts détectés (${[...matched].join(', ')}) — cert rejeté`,
        );
      }
      return null;
    }
    return [...matched][0]!;
  }

  /** Simulation DEV (pas d'ingress) — jamais en production (cf. env.schema). */
  private deriveDevPeer(): MtlsPeer {
    if (!this.devPeerCountry || !this.devPeerFingerprint) {
      throw new ForbiddenException(
        'Mode dev sans ingress : INTEROP_DEV_PEER_COUNTRY/FINGERPRINT requis pour simuler le pair mTLS',
      );
    }
    this.logger.warn(
      `Identité pair SIMULÉE (dev, sans ingress) : ${this.devPeerCountry} / ${this.devPeerFingerprint.slice(0, 12)}…`,
    );
    return { country: this.devPeerCountry, certFingerprint: this.devPeerFingerprint };
  }
}
