# NINA-AES — Maquettes des 12 écrans (spec Figma + dev)

> Compagnon de `design-system.md`. Pour chaque écran : **layout** (wireframe ASCII + notes Figma) ·
> **composants** utilisés · **données fictives maliennes** · **interactions** · **states** (loading
> / error / empty / success) · **responsive** (mobile / tablet / desktop) · **a11y**.
>
> Ces wireframes servent de cahier de charges pour le designer Figma puis directement de spec
> d'implémentation pour le PROMPT 5.1 qui produira le code Next.js.

---

## Portail Citoyen (`apps/citizen`)

### PC-01 — Accueil

> **MàJ 2026-07-06 (CHANGELOG 0sexvicies)** — Implémenté avec nav hybride (Accueil / Centres CTDEC /
> Aide ; `/centres` + `/aide` créées), hero clair tricolore (drapeaux + accroche qualitative **sans
> chiffre fabriqué**), cartes décrites, section « Comment ça marche » et **FAQ** (`Accordion`,
> partagée avec /aide). Recherche : route `/nina/[nina]` conservée (pas `/recherche?nina=`). NINA
> d'exemple : `18903102015042V` (lettre de contrôle **V**).

**Objectif** : page d'entrée publique. Doit signer immédiatement l'identité AES, proposer la
recherche NINA en grand, et expliquer la valeur du portail.

**Layout (desktop ≥ 1024 px)** :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [LOGO NINA-AES] [À propos] [Centres CTDEC] [Aide]    [🇲🇱 FR ▾] [Connexion]│ ← header sticky
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ╔══════════════════════════════════════════════════════════════╗      │
│   ║  Hero animé tricolore (vert / jaune / rouge — drapeau Mali)  ║      │
│   ║                                                              ║      │
│   ║   « Mon identité, mon NINA, mon AES »                        ║      │
│   ║                                                              ║      │
│   ║  ┌─────────────────────────────────────────────┐  ┌────────┐║      │
│   ║  │  [NinaInput] _ __ __ _ __ ___ ___ _         │  │ Rechercher │     │
│   ║  └─────────────────────────────────────────────┘  └────────┘║      │
│   ╚══════════════════════════════════════════════════════════════╝      │
│                                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│   │ 📄 Voir  │  │ ✏️ Demander│  │ 📅 Prendre│  │ 🛡 Signaler│              │
│   │ ma fiche │  │ correction │  │ RDV     │  │ corruption│              │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                │
│                                                                          │
│   « Pourquoi NINA-AES ? » (3 colonnes éducatives + illustrations)        │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Footer : CTDEC · DNEC · Mentions · Vie privée · Contact · 🇲🇱🇧🇫🇳🇪      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Composants** : `Header` (custom) · `Button` (5 variants) · `NinaInput` · `LanguageSelector` ·
`Card` (4 actions) · 3× section éducative (illustrations Lucide custom) · `AESCountrySwitcher`
(footer).

**Données fictives** : aucune (page publique).

**Interactions** :

- `NinaInput` autofocus au chargement
- Hero : animation `motion.duration.xslow` + `motion.easing.spring` au mount, désactivée si
  `prefers-reduced-motion: reduce`
- Cartes d'action : hover → `shadow.md` + `translateY(-2px)`, click → navigate
- `LanguageSelector` : dropdown avec drapeau emoji + nom natif

**States** :

- _loading_ : Skeleton sur le hero pendant 200 ms max
- _error_ : si l'API `/healthz` échoue, bannière warning « Service en maintenance »
- _empty/success_ : N/A (page statique)

**Responsive** :

- `xs (360 px)` : hero plein écran, NinaInput sur 1 ligne (input seul + bouton dessous), cartes
  d'action en `grid-cols-1`
- `md (768 px)` : cartes en `grid-cols-2`
- `lg (1024 px)` : cartes en `grid-cols-4`, layout final

**A11y** : skip-link en début, hero `<h1>` unique sur la page, contraste texte hero 6:1 minimum,
`LanguageSelector` ouvrable au clavier (Espace / Entrée).

---

### PC-02 — Résultat de recherche NINA

> **MàJ 2026-07-06 (CHANGELOG 0sexvicies)** — Implémenté avec chrome (SiteHeader/SiteFooter),
> données en `Tabs` (Identité / Lieu de naissance / Filiation) + `Alert` info. Écarts assumés
> (principe données honnêtes) : onglet « Résidence » et score de confiance IA **omis** (non encodés
> dans le NINA / fabriqués) ; téléchargement FDI **désactivé** (document-service non câblé). Route
> `/nina/[nina]`.

**Objectif** : afficher la fiche d'identité après une recherche réussie, permettre de télécharger la
FDI ou de signaler une erreur.

**Layout (desktop ≥ 1024 px)** :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Header]                                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Breadcrumb: Accueil > Résultat NINA                                       │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ╭────────╮                                              ╭─────────╮│ │
│ │ │ Photo  │  Fatoumata DIALLO                            │ ✅ FDI  ││ │
│ │ │ 120x150│  née le 15/03/1989 · Féminin · Célibataire    │ vérifiée││ │
│ │ │   📷   │  NINA  : 1 89 03 1 02 015 042 Z                ╰─────────╯│ │
│ │ │        │  Profession : Couturière                                  │ │
│ │ ╰────────╯                                                           │ │
│ │                                                                       │ │
│ │ ─────────────────────────────────────────────────────────────────────│ │
│ │ Lieu de naissance : 🇲🇱 Mali > Sikasso > Sikasso > Sikasso > Centre      │ │
│ │                     > Wayerma > Médine > —                                │ │
│ │ Résidence       : 🇲🇱 Mali > District de Bamako > Commune IV > Lafiabougou│ │
│ │                                                                       │ │
│ │ Père : Modibo DIALLO                                                  │ │
│ │ Mère : Aminata TRAORÉ                                                 │ │
│ │                                                                       │ │
│ │ [📄 Télécharger ma FDI signée]    [✏️ Signaler une erreur]              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Composants** : `Breadcrumb` · `CitizenCard` (custom) · `Avatar` size `xl` · `NinaDisplay`
format=`grouped` · `Badge` ai-verified · 8-niveaux breadcrumb géographique (custom) · 2× `Button`
solid + outline.

**Données fictives** : Citizen seedé, ex. NINA `18903102015042V` (Fatoumata Diallo).

**Interactions** :

- Click photo → modal preview pleine taille
- Click « Télécharger FDI » → `Button loading` puis téléchargement signed URL MinIO
- Click « Signaler une erreur » → navigate vers PC-03 avec NINA pré-rempli

**States** :

- _loading_ : Skeleton sur tout le bloc (forme du card)
- _error_ (404) : EmptyState « NINA non trouvé » + retour PC-01
- _empty_ : N/A (s'il n'y a pas de résultat → 404)

**Responsive** :

- `xs` : photo en haut, infos dessous, actions en pile
- `md` : layout 2-colonnes commencé
- `lg` : layout final

**A11y** : photo a un `alt="Photo de Fatoumata Diallo"` (nom du citoyen), tous les liens breadcrumb
sont focusables, badge IA expose son score via `aria-label`.

---

### PC-03 — Demande de correction (wizard 4 étapes)

> **MàJ 2026-07-06 (CHANGELOG 0septvicies)** — Wizard enrichi : `Stepper` partagé (libellés courts),
> carte « Fiche concernée », étape 2 en 2 colonnes (formulaire + **comparaison avant/après** avec la
> valeur actuelle réelle issue de la fiche) et `UploadZone` partagé (zone de dépôt) + vignette
> honnête « non envoyé ». **Score IA** rendu honnête : similarité **Jaro-Winkler calculée
> localement** (module `similarity.ts`, déterministe, sans réseau ni modèle), affichée via
> `AiScorePanel` avec disclaimer « pas le score définitif ». Écarts assumés (données honnêtes) : pas
> de debounce/mutation IA serveur ni redirect PC-05 (→ `/dashboard`) ; justificatif validé
> localement mais **non envoyé** (document-service non câblé) ; champs sans valeur actuelle connue
> (résidence en démo) → comparaison « indisponible », rien de fabriqué. Route
> `/nina/[nina]/correction`.

**Layout** :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Header]                                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Demande de correction · Étape 2 / 4                                       │
│ ●━━━●━━━○━━━○                                                            │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Étape 2 : Nouvelle valeur                                           │ │
│ │                                                                     │ │
│ │ Champ à corriger : Cercle (lieu de résidence)                       │ │
│ │                                                                     │ │
│ │ ┌──────────────────────┐    ┌──────────────────────┐                │ │
│ │ │ Avant : « Sikaso »   │    │ Après : « Sikasso  » │                │ │
│ │ └──────────────────────┘    └──────────────────────┘                │ │
│ │                                                                     │ │
│ │ Score IA en temps réel  : ████████░░ 92 / 100   ✅ Haute confiance   │ │
│ │ Estimation délai        : 24-48h après upload du justificatif       │ │
│ │                                                                     │ │
│ │ [Précédent]                                          [Continuer →]  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**4 étapes** :

1. **Choix du champ** — `Combobox` avec liste des champs corrigibles (firstName, lastName, commune,
   …) ; chacun affiche la valeur actuelle.
2. **Nouvelle valeur** (illustré ci-dessus) — `Input` ou `Combobox` selon le champ + `AiScorePanel`
   mis à jour à chaque frappe via debounce 300 ms.
3. **Upload justificatif** — `UploadZone` (drag-drop), 10 Mo max, PDF/JPG/PNG/HEIC.
4. **Confirmation** — récap + checkbox « Je certifie sur l'honneur l'exactitude » + `Button` solid «
   Soumettre ».

**Composants** : `Stepper` · `Card` · `Combobox` · `Input` · `AiScorePanel` · `UploadZone` ·
`Button` · `Checkbox`.

**Données fictives** : champ `cercle`, valeur actuelle `"Sikaso"`, valeur proposée `"Sikasso"` ; le
score IA est calculé live.

**Interactions** :

- Navigation stepper bidirectionnelle (clic sur une étape passée pour y retourner)
- Score IA recalculé via TanStack Query mutation debounced
- Upload : preview thumbnail + barre de progression
- Submit final : `Button loading` + redirection vers PC-05 (suivi)

**States** :

- _loading IA_ : score affiche `Spinner sm` à la place du nombre
- _error IA_ : Alert warning « Score indisponible — votre demande sera examinée manuellement »
- _error upload_ : Toast danger + retry button

**Responsive** :

- `xs` : stepper en horizontal scroll, comparaison avant/après en pile
- `md` : stepper visible complet, comparaison côte-à-côte

**A11y** : `aria-current="step"` sur étape courante, `Stepper` navigable au clavier, upload zone
supporte le clavier (Espace ouvre le file picker).

---

### PC-04 — Prise de rendez-vous

**Layout** :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Header]                                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ Prendre rendez-vous                                                       │
│                                                                          │
│ ┌──────────────────────────────┐  ┌──────────────────────────────────┐  │
│ │  Choisissez votre centre :   │  │  Date et créneau                 │  │
│ │                              │  │                                  │  │
│ │  [MaliMap interactif]        │  │  ┌──────────────────┐             │  │
│ │   régions cliquables          │  │  │ Mai 2026          │             │  │
│ │                              │  │  │  L M M J V S D    │             │  │
│ │  ⊙ CTDEC Bamako (89 km)      │  │  │   1 2 3 4 5 6 7   │             │  │
│ │  ○ Mairie Comm. IV          │  │  │   8 9 10 ◉ 12 …   │             │  │
│ │  ○ Antenne mobile Sikasso   │  │  └──────────────────┘             │  │
│ │                              │  │                                  │  │
│ │                              │  │  ⚡ P1 (vous êtes prioritaire)    │  │
│ │                              │  │  • 07h30 ◉                       │  │
│ │                              │  │  • 07h45                         │  │
│ │                              │  │                                  │  │
│ │                              │  │  Standard P3                     │  │
│ │                              │  │  • 09h00                         │  │
│ │                              │  │  • 09h15                         │  │
│ │                              │  │  • 09h30                         │  │
│ │                              │  │                                  │  │
│ │                              │  │  [Confirmer le RDV →]            │  │
│ └──────────────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Modal de confirmation** : QR code du RDV + détails + bouton « Ajouter au calendrier » (.ics) et «
Envoyer par SMS ».

**Composants** : `MaliMap` (D3) · `Card` (centre sélectionné) · `Calendar` (shadcn) · `PrioritySlot`
· `Button` solid · `Dialog` (confirmation) · QR code SVG.

**Données fictives** : centres seedés (CTDEC Bamako, Mairie Comm. IV, Gouvernorat Kayes) ; créneaux
fictifs.

**Interactions** :

- Click région → centres filtrés + map zoom
- Click créneau → met en surbrillance + active le bouton confirmer
- Confirmation → mutation API + ouverture modal QR code

**States** :

- _empty_ : « Aucun créneau disponible cette semaine — proposer la suivante »
- _vulnérable_ : badge automatique « Vous êtes prioritaire » si `vulnerabilityCategory` présent sur
  le profil

**Responsive** :

- `xs` : map en haut, calendrier dessous (full width)
- `lg` : layout 2 colonnes ci-dessus

**A11y** : la map est aussi accessible via une liste équivalente (toggle), créneaux sélectionnables
au clavier (flèches haut/bas).

---

### PC-05 — Suivi de demande

**Layout** :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Mes demandes                                                              │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Correction « Cercle » · #COR-2026-001234 · 📅 02/05/2026             │ │
│ │                                                                     │ │
│ │  ●─────────●─────────●─────────○─────────○                          │ │
│ │  DRAFT    SUBMITTED  REVIEW    APPROVED  COMPLETED                  │ │
│ │  02/05    02/05      02/05     —         —                          │ │
│ │  09:12    09:15      09:23                                          │ │
│ │                                                                     │ │
│ │ 📌 Statut courant : sous revue par superviseur                      │ │
│ │ ⏰ Délai estimé    : 24h                                             │ │
│ │ 📁 Justificatif    : justif_acte_naissance.pdf (vérifié ✅)          │ │
│ │                                                                     │ │
│ │ [Voir le détail]   [Annuler la demande]                              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Rendez-vous · CTDEC Bamako · 11/05/2026 · 07h30 (file P1)            │ │
│ │  ●─────────○                                                        │ │
│ │  CONFIRMÉ  TERMINÉ                                                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Composants** : `Card` (par demande) · `CorrectionTimeline` (custom) · `Badge` statut · `Button`
outline / ghost.

**Données fictives** : 2 demandes (1 correction + 1 RDV) liées au citoyen Fatoumata Diallo.

**Interactions** :

- Auto-refresh toutes les 30 s (TanStack Query `refetchInterval`)
- Notif push browser si statut change pendant que la page est ouverte

**States** :

- _empty_ : EmptyState « Aucune demande en cours » + CTA vers PC-03

---

### PC-06 — Signalement corruption (anonyme)

**Layout** :

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────────────────────────┐│
│ │ 🛡 Mode anonyme actif                                                 ││
│ │ Aucune adresse IP, cookie ou identifiant n'est enregistré.            ││
│ └──────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│ Catégorie  : ○ Pots-de-vin  ○ Faux documents  ○ Favoritisme              │
│              ○ Abus de pouvoir  ○ Marchés publics  ○ Autre                │
│                                                                          │
│ Description : ┌──────────────────────────────────────────────────────┐  │
│               │ (libre, 200-2000 caractères)                          │  │
│               │                                                       │  │
│               │                                                       │  │
│               └──────────────────────────────────────────────────────┘  │
│                                                              0/2000      │
│                                                                          │
│ Pièces jointes (audio, photo, doc) — facultatif                          │
│ [UploadZone — drag-drop, max 5 fichiers, 50 Mo total]                    │
│                                                                          │
│ ⚠ Conservez bien le token qui vous sera remis pour suivre l'instruction. │
│                                                                          │
│             [Annuler]                  [Soumettre le signalement →]      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Modal post-soumission** : token chiffré (ex. `WGRZ-1XK2-FN8M`) + QR code à scanner / sauvegarder +
bouton « Télécharger en PDF protégé par mot de passe ».

**Composants** : Banner Alert info (mode anonyme) · `RadioGroup` catégorie · `Textarea` description
· `UploadZone` · `Button` · `Dialog` confirmation avec token.

**A11y** : Banner mode anonyme est `role="status"` (lu en priorité), formulaire utilisable sans
cookie / sans JS si possible (fallback POST classique).

---

## Admin (`apps/admin`)

### AD-01 — Dashboard

**Layout** :

```
┌──────────────┬─────────────────────────────────────────────────────────────┐
│  AdminSidebar│  Dashboard                                       [User ▾]    │
│  ━━━━━━━━━━━ │ ─────────────────────────────────────────────────────────── │
│  📊 Dashboard│ ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                       │
│  ✏️ Correct.  │ │ NINA │  │ Corr.│  │ Alert│  │ RDV  │   KPIs avec sparkline  │
│  📅 RDV      │ │12 489│  │ 84↑  │  │ 17 ⚠│  │ 326  │                       │
│  🛡 SIGAC    │ └──────┘  └──────┘  └──────┘  └──────┘                       │
│  ⚙️ Config    │                                                              │
│  🚪 Sortir   │ ┌──────────────────────────────┐  ┌──────────────────────┐  │
│              │ │ Corrections / jour (30j)     │  │ Alertes critiques    │  │
│              │ │ ┌──────────────────────────┐│  │ ⚠ Tentative usurp.  │  │
│              │ │ │   ▆▆██▆▆▇█▆▅▅▆█▇▆▅      │ │  │   13:42 · M. Touré   │  │
│              │ │ └──────────────────────────┘│  │ 📷 Falsif. photo    │  │
│              │ └──────────────────────────────┘  │   13:18 · M. Diallo  │  │
│              │                                   │ 📑 Demande en doubl. │  │
│              │ ┌──────────────────────────────┐  │   13:01 · F. Coulib. │  │
│              │ │ MaliHeatmap activité régions ││  │ ...                  │  │
│              │ └──────────────────────────────┘  └──────────────────────┘  │
└──────────────┴─────────────────────────────────────────────────────────────┘
```

**Composants** : `AdminSidebar` (custom) · 4× `Card` KPI avec sparkline SVG inline · `AreaChart`
Recharts · `MaliHeatmap` · feed scrollable d'`AlertSeverityBadge`.

**Données fictives** : KPIs du jour (12 489 NINA actifs, 84 corrections en attente, 17 alertes, 326
RDV).

**Interactions** :

- Click KPI → drill-down vers la liste correspondante
- Hover sparkline → tooltip avec valeur exacte
- Feed alertes : auto-update via Server-Sent Events (SSE)

**Responsive** :

- `xs` : sidebar transformée en drawer (icône burger), KPIs en pile
- `lg` : layout final

---

### AD-02 — Gestion corrections (DataGrid)

**Layout** : DataGrid pleine largeur avec barre de filtres en haut et drawer latéral qui s'ouvre au
clic d'une ligne.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [🔎 Recherche]  [Statut ▾]  [Région ▾]  [Score IA ▾]  [Date ▾]   [X filtres]│
├──┬─────────┬──────────┬────────────┬────────────┬──────┬──────────┬───────┤
│ ☐│ NINA   │ Champ    │ Avant      │ Après      │ Score│ Statut   │ Actions│
├──┼─────────┼──────────┼────────────┼────────────┼──────┼──────────┼───────┤
│ ☐│ 1890… │ cercle   │ Sikaso     │ Sikasso    │  92 ●│ REVIEW   │ ▾     │
│ ☐│ 2912… │ lastName │ Toure      │ Touré      │  88 ●│ APPROVED │ ▾     │
│ ☐│ 1850… │ commune  │ Bla        │ Blá        │  64 ●│ REVIEW   │ ▾     │
│ ☐│ 2031… │ commune  │ Mopti      │ Sevaré     │  31 ●│ REJECTED │ ▾     │
└──┴─────────┴──────────┴────────────┴────────────┴──────┴──────────┴───────┘
                                                       [‹ 1 2 3 ... 12 ›]
```

**Drawer détail (à droite, 480 px)** :

```
┌──────────────────────────────────────────┐
│ Correction #COR-2026-001234           [X]│
├──────────────────────────────────────────┤
│ Citoyen : Fatoumata DIALLO               │
│ NINA    : 1 89 03 1 02 015 042 Z         │
│                                          │
│ Champ : cercle                           │
│ ┌─────────────┐ → ┌─────────────┐         │
│ │  Sikaso     │   │  Sikasso    │         │
│ └─────────────┘   └─────────────┘         │
│                                          │
│ AiScorePanel : 92 / 100 ✅                │
│   • Fuzzy match  : 95                    │
│   • Cohérence    : 89                    │
│   • Hist. agent  : 91                    │
│                                          │
│ Justificatif : [aperçu PDF intégré]      │
│                                          │
│ CorrectionTimeline ─────────────         │
│                                          │
│ [✗ Rejeter]              [✓ Approuver]   │
└──────────────────────────────────────────┘
```

**Composants** : `DataGrid` (custom Radix Table) · multi-filtres `Combobox` · `Drawer` right ·
`CitizenCard` compact · `NinaDisplay` · `AiScorePanel` · `CorrectionTimeline` · `Button` solid
danger / success.

**Interactions** : sélection multiple → actions en lot (approuver / rejeter / assigner).

---

### AD-03 — Dashboard SIGAC

**Layout** :

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Dashboard SIGAC                            [Sévérité: TOUS ▾] [Période ▾]  │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────┐  ┌──────────────────────────────────────┐ │
│ │ MaliHeatmap alertes/région  │  │ Top 10 agents — score d'intégrité    │ │
│ │   (rouge = nb élevé)        │  │ ─────────────────────────────────── │ │
│ │                             │  │ ✓ Modibo K.    97 ████████████      │ │
│ │   ▓▓▓░░ Bamako              │  │ ✓ Aminata T.   95 ████████████      │ │
│ │   ▓░░░░ Sikasso             │  │ ✓ Mariam S.    92 ████████████      │ │
│ │   ░░░░░ Kidal               │  │ ✗ Oumar C.     58 ████████░░░░      │ │
│ │                             │  │ ✗ Fanta D.     42 █████░░░░░░       │ │
│ └─────────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                            │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Feed temps réel des alertes                                            │ │
│ │ ⚠ HIGH      · Pots-de-vin       · 13:42 · CTDEC Bamako · Investiguer →│ │
│ │ ⚠ CRITICAL  · Faux document     · 13:18 · DNEC         · Investiguer →│ │
│ │ ⚠ MEDIUM    · Favoritisme       · 13:01 · Mairie IV    · Investiguer →│ │
│ │ ...                                                                    │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

**Composants** : `MaliHeatmap` · `IntegrityScoreGauge` (× 10) · liste `AlertSeverityBadge`

- description tronquée.

**Interactions** : click région map → filter alertes ; click agent → drill-down profil ; click
alerte → ouvre dossier d'investigation.

---

## Gouvernance (`apps/governance`)

### GOV-01 — Messagerie officielle signée

**Layout (3 colonnes)** :

```
┌────────────┬─────────────────────────────┬─────────────────────────────┐
│ Conversations│  Fil messages               │  Détail / pièces jointes    │
│ ─────────── │ ──────────────────────────  │ ──────────────────────────  │
│ 🔍 Recherche│ Ministre MAT — DNEC          │ DIRECTIVE-2026-042          │
│             │                             │                             │
│ ● MAT (3)   │  ┌─────────────────────┐   │ Émetteur : Ministre MAT     │
│   13:42     │  │ Rappel ASCE-LC      │   │ Signé    : 02/05 13:42      │
│ ○ DNEC      │  │ ─────────────────── │   │ Hash sig : a3f4...8b2 ✅     │
│   12:15     │  │ Référence: DR-042   │   │                             │
│ ○ CTDEC     │  │ Bonjour, ...        │   │ Pièces jointes :             │
│   09:08     │  │ ...                  │   │ 📎 directive_RAVEC.pdf 2.4Mo│
│             │  │ 🛡 Ed25519 ✅        │   │   Hash SHA256 : f1c...      │
│             │  │ Lu : 13:50          │   │ 📎 annexe_loi.pdf      890ko│
│             │  └─────────────────────┘   │                             │
│             │                             │ Classification : 🟠 URGENT   │
│             │  [Composer une réponse →]   │                             │
│             │                             │ [Marquer accusé réception]  │
└────────────┴─────────────────────────────┴─────────────────────────────┘
```

**Composants** : Liste `Card` conversations · `SignedMessageBubble` (custom) · panneau détail avec
fingerprint clé publique tooltip · `Badge` classification urgence.

---

### GOV-02 — Directives Kanban

**Layout** :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Directives                              [Filtre institution ▾] [Mois ▾]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ DRAFT (3)    │ SENT (5)     │ IN_PROG. (8) │ COMPLETED (12)│ REJECTED (1)   │
│ ──────────── │ ──────────── │ ──────────── │ ──────────── │ ──────────────  │
│ ┌──────────┐│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────────┐│
│ │ Audit    ││ │ Plan     │ │ │ Recensem.│ │ │ Décret   │ │ │ Demande      ││
│ │ trim. T2 ││ │ RAVEC    │ │ │ Kayes    │ │ │ #2025-89 │ │ │ rejetée      ││
│ │  ⚠ J-3   ││ │  06/05   │ │ │  P1 🔴   │ │ │  ✅      │ │ │  Motif: ..   ││
│ │ Avatar X ││ │ Avatar Y │ │ │ Esc. n.2 │ │ │  09/04   │ │ │  09/04       ││
│ └──────────┘│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────────┘│
│ ┌──────────┐│ ┌──────────┐ │ ┌──────────┐ │ ...          │                │
│ │ ...      ││ │ ...      │ │ │ ...      │ │              │                │
│ └──────────┘│ └──────────┘ │ └──────────┘ │              │                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Composants** : `DirectiveCard` (custom) draggable via `@dnd-kit/core` · 5 colonnes Kanban ·
`Avatar` destinataire · `Badge` deadline / escalade.

**Interactions** : drag-and-drop entre colonnes (mute si pas la permission), click card → modal
détail.

**A11y** : drag-and-drop accessible au clavier (Espace pour ramasser, flèches pour déplacer, Espace
pour déposer — convention `@dnd-kit/accessibility`).

---

## USSD (simulateur)

### USSD-01 — Simulateur USSD (Bloc A + C1)

**Layout** : reproduction fidèle d'un téléphone Nokia 3310 — écran 160 × 128 px scale 2x.

```
       ╭────────────────────────────────╮
       │  📶📵  NINA-AES   12:34         │
       │ ─────────────────────────────── │
       │  Bisimila!                      │
       │  Choisissez la langue :         │
       │                                 │
       │   1. Français                   │
       │   2. Bamanankan                 │
       │   3. Soninké                    │
       │   4. Fulfulde                   │
       │   5. Tamasheq                   │
       │   6. Hausa                      │
       │   7. Mooré                      │
       │   8. Zarma                      │
       │                                 │
       │ [Répondre]            [Annuler] │
       ╰────────────────────────────────╯
              ┌─────────────────┐
              │ 1 │ 2 │ 3 │      │  ← clavier numérique
              │ 4 │ 5 │ 6 │      │
              │ 7 │ 8 │ 9 │      │
              │ * │ 0 │ # │      │
              └─────────────────┘
```

**Composants** : `UssdSimulator` (custom) qui appelle `POST /ussd` du `ussd-service` ·
`KioskKeyboard` adapté (12 touches) · panneau debug à droite (sessionId Redis, text accumulé).

**Interactions** : Tap touche → ajoute au champ saisie ; bouton « Répondre » → envoie au service ;
transition slide entre menus avec `motion.duration.fast`.

**A11y** : keyboard physique aussi accepté (touche `1` du clavier PC = touche `1` du sim), focus
visible sur les touches.

---

## Récapitulatif d'implémentation

| Écran   | App        | Composants métier critiques                     | Endpoint API                      |
| ------- | ---------- | ----------------------------------------------- | --------------------------------- |
| PC-01   | citizen    | NinaInput, LanguageSelector                     | —                                 |
| PC-02   | citizen    | CitizenCard, NinaDisplay                        | GET /citizens/:nina               |
| PC-03   | citizen    | AiScorePanel, UploadZone, Stepper               | POST /correction-requests         |
| PC-04   | citizen    | MaliMap, PrioritySlot, Calendar                 | POST /appointments                |
| PC-05   | citizen    | CorrectionTimeline                              | GET /corrections/me               |
| PC-06   | citizen    | WhistleblowerForm                               | POST /sigac/whistleblower/reports |
| AD-01   | admin      | KPI Cards, MaliHeatmap, AlertSeverityBadge feed | GET /admin/dashboard              |
| AD-02   | admin      | DataGrid, AiScorePanel, CorrectionTimeline      | GET / PATCH /corrections          |
| AD-03   | admin      | MaliHeatmap, IntegrityScoreGauge, alerts feed   | GET /sigac/whistleblower/queue    |
| GOV-01  | governance | SignedMessageBubble                             | GET / POST /messages              |
| GOV-02  | governance | DirectiveCard (Kanban)                          | GET / PATCH /directives           |
| USSD-01 | dev tool   | UssdSimulator, KioskKeyboard                    | POST /ussd                        |

**Ordre d'implémentation recommandé** (PROMPT 5.x) : PC-01 → PC-02 → PC-03 → PC-05 → AD-02 → PC-04 →
AD-01 → AD-03 → GOV-02 → GOV-01 → PC-06 → USSD-01.

**Le doc 12** (`12-FRONTEND-INTEGRATION-API.md`) couvre le câblage de tous ces écrans à l'API ; **le
doc 13** (`13-MOBILE-APP-EXPO.md`) traite l'adaptation mobile des écrans PC-01 / PC-02 / PC-05.
