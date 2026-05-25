/**
 * @file        argon.service.ts
 * @description Hashing de mots de passe avec Argon2id (OWASP 2024).
 *
 *              Paramètres lus depuis l'env validé :
 *                - ARGON2_MEMORY_KIB     (≥ 19 456 KiB ≈ 19 MiB)
 *                - ARGON2_ITERATIONS     (≥ 2)
 *                - ARGON2_PARALLELISM    (≥ 1)
 *
 *              Sel généré par argon2 (16 octets aléatoires) et inclus dans
 *              le hash final — pas de gestion manuelle de sel côté DB.
 *
 * @module      auth-service/crypto
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import type { AppEnv } from '../config/env.config.js';

@Injectable()
export class ArgonService {
  private readonly options: argon2.Options;

  constructor(config: ConfigService<AppEnv, true>) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: config.get('ARGON2_MEMORY_KIB', { infer: true }),
      timeCost: config.get('ARGON2_ITERATIONS', { infer: true }),
      parallelism: config.get('ARGON2_PARALLELISM', { infer: true }),
    };
  }

  /** Hash un mot de passe en clair. Le résultat est auto-suffisant (PHC string). */
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  /**
   * Vérifie un mot de passe contre un hash PHC. Retourne `false` sur tout
   * échec (hash malformé, mismatch) — ne jamais propager l'erreur pour
   * éviter de fuiter la cause (anti-oracle).
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain, this.options);
    } catch {
      return false;
    }
  }

  /**
   * Indique si un hash doit être re-calculé (paramètres OWASP plus stricts
   * que ceux du hash existant). À appeler après un login réussi pour
   * upgrader silencieusement les hashes historiques.
   */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.options);
  }
}
