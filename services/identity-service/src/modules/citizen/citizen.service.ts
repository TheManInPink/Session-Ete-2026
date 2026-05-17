/**
 * @file        citizen.service.ts
 * @description Service métier — gestion des citoyens NINA.
 *
 *              Responsabilités :
 *                1. CRUD sur la table `citizens` via Prisma
 *                2. Recherche fuzzy via index trigram Postgres (firstNameAscii)
 *                3. Cache Redis lecture par NINA (TTL 5 min)
 *                4. Publication événements RabbitMQ (citizen.created/updated)
 *                5. Soft delete (jamais de hard delete pour audit)
 *
 *              Hors scope V1 :
 *                - Recherche Elasticsearch (fallback Postgres trigram OK pour < 1M lignes)
 *                - Audit côté audit-service (event-driven, consume RabbitMQ)
 *
 * @module      identity-service/citizen
 */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma } from '@nina-aes/database';
import { normalizeNina, toAscii } from '@nina-aes/utils';

import { RabbitMQService } from '../../infrastructure/rabbitmq/rabbitmq.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import type {
  CreateCitizenDto,
  SearchCitizenDto,
  UpdateCitizenDto,
} from './dto/citizen.dto';

/** Inclut systématiquement birthPlace + residence + father + mother (utile pour PDF FDI). */
const CITIZEN_INCLUDE = {
  birthPlace: true,
  residence: true,
  father: true,
  mother: true,
} satisfies Prisma.CitizenInclude;

@Injectable()
export class CitizenService {
  private readonly logger = new Logger(CitizenService.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Récupère un citoyen par son NINA (avec cache Redis).
   *
   * @throws NotFoundException si NINA inconnu ou soft-deleté.
   */
  async findByNina(nina: string): Promise<unknown> {
    const normalized = normalizeNina(nina);

    const cacheKey = `citizen:nina:${normalized}`;
    const cached = await this.redis.get<unknown>(cacheKey).catch(() => null);
    if (cached !== null) return cached;

    const citizen = await prisma.citizen.findUnique({
      where: { nina: normalized },
      include: CITIZEN_INCLUDE,
    });
    if (!citizen || citizen.deletedAt) {
      throw new NotFoundException(`NINA ${normalized} introuvable`);
    }

    await this.redis.set(cacheKey, citizen, 300).catch(() => undefined);
    return citizen;
  }

  /** Récupère par UUID interne. */
  async findById(id: string): Promise<unknown> {
    const citizen = await prisma.citizen.findUnique({
      where: { id },
      include: CITIZEN_INCLUDE,
    });
    if (!citizen || citizen.deletedAt) {
      throw new NotFoundException(`Citoyen ${id} introuvable`);
    }
    return citizen;
  }

  /**
   * Recherche paginée avec filtres + fuzzy search.
   *
   * Stratégie fuzzy :
   *   - `search` est normalisé ASCII puis split en tokens (>= 2 chars)
   *   - Chaque token est cherché ILIKE sur firstNameAscii OU lastNameAscii OU nina
   *   - Index GIN trigram pour la perf (cf. doc 06 §4.3)
   */
  async search(dto: SearchCitizenDto): Promise<{
    data: unknown[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const where: Prisma.CitizenWhereInput = {
      deletedAt: dto.includeDeleted ? undefined : null,
    };

    if (dto.region) {
      where.OR = [
        { birthPlace: { code: { startsWith: dto.region } } },
        { residence: { code: { startsWith: dto.region } } },
      ];
    }

    if (dto.sex) where.sex = dto.sex;

    if (dto.search?.trim()) {
      const tokens = toAscii(dto.search)
        .split(/\s+/)
        .filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        where.AND = tokens.map((tok) => ({
          OR: [
            { firstNameAscii: { contains: tok, mode: 'insensitive' as const } },
            { lastNameAscii: { contains: tok, mode: 'insensitive' as const } },
            { nina: { contains: tok, mode: 'insensitive' as const } },
          ],
        }));
      }
    }

    const skip = (dto.page - 1) * dto.pageSize;
    const [data, total] = await Promise.all([
      prisma.citizen.findMany({
        where,
        skip,
        take: dto.pageSize,
        include: CITIZEN_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.citizen.count({ where }),
    ]);

    return { data, total, page: dto.page, pageSize: dto.pageSize };
  }

  /** Crée un nouveau citoyen + publie `citizen.created`. */
  async create(dto: CreateCitizenDto, actorId?: string): Promise<unknown> {
    const normalized = normalizeNina(dto.nina);
    const existing = await prisma.citizen.findUnique({ where: { nina: normalized } });
    if (existing) {
      throw new ConflictException(`NINA ${normalized} déjà enregistré (id=${existing.id})`);
    }

    // Résolution des codes Location → UUID interne
    const birthPlace = await prisma.location.findUnique({
      where: { code: dto.birthPlaceCode },
    });
    if (!birthPlace) {
      throw new NotFoundException(`Location birthPlaceCode='${dto.birthPlaceCode}' inconnu`);
    }
    let residence = birthPlace;
    if (dto.residenceCode && dto.residenceCode !== dto.birthPlaceCode) {
      const res = await prisma.location.findUnique({ where: { code: dto.residenceCode } });
      if (!res) {
        throw new NotFoundException(`Location residenceCode='${dto.residenceCode}' inconnu`);
      }
      residence = res;
    }

    const created = await prisma.citizen.create({
      data: {
        nina: normalized,
        firstName: dto.firstName,
        lastName: dto.lastName,
        firstNameAscii: toAscii(dto.firstName),
        lastNameAscii: toAscii(dto.lastName),
        sex: dto.sex,
        birthDate: new Date(dto.birthDate),
        maritalStatus: dto.maritalStatus,
        profession: dto.profession,
        birthPlaceId: birthPlace.id,
        residenceId: residence.id,
        fatherId: dto.parentId,
      },
      include: CITIZEN_INCLUDE,
    });

    this.logger.log(`Citoyen créé : NINA=${normalized} id=${created.id} actor=${actorId ?? 'anonymous'}`);

    await this.rabbit.publish(
      'citizen.created',
      { citizenId: created.id, nina: created.nina },
      actorId,
    );

    return created;
  }

  /** Met à jour un citoyen + publie `citizen.updated` avec diff avant/après. */
  async update(id: string, dto: UpdateCitizenDto, actorId?: string): Promise<unknown> {
    const before = await prisma.citizen.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException(`Citoyen ${id} introuvable`);
    }

    const data: Prisma.CitizenUpdateInput = {};
    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName;
      data.firstNameAscii = toAscii(dto.firstName);
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName;
      data.lastNameAscii = toAscii(dto.lastName);
    }
    if (dto.sex !== undefined) data.sex = dto.sex;
    if (dto.birthDate !== undefined) data.birthDate = new Date(dto.birthDate);
    if (dto.maritalStatus !== undefined) data.maritalStatus = dto.maritalStatus;
    if (dto.profession !== undefined) data.profession = dto.profession;
    if (dto.birthPlaceCode !== undefined) {
      const loc = await prisma.location.findUnique({ where: { code: dto.birthPlaceCode } });
      if (!loc) throw new NotFoundException(`birthPlaceCode='${dto.birthPlaceCode}' inconnu`);
      data.birthPlace = { connect: { id: loc.id } };
    }
    if (dto.residenceCode !== undefined) {
      const loc = await prisma.location.findUnique({ where: { code: dto.residenceCode } });
      if (!loc) throw new NotFoundException(`residenceCode='${dto.residenceCode}' inconnu`);
      data.residence = { connect: { id: loc.id } };
    }

    // Verrou optimiste
    data.version = { increment: 1 };

    const updated = await prisma.citizen.update({
      where: { id },
      data,
      include: CITIZEN_INCLUDE,
    });

    this.logger.log(`Citoyen MAJ : id=${id} actor=${actorId ?? 'anonymous'}`);
    await this.redis.invalidate(`citizen:nina:${before.nina}*`).catch(() => undefined);
    await this.rabbit.publish(
      'citizen.updated',
      { citizenId: id, before, after: updated },
      actorId,
    );

    return updated;
  }

  /** Soft delete — réservé rôle ADMIN par le guard, jamais hard delete. */
  async softDelete(id: string, actorId?: string): Promise<{ id: string; deletedAt: Date }> {
    const before = await prisma.citizen.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Citoyen ${id} introuvable`);
    if (before.deletedAt) return { id, deletedAt: before.deletedAt };

    const deleted = await prisma.citizen.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    this.logger.warn(`Citoyen soft-deleted : id=${id} actor=${actorId ?? 'anonymous'}`);
    await this.redis.invalidate(`citizen:nina:${before.nina}*`).catch(() => undefined);
    await this.rabbit.publish('citizen.deleted', { citizenId: id }, actorId);

    return { id, deletedAt: deleted.deletedAt! };
  }
}
