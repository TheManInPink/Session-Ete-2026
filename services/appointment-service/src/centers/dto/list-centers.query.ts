/**
 * @file        list-centers.query.ts
 * @description Paramètres de requête de `GET /centers` (filtres). Validés par
 *              class-validator ; les nombres et booléens sont convertis depuis
 *              la query string par le ValidationPipe (transform: true).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CENTER_SERVICES } from '../center.types.js';

/** Convertit "1"/"true"/"yes"/"on" en booléen (tolérant). */
const toBool = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;

export class ListCentersQuery {
  @ApiPropertyOptional({ description: 'Code région (préfixe, ex. "ML-02").', example: 'ML-02' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({
    description: 'Code cercle (préfixe, ex. "ML-02-04").',
    example: 'ML-02-04',
  })
  @IsOptional()
  @IsString()
  cercle?: string;

  @ApiPropertyOptional({ description: 'Service offert requis.', enum: CENTER_SERVICES })
  @IsOptional()
  @IsIn(CENTER_SERVICES)
  service?: (typeof CENTER_SERVICES)[number];

  @ApiPropertyOptional({ description: 'Ne renvoyer que les centres ouverts maintenant.' })
  @IsOptional()
  @Transform(toBool)
  openNow?: boolean;

  @ApiPropertyOptional({ description: 'Latitude du point de recherche (recherche géo).' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude du point de recherche (recherche géo).' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'Rayon de recherche en km (avec lat/lng).', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  radius?: number;
}
