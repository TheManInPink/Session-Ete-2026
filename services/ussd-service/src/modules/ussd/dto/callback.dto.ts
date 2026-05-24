/**
 * @file        callback.dto.ts
 * @description DTO du webhook Africa's Talking.
 *
 *              Le format est imposé par Africa's Talking — voir
 *              https://developers.africastalking.com/docs/ussd/overview
 */

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UssdCallbackDto {
  @ApiProperty({ description: "ID unique de la session USSD (Africa's Talking)" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sessionId!: string;

  @ApiProperty({ description: "Code court d'accès (ex. *123*NINA#)" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  serviceCode!: string;

  @ApiProperty({
    description: "Numéro de téléphone de l'utilisateur, format E.164",
    example: '+22366123456',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phoneNumber!: string;

  @ApiProperty({
    description: 'Texte cumulé des entrées utilisateur séparées par `*`. Vide au premier appel.',
    example: '1*2',
  })
  @IsString()
  @MaxLength(512)
  text!: string;
}
