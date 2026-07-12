/**
 * @file        e2e-pc04-live.mjs
 * @description E2E « stack réelle » du parcours PC-04 (prise de rendez-vous
 *              citoyen self-service), de bout en bout, contre les services
 *              **réellement démarrés** — pas de mock, pas de token forgé.
 *
 *              Chaîne validée (ADR-036 SSO token exchange) :
 *                1. ROPC Keycloak (client `nina-citizen`)      → access token KC
 *                2. POST /auth/sso/exchange (auth-service)      → JWT backend RS256
 *                3. GET  /centers (appointment-service)          → liste des centres
 *                4. GET  /centers/:id/availability               → créneau réservable
 *                5. POST /appointments/me                        → réservation (201)
 *                6. PUT  /appointments/me/:id/cancel             → nettoyage (ne
 *                   laisse aucune donnée résiduelle + couvre le chemin d'annulation
 *                   et son événement d'audit).
 *
 *              L'identité (citizenId / NINA) est **dérivée du token** côté serveur
 *              (anti-IDOR, ADR-028) — le script n'envoie jamais d'identifiant.
 *
 *              SÉCURITÉ : aucun secret n'est codé en dur. Le mot de passe de démo
 *              du realm de dev est lu depuis `KC_DEMO_PASSWORD` (documenté dans
 *              `apps/citizen/.env.local.example` et le realm import de dev). Sans
 *              cette variable, le script se met en SKIP (sortie 0) au lieu d'échouer.
 *
 *              Exécution :
 *                # stack up : pnpm docker:up + auth-service (3002) + appointment-service (3008)
 *                KC_DEMO_PASSWORD='<mot de passe realm dev>' pnpm run test:e2e:pc04-live
 *
 *              Codes de sortie : 0 = succès ou SKIP volontaire ; 1 = échec d'assertion.
 *
 * @module      scripts
 */

/* eslint-disable turbo/no-undeclared-env-vars -- script runtime invoqué via `node scripts/...`,
   hors pipeline/cache turbo : ces variables ne sont pas des entrées de tâche à déclarer. */
const KC_URL =
  process.env.KC_URL ?? 'http://localhost:8080/realms/nina-aes/protocol/openid-connect/token';
const KC_CLIENT_ID = process.env.KC_CLIENT_ID ?? 'nina-citizen';
const KC_USERNAME = process.env.KC_DEMO_USERNAME ?? 'citoyen.demo';
const KC_PASSWORD = process.env.KC_DEMO_PASSWORD; // requis — pas de défaut (secret)
const EXCHANGE_URL =
  process.env.AUTH_EXCHANGE_URL ?? 'http://localhost:3002/api/v1/auth/sso/exchange';
const APPT_BASE = process.env.APPT_BASE_URL ?? 'http://localhost:3008/api/v1';

/** Format YYYY-MM-DD (local) pour les bornes de disponibilité. */
const isoDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let step = 0;
/** Assertion minimale : journalise ✓ / ✗ et jette au premier échec. */
function check(label, ok, detail = '') {
  step += 1;
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} [${step}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`Échec d'assertion : ${label}${detail ? ` (${detail})` : ''}`);
}

async function main() {
  console.log('E2E PC-04 (stack réelle) — prise de rendez-vous citoyen self-service\n');

  if (!KC_PASSWORD) {
    console.log(
      'SKIP : KC_DEMO_PASSWORD non défini. Définir le mot de passe du citoyen de démo\n' +
        '       du realm de dev (cf. apps/citizen/.env.local.example) pour lancer cet e2e.\n' +
        `       Exemple : KC_DEMO_PASSWORD='...' pnpm run test:e2e:pc04-live`,
    );
    process.exit(0);
  }

  // 1. ROPC Keycloak — vrai access token citoyen.
  const kcRes = await fetch(KC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: KC_CLIENT_ID,
      username: KC_USERNAME,
      password: KC_PASSWORD,
      scope: 'openid',
    }),
  });
  const kc = await kcRes.json().catch(() => ({}));
  check('ROPC Keycloak', kcRes.status === 200 && !!kc.access_token, `status ${kcRes.status}`);

  // 2. SSO token exchange (ADR-036) — JWT backend RS256, rôle + NINA depuis la DB.
  const exRes = await fetch(EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keycloakToken: kc.access_token }),
  });
  const ex = await exRes.json().catch(() => ({}));
  const backendToken = ex.accessToken ?? ex.access_token ?? ex.access;
  check(
    'SSO exchange → JWT backend',
    exRes.status === 200 && !!backendToken,
    `status ${exRes.status}`,
  );
  const authHeaders = { Authorization: `Bearer ${backendToken}` };

  // 3. Liste des centres.
  const cRes = await fetch(`${APPT_BASE}/centers`, { headers: authHeaders });
  const cBody = await cRes.json().catch(() => ({}));
  const centers = Array.isArray(cBody) ? cBody : (cBody.items ?? cBody.data ?? []);
  const center = centers[0];
  const centerId = center && (center.id ?? center.centerId);
  check('GET /centers', cRes.status === 200 && !!centerId, `${centers.length} centre(s)`);

  // 4. Disponibilité : premier créneau STANDARD réservable dans les 30 jours à venir.
  const today = new Date();
  const from = isoDay(today);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 30);
  const to = isoDay(horizon);
  const aRes = await fetch(`${APPT_BASE}/centers/${centerId}/availability?from=${from}&to=${to}`, {
    headers: authHeaders,
  });
  const aBody = await aRes.json().catch(() => ({}));
  const days = aBody.days ?? [];
  let slot = null;
  for (const day of days) {
    if (!day.open) continue;
    const s = (day.slots ?? []).find(
      (x) => x.remaining > 0 && x.kind === 'STANDARD' && day.date > from,
    );
    if (s) {
      slot = s;
      break;
    }
  }
  check(
    'GET availability → créneau réservable',
    aRes.status === 200 && !!slot,
    slot?.start ?? 'aucun',
  );

  // 5. Réservation self-service (identité dérivée du token, ADR-028).
  const bRes = await fetch(`${APPT_BASE}/appointments/me`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      centerId,
      slot: slot.start,
      reason: 'E2E PC-04 stack réelle (script automatisé)',
    }),
  });
  const appt = await bRes.json().catch(() => ({}));
  check('POST /appointments/me', bRes.status === 201 && !!appt.id, `RDV ${appt.id ?? '—'}`);
  check(
    'identité dérivée du token (citizenName renseigné)',
    typeof appt.citizenName === 'string' && appt.citizenName.length > 0,
    appt.citizenName,
  );

  // 6. Nettoyage : annulation (ne laisse aucune donnée + couvre le chemin d'annulation).
  const xRes = await fetch(`${APPT_BASE}/appointments/me/${appt.id}/cancel`, {
    method: 'PUT',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Nettoyage e2e' }),
  });
  check(
    'PUT /appointments/me/:id/cancel (nettoyage)',
    xRes.status === 200,
    `status ${xRes.status}`,
  );

  console.log('\nSUCCÈS : parcours PC-04 validé de bout en bout sur la stack réelle.');
}

main().catch((err) => {
  console.error(`\nÉCHEC : ${err.message}`);
  process.exit(1);
});
