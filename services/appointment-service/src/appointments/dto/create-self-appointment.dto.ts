/**
 * @file        create-self-appointment.dto.ts
 * @description DTO de `POST /appointments/me` (self-service citoyen). Identique à
 *              `CreateAppointmentDto` MAIS **sans `citizenId`** : l'identité du
 *              citoyen est dérivée du NINA porté par son token (anti-IDOR — le
 *              client ne peut pas cibler le dossier d'autrui). Validé par
 *              class-validator (whitelist + forbidNonWhitelisted).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VULNERABILITY_CATEGORIES } from '../appointment.enums.js';

export class CreateSelfAppointmentDto {
  @ApiProperty({ description: 'UUID du centre (Institution.id = centerId).' })
  @IsUUID()
  centerId!: string;

  @ApiProperty({
    description: 'Créneau choisi (ISO 8601 UTC) — doit correspondre à un début de créneau.',
    example: '2026-06-08T08:30:00.000Z',
  })
  @IsISO8601()
  slot!: string;

  @ApiProperty({ description: 'Motif du rendez-vous.', example: 'Première inscription NINA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Catégorie de vulnérabilité (déclenche la file prioritaire). Validée contre ' +
      'une fiche active du domaine vulnérabilité : un citoyen ne peut pas s’auto-attribuer ' +
      'la priorité sans fiche.',
    enum: VULNERABILITY_CATEGORIES,
  })
  @IsOptional()
  @IsIn(VULNERABILITY_CATEGORIES)
  vulnerabilityCategory?: (typeof VULNERABILITY_CATEGORIES)[number];
}
