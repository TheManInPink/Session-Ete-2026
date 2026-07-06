/**
 * @file        soft-delete-bypass.int.spec.ts
 * @description Test d'INTÉGRATION contre le VRAI client Prisma étendu
 *              (`@nina-aes/database`, extension soft-delete réelle) — et non un
 *              mock. Il prouve la correction de la fuite de sémantique
 *              « NINA révoqué » : un citoyen soft-supprimé (`deletedAt != null`)
 *              DOIT rester visible par `checkNina` (verdict REVOKED), alors que
 *              le mock unitaire (qui contourne l'extension) donnait une fausse
 *              confiance.
 *
 *              ⚠️ Nécessite une base PostgreSQL réelle migrée
 *              (`DATABASE_URL` défini + migration `bcid_aes_interop` Phase 2).
 *              En l'absence de `DATABASE_URL`, le bloc est SAUTÉ (et NON échoué)
 *              car l'import de `@nina-aes/database` lève si l'URL est absente.
 *              Ce test sert de filet en CI lorsque la DB est provisionnée.
 *
 * @module      interop-service/test
 */

import { randomUUID } from 'node:crypto';

/**
 * Helper de saut conditionnel : exécute la suite uniquement si une DB réelle est
 * configurée. Évite un faux rouge dans l'environnement de dev sans Postgres.
 */
const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

describeIfDb('checkNina vs extension soft-delete RÉELLE (NINA révoqué → REVOKED)', () => {
  // NINA + code de Location isolés (préfixes improbables en données réelles).
  const NINA = '99999999999999Z';
  const LOC_CODE = 'ZZ-99';

  afterAll(async () => {
    // Fermeture propre de la connexion Prisma ouverte par le singleton — évite
    // qu'un log async fuite après la fin de la suite (« Cannot log after tests
    // are done ») et qu'un worker Jest reste suspendu.
    const { disconnectPrisma } = await import('@nina-aes/database');
    await disconnectPrisma();
  });

  it('un citoyen soft-supprimé reste visible : exists:true / valid:false', async () => {
    // Import DYNAMIQUE différé (résolu vers la SOURCE TS par le moduleNameMapper
    // de jest.config : le dist de `@nina-aes/database` est de l'ESM que le
    // runtime CommonJS de Jest ne peut pas charger). Le client Prisma est
    // instancié à l'import-time et lève si `DATABASE_URL` est absente : la suite
    // étant gardée par `describeIfDb`, on n'arrive ici que DB présente.
    const { prisma } = await import('@nina-aes/database');
    const locationId = randomUUID();

    // Le Citizen exige des FKs Location valides (birth_place_id / residence_id →
    // locations). On fabrique une Location JETABLE plutôt que des UUID
    // synthétiques : ces derniers violeraient la FK (23503) et Prisma
    // journaliserait l'erreur de façon ASYNCHRONE, APRÈS la fin du test. On
    // maîtrise ainsi le graphe relationnel sans dépendre d'un seed CI.

    // Nettoyage défensif (citizen AVANT location : la FK l'impose).
    await prisma.$executeRawUnsafe('DELETE FROM citizens WHERE nina = $1', NINA);
    await prisma.$executeRawUnsafe('DELETE FROM locations WHERE code = $1', LOC_CODE);

    // Location jetable : parent_id NULL (pas de self-FK), level 99 (hors
    // hiérarchie administrative réelle 0–3).
    await prisma.$executeRawUnsafe(
      `INSERT INTO locations (id, code, name, name_ascii, level, created_at, updated_at)
         VALUES ($1, $2, 'Fixture soft-delete', 'FIXTURE SOFT DELETE', 99, now(), now())`,
      locationId,
      LOC_CODE,
    );

    // Citizen minimal soft-supprimé d'emblée (deleted_at = now()), en SQL brut
    // (la création via le delegate exigerait tout le graphe relationnel).
    await prisma.$executeRawUnsafe(
      `INSERT INTO citizens (id, nina, first_name, last_name, first_name_ascii, last_name_ascii,
         birth_date, sex, marital_status, preferred_language, birth_place_id, residence_id,
         created_at, updated_at, deleted_at)
       VALUES (gen_random_uuid(), $1, 'T', 'T', 'T', 'T', '2000-01-01', 'MALE', 'SINGLE', 'FR',
         $2, $2, now(), now(), now())`,
      NINA,
      locationId,
    );

    try {
      // Lecture via le prédicat de contournement (clé `deletedAt` de 1er niveau) :
      // l'extension respecte tout prédicat explicite sur `deletedAt` → visible.
      const citizen = await prisma.citizen.findFirst({
        where: { nina: NINA, deletedAt: { not: undefined } },
        select: { deletedAt: true },
      });
      expect(citizen).not.toBeNull();
      expect(citizen?.deletedAt).not.toBeNull(); // visible MALGRÉ le soft-delete

      // Contre-preuve : la lecture par DÉFAUT (findUnique, sans clé deletedAt) est
      // filtrée par l'extension → null (le bug original).
      const filtered = await prisma.citizen.findUnique({ where: { nina: NINA } });
      expect(filtered).toBeNull();
    } finally {
      // Nettoyage final, citizen AVANT location (hard delete via SQL brut).
      await prisma.$executeRawUnsafe('DELETE FROM citizens WHERE nina = $1', NINA);
      await prisma.$executeRawUnsafe('DELETE FROM locations WHERE code = $1', LOC_CODE);
    }
  });
});
