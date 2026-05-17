/**
 * @file        location.service.ts
 * @description Service de référentiel géographique Mali (8 niveaux).
 *
 *              Hiérarchie : Pays > Région > Cercle > Arrondissement >
 *                          Commune > Quartier > Village > Hameau
 *
 *              Toutes les méthodes sont READ-ONLY (le seeding est fait
 *              via `prisma db:seed` + `data/mali/*.json`, cf. doc 06 §5).
 *
 * @module      identity-service/location
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@nina-aes/database';
import { toAscii } from '@nina-aes/utils';

import type { ListLocationsDto, SearchLocationDto } from './dto/location.dto';

@Injectable()
export class LocationService {
  /** GET /locations — hiérarchie filtrable par level/parent. */
  async list(dto: ListLocationsDto): Promise<unknown[]> {
    const where: Prisma.LocationWhereInput = {};
    if (dto.level !== undefined) where.level = dto.level;
    if (dto.parent) {
      const parent = await prisma.location.findUnique({ where: { code: dto.parent } });
      if (!parent) {
        throw new NotFoundException(`Parent code='${dto.parent}' introuvable`);
      }
      where.parentId = parent.id;
    }
    return prisma.location.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500, // hard cap pour éviter de retourner les 12k villages d'un coup
    });
  }

  /**
   * GET /locations/:id — détail + chaîne des parents (ancêtres jusqu'à la racine).
   * Renvoie également le rang `level` et la "chaîne lisible" :
   *   "Mali > Bamako > Commune III"
   */
  async findById(id: string): Promise<{ location: unknown; ancestors: unknown[]; path: string }> {
    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException(`Location ${id} introuvable`);

    const ancestors: { id: string; name: string; level: number }[] = [];
    let cursor = location.parentId
      ? await prisma.location.findUnique({ where: { id: location.parentId } })
      : null;
    while (cursor) {
      ancestors.unshift({ id: cursor.id, name: cursor.name, level: cursor.level });
      cursor = cursor.parentId
        ? await prisma.location.findUnique({ where: { id: cursor.parentId } })
        : null;
      if (ancestors.length > 10) break; // garde-fou cyclique
    }

    const path = [...ancestors.map((a) => a.name), location.name].join(' > ');
    return { location, ancestors, path };
  }

  /**
   * GET /locations/search?q=Sikaso — recherche fuzzy ASCII (ILIKE).
   *
   * Index trigram requis sur `nameAscii` côté Postgres (cf. doc 06 §3.4).
   */
  async search(dto: SearchLocationDto): Promise<unknown[]> {
    if (!dto.q || dto.q.trim().length < 2) {
      return [];
    }
    const tokens = toAscii(dto.q)
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    return prisma.location.findMany({
      where: {
        AND: tokens.map((tok) => ({
          OR: [
            { nameAscii: { contains: tok, mode: 'insensitive' as const } },
            { code: { contains: tok, mode: 'insensitive' as const } },
          ],
        })),
      },
      take: 30,
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }
}
