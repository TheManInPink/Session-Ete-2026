# ADR-031 — Couture de données frontend : hooks `@react`, bascule mock↔live, BFF tokens httpOnly

## Statut

Accepté — 2026-06-17

## Contexte

PROMPT 5.1 demande de connecter les écrans Next.js aux APIs via le gateway. À l'ouverture du
chantier, la réalité du dépôt dépassait le brief : les 3 apps, `@nina-aes/api-client` (fait-main,
`fetch`+Zod, refresh JWT, retry, correlation-id), `@nina-aes/i18n`, `@nina-aes/auth` et les
providers React Query **existaient déjà**. Le vrai manque n'était pas le client mais **la couture
absente entre l'UI (rendue sur mocks) et le client** : aucune instanciation, aucune couche de hooks,
aucun écran réellement branché.

Deux contraintes ont pesé :

1. **Sécurité d'un système d'identité** : le token d'accès vit dans un cookie **httpOnly**
   `access_token` (jamais lisible en JS) ; un signalement anti-corruption doit rester **strictement
   anonyme** ; servir de fausses identités en production serait catastrophique.
2. **Poste étudiant Windows** : impossible de lancer en permanence les 15 services ; les démos
   doivent tourner sans `docker:up`.

Le brief suggérait une **génération OpenAPI** (orval). Écarté : l'agrégateur du gateway construit
son spec en interrogeant les services au runtime et **supprime silencieusement** ceux qui sont
éteints (client amputé sans alerte), et le codegen runtime ferait **perdre** la logique durcie déjà
auditée (refresh, taxonomie d'erreurs, validation Zod fail-closed). Décision validée par
l'utilisateur : **garder le client fait-main + ajouter une couche de hooks** (chemin « 1/1/1 »).

## Décisions

### 1. Hooks React Query au sous-chemin `@nina-aes/api-client/react`

Les hooks (`useCitizenByNina`, `useSubmitCorrection`, `useCenterAvailability`, `useSubmitAlert`,
…) + `ApiClientProvider`/`useApiClient` + une fabrique de query-keys vivent dans un **sous-chemin**
dédié ; `react` et `@tanstack/react-query` sont des **peerDependencies optionnelles**.

- **Pourquoi** : le cœur reste **framework-agnostique** (consommable par USSD, scripts Node, mobile)
  tout en exposant des hooks « prêts à l'emploi » côté React, comme demandé par PROMPT 5.1.
- **Conséquence** : `jsx: react-jsx` ajouté au tsconfig du package ; les écrans importent depuis
  `@nina-aes/api-client/react`, jamais le client brut.

### 2. Bascule données **mock ↔ live** + kill-switch production

`resolveApiMode()` lit `NEXT_PUBLIC_NINA_API_MODE` (`mock`|`live`), avec repli sur le drapeau
historique `NEXT_PUBLIC_DEMO_MODE` et défaut `mock`. `createMockApiClient()` renvoie des fixtures
**déterministes validées par les mêmes schémas Zod** que le client réel (fail-closed même en démo).

- **Pourquoi** : l'app reste lançable et démontrable sans backend ; les fixtures ne peuvent pas «
  dériver » de la forme réelle sans faire échouer `.parse()`.
- **Garde-fou** : `assertApiModeSafe()` (appelé au boot par `instrumentation.ts`) **échoue** si
  `NODE_ENV=production` et (mode `mock`) **ou** (URLs gateway en `localhost`). Fail-closed contre la
  fuite de fausses identités et la mauvaise configuration silencieuse.

### 3. Appels authentifiés navigateur via **BFF** (token jamais en JS)

En mode live, les appels authentifiés du navigateur passent par un proxy same-origin
`apps/citizen/app/api/v1/[...path]/route.ts` qui lit le cookie httpOnly et **injecte
`Authorization: Bearer` côté serveur**. Le client navigateur n'a **pas** de `getAccessToken`.

- **Pourquoi** : anti-XSS — le token ne touche jamais le JavaScript ; on ne fait pas confiance au
  client pour s'auto-attribuer une identité (en-tête `Authorization` entrant ignoré).
- **Détail d'URL** : les clients utilisent des chemins **absolus** (`/api/v1/…`) ; or un chemin
  absolu passé à `new URL(path, base)` **remplace** le pathname de la base. Le BFF vit donc à la
  racine `/api/v1/*` et `baseUrl` doit être une **origine** (invariant documenté dans `buildUrl`).
  Le BFF **rejette explicitement** toute traversée de chemin (`.`/`..`) — défense en profondeur.

### 4. Signalement anonyme SIGAC — transport **séparé sans cookie**

Le client anonyme vise le **gateway public en direct** avec `credentials: 'omit'` (option ajoutée au
`HttpClient`), **jamais** via le BFF/cookies : `createBrowserApi()` compose
`{ ...authenticated, sigac: anonymous.sigac }`. La mutation `useSubmitAlert` porte `meta.anonymous`
; le `MutationCache` global **ne redirige pas** vers `/login` sur 401.

- **Pourquoi** : garantir l'anonymat au niveau **transport** (aucun cookie ne part) et éviter qu'un
  401 ne trahisse le lanceur d'alerte par une redirection vers la connexion.

### 5. Modèle de vue `CitizenFiche` (découplage source ↔ écran)

`ficheFromCitizen` / `ficheFromDemo` produisent un modèle de présentation unique consommé par PC-02.
Les **codes** structurels (région/cercle/commune, lettre de contrôle) sont dérivés du NINA via
`parseNina()`, donc indépendants de la source.

- **Pourquoi** : la bascule mock → réel ne change que la couche données, pas la vue.

## Conséquences

- Les écrans citoyens importent leurs hooks depuis `@nina-aes/api-client/react`.
- **Tranche 1 (app citizen) livrée + vérifiée** — les 5 écrans citoyen branchés :
  - PC-02 (lecture `fetchCitizenFiche`), PC-03 (`useSubmitCorrection`), PC-04
    (`useCenterAvailability` + `useCreateAppointment`), PC-05 (dashboard via
    `fetchMyCorrections`/`fetchMyAppointments`), PC-06 (anonyme `useSubmitAlert`).
  - Vérif : typecheck api-client+citizen, lint citizen, **e2e citizen 13/13** (mock), `verify:repo`.
  - Revue adversariale du socle (16 agents) → 3 correctifs (anti-traversée BFF, 401 anonyme via
    `MutationCache`+`meta`, kill-switch localhost prod) + 3 clarifications doc.
- La doc `12-FRONTEND-INTEGRATION-API.md` est partiellement **aspirationnelle** (hooks décrits côté
  app, factory à 7 clients) : **le code fait foi** ; cet ADR et le CHANGELOG matérialisent l'écart.

## Limites / hors-périmètre

- **Polling temps réel PC-05** non câblé (le hook `useCorrection({ refetchInterval })` est prêt) ;
  le dashboard se rafraîchit à la navigation.
- **Apps `admin` et `governance`** : non couvertes par cette tranche (tranches suivantes — mêmes
  patterns : hooks `@react`, BFF, signature Ed25519 côté gouvernance à traiter).
- **Mode live non testé** contre un backend réel (stack non démarrée) — câblé par construction.
- **Drift-check OpenAPI** (option hybride : codegen en CI comme garde-fou anti-dérive) reporté à la
  doc 16 (CI/CD), non bloquant.
- **Drift pré-existant** : `.env.example` racine `CITIZEN_PORT=4000` alors que les apps tournent en
  4001/4002/4003 — à corriger séparément (n'affecte pas le runtime, apps lancées hors docker).
