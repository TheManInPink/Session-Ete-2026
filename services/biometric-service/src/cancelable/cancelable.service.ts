/**
 * @file        cancelable.service.ts
 * @description Service de PROTECTION DE TEMPLATE (ISO/IEC 24745). Orchestration :
 *                1) résout le PARAMÈTRE CANCELABLE d'un `transform_kid` depuis
 *                   Vault (lecture + cache mémoire court) ;
 *                2) applique la projection aléatoire signée (cancelable) au
 *                   vecteur de features → TEMPLATE PROTÉGÉ (octets opaques) ;
 *                3) compare deux templates protégés par DISTANCE de Hamming.
 *
 *              C'est l'unique point d'accès au paramètre Vault : la primitive pure
 *              `cancelableTransform` ne lit jamais Vault elle-même (testabilité +
 *              surface sensible minimale). Le paramètre clair est effacé
 *              best-effort après usage (`secure-buffer`).
 *
 *              🔒 DEV/TEST sans Vault — si `VAULT_CLIENT` est `null`
 *              (`BIOMETRIC_VAULT_ENABLED=false`), un paramètre cancelable
 *              DÉTERMINISTE est dérivé localement du `kid` (jamais en production :
 *              `VaultModule` fail-fast en prod). Permet de tester le matching flou
 *              sans dépendance Vault.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/cancelable
 */
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { VAULT_CLIENT } from '../vault/vault.module.js';
import {
  cancelableTransform,
  protectedDistance,
  scoreLeThreshold,
} from './cancelable.transform.js';
import { wipe } from './secure-buffer.js';

/** Schéma du secret KV attendu dans Vault (paramètre cancelable hex). */
interface CancelableSecret extends Record<string, unknown> {
  /** Octets hex du paramètre cancelable ACTIF (au moins pour ce path). */
  param_hex?: string;
  /** Variante multi-kids : map `kid → param_hex`. */
  keys?: Record<string, string>;
}

@Injectable()
export class CancelableService {
  private readonly logger = new Logger(CancelableService.name);
  private readonly secretPath: string;
  private readonly projDim: number;
  private readonly isProd: boolean;
  /** Cache mémoire court des paramètres résolus (par kid). Effacé au shutdown. */
  private readonly paramCache = new Map<string, Uint8Array>();

  constructor(
    cfg: ConfigService<Env, true>,
    @Optional() @Inject(VAULT_CLIENT) private readonly vault: VaultClient | null,
  ) {
    this.secretPath = cfg.get('BIOMETRIC_TRANSFORM_SECRET_PATH', { infer: true });
    this.projDim = cfg.get('BIOMETRIC_PROJECTION_DIM', { infer: true });
    this.isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
  }

  /**
   * Protège un vecteur de features avec le paramètre cancelable d'un `kid`.
   * Le paramètre est résolu (Vault/cache), utilisé, et le code protégé renvoyé.
   *
   * @param features Vecteur de features L2-normalisé (clair, éphémère).
   * @param kid      `transform_kid` (versionné, rotation).
   * @returns Octets du template protégé (code signe).
   */
  async protect(features: Float64Array, kid: string): Promise<Uint8Array> {
    const param = await this.resolveParam(kid);
    // On NE garde pas `param` au-delà de la transformation : il vient du cache,
    // mais la copie locale `protected` ne le contient pas. `param` reste dans le
    // cache (durée de vie du process) — acceptable car secret de PROJECTION, pas
    // une clé de déchiffrement ; rotation possible (double-écriture).
    return cancelableTransform(features, param, this.projDim, kid);
  }

  /**
   * Distance de Hamming normalisée entre deux templates protégés (codes signe).
   * Délègue à la primitive pure (boucle sans court-circuit, anti-timing §4.3).
   *
   * @param a Template protégé A.
   * @param b Template protégé B.
   */
  distance(a: Uint8Array, b: Uint8Array): number {
    return protectedDistance(a, b);
  }

  /**
   * Indique si `distance ≤ threshold` (test du seuil τ sur scalaire public).
   *
   * @param distance  Distance protégée.
   * @param threshold Seuil τ.
   */
  isMatch(distance: number, threshold: number): boolean {
    return scoreLeThreshold(distance, threshold);
  }

  /**
   * Résout (et met en cache) le paramètre cancelable d'un `kid`.
   *
   * @param kid `transform_kid` demandé.
   * @returns Octets du paramètre cancelable.
   * @throws ServiceUnavailableException si Vault est requis (prod) mais indispo.
   */
  private async resolveParam(kid: string): Promise<Uint8Array> {
    const cached = this.paramCache.get(kid);
    if (cached) return cached;

    let param: Uint8Array;
    if (this.vault) {
      try {
        const secret = await this.vault.getSecret<CancelableSecret>(this.secretPath);
        const hex = secret?.keys?.[kid] ?? secret?.param_hex;
        if (!hex) throw new Error(`paramètre absent pour kid=${kid}`);
        param = new Uint8Array(Buffer.from(hex, 'hex'));
      } catch (err) {
        // En production, pas de fallback : on ne dérive JAMAIS un paramètre faible.
        if (this.isProd) {
          throw new ServiceUnavailableException('BIOMETRIC_PARAM_UNAVAILABLE');
        }
        this.logger.warn(
          `Paramètre Vault indisponible (${(err as Error).message}) — ` +
            `dérivation DEV déterministe pour kid=${kid}.`,
        );
        param = this.devParam(kid);
      }
    } else {
      // Vault désactivé : interdit en prod (VaultModule fail-fast) → ici DEV/TEST.
      param = this.devParam(kid);
    }

    this.paramCache.set(kid, param);
    return param;
  }

  /**
   * Paramètre cancelable DÉTERMINISTE de développement (dérivé du `kid`). JAMAIS
   * utilisé en production (un vrai paramètre Vault à haute entropie est requis) ;
   * sert uniquement à valider le matching flou en test sans dépendance Vault.
   *
   * @param kid `transform_kid` (sert de domaine de dérivation).
   */
  private devParam(kid: string): Uint8Array {
    return new Uint8Array(createHash('sha256').update(`dev-cancelable|${kid}`).digest());
  }

  /** Efface le cache de paramètres au shutdown (best-effort). */
  clearCache(): void {
    for (const v of this.paramCache.values()) wipe(v);
    this.paramCache.clear();
  }
}
