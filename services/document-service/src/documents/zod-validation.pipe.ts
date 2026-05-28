/**
 * @file        zod-validation.pipe.ts
 * @description Pipe NestJS qui valide un body via un schéma Zod et
 *              retourne le payload typé. Lance BadRequestException si
 *              la validation échoue, avec un agrégat lisible des erreurs.
 *
 *              Pourquoi pas nestjs-zod ? Pour éviter une dépendance de
 *              plus alors que ~15 lignes suffisent.
 *
 * @module      document-service/documents
 */
import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType, z } from 'zod';

export class ZodBodyPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data as z.infer<T>;
  }
}
