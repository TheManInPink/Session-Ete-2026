/**
 * @file        revocation.service.ts
 * @description Liste de révocation des jti FDI dans Redis.
 *              TTL aligné sur l'expiration JWT (au-delà, le jeton est
 *              naturellement invalide → mémoire libérée automatiquement).
 *
 * @module      document-service/qr
 */
import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class RevocationService {
  private readonly prefix = 'qr:rev:';

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Ajoute un jti à la liste de révocation.
   *
   * @param jti      identifiant unique du JWT à révoquer
   * @param expiresAt date d'expiration originale du JWT
   */
  async add(jti: string, expiresAt: Date): Promise<void> {
    const ttlSec = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    await this.redis.set(`${this.prefix}${jti}`, '1', 'EX', ttlSec);
  }

  /** Retourne true si le jti a été révoqué. */
  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(`${this.prefix}${jti}`)) === 1;
  }
}
