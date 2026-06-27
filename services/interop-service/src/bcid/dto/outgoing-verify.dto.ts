/**
 * @file        outgoing-verify.dto.ts
 * @description DTO du déclenchement d'un appel SORTANT verify-nina vers un
 *              partenaire (route admin protégée par JWT interne + rôle).
 *              Validé par class-validator (ValidationPipe global).
 * @module      interop-service/bcid/dto
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, Matches } from 'class-validator';
import { AES_COUNTRIES, NINA_PATTERN, VERIFY_PURPOSES } from '../bcid.constants.js';

export class OutgoingVerifyDto {
  @ApiProperty({ enum: AES_COUNTRIES, description: 'Pays détenteur du NINA (BFA/NER).' })
  @IsIn(AES_COUNTRIES as unknown as string[])
  targetCountry!: (typeof AES_COUNTRIES)[number];

  @ApiProperty({ example: '18903102015042V', description: 'NINA (14 chiffres + 1 lettre).' })
  @Matches(NINA_PATTERN, { message: 'NINA invalide (14 chiffres + 1 lettre)' })
  nina!: string;

  @ApiProperty({ enum: VERIFY_PURPOSES, description: 'Finalité (purpose limitation RGPD).' })
  @IsIn(VERIFY_PURPOSES as unknown as string[])
  purpose!: (typeof VERIFY_PURPOSES)[number];
}
