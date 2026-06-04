/**
 * @file        centers.module.ts
 * @description Module des centres d'enrôlement (lecture, disponibilités,
 *              suggestion). Exporte CentersService + CentersRepository pour
 *              l'appointments-module (validation des créneaux à la réservation).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { Module } from '@nestjs/common';
import { CentersController } from './centers.controller.js';
import { CentersService } from './centers.service.js';
import { CentersRepository } from './centers.repository.js';

@Module({
  controllers: [CentersController],
  providers: [CentersService, CentersRepository],
  exports: [CentersService, CentersRepository],
})
export class CentersModule {}
