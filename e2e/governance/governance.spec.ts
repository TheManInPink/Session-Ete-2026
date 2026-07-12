/**
 * @file        governance.spec.ts
 * @description Specs d'assertion du portail GOUVERNANCE (port 4003, mode mock).
 *
 *              Couvre la connexion, GOV-01 (messagerie SGOGT branchée sur
 *              `@nina-aes/api-client` : fixtures déterministes, vérification de
 *              signature JWS, accusé de lecture automatique, composition d'un
 *              message stateful) et GOV-02 (Kanban de directives : 5 colonnes =
 *              statuts serveur, drag légal persistant, rejet à note
 *              obligatoire), plus les 2 stubs honnêtes et la sidebar SGOGT.
 *
 *              Mode mock (NINA_AUTH_MODE=mock) : session « haut fonctionnaire »
 *              `mock-gov-001`, destinataire de l'inbox mock. Le magasin mock est
 *              STATEFUL par session navigateur : les assertions de persistance
 *              passent par une navigation CLIENT (sidebar) — un rechargement
 *              complet réinitialiserait l'état.
 *
 * @module      @nina-aes/governance
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

// ── Constantes tirées des fixtures déterministes (governance.fixtures.ts) ────
// Sujets/titres EXACTS (apostrophes typographiques comprises) — toute dérive
// des fixtures doit casser ces specs, c'est voulu.

/** Fil « incident sécurité RAVEC » — contient le message CRITICAL non lu. */
const INCIDENT_THREAD_SUBJECT = 'Signalement — tentative d’accès anormale au fichier RAVEC';
/** Extrait du corps du message CRITICAL (proche de son échéance d'escalade). */
const INCIDENT_CRITICAL_BODY = /transfert sortant non autorisé/;
/** Interlocutrice du fil incident (annuaire mock). */
const INCIDENT_SENDER = 'Commissaire Awa Sangaré';

/** Directive SENT des fixtures — cible du drag légal SENT → IN_PROGRESS. */
const DIRECTIVE_SENT_TITLE = 'Campagne nationale de fiabilisation de l’état civil';
/** Directive DRAFT des fixtures — cible du rejet (DRAFT → REJECTED). */
const DIRECTIVE_DRAFT_TITLE = 'Plan de formation des agents de saisie RAVEC';
/** Directive IN_PROGRESS escaladée (escalationLevel = 1). */
const DIRECTIVE_ESCALATED_TITLE = 'Audit trimestriel des centres CTDEC (T2 2026)';

/** Libellé du badge de signature vérifiée (JWS RS256 serveur — pas Ed25519). */
const SIGNATURE_VERIFIED_LABEL = 'Signature électronique vérifiée (JWS)';

/**
 * Bannière d'erreur de transition (gouvernance.directives.transitionError). On
 * cible ce TEXTE précis plutôt qu'un `getByRole('alert')` générique : @dnd-kit
 * monte une live-region d'accessibilité (annonces de drag) que Playwright
 * expose aussi comme rôle « alert » — l'assertion large donnait un faux positif.
 */
const TRANSITION_ERROR_TEXT = /Transition refusée/;

/**
 * Glisse une carte @dnd-kit vers une colonne cible avec la souris : le
 * PointerSensor exige > 5 px de déplacement avant d'activer le drag, d'où le
 * petit mouvement initial, puis une trajectoire en plusieurs pas.
 */
async function dragCardTo(page: Page, card: Locator, column: Locator): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  const from = await card.boundingBox();
  const to = await column.boundingBox();
  if (!from || !to) throw new Error('dragCardTo : boundingBox indisponible (élément non visible)');
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Franchit la contrainte d'activation (distance: 5) sans quitter la carte.
  await page.mouse.move(startX + 12, startY + 8, { steps: 3 });
  // Rejoint la colonne cible (zone droppable = toute la section).
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 160), { steps: 12 });
  await page.mouse.up();
}

test.describe('Gouvernance — connexion', () => {
  test('la page de connexion répond et affiche un titre', async ({ page }) => {
    const res = await page.goto('/fr/login');
    expect(res?.status() ?? 0).toBeLessThan(400);
    // Mode mock : soit le formulaire Keycloak s'affiche, soit on est déjà
    // redirigé vers un écran authentifié — les deux ont un h1.
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('GOV-01 — Messagerie officielle signée', () => {
  test('affiche les fils des fixtures (bandeau démo, priorités, recherche)', async ({ page }) => {
    await page.goto('/fr/messagerie');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Conversations' })).toBeVisible();

    // Bandeau d'honnêteté du mode mock — libellé JWS (plus aucun « Ed25519 »).
    await expect(page.getByText(/Données de démonstration/).first()).toBeVisible();

    // Les 3 fils des fixtures, identifiés par leur interlocuteur (annuaire mock).
    const list = page.getByRole('list', { name: 'Conversations' });
    await expect(list.getByText('Dr Aminata Maïga')).toBeVisible();
    await expect(list.getByText('Colonel Souleymane Dembélé')).toBeVisible();
    await expect(list.getByText(INCIDENT_SENDER)).toBeVisible();

    // Le fil incident porte le badge CRITIQUE (message proche de l'escalade).
    await expect(list.getByText('Critique', { exact: true })).toBeVisible();

    // État vide : une recherche sans correspondance l'affiche.
    const search = page.getByPlaceholder(/Rechercher une conversation/);
    await search.fill('zzz-aucune-correspondance');
    await expect(list.getByText('Aucune conversation')).toBeVisible();
  });

  test('ouvre le fil incident : signature JWS vérifiée + accusé de lecture auto', async ({
    page,
  }) => {
    await page.goto('/fr/messagerie');
    await page.getByRole('button', { name: new RegExp(INCIDENT_SENDER) }).click();

    // Fil affiché (aria-label = sujet du premier message du fil).
    const log = page.getByRole('log', { name: INCIDENT_THREAD_SUBJECT });
    await expect(log.getByText(INCIDENT_CRITICAL_BODY)).toBeVisible();

    // Le dernier message est inspecté d'office → vérification JWS (mock : valide).
    await expect(log.getByText(SIGNATURE_VERIFIED_LABEL)).toBeVisible();
    await expect(log.getByText('Signataire')).toBeVisible();

    // L'autre message du fil garde son contrôle de signature à la demande.
    await expect(log.getByRole('button', { name: 'Vérifier la signature' })).toBeVisible();

    // ACK automatique à l'ouverture : le CRITICAL non lu passe en accusé de
    // réception (mock stateful : readAt posé puis inbox rafraîchie).
    await expect(log.getByText('Non lu par le destinataire')).toHaveCount(0);
    await expect(log.getByText(/Accusé de réception/).first()).toBeVisible();
  });

  test('compose un message officiel → il apparaît dans le fil (mock stateful)', async ({
    page,
  }) => {
    await page.goto('/fr/messagerie');
    await page.getByRole('button', { name: 'Nouveau message' }).click();

    const dialog = page.getByRole('dialog', { name: 'Nouveau message officiel' });
    await expect(dialog).toBeVisible();

    // Destinataire : 1re entrée réelle de l'annuaire (l'option 0 est le placeholder).
    await dialog.locator('#compose-recipient').selectOption({ index: 1 });
    await dialog.locator('#compose-subject').fill('Convocation du comité de pilotage RAVEC');
    await dialog.locator('#compose-priority').selectOption('HIGH');
    await dialog
      .locator('#compose-body')
      .fill('Merci de préparer l’ordre du jour consolidé du comité de pilotage pour lundi 10 h.');
    await dialog.getByRole('button', { name: 'Envoyer' }).click();
    await expect(dialog).not.toBeVisible();

    // Le message émis ouvre son fil : corps visible + signature JWS vérifiée.
    const log = page.getByRole('log', { name: 'Convocation du comité de pilotage RAVEC' });
    await expect(log.getByText(/ordre du jour consolidé/)).toBeVisible();
    await expect(log.getByText(SIGNATURE_VERIFIED_LABEL)).toBeVisible();

    // Le nouveau fil apparaît dans la liste des conversations.
    const list = page.getByRole('list', { name: 'Conversations' });
    await expect(list.getByText('Convocation du comité de pilotage RAVEC')).toBeVisible();
  });
});

test.describe('GOV-02 — Directives (Kanban)', () => {
  // Les 5 colonnes (w-64) + la sidebar dépassent 1280 px : on élargit pour que
  // la colonne « Rejetée » soit visible sans auto-scroll pendant le drag.
  test.use({ viewport: { width: 1800, height: 900 } });

  test('affiche les 5 colonnes serveur et les cartes des fixtures', async ({ page }) => {
    await page.goto('/fr/directives');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Suivi des directives' }),
    ).toBeVisible();

    // Colonnes = statuts serveur (l'ancienne colonne « Escaladée » a disparu).
    for (const col of ['Brouillon', 'Envoyée', 'En cours', 'Terminée', 'Rejetée']) {
      await expect(page.getByRole('region', { name: new RegExp(`^${col} \\(`) })).toBeVisible();
    }

    // Cartes fixtures à leur place initiale.
    await expect(
      page
        .getByRole('region', { name: /^En cours \(/ })
        .getByText('Déploiement des antennes RAVEC mobiles — région de Kayes'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: /^Rejetée \(/ })
        .getByText('Enquête sur les doublons NINA — région de Mopti'),
    ).toBeVisible();

    // L'escalade est un badge de carte (escalationLevel = 1), plus une colonne.
    const escalatedCard = page.locator('article', { hasText: DIRECTIVE_ESCALATED_TITLE });
    await expect(escalatedCard.getByText('Escalade N+1')).toBeVisible();
  });

  test('drag légal SENT → IN_PROGRESS : le statut persiste (mock stateful)', async ({ page }) => {
    await page.goto('/fr/directives');
    const card = page.getByText(DIRECTIVE_SENT_TITLE);
    const target = page.getByRole('region', { name: /^En cours \(/ });
    await expect(card).toBeVisible();

    await dragCardTo(page, card, target);

    // La carte a rejoint la colonne cible, sans erreur de transition (rollback).
    await expect(target.getByText(DIRECTIVE_SENT_TITLE)).toBeVisible();
    await expect(page.getByText(TRANSITION_ERROR_TEXT)).toHaveCount(0);

    // Persistance : navigation CLIENT aller-retour (le magasin mock vit dans la
    // session — un rechargement complet le réinitialiserait).
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await nav.getByRole('link', { name: 'Messagerie' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Conversations' })).toBeVisible();
    await nav.getByRole('link', { name: 'Directives' }).click();
    await expect(
      page.getByRole('region', { name: /^En cours \(/ }).getByText(DIRECTIVE_SENT_TITLE),
    ).toBeVisible();
  });

  test('rejet DRAFT → REJECTED : la note est obligatoire', async ({ page }) => {
    await page.goto('/fr/directives');
    const card = page.getByText(DIRECTIVE_DRAFT_TITLE);
    const target = page.getByRole('region', { name: /^Rejetée \(/ });
    await expect(card).toBeVisible();

    await dragCardTo(page, card, target);

    // Le drop vers REJECTED n'applique rien : il ouvre le dialogue de motif.
    const dialog = page.getByRole('dialog', { name: 'Rejeter la directive' });
    await expect(dialog).toBeVisible();

    // Note vide ⇒ confirmation impossible (contrainte TransitionDirectiveDto).
    const confirm = dialog.getByRole('button', { name: 'Confirmer le rejet' });
    await expect(confirm).toBeDisabled();

    await dialog
      .locator('#reject-note')
      .fill('Report demandé : budget de formation non arbitré pour le trimestre en cours.');
    await confirm.click();
    await expect(dialog).not.toBeVisible();

    // La carte rejoint la colonne « Rejetée » (transition acceptée par le mock).
    await expect(target.getByText(DIRECTIVE_DRAFT_TITLE)).toBeVisible();
    await expect(page.getByText(TRANSITION_ERROR_TEXT)).toHaveCount(0);
  });
});

test.describe('Gouvernance — écrans mock (données de démonstration)', () => {
  test('Performance affiche un écran mock (données de démonstration)', async ({ page }) => {
    await page.goto('/fr/performance');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Performance institutionnelle' }),
    ).toBeVisible();
    await expect(page.getByText('Données de démonstration').first()).toBeVisible();
  });

  test('Rapports affiche un écran mock (données de démonstration)', async ({ page }) => {
    await page.goto('/fr/rapports');
    await expect(page.getByRole('heading', { level: 1, name: 'Rapports' })).toBeVisible();
    await expect(page.getByText('Données de démonstration').first()).toBeVisible();
  });
});

test.describe('Gouvernance — sidebar SGOGT', () => {
  test('la navigation contient les 4 sections', async ({ page }) => {
    await page.goto('/fr/messagerie');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const item of ['Messagerie', 'Directives', 'Performance', 'Rapports']) {
      await expect(nav.getByRole('link', { name: item })).toBeVisible();
    }
  });
});
