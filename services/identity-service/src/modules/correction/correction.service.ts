/**
 * @file        correction.service.ts
 * @description Workflow de correction NINA.
 *
 *              Pipeline `submit` (POST /corrections) :
 *                1. Valider que le Citizen existe
 *                2. Persister CorrectionRequest (status=UNDER_REVIEW)
 *                3. Appeler ai-service /detect-errors (HTTP, timeout 5s)
 *                4. Appeler anticorruption-service /check-operation (timeout 3s)
 *                5. Mettre à jour le CorrectionRequest avec aiScore + aiVerdict
 *                6. Publier `correction.submitted` (audit-service consume)
 *
 *              Pipeline `approve` (PUT /:id/approve) :
 *                1. Lire CorrectionRequest + Citizen
 *                2. Appliquer la modification sur Citizen
 *                3. Mettre à jour CorrectionRequest (status=APPROVED, decidedAt, reviewedBy)
 *                4. Publier `correction.approved`
 *
 *              Pipeline `reject` (PUT /:id/reject) :
 *                1. Mettre à jour status=REJECTED + decisionReason
 *                2. Publier `correction.rejected`
 *
 * @module      identity-service/correction
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { prisma, Prisma } from '@nina-aes/database';
import { CorrectionStatus } from '@nina-aes/shared-types';

import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import type {
  ListCorrectionsDto,
  RejectCorrectionDto,
  SubmitCorrectionDto,
} from './dto/correction.dto';

/** Résultat de l'analyse IA d'une correction. */
interface AiAnalysisResult {
  score: number; // 0-100
  verdict: 'auto_approve' | 'auto_reject' | 'agent_review';
  explanation?: Record<string, unknown>;
}

/** Résultat de la vérification anti-corruption. */
interface SigacCheckResult {
  riskLevel: 'low' | 'medium' | 'high';
  alertId?: string;
}

@Injectable()
export class CorrectionService {
  private readonly logger = new Logger(CorrectionService.name);
  private readonly aiUrl = process.env.AI_SERVICE_URL ?? 'http://ai-service:3003';
  private readonly sigacUrl = process.env.SIGAC_SERVICE_URL ?? 'http://anticorruption-service:3009';
  private readonly mockMode = process.env.MOCK_EXTERNAL_SERVICES === 'true';

  constructor(
    private readonly http: HttpService,
    private readonly rabbit: RabbitMQService,
  ) {}

  /** POST /corrections — pipeline complet. */
  async submit(dto: SubmitCorrectionDto, actorId?: string): Promise<unknown> {
    const citizen = await prisma.citizen.findUnique({ where: { id: dto.citizenId } });
    if (!citizen || citizen.deletedAt) {
      throw new NotFoundException(`Citoyen ${dto.citizenId} introuvable`);
    }

    // 1. Persister la demande en status UNDER_REVIEW
    let correction = await prisma.correctionRequest.create({
      data: {
        citizenId: dto.citizenId,
        requestedByUserId: actorId,
        field: dto.field,
        currentValue: dto.currentValue,
        proposedValue: dto.proposedValue,
        reason: dto.reason,
        justificationDocUrl: dto.justificationDocUrl,
        status: CorrectionStatus.UNDER_REVIEW,
      },
    });

    // 2. Appel IA (en parallèle avec SIGAC pour minimiser la latence)
    const [ai, sigac] = await Promise.all([
      this.callAi(dto, citizen.nina),
      this.callSigac(dto, citizen.nina, actorId),
    ]);

    // 3. Mettre à jour avec les résultats IA
    correction = await prisma.correctionRequest.update({
      where: { id: correction.id },
      data: {
        aiScore: ai.score,
        aiVerdict: ai.verdict,
        aiExplanation: (ai.explanation ?? {}) as Prisma.InputJsonValue,
      },
    });

    // 4. Si SIGAC flag HIGH, on log mais on n'arrête pas le workflow
    if (sigac.riskLevel === 'high') {
      this.logger.warn(
        `Correction ${correction.id} : SIGAC alerte HIGH (alertId=${sigac.alertId})`,
      );
    }

    // 5. Publier l'événement
    await this.rabbit.publish(
      'correction.submitted',
      {
        correctionId: correction.id,
        citizenId: citizen.id,
        nina: citizen.nina,
        field: dto.field,
        aiScore: ai.score,
        aiVerdict: ai.verdict,
        sigacRisk: sigac.riskLevel,
      },
      actorId,
    );

    return correction;
  }

  /** GET /corrections (paginated + filtres). */
  async list(dto: ListCorrectionsDto): Promise<{
    data: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.CorrectionRequestWhereInput = {
      deletedAt: null,
    };
    if (dto.status) where.status = dto.status;
    if (dto.agent) where.reviewedBy = dto.agent;
    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dto.from);
      if (dto.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(dto.to);
    }

    const skip = (dto.page - 1) * dto.pageSize;
    const [data, total] = await Promise.all([
      prisma.correctionRequest.findMany({
        where,
        skip,
        take: dto.pageSize,
        include: { citizen: { select: { id: true, nina: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.correctionRequest.count({ where }),
    ]);
    return { data, total, page: dto.page, pageSize: dto.pageSize };
  }

  /** GET /corrections/:id. */
  async findById(id: string): Promise<unknown> {
    const correction = await prisma.correctionRequest.findUnique({
      where: { id },
      include: { citizen: true },
    });
    if (!correction || correction.deletedAt) {
      throw new NotFoundException(`Correction ${id} introuvable`);
    }
    return correction;
  }

  /** PUT /corrections/:id/approve — applique la modification au Citizen. */
  async approve(id: string, actorId?: string): Promise<unknown> {
    const correction = await prisma.correctionRequest.findUnique({
      where: { id },
      include: { citizen: true },
    });
    if (!correction || correction.deletedAt) {
      throw new NotFoundException(`Correction ${id} introuvable`);
    }
    if (correction.status !== CorrectionStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Correction ${id} pas en état UNDER_REVIEW (état actuel : ${correction.status})`,
      );
    }

    // Applique la modification au Citizen (uniquement les champs allowlistés)
    const allowedFields = new Set([
      'firstName',
      'lastName',
      'profession',
      'maritalStatus',
    ]);
    if (!allowedFields.has(correction.field)) {
      throw new BadRequestException(
        `Champ '${correction.field}' non modifiable via une correction directe`,
      );
    }

    await prisma.$transaction([
      prisma.citizen.update({
        where: { id: correction.citizenId },
        data: { [correction.field]: correction.proposedValue, version: { increment: 1 } },
      }),
      prisma.correctionRequest.update({
        where: { id },
        data: {
          status: CorrectionStatus.APPROVED,
          reviewedBy: actorId,
          decidedAt: new Date(),
        },
      }),
    ]);

    this.logger.log(`Correction approuvée : id=${id} actor=${actorId}`);
    await this.rabbit.publish(
      'correction.approved',
      { correctionId: id, citizenId: correction.citizenId },
      actorId,
    );

    return this.findById(id);
  }

  /** PUT /corrections/:id/reject — rejet avec motif obligatoire. */
  async reject(id: string, dto: RejectCorrectionDto, actorId?: string): Promise<unknown> {
    const correction = await prisma.correctionRequest.findUnique({ where: { id } });
    if (!correction || correction.deletedAt) {
      throw new NotFoundException(`Correction ${id} introuvable`);
    }
    if (correction.status !== CorrectionStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        `Correction ${id} pas en état UNDER_REVIEW (état actuel : ${correction.status})`,
      );
    }

    const updated = await prisma.correctionRequest.update({
      where: { id },
      data: {
        status: CorrectionStatus.REJECTED,
        reviewedBy: actorId,
        decidedAt: new Date(),
        decisionReason: dto.reason,
      },
    });

    this.logger.log(`Correction rejetée : id=${id} actor=${actorId}`);
    await this.rabbit.publish(
      'correction.rejected',
      { correctionId: id, reason: dto.reason },
      actorId,
    );

    return updated;
  }

  // ─── Clients HTTP externes (best-effort en dev) ────────────────
  private async callAi(dto: SubmitCorrectionDto, nina: string): Promise<AiAnalysisResult> {
    if (this.mockMode) {
      return { score: 75, verdict: 'agent_review', explanation: { mock: true } };
    }
    const fallback: AiAnalysisResult = { score: 50, verdict: 'agent_review' };
    try {
      const response$ = this.http
        .post<AiAnalysisResult>(`${this.aiUrl}/api/v1/detect-errors`, {
          nina,
          field: dto.field,
          current: dto.currentValue,
          proposed: dto.proposedValue,
          reason: dto.reason,
        })
        .pipe(
          timeout(5000),
          map((res) => res.data),
          catchError(() => of(fallback)),
        );
      return await firstValueFrom(response$);
    } catch {
      return fallback;
    }
  }

  private async callSigac(
    dto: SubmitCorrectionDto,
    nina: string,
    actorId?: string,
  ): Promise<SigacCheckResult> {
    if (this.mockMode) {
      return { riskLevel: 'low' };
    }
    const fallback: SigacCheckResult = { riskLevel: 'low' };
    try {
      const response$ = this.http
        .post<SigacCheckResult>(`${this.sigacUrl}/api/v1/check-operation`, {
          operation: 'correction.submit',
          nina,
          actorId,
          field: dto.field,
        })
        .pipe(
          timeout(3000),
          map((res) => res.data),
          catchError(() => of(fallback)),
        );
      return await firstValueFrom(response$);
    } catch {
      return fallback;
    }
  }
}
