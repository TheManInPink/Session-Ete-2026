/**
 * @file        citizen-keyring.service.ts
 * @description Registre de clés publiques citoyen SOUVERAIN (ancrage de la chaîne
 *              de confiance du consentement — doc 25 §4.6, CONSENT-PROTOCOL §3.4).
 *              Résout un `kid` annoncé dans l'en-tête JWS vers la clé publique
 *              Ed25519 ANCRÉE pour CE `citizenId` : la clé doit être ENRÔLÉE pour
 *              ce citoyen, NON expirée et NON révoquée — sinon REJET.
 *
 *              C'est cet ANCRAGE — et non la confiance aveugle dans le JWS reçu —
 *              qui rend le consentement opposable et ferme la surface IDOR sur
 *              `/register` (un agent ne peut pas signer « à la place » du citoyen,
 *              il faudrait sa clé privée, qui vit sur SON appareil, Bloc A).
 *
 *              ⏳  HONNÊTETÉ — le registre de clés citoyen (app mobile Bloc A) n'est
 *              pas encore livré. Cette implémentation expose le CONTRAT
 *              (`resolveCitizenPublicKey`) et une résolution DEV déterministe
 *              dérivée du `citizenId` (clé publique dérivée d'une seed locale),
 *              utile pour les tests de bout en bout du flux consentement. En
 *              production, `resolveCitizenPublicKey` doit interroger le registre
 *              souverain réel ; le mode DEV est REFUSÉ en `NODE_ENV=production`.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';
import { createHash } from 'node:crypto';
import type { Env } from '../config/env.schema.js';

/** Clé citoyen ancrée résolue (clé publique + état). */
export interface AnchoredKey {
  /** Clé publique Ed25519 (32 octets). */
  publicKey: Uint8Array;
  /** `kid` résolu (forme `cit:<citizenId>:ed25519:<version>`). */
  kid: string;
}

@Injectable()
export class CitizenKeyringService {
  private readonly logger = new Logger(CitizenKeyringService.name);
  private readonly isProd: boolean;
  /** Cache des clés DEV dérivées (par citizenId) — DEV uniquement. */
  private readonly devKeyCache = new Map<string, Uint8Array>();

  constructor(cfg: ConfigService<Env, true>) {
    this.isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
  }

  /**
   * Résout la clé publique ANCRÉE d'un citoyen pour un `kid` annoncé.
   *
   * Vérifie que :
   *   - le `kid` est bien la forme `cit:<citizenId>:ed25519:<version>` ;
   *   - la clé est ENRÔLÉE pour CE citizenId (anti-IDOR : pas de clé d'un autre
   *     citoyen), NON expirée, NON révoquée.
   *
   * @param citizenId Citoyen ciblé (UUID).
   * @param kid       `kid` annoncé dans l'en-tête JWS (NON vérifié à ce stade).
   * @returns La clé ancrée, ou `null` si non résolvable (→ rejet 403 uniforme).
   */
  async resolveCitizenPublicKey(citizenId: string, kid: string): Promise<AnchoredKey | null> {
    // Le `kid` DOIT lier explicitement le citizenId (anti-substitution de clé).
    const expectedPrefix = `cit:${citizenId}:ed25519:`;
    if (!kid.startsWith(expectedPrefix)) {
      return null;
    }

    // ⏳ Registre souverain réel non livré. En production on REFUSE (pas de
    // résolution dérivée à clé faible) ; en dev on dérive une clé déterministe.
    if (this.isProd) {
      this.logger.warn(
        'Registre de clés citoyen (Bloc A) non livré — résolution impossible en production.',
      );
      return null;
    }
    const priv = await this.devCitizenPrivateKey(citizenId);
    const publicKey = await ed.getPublicKeyAsync(priv);
    return { publicKey, kid };
  }

  /**
   * Clé PRIVÉE citoyen DÉTERMINISTE de développement (dérivée du citizenId).
   * JAMAIS utilisée en production — sert UNIQUEMENT à signer/vérifier un
   * consentement de test (la vraie clé privée vit sur l'appareil du citoyen).
   *
   * @param citizenId Citoyen (sert de seed de dérivation).
   */
  async devCitizenPrivateKey(citizenId: string): Promise<Uint8Array> {
    const cached = this.devKeyCache.get(citizenId);
    if (cached) return cached;
    const priv = new Uint8Array(
      createHash('sha256').update(`dev-citizen-key|${citizenId}`).digest(),
    );
    this.devKeyCache.set(citizenId, priv);
    return priv;
  }

  /** `kid` DEV canonique d'un citoyen (version 1). */
  devKid(citizenId: string): string {
    return `cit:${citizenId}:ed25519:1`;
  }
}
