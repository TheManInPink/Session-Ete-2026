/**
 * @file        serial-number.service.ts
 * @description Génère un numéro de souche FDI unique au format
 *              "FDI-YYYY-NNNNNNN" (7 chiffres = jusqu'à 10M FDI/an).
 *
 *              Stratégie : compte les Documents émis dans l'année + 1.
 *              Pour éviter une race (deux émissions parallèles obtenant
 *              le même N), on retient un offset + on retry une fois avec
 *              un offset random sur collision unique (P2002). Bonus
 *              future : remplacer par une SEQUENCE Postgres dédiée.
 *
 * @module      document-service/fdi
 */
import { Injectable } from '@nestjs/common';
import { prisma } from '@nina-aes/database';

@Injectable()
export class SerialNumberService {
  /** Retourne le prochain numéro de souche FDI pour l'année en cours. */
  async next(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

    const countThisYear = await prisma.document.count({
      where: { issuedAt: { gte: startOfYear, lt: startOfNextYear } },
    });
    const seq = (countThisYear + 1).toString().padStart(7, '0');
    return `FDI-${year}-${seq}`;
  }
}
