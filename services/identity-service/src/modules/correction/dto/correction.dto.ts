/**
 * @file        correction.dto.ts
 * @description DTOs pour le workflow de correction NINA.
 *
 *              Workflow :
 *                citoyen soumet → IA score → SIGAC check → agent valide/rejette
 *
 * @module      identity-service/correction
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CorrectionStatus } from '@nina-aes/shared-types';

// ─── POST /corrections ────────────────────────────────────────────
export class SubmitCorrectionDto {
  @ApiProperty({
    description: 'UUID interne du citoyen concerné',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  citizenId!: string;

  @ApiProperty({
    description: 'Champ à corriger (firstName, lastName, birthDate, profession, ...)',
    example: 'firstName',
  })
  @IsString()
  @MaxLength(50)
  field!: string;

  @ApiProperty({ example: 'Mamadu', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  currentValue!: string;

  @ApiProperty({ example: 'Mamadou', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  proposedValue!: string;

  @ApiProperty({
    description: 'Motif de la correction (texte libre, min 20 chars)',
    example: 'Erreur de translittération sur la carte papier — diphtongue \"ou\" omise.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({
    description: 'URL MinIO du justificatif scanné (CIN, acte de naissance...)',
  })
  @IsOptional()
  @IsString()
  justificationDocUrl?: string;
}

// ─── PUT /corrections/:id/reject ──────────────────────────────────
export class RejectCorrectionDto {
  @ApiProperty({
    description: 'Motif obligatoire du rejet (min 20 chars)',
    example: 'Justificatif illisible — demander un scan de meilleure qualité.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason!: string;
}

// ─── GET /corrections?status=...&page=... ────────────────────────
export class ListCorrectionsDto {
  @ApiPropertyOptional({ enum: CorrectionStatus })
  @IsOptional()
  @IsEnum(CorrectionStatus)
  status?: CorrectionStatus;

  @ApiPropertyOptional({ description: 'UUID agent assigné' })
  @IsOptional()
  @IsUUID()
  agent?: string;

  @ApiPropertyOptional({ description: 'Date de début (ISO)', example: '2026-05-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Date de fin (ISO)', example: '2026-05-17' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
