# ADR-032 — Design system : industrialisation des composants (atomes, conteneurs, métier) + déduplication des apps

## Statut

Accepté — 2026-06-17

## Contexte

`docs/design-system/design-system.md` et `figma-prompts.md` spécifient ~38 composants + 5 icônes
maliennes + un pipeline de tokens. À l'ouverture du chantier, `packages/ui` contenait déjà les
fondations (button, input, label, card, badge, skeleton, alert, separator, sheet, checkbox,
dropdown-menu), des charts (mali-heatmap, sparkline, area-chart, integrity-gauge), `aes-logo` et
`nina-input`, plus les tokens (`tokens.css`/`globals.css`). La demande « implémenter et améliorer
tous ceux-ci » est un effort de plusieurs semaines ; il est livré **par lots vérifiés** (typecheck +
lint à chaque lot), pas en une passe.

## Décisions

### 1. Un style maison unifié pour tous les composants

Tout nouveau composant suit le patron des composants existants : **primitives Radix UI** (a11y
native : rôles, navigation clavier, focus-trap, `aria-*`) + **class-variance-authority** pour les
variantes + **uniquement les classes utilitaires de tokens sémantiques** exposées par le
`@theme inline` de `globals.css` (`bg-primary`, `bg-bg-card`, `bg-bg-muted`, `text-fg`,
`text-fg-muted`, `border-border`, `ring-ring`, `bg-fg`/`text-bg`, `bg-destructive`, `bg-success`,
`bg-warning`, `bg-info` + modificateurs d'opacité) + `forwardRef` + `displayName`.

- **Pourquoi** : cohérence avec button/input/checkbox ; **robustesse** — seules les classes mappées
  dans `@theme inline` sont garanties générées par Tailwind v4, donc on évite les classes d'échelle
  (`bg-primary-50`, …) potentiellement « mortes » selon la config.
- **Conséquence** : `React.ComponentRef` partout (et non `ElementRef`, déprécié en @types/react 19 —
  cf. balayage de déprécations, commit `7c40e02`).

### 2. Composants « métier » découplés du domaine

Les composants `business/*` exposent des **unions de littéraux locales** (`AlertSeverity`,
`AESCountry`, `LanguageCode`, `SlotPriority`, …) plutôt que d'importer les enums de
`@nina-aes/shared-types`.

- **Pourquoi** : le design system reste **réutilisable** (mobile Expo, kiosque Electron) sans
  coupler l'UI aux enums backend ; props simples et sérialisables (philosophie shadcn). La parité
  avec les enums est documentée en commentaire de chaque composant.

### 3. Pas d'animations exotiques non provisionnées

On n'utilise pas les utilitaires `animate-in` / `tailwindcss-animate` (non installés) : les overlays
(dialog, popover, accordion) apparaissent sans classe morte. Les transitions reposent sur des
utilitaires Tailwind natifs.

### 4. Déduplication progressive des apps

Quand un composant du DS couvre une logique **inline dupliquée** dans une app, l'app migre vers le
composant publié **après** que ce dernier est livré + vérifié. Premier exemple : la
`CorrectionTimeline` du tableau de bord citoyen (PC-05, ~75 lignes inline) consomme désormais
`@nina-aes/ui/components/business/correction-timeline`.

## Conséquences

- **Lots livrés + vérifiés** (typecheck + lint `@nina-aes/ui`) :
  - **8 atomes** : switch, radio-group, textarea, avatar, spinner, tooltip, tabs, progress
    (`bd032d1`).
  - **8 conteneurs/navigation** : dialog, popover, accordion, breadcrumb, pagination, table,
    stepper, empty-state (`b40be90`).
  - **8 composants métier** : NinaDisplay, CitizenCard, AiScorePanel, CorrectionTimeline,
    AlertSeverityBadge, PrioritySlot, LanguageSelector, AESCountrySwitcher (`e38baec`).
- **Déduplication** : dashboard citoyen → `CorrectionTimeline` du DS (légère évolution visuelle :
  étape courante en `warning` conforme à design-system.md §3.6, au lieu de `primary`).
- Déprécations React 19 corrigées (FormEvent→SyntheticEvent, ElementRef→ComponentRef) et
  `figma-prompts.md` aligné (NINA d'exemple valide `…V`, plan 43h).

## Limites / reste à faire

- **Atomes** : select/combobox/datepicker, slider.
- **Conteneurs** : toast, data-grid, error-boundary.
- **Métier** : UploadZone, MaliMap, DirectiveCard, SignedMessageBubble, WhistleblowerForm,
  KioskKeyboard, UssdSimulator.
- **Icônes** : 5 maliennes custom (KolaNut, Baobab, Hornbill, Mask, BlackStar).
- **Pipeline tokens** : `sd.config.cjs` (Style Dictionary) → génération tokens.css / tailwind / RN.
- **Dedupe restante** : drawer admin (AiScorePanel/CorrectionTimeline inline), `appointment-form`
  citoyen (créneaux → PrioritySlot), `LanguageSwitcher` citoyen → LanguageSelector.
