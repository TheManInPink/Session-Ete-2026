# NINA-AES — Design System

> **Périmètre** : 3 apps Next.js (citizen / admin / governance) + mobile Expo + kiosque Electron +
> simulateur USSD. **Source de vérité** : `tokens.json` (Style Dictionary 4) — toute couleur,
> taille, ombre, durée vit ici en premier puis est dérivée vers Tailwind, CSS variables et
> bibliothèques natives. **Version** : 1.0 — Mai 2026

---

## 1. Principes directeurs

1. **Identité distinctive AES, pas du Bootstrap admin** — la palette primary (bleu profond `213°`) +
   accent (turquoise lumineux `180°`) signe visuellement le projet ; pas un seul gris neutre froid
   (saturation 4–10 % pour adoucir).
2. **Mobile-first vrai** — chaque écran est conçu d'abord à `360 px` de large (cible : téléphone
   Android bas de gamme malien), puis enrichi vers les breakpoints supérieurs.
3. **Accessibilité WCAG 2.2 AA dès la conception** — contraste ≥ 4.5:1 sur texte, 3:1 sur gros texte
   et icônes ; focus ring visible (`shadow.focus` token) ; tab order linéaire ; skip-links sur
   chaque `<main>` ; tous les composants pilotables au clavier.
4. **API-aware par défaut** — chaque composant data-aware expose des states standardisés : `loading`
   (skeleton) · `error` (message + retry) · `empty` (illustration + CTA) · `success` (donnée). Les
   `optimistic updates` sont supportés via TanStack Query mutations.
5. **Internationalisation 8 langues** anticipée : largeur fluide, pas de truncate dur, pas de texte
   dans les images, RTL prêt (même si aucune des 8 langues nationales n'est RTL — on garde la
   propriété pour compatibilité future arabe / tifinagh).
6. **Mode sombre natif, pas un afterthought** — toutes les couleurs en HSL avec variables CSS ;
   `dark:` Tailwind = swap des nuances 50↔950 + ajustement neutre.
7. **Souveraineté visuelle** — aucune icône/illustration hébergée chez un tiers commercial ; Lucide
   React (open-source) + 5 icônes custom maliennes (kola, baobab, calao, masque, étoile noire)
   dessinées en SVG inline.

---

## 2. Tokens (Part A)

Tous les tokens vivent dans `tokens.json`. Génération :

```bash
# Outil officiel : Style Dictionary 4
pnpm dlx style-dictionary build --config docs/design-system/sd.config.cjs

# Cibles produites :
#   packages/ui/src/styles/tokens.css     (variables CSS HSL)
#   packages/ui/tailwind.tokens.cjs       (extension du theme Tailwind)
#   apps/mobile/src/theme/tokens.ts       (objet TS pour React Native)
```

### 2.1 Couleurs — palette HSL 11 nuances

Chaque couleur sémantique (`primary`, `accent`, `neutral`, `success`, `warning`, `danger`, `info`)
expose 11 nuances `50 → 950`. Les 3 palettes AES (mali, burkina, niger) exposent les 3 couleurs
officielles du drapeau correspondant (cf. `tokens.json` → `color.aes.*`).

**Règles d'usage** :

- Texte body sur fond clair → `neutral.900` (contraste 17:1 sur `neutral.50`)
- Texte body sur fond sombre → `neutral.100` (contraste 16:1 sur `neutral.900`)
- CTA principal → fond `accent.500` + texte `neutral.50` (contraste 4.6:1)
- Lien dans body → `primary.600` (contraste 6.7:1 sur fond blanc)
- Bordures discrètes → `neutral.200` (clair) / `neutral.800` (sombre)
- Erreur → fond `danger.50` + bordure `danger.500` + texte `danger.900`

### 2.2 Typographie

| Token            | Famille                 | Usage                      |
| ---------------- | ----------------------- | -------------------------- |
| `family.sans`    | Inter Variable          | UI, body, labels           |
| `family.display` | Bricolage Grotesque     | Hero, H1/H2 marquants      |
| `family.mono`    | JetBrains Mono Variable | NINA, code, IDs techniques |

**Échelle modulaire** (Perfect Fourth, ratio 1.25) — 12 tailles de 12 à 96 px ; voir `tokens.json` →
`typography.size`. Hauteurs de ligne par défaut : `relaxed` (1.75) sur body texte, `tight` (1.15)
sur les Hero/H1.

### 2.3 Espacements

Échelle 4 px stricte — 14 paliers de `0` à `128 px`. Pas de demi-pixel, pas d'arrondi.

### 2.4 Ombres

6 niveaux + 1 `focus`. Saturation 0 % (gris neutre) avec opacité progressive 4 → 30 % pour rester
sobres et compatibles avec le mode sombre.

### 2.5 Rayons

7 paliers : `none · sm (4) · base (8) · md (12) · lg (16) · xl (24) · full (9999)`.

### 2.6 Motion

6 durées (75 → 500 ms) × 5 courbes (`linear · in · out · inOut · spring`). Convention :

- **Instant (75 ms)** : feedback de touch (button press, switch flick)
- **Fast (150 ms)** : hover, focus, dropdown
- **Base (200 ms)** : modal in/out, drawer
- **Slow (300 ms)** : page transitions, accordion
- **Spring** : éléments « ludiques » (toast slide-in, kanban drag drop)

**Préférence utilisateur** : tous les composants respectent `prefers-reduced-motion: reduce` en
supprimant les transitions > 100 ms.

### 2.7 Icônes

- **Lucide React** 0.470+ — bibliothèque par défaut, ~1500 icônes cohérentes avec shadcn/ui.
- **5 icônes custom maliennes** (`packages/ui/src/icons/`) :
  - `<KolaNutIcon />` — noix de kola, partage / hospitalité
  - `<BaobabIcon />` — baobab, sagesse / patrimoine
  - `<HornbillIcon />` — calao, communication
  - `<MaskIcon />` — masque dogon, identité culturelle
  - `<BlackStarIcon />` — étoile noire AES, panafricanisme

Toutes sont mono-couleur via `currentColor` + `stroke-width=1.5` (cohérent Lucide).

---

## 3. Composants de base (Part B)

> Tous les composants vivent dans `packages/ui/src/components/`, exposés par
> `packages/ui/src/index.ts`. Implémentation : Radix UI primitives + variants gérés par
> `class-variance-authority` (CVA).

Pour chaque composant ci-dessous : **Props** typées + **variants** + **tailles** + **states**
(`default · hover · focus · active · disabled · loading · error`) + **a11y** (aria-\*, keyboard
nav).

### 3.1 Atomes

| Composant      | Variants                                | Tailles                        | A11y notes                                                      |
| -------------- | --------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| **Button**     | `solid · soft · outline · ghost · link` | `xs · sm · md · lg · xl`       | `role="button"`, `aria-busy` si `loading`, `aria-disabled`      |
| **Input**      | `default · error · success`             | `sm · md · lg`                 | label associé via `htmlFor`, `aria-invalid`, `aria-describedby` |
| **Select**     | (Radix Select) — single                 | `sm · md · lg`                 | navigation flèches haut/bas, `Esc` ferme, focus trap            |
| **Combobox**   | async / sync, multi                     | `sm · md · lg`                 | `role="combobox"`, `aria-expanded`, annonce vocale du résultat  |
| **Datepicker** | range / single                          | `md`                           | navigation calendrier au clavier, `aria-label` sur cellules     |
| **Checkbox**   | `default · indeterminate`               | `sm · md`                      | `role="checkbox"`, `aria-checked` (true / false / mixed)        |
| **Radio**      | (groupe)                                | `sm · md`                      | `role="radiogroup"`, navigation flèches                         |
| **Switch**     |                                         | `sm · md`                      | `role="switch"`, `aria-checked`, label cliquable                |
| **Slider**     | range                                   | `sm · md`                      | flèches gauche/droite, Page Up/Down, Home/End, `aria-valuetext` |
| **Textarea**   | auto-resize                             | `sm · md · lg`                 | comme Input ; `maxLength` annoncé en compte à rebours           |
| **Avatar**     | image / fallback initiales / icône      | `xs · sm · md · lg · xl · 2xl` | `alt` obligatoire, fallback texte si image échoue               |
| **Badge**      | `solid · soft · outline · dot`          | `xs · sm · md`                 | `role="status"` si dynamique, sinon décoratif                   |
| **Spinner**    | (animation rotate)                      | `sm · md · lg`                 | `role="status"`, `aria-label` traduisible                       |

### 3.2 Affichage

| Composant         | Variants                            | A11y notes                                                                           |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| **Card**          | `flat · outlined · elevated`        | structure sémantique : `<article>` ou `<section>`                                    |
| **Alert**         | `info · success · warning · danger` | `role="alert"` si dynamique, sinon `role="status"`                                   |
| **Toast**         | (Sonner / Radix Toast)              | `role="status"` (info/success) ou `role="alert"` (danger), auto-dismiss désactivable |
| **Tooltip**       | (Radix Tooltip)                     | apparaît au focus clavier (pas seulement hover), Esc ferme                           |
| **Popover**       | (Radix Popover)                     | focus trap, restitué à l'élément déclencheur à la fermeture                          |
| **Skeleton**      | `text · circle · rectangle · card`  | `aria-busy="true"`, masqué aux lecteurs d'écran (`aria-hidden`)                      |
| **Progress**      | `bar · circle`                      | `role="progressbar"`, `aria-valuenow`, `aria-valuemin/max`                           |
| **EmptyState**    | (illustration + titre + CTA)        | titre H2/H3 selon contexte, CTA focusable                                            |
| **ErrorBoundary** | (capture React errors)              | retry button focus auto, message lisible, `aria-live="polite"`                       |

### 3.3 Conteneurs / navigation

| Composant      | Variants                         | A11y notes                                                          |
| -------------- | -------------------------------- | ------------------------------------------------------------------- |
| **Dialog**     | `sm · md · lg · xl · fullscreen` | focus trap, restoration focus, `Esc`, scroll lock body              |
| **Drawer**     | `left · right · top · bottom`    | focus trap, swipe close mobile                                      |
| **Tabs**       | `default · pills · underline`    | flèches gauche/droite, Home/End, `role="tab"`                       |
| **Accordion**  | single / multiple                | flèches haut/bas, `aria-expanded`                                   |
| **Breadcrumb** | (séparateur custom)              | `nav aria-label="breadcrumb"`, `aria-current="page"` sur le dernier |
| **Stepper**    | linéaire / non-linéaire          | `role="list"`, étape courante via `aria-current="step"`             |
| **Pagination** | classique / cursor               | flèches gauche/droite, Page Up/Down                                 |

### 3.4 Données tabulaires

| Composant    | Features                                                              | A11y notes                                                          |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Table**    | tri colonnes, sticky header, zebra optionnel                          | `<th scope="col">`, `aria-sort` sur colonnes triables               |
| **DataGrid** | filtres avancés, sélection multi, actions en lot, pagination, virtuel | navigation cellules au clavier (flèches), `role="grid"`, copy/paste |

> **DataGrid** est plus puissant et plus coûteux que **Table** — ne l'utiliser que pour les écrans
> admin (AD-02 corrections, AD-03 SIGAC). Préférer `Table` pour les listes simples du portail
> citoyen (PC-05 timeline).

---

## 4. Composants métier (Part C — les « smart » NINA-AES)

> Tous dans `packages/ui/src/business/`. Ils consomment `@nina-aes/shared-types` pour les enums et
> interfaces, et `@nina-aes/utils` pour les helpers (`validateNina`, `formatNina`, `maskNina`).

### 4.1 NinaInput

```tsx
<NinaInput
  value={nina}
  onChange={setNina}
  onValid={(parsed) => …}     // appelé seulement si validateNinaChecksum passe
  language="fr"               // pour les messages d'erreur localisés
  size="md"
  autoFocus
/>
```

Comportement :

- Masque dynamique `_ __ __ _ __ ___ ___ _` qui se remplit à mesure de la frappe
- Validation live (`validateNina`) — feedback rouge instantané dès le 15e caractère
- Auto-uppercase, supprime espaces / tirets via `normalizeNina`
- Accessibilité : `aria-invalid` quand format invalide, `aria-describedby` pointant vers le message
  d'erreur en bambara/français/etc.

### 4.2 NinaDisplay

```tsx
<NinaDisplay
  nina="18903102015042Z"
  format="grouped" // "grouped" (X YY ZZ Z ZZ ZZZ ZZZ A) ou "compact"
  masked // affiche "18***********4Z"
  copyable // bouton copier dans le presse-papier
/>
```

### 4.3 CitizenCard

Carte profil large avec photo (Avatar), infos formatées, badge IA "Document vérifié" (vert si
`aiVerdict === HIGH`, orange si MEDIUM), 2 actions principales (Voir FDI · Signaler).

### 4.4 AiScorePanel

Jauge circulaire 0-100 + breakdown 5 facteurs (barres horizontales). Couleurs :

- ≥ 85 → vert (`success.500`)
- 60–84 → orange (`warning.500`)
- < 60 → rouge (`danger.500`)

Accessibilité : `role="meter"` + `aria-valuetext` annonçant le score en mots.

### 4.5 UploadZone

Drag-and-drop avec preview, validation taille (10 Mo max), formats (PDF/JPG/PNG/HEIC), progress (XHR
upload progress event), retry sur échec. Mobile : tap → ouvre la galerie.

### 4.6 CorrectionTimeline

Timeline verticale animée avec 6 états (DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED /
CANCELLED). Animation `slow` + `spring` sur le passage d'état.

### 4.7 MaliMap & 4.8 MaliHeatmap

Carte interactive Mali basée sur **D3 v7 + GeoJSON** (souverain — pas de Mapbox). Chaque région est
cliquable (`role="button"`, `aria-label="Région Kayes"`). Heatmap = même carte avec gradient
`success.50 → danger.500` selon métrique passée en prop.

### 4.9 IntegrityScoreGauge

Jauge circulaire 0-100, mêmes seuils que `AiScorePanel`. Utilisée dans AD-03 (top agents).

### 4.10 AlertSeverityBadge

Badge coloré par enum `AlertSeverity` :

- INFO → `info.500` soft
- LOW → `neutral.500` soft
- MEDIUM → `warning.500` soft
- HIGH → `warning.700` solid
- CRITICAL → `danger.500` solid + animation pulse

### 4.11 LanguageSelector

Dropdown / sheet (mobile) avec 8 langues, drapeau emoji + nom natif (`Bamanankan`, `Soninké`, etc. —
cf. `SUPPORTED_LANGUAGES` dans `@nina-aes/shared-types`).

### 4.12 AESCountrySwitcher

Switch 3 positions Mali / Burkina / Niger avec icône drapeau. Accessibilité : `role="radiogroup"`.

### 4.13 PrioritySlot

Composant créneau de RDV affichant heure + indicateur priorité (P1/P2/P3) avec couleur :

- P1 → bordure `danger.500` 2px (urgent)
- P2 → bordure `warning.500`
- P3 → bordure `neutral.300` (standard)

### 4.14 DirectiveCard

Carte Kanban avec : titre, deadline, badge `escalationLevel`, avatar destinataire. Couleur de
bordure passe à `danger.500` si `deadline < now`.

### 4.15 SignedMessageBubble

Bulle de message (style chat) avec badge `<ShieldCheckIcon />` + `Signature Ed25519 vérifiée` si
`verifySignature() === true`. Tooltip au hover/focus affiche le fingerprint clé publique (8 derniers
chars).

### 4.16 WhistleblowerForm

Formulaire signalement anonyme — **aucun champ identifiant**, badge "🛡 Mode anonyme actif", pas de
cookie, pas de fingerprinting JS, soumission via fetch sans `credentials`.

### 4.17 KioskKeyboard

Clavier tactile virtuel pour bornes Electron (Bloc E) — boutons 64 × 64 px minimum (WCAG 2.5.5
target size), retour haptique simulé via animation scale.

### 4.18 UssdSimulator

Reproduit fidèlement un écran de feature phone Nokia (160 × 128 px scale 2x), navigation au clavier
numérique, transitions slide entre menus, débugage : montre le `sessionId` Redis et le `text`
accumulé.

---

## 5. Patterns d'interaction (Part E)

### 5.1 Form validation

- **Validation client** : Zod schema partagé (`@nina-aes/shared-types/dtos`).
- **Validation serveur** : même Zod schema sur l'API NestJS — single source of truth.
- **Pattern UX** : pas de validation au `onChange` (irritant), au `onBlur` du champ + au submit.
  Erreurs : `aria-invalid` + message en dessous du champ.
- **Inline help** : tooltip `i` à côté du label pour les règles complexes (NINA, mot de passe).

### 5.2 Loading

- **Initial load** : `Skeleton` mimant la forme finale (pas un spinner centré).
- **Refresh** : indicateur `<Spinner size="sm" />` discret en haut à droite, pas de blocage UI.
- **Mutation** : `Button` passe en `loading` (icône remplacée par spinner, label inchangé).

### 5.3 Error handling

- **Erreur API** : Alert `danger` en haut du contenu + bouton retry. Message en français
  - code d'erreur traduisible.
- **Erreur réseau** : Toast persistant tant que offline (`navigator.onLine`).
- **Erreur fatale** : `<ErrorBoundary>` avec illustration + bouton « Recharger » + ID de corrélation
  pour le support.

### 5.4 Optimistic updates

Avec TanStack Query :

```tsx
const mutation = useMutation({
  mutationFn: approveCorrection,
  onMutate: async (id) => {
    await qc.cancelQueries({ queryKey: ['corrections'] });
    const prev = qc.getQueryData(['corrections']);
    qc.setQueryData(['corrections'], (old) =>
      old.map((c) => (c.id === id ? { ...c, status: 'APPROVED' } : c)),
    );
    return { prev };
  },
  onError: (_err, _vars, ctx) => qc.setQueryData(['corrections'], ctx.prev),
});
```

### 5.5 Empty states

Toujours 3 éléments : illustration sobre (icône maliennne custom), titre court, CTA proéminent.
Exemple : "Aucune correction en attente — Vous êtes à jour 🎉".

---

## 6. Accessibility checklist (WCAG 2.2 AA)

- Contraste texte ≥ 4.5:1 (≥ 3:1 sur gros texte > 18pt)
- Focus ring visible sur tous les éléments interactifs (`shadow.focus`)
- Tab order linéaire et logique, sans `tabindex` > 0
- Skip link `<a href="#main">Aller au contenu</a>` en début de chaque page
- Tous les `<img>` ont un `alt` (ou `alt=""` si décoratif)
- Tous les boutons icône ont un `aria-label`
- Formulaires : `<label>` associé à chaque `<input>` via `htmlFor`
- Erreurs annoncées via `aria-live="polite"` ou `role="alert"`
- Animations respectent `prefers-reduced-motion: reduce`
- Texte zoomable jusqu'à 200 % sans casse de layout
- Lecteur d'écran NVDA + VoiceOver iOS testés sur les 12 écrans

Outillage : `eslint-plugin-jsx-a11y` (CI) + `axe-core` (Playwright tests).

---

## 7. Responsive breakpoints

| Token | Largeur min | Contexte                                    |
| ----- | ----------- | ------------------------------------------- |
| `xs`  | 360 px      | Téléphone bas de gamme malien (Tecno, Itel) |
| `sm`  | 640 px      | Téléphone milieu de gamme                   |
| `md`  | 768 px      | Tablette portrait                           |
| `lg`  | 1024 px     | Tablette paysage / petit laptop             |
| `xl`  | 1280 px     | Desktop standard                            |
| `2xl` | 1536 px     | Desktop large                               |

Convention : on **commence** à `xs`, on **ajoute** des règles `sm:`, `md:`, etc. — jamais l'inverse
(`max-md:` interdit hors cas exceptionnel).

---

## 8. Mode sombre

**Stratégie** : variables CSS HSL avec swap des nuances dans `:root[data-theme=dark]`. Les
composants n'utilisent **jamais** de couleurs hex en dur — toujours via tokens.

```css
:root {
  --color-bg: hsl(30, 8%, 98%); /* neutral.50 */
  --color-bg-card: hsl(0, 0%, 100%);
  --color-text: hsl(30, 8%, 12%); /* neutral.900 */
  --color-text-mute: hsl(30, 4%, 46%); /* neutral.500 */
}

:root[data-theme='dark'] {
  --color-bg: hsl(30, 10%, 6%); /* neutral.950 */
  --color-bg-card: hsl(30, 8%, 12%); /* neutral.900 */
  --color-text: hsl(30, 8%, 95%); /* neutral.100 */
  --color-text-mute: hsl(30, 4%, 60%); /* neutral.400 */
}
```

Trigger : préférence système (`prefers-color-scheme`) + override utilisateur stocké dans
`localStorage` (clé `nina-aes-theme`). `<html data-theme>` est défini avant le premier paint via un
script inline dans `<head>` pour éviter le flash.

---

## 9. Internationalisation guidelines

Les 8 langues nationales (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE) provoquent des **expansions de texte
de +30 % à +80 %** par rapport au français. Règles :

1. **Pas de truncate dur** sauf cas exceptionnel — préférer `flex-wrap`, `min-width: 0` pour
   permettre le retour à la ligne.
2. **Pas de texte gravé dans des images** — utiliser SVG avec `<text>` ou couches séparées.
3. **Pas de calcul de largeur en JS basé sur le contenu texte** — toujours laisser le navigateur
   mesurer.
4. **Contextualisation des plurals** : utiliser ICU MessageFormat via `next-intl` (pas de
   `${count} item${count > 1 ? 's' : ''}`).
5. **Test obligatoire en bambara avant merge** — c'est la langue qui expansionne le plus (jusqu'à
   +80 % en moyenne).

Configuration `next-intl` :

```ts
export const locales = ['fr', 'bm', 'snk', 'ff', 'tmq', 'hau', 'mos', 'dje'] as const;
export const defaultLocale = 'fr';
export const localeDirection = {
  /* tous LTR pour l'instant */
} as const;
```

---

## 10. shadcn/ui — composants à installer

Pour les apps Next.js, voici la liste exacte à `pnpm dlx shadcn-ui@latest add` (déjà filtrée pour
notre besoin) :

```bash
button input label select textarea checkbox radio-group switch slider
form sheet dialog drawer alert-dialog popover tooltip
card badge alert toast sonner
tabs accordion collapsible separator scroll-area
table data-table  # extension custom — voir packages/ui/data-table.tsx
breadcrumb pagination skeleton progress avatar
command combobox calendar date-picker
dropdown-menu context-menu menubar navigation-menu
hover-card aspect-ratio resizable
```

Configuration : `components.json` à la racine de chaque app avec `style: "new-york"`,
`baseColor: "neutral"`, `cssVariables: true`. Les variantes sont ensuite étendues via notre `cva`
partagé.

---

## 11. Charte graphique — récap exécutif

| Élément              | Valeur                                                     |
| -------------------- | ---------------------------------------------------------- |
| **Primary**          | `hsl(213, 60%, 42%)` — bleu profond AES                    |
| **Accent**           | `hsl(180, 75%, 42%)` — turquoise lumineux                  |
| **Success**          | `hsl(142, 71%, 45%)`                                       |
| **Warning**          | `hsl(38, 92%, 50%)`                                        |
| **Danger**           | `hsl(0, 84%, 60%)`                                         |
| **Sans**             | Inter Variable                                             |
| **Display**          | Bricolage Grotesque                                        |
| **Mono**             | JetBrains Mono Variable                                    |
| **Échelle taille**   | 1.250 (Perfect Fourth)                                     |
| **Espacement base**  | 4 px                                                       |
| **Rayon par défaut** | 8 px (`radius.base`)                                       |
| **Ombre par défaut** | `shadow.sm`                                                |
| **Durée hover**      | 150 ms                                                     |
| **Bibliothèque UI**  | shadcn/ui (Radix + Tailwind) + 18 composants métier custom |
| **Icônes**           | Lucide React + 5 maliennes custom                          |
| **Mobile-first**     | Breakpoint racine 360 px                                   |

---

## 12. Pour aller plus loin

- **Audit accessibilité automatique** : intégrer `@axe-core/playwright` dans CI (doc 16)
- **Visual regression** : Chromatic ou Loki — capturer les 18 composants métier en 5 états
- **Storybook** : isoler chaque composant pour développement + documentation auto
- **Style Dictionary build** : générer aussi `tokens.swift` (Swift) et `tokens.kt` (Kotlin) pour si
  on passe en RN bare un jour
- **Lectures recommandées** :
  - [https://refactoringui.com/](https://refactoringui.com/) — bases UI design
  - [https://www.w3.org/WAI/WCAG22/quickref/](https://www.w3.org/WAI/WCAG22/quickref/) — référence
    WCAG 2.2
  - [https://www.styledictionary.com/](https://www.styledictionary.com/) — Style Dictionary 4
  - [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs) — composants Radix utilisés
