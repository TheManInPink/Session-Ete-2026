/**
 * @file        send.dto.ts
 * @description DTO de l'endpoint POST /notifications/send (envoi unique).
 *              Validé par class-validator (ValidationPipe global, whitelist).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { LANGUAGES } from '../channels/channel.types.js';

/** Canaux acceptés en entrée (minuscule, normalisés ensuite). */
export const CHANNEL_INPUTS = ['sms', 'email', 'push', 'ussd'] as const;
/** Niveaux de priorité acceptés. */
export const PRIORITY_INPUTS = ['P1', 'P2', 'P3'] as const;

export class SendNotificationDto {
  @ApiProperty({
    description: "Adresse destinataire : numéro E.164 (SMS), email, ou jeton d'appareil (push).",
    example: '+22376000000',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  recipient!: string;

  @ApiPropertyOptional({
    description: 'Canal forcé. Si absent, déduit du format du destinataire / profil.',
    enum: CHANNEL_INPUTS,
  })
  @IsOptional()
  @IsIn(CHANNEL_INPUTS)
  channel?: (typeof CHANNEL_INPUTS)[number];

  @ApiProperty({ description: 'Clé de template (cf. GET /templates).', example: 'mfa-code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  template!: string;

  @ApiPropertyOptional({
    description: "Variables d'interpolation du template.",
    example: { code: '482913', ttl: 5 },
  })
  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number>;

  @ApiPropertyOptional({ description: 'Priorité opérationnelle.', enum: PRIORITY_INPUTS })
  @IsOptional()
  @IsIn(PRIORITY_INPUTS)
  priority?: (typeof PRIORITY_INPUTS)[number];

  @ApiPropertyOptional({ description: 'Langue de rendu (défaut : FR).', enum: LANGUAGES })
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: (typeof LANGUAGES)[number];

  @ApiPropertyOptional({ description: 'UUID du citoyen destinataire (historique/FK).' })
  @IsOptional()
  @IsUUID()
  recipientCitizenId?: string;

  @ApiPropertyOptional({ description: 'UUID de l’utilisateur destinataire (historique/FK).' })
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @ApiPropertyOptional({
    description:
      "Clé d'idempotence explicite. Si absente, dérivée de (recipient+canal+template+variables).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}
