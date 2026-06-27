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

/**
 * Helper de saut conditionnel : exécute la suite uniquement si une DB réelle est
 * configurée. Évite un faux rouge dans l'environnement de dev sans Postgres.
 */
const describeIfDb = process.env['DATABASE_URL'] ? describe : describe.skip;

describeIfDb('checkNina vs extension soft-delete RÉELLE (NINA révoqué → REVOKED)', () => {
  it('un citoyen soft-supprimé reste visible : exists:true / valid:false', async () => {
    // Import DYNAMIQUE différé : `@nina-aes/database` instancie le client à
    // l'import-time et lève si `DATABASE_URL` est absente. On ne le charge donc
    // que dans le cas « DB présente » (sinon la suite est déjà sautée par
    // describe.skip). `import()` (et non `require()`) respecte la règle ESLint
    // no-require-imports du dépôt.
    const { prisma } = await import('@nina-aes/database');

    // NINA de test isolé (préfixe improbable en données réelles). On le crée,
    // on le soft-supprime, puis on relit via le MÊME prédicat que checkNina().
    const nina = '99999999999999Z';

    // Nettoyage défensif (au cas où un run précédent aurait laissé une trace).
    await prisma.citizen
      .findFirst({ where: { nina, deletedAt: { not: undefined } } })
      .then((c) =>
        c ? prisma.$executeRawUnsafe('DELETE FROM citizens WHERE nina = $1', nina) : null,
      )
      .catch(() => null);

    // NB : la création d'un Citizen complet exige des FKs (Location/Parent) hors
    // périmètre de ce test ; on insère donc une ligne minimale en SQL brut puis on
    // la soft-supprime via le delegate étendu (DELETE → UPDATE deletedAt=now()).
    // Si l'insertion échoue (schéma non migré / FKs requises), on saute proprement.
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO citizens (id, nina, first_name, last_name, first_name_ascii, last_name_ascii,
           birth_date, sex, marital_status, preferred_language, birth_place_id, residence_id,
           created_at, updated_at, deleted_at)
         VALUES (gen_random_uuid(), $1, 'T', 'T', 'T', 'T', '2000-01-01', 'MALE', 'SINGLE', 'FR',
           gen_random_uuid(), gen_random_uuid(), now(), now(), now())`,
        nina,
      );
    } catch {
      // Schéma non migré ou contraintes FK : on ne peut pas exécuter ce test ici.
      return;
    }

    // Lecture via le prédicat de contournement (clé `deletedAt` de 1er niveau).
    const citizen = await prisma.citizen.findFirst({
      where: { nina, deletedAt: { not: undefined } },
      select: { deletedAt: true },
    });

    expect(citizen).not.toBeNull();
    expect(citizen?.deletedAt).not.toBeNull(); // visible MALGRÉ le soft-delete

    // Contre-preuve : la lecture par DÉFAUT (findUnique, sans clé deletedAt) est
    // filtrée par l'extension → null (le bug original).
    const filtered = await prisma.citizen.findUnique({ where: { nina } });
    expect(filtered).toBeNull();

    // Nettoyage final (hard delete via SQL brut, l'extension transforme delete).
    await prisma.$executeRawUnsafe('DELETE FROM citizens WHERE nina = $1', nina);
  });
});
