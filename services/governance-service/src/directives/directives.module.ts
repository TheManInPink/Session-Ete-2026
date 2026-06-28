/**
 * @file        directives.module.ts
 * @description Module Directives Kanban (Bloc C2).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/directives
 */
import { Module } from '@nestjs/common';
import { DirectivesController } from './directives.controller.js';
import { DirectivesService } from './directives.service.js';
import { DirectivesRepository } from './directives.repository.js';

@Module({
  controllers: [DirectivesController],
  providers: [DirectivesService, DirectivesRepository],
  exports: [DirectivesService],
})
export class DirectivesModule {}
