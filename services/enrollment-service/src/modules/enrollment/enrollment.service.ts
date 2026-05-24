/**
 * @file        enrollment.service.ts
 * @description Logique métier de l'enrôlement.
 *
 *              MVP — fonctionnalités livrées :
 *              - initiate(): génère un NINA candidat selon les règles RAVEC,
 *                          stocke l'enrôlement en mémoire (le persistage
 *                          Prisma sera ajouté dans une 2e passe).
 *              - getStatus(): consulte un enrôlement par ID.
 *
 *              À LIVRER DANS LA 2e PASSE (Prompt 3.8 du v3.0) :
 *              - intégration Prisma (table enrollments)
 *              - upload justificatif (délégation document-service)
 *              - vérification anti-doublon (délégation ai-service)
 *              - validation finale agent (création citoyen via identity-service)
 *              - endpoint /offline-sync idempotent
 *              - publication événements RabbitMQ
 *
 * @module      enrollment-service/enrollment
 */

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import { maskNina } from '@nina-aes/logger';
import type { StructuredLogger } from '@nina-aes/logger';

import {
  CitizenSex,
  type InitiateEnrollmentDto,
  type InitiateEnrollmentResponseDto,
} from './dto/initiate.dto.js';

/**
 * Statut interne d'un enrôlement (cycle de vie).
 */
type EnrollmentStatus =
  | 'INITIATED' // créé, en attente du justificatif
  | 'JUSTIFICATIF_UPLOADED' // PDF/photo reçu(e)
  | 'VALIDATED_AGENT' // validé par l'agent CTDEC
  | 'CONFIRMED_CITIZEN' // citoyen créé en base identity-service
  | 'REJECTED'; // rejeté avec motif

interface EnrollmentRecord {
  id: string;
  status: EnrollmentStatus;
  agentId: string;
  centerId: string;
  proposedNina: string;
  data: InitiateEnrollmentDto;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class EnrollmentService {
  /**
   * Storage en mémoire pour le MVP. À remplacer par Prisma dans la 2e passe.
   *
   * ⚠️ AVERTISSEMENT : ce storage est PERDU à chaque redémarrage. Ne JAMAIS
   * déployer ce service en prod en l'état.
   */
  private readonly records = new Map<string, EnrollmentRecord>();

  constructor(@InjectLogger() private readonly logger: StructuredLogger) {}

  /**
   * Crée un nouvel enrôlement et propose un NINA candidat.
   *
   * @param dto - Données validées par class-validator dans le controller.
   * @returns {InitiateEnrollmentResponseDto} ID et NINA proposé.
   *
   * @throws HttpException(422, E_ENR_001) si la date de naissance est invalide.
   */
  async initiate(dto: InitiateEnrollmentDto): Promise<InitiateEnrollmentResponseDto> {
    const log = this.logger.withContext({
      extra: { operation: 'initiate', agentId: dto.agentId },
    });

    // Génération du NINA candidat selon les règles RAVEC.
    // Note : la génération définitive (séquence dans la commune) sera faite
    // par identity-service lors de la validation finale. Ici on produit un
    // NINA "proposé" qui sert à pré-visualiser et détecter les doublons.
    const proposedNina = this.generateProposedNina(dto);

    log.info(
      {
        ninaMasked: maskNina(proposedNina),
        centerId: dto.centerId,
      },
      'Enrôlement initié',
    );

    const id = randomUUID();
    const now = new Date();
    const record: EnrollmentRecord = {
      id,
      status: 'INITIATED',
      agentId: dto.agentId,
      centerId: dto.centerId,
      proposedNina,
      data: dto,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(id, record);

    return {
      enrollmentId: id,
      proposedNina,
      nextStep: 'JUSTIFICATIF_UPLOADED',
    };
  }

  /**
   * Consulte le statut d'un enrôlement.
   *
   * @throws HttpException(404, E_ENR_NOT_FOUND) si l'enrôlement n'existe pas.
   */
  async getStatus(id: string): Promise<{
    enrollmentId: string;
    status: EnrollmentStatus;
    proposedNina: string;
    createdAt: string;
    updatedAt: string;
  }> {
    const record = this.records.get(id);
    if (!record) {
      throw new HttpException(
        { code: 'E_ENR_NOT_FOUND', message: 'Enrôlement introuvable' },
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      enrollmentId: record.id,
      status: record.status,
      proposedNina: record.proposedNina,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Génère un NINA candidat selon les règles documentées :
   *   X YY ZZ Z ZZ ZZZ ZZZ A
   *   |  |  |  | |  |    |  └─ Lettre de contrôle (calculée)
   *   |  |  |  | |  |    └──── Séquentiel commune (000 ici, finalisé par identity)
   *   |  |  |  | |  └───────── Code commune (000 ici, à dériver depuis birthLocationId)
   *   |  |  |  | └──────────── Code cercle (00)
   *   |  |  |  └────────────── Code région (0)
   *   |  |  └───────────────── Mois de naissance (01-12)
   *   |  └──────────────────── Année de naissance (2 derniers chiffres)
   *   └─────────────────────── Sexe (1=M, 2=F)
   *
   * MVP : on génère un NINA placeholder avec zéros pour les codes géo.
   * La résolution géographique réelle nécessite une requête sur
   * @nina-aes/database pour résoudre birthLocationId → région/cercle/commune.
   * Cela sera ajouté dans la 2e passe.
   *
   * @throws HttpException(422, E_ENR_001) si la date est non parsable.
   */
  private generateProposedNina(dto: InitiateEnrollmentDto): string {
    const date = new Date(dto.citizenData.birthDate);
    if (Number.isNaN(date.getTime())) {
      throw new HttpException(
        {
          code: 'E_ENR_001',
          message: 'Date de naissance invalide',
          details: { birthDate: dto.citizenData.birthDate },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const year = String(date.getUTCFullYear()).slice(-2);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const sex = dto.citizenData.sex === CitizenSex.MALE ? '1' : '2';

    // MVP : placeholder géo + séquentiel (à finaliser par identity-service)
    const geoRegion = '0';
    const geoCercle = '00';
    const geoCommune = '000';
    const sequence = '000';

    const base = `${sex}${year}${month}${geoRegion}${geoCercle}${geoCommune}${sequence}`;
    // Lettre de contrôle simple (à remplacer par l'algo RAVEC officiel)
    const checkLetter = this.computeCheckLetter(base);

    return `${base}${checkLetter}`;
  }

  /**
   * Calcule la lettre de contrôle d'un NINA (algo simple A-Z modulo 26).
   *
   * ⚠️ MVP : algo de DÉMONSTRATION uniquement. L'algorithme RAVEC officiel
   * n'est pas public — l'étudiant devra obtenir la spec auprès du CTDEC
   * pour la version production. Le test de checksum côté ai-service est
   * actuellement permissif.
   */
  private computeCheckLetter(digits: string): string {
    let sum = 0;
    for (const c of digits) sum += Number.parseInt(c, 10);
    const idx = sum % 26;
    return String.fromCharCode('A'.charCodeAt(0) + idx);
  }
}
