/**
 * @file        citizen.dto.ts
 * @description DTOs class-validator pour les opérations sur les citoyens.
 *
 *              Conventions :
 *                - Toutes les classes ont leur ApiProperty Swagger avec
 *                  exemples maliens réalistes (Mamadou Traoré, Bamako, etc.)
 *                - Validation strict : whitelist + forbidNonWhitelisted globaux
 *                - Format NINA : 14 chiffres + 1 lettre (cf. @nina-aes/utils)
 *
 * @module      identity-service/citizen
 */

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { MaritalStatus, Sex } from '@nina-aes/shared-types';

/** Regex NINA format normalisé (14 chiffres + 1 lettre majuscule). */
const NINA_REGEX = /^\d{14}[A-Z]$/;

// ─── POST /citizens ───────────────────────────────────────────────
export class CreateCitizenDto {
  @ApiProperty({
    example: '18903102015042V',
    description: 'NINA — 14 chiffres + 1 lettre de contrôle',
    pattern: '^[0-9]{14}[A-Z]$',
  })
  @IsString()
  @Length(15, 15)
  @Matches(NINA_REGEX, { message: 'Format NINA invalide (attendu : 14 chiffres + 1 lettre)' })
  nina!: string;

  @ApiProperty({ example: 'Mamadou', minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  firstName!: string;

  @ApiProperty({ example: 'Traoré', minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  lastName!: string;

  @ApiProperty({ enum: Sex, example: Sex.MALE })
  @IsEnum(Sex)
  sex!: Sex;

  @ApiProperty({ example: '1990-05-15', format: 'date' })
  @IsDateString({ strict: true })
  birthDate!: string;

  @ApiPropertyOptional({ enum: MaritalStatus, example: MaritalStatus.MARRIED })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional({ example: 'Comptable', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  profession?: string;

  @ApiProperty({ example: 'ML-09-03', description: 'Code Location niveau cercle ou commune' })
  @IsString()
  @MaxLength(40)
  birthPlaceCode!: string;

  @ApiPropertyOptional({ example: 'ML-09-03' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  residenceCode?: string;

  @ApiPropertyOptional({
    description: 'ID parent (père ou mère) déjà enregistré',
    example: 'b4f5d8c0-c5f4-4d8f-9d2a-1b2c3d4e5f6a',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

// ─── PUT /citizens/:id ────────────────────────────────────────────
/** Mise à jour partielle — tous les champs deviennent optionnels. */
export class UpdateCitizenDto extends PartialType(CreateCitizenDto) {}

// ─── GET /citizens?search=... ─────────────────────────────────────
export class SearchCitizenDto {
  @ApiPropertyOptional({
    description: 'Recherche fuzzy sur firstName + lastName (trigram + soundex)',
    example: 'Traore Mamadu',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 'ML-09', description: 'Code région (filtre exact)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  region?: string;

  @ApiPropertyOptional({ enum: Sex })
  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

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

  @ApiPropertyOptional({ description: 'Inclure les citoyens soft-deletés', default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted: boolean = false;
}
