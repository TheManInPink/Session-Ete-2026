# CHANGELOG documentation — NINA-AES Platform

> Journal des écarts entre la documentation initiale (rédigée à l'ouverture du projet) et l'état
> réel du code après les sessions PROMPT 1.2 → 1.5 et les incidents d'exécution résolus en chemin.
>
> **Dernière mise à jour** : 2026-07-06 (**Fix hydratation CSP + drawer AD-02** — 2 bugs attrapés
> par les tests e2e mock : CSP statique sans nonce cassait l'hydratation des 3 apps ; Tailwind v4 ne
> scannait pas `packages/ui` → drawer mal positionné. Voir 0quinvicies. Précédent : 0quattuorvicies
> — Autorisation objet + RBAC SIGAC)

Quand un document `.md` numéroté contredit le code, **le code fait foi** et ce CHANGELOG renvoie à
la commande / au fichier qui matérialise la décision.

### 0quinvicies. Patch 2026-07-06 — Fix hydratation CSP à nonce + drawer AD-02 (2 bugs e2e)

Le durcissement sécurité de `0trevicies` (CSP stricte via `next.config.ts headers()`) avait
introduit **deux régressions invisibles à l'œil** mais **attrapées par les tests e2e mock** de
PROMPT 5.1 (admin corrections 5/5 rouge → vert). Diagnostic empirique (probes Playwright
`getComputedStyle`), pas de supposition :

- **CSP statique sans nonce → hydratation cassée (les 3 apps citizen/admin/governance)** : une CSP
  `script-src 'self' 'wasm-unsafe-eval'` posée **statiquement** dans `next.config.ts headers()`
  bloque les `<script>` **INLINE** de Next.js App Router (flux RSC `self.__next_f`, bootstrap
  `self.__next_r`) → **aucune hydratation**, la page reste une coque serveur figée (skeletons,
  **zéro appel API**, jamais interactive ; console :
  `Invariant: Expected a request ID … self.__next_r`). Une CSP statique **ne peut pas** porter de
  nonce. **Fix** : CSP retirée de `next.config.ts` (n'y restent que les en-têtes statiques : HSTS,
  X-Frame-Options, etc.) et **régénérée par requête** dans `proxy.ts` (le middleware Next 16) :
  `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'` (+ `'unsafe-eval'` en dev pour
  le HMR). Le nonce est propagé au moteur de rendu via override d'en-tête de requête
  (`x-middleware-request-content-security-policy`, le canal de `NextResponse.next({request})`) —
  sinon Next ne nonce pas ses scripts. Posture **« sans unsafe-inline » conservée** (décision
  utilisateur). `docs/12 §9bis.4` réécrit. Contrepartie : nonce par requête ⇒ coque HTML dynamique
  (légère érosion du PPR `cacheComponents`).
- **Tailwind v4 ne scanne pas `packages/ui` → drawer AD-02 « outside of viewport »** : Tailwind v4
  (`@import 'tailwindcss'`) auto-détecte les fichiers de l'app mais **ignore `node_modules`** (où le
  lien workspace `@nina-aes/ui` est résolu). Les utilitaires présents **uniquement** dans les
  composants partagés — `inset-y-0`, `top-0`, `slide-in-from-*` du `Sheet` — n'étaient **pas
  générés**. Le drawer `fixed inset-y-0 h-dvh` retombait donc à sa **position statique sous le pli**
  (`top` calculé ≈ 720px au lieu de 0) → boutons Approuver/Rejeter injoignables (clic e2e en
  timeout). **Fix** : `@source '../**/*.{ts,tsx}';` ajouté dans `packages/ui/src/styles/globals.css`
  (importé par les 3 apps → corrige tout d'un coup ; un `@source` explicite prime sur l'exclusion
  node_modules). Preuve : probe runtime `<div class="fixed inset-y-0">` → `top: 0px` après fix
  (était `868px`).
- **Assertions e2e affinées** : governance — `getByRole('alert').toHaveCount(0)` faux-positivait sur
  une live-region `@dnd-kit` ; remplacé par l'absence du texte d'erreur précis
  (`Transition refusée`).

### 0quattuorvicies. Patch 2026-07-06 — Autorisation objet PC-02/PC-05 + cloisonnement RBAC SIGAC

Traitement du tier **HAUT** du backlog d'audit (typecheck `api-client` + `auth` + apps
`citizen/admin/governance` OK ; identity-service 14/14 ; anticorruption-service 8/8) :

- **PC-02 / AD-01 / AD-02 — routing api-client identity cassé en live (le mock masquait le bug)** :
  `IdentityClient` visait `/citizens/by-nina/:nina`, `/citizens/search`, `/citizens/:id` — or le
  gateway **forwarde le chemin INCHANGÉ** (`proxy.routes.ts`) et le controller n'expose que
  `@Get(':nina')` (NinaOwnershipGuard, anti-IDOR déjà en place), `@Get()` (recherche) et
  `@Get('by-id/:id')`. Les 3 chemins sont réalignés sur le controller réel (cf. doc 07 §2146). Le
  filtre `nina` ne servait qu'en mock ; en live la fiche par NINA renvoyait 404.
- **PC-05 — corrections self-scoped (fuite latente fermée)** : `fetchMyCorrections` appelait
  `correction.list({ nina })`, un endpoint **réservé aux agents** qui **ignore** tout filtre `nina`
  (un citoyen recevait 403, ou potentiellement tout le périmètre). Nouvelle route backend
  `GET /corrections/me` (identity-service) : le NINA est dérivé **exclusivement du token** (jamais
  d'un paramètre client), `@Roles(CITIZEN)`, `listForCitizen(nina)` filtre `citizen.nina` normalisé.
  Câblage complet : `CorrectionClient.listMine()` + `CorrectionApi` + mock (self-scoped sur
  `DEFAULT_MOCK_NINA`) + `fetchMyCorrections()` sans argument. `@Get('me')` déclaré **avant**
  `@Get(':id')` (sinon capturé comme `:id`).
- **RBAC SIGAC — rôle `ANTICORRUPTION_INSPECTOR` + cloisonnement (need-to-know)** : le rôle existait
  côté realm Keycloak (`anticorruption_inspector`) et docs (07/08/09) mais **pas** dans le contrat
  applicatif `@nina-aes/auth`. Ajouté au type `Role` + `KNOWN_ROLES`. **Bug prod corrigé** :
  `extractUserFromClaims` filtrait les rôles JWT en **casse exacte MAJUSCULE** alors que le realm
  les émet en **minuscule** → en mode keycloak **tous** les rôles étaient silencieusement écartés
  (403 pour tout le monde) ; on normalise désormais en MAJUSCULE avant filtrage (doc 08 §369). Côté
  AD-03 : la page reste ouverte à SUPERVISOR/AUDITOR/ADMIN (agrégats régionaux non nominatifs) mais
  la **file procureur scellée** (`<SigacClient />`) n'est rendue que pour `ANTICORRUPTION_INSPECTOR`
  (sinon `UnavailableCard`) — défense en profondeur au-dessus de la garde backend. Backend
  `anticorruption-service` : `require_role("inspector")` (rôle inexistant au realm, donc
  **inaccessible à l'inspecteur réel**) → `require_role("anticorruption_inspector")` sur
  `/whistleblower/queue` **et** `/integrity-scores`. Le mock agent admin (« Modibo Konaté ») cumule
  volontairement le rôle inspecteur (super-utilisateur de démo) pour préserver la démo/e2e AD-03 ;
  la compartimentation réelle est portée par le realm en prod.
- **Gateway — anti-corrélation du canal anonyme (souveraineté)** : sur les 3 routes PUBLIQUES du
  lanceur d'alerte (`/sigac/whistleblower/{public-key,reports,reports/:token/status}`), le proxy
  retire désormais **tout en-tête identifiant** avant de forwarder à anticorruption-service —
  `X-Forwarded-For`/`X-Real-IP` (IP relayée), `User-Agent`, `Cookie`, `Referer`, `Accept-Language`,
  `X-Correlation-Id`/`X-Request-Id`, `traceparent`/`tracestate` — et n'injecte PLUS le
  correlation-id de trace. Défense en profondeur au-dessus du client (déjà sans cookie ni
  correlation-id) et du service (qui ne journalise pas l'IP) : les identifiants n'atteignent jamais
  l'aval, même via un ingress amont. Helper pur `buildForwardedHeaders()` (piloté par
  `isPublicEndpoint`) + suite de tests `proxy.headers.spec.ts` (gateway 50/50). Routes protégées :
  comportement inchangé.
- **GOV-01 — identité du signataire révélée seulement après vérification** : la messagerie SGOGT
  affichait le bloc d'attestation cryptographique (« Signataire : X », empreinte, horodatage) dès
  qu'un message était inspecté, **quel que soit le résultat de la vérification JWS**. Un message
  usurpé aurait donc affiché le nom de l'officiel impersoné comme signataire « attesté ». Désormais
  le bloc n'est rendu qu'après `valid === true` ; sur signature invalide, un avertissement explicite
  (`signature.identityUnverified`) remplace l'identité. En mock (`verify` → toujours `valid:true`)
  la démo/e2e est inchangée ; l'écart ne se manifeste que sur une vraie signature invalide.
- **`biometricHash` hors payload QR — NON traité (conflit ADR-006)** : l'audit le proposait en
  préventif, mais **ADR-006 mandate explicitement** `biometric_hash` dans le JWS QR (placeholder
  `null` en P0, valeur réelle en Bloc F) pour la vérification hors-ligne. Le retirer violerait un
  ADR ratifié (SHA-256 one-way sur un document physique = design délibéré, pas une faille) → à
  porter en révision d'ADR si le besoin se confirme, pas en modif de code unilatérale.
- **PC-02 — erreurs d'autorisation traitées côté page (fail-safe UX)** : un `401` (session expirée
  en cours de requête RSC) redirige vers `/login?next=…` ; un `403` (NINA d'autrui —
  `NinaOwnershipGuard`, tentative d'IDOR) affiche un refus explicite (« Accès refusé, ce NINA n'est
  pas le vôtre ») sans confirmer l'existence du dossier, au lieu d'un crash générique. Le `404`
  reste géré via `notFound()`.
- **PC-05 — auto-rafraîchissement 30 s** : composant client `AutoRefresh` (`router.refresh()`
  visibility-aware — suspendu onglet masqué, rattrapage au retour) sur le tableau de bord ; le
  statut des corrections (`UNDER_REVIEW → APPROVED/REJECTED`) se met à jour sans action manuelle,
  sans extraire la liste server-rendered en composant client (zéro risque d'hydratation).

Couverture de test : `correction.service.spec.ts` (identity-service, Prisma mocké) verrouille
l'invariant anti-IDOR de `listForCitizen` — filtre sur le NINA **normalisé** du token + `deletedAt`
null, `where` du `count` identique (identity-service 17/17).

**Reste au backlog (P2)** : uploads réels MinIO (correction justificatif + evidence signalement —
**infra requise**) ; i18n 7 langues nationales (**traductions natives requises** ; deepMerge
fallback FR en attendant) ; NINA hors des chemins d'URL citizen (refonte routage — `Referrer-Policy`
déjà en place) ; `fine_classification`/`fine_severity` SIGAC encore en clair (limite backend).

### 0trevicies. Patch 2026-07-06 — Durcissement sécurité frontend/backend + écran USSD-01

Audit multi-agents des 12 écrans (PC-01→06, AD-01→03, GOV-01/02, USSD-01) + surfaces sécurité
transverses (BFF, en-têtes, QR-JWT, pipeline anonyme, wiring api-client) → backlog priorisé.
Première passe de durcissement (typecheck 6 packages OK ; 35/35 tests `document-service` ; lint
`citizen` 0 warning) :

- **En-têtes de sécurité (docs/12 §9bis.4)** : CSP stricte (`script-src 'self' 'wasm-unsafe-eval'`,
  `frame-ancestors 'none'`, `object-src/base-uri/form-action 'self'`), **HSTS** (prod uniquement),
  **COOP `same-origin`**, `X-Permitted-Cross-Domain-Policies: none` posés sur les 3 `next.config.ts`
  (citizen `camera=(self)` pour le scanner QR §5.5 ; admin/governance `camera=()`). La CSP était
  documentée (§4.2) mais **absente** du code — c'était le contrôle anti-XSS principal.
- **document-service** : `ThrottlerGuard` réellement appliqué à `PublicDocumentsController`
  (`POST public/documents/verify-qr` non authentifié n'était PAS rate-limité malgré sa docstring) ;
  NINA retiré des logs applicatifs et messages d'exception (`fdi.service.ts`, `identity.client.ts` →
  référence `sha256(nina)[0..8]`). Le NINA reste tracé **uniquement** dans l'audit immuable.
- **XSS `javascript:` (console admin AD-02)** : `justificationDocUrl` durci — schéma Zod
  `SafeDocUrlSchema` bannit `javascript:/data:/vbscript:/file:` + garde au rendu `isHttpUrl` (lien
  cliquable http(s) uniquement ; React n'assainit pas ces `href`).
- **Auth fail-open (`@nina-aes/auth`)** : nouveau `resolveAuthMode()` — **kill-switch prod** (refuse
  `mock` si `NODE_ENV=production` sauf opt-in `NINA_ALLOW_MOCK_AUTH=true`), défaut `keycloak` en
  prod. Câblé dans `login/logout/session` + les 3 `proxy.ts` (le bypass `hasToken || mock` devient
  inerte en prod). Symétrique du `assertApiModeSafe` du mode données.
- **BFF** : `AbortSignal.timeout(15 s)` (→ 504 `GATEWAY_TIMEOUT`) sur les 3 proxys
  `app/api/v1/[...path]/route.ts` (anti-slowloris). Le streaming binaire (`req.body` duplex) reste à
  câbler avec les uploads réels.
- **USSD-01 (écran manquant → livré)** : `app/[locale]/ussd-sim/page.tsx` + client pilote + BFF
  **dev** `app/api/ussd-sim/route.ts` relayant vers `ussd-service:3014` `/ussd/callback` (secret
  partagé côté serveur ; désactivé hors dev sauf `NINA_ENABLE_USSD_SIM=true`). Pavé virtuel +
  clavier physique, parcours réel en 8 langues.
- **PC-03** : case d'attestation sur l'honneur **obligatoire** (bloque la soumission d'une demande à
  portée légale) ; clé i18n `admin.corrections.drawer.rejectReasonError` corrigée (« 5 » → 20,
  paramétrée et consommée par le drawer).
- **PC-06 — chiffrement de bout en bout du signalement (CRITIQUE résolu)** : le corps + la
  localisation partaient **en clair**. Désormais scellés **dans le navigateur** (libsodium sealed
  box X25519, interopérable octet-pour-octet avec PyNaCl `SealedBox` côté procureur) avant tout
  envoi — le serveur ne reçoit qu'un `ciphertext_b64` qu'il ne peut pas déchiffrer. Le pipeline
  anonyme **cassé** est réconcilié avec le contrat FastAPI réel :
  `GET .../whistleblower/public-key`, `POST .../whistleblower/reports`,
  `GET .../whistleblower/reports/{token}/status` (les 3 seuls allowlistés public au gateway).
  Schémas Zod reçus/statut alignés (`SealedReportRequest/Receipt`, `WhistleblowerStatusResponse`),
  taxonomie UI→backend pontée (`UI_CATEGORY_TO_FINE_CLASSIFICATION`), bornes description 200-2000
  (maquette + plafond ciphertext 8192). **Fail-closed** : sans clé publique valide, la soumission
  est refusée (jamais de repli en clair). Anti-corrélation : le transport anonyme (`skipAuth`)
  n'émet plus le `X-Correlation-Id` horodaté ; token de suivi mock rendu aléatoire
  (`crypto.getRandomValues`). ⚠️ `fine_classification`/`fine_severity` restent en clair (limite
  backend documentée — à sceller côté serveur ultérieurement). Dépendance ajoutée :
  `libsodium-wrappers` (WASM, chargé uniquement sur PC-06 ; CSP `wasm-unsafe-eval` déjà posée).

**Reste au backlog (non traité ici, à prioriser)** : ~~IDOR PC-02~~ + ~~`/corrections/me`
self-scoped PC-05~~ + ~~cloisonnement RBAC de la file procureur SIGAC~~ → **traités en
[0quattuorvicies](#0quattuorvicies-patch-2026-07-06--autorisation-objet-pc-02pc-05--cloisonnement-rbac-sigac)**
(le rôle réel est `ANTICORRUPTION_INSPECTOR`, pas `INSPECTOR/PROSECUTOR` qui n'existent pas au
realm) ; uploads réels vers MinIO ; auto-refresh 30 s PC-05 ; `biometricHash` hors payload QR
(préventif Bloc F) ; couverture i18n des 7 langues nationales.

### 0duovicies. Patch 2026-07-05 — Frontend tranche 2 : apps admin + governance branchées (PROMPT 5.1)

Suite de la couture données mock↔live (tranche 1 = app citizen, cf.
[0quaterdecies](#0quaterdecies-patch-2026-06-17--frontend--couture-api-mocklive--hooks-react--bff-prompt-51-tranche-1--app-citizen)

- **ADR-031**). Les apps **admin** (AD-01/02/03) et **governance** (GOV-01/02) passent de mocks
  locaux au contrat `@nina-aes/api-client`, en **répliquant le pattern citizen** (kill-switch
  `assertApiModeSafe`, BFF `app/api/v1/[...path]` injectant le Bearer côté serveur,
  `ApiClientProvider`
- `MutationCache` sensible à `ApiError`). Méthode : orchestration multi-agents (contrats → apps en
  parallèle) puis vérification centralisée.

**Livré** :

- **`@nina-aes/api-client`** (scope `api-client`) : `CorrectionApi.approve(id)` /
  `reject(id, {reason ≥ 20})` ; `list()` **normalise** la réponse backend
  `{data, total, page, pageSize}` (+ join `citizen` optionnel `{id, nina, firstName, lastName}`)
  vers la vue publique `{items, …}` (les consommateurs citizen ne changent pas) + filtres
  `agent`/`from`/`to`. `SigacApi.getQueue()` (file procureur en buckets, **authentifié** — les
  `submit`/`getStatus` anonymes restent `skipAuth`). **Nouveau domaine `governance`** :
  `sgogt.{send,inbox,verify,ack,respond}` + `directives.{create,list,transition}`, schémas Zod
  calqués sur governance-service (`MessageView`, `DirectiveView`, statuts
  `DRAFT/SENT/IN_PROGRESS/COMPLETED/REJECTED`, priorités `NORMAL/HIGH/CRITICAL`) +
  `DIRECTIVE_LEGAL_TRANSITIONS`/`isDirectiveTransitionAllowed` (machine à états partagée UI↔mock).
  **Nouveau domaine `adminDashboard.getStats()`** au contrat **honnête nullable** : en live seuls
  `correctionsPending`/`correctionsToday` sont dérivés (compteurs paginés d'identity-service), tout
  le reste (`activityByRegion`, `topAgents`, séries, feed) vaut `null` = « backend d'agrégation Bloc
  D non implémenté ». Hooks RQ (`useApproveCorrection`, `useRejectCorrection`,
  `useWhistleblowerQueue`, `useSgogtInbox`, `useSendSgogtMessage`, `useAckSgogtMessage`,
  `useRespondSgogtMessage`, `useVerifySgogtMessage`, `useDirectives`, `useCreateDirective`,
  `useTransitionDirective`, `useAdminDashboardStats`) + query-keys. **Mock stateful déterministe**
  (`mock/{corrections,governance,admin-dashboard}.fixtures.ts`, `personas.ts`, `deterministic.ts`) :
  50 corrections vue agent (dont les 2 fixtures citoyennes historiques du NINA `18903102015042V`
  préservées), inbox 8 messages / 3 fils, 7 directives, file whistleblower ;
  `approve/reject/send/respond/ack/transition` **mutent l'état en mémoire** (validé par les MÊMES
  schémas Zod que le live).

- **`api-gateway`** (scope `api-gateway`) : **table de routage réconciliée** — 18 préfixes → 14
  services. Ajout `/api/v1/{sgogt,directives,elections}` → `GOVERNANCE_SERVICE_URL` (le préfixe mort
  `/api/v1/governance` — qui ne matchait aucun controller aval, ceux-ci étant sous sgogt/directives/
  elections — est **retiré**). `publicEndpoints` SIGAC corrigés : les 2 entrées mortes
  (`/api/v1/sigac/alerts[/status]`, routes inexistantes) remplacées par les 3 vraies routes anonymes
  du canal lanceur d'alerte (`whistleblower/public-key`, `whistleblower/reports`,
  `whistleblower/reports/:token/status`) ; nouveau matching **segment-exact fail-closed** pour les
  déclarations à paramètre `:token` (token vide/surnuméraire → JWT exigé). **54/54 tests** (36 +
  18). README §2.1 mis à jour.

- **`apps/admin`** (scope `admin`) : couture `lib/api/{config,server,browser}.ts` + BFF +
  `instrumentation.ts` + `providers.tsx` (redirect 401 **dérivant la locale du pathname** via un
  `localeFromPathname` local, pas de `/fr` en dur — amélioration vs citizen). **AD-02** :
  `useCorrections` + adaptateur `lib/corrections/` (join citizen → `citizenName`, région dérivée du
  NINA, timeline **synthétisée** des seuls champs réels), drawer `useApprove/useReject` (motif ≥
  20). **AD-01** : `adminDashboard.getStats()` + `lib/dashboard/` view-model ; sections `null` →
  `UnavailableCard` « Bloc D à venir » ; simulation d'arrivées d'alertes conservée **uniquement en
  mode mock**. **AD-03** : `useWhistleblowerQueue` (buckets) ; heatmap/top-agents dégradés. Mocks
  locaux `lib/mock-{corrections,dashboard}.ts` **supprimés**. E2E admin recalés (approbation/rejet
  bout-en-bout, mock stateful).

- **`apps/governance`** (scope `gov`) : couture identique. **GOV-01** : `useSgogtInbox` (**polling
  30 s** — pas de WebSocket backend, escalade par cron), regroupement par `threadId`, annuaire
  `lib/directory.ts` (via `MOCK_GOVERNANCE_DIRECTORY`, repli « Fonctionnaire {uuid.8} » en live),
  composition/réponse activées, ack à l'ouverture, badge de vérif de signature par message. **GOV-02
  Kanban** : **5 colonnes = statuts serveur** (l'ancienne colonne « Escaladée » devient un **badge
  `escalationLevel`**), priorités `CRITICAL/HIGH/NORMAL` → affichage P1/P2/P3, drag **restreint aux
  transitions légales** + update optimiste **auto-inerte** avec rollback, rejet exigeant une note.
  **Drift crypto corrigé** : le canon (ADR-026/034, `governance-service/src/crypto/jws.signer.ts`)
  est une signature **JWS RS256 côté serveur via Vault Transit** (clé non exportable, aucune
  signature client possible) → tous les libellés « Ed25519 » de l'UI/i18n governance deviennent «
  **Signature électronique vérifiée (JWS)** ». Clés `governance.*` de `messages/fr.json` refondues
  (repli automatique pour les 7 autres langues via le `deepMerge` de
  `packages/i18n/src/request.ts`).

- **`turbo.json`** : `E2E_GOVERNANCE_URL` ajouté au `globalEnv` (était silencé par un eslint-disable
  dans `playwright.config.ts`).

- **Alignement vocabulaire crypto `shared-types` + `ui`** : le type spec obsolète
  `GovernanceMessage` (non consommé par le code vivant — le live passe par `MessageView` de
  governance-service) portait encore `signatureEd25519` / `publicKeyFingerprint`, en contradiction
  avec le canon **JWS RS256 serveur** (la colonne Prisma réelle est `signature`, scheme-agnostique).
  Renommés en **`jwsSignature` / `signingKeyId`** (`interfaces.ts` + `dtos.ts` +
  `governanceMessageIngestSchema`) ; `packages/ui/signed-message-bubble.tsx` (badge « Ed25519 ✓ » →
  « JWS ✓ », infobulles alignées) ; diagramme `docs/diagrams/02-classes.puml` synchronisé. Les
  clés/types réexportés (`GovernanceMessage`, `GovernanceMessageIngestDto`) ne changent PAS de nom —
  aucun consommateur cassé. Le **vrai** Ed25519 du repo (interop transfrontalier, scellement audit
  Merkle, consentement biométrique) est **intact** : le renommage est ciblé sur le seul contexte
  messagerie SGOGT.

**Vérif** : `check-types` api-client + citizen (non-régression) + admin + governance + i18n +
shared-types + ui ✅ (dist shared-types reconstruit) ; `eslint --max-warnings=0` sur les 4 zones ✅
; `api-gateway` 54/54 ✅ ; `docs:sync:check` ✅. **Playwright e2e admin/gov NON lancés** (exécution
CI ; le drag @dnd-kit gov est le point le plus sensible aux flakes — passe de run réelle à faire).

**Reste (hors périmètre — code fait foi)** : mode live jamais testé contre backend réel ;
whistleblower store/dispute d'anticorruption-service non persistés (mémoire, Bloc D) ; polling temps
réel PC-05 citizen toujours non câblé ; le type spec `GovernanceMessage` de `shared-types` reste
globalement divergent de `MessageView` (governance-service) au-delà du champ signature
(`publicKeyFingerprint`→`signingKeyId` fait, mais `serverTimestamp`/`recipientIds`/`readStatus` non
réconciliés) — réconciliation complète du type à faire si un consommateur l'adopte.

**Incident (résolu)** : un switch de branche GitHub Desktop (`feat` → `main`) survenu pendant le
workflow a mêlé le travail à des marqueurs de conflit et à du WIP d'autres chantiers ; récupération
par snapshot + réapplication sur `feat`. Le diff de session inclut donc, **hors tranche 2 et à ne
pas committer sans tri**, du WIP utilisateur préexistant (apps/citizen d'une session parallèle ;
`packages/config` + services biometric/interop/vulnerability issus d'un stash `!!GitHub_Desktop`,
toujours présent dans `git stash list`).

### 0unvicies. Consolidation 2026-06-25 — Phase 1 : audit contenu + sécurité des 27 docs (5 vagues)

Consolidation **PHASE 1** (audit de contenu et de sécurité des 27 documents) livrée le
**2026-06-25** sur la branche **`feat/ai-training-pipeline`**, en **5 commits**. Méthode : pipeline
**write → verify adversarial (crypto) → repair** ; gate pré-commit **`verify:repo`** vert à chaque
commit ; les contrôles non encore implémentés dans le code sont marqués ⏳ « conçu, Phase 2 ».

- **`e3c7335` — Wave 1** : doc 15 durci ; **correction crypto SIGAC** (doc 23 : Ed25519 **NE CHIFFRE
  PAS** → sealed box X25519/XSalsa20-Poly1305 ou RSA-OAEP côté client) et **biométrie** (doc 25 +
  ADR-025 : HMAC strict incompatible biométrie floue → _cancelable biometrics_ / _fuzzy extractor_
  ISO/IEC 24745) ; création de `docs/security/THREAT-MODEL.md` + `SECURITY-RUNBOOK.md` +
  `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` ; archivage des 2 docs orphelins
  (`01-fondations`, `02-infrastructure`) vers `docs/_archive/`.
- **`c5e9723` — Wave 2a** : docs 06/07/11/13/14/22/24 (guards/IDOR honnête, RCE joblib
  _fail-closed_, JWKS multi-kid mobile, HMAC-in-Vault gouvernance, auth machine bornée) + correctifs
  code `services/ai-service` (`config.py` credential en clair retiré + _fail-closed_ ; `main.py`
  `/score` guard + masquage NINA).
- **`a2832e8` — Wave 2b** : docs 02/03/04/05/08/09/10/20 (secrets externalisés Vault, mTLS,
  zero-trust K3s Calico/PSA, audit AppRole, OpenAPI 3.2).
- **`ffbc3d8` — Wave 3** : docs 00/01/12/16/17/18/19/21/26 (matrice sécurité transversale + plan de
  sortie souveraineté, TOTP/passkey, anti-replay interop, honnêteté soutenance).
- **`ee31ee4` — Wave 4a** : 12 docs thématiques créés —
  `docs/biometrics/{DPIA-NINA-AES-2026,INCIDENT-PROTOCOL,CONSENT-PROTOCOL}`,
  `docs/sigac/{WHISTLEBLOWER-PROTOCOL,MODEL-CARDS,SCORING-RUNBOOK}`,
  `docs/observability/{RUNBOOK,SLOs}`, `docs/deployment/{DRP-RUNBOOK,OPS-RUNBOOK}`,
  `docs/governance/{SGOGT-PROTOCOL,ELECTIONS-EXPORT-CONTRACT}`.

**Total ADRs : 34** (ADR-001..034).

### 0vicies. Patch 2026-06-18 — Réconciliation de la topologie RabbitMQ (audit non capté)

audit-service consomme l'exchange topic **`nina.events`** (+ fanout `nina.audit`), patterns
`citizen.#,correction.#,document.#,identity.#,…` — conforme à
`infrastructure/docker/rabbitmq/ definitions.json`. Mais **deux publishers émettaient ailleurs**,
donc leurs événements **n'étaient jamais audités** :

- **document-service** publiait sur `audit.events` (un exchange orphelin auto-créé, non consommé) ;
- **identity-service** publiait sur `nina-aes.events` (coquille avec tiret) au lieu de
  `nina.events`.

Invisible pour `tsc`/lint (chaînes runtime) et pour les tests (pas de broker e2e).

**Correctif (côté publishers)** :

- `identity-service` : défaut de l'exchange `nina-aes.events` → **`nina.events`** (code +
  `.env.example` ; var `RABBITMQ_EXCHANGE`).
- `document-service` : variable `RABBITMQ_AUDIT_EXCHANGE` (défaut `audit.events`) **renommée
  `RABBITMQ_EVENTS_EXCHANGE`** (défaut `nina.events`), alignée sur la convention d'audit-service.
- Notes de drift mises à jour (audit-service `audit.consumer.ts` + README).

**Vérif** : `tsc` OK sur document/identity/audit-service. ⚠️ **Action requise en local** : si votre
`services/identity-service/.env` (non versionné) fixe `RABBITMQ_EXCHANGE=nina-aes.events`, le passer
à `nina.events`.

**Réconciliation doc** (faite) : ADR-014, docs 09/10/11 et les diagrammes 99 (Mermaid + PlantUML)
nommaient encore l'exchange/file historiques `audit.events` / `audit.queue` — désormais alignés sur
`nina.events` (topic) / `nina.audit` (fanout) / `audit.log`. ADR-014 conserve sa décision de fond +
une note de mise à jour ; doc 09 §9 décrit la topologie réelle (deux exchanges, publishers par
service, ACK+drop des messages non normalisables, DLQ recommandée). Le code + `definitions.json`
font foi.

### 0novemdecies. Patch 2026-06-18 — Pipeline de tokens : `tokens.json` autoritatif → Style Dictionary → `tokens.css`

Industrialisation du correctif `0octodecies`. **ADR :
[ADR-033](./adr/ADR-033-design-tokens-style-dictionary-pipeline.md).**

`tokens.json` (DTCG / Style Dictionary 4) était documenté comme source de vérité mais n'était
branché à rien — `tokens.css` était maintenu à la main (d'où le bug de classes mortes). Désormais
**`tokens.json` est autoritatif** et `tokens.css` est **généré**.

**Livré** :

- **`tokens.json` complété** : `neutral.0`, `success.100`, `warning.800` (utilisés mais absents) +
  sections `semantic` (rôles mode clair) et `semanticDark` (surcharges sombres), en références.
- **Pipeline** : `packages/ui/style-dictionary/build.mjs` + script `tokens:build`. Format CSS custom
  (`nina/tokens-css`) : échelles → `@theme` (valeurs hsl résolues, aucun transform de couleur) ;
  rôles → `:root` en `var(--color-…)` ; mode sombre → `:root[data-theme='dark']`. Sortie JS
  (`javascript/esm`) pour RN/JS (artefact non versionné).
- **`src/styles/tokens.css` est maintenant GÉNÉRÉ** (en-tête « ne pas éditer à la main »). Toute
  valeur passe par `tokens.json` puis `tokens:build`.
- **pnpm 11** : `style-dictionary` + `@bundled-es-modules/glob` en `allowBuilds: false` (JS pur, pas
  de script de build requis) ; `style-dictionary` ajouté en devDependency de `@nina-aes/ui`.

**Vérif (empirique)** : `tokens.css` généré compilé via `@tailwindcss/postcss@4.3.0` — 27 classes
témoins (échelles + jetons sémantiques + opacité) **toutes générées, 0 manquante** ; `build.mjs`
lint OK ; `tokens.json` JSON valide.

**Reste** (cf. ADR-032 § limites) : dedupe d'apps (drawer admin, appointment-form, LanguageSwitcher
citoyen — bloqué sur vérif e2e fiable dans cet environnement).

### 0octodecies. Patch 2026-06-18 — Correctif tokens : échelles de couleur enregistrées dans `@theme`

**Root-cause d'un bug systémique de rendu.** `packages/ui/src/styles/tokens.css` définissait les
échelles de couleur (`--color-primary-50…950`, `--color-success-50/500/700`, `--color-danger-*`, …)
dans un simple `@layer theme { :root { … } }`. En Tailwind v4, **seul le bloc `@theme` génère des
utilitaires** : ces variables n'étaient donc que des variables CSS sans classes associées. Toutes
les classes d'échelle (`bg-success-50`, `text-danger-700`, `bg-primary-50`, `text-warning-800`,
`stroke-success-500`, …) — utilisées **massivement** dans `Alert`, `Badge`, `IntegrityGauge`,
`Input` et **~40 fichiers d'app** (badges de statut, fils d'alertes, panneaux de score IA, états de
créneaux, surbrillances) — étaient **mortes** : aucun fond ni couleur de texte rendus. Invisible
pour `tsc`/ESLint (les noms de classes Tailwind ne sont pas validés) et pour les e2e (qui
n'assertent pas les couleurs).

**Correctif** : déplacement des échelles de couleur dans un bloc `@theme` (les rôles sémantiques
`--bg`/`--primary`/… et le mode sombre restent dans `:root`, qu'un `@theme` statique ne permettrait
pas). Ajout de `--color-success-100` et `--color-warning-800` (utilisés mais jamais définis). Les
neutres chauds surchargent désormais correctement la palette par défaut de Tailwind.

**Pourquoi ce choix** (vs réécrire ~45 fichiers en jetons sémantiques + opacité) : **un seul
changement** de la source de vérité des tokens corrige tout l'existant **en préservant le design
voulu** (fonds `-50` clairs + texte `-700` foncé), sans toucher au moindre composant/app.

**Vérif (empirique)** : compilation réelle via `@tailwindcss/postcss@4.3.0` avant/après — avant :
les classes d'échelle absentes du CSS généré ; après : `bg-success-50`, `text-danger-700`,
`bg-primary-50`, `stroke-success-500`, … **toutes générées**, les jetons sémantiques + modificateurs
d'opacité (`bg-success/10`, `text-primary-fg/70`, …) restant générés. CSS 78,4 Ko → 81,2 Ko.

### 0septdecies. Patch 2026-06-18 — Design system (lot 3) : 11 composants restants + drift tokens découvert

Achèvement des composants `@nina-aes/ui` spécifiés (design-system.md §3-4), **sans aucune nouvelle
dépendance** (tout fait main ou composé sur les primitives existantes). **ADR :
[ADR-032](./adr/ADR-032-design-system-component-buildout.md).** Méthode : orchestration multi-agents
(22 agents — construction parallèle + **revue adversariale** par composant), corrections appliquées,
puis vérification centralisée.

**Livré** :

- **Atomes** : `Combobox` (sélecteur recherchable accessible — Popover + listbox filtré, motif
  WAI-ARIA, insensible aux accents) ; `Calendar` (grille mensuelle pure React + Intl, navigation
  clavier complète, **sans `react-day-picker`**) ; `DatePicker` (Popover + Calendar).
- **Conteneurs** : `Toast` (`ToastProvider` + `useToast`, file + portail SSR-safe, auto-dismiss,
  `role=status`/`alert` selon variant) ; `DataGrid` (générique `<T>`, **contrôlé** — tri/sélection/
  pagination via callbacks — bâti sur `Table`/`Checkbox`/`Select`) ; `ErrorBoundary` (class
  component, repli par défaut avec ID de corrélation + boutons recharger/accueil).
- **Métier** : `UploadZone` (drag-drop + états uploading/success/error) ; `MaliMap` (carte SVG des
  régions, **présentationnelle / props-driven** — projection GeoJSON laissée à la couche app pour
  rester souverain) ; `WhistleblowerForm` (signalement **anonyme** — aucun champ identifiant,
  `autoComplete="off"`, aucun cookie/empreinte ; compose Alert/RadioGroup/Textarea/UploadZone) ;
  `KioskKeyboard` (variantes numeric/azerty/nina, cibles ≥ 64px WCAG 2.5.5) ; `UssdSimulator`
  (maquette feature phone + écran LCD + `KioskKeyboard`).
- **11 sous-chemins `exports`** ajoutés à `packages/ui/package.json`. **0 nouvelle dépendance.**

**Vérif** : `@nina-aes/ui` typecheck (tsc) **0 erreur** + lint `--max-warnings=0` **0 warning** ;
`package.json` JSON valide. Lot **purement additif** (aucune app recâblée). Corrections post-revue
appliquées : annotation `FormEvent` retirée (handler inline, WhistleblowerForm) ; collision
`onInput`/`onKeyPress` natifs résolue via `Omit` (UssdSimulator/KioskKeyboard) ; cibles `nina`
portées à 64px ; entité non échappée (ErrorBoundary).

**⚠ Drift découvert (hors lot)** : `alert.tsx`/`input.tsx` — et en réalité tout le code (≈45
fichiers) — utilisent des classes d'échelle Tailwind (`bg-info-50`, `text-info-700`,
`bg-danger-50/30`, …) qui **ne sont pas générées** (échelles dans `@layer theme`, et non `@theme`).
**✅ Résolu en
[0octodecies](#0octodecies-patch-2026-06-18--correctif-tokens--échelles-de-couleur-enregistrées-dans-theme)**
par enregistrement des échelles dans `@theme` (correction à la source, sans réécrire les
composants). Les composants du lot 3 n'utilisent que des jetons sémantiques + opacité.

**Reste** (cf. ADR-032 § limites) : pipeline Style Dictionary ; dedupe d'apps (drawer admin,
appointment-form, LanguageSwitcher citoyen — bloqué sur vérif e2e fiable dans cet environnement).

### 0sexdecies. Patch 2026-06-18 — Design system (lot 2) : icônes maliennes + Select/Slider + cartes gouvernance

Suite de l'industrialisation du DS, toujours par **lots additifs vérifiés** (typecheck + lint
`@nina-aes/ui` à chaque lot, sans réécriture d'UX d'app). **ADR :
[ADR-032](./adr/ADR-032-design-system-component-buildout.md).**

**Livré** :

- **5 icônes maliennes custom** (`src/icons/`, commit `17f5fa3`) : BlackStar (étoile de l'AES,
  `fill=currentColor`), Baobab, KolaNut, Hornbill, Mask — toutes sur `IconBase`
  (`React.SVGProps<SVGSVGElement>` + prop `size`), exportées via `@nina-aes/ui/icons`.
- **2 atomes Radix** (commit `8f5fc07`) : Select (Trigger/Content/Item/Label/Separator, déclencheur
  calqué sur Input) et Slider (valeur unique, a11y native flèches/Home/End).
- **2 cartes métier gouvernance** (`components/business/`, commit `8f5fc07`) : DirectiveCard (carte
  Kanban SGOGT — priorité P1/P2/P3, bordure rouge si en retard, niveau d'escalade) et
  SignedMessageBubble (bulle de messagerie officielle — badge signature Ed25519 vérifiée/absente,
  empreinte de clé via `title` natif).
- **Dépendances** : `@radix-ui/react-select`, `@radix-ui/react-slider` + 4 sous-chemins `exports`
  dans `packages/ui/package.json`.

**Vérif** : `@nina-aes/ui` typecheck (11/11 turbo) + lint OK ; `verify:repo` + `docs:sync:check` OK.
Lot **purement additif** (aucune app recâblée) — pas de risque e2e.

**Reste** (cf. ADR-032 § limites) : atomes combobox/datepicker ; conteneurs
toast/data-grid/error-boundary ; métier UploadZone/MaliMap/WhistleblowerForm/KioskKeyboard/
UssdSimulator ; pipeline Style Dictionary ; dedupe d'apps (drawer admin, appointment-form,
LanguageSwitcher citoyen).

### 0quindecies. Patch 2026-06-17 — Design system : 24 composants `@nina-aes/ui` + déprécations React 19 + dedupe

Industrialisation du design system par **lots vérifiés** (typecheck + lint à chaque lot). **ADR :
[ADR-032](./adr/ADR-032-design-system-component-buildout.md).**

> Style maison unifié : primitives **Radix** + **class-variance-authority** + **tokens sémantiques**
> Tailwind v4 (uniquement les classes du `@theme inline`, robustes) + `React.ComponentRef` + a11y
> native. Composants métier **découplés** du domaine (unions locales, pas de dépendance
> shared-types).

**Livré** :

- **8 atomes** : switch, radio-group, textarea, avatar, spinner, tooltip, tabs, progress.
- **8 conteneurs / navigation** : dialog (4 tailles), popover, accordion, breadcrumb, pagination,
  table, stepper, empty-state.
- **8 composants métier** (`components/business/`) : NinaDisplay, CitizenCard, AiScorePanel (jauge
  SVG `role="meter"`), CorrectionTimeline, AlertSeverityBadge, PrioritySlot, LanguageSelector (8
  langues), AESCountrySwitcher.
- **Déprécations React 19** corrigées (`FormEvent`→`SyntheticEvent`, `ElementRef`→`ComponentRef`)
  dans ui + citizen + admin.
- **Déduplication** : le dashboard citoyen (PC-05) consomme désormais la `CorrectionTimeline` du
  design system au lieu d'une copie inline (~75 lignes supprimées ; étape courante en `warning`
  conforme à design-system.md §3.6).
- **Doc** : `figma-prompts.md` aligné (NINA d'exemple valide `…V`, plan 43h).

**Vérif** : `@nina-aes/ui` typecheck + lint OK à chaque lot ; citizen typecheck + lint + **e2e
13/13** après dedupe ; `verify:repo` OK.

**Reste** (cf. ADR-032 § limites) : atomes select/slider ; conteneurs toast/data-grid/error-boundary
; métier UploadZone/MaliMap/DirectiveCard/SignedMessageBubble/WhistleblowerForm/KioskKeyboard/
UssdSimulator ; 5 icônes maliennes ; pipeline Style Dictionary ; dedupe restante (drawer admin,
appointment-form, LanguageSwitcher citoyen).

### 0quaterdecies. Patch 2026-06-17 — Frontend : couture API mock↔live + hooks `@react` + BFF (PROMPT 5.1, tranche 1 — app citizen)

Passage des écrans citoyen d'un rendu **sur mocks locaux** à une **couture de données** branchée sur
`@nina-aes/api-client`, avec bascule mock↔live et garanties de sécurité. **ADR :
[ADR-031](./adr/ADR-031-frontend-data-layer-mock-live-bff.md).**

> Constat de départ : `api-client`, `i18n`, `auth` et les providers React Query **existaient déjà**
> ; le vrai manque était la couture UI ↔ client (aucun hook, aucun écran branché). Décision validée
> (chemin « 1/1/1 ») : **garder le client fait-main**, y ajouter une couche de hooks, **pas** de
> codegen orval au runtime (l'agrégateur du gateway supprime silencieusement les services éteints).

**Livré** :

- **`@nina-aes/api-client`** : interfaces de sous-clients (permettent un mock structurel),
  **`createMockApiClient()`** (fixtures déterministes **validées par les mêmes schémas Zod** =
  fail-closed même en démo), mappers `ficheFromCitizen`/`ficheFromDemo` (modèle de vue
  `CitizenFiche`), option `credentials` sur le `HttpClient` (anonymat). Nouveau sous-chemin
  **`@nina-aes/api-client/react`** : `ApiClientProvider`/`useApiClient` + fabrique de query-keys +
  12 hooks RQ ; `react`/`@tanstack/react-query` en **peerDependencies optionnelles** (`jsx` activé).
- **`apps/citizen`** : `lib/api/{config,server,browser}.ts` (résolution mode + **kill-switch prod**
  `assertApiModeSafe`, couche RSC cookie→Bearer, client navigateur) ; **BFF**
  `app/api/v1/[...path]/route.ts` (Bearer injecté **côté serveur** depuis le cookie httpOnly, jamais
  en JS ; rejet de traversée de chemin) ; `instrumentation.ts` (kill-switch au boot) ;
  `ApiClientProvider` câblé dans `providers.tsx`. **Écrans citoyen PC-02 → PC-06 branchés** : PC-02
  (lecture `fetchCitizenFiche`), PC-03 (`useSubmitCorrection`), PC-04 (`useAvailableSlots` +
  `useCreateAppointment`, créneaux porteurs de leur centre), PC-05 (dashboard via
  `fetchMyCorrections`/`fetchMyAppointments`), PC-06 (**signalement anonyme** `useSubmitAlert` —
  transport sans cookie vers le gateway public, `meta.anonymous` ⇒ pas de redirection /login sur
  401).
- **Bascule** : `NEXT_PUBLIC_NINA_API_MODE` (`mock`|`live`, repli `NEXT_PUBLIC_DEMO_MODE`) ;
  `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_GATEWAY_URL` ajoutés à `apps/citizen/.env.example`.

**Vérif** : typecheck (api-client + citizen) ✅, lint citizen (0 warning) ✅, **e2e citizen 13/13**
(mode mock, dont flux PC-03 soumission→suivi, PC-04 réservation→confirmation, PC-06
signalement→token) ✅, `verify:repo` ✅.

**Revue** : revue adversariale (workflow 16 agents) — 8 findings confirmés → 3 correctifs (BFF
anti-traversée, 401 anonyme via `MutationCache`+`meta`, kill-switch refusant `localhost` en prod) +
3 clarifications de commentaires ; 2 rejetés (dont « NINA mock checksum » — l'e2e prouve `…V`
valide).

**Reste** : polling temps réel PC-05 (hook `useCorrection({ refetchInterval })` prêt, non câblé) ;
apps **admin** & **governance** = tranches suivantes. Mode live câblé mais non testé contre backend
réel (stack non démarrée).

**Drift pré-existant repéré (hors périmètre)** : `.env.example` racine `CITIZEN_PORT=4000` alors que
les apps tournent en 4001/4002/4003 (apps lancées hors docker → pas d'impact runtime).

### 0terdecies. Patch 2026-06-17 — Module IA : pipeline d'entraînement + générateur restauré + intégration `ai-service` (PROMPT 4.3)

Passage de l'IA d'un **scaffold sans modèle** à un pipeline d'entraînement reproductible avec
artefact exporté, évaluation, et `ai-service` qui **charge et score** réellement. **ADR :
[ADR-030](./adr/ADR-030-ai-training-pipeline-bundle-dataset-generator.md).**

**Livré** :

- **`ai-models/training/`** (paquet `training`, Python 3.14, src-layout) : `nina.py` (décodage NINA,
  parité vérifiée avec `packages/utils/nina.ts`), `data.py` (chargement + découpe stratifiée
  60/20/20 reproductible, taxonomie canonique tolérante aux 2 schémas CSV), `features.py`
  (`FeatureBuilder` fit/transform, **38 variables**, référentiels appris sur **train seul** =
  anti-fuite), `train_xgboost.py` (GridSearchCV 5-fold, **bundle joblib auto-suffisant** +
  `metadata.json`, MLflow optionnel → repli JSON, **porte qualité** `--min-f1/--min-auc`),
  `train_anomaly.py` (Isolation Forest SIGAC, amorce Bloc D), `evaluate.py` (rapport HTML **SVG sans
  dépendance**). **44 tests pytest** (33 training + 7 générateur + 4 ai-service réutilisés). Perfs
  de référence (synthétique) : **TEST f1 ≈ 0.87, AUC binaire ≈ 0.99**.
- **`ai-models/dataset-generator/`** : **RESTAURÉ** (source perdue par troncature ENOSPC — cf. §
  incidents). Ré-écrit fidèlement (paquet `dataset_generator`), référentiel embarqué `catalog.json`
  (régions NINA héritées 1-9) amorcé depuis le 1ᵉʳ dataset. Entrypoint réel
  `python -m dataset_generator.generate --rows --output` ; `validate` + `export_reference` CLIs.
- **Intégration `ai-service`** (`app/inference.py` + `app/main.py` + `app/config.py`) : chargement
  du bundle au démarrage **non bloquant**, `GET /api/v1/ai/model-info`,
  `POST /api/v1/ai/reload-models` (**gardé `X-Admin-Token`** si `AI_ADMIN_TOKEN`),
  `POST /api/v1/ai/score` (503 si modèle absent). CORS piloté par config (jamais `*`+credentials).
  `ModelRegistry` thread-safe + validation de forme.
- **CI** : `.github/workflows/train-models.yml` (génération → tests → entraînement avec porte
  qualité → Isolation Forest → rapport → publication d'artefacts). Python 3.14 (pas de spaCy ⇒
  wheels cp314 OK).
- **`.gitignore`** : `ai-models/exported/*.joblib` + `*.run.json` ignorés (régénérables) ;
  `metadata.json` suivi ; `ai-models/datasets/*.csv` et rapports HTML ignorés ; `mlruns/`.

**Revue** : double passe adversariale (2 workflows, 8 relecteurs) — 24 findings 1ʳᵉ passe + 5 de
régression, tous traités ou explicitement hors-périmètre (Dockerfile, RBAC Keycloak, signature
modèle — cf. ADR-030 § limites).

**Incident** : la troncature à 0 octet du `dataset-generator` (et du
`services/ai-service/src/main.py` mort) est cohérente avec la saturation disque `.turbo` (ENOSPC) —
l'app vivante reste `app/main.py`.

**Durcissement (même session)** : intégrité du bundle (sidecar `.sha256` vérifié AVANT
désérialisation, `AI_REQUIRE_SIGNED_BUNDLE`) ; RBAC service (`app/auth.py` — Bearer RS256/JWKS +
rôle, repli `X-Admin-Token`, `AI_JWKS_URL`) ; `services/ai-service/Dockerfile` corrigé (3.13-slim,
`app.main:app`, `training` sur PYTHONPATH) + route `/health` non préfixée. +10 tests ai-service.

**Limites résiduelles** : séparabilité synthétique élevée (perfs réelles RAVEC inférieures) ;
provisioning du bundle en production (volume/MinIO) → doc 20 ; signature cryptographique forte
(Vault/cosign au-delà du SHA-256) → doc 15.

### 0duodecies. Patch 2026-06-13 — `api-gateway` : auth au bord + rate limit Redis + Swagger agrégé (PROMPT 3.7)

Passage du **MVP** (routage + circuit breakers, JWT décodé sans vérification) au service complet
couvrant les 10 responsabilités (`services/api-gateway/`, port 3000). **ADR :
[ADR-029](./adr/ADR-029-api-gateway-auth-termination-jws.md).**

**Livré** :

- **Authentification au bord** : le JWT RS256 est **vérifié une seule fois** (JWKS d'`auth-service`,
  `GatewayAuthGuard` global). Le gateway purge les en-têtes d'identité usurpés en entrée puis
  propage un **`X-User-Context` signé JWS HS256** (TTL 60 s, `UserContextSigner`) aux services aval.
  `Authorization` reste transmis (compat ascendante tant que les avals vérifient eux-mêmes le JWKS).
- **Rate limiting Redis** distribué (`RedisRateLimitGuard`) : par utilisateur authentifié sinon par
  IP, fenêtre fixe (`INCR`+`EXPIRE`), **fail-open** si Redis KO. En-têtes `X-RateLimit-*` + 429
  `E_GW_RATELIMIT` + `Retry-After`.
- **Routage** : table statique complétée — ajout **`biometric`** (3012) et route locale
  **`/api/v1/api-gateway/*`** (introspection, non proxifiée). 16 préfixes publics → 14 avals
  distincts.
- **Swagger agrégé** : `AggregatorService` fusionne les `/api/docs-json` des avals (chemins préfixés
  `/api/v1`, schémas namespacés + `$ref` réécrits, dégradation douce) →
  `GET /api/v1/api-gateway/openapi.json` ; option `SWAGGER_AGGREGATE_ON_BOOT` pour `/api/docs`.
- **Health aggregator** : `/health/ready` (critiques identity+auth + Redis, gate K8s) **distinct**
  de `/health/downstreams` (les 14 avals, observationnel, toujours 200).
- **Compression** gzip/brotli ; **`/metrics`** (observability) ; propagation `traceparent` explicite
  ; SDK OTel **opt-in** (`OTEL_TRACING_ENABLED`).
- **Introspection** : `GET /api/v1/api-gateway/{info,routes,breakers}` (état des circuit breakers
  via `BreakerRegistry` découplé). `routes` ne divulgue jamais l'URL interne d'un service.
- **Config** : `src/config/env.schema.ts` (Zod fail-fast, garde-fou interdisant le secret HS256 de
  dev en production).
- **Tests** : 4 suites / **36 tests** (table de routage, signer JWS, fusion OpenAPI, e2e routage
  bootant le vrai `AppModule` — vérifie aussi le boot du catch-all sous Express 5). `check-types` +
  `build` + `lint` (0 erreur) verts. Stubs Jest des packages ESM `@nina-aes/logger`/`observability`
  (`test/mocks/`, mappés via `moduleNameMapper`).

**Dépendances** : ajout `compression` + `@types/compression`, `zod`, `@nina-aes/observability` et
`@nina-aes/auth-guards` (workspace). Retrait de `express-rate-limit` (inutilisé).

**`turbo.json`** : `OTEL_TRACING_ENABLED` ajouté au `globalEnv`.

### 0undecies. Patch 2026-06-04 — `appointment-service` : prise de RDV + centres (PROMPT 3.6)

Passage du **squelette** (3 fichiers, 1 controller `/health`) à un service complet
(`services/appointment-service/`, port 3008). **ADR :
[ADR-028](./adr/ADR-028-appointment-service-centres-file-attente.md).**

**Livré** :

- **Centres d'enrôlement** (`GET /api/v1/centers`) : liste filtrable (`region`, `cercle`, `service`,
  `openNow`, recherche géo `lat`+`lng`+`radius` triée par distance — Haversine applicatif), détail
  (`:id`), **disponibilités** (`:id/availability`) avec créneaux **STANDARD vs PRIORITAIRE**
  (fenêtre 07:00–09:00 réservée aux vulnérables), et **suggestion** du centre le plus proche libre
  (`/centers/suggest`). Routes publiques (annuaire) + throttler.
- **Rendez-vous** (`/api/v1/appointments`) : création, annulation, **check-in** (entrée en file +
  numéro), **clôture** — transitions de statut **atomiques** (compare-and-set `updateMany`).
- **File d'attente virtuelle** Redis (sorted set par centre/jour, score = arrivée − bonus de
  priorité ⇒ vulnérables prioritaires) + estimation d'attente (heuristique, placeholder ML).
- **No-show** : balayage cron (`@nestjs/schedule`) → **blacklist temporaire 48 h** (clé Redis TTL)
  après 2 absences sur 90 j. **Rappels SMS** confirmation + **J-1** + **H-2** publiés sur l'exchange
  `nina.notifications` (consommés par `notification-service`), **idempotents** via `idempotencyKey`.
- **Anti-surbooking** : `createBookingAtomic` prend un `pg_advisory_xact_lock` au niveau **JOUR** et
  revérifie les 3 niveaux de capacité (créneau / nature / jour) **dans la transaction** — ferme la
  fenêtre TOCTOU du pré-contrôle en lecture.
- **Tests** : 5 suites / 39 tests mockés (géo, grille/disponibilité, file, cœur métier RDV, filtres
  centres). `check-types` + `build` + `lint` verts.

**Schéma & seed** :

- **Nouveau modèle Prisma `EnrollmentCenter`** (1:1 `Institution` via `institution_id @unique`) —
  profil opérationnel d'un centre (services, capacité, quotas, fenêtre prioritaire, horaires
  `openingHours` JSON, géo lat/lng, fuseau). Migration **additive**
  `20260604120000_enrollment_centers`. Re-export du type dans `@nina-aes/database`. Les
  `Appointment` continuent de référencer `institutions(id)` (= `centerId`).
- **Seed** : +5 antennes RAVEC (Kati, Kayes, Sikasso, Ségou, Mopti) ⇒ 10 institutions ; +6 profils
  `EnrollmentCenter` (CTDEC Bamako + 5 antennes). Idempotent (`upsert`).

**notification-service** (additif) : 2 templates ajoutés au catalogue + locale FR —
`appointment-reminder-2h` (H-2, vars `heure`/`location`) et `appointment-cancelled` (SMS+email, vars
`date`/`location`). Test de catalogue mis à jour (7 → 9 templates).

**Revue adverse (workflow multi-agents — 6 problèmes confirmés, tous corrigés)** :

- 🔴 **Quotas journaliers non atomiques** (seul `parallelDesks` revérifié) → verrou consultatif
  **niveau jour** + recompte des 3 niveaux en transaction.
- 🔴 **IDOR/BOLA** : un `CITIZEN` pouvait lire/annuler/créer le RDV d'autrui et vider toute la base
  (pas de liaison `JWT.sub ↔ Citizen.id`) → opérations **médiées** (AGENT/SUPERVISOR/ADMIN, AUDITOR
  en lecture) ; `GET /appointments` exige un filtre de portée (`citizenId`/`centerId`) + pagination
  (≤ 200/page). Self-service CITIZEN rouvrable quand le binding d'identité existera.
- 🟠 **Fenêtre cron de rappel sans marge** (10 = intervalle) → défaut **15 min** (recouvrement) +
  commentaire corrigé.
- 🟡 Désalignement de clé de file (jour RDV vs jour courant) → documenté (`?date`).

**Écarts docs (code fait foi)** :

- `docs/06-DATABASE-SCHEMA-PRISMA.md` (§3.2) et `ADR-011` annoncent « 16 modèles » et n'incluent ni
  les modèles `document-service` (Document/Revocation/AccessLog), ni `AuditRoot`, ni
  `EnrollmentCenter` : ce sont des artefacts de spec initiale.
  **`packages/database/prisma/schema.prisma` fait foi** (22 modèles). `EnrollmentCenter` ajouté au
  récap §3.2 + addendum « évolutions » dans ADR-011.
- Variables d'env propres au service (`APPOINTMENT_*`) : défauts Zod dans `src/config/env.schema.ts`
  (non requises dans `.env.example`). `REDIS_URL`/`RABBITMQ_URL`/`APPOINTMENT_SERVICE_PORT` déjà
  présentes.

**Limite connue** : pas de self-service CITIZEN direct tant que la liaison `JWT.sub ↔ Citizen.id`
n'est pas livrée (ressort `identity`/`auth-service`) ; les citoyens passent par un agent ou le BFF
du portail (compte de service AGENT). Cf. README §7 + ADR-028 §5.

### 0decies. Patch 2026-05-31 — `notification-service` : multicanal complet (PROMPT 3.5)

Passage du **squelette** (5 fichiers, 2 controllers) à un service complet
(`services/notification-service/`, port 3005).

**Livré** :

- **3 canaux** derrière une interface `ChannelProvider` + un `ChannelDispatcher` :
  - **SMS** Africa's Talking (`src/notifications/channels/sms.provider.ts`) — client REST `fetch`
    (pas le SDK : style `vault-client`, testable, souveraineté), sandbox détecté via
    `AT_USERNAME=sandbox`, mapping des statuts DLR.
  - **Email** SMTP nodemailer (Maildev en dev) — import nommé `createTransport` (pas de défaut CJS).
  - **Push** FCM HTTP v1 (`push.provider.ts`) — OAuth2 « service account JWT bearer » signé RS256
    avec `node:crypto` (sans `firebase-admin`), repli **dev simulé** (`FCM_ENABLED=false` par
    défaut, app mobile non encore livrée).
- **API REST** `/api/v1/notifications` : `POST /send` (synchrone), `POST /broadcast` (ADMIN, publie
  sur RabbitMQ), `GET /:id/status`, `GET /templates`, `GET /metrics`, `POST /atalking/callback`
  (webhook DLR `@Public` + secret partagé). Guards JWKS locaux (ADR-027).
- **Consumer RabbitMQ** (`amqp-connection-manager`, workers parallèles via `prefetch`) consommant
  `notification.sms/.email/.ussd/.push` + la file de ré-injection `notification.work`. Dispatch par
  `body.channel` (la file n'est qu'un transport).
- **Ré-essai exponentiel → DLQ** : files de délai TTL par palier `notification.retry.1..5` (1 min /
  5 min / 30 min / 2 h / 12 h) ; dead-letter → `nina.notifications` clé `notification.requeue` →
  `notification.work`. Échec définitif → `nina.dlx` → `dlx.parking`. (Une file PAR palier : évite le
  blocage en tête de file des TTL hétérogènes ; pas de plugin delayed-message requis.)
- **Idempotence** : colonne `notifications.dedupe_key` **UNIQUE** (nullable) — migration
  `20260531120000_notification_dedupe_key`. Clé =
  `SHA-256(recipient|canal|template|variables canoniques)`. La création joue le rôle de **verrou
  atomique** (create-first) : sur P2002, l'existant est renvoyé (succès / PENDING dédupliqués) ou
  repris pour ré-essai si `FAILED` (compare-and-set atomique).
- **Templates 8 langues** (`src/notifications/templates/locales/*.json`, copiés en `dist` via
  `nest-cli.json` assets). **FR complet** ; les 7 autres langues retombent sur FR (relecture
  locuteur natif en attente — cf. gap « Fichiers i18n manquants »).
- **Tests** : 4 suites / 25 tests mockés (templates, cœur métier dont idempotence/course/ré-essai,
  fournisseur AT `fetch` mocké, topologie). + smoke test d'intégration manuel (cf. encadré
  ci-dessous).

**Écarts docs (code fait foi)** :

- `docs/06-DATABASE-SCHEMA-PRISMA.md` montre `Notification` sans `dedupe_key` → colonne ajoutée par
  la migration `20260531120000_notification_dedupe_key`.
- `infrastructure/docker/rabbitmq/definitions.json` gagne 7 files (`notification.push`,
  `notification.work`, `notification.retry.1..5`) + 2 liaisons — alignées 1:1 sur la topologie
  assertée par le service (cf. `src/notifications/consumer/amqp.topology.ts`).
- Nouvelles variables d'env (préfixes `AT_*`, `SMTP_*`, `FCM_*`, `RABBITMQ_*`, `NOTIFICATION_*`) :
  schéma Zod `src/config/env.schema.ts` ; déjà présentes dans `.env`/`.env.example` pour AT et SMTP.

**Choix notables** : SDK Africa's Talking **non utilisé** (client `fetch` typé, mockable) ; secrets
attendus **injectés par Vault Agent** dans l'environnement (l'app ne lit pas Vault directement).

**Revue adverse + smoke test d'intégration (correctifs appliqués)** : ACK **durable** (NACK+requeue
si la republication retry/DLQ échoue — plus de perte silencieuse) ; **double-envoi concurrent
neutralisé** — la CRÉATION de la ligne (contrainte `UNIQUE(dedupe_key)`) sert de **verrou atomique
d'expédition** (« create-first » : seul le créateur expédie), et le ré-essai d'une ligne `FAILED`
est repris par un _compare-and-set_ atomique `FAILED→PENDING` (`claimForRetry`) ; validation des
champs du compte de service FCM ; repli `providerId` email sur `response` ; webhook DLR via en-tête
`x-callback-token`.

> Le **smoke test local** (Postgres + RabbitMQ + Maildev) a **révélé** ce double-envoi (2 e-mails
> pour 2 publications identiques) que les tests mockés ne voyaient pas — corrigé (create-first) puis
> re-vérifié (1 e-mail / 1 ligne). Validés aussi en exécution réelle : topologie assertée **sans
> 406**, retry → `notification.retry.1`, DLQ → `dlx.parking`, santé Postgres. (NB poste de dev :
> `localhost` résout en IPv6 `::1` d'abord ; les drivers Node échouent en `ECONNRESET` sur les
> mappings Docker IPv4 — lancer avec `POSTGRES_HOST=127.0.0.1` + `RABBITMQ_URL`/`SMTP_HOST` en
> `127.0.0.1`.)

**Limite connue (résiduelle — à traiter en phase tests/charge, doc 18 / k6)** : si un worker
**crashe en plein envoi**, la ligne reste `PENDING` ; une redélivrance la considère « en cours » et
ne ré-expédie pas → notification non livrée jusqu'à réarmement. Fermeture = balayeur réarmant les
`PENDING` périmés (`updated_at` ancien). Reporté (probabilité très faible, hors chemin nominal).

### 0novies. Patch 2026-05-30 — `audit-service` : implémentation Merkle complète (PROMPT 3.4)

Passage du **squelette** à un service complet (`services/audit-service/`, port 3007).

**Livré** :

- **Chaîne Merkle SHA-256 append-only** : `previousHash → merkleHash` (`src/audit/chain.ts` —
  `canonicalJson` à clés triées, **pas** la lib `canonicalize` : indispensable car JSONB réordonne
  les clés au stockage ; fonction dupliquée à l'identique dans le script offline).
- **Immutabilité DB** : migration `20260530120000_audit_chain_immutability` — table `audit_roots` +
  triggers `BEFORE UPDATE/DELETE` (fonction partagée `nina_reject_audit_mutation()`) sur
  `audit_logs` ET `audit_roots` + REVOKE best-effort (`nina_app`). Modèle Prisma `AuditRoot` ajouté.
- **Scellement horaire** Ed25519 (`@noble/ed25519`, clé **Vault KV** `VAULT_AUDIT_KEY_PATH`, repli
  clé éphémère en dev) → `audit_roots`.
- **Consumer RabbitMQ** (`amqp-connection-manager`) : `nina.audit` (fanout) + `nina.events` (topic,
  patterns `citizen.#`/`correction.#`/…), **batching** 500 ms / 1000, ACK différé après commit,
  idempotence `source_event_id`.
- **Anti-fork de chaîne** : chaque `append` prend un `pg_advisory_xact_lock` (sérialisation globale
  POST + batch, multi-instances).
- **API REST** `/api/v1/audit` : POST (m2m), liste paginée, `/verify`, `/export` (CSV + signature
  Ed25519 en en-têtes), `/:id`, `/:id/proof`, `/roots/latest`. Guards JWKS locaux (ADR-027).
- **Vérif offline** `pnpm --filter @nina-aes/audit-service verify:chain`.

**Drift signalé** : `document-service` publiait sur `audit.events`, `identity-service` sur
`nina-aes.events` — ni l'un ni l'autre ne correspondait à `nina.events` consommé par audit-service.
**✅ Résolu en 0vicies** (réconciliation côté publishers).

**Versions** : `@noble/hashes@^1.8.0` (la 1.9.0 n'existe pas ; la v2 déplace les sous-chemins) ;
`canonicalize` retiré du service.

ADR alignées : ADR-007 (Merkle), ADR-014 (audit append-only), ADR-027 (guards).

### 0octies. Patch 2026-05-30 — `pnpm docker:up` auto-bootstrap MinIO (scripts/minio-bootstrap.mjs)

Symétrise le pattern `vault-bootstrap` pour MinIO. L'ancienne sidecar `minio-init` du
docker-compose.dev.yml créait **un seul** bucket (`nina-documents`) alors que
`scripts/init-minio.sh` en crée **quatre** + applique les policies — duplication partielle, source
de drift.

**Solution** : `scripts/minio-bootstrap.mjs` (Node, idempotent, cross-platform, sans dep npm
nouvelle — utilise `docker exec nina-minio mc` car le client `mc` est embarqué dans l'image MinIO
serveur). Couvre :

- 4 buckets : `nina-photos`, `nina-documents`, `nina-scans`, `nina-backups`
- Versioning activé sur `nina-documents` (rollback FDI en dev)
- Anonymous read sur `nina-photos` (dev only — pas de PII directe)

**Caractéristiques** :

- **Idempotent** — `mc mb --ignore-existing`, `mc version enable` (no-op si déjà actif),
  `mc anonymous set` (re-applicable).
- **Robuste** — poll `/minio/health/live` jusqu'à 60s.
- **Cross-platform** — Node 24, pas de dépendance `mc` CLI côté hôte ni SDK npm.

**Wiring** :

```jsonc
// package.json
"docker:up": "docker compose ... up -d && pnpm run vault:bootstrap && pnpm run minio:bootstrap",
"minio:bootstrap": "node scripts/minio-bootstrap.mjs"
```

**Cleanup associé** : suppression de la sidecar `minio-init` du `docker-compose.dev.yml` (34 lignes
; couverture incomplète, remplacée par le nouveau script qui fait strictement plus).

**Compatibilité avec `scripts/init-minio.sh`** : le script bash reste l'oracle si on doit seeder
manuellement (debug, env distant). `minio-bootstrap.mjs` est volontairement le miroir fonctionnel
pour le flow automatisé.

### 0septies. Patch 2026-05-30 — env preload `@nina-aes/database` + fix `28P01` identity-service

Boot d'`identity-service` échouait avec `password authentication failed for user "nina_admin"`
(`SQLSTATE 28P01`). Diagnostic double :

1. **`ConfigModule.forRoot({ isGlobal: true })`** sans `envFilePath` ni `expandVariables: true` dans
   4 services (identity-service, enrollment-service, api-gateway, ussd-service) — même bug déjà
   corrigé pour `auth-service` et `document-service`. Le `.env` racine n'était pas chargé,
   `DATABASE_URL` restait `undefined`.
2. **`packages/database/src/index.ts`** avait un fallback drift hardcodé
   `postgresql://nina_admin:nina_dev_2026_secure@...` (password obsolète vs `.env` actuel
   `nina_dev_2026!`). Le PrismaPg adapter tombait en mode "wrong-password silencieux".

**Mais le fix ConfigModule seul ne suffit pas** : `@nina-aes/database` instancie `prisma` **au
top-level** (singleton), donc à l'import-time d'un controller — avant que `ConfigModule.forRoot()`
ait pu charger l'env. Trois symptômes possibles selon le shell : 28P01, fallback drift, ou la
nouvelle erreur fail-loud `DATABASE_URL is not set`.

**Solution finale** : pré-chargement du `.env` directement dans `@nina-aes/database` (auto-discovery
en remontant l'arbre depuis `cwd`). Self-healing, transparent pour tous les consommateurs, aucune
action côté services.

**Changements** :

- `packages/database/src/index.ts` :
  - Ajout `preloadRootEnv()` au top : remonte 6 niveaux à la recherche d'un `.env`, le charge avec
    `dotenv` + `dotenv-expand` (idempotent — n'écrase pas les vars déjà set dans `process.env`).
  - `createBareClient()` : fallback hardcodé supprimé → **throw clair** si `DATABASE_URL` absent.
- `packages/database/package.json` : `dotenv` + `dotenv-expand` promus `devDependencies` →
  `dependencies`.
- 4 services :
  `ConfigModule.forRoot({ envFilePath: ['../../.env', '.env'], expandVariables: true })` ajouté
  (défense en profondeur — `@nina-aes/database` charge déjà l'env, mais le ConfigModule doit le voir
  aussi pour `cfg.get('DATABASE_URL')` etc.).

**Validation runtime** : `identity-service` boot OK sur `:3001` ; `GET /health` →
`{database: up, redis: up, rabbitmq: up}` (le seul `down` restant est `ai-service` FastAPI non
démarré, orthogonal).

### 0sexies. Patch 2026-05-30 — `pnpm docker:up` auto-seed Vault (scripts/vault-bootstrap.mjs)

Vault dev mode utilise un storage `inmem` — chaque restart du container `nina-vault` efface tous les
secrets. Re-jouer manuellement `seed-secrets.sh` à chaque `docker:up` est friable (et le script
complet a 11 sections dépendantes de Postgres/Keycloak/MinIO qui ne sont pas toutes nécessaires au
boot de tous les services).

**Solution** : `scripts/vault-bootstrap.mjs` (Node, aucune dep externe) appelle l'API Vault HTTP
directement et seed le **strict minimum** requis par les services actuellement implémentés :

- `kv/data/auth/jwt` (RSA 2048, `kid=dev-rs256-YYYYMMDD-HHHH`) → `auth-service`
- `transit/keys/auth-mfa-secret` (AES-256-GCM96) → `auth-service` TOTP MFA
- `transit/keys/nina-qr-signing` (RSA-3072 non exportable) → `document-service` QR FDI

**Caractéristiques** :

- **Idempotent** — si `kv/data/auth/jwt` contient déjà la shape attendue, skip (préserve le `kid`
  existant entre boots). Les engines `kv-v2` et `transit` ont aussi un check « already mounted ».
- **Robuste au démarrage** — poll `/sys/health` jusqu'à 60 s pour laisser Vault s'auto-init en mode
  dev (typiquement <2 s).
- **Cross-platform** — Node 24, `fetch` natif, `crypto.generateKeyPairSync` natif. Pas de dépendance
  à `openssl` CLI ni au binaire `vault`.

**Wiring** :

```jsonc
// package.json
"docker:up": "docker compose ... up -d && pnpm run vault:bootstrap",
"docker:up:bare": "docker compose ... up -d",          // escape hatch
"vault:bootstrap": "node scripts/vault-bootstrap.mjs"  // invocation directe
```

**Compatibilité avec `infrastructure/vault/seed-secrets.sh`** : le script bash reste l'oracle pour
le seed COMPLET (Keycloak, MinIO, database creds, SIGAC), invoqué manuellement quand ces services
sont effectivement câblés. `vault-bootstrap.mjs` est volontairement le sous-ensemble strictement
nécessaire au boot.

### 0quinquies. Patch 2026-05-30 — `infrastructure/vault/seed-secrets.sh` aligné sur auth-service

Le script `seed-secrets.sh` créait `kv/data/jwt/private` + `kv/data/jwt/public` (deux secrets
séparés, schéma legacy). Or `vault.service.ts` (PROMPT 3.2) lit `VAULT_JWT_KEYS_PATH` (défaut
`auth/jwt`) et exige les champs **`{private_pem, public_pem, kid}` en un seul secret**. Au boot
d'`auth-service`, `VaultService.loadJwtKeys()` retournait 404 sur `kv/data/auth/jwt`.

**Sections ajoutées au script** (`§1bis`, `§1ter`, `§1quater`) :

- `kv/data/auth/jwt` — shape exacte attendue par `vault.service.ts` (mêmes PEMs RSA 2048 que
  `kv/jwt/private` legacy, ajout du champ `kid="dev-rs256-YYYYMMDD"`).
- `transit/keys/auth-mfa-secret` (AES-256-GCM96) — chiffrement au repos des secrets TOTP MFA côté
  `auth-service` (`VAULT_TRANSIT_MFA_KEY`).
- `transit/keys/nina-qr-signing` (RSA-3072, non exportable) — signature des QR FDI côté
  `document-service` (cf. [ADR-026](./adr/ADR-026-vault-transit-qr-signing.md)).

**Validation runtime** :

- Engines `kv-v2` et `transit` activés dans le container `nina-vault`.
- `auth-service` boot OK sur `:3002` : log critique
  `[VaultService] Clés JWT chargées depuis Vault (kid=dev-rs256-20260530, path=auth/jwt)` puis
  `Nest application successfully started`.
- `curl http://localhost:3002/.well-known/jwks.json` → 200 OK (JWKS publié).
- Tous les modules initialisés : VaultModule, RedisModule, CryptoModule, SmsModule, KeycloakModule,
  AppModule, AuthModule (13 routes mappées).

**Reste à faire (out of scope ici)** : intégrer ce seed au `pnpm docker:up` ou créer une commande
`pnpm vault:seed` pour automatiser le bootstrap quand un dev démarre le stack la première fois.

### 0quater. Patch 2026-05-30 — `@nina-aes/auth-guards` refacto type-only (ADR-027)

Le package `@nina-aes/auth-guards` v0.1.0 exportait les **classes Nest `@Injectable()`**
`JwtAuthGuard`, `RolesGuard`, `MfaGuard`. Au boot d'`auth-service`, NestJS levait
`UnknownDependenciesException(Reflector)` — cause : duplication physique de `@nestjs/core` côté pnpm
store (deux hashs de peer-deps → deux classes `Reflector` distinctes → identité DI cassée).

**Décision** (cf. [ADR-027](./adr/ADR-027-auth-guards-type-only-package.md)) : le package devient
**type-only / metadata-only** (v0.2.0). Les classes Guards sont **dupliquées localement** dans
chaque service consommateur sous `services/<svc>/src/auth/guards/`. Seul le contrat partagé (types
`AuthSubject`/`JwtVerifier`, token DI `JWT_VERIFIER`, clés de métadonnées) et les décorateurs
`SetMetadata`-purs (`@Public`, `@Roles`, `@RequireMfa`) restent dans `auth-guards`.

**Validation runtime** :

- `auth-service` boot OK sur `:3002` — tous les modules s'initialisent (Vault, Redis, Crypto, Sms,
  Keycloak, AppModule, AuthModule) et les 13 routes sont mappées.
- `document-service` boot toujours OK sur `:3004` (guards locaux dans `src/auth/guards/`).
- Échec restant orthogonal : `VaultService.loadJwtKeys()` 404 sur `kv/data/auth/jwt` (seed Vault
  manquant — n'est PAS lié à la DI, est un script de provisioning à exécuter une fois).

**Fichiers modifiés** :

- `packages/auth-guards/` : `src/guards/` supprimé ; `src/index.ts` réécrit ; `package.json` v0.2.0
  (peer-dep `@nestjs/core` retirée, ne reste que `@nestjs/common`).
- `services/auth-service/src/auth/guards/` (NEW) : `jwt-auth.guard.ts`, `roles.guard.ts`,
  `mfa.guard.ts`, `index.ts`.
- `services/document-service/src/auth/guards/` (NEW) : `jwt-auth.guard.ts`, `roles.guard.ts`,
  `index.ts`.
- `services/auth-service/src/app.module.ts` : import des guards depuis chemin local.
- `services/document-service/src/documents/documents.controller.ts` : import des guards depuis
  chemin local.

**Règle d'or** posée par l'ADR : _tout package workspace
`@nina-aes/_`consommé par un service Nest ne doit exporter que des éléments « erased au build » (types) ou des constantes pures (strings, symbols, fonctions sans DI). Toute classe`@Injectable()`
doit vivre dans le service consommateur.\*

### 0ter. Patch 2026-05-28 — document-service Phases 1-10 livrées (PROMPT 3.3 scaffold complet)

Scaffold complet du `document-service` matérialisé en 10 commits incrémentaux
(`feat(document): phase N/10`) + 1 chore monorepo (pnpm 11.4 + verifyDepsBeforeRun).

| Phase | Commit    | Livrable                                                                              |
| ----- | --------- | ------------------------------------------------------------------------------------- |
| 1/10  | `fe00b5f` | Foundation : deps (Puppeteer, pdf-lib, jose, minio, ioredis…) + env Zod + bootstrap   |
| chore | `ee3b200` | pnpm 11.2 → 11.4 + `verifyDepsBeforeRun: false` (fix race Windows bin shim)           |
| 2/10  | `b1e9a3a` | Prisma : Document + DocumentRevocation + DocumentAccessLog + triggers append-only     |
| 3/10  | `c37b8d8` | IdentityClient HTTP vers identity-service:3001 + types DTO                            |
| 4/10  | `af57b8a` | QR module : Vault Transit RS256 (kid versionné) + JWKS cache 24h + révocation Redis   |
| 5/10  | `e8a5823` | Templates Handlebars + 8 partials + CSS A4 + i18n 4 langues (FR/BM/SNK/FUV)           |
| 6/10  | `c4880ad` | PDF Puppeteer pool (CONCURRENCY_CONTEXT × 4) + pdf-lib (PDF/A-3b + qr.jwt attachment) |
| 7/10  | `99b2d3f` | Storage MinIO (Object Lock COMPLIANCE 10 ans + presign 1h)                            |
| 8/10  | `69010e9` | FdiService orchestrateur (9 étapes) + AuditPublisher RabbitMQ + serial + watermark    |
| 9/10  | `bc9fac4` | Controllers REST (6 endpoints) + DTOs Zod + JwksJwtVerifier + Health Terminus enrichi |
| 10/10 | `4f491fb` | Tests : 23 unit + 7 e2e smoke + script `demo:fdi` autonome (rendu local sans stack)   |

**Endpoints exposés** :

- `POST /api/v1/documents/fdi` — JWT + role citizen|agent|admin
- `GET  /api/v1/documents/:id/download-url` — JWT + role citizen|agent|admin
- `DELETE /api/v1/documents/:id` — JWT + role admin
- `POST /api/v1/public/documents/verify-qr` — PUBLIC, rate-limit 30/min/IP
- `GET  /api/v1/health` + `/live` + `/ready` — Terminus (Postgres + MinIO + identity)
- `GET  /api/docs` — Swagger OpenAPI 3.1

**Écarts notables vs doc 10 v2.0** :

- `JwksJwtVerifier` (sync, contrat `JwtVerifier` de `@nina-aes/auth-guards`) ajouté côté
  document-service au lieu d'être dans `@nina-aes/auth-guards` — il dépend d'env (`AUTH_JWKS_URL`)
  propre au consommateur
- `@nina-aes/vault-client.transitSign` étendu avec opts
  `{ prehashed, signatureAlgorithm: 'pkcs1v15' | 'pss', hashAlgorithm }` + nouveau
  `transitReadKey()` pour `kid` versionné (backward-compat, 4 tests existants verts)
- `i18n` recentré P0 sur 4 langues (FR complet, BM partiel, SNK + FUV squelettes avec fallback FR) —
  4 autres langues planifiées Sprint 5 Bloc B
- Script `demo:fdi` (génère 2 PDFs locaux FR + BM, JWT factice ad-hoc, sans appel
  Vault/MinIO/identity) — pratique pour démo soutenance UQAR

**Couverture tests** : 23 unit (canonical, format-nina, watermark, revocation, DTOs Zod) + 7 e2e
smoke (health/live contract + verify-qr DTO pipeline). Tests HTTP complets avec testcontainers
reportés à doc 18 (testing strategy).

**Implémentation code restant à produire (hors document-service)** :

- `infrastructure/vault/init/05-create-qr-key.sh` (génération initiale de la clé `nina-qr-signing`
  RSA 3072 au boot Vault dev)
- Script init MinIO pour créer le bucket `fiches` avec `--with-lock` + retention COMPLIANCE 3650d
  (irréversible — voir docs/10 §10.1)
- `auth-service` doit exposer `/.well-known/jwks.json` (consommé par JwksJwtVerifier) — déjà prévu
  cf. CHANGELOG patch 0 §0

---

### 0bis. Patch 2026-05-25 — `docs/10` v2.0 réécrit (PROMPT 3.3 design Vault Transit + Object Lock)

Réécriture complète de `docs/10-BACKEND-DOCUMENT-SERVICE.md` (passage v1 → **v2.0**, ~1060 lignes).
Le **design** du service est mis à jour ; **aucun code applicatif n'est encore écrit** sous
`services/document-service/src/` (le scaffold contient toujours `app.controller.ts`,
`app.module.ts`, `main.ts`, `modules/health/`). Le code complet est planifié en PROMPT 3.4.

Écarts vs design v1 documentés en §0 ailleurs (cf. §Addendum d'ADR-006) :

| Domaine              | v1 (avril 2026)                                           | **v2.0 (2026-05-25)**                                                             |
| -------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Signature QR         | Clé chargée depuis `kv-v2` en RAM applicative             | **Vault Transit** `transit/sign/nina-qr-signing/sha2-256` — clé jamais hors Vault |
| Payload JWT          | `nina` + `biometric_hash` + iat/iss/exp                   | **+ `jti` + `fdi.hash` (SHA-256 JSON canonique) + `citizen` minimisé + `wm`**     |
| Révocation           | Non documentée                                            | **Redis SET `qr:rev:<jti>` avec TTL aligné sur `exp`** + endpoint `DELETE /:id`   |
| Stockage MinIO       | SSE-C par citoyen                                         | **Bucket `fiches` avec `--with-lock` + Object Lock COMPLIANCE 10 ans**            |
| Internationalisation | 8 langues annoncées (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE) | **Recentré P0 sur 4 langues (FR, BM, SNK, FUV)** ; 4 autres repoussées Bloc B     |
| `kid` du JWT         | `jwt-rs256-v1` statique                                   | **`nina-qr-signing-v{N}`** lié à `latest_version` Vault (rotation à chaud)        |
| Endpoints            | 5                                                         | **6** (+ `GET /metrics` mTLS only pour scrape Prometheus)                         |
| Référence ADR        | ADR-006 seul                                              | **ADR-006 + Addendum 2026-05-25 + nouveau ADR-026 (Vault Transit)**               |

**Nouveaux artefacts créés dans le même change set** :

- `docs/adr/ADR-006-jwt-rs256-qr-code.md` — section "Addendum 2026-05-25" ajoutée (payload v2.0,
  signature Vault Transit, révocation Redis, rotation à chaud avec coexistence v(N-1)/v(N))
- `docs/adr/ADR-026-vault-transit-qr-signing.md` — **nouveau** (porte le passage de 25 → 26 ADRs)
- `infrastructure/vault/policies/document-service.hcl` — politique minimale (sign + read key only,
  deny rotate + export, deny autres clés)

**À produire au prochain PROMPT (3.4)** :

- `infrastructure/vault/init/05-create-qr-key.sh` (génération initiale `nina-qr-signing` au boot)
- Script init MinIO pour créer le bucket `fiches` avec `--with-lock` (irréversible)
- Scaffold complet `services/document-service/src/` (modules `documents/`, `fdi/`, `pdf/`, `qr/`,
  `templates/`, `storage/`, `audit/`, `i18n/`) — pattern à suivre = `auth-service` (PROMPT 3.2)

---

### 0. Patch 2026-05-25 — auth-service Phases 1-10 livrées (PROMPT 3.2 scaffold complet)

Scaffold complet du `auth-service` matérialisé en 10 commits incrémentaux (`feat(auth): phase N/10`)
plus le realm Keycloak (`feat(infra): phase 9/10`). Cf. `docs/08-BACKEND-AUTH-SERVICE.md` §0 pour la
liste exhaustive des endpoints + écarts vs design initial.

- **15 endpoints REST** livrés (register, login, refresh, logout, MFA TOTP/SMS, password reset, /me)
- **3 packages nouveaux/modifiés** : `@nina-aes/auth-guards` (workspace dédié) + ajouts à
  `@nina-aes/vault-client` (`transitEncrypt`/`transitDecrypt`)
- **Realm Keycloak** importé automatiquement (`infrastructure/keycloak/import/`)
- **Tests Phase 10** : 17 unitaires (Argon, OTP, Refresh rotation/replay, ThrottleGuard) + 2 e2e
  smoke (health + prefix `api/v1`)

Écarts notables documentés dans §0 du doc 08 : JWT signés par Vault et non Keycloak,
`LoginThrottleGuard` custom Redis (au lieu de `@nestjs/throttler`), DTOs Zod (pas class-validator),
MFA TOTP chiffré via Vault Transit.

---

## 1. Stack technique — versions effectives (avril–mai 2026)

| Composant                    | Doc initiale                                  | **Réel courant**                                                             |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Prisma + `@prisma/client`    | 7.7.0 (PROMPT 1.3)                            | **7.8.0**                                                                    |
| Moteur Prisma                | « library » binaire embarqué                  | **« client » + driver adapter** (`@prisma/adapter-pg` + `pg`)                |
| Image PostgreSQL             | `postgres:18.3-alpine3.22`                    | **`postgis/postgis:18-3.6`** (intègre `postgis` + ext. requises)             |
| Locale Postgres              | `--locale=fr_FR.UTF-8`                        | **`--locale-provider=icu --icu-locale=fr-FR --encoding=UTF8`**               |
| Volume Postgres              | `nina-postgres-data:/var/lib/postgresql/data` | **`nina-postgres-data:/var/lib/postgresql`** (parent — exigence Postgres 18) |
| Compose & .env               | implicite                                     | **`docker compose --env-file .env -f …`** (script `docker:up` mis à jour)    |
| Vitest (`packages/database`) | `^2.2.0`                                      | **`^4.1.5`** (la 2.2 n'existait pas)                                         |
| TypeScript root tsconfig     | `moduleResolution: node`, `baseUrl`           | **`NodeNext`**, `baseUrl` retiré, placeholder `scripts/typecheck.ts`         |

### 1.0 Patch 2026-05-24 — `docs/08` aligné PROMPT 3.2 (auth-service)

Patch ciblé sur `docs/08-BACKEND-AUTH-SERVICE.md` (préservation des 2607 lignes existantes) pour
couvrir les exigences manquantes du PROMPT 3.2 (master prompt v3) :

| Domaine                  | Modification                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Titre (L1)               | Keycloak `26.1` → **`26.6.2`** ; mention **Node.js 24.14+ LTS** ; Redis `7` → **`8.6`** ; PG `17` → **`18`**                                                                                                                                                                                                                                                                                                            |
| Rate limit `/auth/login` | `5 req / 60 s / IP` → **`5 req / 900 s (15 min) / IP`** (anti-bruteforce OWASP ASVS V11.1)                                                                                                                                                                                                                                                                                                                              |
| Table § 3.3 endpoints    | +6 endpoints : `register/otp/send`, `mfa/enable`, `mfa/verify`, `mfa/sms`, `password/forgot`, `password/reset`                                                                                                                                                                                                                                                                                                          |
| Table § 3.4 RBAC         | 4 → **6 rôles** : ajout `SUPERVISOR`, `AUDITOR`, `ANTICORRUPTION_INSPECTOR` ; `governance_viewer` marqué _legacy_ (mappé sur `auditor`) ; table « Politique MFA par rôle »                                                                                                                                                                                                                                              |
| Realm JSON § 4.3         | Mêmes 6 rôles ajoutés au realm Keycloak (`composites` mis à jour : `admin > supervisor > agent > citizen`)                                                                                                                                                                                                                                                                                                              |
| § 6.13bis (nouveau)      | DTOs (`RegisterCitizenDto` étendu téléphone+OTP, `EnableMfaDto`, `VerifyMfaDto`, `SendMfaSmsDto`, `ForgotPasswordDto`, `ResetPasswordDto`, `SendRegisterOtpDto`) + méthodes service (TOTP via `otplib`, QR via `qrcode`, SMS via `africastalking`, reset JWT signé RS256 usage unique via Redis `jti`) + handlers controller + table Argon2id/Vault + esquisse `MfaGuard` extrait dans `@nina-aes/auth-guards` (doc 15) |
| § 7.1bis (nouveau)       | Politique MFA : optionnel `CITIZEN`, **obligatoire** pour `AGENT/SUPERVISOR/ADMIN/AUDITOR/ANTICORRUPTION_INSPECTOR` (claim `amr` RFC 8176 vérifié par `MfaGuard`)                                                                                                                                                                                                                                                       |

Dépendances NPM additionnelles documentées : `otplib ^12.0.1`, `qrcode ^1.5.4`,
`africastalking ^0.7.3`, `nodemailer ^7.0.5`, `argon2 ^0.43.0`. Aucune dépendance étrangère sensible
(souveraineté préservée).

**Implémentation code non encore réalisée** — le doc 08 décrit la cible ; le scaffolding du
`services/auth-service/` reste à produire (suit le pattern `identity-service` du doc 07).

### 1.1 Bump 2026-05-23 — Images Docker infrastructure

Mise à jour groupée des images Docker dans `infrastructure/docker/docker-compose.dev.yml`, propagée
à `.github/workflows/ci.yml`, `infrastructure/k8s/cronjobs/vault-rotation.yaml`, `docs/02`,
`docs/05`, `docs/08` et aux diagrammes (`docs/diagrams/99-DIAGRAMMES-*.md`).

| Image               | Avant                                  | **Après**                                     | Raison                                                                                                                                                         |
| ------------------- | -------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redis`             | `8.6-alpine` (tag flottant)            | **`8.6.3-alpine`**                            | Pin patch pour reproductibilité dev / CI / prod                                                                                                                |
| `rabbitmq`          | `4.2-management-alpine` (tag flottant) | **`4.2.4-management-alpine`**                 | Pin patch (release 2026-02-27)                                                                                                                                 |
| `elasticsearch`     | `9.3.2`                                | **`9.4.1`**                                   | Latest stable (release 2026-05-12)                                                                                                                             |
| `kibana`            | `9.3.2`                                | **`9.4.1`**                                   | Doit suivre la même `major.minor` qu'Elasticsearch                                                                                                             |
| `minio/minio`       | `RELEASE.2025-09-07T16-13-09Z` (déjà)  | **`RELEASE.2025-09-07T16-13-09Z`** (inchangé) | ⚠️ Repo amont archivé 2026-04-25 — c'est déjà la **dernière image** publiée sur Docker Hub ; aucune release ultérieure ne sera poussée (migration à planifier) |
| `minio/mc`          | `latest`                               | **`RELEASE.2025-08-13T08-35-41Z`**            | `latest` non reproductible + repo archivé ; mc a son propre calendrier (antérieur au serveur)                                                                  |
| `keycloak/keycloak` | `26.5`                                 | **`26.6.2`**                                  | Latest stable, pas de breaking change vs 26.5 pour `start-dev` + `KC_DB=postgres`                                                                              |
| `hashicorp/vault`   | `1.20`                                 | **`2.0.1`**                                   | Saut majeur 1.x → 2.x (release 2026-05-19). `cap_add: [IPC_LOCK]` toujours requis (déjà en place)                                                              |
| `maildev/maildev`   | `latest`                               | **`2.2.1`**                                   | `latest` non reproductible                                                                                                                                     |

Corrections supplémentaires appliquées dans `docker-compose.dev.yml` (et docs/02) :

- `KC_DB_PASSWORD` éclaté sur 2 lignes avec un commentaire orphelin → remis sur une seule ligne,
  commentaire « Mode développement (HTTP…) » déplacé au-dessus de `KC_HOSTNAME` auquel il
  s'appliquait. **Pourquoi** : YAML acceptait le scalaire wrappé, mais c'était fragile (un futur
  parseur ou linter strict aurait pu y voir la valeur `${…} # Mode développement…`).
- Lignes mortes `# KC_HTTP_ENABLED:` et `# KEYCLOAK_ADMIN[_PASSWORD]:` supprimées (doublons
  commentés des envs actifs juste au-dessus).
- Commentaires d'en-tête « Elasticsearch 8 » / « 9.x pas encore en image Docker stable en avril 2026
  » mis à jour pour refléter la 9.4.1 réellement utilisée.
- Healthcheck Keycloak de docs/02 corrigé sur le port management 9000 (et non 8080) — KC 25+
  n'expose plus `/health/*` sur le port API.
- Healthcheck RabbitMQ de docs/02 corrigé (`check_running` seul ; `ping check_running` mélangeait
  deux sous-commandes — déjà documenté dans le bandeau de docs/05).
- Healthcheck Vault de docs/02 préfixé par `VAULT_ADDR=http://127.0.0.1:8200` (sans ça,
  `vault status` parle HTTPS en mode dev).

## 2. Packages monorepo — état effectif

| Package                  | Statut               | Notes                                                                                                                                                                                                                      |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nina-aes/shared-types` | ✅ aligné PROMPT 1.2 | 11 enums, 16 interfaces (Location 10 champs, Citizen + fingerprintHash + vulnerabilityCategory, AuditLog + entityType/entityId/oldValue/newValue/ipAddress/merkleHash, etc.), DTOs Zod synchronisés                        |
| `@nina-aes/database`     | ✅ aligné PROMPT 1.3 | 16 modèles Prisma, 10 enums, GIN trigram, soft-delete (callback `defineExtension`), `previewFeatures = ["driverAdapters", "postgresqlExtensions", "relationJoins"]`                                                        |
| `@nina-aes/config`       | ✅ aligné PROMPT 1.4 | Schéma Zod exhaustif, singleton paresseux via Proxy, `dotenv-expand` pour `${VAR}`, 9 tests Jest                                                                                                                           |
| `@nina-aes/utils`        | ✅ aligné PROMPT 1.4 | `nina.ts` (normalize/format/mask/validateNinaChecksum), `merkle.ts` (+ `generateMerkleHash` alias), `crypto.ts` (RS256/Ed25519/hashBiometric), `date.ts` (`calculateAge`), `sanitize.ts` (`sanitizeForLog`), 44 tests Jest |
| `@nina-aes/logger`       | ⚠️ **stub**          | Stub temporaire console-backed (4 services référençaient un package inexistant qui bloquait `pnpm install`). Implémentation Pino + transport Loki à livrer au document 17                                                  |
| `@nina-aes/ui`           | inchangé             | `tsconfig.json` durci avec `rootDir: "./src"`                                                                                                                                                                              |

## 3. Diagrammes UML — disponibles

8 fichiers PlantUML standalone dans `docs/diagrams/` (PROMPT 1.5, 1 557 lignes au total) :

1. `01-use-cases.puml` — 9 acteurs, 8 packages, 26 cas d'utilisation
2. `02-classes.puml` — 13 entités, 8 enums, méthodes métier, cardinalités
3. `03-sequence-correction-nina-ia.puml` — flux correction NINA + IA + audit + FDI signée
4. `04-sequence-aes-verification.puml` — vérification transfrontalière mTLS + JWS Ed25519
5. `05-sequence-vulnerable-person.puml` — USSD bambara → file P1 → livraison à domicile
6. `06-sequence-sigac-report.puml` — signalement anonyme + classif NLP + recalcul score
7. `07-deployment.puml` — K3s on-premise CTDEC, 5 namespaces, gateways AES BFA/NER
8. `08-components.puml` — frontend, services core/IA/gouv, packages, infrastructure

> Les fichiers `99-DIAGRAMMES-MERMAID.md` et `99-DIAGRAMMES-PLANTUML.md` sont conservés comme
> **archives narratives** (texte expliquant chaque diagramme), mais les sources canoniques sont
> désormais les `.puml`.

## 4. Incidents d'exécution résolus (utiles pour la documentation Bloc A)

| Symptôme                                                                  | Fix appliqué                                                                                                                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid interpolation format` (×11) dans `docker-compose.dev.yml`        | Espaces parasites supprimés, typo `ELASTIC_PASSWORDELASTIC_PASSWORD` corrigée                                                                   |
| `Conflict. The container name "/nina-postgres" is already in use`         | `docker rm -f nina-postgres` + `docker volume rm nina-postgres-data`                                                                            |
| Postgres en restart loop (Postgres 18 layout)                             | Mount `/var/lib/postgresql` (parent), pas `/data`                                                                                               |
| `P1000: Authentication failed for nina_admin`                             | Ajout `--env-file .env` dans le script `docker:up`                                                                                              |
| `initdb: invalid locale name "fr_FR.UTF-8"`                               | Bascule sur ICU : `--locale-provider=icu --icu-locale=fr-FR`                                                                                    |
| `Using engine type 'client' requires either 'adapter' or 'accelerateUrl'` | Installation `@prisma/adapter-pg` + `pg` ; `previewFeatures = ["driverAdapters", …]` ; `new PrismaPg({ connectionString })` dans `src/index.ts` |
| `prisma not recognized` (CMD)                                             | Toujours préfixer par `pnpm --filter @nina-aes/database exec prisma …` ou utiliser les scripts `db:*`                                           |
| `npm i prisma@latest` casse (workspace pnpm)                              | Utiliser **uniquement** `pnpm` dans ce monorepo                                                                                                 |
| `TS18003: No inputs were found` (root tsconfig)                           | Placeholder `scripts/typecheck.ts` + utiliser `pnpm check-types` (turbo) au lieu de `tsc` racine                                                |

## 5. Règles opérationnelles à retenir

- **Jamais** `npm` dans ce monorepo — **toujours** `pnpm`.
- Pour les binaires de workspace : `pnpm --filter <pkg> exec <bin>` ou
  `pnpm --filter <pkg> <script>`.
- Pour la base de données :
  - PostgreSQL doit être démarré avec `pnpm docker:up` (qui inclut `--env-file .env`).
  - Migrations : `pnpm --filter @nina-aes/database exec prisma migrate dev --name <nom>`.
  - Seed : `pnpm --filter @nina-aes/database db:seed`.
  - Reset : `pnpm --filter @nina-aes/database exec prisma migrate reset --force`.
- Pour le typage : `pnpm check-types` à la racine (Turborepo dispatch).

## 6. État de la base après seed (référence)

| Table          |                                                                        Lignes attendues |
| -------------- | --------------------------------------------------------------------------------------: |
| `locations`    | **371** (1 pays + 10 régions + ~52 cercles/communes Bamako + ~308 communes échantillon) |
| `institutions` |                                  **5** (CTDEC, DNEC, MAT, Mairie Comm. IV, Gouv. Kayes) |
| `users`        |                                                           **6** (1 par rôle `UserRole`) |

## 7. Documents canoniques par sujet

| Sujet                               | Document de référence                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Vue d'ensemble                      | `00-README-INDEX.md`                                                                         |
| Cahier des charges                  | `01-CAHIER-DES-CHARGES.md`                                                                   |
| Architecture globale                | `02-ARCHITECTURE-GLOBALE.md` + `diagrams/07-deployment.puml` + `diagrams/08-components.puml` |
| Setup Windows                       | `03-SETUP-ENVIRONNEMENT-DEV.md`                                                              |
| Monorepo (Turborepo + pnpm)         | `04-MONOREPO-STRUCTURE.md`                                                                   |
| Infra Docker locale                 | `05-INFRASTRUCTURE-DOCKER-COMPOSE.md`                                                        |
| Prisma + schéma DB                  | `06-DATABASE-SCHEMA-PRISMA.md` + `packages/database/prisma/schema.prisma`                    |
| Microservices NestJS                | `07` → `10`                                                                                  |
| Service IA Python                   | `11-AI-SERVICE-FASTAPI.md`                                                                   |
| Frontend → API                      | `12-FRONTEND-INTEGRATION-API.md`                                                             |
| ADR (Architecture Decision Records) | `adr/ADR-001` → `ADR-015`                                                                    |

## 8. Gouvernance assistants IA et maintenance (mai 2026)

Objectif: rendre les conventions persistantes et homogènes entre Cursor, Claude et Copilot.

- Ajout de `AGENTS.md` (règles transversales de collaboration et synchronisation docs/code).
- Ajout de `CLAUDE.md` (bootstrap session + commandes de validation).
- Renforcement de `.github/copilot-instructions.md` pour aligner Copilot sur les conventions réelles
  du projet.
- Ajout d'une règle Cursor persistante: `.cursor/rules/ai-governance.mdc`.
- Remplacement du `README.md` template par une version projet orientée exploitation.

Validation automatique ajoutée:

- Schémas JSON sous `schemas/` pour `data/mali/regions.json` et `data/mali/cercles.json`.
- Script `scripts/validate-json-schemas.mjs` (validation via Ajv).
- Script `scripts/docs-sync-check.mjs` (contrôle de cross-références critiques
  docs/README/changelog).
- Scripts `package.json`:
  - `validate:schemas`
  - `docs:sync:check`
  - `verify:repo`

Impact maintenance:

- Réduction du drift documentaire entre sessions.
- Contrôles rapides intégrables en local, hook et CI.
- Préparation à une gouvernance documentaire plus stricte sur les 250+ éléments du monorepo.

## 9. Phase 2 — Infrastructure & DevOps (mai 2026)

Conformément à **PROMPT 2.1**, l'infrastructure de développement a été consolidée :

### 9.1 Dockerfiles génériques réutilisables

- **`infrastructure/docker/Dockerfile.nestjs`** — Multi-stage Node 24-alpine
  - pnpm 10 + Turborepo pruning (`turbo prune`). Réutilisable par les 9+ services NestJS via
    `--build-arg SERVICE=<nom>`. Utilisateur non-root UID 1001, HEALTHCHECK `/health`, `tini` pour
    SIGTERM, labels OCI.
- **`infrastructure/docker/Dockerfile.fastapi`** — Multi-stage Python 3.14 slim + `uv` 0.5
  (gestionnaire de paquets Rust, 10-100× plus rapide que pip). Inclut Tesseract OCR + libgomp1 pour
  XGBoost. Réutilisable par `ai-service` et `anticorruption-service`.

Les Dockerfiles par-service (`services/<X>/Dockerfile`) restent disponibles en mode legacy mais ont
été modernisés (Node 24, utilisateur non-root, HEALTHCHECK). Le build CI/CD doit privilégier le
générique :

```powershell
make build-service SERVICE=identity-service
```

### 9.2 `seed-locations.sql` — décision révisée mai 2026

**État initial** : le PROMPT 2.1 suggérait un SQL exhaustif des 19 régions / 159 cercles / 819
communes / 12 712 villages, maintenu à la main. Décision contraire avait été prise : pas de SQL
séparé, source unique JSON + Prisma seed.

**Révision (mai 2026)** : le besoin réel infra-first (tests d'intégration BDD-only, scripts de DR,
vues matérialisées sans Prisma) a justifié le retour du SQL — mais **généré automatiquement** depuis
les JSON canoniques, pas écrit à la main.

**Architecture finale** :

- **Source de vérité** : `data/mali/regions.json` + `cercles.json` (inchangé).
- **Générateur** : `scripts/generate-seed-sql.mjs` (Node, ~210 lignes). Lit les JSON, émet le SQL
  avec INSERT idempotents (`ON CONFLICT DO UPDATE`).
- **Artefact dérivé** : `infrastructure/scripts/seed-locations.sql` (~200 lignes, 44 KB). Commité
  pour reproductibilité Docker.
- **Schéma isolé** : `geo_ref.regions / cercles / communes / arrondissements` — distinct de
  `public.locations` (Prisma). Pas de drift bidirectionnel.
- **Mount Postgres** : monté en `/docker-entrypoint-initdb.d/02-seed-locations.sql`, exécuté
  automatiquement au premier `pnpm docker:up`.
- **Cible Makefile** : `make seed-locations-generate` régénère le SQL.

**Contenu effectif** (vs cible exhaustive du prompt) :

- ✅ 20 régions (19 + District de Bamako)
- ✅ 64 cercles confirmés (sur 159 attendus — enrichissement V2 via Wikipedia/INSTAT)
- ⚠️ 10 communes échantillon (6 Bamako + 4 chefs-lieux) — sur 819 attendues
- ❌ 0 arrondissements (sur 466) — V2 INSTAT
- ❌ 0 villages (sur 12 712) — hors scope V1, dataset requis

Détails dans `docs/data/mali-divisions.md §3bis` et `docs/data/integration-guide.md §2.1bis`.

### 9.3 Makefile enrichi (44 cibles)

Cibles ajoutées au Makefile racine :

- `verify` / `validate-data` / `validate-schemas` / `docs-sync` — chaîne de vérification du repo
- `build-service SERVICE=<X>` — paramétrable, utilise le Dockerfile générique
- `vault-init` / `vault-unseal` / `vault-status` — gestion des secrets
- `certs-generate` / `certs-clean` — certificats mTLS dev pour les 3 pays AES (CA RSA 4096 + 3 certs
  clients RSA 2048 / 90 jours)
- `db-validate` — `prisma validate` rapide
- `dev-sigac` / `dev-governance` — services manquants
- `clean-deep` — purge totale (.venv inclus)

Validation : `make help` liste les 44 cibles documentées.

### 9.4 Stack Docker Compose : état effectif

`infrastructure/docker/docker-compose.dev.yml` reste la source de vérité pour les 9+ services
d'infrastructure (PostgreSQL+PostGIS, Redis, RabbitMQ, MinIO, Elasticsearch, Kibana, Keycloak,
Vault, MailDev). Corrections déjà appliquées (cf. §4 « Incidents résolus »).

### 9.5 Audit infrastructure (mai 2026 — re-passage PROMPT 2.1)

Re-passage complet du PROMPT 2.1 d'infrastructure : audit + alignement des versions sur les
dernières stables mai 2026 + complétion des livrables manquants. Aucune régression — Dockerfiles +
Makefile sont déjà au niveau, seuls docker-compose et init-db.sql ont été modifiés.

**docker-compose.dev.yml** : - Versions alignées : Redis `8.6-alpine` (était 8.4.2), RabbitMQ
`4.2-management-alpine` (était `latest` non-épinglé), Elasticsearch `9.3.2` (était 8.19.14),
Keycloak `26.5` (était 26.2.4), Vault `1.20` (était 1.18). - **Kibana 9.3.2 ajouté** (port 5601)
avec dépendance `service_healthy` sur Elasticsearch + login `kibana_system`. Healthcheck via
`/api/status` check du JSON `"level":"available"`. - **minio-init** : nouveau job one-shot
`minio/mc` qui attend MinIO healthy puis crée le bucket `nina-documents` (idempotent via
`mc mb --ignore-existing`) + active le versionning pour faciliter les rollbacks en dev. Évite
l'étape manuelle « créer le bucket via la console » au premier boot. - `VAULT_DEV_ROOT_TOKEN_ID`
aligné sur `nina-dev` (au lieu de `dev-root-token`), surchargeable via `.env`. - Cleanup des volumes
commentés (résidus draft initial).

**scripts/init-db.sql** : - **`CREATE EXTENSION postgis`** ajouté sur `nina_aes_db` et
`nina_aes_test` (l'image `postgis/postgis:18-3.6` fournit le binaire mais l'extension doit être
activée dans chaque DB). - **Utilisateur `app_user`** créé avec privilèges minimaux : login
autorisé, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, connection limit 50. Droits DML uniquement
(SELECT/INSERT/UPDATE/DELETE) sur les 9 schémas DDD + `public` + héritage automatique pour les
futures tables via `ALTER DEFAULT PRIVILEGES`. Les migrations Prisma continuent d'utiliser
`nina_admin` (owner) via une connection string distincte (séparation des privilèges runtime vs
DDL). - Création conditionnelle (`SELECT ... WHERE NOT EXISTS \gexec`) des bases `keycloak` et
`nina_aes_test` — remplace le doublon `CREATE DATABASE` initial qui levait une erreur au 2ème run. -
Collations passées à **ICU `fr-FR`** (au lieu de `LC_COLLATE       fr_FR.UTF-8` qui dépendait d'une
locale système non garantie dans l'image).

**Décisions reconduites** (déjà documentées) : - `seed-locations.sql` séparé : **NON créé** (§9.2).
Source de vérité = `data/mali/*.json` + Prisma seed, validés par `scripts/validate-mali-data.mjs`. -
`Dockerfile.nestjs` + `Dockerfile.fastapi` : **AUCUNE modification** — déjà multi-stage propre,
turbo prune, uv pour Python, non-root UID 1001, tini, HEALTHCHECK, labels OCI. - `Makefile` racine :
**AUCUNE modification** — les 45 cibles présentes couvrent toutes les attentes du PROMPT 2.1.

**Validation** : - `docker compose -f infrastructure/docker/docker-compose.dev.yml config --quiet` →
exit 0 (syntaxe valide, variables résolues). - `pnpm run verify:repo` → ✅ data + schemas + docs
sync.

### 9.6 Enrichissement référentiel Mali — geoBoundaries ADM2 + Wikipedia scraper + INSTAT workflow (mai 2026)

Suite à la question utilisateur « JSON canoniques vs SQL — que faut-il utiliser, et INSTAT comme
référence ? » : choix « Restructurer + enrichir maximum disponible ». Les 3 phases ont été livrées :

- **Phase 1** — polygones geoBoundaries ADM2 + script d'audit
- **Phase 2** — scraper Python Wikipedia + Nominatim (64 → 142 cercles)
- **Phase 3** — template demande INSTAT formelle

**Livrables** :

- **`data/mali/mali-cercles-polygons.json`** (~517 KB, 50 features) : ajout des polygones officiels
  au niveau ADM2 (cercles) issus de
  [geoBoundaries gbOpen release 2023-12-12](https://www.geoboundaries.org/), licence CC BY 4.0.
  Couvre 50 cercles de la structure pré-loi 2023 (les 11 cercles des nouvelles régions post-2023 + 6
  communes urbaines de Bamako restent hors couverture polygonale).

- **`scripts/enrich-cercles.py`** (~340 lignes) + `scripts/requirements-enrich.txt` : scraper Python
  qui complète `cercles.json` de 64 à 142 entrées en un run.

  _Pipeline_ :
  1. Fetch Wikipedia FR `Cercles_du_Mali` (cache HTML 24 h dans `.cache/`).
  2. Parse BeautifulSoup4 (lxml si dispo, sinon html.parser builtin Python — pas de prérequis build
     natif sur Windows).
  3. Strip préfixe « Cercle de … » + normalisation NFD/lowercase pour aligner avec la convention du
     JSON.
  4. Géocode Nominatim (OpenStreetMap), `countrycodes=ml`, 1 req/s (politique OSM officielle),
     User-Agent identifiable. Pas de clé API requise.
  5. Merge non destructif (les 64 entrées initiales sont intouchées) + codes `ML-{region}-{NN}`
     incrémentaux.
  6. Les cercles non géocodés sont **exclus du JSON** et listés dans le rapport stdout pour
     enrichissement manuel ultérieur (évite de polluer la bbox du schema).

  _Run mai 2026_ : 129 cercles extraits / 44 déjà connus / 85 nouveaux candidats / **78 géocodés (92
  %)** / 7 sans géocode listés. Total `cercles.json` : **142 / 159 attendus (89 %)**.

  _Confiance_ : les nouvelles entrées sont `confiance: "moyenne"` + `centroide.estime: true` +
  `source_enrichissement: "wikipedia+nominatim"`. Les 64 entrées initiales restent
  `confiance: "haute"`.

  _Makefile_ : `make enrich-cercles` (dry-run, défaut), `make enrich-cercles-write` (applique +
  régénère le SQL).

- **`scripts/audit-cercles-coverage.mjs`** + cible Makefile `make audit-cercles` : audit de
  cohérence entre `cercles.json` (maintenant 142 entrées) et `mali-cercles-polygons.json` (50
  polygones) via normalisation NFD + lowercase + suppression tirets/apostrophes. Run final : **48
  correspondances**, 2 polygones orphelins (Bamako + Nioro/Nioro du Sahel), 94 cercles JSON sans
  polygone (essentiellement les 78 ajouts Wikipedia hors couverture geoBoundaries ADM2 pré-2023).

- **`docs/data/instat-data-request.md`** (~250 lignes) : template complet de demande officielle à
  l'INSTAT Mali (`direction@instat.ml`) pour obtenir les 159 cercles + 466 arrondissements + 819
  communes + 12 712 villages avec coordonnées RGPH. Inclut : matrice coverage par niveau admin,
  points de contact (email/téléphone/microdata.instat.ml), workflow d'intégration en 4 phases une
  fois les données reçues, sources alternatives (Wikipedia/Overpass/HDX) pendant l'attente, tableau
  de suivi de la demande.

- **`data/mali/cercles.json`** : 64 → 142 entrées (`metadata.version` bumped à `2026.05.16`,
  `total_dans_ce_fichier` actualisé). Nouveau champ optionnel `source_enrichissement` sur les 78
  nouvelles entrées.

- **`infrastructure/scripts/seed-locations.sql`** régénéré : 20 régions + **142 cercles** + 10
  communes (74 KB, 279 lignes vs 200 avant).

- **`data/mali/README.md`** : section ajoutée pour `mali-cercles-polygons.json` (provenance, stats
  coverage, licence, commande d'audit).

- **`docs/data/mali-divisions.md §3.2`** : refonte en 4 sous-sections (3.2.1 noms / 3.2.2 polygones
  / 3.2.3 audit / 3.2.4 enrichissement Wikipedia+Nominatim) reflétant le nouvel artefact et les
  chiffres réels (142 cercles, 7 cercles encore à enrichir manuellement).

**Architecture renforcée** : les JSON canoniques (`regions.json` + `cercles.json`) restent **source
unique de vérité**. Les polygones (`mali-regions-polygons.json` admin1 +
`mali-cercles-polygons.json` admin2) sont des **artefacts auxiliaires** alignés par audit
automatique, jamais utilisés pour reconstruire les noms officiels. Le SQL généré
(`seed-locations.sql` §9.2) ne consomme pas les polygones — ils sont uniquement chargés côté
frontend (`MaliHeatmap`) pour le rendu choroplèthe.

**Validation** :

- `python scripts/enrich-cercles.py` → 92 % géocode hit rate, exit 0.
- `node scripts/audit-cercles-coverage.mjs` → exit 0.
- `pnpm run verify:repo` → ✅ data (142 cercles, bbox OK) + schemas (cercles.schema valide) + docs
  sync.

**Reste à faire (V2)** :

- Enrichir manuellement les 7 cercles sans géocode (Toguéré-Coumbé, Achibogho, Anétif, Timétrine,
  Takalote, Inlamawane, Dialassagou)
  - 10 cercles manquants pour atteindre 159/159.
- Envoyer la demande INSTAT formelle (cf. template) — délai incompressible 4-12 semaines, données
  authoritatives.
- Mode zoom cercles dans `MaliHeatmap` (couche choroplèthe ADM2 avec les 50 polygones) — refactor
  frontend ~4h.

### 9.7 Stabilisation healthchecks + Kibana Fleet encryption keys (23 mai 2026)

Audit `docker compose ps` après reboot stack : 4 services en `unhealthy` malgré application
opérationnelle. Diagnostic et correctifs appliqués dans
`infrastructure/docker/docker-compose.dev.yml` et `.env` :

- **rabbitmq** : healthcheck `["CMD","rabbitmq-diagnostics","-q","ping","check_running"]` invalide —
  `ping` et `check_running` sont deux sous-commandes mutuellement exclusives, l'appel renvoyait
  exit 64. → Corrigé en `["CMD","rabbitmq-diagnostics","-q","check_running"]` (Erlang OK pour
  RabbitMQ 4.x).
- **vault** : `vault status` parle HTTPS par défaut alors que `start-dev` écoute en HTTP →
  `http: server gave HTTP response to HTTPS client`. → Corrigé en
  `["CMD-SHELL","VAULT_ADDR=http://127.0.0.1:8200 vault status"]`.
- **keycloak** : healthcheck sondait `:8080/health/ready` mais KC 25+ a déplacé tous les endpoints
  management (`/health`, `/metrics`) sur le port **9000**. Port 8080 reste l'API/UI. → Corrigé
  `/dev/tcp/localhost/8080` → `/dev/tcp/localhost/9000`.
- **kibana** : `"level":"unavailable"` réel (pas un bug healthcheck) — `kibana_system` ne pouvait
  pas s'authentifier auprès d'Elasticsearch (`security_exception`). Mot de passe ES réinitialisé via
  `POST /_security/user/kibana_system/_password` en utilisant `elastic:$ELASTIC_PASSWORD`.
- **kibana — boucle Fleet** : après réauth ES, le plugin Fleet bouclait sur
  `FleetEncryptedSavedObjectEncryptionKeyRequired`. → Ajout dans `.env` de 3 clés stables (≥32
  chars) `KIBANA_ENCRYPTION_KEY`, `KIBANA_SECURITY_ENCRYPTION_KEY`,
  `KIBANA_REPORTING_ENCRYPTION_KEY`, exposées au conteneur via
  `XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY`, `XPACK_SECURITY_ENCRYPTIONKEY`,
  `XPACK_REPORTING_ENCRYPTIONKEY`. Documentation propagée à `.env.example` (avec placeholders) et
  `docs/05-INFRASTRUCTURE-DOCKER-COMPOSE.md`.

**État final** : 9/9 services `healthy`. Aucune régression observée (`docker compose ps`,
`pnpm run docs:sync:check`).

**Note ops** : les 3 clés Kibana doivent rester stables entre redémarrages. Toute rotation casse les
objets sauvegardés chiffrés (intégrations Fleet, règles d'alerting, planifications de rapports).

## 10. Frontend Citoyen — Session 2 : PC-03 à PC-06 + auth Keycloak BFF (mai 2026)

Session 2 du chantier frontend `apps/citizen` (port 4001). Construit au-dessus de la fondation
Session 1 (packages `@nina-aes/ui`, `@nina-aes/api-client`, `@nina-aes/i18n` ; PC-01 et PC-02
livrés).

### 10.1 Auth Keycloak — pattern BFF (Backend-for-Frontend)

Routes API internes `apps/citizen/app/api/auth/*` :

- **`/api/auth/login`** — initie OIDC Authorization Code + PKCE (`code_verifier` SHA-256, `state`,
  `nonce` ; cookies signés `oidc_state`/`oidc_nonce`/`oidc_code_verifier` httpOnly).
- **`/api/auth/callback`** — échange du code contre `access_token` + `id_token` + `refresh_token`.
  Vérification ID token via JWKS (`createRemoteJWKSet`, lib `jose@6.2.3`) : `iss`, `aud`, `exp`,
  `nonce`. Tokens posés en cookies `httpOnly + Secure + SameSite=Lax`, jamais exposés au JS
  navigateur.
- **`/api/auth/refresh`** — refresh silencieux (POST). En cas d'échec, suppression atomique des
  cookies pour forcer un re-login propre.
- **`/api/auth/logout`** — révoque le refresh token côté Keycloak (backchannel) puis redirige sur
  l'endpoint `end_session` (frontchannel).

**Mode mock** : `NINA_AUTH_MODE=mock` (défaut dev) renvoie une session déterministe « Fatoumata
Diallo » sans dépendance Keycloak — débloque les écrans tant que `keycloak-realm-aes.json` n'est pas
chargé.

`apps/citizen/lib/auth/session.ts` expose `getSession()`, `requireSession()`, `isOwnerOf(nina)`,
`isAgent()` — utilisables en RSC (Server Components) comme en Server Actions.

### 10.2 `apps/citizen/middleware.ts` — i18n + auth guard

Middleware combiné next-intl + auth. Routes publiques (regex `PUBLIC_PATTERNS`) : racine `/`,
`/[locale]`, `/[locale]/login`, `/[locale]/signalement/*`. Tout autre `/[locale]/...` exige une
session ; sinon redirection `/[locale]/login?return_to=…`.

### 10.3 Extensions `@nina-aes/api-client`

Trois nouveaux sous-clients (le réexport racine devient
`{ identity, correction, appointment, sigac }`) :

- **`CorrectionClient`** — soumission + liste + détail + annulation d'une demande de correction (9
  champs corrigeables : `firstName`, `lastName`, `birthDate`, `birthPlace`, `residence_cercle`,
  `residence_commune`, `fatherName`, `motherName`, `profession`). Idempotency-key
  `corr-{nina}-{field}-{ts}`.
- **`AppointmentClient`** — créneaux disponibles, création RDV, liste de mes RDV, annulation.
  Supporte priorité P1/P2/P3 (file prioritaire pour citoyens vulnérables).
- **`SigacClient`** — signalement anonyme. **`skipAuth: true` sur tous les appels** : aucun header
  `Authorization`, aucun cookie envoyé. Soumission + consultation par `trackingToken` opaque (format
  `vault:v3:…`).

Tous les DTO et réponses sont validés par des schémas Zod co-localisés (`*.schema.ts`), réexportés
côté package racine.

### 10.4 Écrans citoyens livrés (PC-03 → PC-06)

- **PC-03 — Wizard correction** (`/[locale]/nina/[nina]/correction`). 4 étapes (champ → valeur →
  justificatif placeholder → confirmation), stepper visuel, contrôle de rôle `isOwner || isAgent`.
- **PC-04 — Prise de RDV** (`/[locale]/appointments/new`). Sélection centre (CTDEC Bamako, RAVEC
  Kayes/Sikasso/Mopti — mocks en attendant l'API), créneau, motif libre. Badge « file prioritaire »
  affiché si la session est marquée vulnérable.
- **PC-05 — Dashboard citoyen** (`/[locale]/dashboard`). Salutation localisée, 3 actions (fiche /
  correction / RDV), liste des corrections en cours avec score IA, liste des RDV à venir, composant
  `StatusBadge` réutilisable.
- **PC-06 — Signalement anonyme** (`/[locale]/signalement`). Route **publique** (pas de cookie
  d'auth). Formulaire 6 catégories (BRIBERY / FORGERY / FAVORITISM / ABUSE_OF_POWER / PROCUREMENT /
  OTHER), description ≥ 50 caractères, localisation optionnelle, consentement. Aucune écriture
  localStorage/sessionStorage, aucun fingerprint navigateur. Reçu post-soumission avec token
  copiable.

### 10.5 i18n — `packages/i18n/messages/fr.json` enrichi

Ajout des namespaces `login`, `correction`, `appointments`, `dashboard`, `signalement`. La
traduction `bm.json` (bambara) reste le périmètre Session 1 ; next-intl applique le fallback FR
automatiquement pour les clés manquantes (décision documentée : ne pas fabriquer de traductions
bambara sans relecture native).

### 10.6 Corrections de configuration

- **`next.config.ts`** — `experimental.ppr` fusionné dans `cacheComponents: true` (changement Next
  16).
- **`tsconfig.json`** — suppression de `baseUrl` (déprécié TS 6.0, remplacé par `paths` relatifs
  `./*`).
- **`packages/api-client`** — override local du `tsconfig.json` : `module: ESNext` +
  `moduleResolution: Bundler`. Le package est consommé en source via `transpilePackages` côté Next,
  jamais publié comme ESM standalone — la résolution « bundler » évite d'avoir à écrire des
  extensions `.js` explicites dans les imports relatifs (que Turbopack ne sait pas remapper vers
  `.ts`).

### 10.7 Validation

- `pnpm --filter @nina-aes/api-client check-types` : 0 erreur.
- `pnpm --filter @nina-aes/citizen check-types` : 0 erreur (`next typegen` + `tsc --noEmit`).
- `pnpm run verify:repo` : ✅ validate-data + validate-schemas + docs-sync.

### 10.8 Reste à faire (Session 3+)

- Câblage `keycloak-realm-aes.json` réel + suppression du mode mock pour la pré-prod.
- ~~Composant `LanguageSwitcher` (8 langues, accessible clavier)~~ → livré commit `b7c1f5c`
  (dropdown autonyme + drapeau dans le header d'accueil, fallback FR par-clé via `deepMerge`).
- Relecture native des 6 skeletons i18n (SNK/FF/TMQ/HAU/MOS/DJE) ; bambara `bm.json` déjà fourni
  Session 1. À faire valider par CTDEC/DNEC avant production.
- Upload de justificatifs PC-03 — bloqué tant que `document-service` (port 3004) n'est pas livré
  (cf. doc 10).
- **Migration PC-04 slots → appointment-service** : quand `appointment-service` (port 3008, doc 09)
  sera livré, remplacer `generateMockSlots()` dans
  `apps/citizen/app/[locale]/appointments/ new/_components/appointment-form.tsx` par un appel
  server-side `api.appointment.getAvailableSlots({ fromDate, toDate, centerId, isPriority })`
  exécuté dans le Server Component parent. Passer les slots en prop. La `<Suspense>` côté page reste
  pertinente comme frontière de streaming pour le fetch. Idéalement, déléguer uniquement la
  sélection à un sous-composant client minimal et retirer le `'use client'` du form principal.
- **Migration PC-04 centres → identity ou location service** : `MOCK_CENTERS` dans le même fichier
  doit être remplacé par un fetch `/api/v1/centers` (cercles/communes filtrables selon la région du
  citoyen via `session.user.residence_cercle`).
- ~~Rename `middleware.ts → proxy.ts`~~ → fait. API identique
  (`NextRequest`/`NextResponse`/`config.matcher` inchangés), seul le nom de fichier et la fonction
  par défaut sont renommés (`middleware` → `proxy`). L'import `next-intl/middleware` reste valide
  (next-intl garde son propre nom).

## 11. Frontend Admin — Session 3 : foundation + AD-02 corrections (mai 2026)

Console agents CTDEC `apps/admin` (port 4002) — scaffolding initial + écran AD-02 « Gestion des
corrections IA » fonctionnel de bout en bout en mode mock. AD-01 (Dashboard complet) et AD-03
(SIGAC) prévus Session 4. Périmètre choisi avec le mainteneur : « Foundation + AD-02 prioritaire »
(le DataGrid est l'outil le plus utile au quotidien CTDEC).

### 11.1 Foundation `apps/admin`

Refonte complète du scaffold Turborepo par défaut sur le pattern citizen Session 2 :

- **Auth BFF** (4 route handlers `/api/auth/{login,callback,refresh, logout}`) avec client Keycloak
  `nina-admin`. Mode `NINA_AUTH_MODE= mock` par défaut : session déterministe « Modibo Konaté »,
  matricule CTDEC-2024-0156, rôles `[AGENT, SUPERVISOR]`, centre `ctdec-bamako`.
- **`lib/auth/session.ts`** : `getSession()`, `requireSession()`, `requireRole(roles: AdminRole[])`,
  `hasRole(roles)` — nouveau contrôle d'accès par rôle (AGENT / SUPERVISOR / AUDITOR / ADMIN).
- **Layouts** alignés Next 16 + cacheComponents : `app/layout.tsx` STATIQUE + `<HtmlLangSetter />`
  client, `app/[locale]/layout.tsx` IntlBoundary dans `<Suspense>`,
  `app/[locale]/(authenticated)/layout.tsx` applique
  `requireRole(['AGENT', 'SUPERVISOR', 'AUDITOR', 'ADMIN'])` et rend `<AdminSidebar>` (route group
  invisible dans l'URL).
- **`components/admin-sidebar.tsx`** : sidebar fixe 240px, fond `hsl 220° 30 % 12 %`, 5 items nav
  (Dashboard / Corrections / RDV / SIGAC / Paramètres), footer profil agent + logout.
- **`proxy.ts`** : i18n routing + auth guard ; routes publiques `/[locale]` et `/[locale]/login`.
- **i18n namespace `admin.*`** (FR complet) — sidebar, dashboard, login, corrections (filters,
  columns, status, field, actions, drawer, timeline, pagination, toast). Les 6 skeletons SNK/FF/
  TMQ/HAU/MOS/DJE héritent automatiquement via le deepMerge déjà en place (Session 2 commit
  b7c1f5c).

### 11.2 Nouvelles primitives `@nina-aes/ui`

Trois wrappers Radix pour alimenter AD-02 (et les futurs écrans) :

- **Sheet** (`./components/sheet`) — Drawer latéral avec variants `side` (top/bottom/left/right).
  Compose Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle,
  SheetDescription. Focus trap, animation slide-in/out, overlay backdrop-blur, `aria-modal` natif.
- **Checkbox** (`./components/checkbox`) — Radix Checkbox stylé AES, supporte `indeterminate` (utile
  pour la sélection partielle de colonne du DataGrid).
- **DropdownMenu** (`./components/dropdown-menu`) — Surface complète Radix (Trigger, Content, Item,
  CheckboxItem, RadioItem, Label, Separator, Sub, Group, Shortcut). Préparé pour menus d'actions par
  ligne et filtres compacts.

Dépendances : `@radix-ui/react-dialog ^1.1.0`, `@radix-ui/   react-checkbox ^1.1.0`,
`@radix-ui/react-dropdown-menu ^2.1.0`.

### 11.3 AD-02 — Gestion des corrections IA

**`app/[locale]/(authenticated)/corrections/page.tsx`** (server) : Charge `MOCK_CORRECTIONS` (50
fixtures déterministes) + délègue à `<CorrectionsClient>` enveloppé dans `<Suspense>` avec skeleton
fallback.

**`_components/corrections-client.tsx`** (client) — Le DataGrid complet basé sur **TanStack Table
8.20** : - 11 colonnes : sélection multi, NINA (mono), citoyen, champ, avant, après, score IA
(coloré HIGH/MEDIUM/LOW), statut (StatusBadge), région, soumis le, actions (DropdownMenu). - **Tri**
sur 9 colonnes (clic header → ascending → descending → reset) avec icônes ArrowUp/ArrowDown. -
**Filtres** : • Recherche full-text (debounced via React state) sur NINA + nom citoyen ; •
Multi-select statut (UNDER_REVIEW, APPROVED, REJECTED, AWAITING_DOCUMENT) ; • Multi-select région
(Bamako, Sikasso, Kayes, Mopti) ; • Bouton « Réinitialiser » si filtres actifs. - **Sélection
multiple** : checkbox header (avec état `indeterminate` si sélection partielle de la page courante),
checkbox par ligne. Bouton « Approuver (N) » apparaît à droite de la toolbar si N ≥ 1. -
**Pagination** : pageSize 10, indicateur page X / Y, ChevronLeft/Right pour naviguer. - **Click
ligne** ouvre le drawer ; click sur checkbox ou DropdownMenu d'actions n'ouvre PAS le drawer
(`stopPropagation`).

**`_components/correction-drawer.tsx`** : Drawer right (Sheet side=right, max-w-xl) avec : - Header
: titre `Correction #{id}` + StatusBadge. - Citoyen (nom + NINA mono). - Modification du champ :
carte « avant » barrée + flèche + carte « après » en `bg-primary-50/40`. Motif de la demande en
italique. - **`<AiScorePanel />`** : gauge SVG inline (cercle radius 28, stroke 6, dasharray
dynamique) coloré HIGH/MEDIUM/LOW, 3 sous-scores (fuzzyMatch, consistency, agentHistory) en barres
horizontales. - Justificatif : preview placeholder « PDF · 1.4 Mo » (le vrai preview viendra avec
document-service Session 4+). - **`<CorrectionTimeline />`** : timeline verticale avec ligne
gauche + pastilles colorées (Send, Sparkles, UserCheck, FileQuestion, FileCheck, Check, X selon le
`kind` de l'événement). - Footer sticky avec actions : « Rejeter » (variant destructive) → toggle un
sous-formulaire avec textarea « motif de rejet (visible par le citoyen) » + submit ; « Approuver » →
mutation immédiate. Le drawer se ferme et un toast vert confirme l'action.

**Mutation mock approve/reject** : `decide(id, decision, reason?)` dans `corrections-client.tsx`
mute le state local avec `useTransition`. La timeline est appendée avec un événement `APPROVED` ou
`REJECTED` daté ISO. Un toast 4 s apparaît en bas-droite (`role="status"` `aria-live="polite"`).

### 11.4 Mock fixtures (`apps/admin/lib/mock-corrections.ts`)

Générateur déterministe Mulberry32 produisant 50 corrections : - 20 prénoms × 20 noms maliens
(combinaisons réalistes). - 9 champs `field` représentés équitablement (firstName, lastName,
birthDate, birthPlace, residence_cercle, residence_commune, fatherName, motherName, profession). -
Échantillons d'erreurs typiques par champ (Sikaso → Sikasso, Toure → Touré, Bla → Blá, 1995-13-02 →
1995-12-02). - 4 statuts pondérés : UNDER_REVIEW (60 %), APPROVED (20 %), REJECTED (15 %),
AWAITING_DOCUMENT (5 %). - 4 régions : Bamako, Sikasso, Kayes, Mopti. - Score IA 30-98 + verdict
HIGH/MEDIUM/LOW dérivé. - 3 sous-scores (fuzzyMatch, consistency, agentHistory). - Timeline réaliste
SUBMITTED → AI_SCORED → AGENT_REVIEW → APPROVED/REJECTED ou → DOCUMENT_REQUESTED.

À supprimer Session 4+ quand correction-service exposera `GET /api/v1/admin/corrections?filters`
côté agent.

### 11.5 Validation

- `pnpm --filter @nina-aes/admin check-types` : ✅ 0 erreur.
- `pnpm --filter @nina-aes/citizen check-types` : ✅ 0 erreur (citizen n'a pas régressé).
- `pnpm run verify:repo` : ✅ validate-data + validate-schemas + docs-sync.

### 11.6 Reste à faire (Session 4+)

- **AD-01 Dashboard** complet : 4 KPI cards avec sparkline SVG inline + AreaChart Recharts
  corrections/jour + MaliHeatmap activité régionale + feed temps réel alertes (SSE mock).
- **AD-03 SIGAC** : MaliHeatmap alertes par région + top 10 agents intégrité (IntegrityScoreGauge
  ×10) + feed alertes temps réel + drill-down par région.
- **MaliHeatmap** réutilisable dans `@nina-aes/ui` (SVG inline
  - GeoJSON `data/mali/regions.geojson`, 55 features déjà validées par `validate:data`).
- **Extraction `@nina-aes/auth`** : factoriser `lib/auth/session.ts`
  - routes API auth communes à citizen et admin (et bientôt governance). Aujourd'hui : 2 copies.
    Threshold de 3 copies déclenche l'extraction.
- **Câblage `correction-service`** : remplacer `MOCK_CORRECTIONS` par fetch server-side + mutations
  TanStack Query avec optimistic update + invalidation cache.
- **PDF preview justificatif** : bloqué tant que `document-service` (port 3004) n'expose pas les
  URLs signées.
- **Drawer mobile** : actuellement w-full sur xs, OK mais le DataGrid est inutilisable sur xs (10
  colonnes). Ajouter une vue « cards » alternative ou figer les 3 premières colonnes en overflow-x.
- **Tests E2E Playwright** : parcours agent (login mock → DataGrid → filtre → approbation → toast →
  ligne mise à jour).

## 12. Frontend Admin — Session 4 : AD-01 Dashboard + AD-03 SIGAC (mai 2026)

Finalisation du périmètre `apps/admin` initial — les deux écrans restants de
docs/design-system/screens.md §AD-01/AD-03 sont livrés en mode mock, l'app est complète bout-en-bout
(Dashboard → Corrections → SIGAC + RDV/Paramètres en placeholder).

### 12.1 Nouvelles primitives chart `@nina-aes/ui`

4 composants SVG inline, **zéro dépendance lib chart** (pas de recharts, victory, etc.). Le choix :
la complexité reste linéaire, le bundle reste mince, et le rendu SSR est trivial.

**MaliHeatmap** (`./components/charts/mali-heatmap`) Bubble map des 20 régions Mali (centroïdes
`data/mali/mali.geo     json` level=1). Props `data: MaliHeatmapDatum[]` (régionCode + valeur),
`tone: 'sequential' | 'severity'` (palette HSL interpolée vert→jaune→rouge pour severity, bleu
progressif pour sequential). `onRegionClick` optionnel pour drill-down, accessibilité clavier
complète (`tabIndex` + Enter/Space). Projection lon/lat → viewBox 100×75 avec bbox Mali (-12 à +3
lon, 10.5 à 23 lat).

    Note : le GeoJSON disponible ne contient que des Point
    centroïdes, pas de polygones. Le bubble map est une variante
    valide de heatmap (densité par lieu) et garde le coût zéro lib.
    Si un GeoJSON polygonal est ajouté plus tard, ré-évaluer.

**Sparkline** (`./components/charts/sparkline`) Courbe minimal viewBox `0 0 100 30`, area fill
optionnel, highlight du dernier point. 5 tones AES (primary / success / warning / danger / muted).
Utilisée dans les KPI cards AD-01.

**AreaChart** (`./components/charts/area-chart`) Area chart avec axes Y left (labels) + X bottom
(labels tous les N points), gridlines pointillées, points interactifs avec `<title>` natif au hover.
ViewBox 400×200, padding intelligent. Utilisé pour « Corrections / jour 30j ».

**IntegrityGauge** (`./components/charts/integrity-gauge`) Composite : icône check/x (≥70 / <70) +
nom (truncate w-32) + barre horizontale colorée + score. Couleur sémantique : ≥80 success, 50-79
warning, <50 destructive. Utilisé pour le Top 10 agents AD-03.

### 12.2 AD-01 — Dashboard agent CTDEC

**`apps/admin/app/[locale]/(authenticated)/dashboard/page.tsx`** (server) — Remplace le placeholder
Session 3. Layout : - 4 KPI cards en grid 1/2/4 col (mobile/sm/lg) : NINA actifs (12 489, +2.4 % vs
sem.), Corrections en attente (84, -12.5 %), Alertes SIGAC (17, +6.3 %), RDV aujourd'hui (326, +1.8
%). Chaque card : titre uppercase, valeur tabular-nums, delta % avec ArrowUpRight/DownRight + tone
success/danger selon « positiveIsGood » (correctionsPending et alertsOpen sont des KPIs où la baisse
est bonne), sparkline 30j. - Section 2 col (lg) : AreaChart corrections/jour 30j (tone warning) sur
2/3, AlertsFeed live sur 1/3. - Section pleine largeur : MaliHeatmap activité régionale (tone
sequential, 10 régions échantillonnées).

**`_components/kpi-card.tsx`** — Composite KpiCard avec drill-down optionnel (Link Next vers
`./corrections`, `./appointments`, `./sigac`). `tabular-nums` pour aligner visuellement les chiffres
entre cards.

**`_components/alerts-feed.tsx`** — Client component avec mock SSE. `setInterval` jitter 12-20 s
ajoute une nouvelle alerte en tête de liste (capée à `maxItems=12`). Badge LIVE pulse 800 ms à
chaque nouveau message (`animate-pulse`). Liste scrollable avec `divide-y`, severity badge coloré,
relative time via next-intl `useFormatter().relativeTime`.

### 12.3 AD-03 — Dashboard SIGAC

**`apps/admin/app/[locale]/(authenticated)/sigac/page.tsx`** (server) : - Contrôle d'accès renforcé
: `requireRole(['SUPERVISOR',       'AUDITOR', 'ADMIN'])` — exclut les simples AGENT (le SIGAC est
réservé aux superviseurs/auditeurs). - Layout 2 sections principales : • Grid 2 col : MaliHeatmap
alertes par région (tone severity) + Top 10 agents (IntegrityGauge ×10 avec bouton « Investiguer »
si score < 70). • SigacClient (feed filtrable temps réel).

**`_components/sigac-client.tsx`** — Client component avec : - Multi-filtres : recherche full-text
(description + lieu), multi-select severity (CRITICAL/HIGH/MEDIUM/LOW), période (today / week /
month). - Mock SSE identique à AlertsFeed AD-01 (12-20 s jitter, badge LIVE pulse). - Liste
scrollable avec bouton « Investiguer » par alerte (`/[locale]/sigac/[id]`, page à implémenter
Session 5+). - Counter `filtered.length / alerts.length` dans le header.

### 12.4 Mock data (`apps/admin/lib/mock-dashboard.ts`)

Toutes les données Session 4 dans un fichier unique, déterministes (PRNG Mulberry32 seed fixe) : -
`KPI_SNAPSHOTS` : 4 KPIs avec history 30j générée (tendance ascendante + bruit ±15 %). -
`CORRECTIONS_PER_DAY` : 30 points (date au format dd/mm, volume 65-90 + spikes occasionnels). -
`ACTIVITY_BY_REGION` : 10 régions principales avec volumes réalistes (Bamako 487 → Kidal 12). -
`ALERTS_BY_REGION` : 6 régions avec alertes actives. - `TOP_AGENTS` : 10 agents (Modibo 97 →
Boubacar 31), 4 en-dessous de 70 (à investiguer). - `INITIAL_ALERTS` : 8 alertes échantillons
(CRITICAL forgery, HIGH bribery, MEDIUM favoritism, etc.). - `generateNewAlert(prevCount)` :
générateur déterministe pour le mock SSE.

À supprimer Session 5+ quand audit-service (port 3007), correction-service (port 3005) et
anticorruption-service (port 3009) exposeront les agrégations réelles.

### 12.5 i18n

packages/i18n/messages/fr.json — Extensions : - `admin.dashboard.kpis.*` : titres + delta strings -
`admin.dashboard.{correctionsChartTitle, activityMapTitle,       alertsFeedTitle, alertsFeedLive, alertsFeedEmpty}` -
`admin.sigac.*` (nouveau namespace) : pageTitle/Subtitle, filters (severity, period,
all/today/week/month, reset), severity {LOW/MEDIUM/HIGH/CRITICAL}, category (6 catégories),
alertsMap, topAgents (investigate), feed (live, investigate, empty).

### 12.6 Validation

- `pnpm --filter @nina-aes/admin check-types` : ✅
- `pnpm run verify:repo` : ✅ data + schemas + docs sync.

### 12.7 Reste à faire (Session 5+)

- **Câblage backends réels** : audit-service (KPIs + activité régionale agrégée), correction-service
  (DataGrid + decide mutation), anticorruption-service (SSE alerts stream + filtres côté API). Tous
  nécessitent les services NestJS/FastAPI prêts.
- **GOV-01 à GOV-03** : 3ème app `apps/governance` (port 4003) — messagerie signée Ed25519, Kanban
  directives, timeline officielle. Déclencherait l'extraction `@nina-aes/auth` (3ème consommateur).
- ~~**MaliHeatmap polygonale**~~ → livré (cf. §12.8 ci-dessous).
- **AD-02 mobile** : DataGrid 11 colonnes inutilisable sur xs. Vue alternative « cards » à
  implémenter, ou freeze 3 premières colonnes en overflow-x.
- **Tests E2E Playwright** : parcours agent login mock → dashboard KPIs visibles → click drill-down
  corrections → filtre statut UNDER_REVIEW → drawer → approve → toast → retour dashboard avec KPI
  corrections décrémenté.

### 12.8 MaliHeatmap choroplèthe — polygones admin1 (post-Session 4)

Suite à un retour utilisateur (les bulles centroïdes manquaient de contexte géographique),
`<MaliHeatmap>` supporte désormais un **mode choroplèthe** avec polygones réels :

data/mali/mali-regions-polygons.json (nouveau, 295 KB) : Téléchargé depuis geoBoundaries gbOpen Mali
ADM1 simplified (open data, licence permissive). 9 polygones : Bamako + 8 régions historiques
pré-2016 (Kayes, Koulikoro, Sikasso, Ségou, Mopti, Tombouctou, Gao, Kidal). Bbox lon -12.24/+4.25,
lat 10.14/25.00. Couvre 100 % du territoire.

data/mali/README.md (nouveau) : Documente toutes les sources data/mali/ (regions.json, cercles.json,
mali.geojson, mali-regions-polygons.json) avec provenance, licence, mapping codes shapeISO → ML-NN,
et procédure de mise à jour.

packages/ui/src/components/charts/mali-heatmap.tsx : - Nouvelle prop optionnelle
`geojson?: FeatureCollection`. - Si fournie → rendu choroplèthe (polygones SVG remplis selon la
valeur, mapping LEGACY_CODE_MAP ML-1 → ML-01, etc.). - Si absente → fallback bubble map
(comportement v1). - Marqueurs centroïdes pour les 11 régions post-2016 (Taoudénit, Ménaka,
Bandiagara, etc.) qui n'ont pas de polygones séparés dans le dataset historique. Petits points
colorés par-dessus. - ViewBox aspect ratio recalibré (100 × 90) pour matcher la forme réelle du Mali
(légèrement plus large que haut). - Étiquettes régions enrichies (7 majeures) avec stroke paintOrder
pour rester lisibles par-dessus la choroplèthe.

apps/admin/app/[locale]/(authenticated)/dashboard/page.tsx +
apps/admin/app/[locale]/(authenticated)/sigac/page.tsx : Import du JSON polygones + pass-through à
MaliHeatmap via prop `geojson`. Cast TypeScript explicite vers `MaliHeatmapProps     ['geojson']`
(le JSON Module est typé `any` par Next).

Limite connue (documentée README.md) : 11 régions post-2016 sans polygone propre — affichées comme
marqueurs centroïdes. Pour upgrader aux 20 régions actuelles, sourcer un dataset plus récent (INSTAT
Mali ou OCHA HDX).

## 13. Refactor — Session 5 : `@nina-aes/auth` + tests E2E Playwright (mai 2026)

Session de **refactor + qualité** : élimination de la duplication d'auth entre les apps (citizen +
admin, futur governance) et mise en place d'une suite Playwright E2E sur les parcours critiques. Pas
de nouvelle feature utilisateur — gain pur en maintenabilité + confiance.

### 13.1 Extraction `@nina-aes/auth` (Phase 1+2)

**Avant** : 884 lignes dupliquées entre `apps/citizen/lib/auth/` et `apps/admin/lib/auth/` (8
fichiers × 2 copies : session.ts + login/callback/refresh/logout route handlers). Différences
réelles entre les 2 copies : 3 strings (`clientId`, `appPublicUrl`, `mockProfile`).

**Après** : 757 lignes dans `packages/auth/src/` + 2 wrappers app de ~50 lignes chacun = 757 + 100 =
857 lignes au total (économie de 27 LOC nettes, mais surtout **un seul endroit pour évoluer le flow
OIDC**, un seul cycle de revue sécurité, et le 3ème consommateur (`apps/governance`) Session 6+ aura
un coût d'intégration ~zéro).

packages/auth — Structure : src/types.ts Role union (CITIZEN, AGENT, AUDITOR, MINISTER, ...),
UserProfile superset (NINA + matricule + centerId), Session, AuthMode, AuthConfig (clientId +
appPublicUrl + mockProfile).

    src/session.ts     getSession / requireSession / requireRole /
                       hasRole / isOwnerOf — tous paramétrés par
                       AuthConfig. JWKS caché module-level par issuer.
                       `cookies()` lu inconditionnellement en première
                       instruction (cacheComponents requirement Next 16).

    src/handlers/      Factories pour les 4 route handlers OIDC PKCE :
                       buildLoginHandler, buildCallbackHandler,
                       buildRefreshHandler, buildLogoutHandler.

    package.json       Deps : jose ^6.2.3, zod ^4.3.6. Peer : next ^16.
                       Bundler resolution.

apps/citizen + apps/admin — Migrations : lib/auth/session.ts (wrappers) : définissent AUTH_CONFIG
(client `nina-citizen` vs `nina-admin`, mock Fatoumata Diallo vs Modibo Konaté) et ré-exportent les
helpers déjà paramétrés. Aucun changement d'API pour les consommateurs (Server Components + Server
Actions).

    app/api/auth/*/route.ts : devenus des shims one-liner :
                         import + factory + export.

    next.config.ts : `@nina-aes/auth` ajouté à `transpilePackages`.
    package.json   : workspace dep ajoutée.

### 13.2 Tests Playwright E2E (Phase 3)

Setup multi-app au niveau root (config unique pilotant 2 projets) + 11 tests couvrant les parcours
critiques de chaque app.

playwright.config.ts — Multi-projects : - Projects `citizen` (port 4001) + `admin` (port 4002), un
par app Next. testMatch par regex pour isolation. - 2 webServers démarrés par Playwright (mode dev),
réutilisés s'ils tournent déjà en local (`reuseExistingServer`). - Trace + screenshots + video au
premier retry (debug-friendly). - Mode CI : retries=2, workers=1, reporter github+list (prêt pour
GitHub Actions Session 6+).

e2e/ — 11 tests dans 4 fichiers : citizen/home.spec.ts (3 tests) : PC-01 home charge, `/` → `/fr`
redirect, LanguageSwitcher change URL. citizen/nina-flow.spec.ts (3 tests) : PC-02 fiche pour NINA
mock, not-found gracieux, PC-03 wizard étape 1 avec 9 champs radio. admin/dashboard.spec.ts (2
tests) : AD-01 greeting agent + sidebar 5 nav items. admin/corrections.spec.ts (3 tests) : AD-02
datagrid ≥1 ligne, filtre statut, click ligne → drawer avec AiScorePanel + Approuver/Rejeter.

e2e/README.md — Documentation usage (commandes, env vars, filtrage, limites connues : pas de tests
data API, pas de snapshots, pas encore de CI GitHub Actions).

Root package.json — Scripts : pnpm run test:e2e # lance les 11 tests pnpm run test:e2e:ui # mode
interactif Playwright UI pnpm run test:e2e:install # télécharge Chromium (~150 MB, une fois)

Dev dep : @playwright/test ^1.50 → 1.60.0 effectif. .gitignore : test-results/, playwright-report/,
playwright/.cache/.

### 13.3 Validation

- `pnpm --filter @nina-aes/auth check-types` : ✅
- `pnpm --filter @nina-aes/citizen check-types` : ✅
- `pnpm --filter @nina-aes/admin check-types` : ✅
- `npx playwright test --list` : 11 tests dans 4 fichiers, config Playwright valide.

Tests pas exécutés dans la session car nécessitent les browsers Chromium téléchargés
(`pnpm run test:e2e:install`). Le code est prêt — à lancer quand on veut valider.

### 13.4 Reste à faire (Session 6+)

- **Lancer les 11 tests E2E une première fois** : valider qu'ils passent, corriger les sélecteurs si
  écart avec le DOM réel.
- **CI GitHub Actions** : workflow `.github/workflows/e2e.yml` qui lance
  `pnpm run test:e2e:install && pnpm run test:e2e` sur chaque PR. Cache des browsers Playwright pour
  gagner du temps.
- **GOV-01 à GOV-03** (apps/governance) : 3ème consommateur de `@nina-aes/auth` (validation du
  design factory).
- **Tests data API** : quand les services backend NestJS seront réels, ajouter des tests qui
  frappent les vraies APIs (séparation `e2e/integration/` vs `e2e/ui/`).
- **Snapshots visuels** : Playwright `expect.toHaveScreenshot()` une fois les écrans stabilisés
  (Session 7+).

## 14. CI/CD — Doc 16 + ADR-016 (mai 2026)

Première livraison documentaire de la phase transversale **Qualité, sécurité, déploiement** (docs 15
→ 20). La doc 16 et l'ADR associée formalisent la stack CI/CD GitHub Actions et identifient les
écarts à corriger sur le `ci.yml` historique.

### 14.1 Livrables documentaires

- `docs/16-CICD-GITHUB-ACTIONS.md` (~610 lignes) : guide complet d'implémentation du pipeline cible
  (5 workflows : verify, test, e2e, security, build + 1 deploy-staging + composite action
  `setup-node-pnpm` + Renovate + branch protection + badges README).
- `docs/adr/ADR-016-cicd-github-actions.md` (~155 lignes) : décision GitHub Actions vs alternatives
  (GitLab CI SaaS/auto-hébergé, Drone, Jenkins, CircleCI, monolithique `ci.yml`), note souveraineté,
  plan de migration Forgejo Actions pour gouvernance AES.

### 14.2 Écarts identifiés sur `.github/workflows/ci.yml` actuel

L'unique workflow présent (`ci.yml`, monolithique) présente plusieurs dérives par rapport aux
décisions infra (cf. §9.5) qui seront corrigées lors de l'implémentation effective du doc 16 :

| Composant CI actuel             | Décision projet (§9.5)              | Action       |
| ------------------------------- | ----------------------------------- | ------------ |
| `postgres:16-alpine`            | `postgis/postgis:18-3.6`            | À corriger   |
| `redis:7-alpine`                | `redis:8.6.3-alpine`                | À corriger   |
| `rabbitmq:3.13-alpine`          | `rabbitmq:4.2.4-management-alpine`  | À corriger   |
| `PYTHON_VERSION: "3.12"`        | Python 3.14                         | À corriger   |
| `POSTGRES_USER: nina_user`      | `nina_admin` (cf. `init-db.sql`)    | À corriger   |
| `pnpm db:push`                  | `prisma migrate deploy` (canonique) | À corriger   |
| Tests Python : ai-service seul  | + anticorruption-service            | À étendre    |
| 0 cache Playwright              | `actions/cache@v4` keyed pnpm-lock  | À ajouter    |
| 0 SARIF upload                  | `github/codeql-action/upload-sarif` | À ajouter    |
| 1 fichier `ci.yml` monolithique | 5 workflows séparés                 | À refactorer |
| 0 Renovate                      | `renovate.json` documenté           | À installer  |

### 14.3 Architecture cible (résumé)

- **5 workflows PR/push** : `verify` (lint + typecheck + `verify:repo`), `test` (Jest Node + Pytest
  Python matrix), `e2e` (Playwright mock 3 apps), `security` (Trivy + Semgrep + gitleaks +
  pnpm-audit + pip-audit
  - Bandit), `build` (Turbo + Docker buildx + push GHCR).
- **1 workflow déploiement** : `deploy-staging` (Helm upgrade sur K3s staging CTDEC, déclenché sur
  `main`).
- **1 composite action** : `.github/actions/setup-node-pnpm` factorise checkout + pnpm + node +
  install.
- **Caches** : pnpm store (natif setup-node), Playwright browsers (actions/cache), pip wheels (natif
  setup-python), Docker buildx (cache-from: gha), Turborepo remote cache **self-hosted MinIO**
  (souverain — pas Vercel).
- **Branch protection main** : 6 required checks (verify, test-node, test-python, gitleaks,
  trivy-fs, semgrep). Linear history, signed commits recommandés, no force push.
- **Renovate** : `automergeMinor` + `automergePatch`, schedule nocturne (after 1am, before 5am,
  America/Toronto), grouping Prisma + Next/React + flag manual-review sur majeurs.
- **Cible perf** : < 5 min par PR moyen (après chauffe caches), < 1 200 min runners / mois.

### 14.4 Reste à faire (implémentation effective)

L'implémentation des workflows YAML est planifiée comme Phase 3 post-doc-15 (Sécurité). Doc 16 livre
la spec, pas encore le code :

- Créer `.github/actions/setup-node-pnpm/action.yml` + `.nvmrc`
- Splitter `ci.yml` → `verify.yml` + `test.yml` + `e2e.yml` + `security.yml` + `build.yml`
- Créer `deploy-staging.yml` + provisionner ServiceAccount K3s (kubeconfig dans
  `K3S_STAGING_KUBECONFIG`)
- Activer Turbo remote cache MinIO (URL + token dans secrets)
- Installer Renovate app + commiter `renovate.json`
- Configurer branch protection rules (UI GitHub)
- Ajouter les 4 badges au README
- Tagger `cicd-mvp` après validation tutorat

### 14.5 Mise à jour cross-références

- `MAINTENANCE.md §10` : la mention prospective « CI/CD (doc 16) ajoutera `pnpm run verify:repo`
  comme step bloquant » est remplacée par un lien direct vers `docs/16-CICD-GITHUB-ACTIONS.md`.
- `docs/00-README-INDEX.md §2` : doc 16 conserve son entrée originale ; l'estimation reste 8-12 h
  (spec livrée + ~6 h pour l'implémentation YAML).

## 15. Observabilité — Doc 17 + ADR-017 (mai 2026)

Deuxième livraison documentaire de la phase transversale (docs 15 → 20). La doc 17 et l'ADR-017
formalisent la stack d'observabilité LGTM et l'instrumentation OpenTelemetry des 11 services Bloc A.

### 15.1 Livrables documentaires

- `docs/17-MONITORING-OBSERVABILITY.md` (~960 lignes) : guide d'implémentation complet — réécriture
  `@nina-aes/logger` Pino + Loki + redact PII, endpoints `/metrics` NestJS + FastAPI, OTel SDK
  auto-instru, ajout profil `observability` à `docker-compose.dev.yml` (7 containers : Prometheus,
  Grafana, Loki, Tempo, Promtail, OTel Collector, Alertmanager), provisioning Grafana (3
  datasources + 6 dashboards), 12 règles d'alerting Prometheus avec runbook associé.

- `docs/adr/ADR-017-observabilite-lgtm-stack.md` (~205 lignes) : décision LGTM vs 9 alternatives
  (Datadog, NewRelic, ELK, Graylog, VictoriaMetrics, Jaeger, OpenSearch, Sentry, no-op), note
  souveraineté avec interdiction explicite de Grafana Cloud, plan de migration vers
  VictoriaMetrics + ClickHouse + Vector si volumes l'exigent en Phase 2.

### 15.2 Stack cible (LGTM + OTel + Pino + Alertmanager)

| Composant                    | Version    | Rôle                           |
| ---------------------------- | ---------- | ------------------------------ |
| Prometheus                   | 3.4.1      | Métriques, retention 15j       |
| Grafana                      | 12.3.0     | Dashboards + alerting unifié   |
| Loki                         | 3.5.0      | Logs structurés, retention 30j |
| Tempo                        | 2.7.1      | Traces OTLP, retention 7j      |
| Promtail                     | 3.5.0      | Ship logs containers → Loki    |
| OTel Collector               | 0.119.0    | Routeur OTLP → 3 backends      |
| Alertmanager                 | 0.28.1     | Routing notif + dédoublonnage  |
| Pino (Node) + structlog (Py) | 9.6 / 25.1 | Loggers JSON structurés        |

### 15.3 PII safe by construction

Le nouveau `@nina-aes/logger` (réécrit en Pino) embarque un **redact array** de 12 champs (`nina`,
`ninaRaw`, `fingerprintHash`, `faceEmbedding`, `dateNaissance`, `password`, `token`, etc.). Le test
`packages/logger/src/__tests__/redact.test.ts` valide qu'aucun NINA brut ne traverse jamais le
transport Loki. Cette propriété est suivie par la métrique d'ADR-017 :
`logcli query '{} |~ "189\d{12}[A-Z]"'` doit retourner **0 résultat**.

### 15.4 Alertes critiques

Sur les 12 règles d'alerting livrées, deux sont explicitement marquées **CRITICAL sans tolérance** :

- `AuditChainBreak` (rupture chaîne Merkle audit, cf. ADR-014) → procédure d'isolation immédiate +
  CISO CTDEC + ANSSI Mali (cf. RUNBOOK §9).
- `LokiIngestionDown` (perte de traçabilité observabilité) → trail forensic compromis.

Les 10 autres alertes (latence p95, taux 5xx, queue RabbitMQ, etc.) incluent une référence runbook
obligatoire (`runbook: docs/observability/RUNBOOK.md#<anchor>`).

### 15.5 Substitut `@nina-aes/logger` stub → Pino

Le tableau §2 de ce CHANGELOG est mis à jour : `@nina-aes/logger` passe de **stub temporaire
console-backed** à **Pino 9 + transport Loki + redact PII** dès l'implémentation effective de la
doc 17.

### 15.6 Reste à faire (implémentation effective)

L'implémentation pratique est planifiée comme Phase 3 post-doc-15 :

- Réécrire `packages/logger/src/index.ts` (Pino 9 + redact + transport Loki)
- Ajouter test `redacts nina field` dans `__tests__/`
- Ajouter `MetricsModule` aux 6 AppModule NestJS Bloc A
- Ajouter `instrument(app)` aux 2 FastAPI services
- Ajouter `startOtel()` en première ligne de chaque main.ts/main.py
- Créer 11 fichiers config dans `infrastructure/observability/` (prometheus.yml, loki.yml,
  tempo.yml, promtail.yml, otel-collector.yml, alertmanager.yml, rules/nina-aes-slo.yml,
  grafana/provisioning/datasources/all.yml, grafana/provisioning/dashboards/nina-aes.yml, 6
  dashboards JSON)
- Étendre `docker-compose.dev.yml` avec profil `observability`
- Rédiger `docs/observability/RUNBOOK.md` (12 entrées) + `docs/observability/SLOs.md`
- Tagger `observability-mvp` après validation tutorat

### 15.7 Cross-références

- `MAINTENANCE.md §9` : ligne « Monitoring & observabilité » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md §2` : doc 17 conserve son entrée originale ; l'estimation est révisée à
  16-22 h (vs 8-12 h initial — la stack LGTM
  - instrumentation OTel sur 11 services demande plus que prévu).

## 16. Stratégie de tests — Doc 18 + ADR-018 (mai 2026)

Troisième livraison documentaire de la phase transversale (docs 15 → 20). La doc 18 et l'ADR-018
formalisent la pyramide de tests à 4 niveaux et les conventions associées.

### 16.1 Livrables documentaires

- `docs/18-TESTING-STRATEGY.md` (~960 lignes) : guide d'implémentation complet — conventions
  nommage/AAA, factories Faker centralisées dans `packages/test-fixtures`, Jest unitaires NestJS +
  Pytest unitaires FastAPI, intégration Supertest + Testcontainers, extension Playwright (Session 5
  → 30 tests), 4 scénarios k6 avec output Prometheus, configuration coverage threshold 80 %, Stryker
  P2 manuel sur `@nina-aes/utils`.

- `docs/adr/ADR-018-strategie-tests-pyramide.md` (~215 lignes) : décision pyramide 4-niveaux vs 8
  alternatives (tout-en-E2E, mock-driven, Cypress+Cloud, Vitest partout, JMeter, Locust, SonarQube,
  SaaS synthetic), note souveraineté (interdiction Cypress Cloud / Sauce Labs / BrowserStack /
  Datadog Synthetics / Codecov), 10 métriques de suivi chiffrées.

### 16.2 Pyramide cible

| Niveau          | Volume      | Outils                                                   | Couverture         |
| --------------- | ----------- | -------------------------------------------------------- | ------------------ |
| **Unitaires**   | ~800 tests  | Jest 30 (TS) · Pytest 8 (Py) · Vitest 4                  | **≥ 80 %**         |
| **Intégration** | ~150 tests  | Supertest 7 + Testcontainers 10 · httpx + pytest-asyncio | ≥ 60 % services    |
| **E2E**         | ~30 tests   | Playwright 1.50 (mock auth)                              | parcours critiques |
| **Charge**      | 4 scénarios | k6 0.55 + output Prometheus (cf. doc 17)                 | SLO validation     |

### 16.3 Décisions structurelles

- **Pyramide stricte, pas glace au chocolat** : ratio ~800/150/30/4. PR qui livre 1 E2E sans
  unitaires = rejeté.
- **Factories Faker centralisées** : nouveau package `packages/test-fixtures` (factory
  `make<Entity>(overrides?)`). Aucune donnée de test à la main.
- **Testcontainers pour intégration** : chaque suite spin-up son propre `postgis/postgis:18-3.6`,
  applique migrations Prisma, exécute, nettoie. Coût ~30 s warmup × N suites — acceptable jusqu'à
  ~10 suites.
- **MSW pour tests frontend** : pas de `jest.mock('fetch')`. Handlers réutilisés en E2E et
  unitaires, compatibles Server Components Next.js 16.
- **k6 contre staging uniquement** : output Prometheus remote-write vers doc 17, dashboards Grafana
  réutilisables. Manuel + nightly CI.
- **Stryker P2 manuel** : score mutation seulement sur `@nina-aes/utils`, exécuté avant chaque
  release majeure. Pas en CI bloquante.
- **Coverage 80 % bloquante en CI** : `jest --coverage` + `pytest --cov-fail-under=80` retournent
  exit 1 si seuil non respecté.

### 16.4 Souveraineté

Interdiction explicite dans ADR-018 :

- Cypress Cloud (SaaS US)
- Sauce Labs / BrowserStack (SaaS US)
- Datadog Synthetics (SaaS US)
- Codecov (SaaS US) — fallback artefact `coverage-final.json` Actions
- Grafana Cloud Synthetic Monitoring

Stack 100 % open-source self-hostable : Jest/Pytest/Playwright/ Testcontainers/k6/Stryker/Faker/MSW
(MIT/Apache 2.0).

### 16.5 Reste à faire (implémentation effective)

L'implémentation pratique est planifiée comme Phase 4 post-doc-17. Doc 18 livre la spec ; le code
suit :

- Créer `packages/test-fixtures` (workspace pnpm)
- Factories : `makeCitizen`, `makeNina`, `makeFdi`, `makeAppointment`, `makeSigacReport`,
  `makeAuditLog`
- Étendre Jest sur 6 services NestJS Bloc A (controller.spec.ts + e2e-spec.ts avec Testcontainers)
- Étendre Pytest unitaires + intégration sur 2 FastAPI services
- Étendre Playwright de 11 → 30 tests (correction, RDV, USSD mock, GOV-01..03 quand
  `apps/governance` livré)
- Créer 4 scénarios k6 dans `tests/load/scenarios/`
- Intégrer MSW dans `apps/citizen` + `apps/admin`
- Activer `coverageThreshold: 80%` dans tous les `jest.config.cjs`
- Documenter exclusions légitimes dans `docs/testing/COVERAGE-MATRIX.md`
- Rédiger `docs/testing/TEST-CHARTER.md`
- Tagger `testing-mvp` après validation tutorat

### 16.6 Cross-références

- `MAINTENANCE.md §9` : ligne « Stratégie de tests » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md §2` : doc 18 conserve son entrée ; l'estimation reste 12-16 h (spec) + ~6
  h (implémentation factories
  - premiers tests).
- `docs/16-CICD-GITHUB-ACTIONS.md §4.3` : seuil `--cov-fail-under=80` documenté (référence
  circulaire entre doc 16 et doc 18 — assumée).

## 17. Backup & DRP — Doc 19 + ADR-019 (mai 2026)

Quatrième livraison documentaire de la phase transversale (docs 15 → 20). La doc 19 et l'ADR-019
formalisent la stratégie de sauvegarde 3-2-1 et le plan de reprise après sinistre avec cibles
RTO/RPO chiffrées.

### 17.1 Livrables documentaires

- `docs/19-BACKUP-RECOVERY.md` (~870 lignes) : guide d'implémentation complet — pgBackRest 2.55
  (full quotidien + diff hebdo + WAL archive flush 60s), Redis RDB+AOF, MinIO replication
  active-passive, cold storage chiffré age (XChaCha20) vers Scaleway/OVH souverain, script
  `restore-test.sh` testé mensuellement via CronJob K3s, DRP-RUNBOOK avec 4 scénarios, DRP-DRILL
  trimestriel + chaos engineering, section dépannage 12 pièges.

- `docs/adr/ADR-019-backup-recovery-strategy.md` (~225 lignes) : décision pgBackRest + MinIO
  replication + age cold storage vs 9 alternatives (AWS RDS, Backblaze, Wasabi, Veeam, Bareos,
  pg_dump simple, Restic seul, snapshots LVM/ZFS, no off-site), note souveraineté avec liste blanche
  cold storage (Scaleway Paris / OVH Strasbourg / Cellar / MinIO secondaire AES), 10 métriques de
  suivi chiffrées.

### 17.2 Cibles chiffrées

- **RTO** (Recovery Time Objective) : **< 4 h** (testé mensuellement)
- **RPO** (Recovery Point Objective) : **< 1 h** (WAL archive flush 60s)
- **Rétention** : 7 daily + 4 weekly + 12 monthly + 7 yearly (grand-père/père/fils)
- **Lag réplication MinIO** : < 5 min p95
- **Restore test mensuel** : RTO mesuré < 30 min sur staging

### 17.3 Stack cible

| Composant       | Version    | Rôle                                        |
| --------------- | ---------- | ------------------------------------------- |
| pgBackRest      | 2.55.x     | Backup Postgres full+diff+WAL               |
| MinIO           | 2025-09-07 | Object storage S3-compat + replication      |
| Redis           | 8.6        | RDB snapshot + AOF append-only              |
| HashiCorp Vault | 1.20       | Transit pour clé chiffrement (rotation 90j) |
| age             | 1.2.0      | Chiffrement XChaCha20 cold storage          |
| K3s CronJob     | 1.33       | Orchestration jobs backup quotidiens        |

### 17.4 Souveraineté (interdictions explicites ADR-019)

- AWS S3 / RDS (US, CLOUD Act)
- Backblaze B2 (US Californie)
- Wasabi (US)
- Veeam Backup SaaS (éditeur US)
- Acronis Cyber Backup (US)
- Google Cloud Storage / Azure Blob (US)

Liste blanche autorisée : **Scaleway Paris (FR), OVH Strasbourg (FR), Cellar Clever Cloud (FR),
MinIO secondaire AES (BFA/NER)**. Chiffrement double-couche (pgBackRest AES-256-CBC + age
XChaCha20) + clé privée distribuée en Shamir 3/5 aux admins CTDEC.

### 17.5 Décisions structurelles

- **3-2-1 rule stricte** : 3 copies, 2 supports, 1 off-site.
- **pgBackRest plutôt que pg_dump simple** : full+diff+WAL + PITR fin natif → RPO < 1h impossible
  avec pg_dump nightly seul.
- **MinIO replication active-passive** : écritures sur DC primaire, miroir async sur DC secondaire
  AES (Ouagadougou/Niamey).
- **age plutôt que GPG** : crypto moderne X25519 + UX simple (1 fichier de clé). GPG trop complexe
  pour Shamir + rotation.
- **Test restore mensuel automatique** : un backup non testé n'est pas un backup. CronJob
  `restore-test.sh` exit ≠ 0 → alerte critique.
- **DRP drill trimestriel chaos engineering** : 4 scénarios par an (crash node Postgres, corruption
  WAL, perte MinIO, perte cluster K3s entière) avec RTO mesuré et consigné.

### 17.6 Alertes Prometheus ajoutées (extension doc 17)

3 nouvelles règles à ajouter dans `rules/nina-aes-slo.yml` :

- `BackupJobFailed` (severity: critical)
- `RestoreTestFailed` (severity: critical)
- `MinIOReplicationLag` (severity: warning, threshold > 5 min)

### 17.7 Reste à faire (implémentation effective)

- Activer WAL archive Postgres (`postgresql.conf` ajouts)
- Configurer pgBackRest 2 repos (local + MinIO interne)
- Créer 3 CronJobs K3s : backup-postgres-daily, backup-postgres-weekly, backup-redis-snapshot,
  restore-test-monthly
- Provisionner buckets MinIO + activer replication active-passive
- Sélectionner cold storage souverain + bucket
- Générer clé age + distribuer Shamir 3/5
- Rédiger `docs/observability/DRP-RUNBOOK.md` (4 scénarios)
- Initialiser `docs/observability/DRP-DRILL-LOG.md`
- Exécuter 1er drill trimestriel (crash node Postgres)
- Tagger `backup-mvp` après validation tutorat

### 17.8 Cross-références

- `MAINTENANCE.md §9` : ligne « Backup & DRP » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md §2` : doc 19 conserve son entrée originale ; l'estimation est révisée à
  10-14 h (vs 6-8 h initial — pgBackRest + Shamir + drill trimestriel demandent plus que prévu).
- `docs/17-MONITORING-OBSERVABILITY.md §4.6` : 3 nouvelles règles d'alerting backup à ajouter à
  `rules/nina-aes-slo.yml`.

## 18. Déploiement K3s — Doc 20 + ADR-020 (mai 2026) — CLÔTURE PHASE TRANSVERSALE

Cinquième et dernière livraison documentaire de la phase transversale **Qualité / Sécurité /
Déploiement** (docs 15 → 20). La doc 20 et l'ADR-020 formalisent le passage de `docker compose`
(dev) à K3s (production), bouclant la chaîne de docs nécessaires au déploiement réel du Bloc A.

### 18.1 Livrables documentaires

- `docs/20-DEPLOYMENT-K3S-PRODUCTION.md` (~1080 lignes) : guide d'implémentation complet —
  installation K3s 1.33 (control-plane + agents), Ingress Nginx 4.12 en DaemonSet hostNetwork,
  cert-manager 1.18 avec ClusterIssuer Let's Encrypt (DNS-01 Cloudflare V1, acme-dns V2 air-gap),
  Helm chart umbrella `nina-aes` (11 services
  - 3 frontends + sous-charts Bitnami), Argo Rollouts 1.8 pour blue-green sur `identity-service`,
    Sealed Secrets 0.27, NetworkPolicy default-deny, HPA Prometheus custom metrics, smoke tests
    post-install via Helm hooks, section dépannage 12 pièges.

- `docs/adr/ADR-020-deployment-k3s-production.md` (~235 lignes) : décision K3s on-premise vs 9
  alternatives (EKS/AKS/GKE managed, OpenShift, vanilla kubeadm, microk8s, Nomad, Docker Swarm,
  plain Compose en prod), note souveraineté avec mode air-gap-ready + Harbor souverain + acme-dns
  self-hosted, 10 métriques de suivi chiffrées (RTO rollback < 1 min, cert validity ≥ 30j, etc.).

### 18.2 Stack cible

| Composant        | Version      | Rôle                                      |
| ---------------- | ------------ | ----------------------------------------- |
| K3s              | v1.33.4+k3s1 | Distribution K8s légère on-premise        |
| Helm             | 3.16.4       | Package manager + chart umbrella          |
| Ingress Nginx    | 4.12.0       | Reverse proxy + TLS termination           |
| cert-manager     | 1.18.0       | Émission/renouvellement Let's Encrypt     |
| Argo Rollouts    | 1.8.0        | Blue-green identity-service               |
| Sealed Secrets   | 0.27.0       | Secrets chiffrés commitables Git          |
| Calico ou Cilium | 3.30 / 1.17  | CNI avec NetworkPolicy (remplace Flannel) |
| MetalLB (V2)     | 0.14.x       | LoadBalancer on-premise                   |

### 18.3 Décisions structurelles

- **K3s vs vanilla K8s** : 60 MB binaire, SQLite par défaut, démarre < 30 s. Idéal CTDEC sans équipe
  SRE 10+ ETP.
- **Helm chart umbrella unique** : 1 `helm install` déploie tout — upgrade/rollback en 1 commande,
  traçables via `helm history`.
- **Blue-green seulement pour identity-service** : c'est le service le plus critique (validation
  NINA pour 11M citoyens). Les 10 autres
  - frontends sont en RollingUpdate (`maxSurge: 25%`, `maxUnavailable: 0`).
- **Argo Rollouts AnalysisTemplate** : smoke test HTTP + query Prometheus error-rate < 1 % avant
  promotion auto. Impossible de pousser une version cassée en prod.
- **Sealed Secrets > External Secrets Operator (V1)** : plus simple, pas de SPOF Vault au startup.
  ESO documenté pour V2.
- **NetworkPolicy default-deny + allow ciblé** : zero-trust intra-cluster.
- **3 namespaces séparés** : `nina-aes` (services métier), `observability` (LGTM doc 17), `infra`
  (Postgres/Redis/RabbitMQ/MinIO/ Vault/Keycloak).
- **Helm values multi-env** : `values-staging.yaml` + `values-production. yaml`, déployable depuis
  CI (doc 16 `deploy-staging.yml`).

### 18.4 Souveraineté (interdictions explicites ADR-020)

- AWS EKS, Azure AKS, Google GKE (managed cloud US)
- OpenShift SaaS (Red Hat = filiale IBM US)
- Docker Hub public en production (utiliser GHCR + Harbor V2)
- Cloudflare DNS si air-gap exigé (alternative : acme-dns self-hosted)

Stack 100 % open-source, K3s par SUSE (Allemagne CNCF), aucune télémétrie cloud par défaut.

### 18.5 Cibles chiffrées

- RTO rollback Helm : **< 1 min** (drill mensuel)
- Cert TLS validity : **≥ 30 jours** sur 100 % endpoints
- Disponibilité cluster nodes : **100 % Ready**
- Pods en CrashLoopBackOff : **< 5/semaine**
- HPA scaling events tracking only (pas de seuil bloquant)
- Argo Rollouts pre-promotion success rate : **> 95 %**
- Helm upgrade temps moyen : **< 5 min**
- Sealed Secret décryption échecs : **0**

### 18.6 Reste à faire (implémentation effective)

- Installer K3s sur 1 VM Ubuntu 24.04 (V1 staging)
- Installer CNI compatible NetworkPolicy (Calico 3.30 ou Cilium 1.17)
- Déployer Ingress Nginx + cert-manager
- Configurer ClusterIssuer Let's Encrypt (token Cloudflare ou acme-dns)
- Créer le Helm chart `infrastructure/helm/nina-aes/` (Chart.yaml + values + templates pour 11
  services + 3 frontends)
- Installer Argo Rollouts + Sealed Secrets
- Configurer NetworkPolicy default-deny + allow ciblées
- Premier `helm install` sur namespace `nina-aes-staging`
- Smoke test post-install + drill rollback mensuel
- Rédiger `docs/deployment/OPS-RUNBOOK.md` + `UPGRADE-GUIDE.md`
- Tag `production-mvp` après validation tutorat

### 18.7 Cross-références

- `MAINTENANCE.md §9` : ligne « Déploiement K3s » ajoutée aux liens canoniques.
- `docs/00-README-INDEX.md` : doc 20 livré, **clôture phase transversale 15-20** ; l'estimation est
  révisée à 14-20 h (vs 10-14 h initial — Helm chart umbrella complet + Argo Rollouts demandent
  plus).

### 18.8 État global phase transversale 15→20

| Doc | Sujet                             | Statut      | Commit      |
| --- | --------------------------------- | ----------- | ----------- |
| 15  | Security Hardening (Vault, mTLS)  | ✅ Existant | (avant)     |
| 16  | CI/CD GitHub Actions              | ✅ Livré    | `a59ef3f`   |
| 17  | Monitoring & Observabilité (LGTM) | ✅ Livré    | `1cbf838`   |
| 18  | Stratégie de tests (pyramide)     | ✅ Livré    | `f4453e4`   |
| 19  | Backup & DRP (pgBackRest + age)   | ✅ Livré    | `95ab390`   |
| 20  | Déploiement K3s production        | ✅ Livré    | (ce commit) |

**5 docs + 5 ADR livrés** sur la session phase transversale, totalisant ~5 700 lignes
documentaires + ~1 100 lignes ADR. Toutes les chaînes `verify:repo` passent vertes après chaque
livraison.

## 19. Bloc B Interopérabilité AES — Doc 21 + ADR-021 (mai 2026)

Première livraison **Blocs B → F** (extensions post-Bloc-A).

### 19.1 Livrables

- `docs/21-BLOC-B-INTEROPERABILITE-AES.md` (~620 lignes) : spec complète protocole **BCID-AES v1**
  (Border Citizen Identity — Alliance des États du Sahel), microservice `interop-service` NestJS
  port 3006, mTLS + JWS Ed25519, rate limiting 1000/h/pays via Redis sliding window, tables Prisma
  `aes_partner_keys` + `aes_verification_logs`, onglet « Interop AES » dans `apps/governance`,
  OpenAPI 3.1 publié pour partenaires BFA + NER.

- `docs/adr/ADR-021-protocole-bcid-aes-interop.md` (~225 lignes) : décision protocole custom
  BCID-AES vs 9 alternatives (eIDAS, OAuth Federation, SAML, W3C VC+DID, INTERPOL I-24/7, CEDEAO,
  gRPC, mTLS seul, JWE), note souveraineté avec position **anti-eIDAS** (refus supervision UE), 10
  métriques de suivi.

### 19.2 Décisions clés

- REST sur HTTPS + mTLS (pas gRPC, simplicité debug)
- Double couche auth : mTLS pour gateway + JWS Ed25519 pour payload
- Schéma réponse **minimaliste** `{exists, valid, vulnerable, lastUpdated}` — privacy by design,
  impossible de reconstruire base citoyens
- Versionnage explicite par path `/v1/`, `/v2/`
- Audit Merkle 10 ans compatible ADR-014

## 20. Bloc C Modules gouvernementaux — Doc 22 + ADR-022 (mai 2026)

### 20.1 Livrables

- `docs/22-BLOC-C-MODULES-GOUVERNEMENTAUX.md` (~580 lignes) : 3 sous-modules consolidés — **C1
  vulnerability-service** (port 3011, catégories grossesse/handicap/65+/mineur/IDP/chronique, file
  prioritaire RDV, agent mobile offline 5j, BullMQ), **C2 SGOGT** (messagerie officielle JWS
  Ed25519, escalade TTL 4h/24h), **C3 Élections** (inscription auto à 18 ans via cron quotidien
  Africa/Bamako, export delta DGE signé SHA-256 + JWS, pseudonyme via sel rotated 5 ans).

- `docs/adr/ADR-022-modules-gouvernementaux-scope.md` (~145 lignes) : décision **2 microservices**
  (`vulnerability-service` autonome + `governance-service` contenant SGOGT + Élections) vs 3 séparés
  ou 1 monolithique, 8 alternatives rejetées, 8 métriques de suivi.

### 20.2 Décisions clés

- vulnerability-service autonome (cache offline + BullMQ spécifique)
- SGOGT + Élections consolidés dans governance-service (RBAC + UI partagés)
- Pseudonyme électeurs = SHA-256(NINA + sel-élection-rotated-5y)
- Aucun NINA en clair dans export DGE

## 21. Bloc D SIGAC Anti-corruption — Doc 23 + ADR-023 (mai 2026)

### 21.1 Livrables

- `docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md` (~680 lignes) : `anticorruption-service` FastAPI port
  3009 (scaffold existant étendu), 3 modèles ML (**Isolation Forest** scikit-learn 1.7 pour
  anomalies agents, **LSTM** PyTorch 2.5 séries temporelles, **BERT AfroXLMR**
  `Davlan/afro-xlmr-base` pour classif signalements multilingue bambara/peul), scoring intégrité 5
  facteurs hebdo (0-100), canal USSD `*123*ALERTE#` chiffré Vault Transit Ed25519 (numéro téléphone
  JAMAIS enregistré), workflow lanceur d'alerte, MLflow self-hosted pour tracking.

- `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md` (~230 lignes) : décision stack 3 modèles
  complémentaires vs 8 alternatives (GPT-4 SaaS, Llama 3, autoencoder seul, règles uniquement, Tor,
  PGP), distinction explicite avec ADR-015 (erreurs NINA vs comportements agents), interdiction
  Datadog APM / SageMaker / Vertex AI.

### 21.2 Décisions clés

- **Le ML ne décide pas, il flagge** — RGPD art. 22 compliance
- Anonymat lanceur d'alerte mathématiquement garanti (chiffrement asymétrique côté serveur, clé
  privée Vault non exportable)
- AfroXLMR pré-entraîné langues africaines (vs `bert-multilingual-cased`)
- Dataset synthétique pour fine-tuning (zero leak NINA réels)

## 22. Bloc E Bornes kiosque — Doc 24 + ADR-024 (mai 2026)

### 22.1 Livrables

- `docs/24-BLOC-E-BORNES-KIOSQUE-ELECTRON.md` (~620 lignes) : app Electron 31 LTS `apps/kiosk`, mode
  kiosque verrouillé Win+Linux, preload sécurisé (contextIsolation + sandbox), 4 écrans pictogrammes
  (Scan / Book / Print / Report), lecteur QR via `@zxing/browser`, imprimante thermique ESC/POS via
  `node-thermal-printer`, cache local SQLite + queue offline 24h, auto-update signé Ed25519 depuis
  serveur souverain interne, télémétrie heartbeat 5 min vers `apps/admin`.

- `docs/adr/ADR-024-kiosk-electron-vs-pwa.md` (~190 lignes) : décision Electron 31 vs 7 alternatives
  (PWA, Win32 C#, native Qt/GTK, tablette Android, LineageOS, Tauri, Wails, pas de borne du tout),
  note souveraineté avec auto-update interne uniquement (pas GitHub release public), migration Tauri
  envisagée V3.

### 22.2 Décisions clés

- Réutilisation 80 % du code citizen-app
- contextIsolation + sandbox + CSP strict obligatoires
- Auto-update signé Ed25519, jamais GitHub release
- Mode offline 24h gracieux (queue SQLite)

## 23. Bloc F Biométrie — Doc 25 + ADR-025 (mai 2026, vision V1)

### 23.1 Livrables

- `docs/25-BLOC-F-BIOMETRIE.md` (~580 lignes) : **plan progressif V1 (vision sans implémentation)**,
  phasage P3a (empreintes 1:1) → P3b (face 1:1) → P3c (1:N restreint), pipeline hash irréversible
  HMAC-SHA-256 + salt Vault rotated 5y, format ISO/IEC 19794-\* (pas de vendor lock-in),
  consentement signé JWS Ed25519 obligatoire, audit Merkle de chaque opération biométrique, DPIA
  modèle, critères go/no-go chiffrés entre phases (FAR < 0.01 %, FRR < 1 %).

- `docs/adr/ADR-025-biometrie-phasage-et-hash-irreversible.md` (~230 lignes) : décision phasage
  strict + hash irréversible obligatoire vs 8 alternatives (no biometrics, templates clair
  encrypted, images brutes, match-on-card Estonie, Aadhaar centralisé clear, algos propriétaires,
  fingerprint smartphone TouchID/FaceID, pas de phasage), note souveraineté avec interdiction
  Microsoft Face / AWS Rekognition / Google Vision.

### 23.2 Décisions clés

- **Statut V1 = vision seulement** — implémentation conditionnée à cadre juridique malien
  stabilisé + validation OCLEI + pen-test ANSSI
- Hash HMAC-SHA-256(template, salt Vault) — irréversible
- Aucune image brute persistée (RAM only < 200 ms)
- Salt rotation 5y = défense ultime (force re-enrôlement si Vault compromis)
- 1:N uniquement avec mandat judiciaire + double validation procureur

## 24. Rapport final soutenance — Doc 26 (mai 2026)

### 24.1 Livrables

- `docs/26-RAPPORT-FINAL-SOUTENANCE.md` (~580 lignes) : plan d'écriture du rapport final 60-80 pages
  structure UQAR, plan présentation soutenance 20-30 min (intro / démo live 12 min / architecture /
  qualité / blocs B-F / conclusion), script démonstration live minute par minute avec plan B en cas
  de panne, tableau métriques chiffrées consolidées, top 30 questions anticipées + réponses
  préparées, rétrospective honnête (ce qui a marché / pas marché / referait autrement), checklist
  J-15 à J-jour J.

### 24.2 Pas d'ADR

Le doc 26 est un **plan de soutenance**, pas une décision architecturale → pas d'ADR-026 associée.
Les 25 ADRs (001-025) couvrent l'intégralité des décisions techniques du projet.

### 24.3 Rétrospective honnête livrée

5 succès assumés + 5 échecs assumés + 5 « ce qu'on referait autrement » + 5 leçons personnelles.
Volonté explicite de transparence pédagogique pour le jury.

## 25. État global docs (00-26) — CLÔTURE COMPLÈTE

| Doc | Sujet                          | Statut      | Commit      |
| --- | ------------------------------ | ----------- | ----------- |
| 00  | README Index                   | ✅ Existant | (avant)     |
| 01  | Cahier des charges             | ✅ Existant | (avant)     |
| 02  | Architecture globale           | ✅ Existant | (avant)     |
| 03  | Setup environnement dev        | ✅ Existant | (avant)     |
| 04  | Monorepo Structure             | ✅ Existant | (avant)     |
| 05  | Infrastructure Docker Compose  | ✅ Existant | (avant)     |
| 06  | Database Schema Prisma         | ✅ Existant | (avant)     |
| 07  | Backend Identity Service       | ✅ Existant | (avant)     |
| 08  | Backend Auth Service           | ✅ Existant | (avant)     |
| 09  | Backend Audit Service          | ✅ Existant | (avant)     |
| 10  | Backend Document Service       | ✅ Existant | (avant)     |
| 11  | AI Service FastAPI             | ✅ Existant | (avant)     |
| 12  | Frontend Integration API       | ✅ Existant | (avant)     |
| 13  | Mobile App Expo                | ✅ Existant | (avant)     |
| 14  | USSD Service Africa's Talking  | ✅ Existant | (avant)     |
| 15  | Security Hardening             | ✅ Existant | (avant)     |
| 16  | CI/CD GitHub Actions           | ✅ Livré    | `a59ef3f`   |
| 17  | Monitoring & Observabilité     | ✅ Livré    | `1cbf838`   |
| 18  | Stratégie de tests             | ✅ Livré    | `f4453e4`   |
| 19  | Backup & DRP                   | ✅ Livré    | `95ab390`   |
| 20  | Déploiement K3s                | ✅ Livré    | `971bd60`   |
| 21  | Bloc B Interop AES             | ✅ Livré    | (ce commit) |
| 22  | Bloc C Modules gouvernementaux | ✅ Livré    | (ce commit) |
| 23  | Bloc D SIGAC                   | ✅ Livré    | (ce commit) |
| 24  | Bloc E Bornes kiosque          | ✅ Livré    | (ce commit) |
| 25  | Bloc F Biométrie (vision V1)   | ✅ Livré    | (ce commit) |
| 26  | Rapport final soutenance       | ✅ Livré    | (ce commit) |

**27/27 documents livrés** + **25 ADRs livrés** (001-025). Le doc 26 n'a pas d'ADR (c'est un plan,
pas une décision archi).

Volume total session Blocs B→F + soutenance (ce commit) :

- 5 docs Blocs : ~3 080 lignes
- 1 doc soutenance : ~580 lignes
- 5 ADRs : ~1 020 lignes
- **Total : ~4 680 lignes documentaires**

Volume total docs 16-26 (phase transversale + extensions) :

- 11 docs : ~8 360 lignes
- 10 ADRs : ~2 100 lignes
- **Grand total : ~10 460 lignes documentaires sur la session**

`pnpm run verify:repo` ✅ vert.

## 26. Corrélation documentaire — DOCUMENTATION-MAP.md + fixes drifts (mai 2026)

Après la clôture 27/27 docs + 25/25 ADRs, audit complet du système documentaire et création d'une
**carte unique de corrélation** avec correction des dérives détectées.

### 26.1 Livrable principal

- **`docs/DOCUMENTATION-MAP.md`** (~610 lignes) : carte des 3 tiers documentaires (gouvernance /
  canonique / ADRs), matrice de corrélation cross-références, registre des **12 drifts identifiés**,
  recommandations priorisées **P0/P1/P2** avec actions exécutables.

### 26.2 Drifts P0 corrigés immédiatement

3 références ADR cassées (titres / fichiers cibles incohérents) :

| ADR     | Bug avant                                                                                                 | Fix appliqué                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ADR-020 | `[ADR-015 — Sécurité hardening (mTLS, Vault)](./ADR-015-ml-stack-detection-erreurs-nina.md)` (titre faux) | Retiré du header « Complète » ; remplacé par bandeau « **Cf. aussi** : doc 15 » |
| ADR-024 | `[ADR-013 — Mobile Expo](./ADR-013-keycloak-identity-provider.md)` (titre faux, fichier = Keycloak)       | Retiré ; remplacé par « **Cf. aussi** : doc 13 Mobile Expo (pas d'ADR dédié) »  |
| ADR-025 | `[ADR-015 — Sécurité hardening](./ADR-015-ml-stack-detection-erreurs-nina.md)` (idem)                     | Idem                                                                            |

**Cause racine** : confusion entre numéro ADR et numéro doc. ADR-013 existe (Keycloak Identity
Provider) mais ne couvre pas le doc 13 (Mobile Expo) — il n'y a PAS d'ADR Mobile dédié. Idem ADR-015
existe (ML Stack) mais ne couvre pas le doc 15 (Security Hardening).

### 26.3 Drifts P1 corrigés (alignement gouvernance)

- **`AGENTS.md`** : ajout `verify:repo` + `docs:sync:check` dans validation commands ; ajout
  référence `DOCUMENTATION-MAP.md` en étape 4 mandatory reading order (graphify devient étape 5 avec
  mention « may be stale »).
- **`CLAUDE.md`** : ajout référence `DOCUMENTATION-MAP.md` étape 5 first checks.
- **`.github/copilot-instructions.md`** : ajout `DOCUMENTATION-MAP.md` étape 4 mandatory context ;
  mention « check date in header — may be stale » pour graphify.
- **`.cursor/rules/ai-governance.mdc`** : ajout `DOCUMENTATION-MAP.md` dans source-of-truth docs.
- **`README.md`** : enrichi (+30 lignes) avec lien direct vers carte, MAINTENANCE, ADRs, section
  souveraineté numérique explicite, statut 27/27 docs livrés.
- **`graphify-out/GRAPH_REPORT.md`** : bandeau **STALE** en en-tête documentant les 7 commits
  postérieurs au snapshot 2026-05-05.
- **`MAINTENANCE.md` §9** : `DOCUMENTATION-MAP.md` ajoutée **en tête** du tableau « Liens canoniques
  » (sujet : « Carte de toute la doc »).

### 26.4 Drifts P0 à arbitrer (orphelins non encore traités)

**2 docs orphelins de 2 908 lignes** :

- `docs/01-fondations-monorepo-outillage-dx.md` (1 286 lignes)
- `docs/02-infrastructure-docker-services-donnees.md` (1 622 lignes)

Superposés par `01-CAHIER-DES-CHARGES.md` et `02-ARCHITECTURE-GLOBALE.md` (canoniques dans
00-README-INDEX). 3 options documentées dans `DOCUMENTATION-MAP.md` §7 (P0 #2) :

- **A.** Déplacer vers `docs/_archive/` avec README explicatif
- **B.** Supprimer (`git rm`)
- **C.** Renommer en `*-LEGACY.md` pour conservation visible

→ **À arbitrer avec l'utilisateur** avant action — non bloquant pour la chaîne verify:repo.

### 26.5 Drifts P1/P2 différés (V2 ou plus tard)

- **ADR-013 Mobile Expo** manquant → à créer V2
- **ADR pour doc 15 Security Hardening** manquant → à créer V2 (actuellement le slot ADR-015 est
  utilisé pour ML, pas sécurité)
- **Backfill `Complète :` sur ADRs 001-013** (format ancien sans graphe explicite) → reporté V2
- **Re-génération graphify** (`graphify update .`) → à exécuter manuellement
- **Extension `docs-sync-check.mjs`** pour vérifier plus de refs (chaque ADR cite son doc parent,
  chaque doc 16-26 référencé, format ADR uniforme, etc.) → reporté V2

### 26.6 État final post-corrélation

- ✅ 27/27 docs canoniques livrés
- ✅ 25/25 ADRs livrés (2 ADRs manquants identifiés et documentés — mobile + security — non
  bloquants V1)
- ✅ 6 fichiers gouvernance alignés sur les **5 invariants partagés** (cf. `DOCUMENTATION-MAP.md`
  §2.2)
- ✅ 1 carte centrale `DOCUMENTATION-MAP.md`
- ⚠️ 2 orphelins identifiés mais conservés (décision utilisateur requise pour suppression/archive)
- ⚠️ graphify snapshot stale 11 jours mais signalé en en-tête

### 26.7 Cross-références

- `MAINTENANCE.md §9` : `DOCUMENTATION-MAP.md` en tête liens canoniques
- `README.md` : lien direct + statut 27/27 docs
- 4 fichiers gouvernance IA : tous référencent `DOCUMENTATION-MAP.md` dans leur mandatory reading
  order
- Ce document devient le **6ᵉ point d'entrée obligatoire** pour tout assistant IA opérant sur le
  repo (après CHANGELOG, 00-README-INDEX, MAINTENANCE, AGENTS, et lui-même).

`pnpm run verify:repo` ✅ vert.

## 27. CI/CD — Implémentation effective des workflows (PROMPT 2.2, mai 2026)

Première **implémentation YAML** de la spec CI/CD documentée doc 16

- ADR-016. Les 13 corrections identifiées au CHANGELOG §14.2 sont appliquées, et 4 nouveaux
  workflows livrés en complément de `ci.yml`.

### 27.1 Livrables

| Fichier                                      | Type             | Rôle                                                         |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `.nvmrc`                                     | racine           | Pin Node 24 (lu par setup-node-pnpm)                         |
| `.github/actions/setup-node-pnpm/action.yml` | composite action | Factorisation checkout+pnpm+node+install (40 lignes)         |
| `.github/workflows/ci.yml`                   | workflow         | **Pipeline principal — 7 jobs parallèles** (rewrite complet) |
| `.github/workflows/cd-staging.yml`           | workflow         | Déploiement K3s staging (sur succès CI sur main)             |
| `.github/workflows/release.yml`              | workflow         | Build + GitHub Release sur tag v*.*.\*                       |
| `.github/workflows/codeql.yml`               | workflow         | Analyse statique CodeQL TS/JS + Python                       |
| `.github/dependabot.yml`                     | config           | 7 écosystèmes (npm/pip×3/docker/gh-actions×2)                |

### 27.2 ci.yml — 7 jobs parallèles

1. **`lint`** — ESLint + Prettier + Typecheck + `verify:repo` (10 min)
2. **`test-backend`** — Jest + services `postgis/postgis:18-3.6`, `redis:8.6.3-alpine`,
   `rabbitmq:4.2.4-management-alpine` (15 min)
3. **`test-ai`** — Pytest matrix [ai-service, anticorruption-service], Python 3.14 (10 min)
4. **`test-frontend`** — Jest + RTL sur citizen + admin + governance + packages/ui (12 min)
5. **`test-e2e`** — Playwright mock auth, cache browsers, build citizen
   - admin avant tests (20 min)
6. **`build`** — Docker matrix 11 services → GHCR (push main uniquement, 20 min)
7. **`security`** — Trivy + Semgrep + gitleaks + pnpm audit + Bandit (15 min)

**Cache multi-niveaux** : pnpm store (natif setup-node), Playwright browsers (actions/cache keyed
pnpm-lock), pip wheels (natif setup-python), Docker buildx (`cache-from: type=gha`).

### 27.3 Décision souveraineté : pas de Snyk

Le PROMPT 2.2 initial mentionnait « Snyk packages » dans le job security. **Remplacé par stack
open-source équivalente** conforme à ADR-016 (qui interdit explicitement Snyk SaaS US) :

| Couverture            | Outil retenu                                | Remplace         |
| --------------------- | ------------------------------------------- | ---------------- |
| CVEs filesystem       | Trivy (Aqua, Apache 2.0)                    | Snyk Code        |
| Static analysis OWASP | Semgrep (returntocorp, LGPL 2.1)            | Snyk Code        |
| Secrets git history   | gitleaks (MIT)                              | Snyk Code        |
| CVEs npm deps         | `pnpm audit` (built-in)                     | Snyk Open Source |
| CVEs pip deps         | Bandit + (pip-audit dans workflow security) | Snyk Open Source |

Couverture équivalente, 0 dépendance SaaS US, 0 coût.

### 27.4 13 corrections appliquées (cf. CHANGELOG §14.2)

|   # | Avant                                | Après                                             |
| --: | ------------------------------------ | ------------------------------------------------- |
|   1 | `postgres:16-alpine`                 | `postgis/postgis:18-3.6`                          |
|   2 | `redis:7-alpine`                     | `redis:8.6.3-alpine`                              |
|   3 | `rabbitmq:3.13-alpine`               | `rabbitmq:4.2.4-management-alpine`                |
|   4 | `PYTHON_VERSION: "3.12"`             | Python 3.14                                       |
|   5 | `POSTGRES_USER: nina_user`           | `nina_admin` (aligné `init-db.sql`)               |
|   6 | `pnpm db:push`                       | `prisma migrate deploy`                           |
|   7 | Tests Python : ai-service seul       | + anticorruption-service (matrix)                 |
|   8 | 0 cache Playwright                   | `actions/cache@v4` keyed pnpm-lock                |
|   9 | 0 SARIF upload                       | `github/codeql-action/upload-sarif`               |
|  10 | 1 fichier `ci.yml` monolithique      | 7 jobs propres + 4 workflows annexes              |
|  11 | 0 Dependabot                         | `.github/dependabot.yml` 7 écosystèmes + grouping |
|  12 | 0 composite action (duplication × 4) | `.github/actions/setup-node-pnpm`                 |
|  13 | 0 CodeQL                             | `.github/workflows/codeql.yml` (TS + Python)      |

### 27.5 cd-staging.yml — déploiement K3s

- Déclencheur : `workflow_run` succès du CI sur `main`
- Concurrence : `cancel-in-progress: false` (jamais annuler un déploiement)
- Environnement GitHub : `staging` avec URL `vars.STAGING_DOMAIN`
- Helm upgrade `--install` `nina-aes/values-staging.yaml` (atomic, wait, 15 min timeout)
- Smoke test `/api/health` avec retry 10× 15s
- Détection automatique « chart absent » → message d'erreur explicite vers doc 20

### 27.6 release.yml — SemVer automatisé

- Déclencheur : `push` tag `v*.*.*`
- Job 1 : build matrix 11 services → ghcr.io avec tags
  `version + version-major.minor + major + stable`
- Job 2 : génération CHANGELOG depuis le tag précédent (git log oneline) + création GitHub Release
  via `gh release create`
- Détection auto pré-release pour `v0.*` ou `-alpha/-beta/-rc`

### 27.7 codeql.yml — analyse sémantique

- Déclencheurs : push main + PR main + cron hebdomadaire (lundi 03:00 UTC)
- Matrix : `javascript-typescript` + `python`
- Querysets : `security-extended` + `security-and-quality`
- Paths-ignore : node_modules, .turbo, dist, build, coverage, playwright-report, graphify-out,
  data/\_raw, docs
- Upload SARIF vers Security tab GitHub (require Advanced Security payant pour les repos privés —
  fallback artefact sinon)

### 27.8 dependabot.yml — 7 écosystèmes

| Eco            | Path                               | Limit | Groupes                                                |
| -------------- | ---------------------------------- | ----: | ------------------------------------------------------ |
| npm            | `/`                                |     8 | prisma, next-react, nestjs, opentelemetry, dev-tooling |
| pip            | `/services/ai-service`             |     4 | ml-stack, fastapi-stack                                |
| pip            | `/services/anticorruption-service` |     4 | —                                                      |
| pip            | `/scripts`                         |     2 | —                                                      |
| docker         | `/infrastructure/docker`           |     4 | —                                                      |
| github-actions | `/`                                |     4 | actions-core, docker-actions, security-actions         |
| github-actions | `/.github/actions/setup-node-pnpm` |     2 | —                                                      |

- Schedule weekly lundi 06:00 `Africa/Bamako`
- Ignore majeurs Prisma + Next/React + PostGIS (review manuelle)
- Commit prefix `deps(scope)`
- Labels automatiques `dependencies` + écosystème

### 27.9 Validation locale

```powershell
# Linter les workflows
docker run --rm -v ${PWD}:/repo rhysd/actionlint -color

# Rejouer un workflow en local via act
act -W .github/workflows/ci.yml pull_request

# Vérifier le yaml de dependabot
docker run --rm -v ${PWD}:/repo node:24-alpine \
  sh -c "npm i -g yaml && yaml /repo/.github/dependabot.yml"
```

### 27.10 Reste à faire (gating réel)

L'implémentation est livrée mais le **gating effectif** demande :

- ⏳ Provisionner les secrets GitHub `K3S_STAGING_KUBECONFIG` + variable `STAGING_DOMAIN`
- ⏳ Créer environnement `staging` dans Settings → Environments
- ⏳ Activer branch protection main avec required checks (lint, test-backend, test-ai,
  test-frontend, security)
- ⏳ Activer GitHub Advanced Security pour upload SARIF (repo privé) OU fallback artefact (repo
  public)
- ⏳ Premier déploiement K3s staging nécessite le Helm chart (doc 20)
- ⏳ Activer Dependabot dans Settings → Security → Code security

### 27.11 Validation

- `pnpm run verify:repo` : ✅ data + schemas + docs sync.
- `actionlint` : à exécuter avant merge (pas dans `verify:repo`).
- `.github/workflows/ci.yml` ancien (200+ lignes monolithiques) : remplacé in-place.

### 27.12 Cross-références

- `docs/16-CICD-GITHUB-ACTIONS.md` reste la spec architecturale ; ce commit livre l'implémentation
  correspondante.
- `docs/adr/ADR-016-cicd-github-actions.md` reste la décision ; aucune modification (souveraineté
  Snyk → Trivy+Semgrep+gitleaks déjà actée).
- `docs/CHANGELOG.md §14.2` : les 13 écarts ci.yml historique sont désormais corrigés (tableau §27.4
  ci-dessus).

## 28. Hooks Git + Conventional Commits (PROMPT 2.3, mai 2026)

Complétion de la configuration Husky qui était à l'état partiel (pre-commit + commit-msg basiques
mais sans lint-staged, sans pre-push, sans Python, prepare script bogué). Ferme le gap CHANGELOG §2
« Husky non configuré ».

### 28.1 Livrables

| Fichier                    | Type            | Rôle                                                               |
| -------------------------- | --------------- | ------------------------------------------------------------------ |
| `.husky/pre-commit`        | hook (rewrite)  | lint-staged + typecheck filtered + pnpm audit + verify:repo        |
| `.husky/commit-msg`        | hook (refactor) | commitlint avec messages d'aide enrichis                           |
| `.husky/pre-push`          | hook (nouveau)  | turbo test + build filtered `[HEAD~1]`                             |
| `commitlint.config.js`     | config (extend) | +30 scopes (sigac, sgogt, data, mali, etc.) + type `data`          |
| `package.json` lint-staged | config          | +Python (ruff) +Prisma +CSS/SCSS, séparation mjs/cjs               |
| `package.json` prepare     | script (fix)    | `husky` simple (avant : `cd .. && husky nina-aes-platform/.husky`) |
| `CONTRIBUTING.md`          | doc (nouveau)   | guide contribution complet 11 sections                             |

### 28.2 Hook pre-commit — 4 étapes < 30 s

```
1. 🧹 lint-staged       → eslint --fix + prettier --write + ruff (stagés seulement)
2. 🔍 typecheck         → turbo run check-types --filter=...[HEAD]
3. 🔒 pnpm audit        → CVEs CRITICAL/HIGH sur deps prod
4. 📋 verify:repo       → invariants Mali + JSON Schemas + cross-refs docs
```

**Décision** : `pnpm audit signatures` n'existe pas (spécifique npm). Remplacé par
`pnpm audit --audit-level=high --prod` + integrity hashes natifs de `pnpm-lock.yaml`. Couverture
équivalente.

### 28.3 Hook pre-push — 2 étapes < 3 min

```
1. 🧪 turbo run test --filter=...[HEAD~1]
2. 🏗️  turbo run build --filter=...[HEAD~1]
```

**Décision** : pas de Playwright E2E en pre-push (lent, tourne en CI uniquement). Filter `[HEAD~1]`
cible les workspaces ayant changé depuis l'avant-dernier commit local.

### 28.4 commitlint.config.js — extension complète

- **Types autorisés** : +`data` (pour `data/mali/`, `schemas/`, seeds)
- **Scopes services** (12) : ajout `sigac`, `sgogt` (alias pour anticorruption-service + module
  SGOGT du governance-service)
- **Scopes apps** (6) : `citizen`, `admin`, `gov`, `mobile`, `kiosk`, `ussd`
- **Scopes packages** (10) : ajout `auth-pkg`, `api-client`, `i18n`, `logger`, `test-fixtures`
- **Scopes transverse** (15) : ajout `docker`, `k3s`, `biometrics`, `data`, `mali`, `security`,
  `observability`, `testing`, `backup`, `docs`
- **Règles** : `type-case` lower-case strict, `header-max-length` 100, `body-max-line-length` 100
  warning, `subject-empty` interdit, `subject-full-stop` interdit, `scope-empty` autorisé

Total : **45 scopes** + 12 types autorisés.

### 28.5 lint-staged — 4 patterns

| Pattern                         | Outils                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `*.{ts,tsx,js,jsx,mjs,cjs}`     | `eslint --fix --max-warnings=0` + `prettier --write`      |
| `*.py`                          | `ruff check --fix --exit-non-zero-on-fix` + `ruff format` |
| `*.{json,md,yml,yaml,css,scss}` | `prettier --write`                                        |
| `*.prisma`                      | `prettier --write --plugin=prisma`                        |

**Prérequis Python** : ruff doit être sur le PATH (installé via venv des services FastAPI).
Documenté dans `CONTRIBUTING.md §4`.

### 28.6 prepare script — fix critique

Avant (bogué) :

```json
"prepare": "cd .. && husky nina-aes-platform/.husky"
```

Après (Husky 9 standard) :

```json
"prepare": "husky"
```

L'ancienne forme supposait un parent layout invalide. Husky 9 trouve automatiquement `.husky/` dans
le cwd.

### 28.7 CONTRIBUTING.md — 11 sections

1. Setup initial (5 min)
2. Hooks Git installés (tableau)
3. Conventional Commits (grammaire + types + scopes + exemples)
4. Lint-staged (quoi se passe par pattern)
5. Workflow type d'une feature (PR steps)
6. Conventions de code (TS / Python / Markdown)
7. Tests — quoi attendre par PR
8. Documentation — quoi mettre à jour avec quoi (lien MAINTENANCE §3)
9. Sécurité — règles non négociables
10. Bypass d'urgence (à éviter)
11. Pour aller plus loin

### 28.8 Cross-références

- `MAINTENANCE.md §3` : reste hub central pour « Quand modifier quoi » (CONTRIBUTING.md §8 y
  renvoie)
- `docs/DOCUMENTATION-MAP.md §2.2` : 5 invariants partagés (CONTRIBUTING reste plus opérationnel,
  DOCUMENTATION-MAP reste plus structurel)
- `docs/16-CICD-GITHUB-ACTIONS.md` : workflows GitHub Actions référencés depuis CONTRIBUTING.md §5 «
  workflow type »

### 28.9 Reste à faire (activation)

- ⏳ Première installation : `pnpm install` (déclenche `prepare → husky`)
- ⏳ Vérifier `git config core.hooksPath` retourne `.husky/_`
- ⏳ Tester un commit invalide en local pour valider que commit-msg bloque correctement
- ⏳ Si prettier-plugin-prisma manque : `pnpm add -Dw prettier-plugin-prisma`
- ⏳ Si ruff manque : activer venv `services/ai-service/.venv` ou installer globalement
  (`pip install ruff` sur le PATH)

### 28.10 Validation

- `pnpm run verify:repo` : ✅ data + schemas + docs sync.
- Les hooks sont effectivement réécrits (lecture des fichiers confirme).
- `commitlint.config.js` reste valide (extends conventional + rules).

Ce commit ferme le gap connu **« Husky non configuré »** documenté dans CHANGELOG §2 /
00-README-INDEX §1 dernière ligne du tableau « Husky + hooks pre-commit ⚠️ Présent mais à configurer
fully ».

## 29. HashiCorp Vault — Setup complet + clients TS/Python (PROMPT 2.4, mai 2026)

Implémentation effective de la couche secrets management documentée doc 15 §4 (existante) + ADR-019
§17.4 (rotation). Vault 1.20 était déjà actif en dev mode dans docker-compose (cf. §9.5) mais sans
policies, sans seed, sans client applicatif.

### 29.1 Livrables

| Fichier                                              | Type               | Rôle                                                                                                  |
| ---------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `infrastructure/vault/vault-init.sh`                 | shell (idempotent) | Active 5 engines, applique 5 policies, configure AppRole pour 3 services                              |
| `infrastructure/vault/policies/identity-service.hcl` | HCL policy         | Lecture kv/database/identity-app + lookup-self                                                        |
| `infrastructure/vault/policies/auth-service.hcl`     | HCL policy         | Lecture jwt/private + transit/sign/jwt-signing-rs256                                                  |
| `infrastructure/vault/policies/ai-service.hcl`       | HCL policy         | Lecture kv/ai + database/creds/ai-readonly UNIQUEMENT                                                 |
| `infrastructure/vault/policies/admin.hcl`            | HCL policy         | R/W kv + database + transit (sauf sigac-whistleblower)                                                |
| `infrastructure/vault/policies/auditor.hcl`          | HCL policy         | READ-ONLY metadata + audit logs, deny tout secret                                                     |
| `infrastructure/vault/seed-secrets.sh`               | shell (dev)        | Pré-remplit 10 secrets : JWT RS256, DB×11, Africa's Talking, Keycloak, MinIO, SIGAC, BCID-AES, backup |
| `infrastructure/vault/rotate-secrets.sh`             | shell              | Rotation Transit + Postgres root + AppRole secret_id                                                  |
| `infrastructure/k8s/cronjobs/vault-rotation.yaml`    | K8s CronJob        | Schedule trimestriel (jan/avr/jul/oct) + rollout restart services                                     |
| `packages/vault-client/`                             | TS workspace       | Client NestJS — AppRole/token/k8s + cache TTL + auto-renew                                            |
| `packages/vault-client/src/__tests__/client.test.ts` | tests              | Mocks fetch — login, cache, sign/verify                                                               |
| `services/ai-service/src/vault.py`                   | Python module      | Client hvac équivalent — context manager, thread renew, hash thread-safe                              |
| `services/ai-service/requirements.txt`               | deps               | +`hvac>=2.4.1`                                                                                        |
| `services/anticorruption-service/requirements.txt`   | deps               | +`hvac>=2.4.1` (réutilise vault.py)                                                                   |
| `docs/security/vault-usage.md`                       | doc                | Guide opérationnel 9 sections + cheatsheet                                                            |
| `Makefile`                                           | cibles             | +`vault-seed`, +`vault-rotate`, +`vault-bootstrap`, refonte `vault-init`                              |

### 29.2 Décisions clés

**Vault 1.20** (pas 1.18 comme dans PROMPT 2.4) pour rester aligné avec docker-compose.dev.yml +
CHANGELOG §9.5.

**5 engines activés** :

- `kv-v2` (`kv/`) — secrets génériques avec versioning
- `pki` (`pki/`) — CA interne mTLS (cf. doc 15 §4.2)
- `database` (`database/`) — credentials Postgres dynamiques 24h
- `transit` (`transit/`) — chiffrement/signature avec clé in-Vault
- `totp` (`totp/`) — MFA agents CTDEC

**5 policies HCL** avec **deny explicites** (defense-in-depth) :

| Policy             | Audience    | Privilèges clés                                        |
| ------------------ | ----------- | ------------------------------------------------------ |
| `identity-service` | service     | read kv/identity + database/identity-app               |
| `auth-service`     | service     | read jwt/private + transit/sign/jwt-rs256              |
| `ai-service`       | service     | read kv/ai + database/ai-readonly (deny tout autre)    |
| `admin`            | humain MFA  | R/W kv + database + transit (sauf sigac-whistleblower) |
| `auditor`          | OCLEI/ANSSI | metadata only + audit logs (deny data)                 |

**3 méthodes auth** supportées :

- `token` (dev avec `nina-dev` ou production root one-shot)
- `approle` (recommandé services, TTL 24h max 72h)
- `kubernetes` (ServiceAccount mapping pour K3s prod)

**Auto-renew à 80 % TTL** : les clients TS et Python renouvellent automatiquement leur token avant
expiration via thread daemon (Python) ou setTimeout unref (TS).

**Cache mémoire TTL 5 min par défaut** sur `getSecret()` : configurable via `cacheTtlSeconds`.
`clearCache()` exposé pour invalidation post-rotation.

**Refus explicite de sigac-whistleblower decrypt** dans `admin.hcl` : seul le rôle `prosecutor`
(créé manuellement) peut déchiffrer les signalements lanceurs d'alerte (cf. ADR-023 §Note
souveraineté).

### 29.3 Rotation automatique trimestrielle (4×/an)

CronJob K3s `vault-rotation` :

- **Schedule** : `0 3 1 1,4,7,10 *` (1ᵉʳ jan/avr/jul/oct, 03:00 UTC)
- **3 actions** :
  1. Rotation `transit/keys/jwt-signing-rs256` et `aes-interop-mli`
  2. Rotation root password Postgres (`database/rotate-root/nina-postgres`)
  3. Émission nouveaux `secret_id` AppRole + rollout restart des 5 services principaux
- **NE TOUCHE PAS** à `sigac-whistleblower` (rotation manuelle par procureur pour préserver les
  signalements en attente, cf. ADR-023)
- **Alerting** : `VaultRotationFailed` via Alertmanager (cf. doc 17)

### 29.4 Souveraineté

- Stack 100 % open-source HashiCorp Vault (MPL 2.0)
- Mode air-gap-ready (pas d'appel vers vaultproject.io ou HashiCorp Cloud Platform)
- HCL policies versionnées en Git (audit ANSSI trivial)
- Sealed Secrets recommandé pour les K8s Secrets contenant les AppRole secret_id (cf. doc 20 §4.5)
- Toutes les commandes documentées avec valeurs PowerShell Windows (poste de travail étudiant)

### 29.5 Activation locale

```powershell
# 1) Vault doit tourner
pnpm docker:up

# 2) Bootstrap complet (engines + policies + AppRoles + seed)
make vault-bootstrap

# 3) Vérifier
docker exec nina-vault vault kv list kv/
docker exec nina-vault vault policy list
```

### 29.6 Reste à faire (V2)

- ⏳ Installer prettier-plugin-prisma (lint-staged glob `*.prisma`)
- ⏳ Configurer `auth/kubernetes` quand K3s prod opérationnel (doc 20)
- ⏳ Activer audit file `/vault/logs/audit.log` + Promtail shipping vers Loki (cf. doc 17 §4.5)
- ⏳ Provisionner Sealed Secret pour `vault-rotator-token` dans K8s (actuellement
  `PLACEHOLDER_REPLACE_AVEC_SEALED_SECRET`)
- ⏳ Helm chart `nina-aes` doit monter le ConfigMap `vault-rotate-script` avec le contenu réel de
  `rotate-secrets.sh` (sync CI)
- ⏳ Documenter procédure de génération + distribution Shamir 3/5 en prod (cf.
  `vault operator init -key-shares=5 -key-threshold=3`)

### 29.7 Cross-références

- `docs/15-SECURITY-HARDENING.md §4` : architecture Vault (existant)
- `docs/security/vault-usage.md` : guide opérationnel (nouveau)
- `docs/adr/ADR-019-backup-recovery-strategy.md §17.4` : rotation intégrée au DRP
- `docs/00-README-INDEX.md` : tableau état Vault passe de partiel à ✅
- `Makefile` : 6 cibles `vault-*` (vs 3 avant)

`pnpm run verify:repo` ✅ vert.

## 30. Stack monitoring complète — Prometheus + Grafana + Loki + Jaeger + Alertmanager (PROMPT 2.5, mai 2026)

Implémentation effective de la stack d'observabilité documentée doc 17

- ADR-017. La spec était architecturale ; ce commit livre les fichiers de configuration, les modules
  instrumentation NestJS + FastAPI, et 6 dashboards Grafana opérationnels.

### 30.1 Livrables

| Catégorie    | Fichier                                                   | Rôle                                                                                                            |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Compose      | `infrastructure/monitoring/docker-compose.monitoring.yml` | 10 services (Prometheus, Grafana, Loki, Promtail, Jaeger, Alertmanager, node/cadvisor/postgres/redis exporters) |
| Prometheus   | `prometheus/prometheus.yml`                               | Scrape config 11 services NestJS/FastAPI + 4 exporters infra                                                    |
| Prometheus   | `prometheus/rules/nina-aes-slo.yml`                       | **14 règles** d'alerting (SLO, capacité, sécurité, backup)                                                      |
| Loki         | `loki/loki-config.yml`                                    | Single-binary TSDB v13, retention 30j                                                                           |
| Promtail     | `promtail/promtail-config.yml`                            | Tail Docker containers `nina-*`, parse JSON Pino, redact label `nina`                                           |
| Alertmanager | `alertmanager/alertmanager.yml`                           | Routing critical→email+Slack, warning→Slack, inhibitions anti-spam                                              |
| Alertmanager | `alertmanager/templates/nina.tmpl`                        | Templates FR pour email + Slack                                                                                 |
| Grafana      | `grafana/provisioning/datasources/all.yml`                | Prometheus + Loki + Jaeger + Alertmanager avec dérived fields trace_id                                          |
| Grafana      | `grafana/provisioning/dashboards/nina.yml`                | Provider qui charge dashboards/\*.json                                                                          |
| Grafana      | `grafana/dashboards/01-overview.json`                     | Vue d'ensemble plateforme (UP/DOWN, RPS, p95, 5xx, alertes, logs)                                               |
| Grafana      | `02-identity-service.json`                                | identity-service (CRUD NINA, latences, heap, logs)                                                              |
| Grafana      | `03-ai-service.json`                                      | ai-service (corrections, score moyen, inférence p95)                                                            |
| Grafana      | `04-sigac.json`                                           | SIGAC (top 10 agents flaggés, signalements BERT, severity)                                                      |
| Grafana      | `05-postgres.json`                                        | Postgres (connexions, cache hit, tx/s, top tables)                                                              |
| Grafana      | `06-business-kpis.json`                                   | KPIs métier (corrections/jour, RDV, USSD par langue, BCID-AES)                                                  |
| Package TS   | `packages/observability/`                                 | NestJS module + Pino-Loki + OTel SDK + BusinessMetrics                                                          |
| Module Py    | `services/ai-service/src/observability.py`                | structlog + prometheus + OTel pour FastAPI                                                                      |
| Deps Py      | `services/ai-service/requirements.txt`                    | +prometheus-client, OTel SDK + instrumentations, structlog                                                      |
| Makefile     | `monitoring-{up,down,logs,reload,status}`                 | 5 nouvelles cibles                                                                                              |

### 30.2 Révision ADR-017 — Jaeger au lieu de Tempo

**Décision PROMPT 2.5** : utiliser **Jaeger all-in-one 1.62** comme backend de traces, au lieu de
**Tempo 2.7** spécifié dans ADR-017.

Cette révision est CONSCIENTE et documentée :

| Critère                    | Tempo (ADR-017 V1)   | Jaeger (PROMPT 2.5 = V2)                         |
| -------------------------- | -------------------- | ------------------------------------------------ |
| Intégration Grafana native | ✅ datasource Tempo  | ⚠️ datasource Jaeger (présent mais moins fluide) |
| Storage backend en dev     | TSDB local           | In-memory (50k spans max)                        |
| Storage backend en prod    | TSDB local ou S3     | Cassandra ou Elasticsearch requis                |
| UI dédiée                  | ❌ via Grafana Tempo | ✅ UI Jaeger riche (search, dependencies)        |
| Simplicité dev mode        | All-in-one Tempo     | All-in-one Jaeger (mémoire, démarrage 5s)        |
| OTLP gRPC ingest           | ✅ port 4317         | ✅ port 4317                                     |
| Empreinte mémoire          | ~150 MB              | ~120 MB                                          |

**Argumentaire** : pour le dev/staging, Jaeger all-in-one est plus simple (zéro storage à
provisionner, UI dédiée pour explorer). En production, Tempo reste préférable (intégration Grafana
native + storage S3-compatible souverain via MinIO). Migration prévue V3 quand le volume de traces
dépasse 50k spans/h.

**Ajout à ADR-017 V2** (à formaliser dans un commit séparé si nécessaire) : Jaeger en dev/staging,
Tempo en prod. Les 2 sont OTLP-compatibles donc le code applicatif ne change pas.

### 30.3 Instrumentation TypeScript — `@nina-aes/observability`

Nouveau workspace package qui exporte 4 primitives :

- **`ObservabilityModule.forRoot({ serviceName, env })`** — module NestJS global. À importer dans
  chaque `AppModule`. Active `nestjs-prometheus` avec defaultMetrics + labels uniformes.
- **`startOtelTracing(serviceName)`** — DOIT être appelé en première ligne de `main.ts`, AVANT tout
  import applicatif, sinon les auto-instrumentations Prisma/ioredis/http ne s'attachent pas.
- **`createPinoLogger({ serviceName, transport })`** — factory Pino structuré JSON avec **redact PII
  25 chemins** (nina, biométrie, dateNaissance, password, token, cookie, authorization). Transport
  configurable : `pretty` (dev), `loki` (staging/prod), `both` (debug local avec Loki réel).
- **`BusinessMetrics`** — service injectable exposant 19 métriques métier prédéfinies
  (`identity_citizens_validated_total`, `ai_nina_errors_detected_total`, `sigac_*`, `audit_*`,
  `correction_requests_total`, `appointments_created_total`, `vulnerability_profiles_total`,
  `ussd_sessions_total`, `aes_verify_nina_total`, `vault_rotation_failed_total`,
  `audit_merkle_chain_break_total`).

### 30.4 Instrumentation Python — `services/ai-service/src/observability.py`

Équivalent pour FastAPI :

- **`init_tracing(service_name)`** — OTel SDK + OTLP gRPC exporter + auto-instrumentations
  Requests + SQLAlchemy
- **`instrument(app)`** — `/metrics` + FastAPI middleware + traces
- **`get_logger(service_name)`** — structlog JSON avec **redact PII** récursif sur 14 champs
  (équivalent fonctionnel du Pino TS)
- **`AI_METRICS` + `SIGAC_METRICS`** — dicts de Counter/Histogram/ Gauge alignés avec les métriques
  TS pour partage des dashboards

### 30.5 14 règles d'alerting Prometheus

Groupées en 4 familles :

| Groupe                | Règles                                                                                                          | Sévérités              |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **nina-aes-slo**      | ServiceDown, HighLatencyP95, HighErrorRate5xx, NinaValidationFailureSpike, AIInferenceLatencyP99                | 2 critical + 3 warning |
| **nina-aes-capacity** | NodeHeapPressure, EventLoopLag, PostgresConnectionsHigh, PostgresSlowQueries, RedisMemoryPressure, DiskSpaceLow | 5 warning + 1 info     |
| **nina-aes-security** | AuditChainBreak, LokiIngestionDown, VaultRotationFailed                                                         | 3 critical             |
| **nina-aes-backup**   | BackupJobFailed, MinIOReplicationLag                                                                            | 1 critical + 1 warning |

Chaque règle référence un `runbook` dans `docs/observability/RUNBOOK.md` (à rédiger ; doc 17 §4.8
fournit le template).

### 30.6 Alertmanager — routing par sévérité (3 destinations)

- **critical** → email `ops@nina-aes.uqar.ca` + `ciso.ctdec@gouv.ml` + Slack `#nina-alerts` (HTML
  email + Slack avec runbook lien)
- **security/backup** → email CISO + DPO direct (séparé du flux op)
- **warning** → Slack seul (`#nina-alerts`)
- **info** → null receiver (tracking dashboard only)

**Inhibitions** : `ServiceDown` inhibe `HighLatencyP95` et `HighErrorRate5xx` du même service (cause
racine). `LokiIngestionDown` inhibe les warnings dépendants. Templates en français dans
`templates/nina.tmpl`.

### 30.7 Souveraineté

Tout open-source, mode air-gap-ready :

- Stack LGTM Grafana Labs (AGPL/Apache 2.0)
- Jaeger CNCF (Apache 2.0)
- Alertmanager Prometheus (Apache 2.0)
- AUCUN ping vers Grafana Cloud / Datadog / NewRelic (rejetés ADR-017)
- `analytics.reporting_enabled: false` dans loki-config.yml (pas de télémétrie vers Grafana Labs)

### 30.8 Activation locale

```powershell
# Le réseau nina-network doit exister (créé par pnpm docker:up)
make docker-up
make monitoring-up

# Vérifier les targets Prometheus
make monitoring-status

# Ouvrir Grafana
Start-Process http://localhost:3001  # admin / nina-dev-only
```

### 30.9 Reste à faire

- Instrumenter les 11 services réels (chaque AppModule doit importer `ObservabilityModule.forRoot()`
  et `main.ts` appeler `startOtelTracing()`). À faire au fil du Bloc A.
- Rédiger `docs/observability/RUNBOOK.md` (14 entrées une par alerte)
- Rédiger `docs/observability/SLOs.md` (cibles chiffrées formelles)
- Provisionner le webhook Slack réel (placeholder dans alertmanager.yml)
- En prod : remplacer Jaeger all-in-one par Jaeger Collector + Cassandra OU revenir à Tempo (cf.
  ADR-017 V2 à formaliser)

### 30.10 Cross-références

- `docs/17-MONITORING-OBSERVABILITY.md` : reste la spec architecturale
- `docs/adr/ADR-017-observabilite-lgtm-stack.md` : à amender pour Jaeger dev/staging vs Tempo prod
- `docs/00-README-INDEX.md` : tableau état monitoring passe de spec à ✅
- `Makefile` : 5 nouvelles cibles `monitoring-*`

`pnpm run verify:repo` ✅ vert.

## 31. identity-service — décision de scope (PROMPT 3.1, 2026-05-24)

Audit du PROMPT 3.1 contre le code réel de `services/identity-service/` : **service à ~95 %
conforme** (27 fichiers, ~1 400 lignes, modules `citizen` / `correction` / `location` / `health`
tous présents avec pipelines AI + SIGAC + RabbitMQ + cache Redis + soft delete + verrou optimiste).

### 31.1 Endpoints reportés (non implémentés délibérément)

| Endpoint demandé par PROMPT 3.1      | Statut     | Reporté à       | Justification                                                                                          |
| ------------------------------------ | ---------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/citizens/:id/fiche-pdf` | ❌ reporté | doc 10 + PROMPT | `document-service` est encore une coquille (seul `modules/health/` existe). Pas de PDF/QR à proxyfier. |
| `GET /api/v1/citizens/:id/history`   | ❌ reporté | doc 09 + PROMPT | `audit-service` est encore une coquille (seul `modules/health/` existe). Pas d'API Merkle à proxyfier. |

**Pourquoi reporter plutôt qu'ajouter un proxy 503/501** : éviter du code mort qui pollue Swagger,
donne une fausse impression d'avancement et déclencherait des faux positifs en tests E2E. Le pattern
HTTP est déjà éprouvé (`correction.service.ts:252-303` → `callAi` / `callSigac` : `HttpService` +
`timeout(...)` + `catchError(fallback)`), donc l'effort marginal au moment du branchement réel est
~30 lignes par endpoint. Aucun risque technique à dérisquer maintenant.

### 31.2 Divergences PROMPT 3.1 ↔ existant à garder (décisions architecturales)

| Sujet                    | PROMPT 3.1                          | **Réel** (à garder)                                     | Raison                                                                                    |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Recherche fuzzy citoyens | Elasticsearch + phonetic plugin     | **PostgreSQL trigram (GIN)**                            | Volume CTDEC < 1 M lignes — fallback suffisant, marqué _Hors scope V1_ dans le service.   |
| Audit des mutations      | Appel HTTP direct à `audit-service` | **Event-driven RabbitMQ** (`citizen.*`, `correction.*`) | Découplage propre, `audit-service` consomme — meilleure pattern.                          |
| Validation des DTOs      | « Zod » (cf. prompt)                | **`class-validator` + `class-transformer`**             | Convention NestJS standard, déjà en place partout dans le monorepo.                       |
| Paramètre pagination     | `limit`                             | **`pageSize`**                                          | Cohérence avec autres services (à confirmer au moment de la doc 12 frontend integration). |

### 31.3 Bonus déjà présents (au-delà du PROMPT 3.1)

- `ThrottlerModule` 100 req/min/IP (anti-bruteforce sur lectures NINA)
- Verrou optimiste `version++` sur `Citizen` (anti-write-skew agent ↔ correction)
- Allowlist des champs corrigeables (`firstName`, `lastName`, `profession`, `maritalStatus`) dans
  `correction.service.ts:187` — empêche un agent d'altérer `nina` ou `birthDate` via le workflow
  correction (mutations critiques restent ADMIN-only via `PUT /citizens/:id`)
- Mode `MOCK_EXTERNAL_SERVICES=true` pour dev/CI sans `ai-service` ni `anticorruption-service`
- Cache invalidation pattern (`citizen:nina:*`) après chaque update / soft delete
- Trois endpoints health : `/health` (complet), `/health/live` (liveness K8s), `/health/ready`
  (readiness sans externes optionnels)

### 31.4 À faire au branchement réel (rappel pour doc 09 et doc 10)

Quand `audit-service` exposera `GET /api/v1/events?entityType=citizen&entityId=…` (doc 09 + ADR-007)
et `document-service` exposera `GET /api/v1/documents/fiche/:citizenId` retournant un PDF signé (doc
10 + ADR-008), **ajouter les 2 proxys dans le PR du service cible**, pas dans un PR séparé
d'identity-service — évite la dette "proxy en attente d'implémenté".

### 31.5 Cross-références

- `docs/07-BACKEND-IDENTITY-SERVICE.md` : spec canonique (laisse la mention des 2 endpoints, ils
  reviendront)
- `docs/09-BACKEND-AUDIT-SERVICE.md` : à compléter avec section "proxy depuis identity-service"
- `docs/10-BACKEND-DOCUMENT-SERVICE.md` : à compléter avec section "proxy depuis identity-service"
- `services/identity-service/README.md` : déjà honnête (ne liste pas les endpoints non implémentés)
  — pas de modification
