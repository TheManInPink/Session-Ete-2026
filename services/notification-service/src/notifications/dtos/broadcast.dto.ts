/**
 * @file        broadcast.dto.ts
 * @description DTO de l'endpoint POST /notifications/broadcast (envoi en masse,
 *              rôle ADMIN). Un template commun + une liste de destinataires
 *              (variables fusionnées : communes + par destinataire).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LANGUAGES } from '../channels/channel.types.js';
import { CHANNEL_INPUTS, PRIORITY_INPUTS } from './send.dto.js';

/** Un destinataire d'un broadcast. */
export class BroadcastRecipientDto {
  @ApiProperty({ description: 'Adresse destinataire (E.164 / email / jeton push).' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  recipient!: string;

  @ApiPropertyOptional({ description: 'Variables propres à ce destinataire (fusion prioritaire).' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number>;

  @ApiPropertyOptional({ description: 'UUID du citoyen destinataire.' })
  @IsOptional()
  @IsUUID()
  recipientCitizenId?: string;

  @ApiPropertyOptional({ description: 'UUID de l’utilisateur destinataire.' })
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;
}

export class BroadcastDto {
  @ApiProperty({ description: 'Clé de template commune.', example: 'appointment-reminder-24h' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  template!: string;

  @ApiPropertyOptional({
    description: 'Canal forcé (sinon déduit par destinataire).',
    enum: CHANNEL_INPUTS,
  })
  @IsOptional()
  @IsIn(CHANNEL_INPUTS)
  channel?: (typeof CHANNEL_INPUTS)[number];

  @ApiPropertyOptional({ description: 'Langue commune (défaut FR).', enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: (typeof LANGUAGES)[number];

  @ApiPropertyOptional({ description: 'Priorité.', enum: PRIORITY_INPUTS })
  @IsOptional()
  @IsIn(PRIORITY_INPUTS)
  priority?: (typeof PRIORITY_INPUTS)[number];

  @ApiPropertyOptional({ description: 'Variables communes à tous les destinataires.' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number>;

  @ApiProperty({
    description: 'Liste des destinataires (1 à 10 000).',
    type: [BroadcastRecipientDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10_000)
  @ValidateNested({ each: true })
  @Type(() => BroadcastRecipientDto)
  recipients!: BroadcastRecipientDto[];
}
