/**
 * @file        initiate.dto.ts
 * @description DTOs de l'endpoint POST /enrollment/initiate.
 *
 *              POURQUOI class-validator ET PAS Zod ici : alignement sur le
 *              pattern identity-service existant. Migration vers Zod sera
 *              effectuée dans un second temps (Prompt 1.3 du v3.0) quand
 *              les schémas Zod centralisés de @nina-aes/shared-types seront
 *              consolidés.
 *
 * @module      enrollment-service/enrollment
 */

import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sexe encodé selon convention NINA (1 = masculin, 2 = féminin).
 * Pourquoi 1/2 et pas M/F : le NINA encode le sexe par chiffre dans son
 * premier caractère ; on garde la même représentation pour faciliter la
 * génération du numéro.
 */
export enum CitizenSex {
  MALE = '1',
  FEMALE = '2',
}

export class ParentInfoDto {
  @ApiProperty({ example: 'DIARRA', description: 'Nom de famille du parent' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'Mamadou', description: 'Prénoms du parent' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Cultivateur', description: 'Profession' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  profession?: string;
}

export class CitizenDataDto {
  @ApiProperty({ example: 'TRAORÉ', description: 'Nom de famille du citoyen' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'Aïssata', description: 'Prénoms du citoyen' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ enum: CitizenSex, example: CitizenSex.FEMALE })
  @IsEnum(CitizenSex)
  sex!: CitizenSex;

  @ApiProperty({ example: '1989-03-15', description: 'Date naissance ISO 8601' })
  @IsDateString()
  birthDate!: string;
}

export class InitiateEnrollmentDto {
  @ApiProperty({ description: "UUID de l'agent CTDEC effectuant l'enrôlement" })
  @IsUUID()
  agentId!: string;

  @ApiProperty({ description: "UUID du centre d'enrôlement" })
  @IsUUID()
  centerId!: string;

  @ApiProperty({ type: CitizenDataDto, description: 'Données du citoyen' })
  @Type(() => CitizenDataDto)
  citizenData!: CitizenDataDto;

  @ApiPropertyOptional({ type: ParentInfoDto, description: 'Informations père' })
  @IsOptional()
  @Type(() => ParentInfoDto)
  father?: ParentInfoDto;

  @ApiPropertyOptional({ type: ParentInfoDto, description: 'Informations mère' })
  @IsOptional()
  @Type(() => ParentInfoDto)
  mother?: ParentInfoDto;

  @ApiProperty({ description: 'UUID du lieu de naissance (commune)' })
  @IsUUID()
  birthLocationId!: string;
}

/**
 * Réponse de POST /enrollment/initiate.
 */
export class InitiateEnrollmentResponseDto {
  @ApiProperty({ description: "UUID de l'enrôlement créé" })
  enrollmentId!: string;

  @ApiProperty({
    description:
      'NINA proposé selon règles RAVEC — pas encore engagé en base, ' +
      'sera confirmé à la validation finale',
    example: '2890315112345678C',
  })
  proposedNina!: string;

  @ApiProperty({
    description: 'Prochaine étape attendue dans le workflow',
    example: 'JUSTIFICATIF_UPLOAD',
  })
  nextStep!: string;
}
