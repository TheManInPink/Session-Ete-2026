/**
 * @file        minio.service.ts
 * @description Wrapper MinIO (S3-compatible) pour le bucket `fiches`.
 *
 *              Le bucket doit exister AU PRÉALABLE avec :
 *                - Object Lock activé à la création (`mc mb --with-lock`)
 *                - Rétention COMPLIANCE 10 ans par défaut
 *                  (`mc retention set --default compliance "3650d"`)
 *              Voir docs/10 §10.1 + ADR-026. Le service ne crée pas le bucket
 *              lui-même (irréversible) — c'est la responsabilité de l'infra.
 *
 *              Méthodes exposées :
 *                - put(input)        : upload + retention COMPLIANCE 10 ans
 *                - presignDownload   : URL pré-signée 1h
 *                - exists            : statObject (utile healthcheck)
 *
 * @module      document-service/storage
 */
import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import type { Env } from '../config/env.schema';

/** Ajoute N années à une date (UTC stable). */
function addYears(date: Date, years: number): Date {
  const out = new Date(date.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

export interface PutObjectInput {
  /** NINA du citoyen (préfixe d'objet pour partitionner par citoyen). */
  nina: string;
  /** Identifiant unique du JWT (utilisé comme nom de fichier). */
  jti: string;
  /** Contenu PDF/A-3b. */
  buffer: Buffer;
}

export interface PutObjectResult {
  objectKey: string;
  versionId: string;
  retainUntil: Date;
  /** URL pré-signée HTTPS valable 1h. */
  presignedUrl: string;
}

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly log = new Logger(MinioService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly retentionYears: number;

  constructor(cfg: ConfigService<Env, true>) {
    this.client = new MinioClient({
      endPoint: cfg.get('MINIO_ENDPOINT', { infer: true }),
      port: cfg.get('MINIO_PORT', { infer: true }),
      useSSL: cfg.get('MINIO_USE_SSL', { infer: true }),
      accessKey: cfg.get('MINIO_ACCESS_KEY', { infer: true }),
      secretKey: cfg.get('MINIO_SECRET_KEY', { infer: true }),
    });
    this.bucket = cfg.get('MINIO_BUCKET_FICHES', { infer: true });
    this.retentionYears = cfg.get('MINIO_RETENTION_YEARS', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    try {
      const ok = await this.client.bucketExists(this.bucket);
      if (!ok) {
        this.log.warn(
          `Bucket "${this.bucket}" introuvable — créez-le avec ` +
            `\`mc mb --with-lock local/${this.bucket}\` ` +
            `puis \`mc retention set --default compliance "3650d"\`. ` +
            `Le service démarre, mais POST /fdi échouera.`,
        );
      } else {
        this.log.log(`Bucket "${this.bucket}" prêt`);
      }
    } catch (err) {
      this.log.warn(`MinIO ping échoué : ${(err as Error).message}`);
    }
  }

  /**
   * Upload du PDF FDI avec rétention COMPLIANCE 10 ans (Object Lock).
   *
   * @throws ServiceUnavailableException si MinIO n'est pas joignable.
   */
  async put(input: PutObjectInput): Promise<PutObjectResult> {
    const objectKey = `${input.nina}/${input.jti}.pdf`;
    const retainUntil = addYears(new Date(), this.retentionYears);

    try {
      const result = await this.client.putObject(
        this.bucket,
        objectKey,
        input.buffer,
        input.buffer.length,
        {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="fdi-${input.jti}.pdf"`,
          'x-amz-object-lock-mode': 'COMPLIANCE',
          'x-amz-object-lock-retain-until-date': retainUntil.toISOString(),
        },
      );
      const presignedUrl = await this.client.presignedGetObject(
        this.bucket,
        objectKey,
        60 * 60, // 1h
      );
      return {
        objectKey,
        versionId: result.versionId ?? '',
        retainUntil,
        presignedUrl,
      };
    } catch (err) {
      throw new ServiceUnavailableException(
        `MinIO put échoué pour ${objectKey} : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Génère une URL pré-signée (1h par défaut) sur un objet existant.
   */
  async presignDownload(
    objectKey: string,
    bucket: string = this.bucket,
    expiresSec = 60 * 60,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, objectKey, expiresSec);
  }

  /** Vérifie l'existence d'un objet (HEAD). */
  async exists(objectKey: string, bucket: string = this.bucket): Promise<boolean> {
    try {
      await this.client.statObject(bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  }

  /** Ping MinIO — utilisé par Terminus healthcheck. */
  async ping(): Promise<boolean> {
    try {
      await this.client.bucketExists(this.bucket);
      return true;
    } catch {
      return false;
    }
  }
}
