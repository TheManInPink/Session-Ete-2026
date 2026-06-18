# ADR-033 — Pipeline de design tokens : `tokens.json` autoritatif → Style Dictionary → `tokens.css`

## Statut

Accepté — 2026-06-18

## Contexte

`docs/design-system/tokens.json` (format DTCG / Style Dictionary 4) était documenté comme **source
de vérité** des valeurs visuelles, mais aucun pipeline ne le branchait :
`packages/ui/src/styles/tokens.css` était maintenu **à la main**. Cet écart a directement causé le
bug systémique corrigé en [ADR §CHANGELOG 0octodecies](../CHANGELOG.md) : les échelles de couleur
avaient été écrites dans `@layer theme { :root }` au lieu de `@theme`, donc **aucun utilitaire
Tailwind n'était généré** (`bg-success-50`, `text-danger-700`, … morts) — invisible pour
`tsc`/ESLint et les e2e.

De plus, `tokens.json` et `tokens.css` avaient **divergé** : `tokens.json` ne contenait ni les rôles
sémantiques (`--bg`, `--primary`, …), ni le mode sombre, ni les stops `success-100` / `warning-800`
/ `neutral-0` que le code utilise réellement.

## Décision

**Faire de `tokens.json` la source de vérité autoritative et générer `tokens.css` par Style
Dictionary 4** (`packages/ui/style-dictionary/build.mjs`, script
`pnpm --filter @nina-aes/ui tokens:build`).

1. **`tokens.json` complété** : ajout de `neutral.0`, `success.100`, `warning.800`, et de deux
   sections `semantic` (rôles, mode clair) + `semanticDark` (surcharges sombres) exprimées en
   références (`{color.…}`).
2. **Format CSS custom (`nina/tokens-css`)** plutôt que `css/variables` par défaut, car la structure
   est contrainte par Tailwind v4 :
   - les **échelles de couleur** vont dans `@theme { … }` (seul bloc qui génère des utilitaires),
     avec leurs **valeurs résolues** (hsl littéral, aucun transform de couleur appliqué) ;
   - les **rôles sémantiques** restent dans `:root` exprimés en `var(--color-…)` (références), et
     surchargés en mode sombre via `:root[data-theme='dark']` — qu'un `@theme` statique ne permet
     pas.
3. **Sortie JS** (`javascript/esm`) générée pour de futurs consommateurs RN/JS (artefact non
   versionné, cf. `style-dictionary/.gitignore`).
4. **`src/styles/tokens.css` devient un fichier GÉNÉRÉ** (en-tête « ne pas éditer à la main ») ;
   toute modification de valeur passe par `tokens.json` puis `tokens:build`.
5. **pnpm 11** : `style-dictionary` et sa sous-dépendance `@bundled-es-modules/glob` n'ont pas
   besoin de leurs scripts de build (JS pur) → `allowBuilds: false` dans `pnpm-workspace.yaml`.

### Alternatives écartées

- **Génération « primitives only »** (échelles seules générées, rôles + dark restant à la main) :
  plus sûre mais laisse une partie de la source de vérité hors `tokens.json`. Écartée au profit du
  pipeline complet autoritaire (choix produit explicite).
- **Garder `tokens.css` à la main** : c'est précisément ce qui a produit le bug 0octodecies.

## Conséquences

- Une seule source (`tokens.json`) pilote couleurs, rôles et mode sombre ; le risque « classe morte
  » est éliminé à la racine (les échelles sont structurellement dans `@theme`).
- **Vérification empirique** (et non par `tsc`/ESLint, aveugles aux classes Tailwind) : le
  `tokens.css` généré a été compilé via `@tailwindcss/postcss@4.3.0` — les 27 classes témoins
  (échelles `bg-success-50`/`text-danger-700`/… + jetons sémantiques + modificateurs d'opacité) sont
  **toutes générées** (0 manquante).
- Effet de bord positif : les neutres chauds surchargent désormais la palette par défaut de Tailwind
  ; les flags Burkina/Niger et les stops `-900`/accent complets deviennent disponibles (additif,
  sans consommateur pour l'instant).
- **Génération idempotente** : `build.mjs` reformate sa sortie avec la config Prettier du dépôt,
  donc `tokens.css` généré est déjà conforme à lint-staged — re-`tokens:build` ne produit aucun diff
  parasite (vérifié : deux builds consécutifs → hash identique).

## Liens

- [ADR-032](./ADR-032-design-system-component-buildout.md) — design system (la revue adversariale du
  lot 3 a révélé le bug de tokens).
- CHANGELOG : `0octodecies` (correctif initial à la main) puis `0novemdecies` (industrialisation via
  ce pipeline).
