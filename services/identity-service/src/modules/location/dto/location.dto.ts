/**
 * @file        location.dto.ts
 * @description DTOs hiérarchie géographique Mali (8 niveaux).
 * @module      identity-service/location
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListLocationsDto {
  @ApiPropertyOptional({
    description: 'Niveau administratif (1=région, 2=cercle, 3=arrondissement, 4=commune, ...)',
    minimum: 1,
    maximum: 8,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  level?: number;

  @ApiPropertyOptional({ description: 'Code Location parent (ex. ML-09 pour cercles de Bamako)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  parent?: string;
}

export class SearchLocationDto {
  @ApiPropertyOptional({ description: 'Texte à rechercher (fuzzy ASCII)', example: 'Sikaso' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
