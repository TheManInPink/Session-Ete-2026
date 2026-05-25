/**
 * @file        zod-validation.pipe.ts
 * @description Pipe Nest qui valide la payload entrante avec un schéma Zod.
 *              Évite la duplication class-validator/Zod et conserve une seule
 *              source de vérité pour les DTOs (les `z.infer<typeof Schema>`).
 *
 * @example
 *   `@UsePipes(new ZodValidationPipe(RegisterVerifySchema))
 *    @Post('verify')
 *    verify(@Body() body: RegisterVerifyDto) { ... }`
 *
 * @module      auth-service/common
 */

import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      });
    }
    return result.data;
  }
}
