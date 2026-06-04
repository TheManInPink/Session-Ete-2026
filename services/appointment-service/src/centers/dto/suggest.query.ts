/**
 * @file        suggest.query.ts
 * @description Paramètres de `GET /centers/suggest` — centre le plus proche
 *              disposant d'un créneau disponible.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsISO8601, IsIn, IsLatitude, IsLongitude, IsOptional } from 'class-validator';
import { CENTER_SERVICES } from '../center.types.js';

const toBool = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;

export class SuggestQuery {
  @ApiProperty({ description: 'Latitude du citoyen.', example: 12.6392 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ description: 'Longitude du citoyen.', example: -8.0029 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ description: 'Date de début (YYYY-MM-DD).', example: '2026-06-08' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Date de fin (YYYY-MM-DD).', example: '2026-06-15' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Chercher un créneau PRIORITAIRE (vulnérables).' })
  @IsOptional()
  @Transform(toBool)
  priority?: boolean;

  @ApiPropertyOptional({ description: 'Service offert requis.', enum: CENTER_SERVICES })
  @IsOptional()
  @IsIn(CENTER_SERVICES)
  service?: (typeof CENTER_SERVICES)[number];
}
