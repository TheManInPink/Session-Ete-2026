/**
 * @file        query.dto.ts
 * @description DTOs de lecture : recherche paginée, vérification, export.
 * @module      audit-service/audit/dtos
 */
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Filtres communs de lecture des logs. */
export class AuditFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional({ description: 'Borne basse occurredAt (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;
  @ApiPropertyOptional({ description: 'Borne haute occurredAt (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/** Recherche paginée. */
export class QueryAuditDto extends AuditFilterDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip = 0;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take = 50;
}

/** Vérification d'intégrité sur un intervalle d'ids. */
export class VerifyRangeDto {
  @ApiPropertyOptional({ default: 1, description: 'id de début (inclus)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from = 1;

  @ApiPropertyOptional({ default: 9007199254740991, description: 'id de fin (inclus)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  to: number = Number.MAX_SAFE_INTEGER;
}
