# Figma Make — Prompts prêts à copier-coller

> **Usage** : copier chaque prompt **tel quel** dans Figma Make (panneau IA), un par opération. Les
> prompts sont auto-suffisants — Figma Make n'a pas de mémoire entre sessions, donc chaque prompt
> rappelle le contexte minimal.
>
> **Ordre d'exécution recommandé** : §0 (setup tokens) → §1 (composants atomiques) → §2 (composants
> métier) → §3 (12 écrans) → §4 (audit a11y) → §5 (export retour code).
>
> **Plan d'attaque temporel** : ~27 heures réparties sur 8 jours (cf. `design-system.md` §12 et
> conversation préparatoire).

---

## §0 — Setup initial (à faire UNE FOIS)

### 0.1 Import des tokens via Tokens Studio

**Pas un prompt Figma Make** — c'est une action plugin :

1. Installer le plugin **« Tokens Studio for Figma »** (gratuit).
2. Ouvrir le plugin → onglet _Tools_ → _Import_ → _JSON_.
3. Coller le contenu intégral de `docs/design-system/tokens.json`.
4. Cliquer _Import_ → _Sync to Figma Variables_.
5. Vérifier dans le panneau Variables Figma : 3 collections doivent apparaître (`color`,
   `typography`, `spacing` + `radius`, `shadow`, `motion`, `breakpoints`, `z`).

**Validation** : créer un rectangle, appliquer la variable `color/primary/600` → doit afficher
`hsl(213, 65%, 32%)`.

### 0.2 Création des 2 fichiers Figma

```
Fichier 1 : « NINA-AES — Components »
  Pages : 01-Atoms · 02-Display · 03-Containers · 04-Business · 99-Sandbox

Fichier 2 : « NINA-AES — Screens »
  Pages : 01-Citizen · 02-Admin · 03-Governance · 04-USSD · 99-Sandbox
```

Les composants du fichier 1 sont **publiés** (Library) et **consommés** par le fichier 2.

### 0.3 Prompt Figma Make — page de garde du design system

Ouvrir Figma Make sur le fichier "Components", page `99-Sandbox`. Coller :

```
Crée une page de garde / cover pour mon design system "NINA-AES — Components".

Frame 1920x1080, fond color/neutral/50, texte centré.

- Titre principal "NINA-AES" en Bricolage Grotesque 144px, color/primary/700,
  letter-spacing -0.04em
- Sous-titre "Design System v1.0 · Mai 2026" en Inter Variable 32px,
  color/neutral/500
- 3 drapeaux 🇲🇱🇧🇫🇳🇪 en bas, taille 64px, espacés de spacing/8
- Bandeau tricolore (3 rectangles 120x12 collés) en haut centré : color/aes/mali/green,
  color/aes/mali/yellow, color/aes/mali/red, radius/full

Style sobre, gouvernemental, pas de gradients criards.
```

---

## §1 — Composants atomiques (Atoms)

> 12 composants shadcn-like. Chaque prompt produit **default + dark** côte à côte. Tous sur la page
> `01-Atoms` du fichier "Components".

### 1.1 Button

```
Crée le composant Button pour la plateforme NINA-AES (gestion d'identité numérique
souveraine Mali/Burkina/Niger). Plateforme web + mobile.

Police : Inter Variable. Utilise EXCLUSIVEMENT les variables Figma déjà importées
(color/*, spacing/*, radius/*, shadow/*).

Génère une grille 5 (variants) × 5 (tailles) × 6 (states) = 150 instances total :

VARIANTS (colonnes) :
1. solid     — fond color/primary/600, texte color/neutral/50
2. soft      — fond color/primary/100, texte color/primary/700
3. outline   — bordure 1px color/neutral/300, texte color/neutral/900
4. ghost     — pas de fond, texte color/primary/600
5. link      — pas de fond, pas de bordure, texte color/primary/600 souligné au hover

TAILLES (lignes) :
- xs : hauteur 28px, padding 8x12px, font-size typography/size/xs (12)
- sm : 32px, 8x14px, typography/size/sm (14)
- md : 40px, 10x16px, typography/size/base (16)  ← défaut
- lg : 48px, 12x20px, typography/size/md (18)
- xl : 56px, 14x24px, typography/size/lg (20)

STATES à montrer pour chaque cellule (mini-grille 2x3 dans la cellule) :
- default
- hover (fond 1 nuance plus foncée, ex. solid → primary/700)
- focus (default + shadow/focus + ring 3px color/primary/400 50% opacity)
- active (1 nuance encore plus foncée, scale 0.98)
- disabled (opacity 50%, cursor not-allowed, no hover effect)
- loading (label remplacé par spinner 16px qui tourne, fond inchangé)

Rayon : radius/base (8px) sur toutes les tailles sauf xs (radius/sm = 4px).

Texte des boutons : "Action" sauf state loading qui montre un spinner.

Génère AUSSI un panneau de droite "Specs" avec :
- Props : variant, size, state, leftIcon?, rightIcon?, fullWidth?, asChild?
- A11y : role="button" (par défaut HTML), aria-busy si loading, aria-disabled si disabled
- Keyboard : Espace + Entrée déclenchent onClick
- Focus ring obligatoire pour navigation clavier

Versions : "Light" sur fond color/neutral/50, "Dark" sur color/neutral/950 dupliqué
en dessous.
```

### 1.2 Input

```
Composant Input pour NINA-AES. Génère 3 variants × 3 tailles × 6 states.

VARIANTS :
1. default  — bordure color/neutral/300
2. error    — bordure color/danger/500, fond color/danger/50
3. success  — bordure color/success/500, fond color/success/50

TAILLES :
- sm : hauteur 32px, padding 8x12, font 14
- md : 40px, 10x14, font 16  ← défaut
- lg : 48px, 12x16, font 18

STATES : empty, filled, focus, error (avec message), disabled, readonly

Pour chaque instance :
- Label "Nom du champ" en Inter 14 medium, color/neutral/700, au-dessus
- Input avec radius/base (8px)
- Helper text "Description courte" en Inter 12, color/neutral/500, en dessous
- Si state=error : icône ⚠️ Lucide AlertCircle 16px à droite + message en
  color/danger/700

Slots : leftIcon, rightIcon (16px), prefix (ex. "+223"), suffix (ex. "@gov.ml")

A11y panel : label associé via for/id, aria-invalid si error, aria-describedby
pointant vers helper text.

Light + Dark versions.
```

### 1.3 Select / Combobox / Datepicker (groupé)

```
Composant Select (Radix Select base) pour NINA-AES. 3 tailles × 5 states (closed,
open, focus, disabled, error). Chrome de l'élément déclencheur identique à Input.

Quand ouvert :
- Dropdown panneau radius/base, shadow/md, fond color/neutral/0 (light) /
  color/neutral/900 (dark)
- Items 36px hauteur, padding 8x12, hover fond color/neutral/100, item sélectionné
  fond color/primary/100 + ✓ Lucide Check 16px à droite, text color/primary/700
- Max 8 items visibles, scroll au-delà

Génère 3 versions :
A. Select simple (10 options dont 3 sélectionnées en mémoire)
B. Combobox (avec search input en haut + état "Aucun résultat")
C. Datepicker (calendrier mensuel mai 2026, jour sélectionné=02 highlighted
   color/primary/600, today=03 outlined, weekend en color/neutral/400)

Données :
- Select : régions Mali (Kayes, Koulikoro, Sikasso, Ségou, Mopti, Tombouctou,
  Gao, Kidal, District de Bamako, Ménaka)
- Combobox : noms (Modibo K., Aminata T., Mariam S., Oumar C., Ibrahima D., ...)
```

### 1.4 Checkbox / Radio / Switch

```
Composants Checkbox, RadioGroup, Switch pour NINA-AES, alignés Radix UI primitives.

Génère 3 frames côte à côte :

FRAME A — Checkbox
- 2 tailles (sm 16px, md 20px)
- 4 states : unchecked, checked (fond color/primary/600 + ✓ blanc Lucide Check 12px),
  indeterminate (— blanc), disabled
- Label à droite, espacement spacing/2 (8px)
- Hover : bordure color/primary/600 même unchecked

FRAME B — RadioGroup (3 items "Catégorie de vulnérabilité")
- ELDERLY · DISABLED · PREGNANT
- Item sélectionné : cercle extérieur color/primary/600, point central color/neutral/0
- Tailles sm (16px) et md (20px)

FRAME C — Switch
- 2 tailles (sm 24x14, md 32x20)
- States : off (fond color/neutral/300), on (fond color/primary/600), disabled,
  focus (shadow/focus)
- Animation thumb : translate 0 → +14px en motion/duration/fast (150ms)

A11y panel global : role="checkbox" / "radio" / "switch", aria-checked, espace
toggle, label cliquable.
```

### 1.5 Slider / Textarea / Avatar / Badge / Spinner

```
Mini-page de 5 composants atomiques NINA-AES, en 1 frame 1440x900.

GRID 5 colonnes, espacement spacing/12 (48px) :

1. Slider — barre 240px, track color/neutral/200 hauteur 4px, range rempli
   color/primary/600, thumb circle 16px color/primary/600 avec shadow/sm.
   3 states : default, focus (ring), disabled. 1 instance "Score IA min : 60".

2. Textarea — 320x120, mêmes styles qu'Input (1.2). Compteur "0/2000" en bas droite,
   color/neutral/500. State error = bordure color/danger/500.

3. Avatar — 6 tailles (xs=24, sm=32, md=40, lg=48, xl=64, 2xl=96px), radius/full.
   3 variants par taille : avec image (placeholder Fatoumata Diallo), avec initiales
   "FD" sur fond color/primary/200 texte color/primary/700, avec icône Lucide
   User 60% size. Stack en horizontal -8px overlap pour montrer "AvatarGroup".

4. Badge — 4 variants (solid, soft, outline, dot) × 4 sémantiques (primary, success,
   warning, danger) × 3 tailles. Petit (16px), moyen (20px), grand (24px). Texte
   "PROD" / "12" / "URGENT" / "Actif".

5. Spinner — 3 tailles (sm=16, md=24, lg=32), animation rotate 360° en
   motion/duration/slow (300ms) loop. Couleur color/primary/600, stroke 2px,
   stroke-dasharray 50%.

Light + Dark versions stack verticalement.
```

---

## §2 — Composants d'affichage et conteneurs

### 2.1 Card / Alert / Toast

```
3 composants d'affichage NINA-AES, page 02-Display du fichier Components.

CARD — 3 variants ×, taille 320x200 chacun :
- flat     — fond color/neutral/0 / dark color/neutral/900, pas de bordure
- outlined — fond identique + bordure 1px color/neutral/200
- elevated — fond identique + shadow/base
Header (40px) : titre 18 medium + actions à droite. Body : texte 14 normal
color/neutral/700. Footer optionnel : 2 boutons sm.

ALERT — 4 variants 480px wide :
- info    : fond color/info/50, bordure-left 4px color/info/500, icône Info Lucide
- success : fond color/success/50, bordure color/success/500, icône CheckCircle
- warning : fond color/warning/50, bordure color/warning/500, icône AlertTriangle
- danger  : fond color/danger/50, bordure color/danger/500, icône AlertCircle

Chaque alert : titre 16 semibold + description 14 regular + bouton X close à droite.

TOAST — 3 instances stack à droite, 360x80 chacun :
- success "Correction approuvée" avec ✓
- warning "Connexion intermittente" avec ⚠
- danger  "Échec : NINA introuvable" avec ✗ + bouton Retry

Toast = Alert + shadow/lg + radius/md + animation slide-in-right (montrer la
trace du mouvement avec opacity gradient).

Light + Dark.
```

### 2.2 Dialog / Drawer / Tooltip / Popover

```
Composants overlay NINA-AES, page 02-Display.

DIALOG — 4 tailles : sm (400), md (560), lg (720), xl (960), tous hauteur auto.
Fond color/neutral/0, radius/lg, shadow/2xl, padding spacing/8 (32px).
Backdrop : noir 50% opacity. Header (titre + close X), body, footer (2 boutons droite).

DRAWER — 4 variants : left (400px), right (480px), top (50vh), bottom (60vh).
Slide-in animation montrée avec opacity gradient. Pour right : header sticky (titre +
close), body scroll, footer sticky avec actions.

TOOLTIP — 4 positions (top, right, bottom, left), petit 200px max, fond
color/neutral/900, texte color/neutral/0 size 12, padding spacing/2 (8px),
radius/sm, shadow/sm, flèche 6px.

POPOVER — comme tooltip mais 280-360px, fond color/neutral/0, texte color/neutral/900,
peut contenir un composant complet (form, menu).

Light + Dark.
```

### 2.3 Tabs / Accordion / Stepper / Breadcrumb / Pagination

```
5 composants navigation NINA-AES, page 03-Containers.

TABS — 3 variants horizontaux (default underline, pills, segmented) + 1 vertical.
Tab actif : color/primary/600 + ligne 2px en dessous (default) ou fond
color/primary/100 (pills). Hover, focus visible.

ACCORDION — 3 items (single ou multiple). Header 56px hauteur, click expand,
chevron Lucide ChevronDown qui rotate 180° au open. Content padding spacing/4.

STEPPER — 4 étapes horizontal + 4 étapes vertical. Étape : cercle 32px (color/primary/600
si done ou current, color/neutral/300 si todo), label 14 medium, ligne de connexion
1px entre étapes. State done = cercle rempli + Lucide Check, current = cercle outlined +
numéro, todo = cercle outlined + numéro grisé.

BREADCRUMB — 5 niveaux séparés par "/" (chevron Lucide ChevronRight 12px), dernier
en color/neutral/900 bold (page courante), précédents en color/neutral/500
cliquables.

PAGINATION — boutons Précédent/Suivant + pages 1, 2, 3, ..., 12. Page courante
fond color/primary/600 texte blanc, autres outlined. Tailles sm et md.

Light + Dark.
```

### 2.4 Skeleton / EmptyState / ErrorBoundary / Progress

```
4 composants états NINA-AES, page 02-Display.

SKELETON — 4 variants :
- text    : barre 200x12 radius/base, color/neutral/200 avec animation shimmer
- circle  : cercle 40px
- rect    : 320x180 radius/base
- card    : composition complète mimant une CitizenCard (avatar circle 60px +
  3 lignes texte de longueurs décroissantes 80%, 60%, 40%)

EMPTYSTATE — 360x320 centré :
- Icône Lucide 64px color/neutral/300
- Titre 20 semibold color/neutral/900 "Aucune correction en cours"
- Description 14 regular color/neutral/500 "Soumettez une demande pour la voir ici"
- Bouton solid CTA "Demander une correction" 40px

ERRORBOUNDARY — 480x400 centré :
- Illustration custom (icône AlertOctagon Lucide 96px color/danger/400)
- Titre 24 bold "Une erreur est survenue"
- Description 14 + ID corrélation en mono (ex. "trace-id: a1b2c3d4")
- 2 boutons : "Recharger" (solid) + "Retour à l'accueil" (ghost)

PROGRESS — 2 variants :
- bar     : 320x8 radius/full, fill color/primary/600 à 65%, label "65%" à droite
- circle  : SVG 48x48, stroke 4px color/primary/600 sur color/neutral/200, 65%
```

### 2.5 Table / DataGrid

```
2 composants tabulaires NINA-AES.

TABLE simple — 6 colonnes × 8 lignes :
- Header sticky 48px, fond color/neutral/100, texte 14 medium uppercase letter-spacing
  wide, séparateur 1px color/neutral/200 dessous
- Lignes 56px, padding 12x16, séparateur 1px color/neutral/200
- Colonnes triables : icône Lucide ChevronUpDown 12px à droite du label
- Lignes avec hover fond color/neutral/50
- Variants : flat, striped (pair color/neutral/50), bordered

DATAGRID complet — 1280x720 :
- Barre filtres en haut (8 chips Combobox), bouton "Effacer filtres", search global,
  hauteur 56px
- Sélection multiple (checkbox col 0 fixe), 7 colonnes data, col actions à droite
  avec menu kebab
- Header : tri + icône, filtre par colonne (icône Lucide Filter)
- Footer : pagination + selecteur "lignes par page" + total "84 résultats"
- Row hover, row sélectionné fond color/primary/50

Données fictives : corrections NINA (NINA, Champ, Avant, Après, Score IA, Statut,
Date, Actions).

Light + Dark.
```

---

## §3 — Composants métier NINA-AES (page 04-Business)

### 3.1 NinaInput (avec masque dynamique)

```
Composant NinaInput pour NINA-AES — saisie du Numéro d'Identification Nationale
malien (15 caractères, format X YY ZZ Z ZZ ZZZ ZZZ A).

DIMENSIONS : 480x80 (label + input + helper)

Génère 6 frames stack vertical (espacement spacing/4) :

1. Empty       — placeholder "_ __ __ _ __ ___ ___ _" en mono color/neutral/400
                 letter-spacing 0.1em
2. Typing (5 chars) — texte "1 89 03" en mono color/neutral/900, curseur visible
3. Typing (15 chars valide) — texte "1 89 03 1 02 015 042 Z" + icône CheckCircle
                              Lucide 20px à droite color/success/600
4. Invalid (15 chars mauvaise lettre) — bordure color/danger/500, icône AlertCircle
                                         + message "Lettre de contrôle invalide" en
                                         color/danger/700
5. Disabled    — fond color/neutral/100, opacity 60%
6. Focus       — bordure color/primary/600 2px, shadow/focus

TYPOGRAPHIE :
- Label "Numéro d'identification (NINA)" 14 medium color/neutral/700
- Input value : Inter Variable mono ou JetBrains Mono Variable size 18,
  letter-spacing 0.08em, color/neutral/900
- Helper text 12 regular color/neutral/500 : "14 chiffres + 1 lettre de contrôle"

Annotations à droite :
- Props : value, onChange, onValid, language (FR|BM|...|DJE), size, autoFocus
- Helper utilisé : @nina-aes/utils → validateNina + normalizeNina
- A11y : aria-invalid si invalide, aria-describedby pointe vers helper

Light + Dark.
```

### 3.2 NinaDisplay

```
Composant NinaDisplay pour NINA-AES — affichage formaté d'un NINA.

3 variants côte à côte :

A. grouped (default) — "1 89 03 1 02 015 042 Z" en mono Inter Variable mono ou
   JetBrains Mono Variable size 24 medium, letter-spacing 0.1em, color/neutral/900,
   bouton Copy à droite (Lucide Copy 16px)

B. compact — "18903102015042Z" sans espaces, size 18

C. masked — "18***********4Z" pour les logs, size 18 italic color/neutral/500

Chaque variant a 3 tailles : sm (16), md (24), lg (32).

Annotations : utilise formatNina() / maskNina() de @nina-aes/utils.
Bouton Copy → toast "NINA copié" success 2s.

Light + Dark.
```

### 3.3 CitizenCard

```
Composant CitizenCard pour NINA-AES — carte profil large d'un citoyen·ne.

DIMENSIONS : 720x320 (desktop) + 360x480 (mobile portrait), génère les 2.

LAYOUT desktop :
- Photo 120x150 à gauche, radius/base, fallback Avatar avec initiales si pas
  de photo
- Bloc info à droite (flex-1) :
  • Nom complet "Fatoumata DIALLO" en Bricolage Grotesque 28 bold color/neutral/900
  • Sous-titre "née le 15/03/1989 · Féminin · Célibataire" 14 regular
    color/neutral/500
  • NinaDisplay grouped (cf. 3.2) size md
  • Profession "Couturière" 14 medium
  • Hiérarchie géographique (8 niveaux résidence) en breadcrumb avec drapeau
    🇲🇱 + chevrons Lucide ChevronRight 12px
- En haut à droite : badge "✅ FDI vérifiée" sur fond color/success/100 texte
  color/success/700, icône ShieldCheck Lucide 16px
- Footer (séparateur 1px color/neutral/200 au-dessus) : 2 boutons "📄 Télécharger
  ma FDI signée" (solid primary) + "✏️ Signaler une erreur" (outline)

LAYOUT mobile (360x480) :
- Photo en haut centré 100x125
- Infos dessous en pile, alignement centré
- Boutons full width en pile

Données fictives : Fatoumata DIALLO, NINA 1 89 03 1 02 015 042 Z, née 15/03/1989,
réside Mali > District de Bamako > Commune IV > Lafiabougou.

Light + Dark.
```

### 3.4 AiScorePanel

```
Composant AiScorePanel pour NINA-AES — affichage du score de confiance IA d'une
correction.

DIMENSIONS : 360x360 ou 480x320 selon orientation.

Génère 2 frames :

A. Vertical 360x360 :
- Jauge circulaire 200x200 centrée :
  • Cercle externe stroke 12px color/neutral/200
  • Arc rempli stroke 12px qui couvre 92% du cercle, couleur selon seuil :
    - ≥ 85 : color/success/500
    - 60-84 : color/warning/500
    - < 60  : color/danger/500
  • Centre : "92" en Bricolage Grotesque 56 bold + "/100" 24 regular
    color/neutral/500
- Sous-titre "Haute confiance" 16 semibold color/success/600
- Breakdown 5 facteurs en lignes :
  • "Correspondance fuzzy"     ████████░░ 95
  • "Cohérence géographique"   █████████░ 89
  • "Historique agent"         ██████████ 91
  • "Fréquence du champ"       ████████░░ 87
  • "Validation Zod"           ██████████ 100
  Chaque ligne : label 14 + barre 200x6 radius/full + nombre right

B. Horizontal 480x320 — jauge à gauche, breakdown à droite

ANNOTATIONS :
- Props : score (0-100), breakdown (object), threshold ({ high: 85, medium: 60 })
- A11y : role="meter", aria-valuenow=92, aria-valuemin=0, aria-valuemax=100,
  aria-valuetext="Haute confiance, 92 sur 100"

Light + Dark.
```

### 3.5 UploadZone

```
Composant UploadZone pour NINA-AES — drag-and-drop d'un justificatif.

DIMENSIONS : 480x240.

Génère 5 frames stack horizontal (espacement spacing/6) :

1. Default — bordure dashed 2px color/neutral/300, fond color/neutral/50,
   icône Lucide UploadCloud 48px color/neutral/400 centrée, texte
   "Glissez un fichier ici, ou cliquez pour parcourir" 16 regular
   color/neutral/700, sous-texte "PDF, JPG, PNG · 10 Mo max" 12
   color/neutral/500

2. Dragover — bordure dashed color/primary/600, fond color/primary/50, icône
   color/primary/600, animation pulse subtile

3. Uploading — fichier preview en haut (icône PDF Lucide FileText + nom
   "justif_acte_naissance.pdf"), barre de progression Progress bar à 65%,
   bouton X annuler

4. Success — fichier preview avec checkmark vert, message "Téléversement réussi"
   color/success/600, bouton "Remplacer" outline + bouton "X" supprimer

5. Error — fichier preview avec icône erreur, message "Échec : fichier trop
   volumineux" color/danger/700, bouton "Réessayer" + "Annuler"

Pour les screens mobile, version 320x180 avec layout adapté.

Light + Dark.
```

### 3.6 CorrectionTimeline

```
Composant CorrectionTimeline pour NINA-AES — timeline verticale animée du cycle
de vie d'une demande de correction.

DIMENSIONS : 400x520.

6 nœuds verticaux espacés de 80px :
1. DRAFT       — créé    02/05 09:12 — icône Lucide FileEdit 24px
2. SUBMITTED   — envoyé  02/05 09:15 — Lucide Send
3. UNDER_REVIEW (current) — en revue 02/05 09:23 — Lucide Eye, anneau pulsant
   color/warning/300 autour du cercle pour montrer "current"
4. APPROVED    — futur   à venir     — Lucide CheckCircle, grisé
5. REJECTED    — alternatif futur     — Lucide XCircle, grisé
6. COMPLETED   — final   à venir     — Lucide Trophy, grisé

Style des nœuds :
- État done : cercle 40px fond color/primary/600, icône blanche, ligne verticale
  vers le suivant en color/primary/600 (3px width)
- État current : cercle outlined color/warning/500 + halo, icône color/warning/600
- État todo : cercle outlined 1px color/neutral/300, icône color/neutral/400

Pour chaque nœud : label statut 14 semibold + sous-label date 12 regular
color/neutral/500 (à droite du nœud).

Génère 3 versions :
A. Path APPROVED : DRAFT → SUBMITTED → REVIEW → APPROVED → COMPLETED (REJECTED grisé)
B. Path REJECTED : DRAFT → SUBMITTED → REVIEW → REJECTED (autres grisés)
C. Path CANCELLED : DRAFT → CANCELLED (status=annulé en color/neutral/500)

Light + Dark.
```

### 3.7 MaliMap & MaliHeatmap

```
Composant MaliMap pour NINA-AES — carte interactive du Mali avec 10 régions
cliquables.

DIMENSIONS : 600x500 (rendu D3 + GeoJSON).

LAYOUT :
- Fond color/neutral/50, bordures pays color/neutral/700 stroke 1.5px
- 10 régions remplies color/primary/100 par défaut
- Région survolée : color/primary/300 + bordure 2px color/primary/600
- Région sélectionnée : color/accent/400 + outline 2px color/accent/600
- Centroïde de chaque région : cercle 8px color/primary/600 avec label 12 medium
  blanc

10 régions positionnées approximativement :
- Kayes (ouest)
- Koulikoro (centre-ouest)
- Sikasso (sud)
- Ségou (centre)
- Mopti (centre-est)
- Tombouctou (nord)
- Gao (nord-est)
- Kidal (extrême nord-est)
- District de Bamako (encart en bas)
- Ménaka (est)

Génère 2 frames :

A. MaliMap — version standard, sélection région Bamako mise en évidence
B. MaliHeatmap — toutes régions colorées par gradient (color/success/100 →
   color/danger/500) selon métrique fictive "Alertes / 10 000 hab" :
   Kayes 12, Koulikoro 8, Sikasso 15, Ségou 22, Mopti 35, Tombouctou 48,
   Gao 41, Kidal 52, Bamako 28, Ménaka 31. Légende à droite avec gradient.

Note : utilise GeoJSON simplifié (50% des sommets), ne dessine pas chaque village.

Light + Dark (les régions sont color/primary/900 sur fond color/neutral/950 en dark).
```

### 3.8 IntegrityScoreGauge

```
Composant IntegrityScoreGauge pour NINA-AES — jauge circulaire 0-100 du score
d'intégrité d'un agent (SIGAC).

DIMENSIONS : 200x240 (jauge + label).

Identique à AiScorePanel jauge SAUF :
- Sans breakdown
- Format compact
- Couleurs adaptées : ≥85 vert (intègre), 70-84 jaune (à surveiller),
  <70 rouge (problématique)
- Label en dessous : "Modibo K. — 97/100" en 14 medium

Génère un set de 6 instances avec scores : 97, 95, 92, 87, 64, 42 (pour montrer
toute la gamme de couleurs).

Annotations : composant utilisé dans AD-03 (top 10 agents).

Light + Dark.
```

### 3.9 AlertSeverityBadge

```
Composant AlertSeverityBadge pour NINA-AES — badge coloré pour les alertes SIGAC.

DIMENSIONS : variable, ~80x28.

5 instances horizontales :
1. INFO     — fond color/info/100, texte color/info/700, icône Lucide Info 14px
2. LOW      — fond color/neutral/100, texte color/neutral/700, icône Lucide Bell
3. MEDIUM   — fond color/warning/100, texte color/warning/700, icône AlertTriangle
4. HIGH     — fond color/warning/600, texte blanc, icône AlertTriangle, pulse subtil
5. CRITICAL — fond color/danger/600, texte blanc, icône AlertOctagon, animation
              pulse continue (montrer 2 frames pour suggérer animation)

Style : radius/full, padding 4x10, font 12 semibold uppercase letter-spacing wide.

Tailles : sm (24px hauteur), md (28px), lg (32px).

Light + Dark.
```

### 3.10 LanguageSelector

```
Composant LanguageSelector pour NINA-AES — dropdown 8 langues nationales.

DIMENSIONS : 200x44 (déclencheur) + 240x376 (panneau ouvert).

Déclencheur (collapsed) :
- Bouton 200x44 outlined, drapeau 🇲🇱 + nom natif "Français" + chevron Lucide
  ChevronDown 16px à droite
- Padding 8x12, gap 8 entre éléments

Panneau ouvert :
- 8 items 44px hauteur :
  • 🇲🇱 Français (FR)
  • 🇲🇱 Bamanankan (BM)
  • 🇲🇱 Soninké (SNK)
  • 🇲🇱 Fulfulde (FF)
  • 🇲🇱 Tamasəḥt (TMQ)
  • 🇲🇱 Hausa (HAU)
  • 🇲🇱 Mõõré (MOS)
  • 🇲🇱 Songhay (DJE)
- Item sélectionné : ✓ Lucide Check à droite + fond color/primary/50
- Hover : fond color/neutral/100
- Search input optionnel en haut

Variants :
A. Dropdown desktop (montrer comme ci-dessus)
B. Sheet mobile (plein écran bottom drawer 360x80vh, items 56px)

Annotations : code interne (FR, BM, ...) + code ISO 639-1 ("fr", "bm", "snk", "ff",
"tmh", "ha", "mos", "dje").

Light + Dark.
```

### 3.11 AESCountrySwitcher

```
Composant AESCountrySwitcher pour NINA-AES — switch 3 positions Mali/Burkina/Niger.

DIMENSIONS : 240x48.

Style segmented control :
- Container fond color/neutral/100, radius/base, padding 4
- 3 segments 76x40 each, séparés par 2px gap
- Segment actif : fond color/neutral/0, shadow/sm, radius/sm
- Chaque segment : drapeau emoji 24px + code "MLI"/"BFA"/"NER" 14 semibold

3 frames pour les 3 sélections :
1. Mali sélectionné (par défaut) — bordure subtile color/aes/mali/green
2. Burkina sélectionné — bordure color/aes/burkina/red
3. Niger sélectionné — bordure color/aes/niger/orange

Annotations : role="radiogroup", chaque segment role="radio".

Light + Dark.
```

### 3.12 PrioritySlot

```
Composant PrioritySlot pour NINA-AES — créneau de RDV avec indicateur priorité.

DIMENSIONS : 240x88.

Layout horizontal :
- Indicateur priorité gauche (8px largeur, full height) couleur selon niveau :
  - P1 : color/danger/500
  - P2 : color/warning/500
  - P3 : color/neutral/300
- Contenu :
  • Heure "07h30" en Bricolage Grotesque 24 bold
  • Sous-titre "Antenne mobile RAVEC" 12 medium color/neutral/500
  • Badge priorité ⚡P1 / P2 / P3 en haut droite
- États :
  • Available (default)  — bordure color/neutral/200
  • Selected (current)   — bordure 2px color/primary/600 + fond color/primary/50
  • Booked (other)       — opacity 50%, "Pris" overlay
  • Hover                — bordure color/primary/400

Génère 9 instances dans une grille 3x3 montrant : 3 P1 (1 selected, 1 available,
1 booked), 3 P2, 3 P3.

Light + Dark.
```

### 3.13 DirectiveCard (Kanban)

```
Composant DirectiveCard pour NINA-AES — carte Kanban d'une directive (SGOGT).

DIMENSIONS : 280x180 (Kanban) ; 480x240 (détail).

LAYOUT (Kanban 280x180) :
- Header (32px) : badge "DIRECTIVE-2026-042" mono 12 + icône menu kebab à droite
- Body :
  • Titre "Plan d'action RAVEC T2 2026" 16 semibold 2 lignes max
  • Description "Recensement renforcé Sikasso + Mopti" 12 regular color/neutral/500,
    2 lignes max
  • Badges : escalade niveau 2 (icône Lucide ArrowUp + "n.2"), priorité P1
- Footer :
  • Avatar destinataire 24px + "M. Touré" 12
  • Deadline "📅 J-3" en color/danger/600 si en retard, sinon color/neutral/500

État "en retard" (deadline passée) :
- Bordure 2px color/danger/500
- Fond color/danger/50
- Icône Lucide AlertCircle ⚠ rouge à droite du titre

Génère 4 instances (Kanban) montrant les 4 status : DRAFT, SENT, IN_PROGRESS, COMPLETED.
Plus 1 instance détail 480x240 avec timeline + escalade history.

Light + Dark.
```

### 3.14 SignedMessageBubble

```
Composant SignedMessageBubble pour NINA-AES — bulle de message signée Ed25519.

DIMENSIONS : 480x variable (auto-height).

LAYOUT :
- Conteneur radius/lg, padding spacing/4 (16px), shadow/sm
- 2 variants :
  A. Émis (sender = self) — fond color/primary/600, texte blanc, alignement droite
  B. Reçu — fond color/neutral/100, texte color/neutral/900, alignement gauche
- Header : nom "Ministre MAT" 14 semibold + horodatage "13:42" 12 color/neutral/500
- Body : texte 14 regular, supporte markdown (bold, italic, code)
- Footer (8px gap) :
  • Badge "🛡 Ed25519 ✅" — fond color/success/100, texte color/success/700, icône
    Lucide ShieldCheck 14px
  • Tooltip au hover/focus : "Fingerprint clé publique : a3f4...8b2c — vérifié"
  • Lu : "Lu : 13:50" en color/neutral/500 12 (côté émis seulement)

Génère 4 instances dans un fil de discussion :
- Reçu "Bonjour, voir directive RAVEC..." 14:30
- Émis "Reçue, accusé envoyé" 14:32 lu 14:33
- Reçu avec pièce jointe icône + nom fichier + 2.4 Mo
- Reçu signature manquante : badge rouge "⚠ Signature absente"

Light + Dark.
```

### 3.15 WhistleblowerForm

```
Composant WhistleblowerForm pour NINA-AES — formulaire signalement anonyme SIGAC.

DIMENSIONS : 720x900 (full page citoyen mobile + desktop).

LAYOUT (full form) :
- Bandeau Alert info en haut, 720x80 :
  • Icône ShieldCheck 24 color/info/600
  • Titre "🛡 Mode anonyme actif" 16 semibold
  • Sous-titre "Aucune adresse IP, cookie ou identifiant n'est enregistré." 14 regular
- Section catégorie :
  • Label "Catégorie de signalement *"
  • RadioGroup 6 options layout grid 3x2 :
    Pots-de-vin · Faux documents · Favoritisme · Abus de pouvoir ·
    Marchés publics · Autre
- Section description :
  • Label "Description *"
  • Textarea 720x180 placeholder "Décrivez les faits avec autant de détails que
    possible..."
  • Compteur "0/2000" right
- Section pièces jointes :
  • Label "Pièces jointes (audio, photo, doc) — facultatif"
  • UploadZone 720x180 — max 5 fichiers, 50 Mo total
- Avertissement (Alert warning) :
  • "⚠ Conservez bien le token qui vous sera remis pour suivre l'instruction."
- Footer : 2 boutons :
  • "Annuler" (outline) gauche
  • "Soumettre le signalement →" (solid danger) droite

Modal post-soumission 480x520 :
- Icône Lucide ShieldCheck 64 color/success/500
- Titre "Signalement enregistré"
- Token "WGRZ-1XK2-FN8M" en mono 28 medium dans un bloc fond color/neutral/100
- QR code 200x200 (placeholder)
- 2 boutons : "Télécharger en PDF protégé" + "Fermer"

Génère le formulaire (default) + le modal post-soumission.

Light + Dark.
```

### 3.16 KioskKeyboard

```
Composant KioskKeyboard pour NINA-AES — clavier tactile virtuel pour bornes
Electron (Bloc E).

DIMENSIONS : 800x320 (azerty plein) ou 320x320 (numérique seul).

VARIANT A — clavier numérique 4x3 :
- 12 boutons 96x96 (target size 96px > WCAG min 44px)
- Disposition téléphone : 1 2 3 / 4 5 6 / 7 8 9 / * 0 #
- Bouton fond color/neutral/100, texte 32 medium color/neutral/900
- Hover/active : fond color/primary/100, scale 0.95 motion/duration/instant (75ms)
- Bouton spécial "Effacer" (Lucide Delete) à la place du *

VARIANT B — clavier alphabétique azerty 800x320 :
- 4 rangées :
  azertyuiop
  qsdfghjklm
  wxcvbn___
  espace shift backspace entrée
- Boutons 64x64 padding gap 8

VARIANT C — clavier saisie NINA spécifique 480x320 :
- 10 chiffres + 26 lettres (ABCDEF... HJKLMN... excluant I et O cf. lettre contrôle)
- Indicateur de progression "8/15 caractères" en haut

Annotations : retour haptique simulé via animation scale 0.95 → 1.0 en 75ms.
Light + Dark.
```

### 3.17 UssdSimulator

```
Composant UssdSimulator pour NINA-AES — reproduction d'un écran de feature phone
Nokia 3310 pour démo USSD.

DIMENSIONS : 360x720 (téléphone vertical).

LAYOUT :
- Coque téléphone 320x640 fond color/neutral/900, radius/2xl, shadow/2xl
- Écran intérieur 240x180 fond color/aes/mali/yellow opacity 30% (LCD beige),
  bordure 4px color/neutral/950, padding 16
- Texte écran en monospace mono Inter Variable mono 12, color/neutral/950
- En haut écran : "📶📵  NINA-AES  12:34"
- Contenu ex. menu langue :
```

Bisimila! Choisissez la langue :

1.  Français
2.  Bamanankan
3.  Soninké
4.  Fulfulde
5.  Tamasheq
6.  Hausa
7.  Mooré
8.  Zarma

[Répondre] [Annuler]

```
- KioskKeyboard variant numérique 240x320 en bas du téléphone
- Boutons "Répondre" / "Annuler" sous l'écran 80x32 chacun

Génère 4 frames montrant la séquence :
1. Écran initial — saisie *123*NINA#
2. Menu langue (ci-dessus)
3. Menu principal en bambara (option 2)
4. Saisie NINA → résultat fiche

À droite du téléphone : panneau debug 280x720 fond color/neutral/100, mono 12 :
- sessionId : sim-1735819234
- accumulated text : "2*1*18903102015042Z"
- API call : POST /ussd { ... }
- Last response : "END Fatoumata DIALLO · 15/03/1989..."

Animations transition slide-left entre menus, motion/duration/fast (150ms).

Light + Dark.
```

---

## §4 — 12 écrans (page Screens)

> Ces 12 prompts génèrent les écrans complets en référant les composants déjà publiés (Library
> "NINA-AES — Components"). Ne pas oublier d'**activer la librairie** dans le fichier "Screens"
> avant de prompter.

### 4.1 PC-01 — Accueil citoyen

```
Crée le wireframe haute fidélité de l'écran "PC-01 — Accueil" pour
apps/citizen de la plateforme NINA-AES (gestion d'identité numérique souveraine
Mali/Burkina/Niger).

3 frames côte à côte (mobile-first vrai) :
- Mobile  : 360 x 800 px
- Tablet  : 768 x 1024 px
- Desktop : 1440 x 900 px

GRILLE : 12 col gutter 24 (desktop), 16 (tablet), 8 (mobile)

UTILISE EXCLUSIVEMENT mes variables tokens et mes composants publiés
(Button, NinaInput, LanguageSelector, Card, AESCountrySwitcher).

LAYOUT desktop :
- Header sticky 64px : logo NINA-AES gauche (svg avec couleurs aes/mali),
  nav 14 medium "À propos · Centres CTDEC · Aide" centre, droite
  LanguageSelector + Button outline "Connexion"
- Hero 480px height : fond dégradé tricolore Mali (color/aes/mali/green →
  yellow → red, opacity 30%) avec pattern subtil de baobabs SVG en
  watermark (opacity 5%)
  • Titre H1 "Mon identité, mon NINA, mon AES" en Bricolage Grotesque 60
    bold color/neutral/900, line-height tight, letter-spacing tight
  • Sous-titre "Le portail numérique souverain de l'Alliance des États du
    Sahel" 20 regular color/neutral/700
  • NinaInput 480px wide
  • Bouton solid accent xl "Rechercher" 200x56 à droite du NinaInput
- Section actions 4 Card (240x180 chaque) en grid 4 colonnes,
  espacement spacing/6 (24px) :
  • 📄 "Voir ma fiche" — icône Lucide FileSearch 32px color/primary/600
  • ✏️ "Demander correction" — icône Edit3 32px color/warning/600
  • 📅 "Prendre RDV" — icône CalendarPlus 32px color/success/600
  • 🛡 "Signaler corruption" — icône Shield 32px color/danger/600
  Chaque card : icône en haut, titre 18 semibold, description 14, CTA "→"
- Section éducative "Pourquoi NINA-AES ?" 3 colonnes :
  • Souveraineté (icône maliennne BlackStarIcon)
  • Inclusion (icône maliennne KolaNutIcon)
  • Sécurité (icône maliennne BaobabIcon)
  Chaque colonne : icône 64px color/primary/700 + titre 24 + paragraphe 16
- Footer 200px : 4 colonnes liens (CTDEC · DNEC · Mentions légales · Contact),
  séparateur 1px color/neutral/200, en bas drapeaux 🇲🇱🇧🇫🇳🇪 32px + AESCountrySwitcher

LAYOUT mobile :
- Header 56px avec burger menu Lucide Menu 24px gauche, logo centre, dot
  notifications droite
- Hero plein écran : titre 36, NinaInput full width, bouton dessous full
  width
- Cards en grid 1 col, 320px hauteur chaque, full width
- Sections éducatives en pile

ÉTATS À MONTRER (3 variations du desktop) :
- Default (chargé)
- Loading (Skeleton sur hero pendant 200ms)
- Error (Alert danger en haut "Service en maintenance — réessayer dans 5min")

ANNOTATIONS :
- Numéroter chaque élément interactif (1-9)
- À droite du frame, lister par numéro : composant, props, endpoint API
  (s'il y en a un), interaction
- A11y notes : skip-link visible au focus, contraste hero 6:1, focus ring
  3px color/primary/400

Light + Dark versions.
```

### 4.2 PC-02 — Résultat NINA

```
Crée l'écran "PC-02 — Résultat de recherche NINA" pour apps/citizen NINA-AES.

3 frames mobile/tablet/desktop (cf. spec 4.1).

UTILISE : Header (publié), Breadcrumb, CitizenCard (3.3), NinaDisplay (3.2),
Button.

LAYOUT desktop :
- Header sticky (réutiliser PC-01)
- Breadcrumb : Accueil > Résultat NINA (color/neutral/500 → color/neutral/900
  current)
- CitizenCard 1200x320 centré dans un container max-w-7xl, padding spacing/8
- En dessous : 2 sections en accordion :
  • "Demandes en cours" (collapsed par défaut) — vide → EmptyState
  • "Historique" (collapsed) — Table compacte 5 dernières activités

Données : Fatoumata DIALLO (cf. 3.3).

États :
- Loading : Skeleton 1200x320 pour la card
- 404 NINA inconnu : EmptyState 720x480 "NINA introuvable" + bouton retour PC-01
- Error API : Alert danger en haut + retry button

LAYOUT mobile : CitizenCard variant mobile 360x480 (cf. 3.3), accordions full
width.

Annotations + Light/Dark.
```

### 4.3 PC-03 — Wizard correction

```
Crée l'écran "PC-03 — Demande de correction" pour apps/citizen NINA-AES.

Wizard 4 étapes. Génère 4 frames desktop 1440x900 montrant chaque étape :

ÉTAPE 1 — Choix du champ
- Stepper horizontal 4 étapes (étape 1 active)
- Card centrée 720x400 :
  • Titre "Quel champ souhaitez-vous corriger ?"
  • Combobox 480 "Choisir un champ" avec liste : Prénom, Nom, Date naissance,
    Lieu naissance, Cercle, Commune, Quartier, Profession
  • Sous chaque option : valeur actuelle en color/neutral/500 italic
  • Bouton "Continuer →" disabled tant qu'aucun choix

ÉTAPE 2 — Nouvelle valeur (cf. screens.md PC-03 wireframe)
- Card 720x500 :
  • "Champ à corriger : Cercle (lieu de résidence)"
  • Comparaison avant/après : 2 cards 240x100 côte à côte
    - Avant "Sikaso" en color/neutral/700 mono 18
    - Après [Input filled] "Sikasso" en color/success/700 mono 18 bold
  • AiScorePanel (3.4) horizontal 480x320 en dessous, score live 92
  • Helper "Estimation délai : 24-48h après upload"
  • Bouton Précédent (ghost) gauche + Continuer (solid) droite

ÉTAPE 3 — Upload justificatif
- Card 720x500 :
  • UploadZone (3.5) 600x240
  • Liste fichiers acceptés sous : "Acte de naissance, certificat de résidence,
    carte d'identité"
  • État après upload : preview thumbnail + checkmark + Remplacer

ÉTAPE 4 — Confirmation
- Card 720x600 :
  • Récap structuré : Champ + Avant/Après + Score + Justificatif preview
  • Checkbox "Je certifie sur l'honneur l'exactitude des informations"
  • Bouton "Soumettre la demande" disabled tant que checkbox non cochée
- Modal post-submit : succès + numéro demande COR-2026-001234 + lien vers
  PC-05 suivi

Mobile : stepper compact horizontal scroll, card full width.

Annotations + Light/Dark.
```

### 4.4 PC-04 — Prise de rendez-vous

```
Crée l'écran "PC-04 — Prise de rendez-vous" pour apps/citizen NINA-AES.

UTILISE : Header, MaliMap (3.7), PrioritySlot (3.12), Calendar (1.3 datepicker), Card,
Dialog.

LAYOUT desktop 1440x900 :
- Container 2 colonnes (640 + 640) gap 32 :
  • Gauche : Card "Choisissez votre centre"
    - MaliMap 600x500 interactif
    - Liste 3 centres dessous (radio cards) : CTDEC Bamako sélectionné,
      Mairie Comm. IV, Antenne mobile Sikasso
  • Droite : Card "Date et créneau"
    - Calendar mensuel mai 2026, jour 11 sélectionné (le suivant lundi)
    - Section "⚡ P1 (vous êtes prioritaire)" si vulnérable :
      4 PrioritySlot 07h30, 07h45, 08h00, 08h15 (1 selected)
    - Section "Standard P3" :
      4 PrioritySlot 09h00 → 09h45
- Bouton "Confirmer le RDV →" full width 56px en bas du panneau droit, solid

Modal post-confirmation 480x600 :
- Icône CheckCircle Lucide 64 color/success/500
- "RDV confirmé" 28 bold
- QR code 240x240 du RDV
- Détails : Centre + Date + Heure + N° file
- Boutons : Ajouter calendrier (.ics) + SMS recap

Mobile : map en haut full width, calendrier en dessous, slots scrollables
horizontal.

Annotations + Light/Dark.
```

### 4.5 PC-05 — Suivi

```
Crée l'écran "PC-05 — Suivi de demandes" pour apps/citizen NINA-AES.

UTILISE : CorrectionTimeline (3.6), Card, Badge, Button.

LAYOUT desktop 1440x900 :
- Header
- Container max-w-4xl centré, padding spacing/8
- Titre H1 "Mes demandes" 36 bold
- Liste de Cards verticale espacement spacing/4 (16px) :
  • Card 1 — Correction Cercle :
    - Header : titre + badge "REVIEW" warning + numéro COR-2026-001234
    - CorrectionTimeline 400x520 (3.6 path APPROVED en cours)
    - Stats : Statut courant, Délai estimé, Justificatif (lien preview)
    - Footer : Voir détail (outline) + Annuler (ghost danger)
  • Card 2 — RDV CTDEC Bamako :
    - Header : titre + badge "CONFIRMÉ" success
    - Mini-timeline 2 étapes (CONFIRMÉ → TERMINÉ)
    - Détails : date, heure, file P1
    - Boutons : Voir QR code + Reprogrammer

Empty state : "Aucune demande en cours — Vous êtes à jour 🎉" + CTA PC-03.

Mobile : Cards full width, timeline compacte verticale.

Annotations + Light/Dark.
```

### 4.6 PC-06 — Signalement anonyme

```
Crée l'écran "PC-06 — Signalement corruption (anonyme)" pour apps/citizen NINA-AES.

UTILISE : WhistleblowerForm (3.16) — composant déjà publié.

LAYOUT desktop 1440x900 :
- Header simplifié (sans burger menu utilisateur ni profil — anonymat)
- Titre H1 "Signaler un fait de corruption" 36 bold + sous-titre
  "Aidez à protéger l'intégrité du service public"
- WhistleblowerForm 720x900 centré (3.16)
- En bas : note sécurité fond color/neutral/900 texte color/neutral/100
  expliquant la protection juridique des lanceurs d'alerte (loi malienne)

Mobile : form 360x800 stack vertical.

États :
- Default (vide)
- Filled avec catégorie "Pots-de-vin" + description 850/2000 + 2 fichiers
- Submitted → modal token (cf. 3.16)

Annotations + Light/Dark.
```

### 4.7 AD-01 — Dashboard admin

```
Crée l'écran "AD-01 — Dashboard" pour apps/admin NINA-AES.

UTILISE : Card, Badge, AlertSeverityBadge (3.9), MaliHeatmap (3.7), composants
Recharts (sparkline + area chart).

LAYOUT desktop 1440x900 :
- Sidebar gauche persistante 240x900 fond color/neutral/0 (dark: neutral/900),
  shadow/sm :
  • Logo NINA-AES en haut
  • Nav vertical : 📊 Dashboard (active) · ✏️ Corrections · 📅 RDV · 🛡 SIGAC ·
    ⚙️ Config · 🚪 Sortir
- Topbar 64px : Titre "Dashboard" + searchbar + Avatar profil dropdown
- Content padding spacing/8 :
  • Grid 4 colonnes KPI Cards 280x140 :
    - "NINA actifs" 12 489 +234 (vert)
    - "Corrections" 84 +12 (warning si en hausse)
    - "Alertes" 17 ⚠ (danger pulse si CRITICAL > 0)
    - "RDV aujourd'hui" 326
    Chaque card : titre 14 medium uppercase color/neutral/500 + nombre 36 bold
    color/neutral/900 + variation petite + sparkline 200x40 SVG inline
  • Grid 2 colonnes (1.5fr / 1fr) :
    - Card area chart "Corrections / jour (30j)" 720x400 avec gradient
      color/primary/200 → color/primary/600
    - Card "Alertes critiques (live)" 480x400 :
      • Liste 5 AlertSeverityBadge + description tronquée 120 chars
      • Tag "live" pulse en haut droite
  • Card large 1200x400 "Activité par région — MaliHeatmap"

Mobile : sidebar transformée en drawer (Lucide Menu trigger), KPI en grid 2
colonnes, charts full width.

Annotations + Light/Dark.
```

### 4.8 AD-02 — Gestion corrections

```
Crée l'écran "AD-02 — Gestion corrections" pour apps/admin NINA-AES.

UTILISE : DataGrid (2.5), Drawer (2.2), AiScorePanel (3.4),
CorrectionTimeline (3.6).

LAYOUT desktop 1440x900 :
- Sidebar admin (cf. AD-01)
- Topbar
- Content :
  • Header section : titre "Corrections" + boutons globaux (Exporter CSV,
    Actions en lot)
  • Barre filtres 1200x56 : Combobox Statut + Combobox Région + RangeSlider
    Score IA + DateRange + Reset filtres + chip "8 filtres actifs"
  • DataGrid full width 1200x600 (cf. 2.5) avec données fictives 8 corrections
- Drawer right 480x900 ouvert (overlay) montrant détail correction
  COR-2026-001234 :
  • Header : numéro + close X
  • CitizenCard compact 440x180 (variant compact)
  • NinaDisplay grouped
  • Comparaison avant/après côte à côte
  • AiScorePanel vertical 440x440
  • Justificatif preview PDF intégré 440x300
  • CorrectionTimeline compact 440x300
  • Footer : Reject (outline danger) + Approve (solid success)

Mobile : DataGrid devient liste de Cards verticales, drawer plein écran.

Annotations + Light/Dark.
```

### 4.9 AD-03 — Dashboard SIGAC

```
Crée l'écran "AD-03 — Dashboard SIGAC" pour apps/admin NINA-AES.

UTILISE : MaliHeatmap (3.7), IntegrityScoreGauge (3.8), AlertSeverityBadge (3.9).

LAYOUT desktop 1440x900 :
- Sidebar admin
- Topbar avec sélecteur "Sévérité: TOUS ▾" + DateRange
- Content grid 2 colonnes (1.2fr / 1fr) :
  • Gauche : Card "Alertes par région" avec MaliHeatmap 700x600
    - Légende dégradée color/success/100 → color/danger/500 à droite
    - Stats sous la carte : "Total : 247 alertes · 17 CRITICAL · 42 HIGH"
  • Droite : Card "Top 10 agents — score d'intégrité" 480x600 :
    - Liste verticale : 5 verts (✓ icône CheckCircle) en haut, 5 rouges
      (✗ icône XCircle) en bas, séparateur "Agents à surveiller"
    - Chaque ligne : avatar 32 + nom 14 medium + IntegrityScoreGauge
      mini-version 80x80 + valeur
- Section bas : Card pleine largeur 1200x320 "Feed alertes temps réel" :
  • Tag "live" pulse animé en haut
  • Liste 8 alertes : [AlertSeverityBadge] + catégorie + heure + entité +
    bouton "Investiguer →"
  • Auto-scroll sur nouvelle alerte (animation)

Mobile : panneaux empilés verticalement.

Annotations + Light/Dark.
```

### 4.10 GOV-01 — Messagerie signée

```
Crée l'écran "GOV-01 — Messagerie officielle signée" pour apps/governance NINA-AES.

UTILISE : SignedMessageBubble (3.14), Avatar, Card, Badge.

LAYOUT desktop 1440x900 — 3 colonnes :
- Sidebar gauche 320px "Conversations" :
  • Searchbar en haut
  • Liste conversations triée par date :
    • ● MAT (3 non lus) · 13:42 · "Rappel ASCE-LC..."
    • ○ DNEC · 12:15 · "Plan T2 RAVEC"
    • ○ CTDEC · 09:08 · "Rapport mensuel"
    Conversation active : fond color/primary/50, bordure-left 4px
    color/primary/600
- Centre 720px "Fil messages" :
  • Header conversation : Avatar Ministre MAT + nom + classification badge
    "🟠 URGENT"
  • Fil messages avec SignedMessageBubble alternés (Émis / Reçu)
  • Composer en bas : Input 720x80 + bouton "Envoyer" + bouton "Joindre"
- Droite 400px "Détail / pièces jointes" :
  • Titre du message courant : "DIRECTIVE-2026-042"
  • Métadonnées : Émetteur, Date signature, Hash signature (mono tronqué)
  • Liste pièces jointes : icône PDF + nom + taille + hash SHA256
  • Classification "🟠 URGENT" badge
  • Bouton "Marquer accusé réception" solid

Mobile : navigation entre les 3 vues via Tabs en haut (Conversations / Messages /
Détail).

Annotations + Light/Dark.
```

### 4.11 GOV-02 — Directives Kanban

```
Crée l'écran "GOV-02 — Directives Kanban" pour apps/governance NINA-AES.

UTILISE : DirectiveCard (3.13), Avatar, Badge.

LAYOUT desktop 1440x900 :
- Topbar avec titre + filtres : Combobox institution + DateRange + bouton
  "+ Nouvelle directive"
- Container 5 colonnes Kanban gap 16, scroll horizontal si nécessaire :
  • DRAFT (3 cards)
  • SENT (5 cards)
  • IN_PROGRESS (8 cards) — montrer 1 card "en retard" avec bordure rouge
  • COMPLETED (12 cards montrer 4 + "+8 autres")
  • REJECTED (1 card)

  Chaque colonne :
  - Header 48px : nom statut + compteur badge
  - Body scroll vertical, gap 12 entre cards
  - Footer "+ Ajouter une directive" ghost button

DirectiveCard exemple : Plan d'action RAVEC T2 2026, deadline 06/05, assignee
M. Touré, escalade niveau 2.

Indication drag-and-drop : ombre fantôme + ligne d'insertion entre deux cards
(motion).

Mobile : 1 colonne visible à la fois, swipe horizontal entre statuts (Tabs en
haut "1/5 DRAFT").

Annotations + Light/Dark.
```

### 4.12 USSD-01 — Simulateur USSD

```
Crée l'écran "USSD-01 — Simulateur USSD" page de dev tool NINA-AES.

UTILISE : UssdSimulator (3.17).

LAYOUT desktop 1440x900 :
- Topbar simple : "Simulateur USSD *123*NINA#" + lien "Documentation"
- Container 3 colonnes :
  • Gauche 360 : informations de session + numéro téléphone configurable
    (input "+22376547842")
  • Centre 360 : UssdSimulator (3.17) téléphone vertical
  • Droite 720 : panneau debug live :
    - Statut session Redis
    - Historique des requêtes (timeline) : POST /ussd avec sessionId,
      text accumulé, response retournée
    - Boutons "Reset session" + "Copier curl command"

Annotations + Light (le simulateur a son propre rendu LCD, donc le mode dark
de l'écran ambiant change mais pas le téléphone).
```

---

## §5 — Audit a11y et exports

### 5.1 Audit WCAG 2.2 AA

À lancer sur **chaque écran après génération** :

```
Audit cet écran (sélection courante) selon WCAG 2.2 AA.

Vérifie et marque chaque problème avec un bandeau ⚠️ rouge à côté de
l'élément :

1. CONTRASTE
   - Texte body normal ≥ 4.5:1
   - Texte large (≥ 18pt ou 14pt bold) ≥ 3:1
   - Composants UI (icônes, bordures actives) ≥ 3:1

2. FOCUS
   - Tous les éléments interactifs ont un focus visible (3px ring)
   - Le focus n'est jamais masqué par un autre élément (overflow:hidden)

3. TOUCH TARGETS
   - Mobile : ≥ 44x44 px (idéal 48x48)
   - Pas de cibles trop proches l'une de l'autre (min 8px gap)

4. STRUCTURE
   - Un seul H1 par page
   - Hiérarchie H2/H3/H4 logique (pas de saut H1→H3)
   - Liste sémantique (ul/ol) pour les listes

5. ARIA
   - Tous les boutons icône ont un aria-label
   - Les regions (header, nav, main, aside, footer) sont identifiables
   - aria-live="polite" sur les zones de mise à jour dynamique

Après l'audit, propose un duplicata corrigé de l'écran avec les ajustements.
```

### 5.2 Variants mode sombre (à lancer une fois le claire validé)

```
Génère les variants Dark Mode des frames sélectionnés.

Règles de swap :
- color/neutral/50  → color/neutral/950
- color/neutral/100 → color/neutral/900
- color/neutral/200 → color/neutral/800
- color/neutral/300 → color/neutral/700
- color/neutral/700 → color/neutral/300
- color/neutral/900 → color/neutral/100
- Les couleurs sémantiques (primary, accent, success, etc.) gardent leur
  nuance ; ajuster vers la nuance 400 pour les CTAs (meilleur contraste sur
  fond sombre)
- Ombres : opacité +20% (les ombres sont plus subtiles en dark)
- Bordures : passer de neutral/200 à neutral/800

Place les Dark frames à droite des Light, espacement spacing/16 (64px).
```

### 5.3 Export tokens retour vers le repo

À la fin du process :

1. **Tokens Studio for Figma → Sync → Push to GitHub** (configurer une fois dans le plugin avec
   votre PAT GitHub).
2. Le plugin pousse `tokens.json` mis à jour dans une branche `design-tokens/sync-2026-MM-DD`.
3. Ouvrir une PR vers `main`, lancer `pnpm dlx style-dictionary build` pour régénérer les CSS /
   Tailwind / RN.

### 5.4 Export Figma → code (preview)

Pour générer un squelette React de chaque écran :

```
[Plugin Anima ou Figma Dev Mode]
1. Sélectionner le frame Desktop d'un écran
2. Plugin Anima → React + Tailwind + TypeScript
3. Copier le code généré
4. Coller dans apps/citizen/app/(routes)/<route>/_generated.tsx
5. Refactoriser pour utiliser les composants @nina-aes/ui réels
```

⚠️ Le code Anima n'est **jamais** prêt pour la prod : il sert de squelette pour gagner ~2-4h par
écran sur le scaffolding initial. Le PROMPT 5.x réécrira la version finale en consommant
`@nina-aes/ui` et les hooks TanStack Query.

---

## §6 — Conseils transversaux pour Figma Make

| Astuce                                                                            | Pourquoi                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Préfixer chaque prompt par "NINA-AES, plateforme d'identité numérique souveraine" | Évite la régression vers le look Bootstrap admin                |
| Citer les noms de tokens **explicitement** (`color/primary/600`, pas "bleu")      | Figma Make pioche dans vos variables si on les nomme            |
| Donner les dimensions **en pixels**                                               | "Card medium" est ambigu, "240x180" ne l'est pas                |
| Limiter à **3-5 frames par prompt**                                               | Au-delà, Figma Make régresse en qualité                         |
| Sauvegarder le **prompt en commentaire** sur le 1er composant réussi              | Facilite la reproduction                                        |
| Pour les **données maliennes** : fournir la liste explicitement                   | Sinon Figma met "John Doe" partout                              |
| Pour les **illustrations souveraines** : dessiner d'abord en Inkscape             | Figma Make ne maîtrise pas les références culturelles maliennes |
| **Tester en bambara avant merge**                                                 | C'est la langue qui expansionne le plus le texte                |

---

## §7 — Plan d'attaque temporel

| Jour | Durée | Tâche                                                                               |
| ---- | ----- | ----------------------------------------------------------------------------------- |
| 1    | 2 h   | Setup tokens (§0) + cover design system (§0.3)                                      |
| 2    | 4 h   | Composants atomiques §1.1 → §1.5                                                    |
| 3    | 4 h   | Composants display + containers §2.1 → §2.5                                         |
| 4    | 4 h   | Composants métier §3.1 → §3.6 (NINA + AI + UploadZone + Timeline)                   |
| 5    | 4 h   | Composants métier §3.7 → §3.12 (MaliMap + Score + Badge + i18n + Country + Slot)    |
| 6    | 3 h   | Composants métier §3.13 → §3.17 (Directive + Bubble + Whistleblower + Kiosk + USSD) |
| 7    | 3 h   | Audit a11y §5.1 + variants Dark §5.2 sur tous les composants                        |
| 8    | 8 h   | Écrans Citoyen §4.1 → §4.6 (1h chacun + 2h tampon)                                  |
| 9    | 4 h   | Écrans Admin §4.7 → §4.9                                                            |
| 10   | 3 h   | Écrans Gouvernance + USSD §4.10 → §4.12                                             |
| 11   | 2 h   | Audit a11y §5.1 sur tous les écrans                                                 |
| 12   | 2 h   | Export tokens §5.3 + commit dans le repo                                            |

**Total : ~43 h** (estimé un peu plus large que les 27h initiales pour tenir compte des itérations
qualité).
