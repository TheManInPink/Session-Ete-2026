/**
 * @file        availability.query.ts
 * @description Paramètres de `GET /centers/:id/availability` — fenêtre de dates.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class AvailabilityQuery {
  @ApiPropertyOptional({
    description: 'Date de début (YYYY-MM-DD). Défaut : aujourd’hui.',
    example: '2026-06-08',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Date de fin (YYYY-MM-DD). Défaut : début + 7 jours.',
    example: '2026-06-12',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
