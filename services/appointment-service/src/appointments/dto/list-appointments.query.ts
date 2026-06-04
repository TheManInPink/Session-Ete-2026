/**
 * @file        list-appointments.query.ts
 * @description Paramètres de `GET /appointments` (filtres citoyen / statut / centre).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { APPOINTMENT_STATUS_VALUES, type AppointmentStatus } from '../appointment.enums.js';

export class ListAppointmentsQuery {
  @ApiPropertyOptional({ description: 'Filtre par citoyen (UUID).' })
  @IsOptional()
  @IsUUID()
  citizenId?: string;

  @ApiPropertyOptional({ description: 'Filtre par statut.', enum: APPOINTMENT_STATUS_VALUES })
  @IsOptional()
  @IsIn(APPOINTMENT_STATUS_VALUES)
  status?: AppointmentStatus;

  @ApiPropertyOptional({ description: 'Filtre par centre (UUID = institutionId).' })
  @IsOptional()
  @IsUUID()
  centerId?: string;

  @ApiPropertyOptional({ description: 'Page (1-based). Défaut : 1.', minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Taille de page (1–200). Défaut : 50.', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
