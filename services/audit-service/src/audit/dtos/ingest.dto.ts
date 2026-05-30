/**
 * @file        ingest.dto.ts
 * @description DTO du endpoint POST /api/v1/audit (ingestion synchrone m2m).
 *              Validé par class-validator (ValidationPipe global).
 * @module      audit-service/audit/dtos
 */
import {
  IsIP,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestEventDto {
  @ApiProperty({ example: 'correction.approve', description: 'Action métier journalisée' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  action!: string;

  @ApiPropertyOptional({ example: 'CorrectionRequest' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @ApiPropertyOptional({ example: 'b1f2…uuid' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional({ description: 'UUID d’un user interne (doit exister en base)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: 'identity-service', description: 'Type/origine de l’acteur' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  actorType?: string;

  @ApiPropertyOptional({ description: 'État avant (JSON quelconque)' })
  @IsOptional()
  oldValue?: unknown;

  @ApiPropertyOptional({ description: 'État après (JSON quelconque)' })
  @IsOptional()
  newValue?: unknown;

  @ApiPropertyOptional({ example: '10.0.0.4' })
  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  correlationId?: string;

  @ApiPropertyOptional({ description: 'Identifiant d’événement (idempotence) ; auto-généré sinon' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceEventId?: string;

  @ApiPropertyOptional({ description: 'Horodatage métier ISO 8601 ; now() sinon' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
