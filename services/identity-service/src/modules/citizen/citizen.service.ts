import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@nina-aes/database';
import { normalizeNina } from '@nina-aes/utils';
import type { ApiResponse, PaginatedResponse, Citizen } from '@nina-aes/shared-types';

@Injectable()
export class CitizenService {
  async findByNina(nina: string): Promise<ApiResponse<any>> {
    const normalized = normalizeNina(nina);
    const citizen = await prisma.citizen.findUnique({
      where: { ninaNumber: normalized },
      include: {
        birthPlace: true,
        residence: true,
        parent: true,
      },
    });

    if (!citizen) {
      throw new NotFoundException(`NINA ${nina} non trouvé`);
    }

    return {
      success: true,
      data: citizen,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  async search(params: {
    lastName?: string;
    firstName?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<any>> {
    const { lastName, firstName, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (lastName) where.lastName = { contains: lastName, mode: 'insensitive' };
    if (firstName) where.firstName = { contains: firstName, mode: 'insensitive' };

    const [citizens, total] = await Promise.all([
      prisma.citizen.findMany({ where, skip, take: limit, include: { birthPlace: true } }),
      prisma.citizen.count({ where }),
    ]);

    return {
      success: true,
      data: citizens,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  async create(data: any): Promise<ApiResponse<any>> {
    // TODO: Implement full creation logic with validation
    return { success: true, data: null, meta: { timestamp: new Date().toISOString() } };
  }

  async update(id: string, data: any): Promise<ApiResponse<any>> {
    // TODO: Implement update with audit logging
    return { success: true, data: null, meta: { timestamp: new Date().toISOString() } };
  }
}
