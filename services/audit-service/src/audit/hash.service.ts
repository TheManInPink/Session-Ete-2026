/**
 * @file        hash.service.ts
 * @description Wrapper NestJS injectable autour des primitives pures de
 *              `chain.ts`. Permet l'injection DI + le mocking en test.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Injectable } from '@nestjs/common';
import {
  GENESIS_HASH,
  computeMerkleHash,
  computePayloadHash,
  sha256Hex,
  type AuditChainFields,
} from './chain.js';

@Injectable()
export class HashService {
  /** Hash de la racine de chaîne (entrée fictive N-1 de la 1re entrée). */
  readonly genesis = GENESIS_HASH;

  /** SHA-256 hexadécimal d'un texte/octets. */
  sha256(input: string | Uint8Array): string {
    return sha256Hex(input);
  }

  /** Hash canonique (JCS) du payload métier d'un événement. */
  payloadHash(fields: AuditChainFields): string {
    return computePayloadHash(fields);
  }

  /** `merkleHash` chaîné d'une entrée. */
  merkleHash(params: {
    previousHash: string;
    payloadHash: string;
    occurredAt: Date | string;
    sourceEventId: string;
  }): string {
    return computeMerkleHash(params);
  }
}
