# Spécifications UI/UX — Maquettes Figma

# Système Sécurisé de Gestion d'Identité Numérique pour l'AES

> Ce document sert de **cahier des charges Figma**. Chaque écran est décrit avec son layout, ses
> composants shadcn/ui, ses données fictives maliennes, ses interactions et ses variantes
> responsive.

---

## Table des matières

1. [Charte graphique](#1-charte-graphique)
2. [Composants shadcn/ui à installer](#2-composants-shadcnui-à-installer)
3. [Portail Citoyen (PC-01 → PC-06)](#3-portail-citoyen)
4. [Dashboard Admin (AD-01 → AD-03)](#4-dashboard-admin)
5. [Portail Gouvernance (GOV-01 → GOV-02)](#5-portail-gouvernance)
6. [Interface USSD (USSD-01)](#6-interface-ussd)
7. [Design tokens & variables Figma](#7-design-tokens--variables-figma)

---

## 1. Charte graphique

### 1.1 Palette de couleurs

| Token             | Hex       | Usage                                           |
| ----------------- | --------- | ----------------------------------------------- |
| `--primary`       | `#1B3A5C` | Fond header/sidebar, boutons principaux, titres |
| `--primary-light` | `#274D73` | Hover sur éléments primary                      |
| `--primary-dark`  | `#122841` | Texte sur fond clair, accents forts             |
| `--accent`        | `#2E75B6` | Liens, icônes actives, badges, focus rings      |
| `--accent-light`  | `#4A91D0` | Hover sur liens, arrière-plan léger             |
| `--success`       | `#1B7A3D` | Statuts validés, indicateurs positifs           |
| `--success-light` | `#E8F5ED` | Arrière-plan badge succès                       |
| `--warning`       | `#E6A817` | Alertes modérées, badges "en attente"           |
| `--warning-light` | `#FFF8E1` | Arrière-plan badge warning                      |
| `--danger`        | `#CC0000` | Erreurs, alertes critiques, suppressions        |
| `--danger-light`  | `#FFEAEA` | Arrière-plan badge danger                       |
| `--background`    | `#F8FAFC` | Arrière-plan global de toutes les pages         |
| `--card`          | `#FFFFFF` | Surface des cartes et modales                   |
| `--muted`         | `#64748B` | Texte secondaire, labels, placeholders          |
| `--border`        | `#E2E8F0` | Séparateurs, contours de champs                 |
| `--aes-mali`      | `#14B53A` | Badge / onglet Mali                             |
| `--aes-burkina`   | `#EF3340` | Badge / onglet Burkina Faso                     |
| `--aes-niger`     | `#FF7F00` | Badge / onglet Niger                            |

### 1.2 Typographie

| Rôle           | Police             | Taille      | Poids |
| -------------- | ------------------ | ----------- | ----- |
| Display / Hero | **Geist Sans**     | 48px / 36px | 700   |
| Titre H1       | Geist Sans         | 30px        | 700   |
| Titre H2       | Geist Sans         | 24px        | 600   |
| Titre H3       | Geist Sans         | 20px        | 600   |
| Body           | **Inter**          | 16px        | 400   |
| Body small     | Inter              | 14px        | 400   |
| Caption        | Inter              | 12px        | 400   |
| Code / NINA    | **JetBrains Mono** | 18px / 16px | 500   |
| NINA display   | JetBrains Mono     | 24px        | 600   |

### 1.3 Iconographie

Utiliser **Lucide Icons** (natif shadcn/ui). Icônes clés du projet :

- `Search`, `User`, `FileText`, `Calendar`, `Shield`, `AlertTriangle`
- `CheckCircle`, `XCircle`, `Clock`, `Globe`, `Phone`, `Upload`
- `ChevronRight`, `ArrowLeft`, `BarChart3`, `Map`, `Lock`
- `Languages`, `Flag`, `Eye`, `EyeOff`, `Fingerprint`

### 1.4 Espacements et grille

- Grille : **12 colonnes**, gouttière 24px (desktop), 16px (mobile)
- Container max : **1280px** centré
- Padding page : 32px (desktop), 16px (mobile)
- Border-radius : `8px` (cartes), `6px` (boutons), `12px` (modales)
- Ombres : `0 1px 3px rgba(0,0,0,0.1)` (card), `0 4px 12px rgba(0,0,0,0.15)` (modale)

### 1.5 Drapeaux AES (éléments visuels récurrents)

Bande horizontale tricolore (Mali vert-jaune-rouge, Burkina vert-rouge+étoile, Niger
orange-blanc-vert) utilisée dans le hero et le footer en thin border (3px).

---

## 2. Composants shadcn/ui à installer

### Installation

```bash
npx shadcn@latest init
npx shadcn@latest add button card input label select textarea badge \
  avatar separator tabs dialog sheet dropdown-menu command tooltip \
  calendar popover table form checkbox radio-group switch progress \
  alert alert-dialog toast sonner skeleton scroll-area collapsible \
  accordion breadcrumb navigation-menu sidebar
```

### Catalogue par fonction

| Catégorie   | Composants                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Navigation  | `NavigationMenu`, `Sidebar`, `Breadcrumb`, `Tabs`, `DropdownMenu`                                                 |
| Formulaires | `Input`, `Label`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`, `Switch`, `Form`, `Calendar`, `Popover`         |
| Affichage   | `Card`, `Badge`, `Avatar`, `Table`, `Progress`, `Skeleton`, `Separator`, `Accordion`, `Collapsible`, `ScrollArea` |
| Feedback    | `Alert`, `AlertDialog`, `Dialog`, `Sheet`, `Toast` (Sonner), `Tooltip`                                            |
| Recherche   | `Command` (palette recherche NINA)                                                                                |
| Actions     | `Button` (variants: default, outline, ghost, destructive, link)                                                   |

### Composants custom à créer

| Composant                 | Description                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `<NinaSearchBar />`       | Input JetBrains Mono + bouton recherche + validation regex live               |
| `<CitizenCard />`         | Carte profil (photo, NINA formaté, données identité)                          |
| `<CorrectionTimeline />`  | Timeline verticale 5 étapes (Soumis → IA → Revue → Approuvé/Rejeté → Notifié) |
| `<LanguageSelector />`    | Dropdown 8 langues avec drapeaux                                              |
| `<AesCountryBadge />`     | Badge coloré Mali/Burkina/Niger                                               |
| `<IntegrityScoreGauge />` | Jauge circulaire 0-100 pour scoring agents                                    |
| `<HeatmapCard />`         | Carte thermique des alertes par région                                        |
| `<KpiCard />`             | Carte KPI (icône, valeur, tendance %, label)                                  |

---

## 3. Portail Citoyen

> Application publique. Pas de sidebar. Header minimaliste + footer informatif.

### Disposition globale (toutes pages PC-xx)

```
┌─────────────────────────────────────────────────────┐
│ HEADER : Logo NINA-AES │ Nav (Accueil, Suivi,       │
│          Signalement)  │ LanguageSelector │ Login    │
├─────────────────────────────────────────────────────┤
│                                                     │
│                  CONTENU PRINCIPAL                   │
│                  (max-w: 1280px, centré)             │
│                                                     │
├─────────────────────────────────────────────────────┤
│ FOOTER : Liens CTDEC, DNEC │ Drapeaux AES │         │
│          © 2026 │ Mentions légales │ Contact         │
└─────────────────────────────────────────────────────┘
```

**Header** (sticky, h-16, bg-primary, text-white) :

- Gauche : Logo NINA-AES (emblème stylisé + texte "NINA-AES")
- Centre : `NavigationMenu` — Accueil, Suivi de demande, Signalement
- Droite : `<LanguageSelector />` (FR actif par défaut), `Button` "Connexion" (outline,
  border-white)

**Footer** (bg-primary-dark, text-white/70, py-8) :

- 3 colonnes : Informations CTDEC | Liens rapides | Contact
- Bande tricolore AES en bordure supérieure (3px)
- Copyright : "© 2026 CTDEC — Direction Nationale de l'État Civil du Mali"

---

### PC-01 — Page d'accueil

**Route** : `/`

#### Layout

```
┌──────────────────────────────────────┐
│           HEADER (sticky)            │
├──────────────────────────────────────┤
│                                      │
│   HERO SECTION (bg-primary, h-[420]) │
│   Titre + sous-titre + NinaSearchBar │
│   Drapeaux AES animés               │
│                                      │
├──────────────────────────────────────┤
│                                      │
│   4 CARTES ACTIONS RAPIDES (grid)    │
│   [Recherche] [Correction]           │
│   [RDV]      [Signalement]           │
│                                      │
├──────────────────────────────────────┤
│                                      │
│   SECTION INFOS (Accordion)          │
│   Comment ça marche ? (3 étapes)     │
│   FAQ (5 questions)                  │
│                                      │
├──────────────────────────────────────┤
│             FOOTER                   │
└──────────────────────────────────────┘
```

#### Composants et données

**Hero Section** (fond `--primary` dégradé vers `--primary-dark`) :

| Élément              | Composant                    | Contenu                                                             |
| -------------------- | ---------------------------- | ------------------------------------------------------------------- |
| Titre                | `<h1>` Geist 48px bold white | "Portail d'Identité Numérique de l'AES"                             |
| Sous-titre           | `<p>` Inter 18px white/80    | "Vérifiez, corrigez et gérez votre identité NINA en toute sécurité" |
| Drapeaux             | 3 images SVG                 | Mali 🇲🇱 + Burkina 🇧🇫 + Niger 🇳🇪 alignés horizontalement             |
| Recherche            | `<NinaSearchBar />`          | Voir ci-dessous                                                     |
| Indicateur confiance | `<Badge>`                    | "🔒 Données chiffrées · 12.4M identités sécurisées"                 |

**NinaSearchBar** (largeur 560px, centrée) :

- `Input` : placeholder "Entrez votre NINA (ex: 1 85 01 2 01 001 234 A)", font JetBrains Mono
- Masque de saisie : affichage auto-formaté `X YY ZZ Z ZZ ZZZ ZZZ A`
- Validation live : bordure verte si format valide, rouge si invalide
- `Button` "Rechercher" : `variant="default"`, icône `Search`, bg-accent
- Texte sous l'input : "Format : 14 chiffres + 1 lettre de contrôle" (Inter 12px, muted)

**4 Cartes actions rapides** (grid 2×2 desktop, 1×4 mobile) :

| Carte | Icône      | Titre                     | Description                                  |
| ----- | ---------- | ------------------------- | -------------------------------------------- |
| 1     | `Search`   | "Vérifier mon NINA"       | "Consultez votre fiche d'identité numérique" |
| 2     | `FileText` | "Demander une correction" | "Signalez une erreur sur votre fiche"        |
| 3     | `Calendar` | "Prendre rendez-vous"     | "Réservez un créneau au centre CTDEC"        |
| 4     | `Shield`   | "Signaler un abus"        | "Signalement anonyme et sécurisé"            |

Chaque carte : `Card` shadcn, hover → `shadow-lg` + `border-accent`, curseur pointer. Icône 40×40 en
`--accent`, titre H3 en `--primary`, description en `--muted`.

**Section "Comment ça marche"** (3 étapes numérotées) :

| #   | Titre                       | Description                                                         |
| --- | --------------------------- | ------------------------------------------------------------------- |
| 1   | "Recherchez votre NINA"     | "Saisissez votre numéro d'identification nationale à 15 caractères" |
| 2   | "Vérifiez vos informations" | "Consultez votre fiche complète et repérez les erreurs éventuelles" |
| 3   | "Demandez une correction"   | "Notre IA vérifie votre demande puis un agent la traite sous 48h"   |

**FAQ** — `Accordion` shadcn avec 5 items :

- "Qu'est-ce que le numéro NINA ?"
- "Comment obtenir mon NINA pour la première fois ?"
- "Combien de temps prend une correction ?"
- "Le service est-il gratuit ?"
- "Puis-je utiliser ce portail depuis l'étranger ?"

#### Interactions

| Action                            | Comportement                                                       |
| --------------------------------- | ------------------------------------------------------------------ |
| Saisie NINA → validation regex    | Bordure input → vert/rouge en temps réel                           |
| Clic "Rechercher" (NINA valide)   | Navigation → `/recherche?nina=185012010012344A`                    |
| Clic "Rechercher" (NINA invalide) | Toast danger "Format NINA invalide" (Sonner)                       |
| Clic sur carte action             | Navigation vers la page correspondante                             |
| Changement langue                 | Rechargement i18n, textes traduits (FR → BM → SNK → FF)            |
| Clic "Connexion"                  | Dialog modal de login (email/phone + mot de passe + MFA optionnel) |

#### Responsive

| Breakpoint                | Adaptation                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Desktop** (≥1024px)     | Hero pleine largeur, grille 2×2, SearchBar 560px                                                       |
| **Tablette** (768-1023px) | Hero réduit h-[320], grille 2×2, SearchBar 100% max-w-lg                                               |
| **Mobile** (< 768px)      | Hero h-[280], titre 30px, SearchBar pleine largeur, cartes empilées 1 col, nav → `Sheet` (burger menu) |

---

### PC-02 — Résultat recherche NINA

**Route** : `/recherche?nina=185012010012344A`

#### Layout

```
┌──────────────────────────────────────┐
│              HEADER                  │
├──────────────────────────────────────┤
│ Breadcrumb: Accueil > Recherche NINA │
├──────────────────────────────────────┤
│                                      │
│  ┌─────────────┐ ┌────────────────┐  │
│  │ CARTE PROFIL│ │ DONNÉES        │  │
│  │ (photo+NINA)│ │ COMPLÈTES      │  │
│  │             │ │ (Tabs)         │  │
│  └─────────────┘ │                │  │
│                   │                │  │
│  ┌─────────────┐ │                │  │
│  │ ACTIONS     │ │                │  │
│  │ (3 boutons) │ └────────────────┘  │
│  └─────────────┘                     │
│                                      │
├──────────────────────────────────────┤
│             FOOTER                   │
└──────────────────────────────────────┘
```

#### Composants et données

**Carte profil** (colonne gauche, 320px fixe sur desktop) :

`<CitizenCard />` construit avec `Card` + `Avatar` :

```
┌────────────────────────┐
│    ┌──────────┐        │
│    │  PHOTO   │        │
│    │ (Avatar  │        │
│    │  128px)  │        │
│    └──────────┘        │
│                        │
│  COULIBALY Aminata     │  ← H2, Geist 24px bold
│                        │
│  NINA:                 │
│  ┌──────────────────┐  │
│  │ 1 85 01 2 01 001 │  │  ← JetBrains Mono 20px
│  │    234 A         │  │     bg-primary/5, p-3, rounded
│  └──────────────────┘  │
│                        │
│  Badge: ✅ Identité    │  ← Badge variant success
│         vérifiée       │
│                        │
│  Badge IA: 🤖 Score    │  ← Badge variant outline
│   confiance: 97.2%     │     (si recherche AES)
│                        │
│  Dernière mise à jour  │  ← Caption, muted
│  14 mars 2026          │
└────────────────────────┘
```

Données fictives maliennes :

- **Nom** : COULIBALY
- **Prénoms** : Aminata Fatoumata
- **NINA** : `1 85 01 2 01 001 234 A`
- **Photo** : Avatar femme placeholder

**Données complètes** (colonne droite, `Tabs` avec 4 onglets) :

**Onglet 1 — Identité**

| Champ                  | Valeur            |
| ---------------------- | ----------------- |
| Nom                    | COULIBALY         |
| Prénoms                | Aminata Fatoumata |
| Date de naissance      | 15/03/1985        |
| Sexe                   | Femme             |
| Situation matrimoniale | Mariée            |
| Profession             | Enseignante       |

**Onglet 2 — Lieu de naissance**

| Niveau                    | Valeur     |
| ------------------------- | ---------- |
| Pays                      | Mali (MLI) |
| Région                    | Bamako     |
| Cercle                    | Bamako     |
| Arrondissement            | Commune I  |
| Commune                   | Commune I  |
| Village/Fraction/Quartier | Banconi    |
| Secteur                   | Secteur 1  |

**Onglet 3 — Résidence**

| Niveau                    | Valeur       |
| ------------------------- | ------------ |
| Pays                      | Mali (MLI)   |
| Région                    | Bamako       |
| Cercle                    | Bamako       |
| Arrondissement            | Commune V    |
| Commune                   | Commune V    |
| Village/Fraction/Quartier | Badalabougou |
| Secteur                   | Secteur 3    |

**Onglet 4 — Parents**

| Champ         | Valeur        |
| ------------- | ------------- |
| Père — Nom    | COULIBALY     |
| Père — Prénom | Moussa Sékou  |
| Mère — Nom    | DIARRA        |
| Mère — Prénom | Oumou Sangaré |

Chaque onglet : affichage en `grid` 2 colonnes (label muted + valeur bold).

**Bloc Actions** (sous la carte profil) :

| Bouton                     | Variant                | Icône      | Action                                                            |
| -------------------------- | ---------------------- | ---------- | ----------------------------------------------------------------- |
| "Télécharger la fiche PDF" | `default` (bg-primary) | `FileText` | Appel POST `/api/v1/documents/fiche-descriptive` → téléchargement |
| "Demander une correction"  | `outline`              | `FileText` | Navigation → `/correction?nina=...`                               |
| "Prendre rendez-vous"      | `outline`              | `Calendar` | Navigation → `/rendez-vous?nina=...`                              |

**Alert info** (pleine largeur, sous le bloc principal) :

- `Alert` variant info : "Les informations affichées proviennent de la base NINA du CTDEC. Si vous
  constatez une erreur, vous pouvez demander une correction qui sera vérifiée par notre système IA
  puis validée par un agent assermenté."

#### Interactions

| Action                       | Comportement                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Clic onglet                  | Transition douce, contenu change sans rechargement                                                 |
| Clic "Télécharger PDF"       | Loading spinner → téléchargement automatique                                                       |
| Hover sur un champ de donnée | Tooltip "Cliquer pour signaler une erreur sur ce champ"                                            |
| Clic sur un champ            | Pré-remplit le formulaire correction avec le nom du champ                                          |
| NINA introuvable             | Affichage `Alert` destructive : "Aucun citoyen trouvé pour ce NINA" + bouton "Revenir à l'accueil" |

#### Responsive

| Breakpoint   | Adaptation                                               |
| ------------ | -------------------------------------------------------- |
| **Desktop**  | 2 colonnes : profil (320px) + données (flex-1)           |
| **Tablette** | Profil empilé au-dessus des données, Tabs pleine largeur |
| **Mobile**   | Tout empilé, Avatar 96px, Tabs avec scroll horizontal    |

---

### PC-03 — Formulaire demande de correction

**Route** : `/correction?nina=185012010012344A`

#### Layout

```
┌──────────────────────────────────────┐
│              HEADER                  │
├──────────────────────────────────────┤
│ Breadcrumb: Accueil > Correction     │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │  CARTE RÉSUMÉ CITOYEN (mini)  │  │
│  │  NINA + Nom + Date naissance  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  FORMULAIRE DE CORRECTION     │  │
│  │                                │  │
│  │  Select: Champ à corriger     │  │
│  │  Input:  Valeur actuelle (ro) │  │
│  │  Input:  Nouvelle valeur      │  │
│  │  Textarea: Justification      │  │
│  │                                │  │
│  │  ┌──────────────────────────┐ │  │
│  │  │  ZONE UPLOAD (drag&drop) │ │  │
│  │  │  Justificatif scanné     │ │  │
│  │  └──────────────────────────┘ │  │
│  │                                │  │
│  │  ┌──────────────────────────┐ │  │
│  │  │  SCORE IA (live)         │ │  │
│  │  │  Confiance: 87% ████░░  │ │  │
│  │  │  Suggestion: "Vérifiez   │ │  │
│  │  │  l'orthographe..."       │ │  │
│  │  └──────────────────────────┘ │  │
│  │                                │  │
│  │  [Annuler]  [Soumettre]       │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│             FOOTER                   │
└──────────────────────────────────────┘
```

#### Composants et données

**Carte résumé citoyen** (compacte, en haut) :

- `Card` avec direction row : Avatar 48px + "COULIBALY Aminata · NINA: `1 85 01 2 01 001 234 A` ·
  Née le 15/03/1985"

**Formulaire** (`Form` shadcn avec react-hook-form + Zod) :

| Champ                    | Composant                       | Données                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Champ à corriger         | `Select`                        | Options : "Nom", "Prénoms", "Date de naissance", "Sexe", "Situation matrimoniale", "Profession", "Lieu de naissance — Région", "Lieu de naissance — Cercle", "Lieu de naissance — Commune", "Lieu de naissance — Village", "Résidence — Région", "Résidence — Cercle", "Résidence — Commune", "Résidence — Village", "Père — Nom", "Père — Prénom", "Mère — Nom", "Mère — Prénom" |
| Valeur actuelle          | `Input` (readOnly, bg-muted/20) | Auto-rempli selon sélection. Ex: "COULIBALY"                                                                                                                                                                                                                                                                                                                                      |
| Nouvelle valeur proposée | `Input`                         | Placeholder : "Saisissez la valeur correcte"                                                                                                                                                                                                                                                                                                                                      |
| Justification            | `Textarea`                      | Placeholder : "Expliquez la raison de cette correction (ex: erreur de saisie lors de l'enregistrement)"                                                                                                                                                                                                                                                                           |
| Document justificatif    | Zone drag & drop custom         | Accepte : PDF, JPG, PNG. Max 5 Mo. Icône `Upload`, texte "Glissez votre justificatif ici ou cliquez pour parcourir"                                                                                                                                                                                                                                                               |

**Zone Score IA** (apparaît en live après saisie de la nouvelle valeur) :

- `Card` avec bordure gauche colorée (vert/orange/rouge selon score)
- Icône `🤖` + "Analyse IA"
- `Progress` bar : pourcentage de confiance
- Texte suggestion : ex. "Similarité phonétique détectée entre 'COULIBALY' et 'KOULIBALY'
  (Jaro-Winkler: 0.94). Correction plausible."
- Couleurs : ≥85% → vert, 60-84% → orange, <60% → rouge

Données fictives d'exemple :

- Champ sélectionné : "Nom"
- Valeur actuelle : "KOULIBALY" (erreur de saisie)
- Nouvelle valeur : "COULIBALY"
- Score IA : 94.2% — "Correction très probable. Erreur phonétique courante K↔C."

**Boutons** :

- "Annuler" : `Button variant="outline"` → retour page précédente
- "Soumettre la demande" : `Button variant="default"` bg-primary, icône `CheckCircle`

#### Interactions

| Action                            | Comportement                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Sélection champ → valeur actuelle | Auto-remplissage de la valeur actuelle depuis les données du citoyen                                           |
| Saisie nouvelle valeur            | Appel debounced (500ms) au AI Service → affichage score live                                                   |
| Score IA < 40%                    | `Alert` warning : "Notre IA a une faible confiance dans cette correction. Un justificatif sera indispensable." |
| Upload fichier invalide           | Toast erreur "Format non supporté" ou "Fichier trop volumineux (max 5 Mo)"                                     |
| Upload réussi                     | Preview miniature du document + bouton supprimer                                                               |
| Soumission (formulaire valide)    | Loading → Toast succès "Demande #CR-2026-0042 créée" + redirection vers `/suivi/CR-2026-0042`                  |
| Soumission (champs manquants)     | Messages d'erreur inline sous chaque champ (rouge)                                                             |

#### Responsive

| Breakpoint   | Adaptation                                                                              |
| ------------ | --------------------------------------------------------------------------------------- |
| **Desktop**  | Formulaire max-w-2xl centré, zone IA à droite du formulaire (2 cols)                    |
| **Tablette** | Tout empilé, max-w-lg                                                                   |
| **Mobile**   | Pleine largeur, Select en full-width, zone upload simplifiée (bouton seul, pas de drag) |

---

### PC-04 — Prise de rendez-vous

**Route** : `/rendez-vous?nina=185012010012344A`

#### Layout

```
┌──────────────────────────────────────┐
│              HEADER                  │
├──────────────────────────────────────┤
│ Breadcrumb: Accueil > Rendez-vous    │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────┐  ┌────────────────┐  │
│  │ SÉLECTION  │  │ CRÉNEAUX       │  │
│  │ CENTRE     │  │ DISPONIBLES    │  │
│  │            │  │                │  │
│  │ Select     │  │ Calendrier     │  │
│  │ région     │  │ (mois)         │  │
│  │            │  │                │  │
│  │ Select     │  │ Grille heures  │  │
│  │ centre     │  │ (jour sélect.) │  │
│  │            │  │                │  │
│  │ Alert      │  └────────────────┘  │
│  │ priorité   │                      │
│  └────────────┘  ┌────────────────┐  │
│                  │ CONFIRMATION   │  │
│                  │ (résumé+submit)│  │
│                  └────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│             FOOTER                   │
└──────────────────────────────────────┘
```

#### Composants et données

**Sélection du centre** (colonne gauche) :

| Champ        | Composant            | Données                                                                                                                                                                                                              |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Région       | `Select`             | "Bamako", "Kayes", "Koulikoro", "Sikasso", "Ségou", "Mopti", "Tombouctou", "Gao", "Kidal", "Ménaka", "Taoudénit"                                                                                                     |
| Centre CTDEC | `Select` (dépendant) | Ex pour Bamako : "CTDEC Commune I — Korofina", "CTDEC Commune II — Hippodrome", "CTDEC Commune III — Bamako-Coura", "CTDEC Commune IV — Hamdallaye", "CTDEC Commune V — Badalabougou", "CTDEC Commune VI — Sogoniko" |

**Alerte priorité** (si citoyen vulnérable détecté) :

- `Alert` variant warning : "👵 File prioritaire activée. En tant que personne de 60 ans et plus,
  vous bénéficiez d'un créneau prioritaire entre 7h30 et 9h00."

**Calendrier** (colonne droite) :

- `Calendar` shadcn (vue mois)
- Jours passés : grisés, non cliquables
- Jours disponibles : fond blanc, hover accent-light
- Jours complets : fond danger-light, barré, non cliquables
- Jour sélectionné : fond accent, texte blanc
- Weekend (samedi/dimanche) : grisés

Données fictives : Mois d'avril 2026. Les 1er, 8, 15 avril complets. Aujourd'hui 29 mars.

**Grille horaires** (apparaît après sélection d'un jour) :

- Grid 3 colonnes de boutons horaires
- Créneaux disponibles : `Button variant="outline"` — "08:00", "08:30", "09:00", "09:30", "10:00",
  "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30"
- Créneaux pris : `Button variant="outline"` disabled, texte barré
- Créneau sélectionné : `Button variant="default"` bg-accent
- File prioritaire (07:30-09:00) : marquée badge "⚡ Prioritaire"

**Card confirmation** (apparaît après sélection d'un créneau) :

```
┌──────────────────────────────────┐
│  📋 Récapitulatif du rendez-vous │
│                                  │
│  Centre : CTDEC Commune V        │
│  Date   : Mercredi 2 avril 2026  │
│  Heure  : 09:30                  │
│  File   : Standard (n° 23)       │
│  NINA   : 1 85 01 2 01 001 234 A │
│                                  │
│  ☐ J'accepte d'apporter une      │
│    pièce d'identité originale    │
│                                  │
│  [Annuler]  [Confirmer le RDV]   │
└──────────────────────────────────┘
```

#### Interactions

| Action                              | Comportement                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sélection région                    | Charge la liste des centres (dépendant)                                                          |
| Sélection centre                    | Charge le calendrier avec disponibilités                                                         |
| Clic sur jour                       | Affiche la grille horaires pour ce jour                                                          |
| Clic sur créneau                    | Sélectionne et affiche la card de confirmation                                                   |
| Confirmation                        | POST → Toast succès "RDV confirmé. Numéro de file : 23. Un SMS de rappel sera envoyé 24h avant." |
| Checkbox non coché → clic confirmer | Message erreur inline sous la checkbox                                                           |

#### Responsive

| Breakpoint   | Adaptation                                                             |
| ------------ | ---------------------------------------------------------------------- |
| **Desktop**  | 2 colonnes : sélection centre (380px) + calendrier/horaires (flex-1)   |
| **Tablette** | Tout empilé, calendrier pleine largeur                                 |
| **Mobile**   | Sélects pleine largeur, calendrier compact, grille horaires 2 colonnes |

---

### PC-05 — Suivi de demande

**Route** : `/suivi/CR-2026-0042` (ou accès via `/suivi` + saisie du numéro)

#### Layout

```
┌──────────────────────────────────────┐
│              HEADER                  │
├──────────────────────────────────────┤
│ Breadcrumb: Accueil > Suivi          │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │ BARRE DE RECHERCHE DEMANDE    │  │
│  │ Input: "Entrez votre n° CR-…" │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ RÉSUMÉ DEMANDE (Card)         │  │
│  │ #CR-2026-0042 │ NINA │ Champ  │  │
│  │ Valeur actuelle → Nouvelle    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ TIMELINE VERTICALE            │  │
│  │                                │  │
│  │  ● Soumise          29/03     │  │
│  │  │                            │  │
│  │  ● Analyse IA       29/03     │  │
│  │  │  Score: 94.2%              │  │
│  │  │                            │  │
│  │  ◐ Revue agent      (en cours)│  │
│  │  │  Agent: Mamadou T.         │  │
│  │  │                            │  │
│  │  ○ Décision         —         │  │
│  │  │                            │  │
│  │  ○ Notification     —         │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│             FOOTER                   │
└──────────────────────────────────────┘
```

#### Composants et données

**Barre de recherche demande** :

- `Input` + `Button` : "Entrez votre numéro de demande (ex: CR-2026-0042)"
- Si accès via lien direct (`/suivi/CR-2026-0042`), masquée et données chargées

**Card résumé** :

| Champ              | Valeur                                     |
| ------------------ | ------------------------------------------ |
| N° demande         | CR-2026-0042                               |
| NINA               | `1 85 01 2 01 001 234 A`                   |
| Champ corrigé      | Nom                                        |
| Valeur actuelle    | KOULIBALY                                  |
| Valeur proposée    | COULIBALY                                  |
| Statut global      | `Badge` "En cours de traitement" (warning) |
| Date de soumission | 29 mars 2026 à 14:32                       |

**`<CorrectionTimeline />`** — Timeline verticale 5 étapes :

| #   | Étape              | Statut       | Icône                    | Détails                                             | Date             |
| --- | ------------------ | ------------ | ------------------------ | --------------------------------------------------- | ---------------- |
| 1   | Demande soumise    | ✅ Complété  | `CheckCircle` (success)  | "Demande reçue et enregistrée"                      | 29/03/2026 14:32 |
| 2   | Analyse IA         | ✅ Complété  | `CheckCircle` (success)  | "Score de confiance : 94.2% — Correction plausible" | 29/03/2026 14:33 |
| 3   | Revue par un agent | 🔄 En cours  | `Clock` (warning, pulse) | "Agent assigné : Mamadou TRAORÉ — Centre Commune V" | 30/03/2026 09:15 |
| 4   | Décision           | ○ En attente | `Circle` (muted)         | —                                                   | —                |
| 5   | Notification       | ○ En attente | `Circle` (muted)         | —                                                   | —                |

Implémentation :

- Ligne verticale : `border-l-2` (success pour complété, warning pour en cours, muted pour en
  attente)
- Point : `div` rond 12px, couleur selon statut
- Étape en cours : animation `animate-pulse` sur le point
- Détails : texte Inter 14px sous le titre, couleur muted

#### Interactions

| Action                         | Comportement                                                     |
| ------------------------------ | ---------------------------------------------------------------- |
| Saisie n° demande → Rechercher | Chargement des données → affichage timeline                      |
| N° introuvable                 | `Alert` destructive : "Demande introuvable. Vérifiez le numéro." |
| Clic sur étape complétée       | Expand → affiche détails supplémentaires (heure exacte, agent)   |
| Rafraîchissement auto          | Polling toutes les 30s si statut "en cours"                      |

#### Responsive

| Breakpoint   | Adaptation                                                          |
| ------------ | ------------------------------------------------------------------- |
| **Desktop**  | Timeline max-w-2xl centrée                                          |
| **Tablette** | Idem, marges réduites                                               |
| **Mobile**   | Timeline pleine largeur, padding réduit, détails dans `Collapsible` |

---

### PC-06 — Signalement corruption anonyme

**Route** : `/signalement`

#### Layout

```
┌──────────────────────────────────────┐
│              HEADER                  │
├──────────────────────────────────────┤
│ Breadcrumb: Accueil > Signalement    │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ALERT SÉCURITÉ (vert)        │  │
│  │  🔒 Ce formulaire est 100%    │  │
│  │  anonyme. Aucune adresse IP,  │  │
│  │  cookie ni identifiant n'est  │  │
│  │  enregistré.                  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  FORMULAIRE SIGNALEMENT       │  │
│  │                                │  │
│  │  Select: Type d'abus          │  │
│  │  Select: Région / Centre      │  │
│  │  Input:  Date approximative   │  │
│  │  Textarea: Description        │  │
│  │                                │  │
│  │  Upload: Preuves (optionnel)  │  │
│  │                                │  │
│  │  [Soumettre anonymement]      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  OU: SUIVI SIGNALEMENT        │  │
│  │  Input: Token de suivi        │  │
│  │  [Vérifier le statut]         │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│             FOOTER                   │
└──────────────────────────────────────┘
```

#### Composants et données

**Alert sécurité** :

- `Alert` variant "default" avec icône `Lock` et bordure `--success`
- Texte : "Ce formulaire est entièrement anonyme. Nous ne collectons aucune adresse IP, aucun cookie
  et aucun identifiant. Un token unique vous sera remis pour suivre votre signalement."

**Formulaire signalement** (`Form` shadcn) :

| Champ                 | Composant                                      | Données / Options                                                                                                                                           |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type d'abus           | `Select`                                       | "Demande de paiement non-officiel", "Traitement de faveur", "Falsification de documents", "Refus de service sans motif", "Détournement de dossier", "Autre" |
| Région                | `Select`                                       | 11 régions du Mali                                                                                                                                          |
| Centre CTDEC          | `Select` (dépendant)                           | Centres de la région sélectionnée                                                                                                                           |
| Date approximative    | `Input` type date (via `Popover` + `Calendar`) | Derniers 90 jours                                                                                                                                           |
| Description des faits | `Textarea` (min 50 chars)                      | Placeholder : "Décrivez les faits observés avec le plus de détails possible (lieu, circonstances, personnes impliquées si connues)..."                      |
| Pièces jointes        | Zone upload drag & drop                        | "Photos, captures d'écran, reçus... (optionnel, max 3 fichiers, 5 Mo chacun)"                                                                               |

**Bouton soumission** :

- `Button` variant="default" bg-primary, pleine largeur
- Texte : "Soumettre le signalement anonymement"
- Icône `Shield`

**Section suivi** (séparée par `Separator` + texte "ou") :

- `Input` : "Entrez votre token de suivi (ex: SIG-a7b3c9d2)"
- `Button` variant="outline" : "Vérifier le statut"

**Modal post-soumission** (`Dialog`) :

```
┌──────────────────────────────────┐
│  ✅ Signalement enregistré       │
│                                  │
│  Votre token de suivi :          │
│  ┌──────────────────────────┐    │
│  │  SIG-a7b3c9d2e1f4       │    │  ← JetBrains Mono, bg selectable
│  └──────────────────────────┘    │
│                                  │
│  ⚠️ IMPORTANT : Notez ce token  │
│  Il est le seul moyen de suivre  │
│  votre signalement. Il ne sera   │
│  plus affiché.                   │
│                                  │
│  [Copier le token] [Fermer]      │
└──────────────────────────────────┘
```

**Page suivi signalement** (`/signalement/suivi?token=SIG-a7b3c9d2e1f4`) :

| Champ                     | Valeur                                                       |
| ------------------------- | ------------------------------------------------------------ |
| Token                     | SIG-a7b3c9d2e1f4                                             |
| Type                      | Demande de paiement non-officiel                             |
| Sévérité (classée par IA) | `Badge` "Élevée" (danger)                                    |
| Statut                    | `Badge` "En investigation" (warning)                         |
| Date de signalement       | 15/03/2026                                                   |
| Dernière mise à jour      | 28/03/2026 — "Un auditeur a été assigné à votre signalement" |

#### Interactions

| Action                           | Comportement                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| Soumission → succès              | Dialog avec token + copie presse-papier                         |
| Clic "Copier le token"           | Copie dans presse-papier + Toast "Token copié !"                |
| Fermer dialog                    | Retour page signalement (formulaire vidé)                       |
| Saisie token → vérifier          | Affichage statut du signalement                                 |
| Token invalide                   | `Alert` destructive "Token introuvable"                         |
| Textarea < 50 chars → soumission | Erreur inline "Description trop courte (minimum 50 caractères)" |

#### Responsive

| Breakpoint   | Adaptation                                       |
| ------------ | ------------------------------------------------ |
| **Desktop**  | Formulaire max-w-2xl centré                      |
| **Tablette** | Idem, marges réduites                            |
| **Mobile**   | Tout pleine largeur, zone upload → bouton simple |

---

## 4. Dashboard Admin

> Application protégée (auth obligatoire). Sidebar persistante + header avec user info.

### Disposition globale (toutes pages AD-xx)

```
┌───────┬─────────────────────────────────┐
│       │  HEADER : Search │ Notifs │     │
│       │           User dropdown         │
│  S    ├─────────────────────────────────┤
│  I    │                                 │
│  D    │  Breadcrumb                     │
│  E    │                                 │
│  B    │  CONTENU PRINCIPAL              │
│  A    │  (scroll-y)                     │
│  R    │                                 │
│       │                                 │
│       │                                 │
│       │                                 │
└───────┴─────────────────────────────────┘
```

**Sidebar** (`Sidebar` shadcn, w-64, bg-primary) :

- Logo NINA-AES en haut
- Navigation items avec icônes :
  - `BarChart3` — Tableau de bord
  - `FileText` — Corrections
  - `Shield` — SIGAC
  - `Users` — Citoyens
  - `Calendar` — Rendez-vous
  - `Globe` — Vérifications AES
  - `Scroll` — Audit Trail
  - `Settings` — Paramètres
- Badge de notification sur "Corrections" (nombre en attente)
- En bas : Avatar + nom agent + rôle + bouton déconnexion

**Header** (h-16, bg-white, border-b) :

- Gauche : `Button` toggle sidebar (icône `Menu`)
- Centre : `Command` (palette recherche rapide NINA)
- Droite : `Button` notifications (icône `Bell` + badge rouge compteur), `DropdownMenu` user
  (Profil, Paramètres, Déconnexion)

---

### AD-01 — Tableau de bord

**Route** : `/admin/dashboard`

#### Layout

```
┌───────┬─────────────────────────────────┐
│       │  Header                         │
│       ├─────────────────────────────────┤
│  S    │                                 │
│  I    │  Titre: "Tableau de bord"       │
│  D    │  Sous-titre: "Vue d'ensemble"   │
│  E    │                                 │
│  B    │  ┌──────┬──────┬──────┬──────┐  │
│  A    │  │ KPI1 │ KPI2 │ KPI3 │ KPI4 │  │
│  R    │  └──────┴──────┴──────┴──────┘  │
│       │                                 │
│       │  ┌─────────────┬─────────────┐  │
│       │  │ GRAPHIQUE   │ GRAPHIQUE   │  │
│       │  │ Corrections │ Activité    │  │
│       │  │ (ligne)     │ (barres)    │  │
│       │  └─────────────┴─────────────┘  │
│       │                                 │
│       │  ┌─────────────────────────────┐│
│       │  │ CORRECTIONS EN ATTENTE      ││
│       │  │ (Table 5 dernières)         ││
│       │  └─────────────────────────────┘│
│       │                                 │
└───────┴─────────────────────────────────┘
```

#### Composants et données

**4 KPI Cards** (`<KpiCard />` — grid 4 colonnes) :

| KPI                    | Icône           | Valeur     | Tendance             | Couleur |
| ---------------------- | --------------- | ---------- | -------------------- | ------- |
| Citoyens enregistrés   | `Users`         | 12 437 892 | +2.3% ce mois        | primary |
| Corrections en attente | `FileText`      | 847        | -12% vs mois dernier | warning |
| Score IA moyen         | `Brain`         | 91.7%      | +0.8%                | success |
| Alertes SIGAC actives  | `AlertTriangle` | 23         | +5 cette semaine     | danger  |

Chaque carte : icône dans cercle coloré (40px), valeur en Geist 30px bold, tendance en Inter 14px
avec flèche ↑/↓ colorée.

**Graphique Corrections** (colonne gauche, `Card`) :

- Titre : "Corrections — 30 derniers jours"
- Type : Ligne (Area chart)
- Axes : X = jours, Y = nombre
- 3 lignes : "Soumises" (accent), "Approuvées" (success), "Rejetées" (danger)
- Données fictives : ~30 corrections/jour soumises, 25 approuvées, 5 rejetées
- Tooltip au hover : date + valeur exacte

**Graphique Activité** (colonne droite, `Card`) :

- Titre : "Activité par centre — Cette semaine"
- Type : Barres horizontales
- 6 barres : "Commune I" (145), "Commune II" (132), "Commune III" (178), "Commune IV" (121),
  "Commune V" (203), "Commune VI" (167)
- Couleur : accent avec opacité variable

**Table Corrections en attente** (`Table` shadcn) :

| N°           | NINA                     | Nom               | Champ      | Score IA | Date  | Actions                      |
| ------------ | ------------------------ | ----------------- | ---------- | -------- | ----- | ---------------------------- |
| CR-2026-0042 | `1 85 01 2 01 001 234 A` | COULIBALY Aminata | Nom        | 94.2%    | 29/03 | [Voir] [Approuver] [Rejeter] |
| CR-2026-0041 | `1 90 03 1 05 002 567 K` | TRAORÉ Ibrahim    | Prénom     | 87.5%    | 29/03 | [Voir] [Approuver] [Rejeter] |
| CR-2026-0040 | `2 78 07 2 02 001 891 M` | DIALLO Fatoumata  | Résidence  | 72.1%    | 28/03 | [Voir] [Approuver] [Rejeter] |
| CR-2026-0039 | `1 95 02 1 01 003 456 T` | KEÏTA Moussa      | Naissance  | 65.8%    | 28/03 | [Voir] [Approuver] [Rejeter] |
| CR-2026-0038 | `2 88 11 2 04 001 234 D` | SANGARÉ Aïssata   | Profession | 91.0%    | 27/03 | [Voir] [Approuver] [Rejeter] |

- Score IA : `Badge` vert ≥85%, orange 60-84%, rouge <60%
- Actions : `Button` icônes (`Eye`, `CheckCircle`, `XCircle`) dans `DropdownMenu`
- Lien "Voir toutes les corrections →" en bas

#### Interactions

| Action           | Comportement                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Clic KPI card    | Navigation vers la page détaillée correspondante                                                                  |
| Hover graphique  | Tooltip avec valeur précise                                                                                       |
| Clic "Approuver" | `AlertDialog` confirmation : "Approuver la correction #CR-2026-0042 ?" → PUT API → Toast succès → ligne disparaît |
| Clic "Rejeter"   | `Dialog` avec `Textarea` motif obligatoire → PUT API → Toast → ligne disparaît                                    |
| Clic "Voir"      | Navigation → page détail de la correction                                                                         |
| Filtre temporel  | `Select` en haut : "Aujourd'hui", "7 jours", "30 jours", "Cette année"                                            |

#### Responsive

| Breakpoint                | Adaptation                                                             |
| ------------------------- | ---------------------------------------------------------------------- |
| **Desktop** (≥1280px)     | Sidebar visible, 4 KPIs en ligne, 2 graphiques côte à côte             |
| **Tablette** (768-1279px) | Sidebar collapse (icônes seules), 2 KPIs par ligne, graphiques empilés |
| **Mobile** (<768px)       | Sidebar → `Sheet` (overlay), 1 KPI par ligne, table → cards empilées   |

---

### AD-02 — Gestion des corrections

**Route** : `/admin/corrections`

#### Layout

```
┌───────┬─────────────────────────────────┐
│       │  Header                         │
│       ├─────────────────────────────────┤
│  S    │                                 │
│  I    │  Titre: "Gestion des corrections│
│  D    │                                 │
│  E    │  ┌─────────────────────────────┐│
│  B    │  │ BARRE FILTRES               ││
│  A    │  │ [Statut▼][Centre▼][Score▼]  ││
│  R    │  │ [Recherche] [Export]        ││
│       │  └─────────────────────────────┘│
│       │                                 │
│       │  ┌─────────────────────────────┐│
│       │  │ DATATABLE COMPLÈTE          ││
│       │  │ (pagination, tri, sélection)││
│       │  │                             ││
│       │  │ ☐ N° │ NINA │ Nom │ Champ  ││
│       │  │   Score │ Statut │ Date    ││
│       │  │   Actions                   ││
│       │  │                             ││
│       │  │ ...20 lignes par page...    ││
│       │  │                             ││
│       │  │ < 1 2 3 ... 43 >           ││
│       │  └─────────────────────────────┘│
│       │                                 │
│       │  ACTIONS EN LOT (si sélection) │
│       │  [Approuver (3)] [Rejeter (3)] │
│       │                                 │
└───────┴─────────────────────────────────┘
```

#### Composants et données

**Barre de filtres** :

| Filtre    | Composant                                   | Options                                                                                                                                       |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Statut    | `Select`                                    | "Tous", "En attente" (PENDING), "Analysé par IA" (AI_REVIEWED), "En revue" (PENDING_HUMAN_REVIEW), "Approuvé" (APPROVED), "Rejeté" (REJECTED) |
| Centre    | `Select`                                    | "Tous", puis liste des centres CTDEC                                                                                                          |
| Score IA  | `Select`                                    | "Tous", "≥ 85% (haute confiance)", "60-84% (moyenne)", "< 60% (faible)"                                                                       |
| Recherche | `Input` avec icône `Search`                 | Placeholder "NINA, nom ou n° demande..."                                                                                                      |
| Période   | `Popover` + double `Calendar`               | Sélecteur de plage de dates                                                                                                                   |
| Export    | `Button` variant="outline" icône `Download` | Export CSV/Excel des résultats filtrés                                                                                                        |

**DataTable** (`Table` shadcn avancé) :

Colonnes :

| Colonne                    | Largeur | Tri | Contenu                                                             |
| -------------------------- | ------- | --- | ------------------------------------------------------------------- |
| `☐` (checkbox)             | 40px    | —   | Sélection multiple                                                  |
| N° demande                 | 140px   | ✓   | "CR-2026-0042" (lien)                                               |
| NINA                       | 200px   | ✓   | `1 85 01 2 01 001 234 A` (JetBrains Mono 14px)                      |
| Citoyen                    | 180px   | ✓   | "COULIBALY Aminata"                                                 |
| Champ                      | 120px   | ✓   | "Nom"                                                               |
| Valeur actuelle → Nouvelle | 220px   | —   | "KOULIBALY → COULIBALY"                                             |
| Score IA                   | 100px   | ✓   | `Progress` mini + pourcentage, coloré                               |
| Statut                     | 140px   | ✓   | `Badge` coloré (vert/orange/rouge/bleu/gris)                        |
| Date                       | 100px   | ✓   | "29/03/26"                                                          |
| Actions                    | 120px   | —   | `DropdownMenu` (Voir détails, Approuver, Rejeter, Historique audit) |

Données fictives (20 lignes paginées) — noms maliens : COULIBALY, TRAORÉ, DIALLO, KEÏTA, SANGARÉ,
KONATÉ, CISSÉ, TOURÉ, DIARRA, SISSOKO, DEMBÉLÉ, CAMARA, KOUYATÉ, BAGAYOKO, MARIKO, DOUMBIA, SACKO,
KANTÉ, SIDIBÉ, FOFANA.

**Actions en lot** (barre fixe en bas si ≥1 ligne sélectionnée) :

- Background `--primary-dark`, texte blanc
- "3 demandes sélectionnées" + `Button` "Approuver (3)" (success) + `Button` "Rejeter (3)"
  (destructive)

#### Interactions

| Action                       | Comportement                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Filtres                      | Rechargement table en temps réel (debounced)                                 |
| Tri colonne (clic header)    | Tri ascendant/descendant, icône flèche                                       |
| Checkbox "tout sélectionner" | Sélectionne toutes les lignes de la page                                     |
| Clic ligne                   | Ouvre `Sheet` (panneau latéral droit) avec détails complets de la correction |
| Approbation                  | `AlertDialog` → "Motif (optionnel)" → API → Toast succès → statut mis à jour |
| Rejet                        | `Dialog` → `Textarea` motif (obligatoire) → API → Toast → statut mis à jour  |
| Export CSV                   | Télécharge les résultats filtrés                                             |
| Pagination                   | 20 lignes/page, boutons < > et numéros                                       |

**Sheet détail** (panneau latéral droit, w-[480px]) :

- Card profil citoyen (mini)
- Détails correction (champ, valeurs, justificatif preview)
- Score IA détaillé (score global + facteurs : similarité phonétique, Levenshtein, Jaro-Winkler)
- Historique audit de cette demande (mini timeline)
- Boutons : Approuver / Rejeter

#### Responsive

| Breakpoint   | Adaptation                                                                              |
| ------------ | --------------------------------------------------------------------------------------- |
| **Desktop**  | Table complète, toutes colonnes visibles                                                |
| **Tablette** | Colonnes masquées : "Valeur actuelle → Nouvelle", Score remplacé par pastille couleur   |
| **Mobile**   | Table → liste de `Card` empilées, chaque carte = 1 correction. Sheet → page plein écran |

---

### AD-03 — Dashboard SIGAC (Anti-Corruption)

**Route** : `/admin/sigac`

#### Layout

```
┌───────┬─────────────────────────────────┐
│       │  Header                         │
│       ├─────────────────────────────────┤
│  S    │                                 │
│  I    │  Titre: "SIGAC — Anti-Corruption│
│  D    │                                 │
│  E    │  ┌──────┬──────┬──────┬──────┐  │
│  B    │  │ KPI  │ KPI  │ KPI  │ KPI  │  │
│  A    │  │Alerts│Agents│Score │Invest│  │
│  R    │  └──────┴──────┴──────┴──────┘  │
│       │                                 │
│       │  ┌──────────────┬─────────────┐ │
│       │  │CARTE         │ SCORING     │ │
│       │  │THERMIQUE     │ AGENTS      │ │
│       │  │(Régions Mali)│ (Top/Flop)  │ │
│       │  └──────────────┴─────────────┘ │
│       │                                 │
│       │  ┌─────────────────────────────┐│
│       │  │ ALERTES RÉCENTES (Table)    ││
│       │  └─────────────────────────────┘│
│       │                                 │
└───────┴─────────────────────────────────┘
```

#### Composants et données

**4 KPI Cards SIGAC** :

| KPI                     | Icône           | Valeur     | Tendance             |
| ----------------------- | --------------- | ---------- | -------------------- |
| Alertes ouvertes        | `AlertTriangle` | 23         | +5 cette semaine     |
| Agents surveillés       | `UserX`         | 12         | Agents score < 50    |
| Score intégrité moyen   | `ShieldCheck`   | 78.4 / 100 | -2.1 vs mois dernier |
| Investigations en cours | `Search`        | 8          | 3 clôturées ce mois  |

**Carte thermique** (`<HeatmapCard />` — colonne gauche, 55% largeur) :

- Titre : "Alertes par région — 30 derniers jours"
- Carte SVG simplifiée du Mali (11 régions)
- Échelle de couleurs : 0 alertes → `#E8F5ED` (vert pâle) … 10+ alertes → `#CC0000` (rouge)
- Données fictives :

| Région     | Alertes | Couleur      |
| ---------- | ------- | ------------ |
| Bamako     | 8       | Rouge-orange |
| Sikasso    | 4       | Orange       |
| Ségou      | 3       | Jaune-orange |
| Mopti      | 3       | Jaune-orange |
| Kayes      | 2       | Jaune        |
| Koulikoro  | 1       | Vert clair   |
| Tombouctou | 1       | Vert clair   |
| Gao        | 1       | Vert clair   |
| Kidal      | 0       | Vert pâle    |
| Ménaka     | 0       | Vert pâle    |
| Taoudénit  | 0       | Vert pâle    |

- Hover sur région : `Tooltip` "Bamako : 8 alertes (4 élevées, 3 moyennes, 1 faible)"

**Scoring agents** (colonne droite, 45% largeur) :

- Titre : "Scoring intégrité des agents"
- `Tabs` : "Top 5" | "Flop 5" | "Tous"

**Onglet "Top 5"** :

| Rang | Agent         | Centre      | Score | Tendance |
| ---- | ------------- | ----------- | ----- | -------- |
| 1    | Oumar DIARRA  | Commune III | 97.8  | ↑ +0.5   |
| 2    | Aïssata KEÏTA | Commune I   | 96.2  | → stable |
| 3    | Seydou TRAORÉ | Commune V   | 95.1  | ↑ +1.2   |
| 4    | Mariam CISSÉ  | Commune II  | 94.7  | ↑ +0.3   |
| 5    | Bakary KONATÉ | Commune IV  | 93.5  | ↓ -0.8   |

**Onglet "Flop 5"** :

| Rang | Agent           | Centre     | Score | Alerte                           |
| ---- | --------------- | ---------- | ----- | -------------------------------- |
| 1    | Adama SISSOKO   | Commune VI | 32.1  | `Badge` "CRITIQUE" (danger)      |
| 2    | Boubacar TOURÉ  | Sikasso    | 41.7  | `Badge` "ALERTE" (danger)        |
| 3    | Sidi MAÏGA      | Mopti      | 48.3  | `Badge` "ALERTE" (warning)       |
| 4    | Drissa BAGAYOKO | Ségou      | 52.6  | `Badge` "SURVEILLANCE" (warning) |
| 5    | Kadiatou CAMARA | Commune IV | 58.9  | `Badge` "SURVEILLANCE" (warning) |

Chaque ligne : `<IntegrityScoreGauge />` mini (arc de cercle coloré 40px), score en bold. Seuils :
≥80 vert, 50-79 orange, <50 rouge.

**Table alertes récentes** :

| ID       | Type                    | Sévérité          | Agent           | Centre     | Date  | Statut                     | Action        |
| -------- | ----------------------- | ----------------- | --------------- | ---------- | ----- | -------------------------- | ------------- |
| ALT-0023 | Volume anormal          | `Badge` "Élevée"  | Adama SISSOKO   | Commune VI | 29/03 | `Badge` "Ouvert"           | [Investiguer] |
| ALT-0022 | Signalement citoyen     | `Badge` "Élevée"  | — (anonyme)     | Commune V  | 28/03 | `Badge` "En investigation" | [Voir]        |
| ALT-0021 | Horaires suspects       | `Badge` "Moyenne" | Boubacar TOURÉ  | Sikasso    | 27/03 | `Badge` "Ouvert"           | [Investiguer] |
| ALT-0020 | Justificatifs manquants | `Badge` "Moyenne" | Sidi MAÏGA      | Mopti      | 26/03 | `Badge` "Clos" (success)   | [Rapport]     |
| ALT-0019 | Même village > 60%      | `Badge` "Faible"  | Drissa BAGAYOKO | Ségou      | 25/03 | `Badge` "Clos" (success)   | [Rapport]     |

Sévérité badges : Élevée → danger, Moyenne → warning, Faible → muted/outline.

#### Interactions

| Action                | Comportement                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Clic région sur carte | Filtre la table alertes pour cette région                                                         |
| Clic agent (flop)     | Ouvre `Sheet` → profil agent complet (score détaillé 5 critères, historique, opérations récentes) |
| Clic "Investiguer"    | Navigation → page détail alerte avec timeline d'investigation                                     |
| Clic "Rapport"        | Ouvre PDF du rapport d'investigation                                                              |
| Filtre période        | `Select` : "Aujourd'hui", "7 jours", "30 jours"                                                   |

#### Responsive

| Breakpoint   | Adaptation                                                              |
| ------------ | ----------------------------------------------------------------------- |
| **Desktop**  | Carte + Scoring côte à côte                                             |
| **Tablette** | Empilés, carte thermique pleine largeur                                 |
| **Mobile**   | Carte → liste textuelle des régions avec compteurs, scoring → accordion |

---

## 5. Portail Gouvernance

> Application protégée (rôles ADMIN/SUPERVISOR). Même structure sidebar que Dashboard Admin mais
> navigation adaptée : Messagerie, Directives, Performance, Rapports.

### Disposition globale (toutes pages GOV-xx)

Même structure que Dashboard Admin (sidebar + header + contenu) avec items de navigation :

- `Mail` — Messagerie sécurisée
- `ListChecks` — Directives
- `BarChart3` — Performance
- `FileText` — Rapports

---

### GOV-01 — Messagerie officielle sécurisée

**Route** : `/gouvernance/messagerie`

#### Layout

```
┌───────┬──────────────┬──────────────────┐
│       │ LISTE        │ CONVERSATION     │
│  S    │ CONVERSATIONS│ ACTIVE           │
│  I    │              │                  │
│  D    │ [Recherche]  │ Header: destinat.│
│  E    │              │                  │
│  B    │ Conv 1 ●     │ Message 1        │
│  A    │ Conv 2       │ Signature: ✅    │
│  R    │ Conv 3       │                  │
│       │ Conv 4 ●     │ Message 2        │
│       │ ...          │ Signature: ✅    │
│       │              │                  │
│       │              │ ─── Zone saisie ─│
│       │              │ [Composer+Sign]  │
│       │              │ [📎] [Envoyer]  │
│       │              │                  │
│       │ [+ Nouveau]  │                  │
└───────┴──────────────┴──────────────────┘
```

#### Composants et données

**Liste conversations** (panneau gauche, w-[360px], `ScrollArea`) :

Chaque item :

```
┌──────────────────────────────┐
│ Avatar │ Min. Intérieur Mali  │  ← Nom institution
│        │ Directive harmonisa… │  ← Sujet tronqué
│        │ 14:32 · ✅ Signé     │  ← Heure + badge signature
│        │ ● Non lu             │  ← Indicateur (si non lu)
└──────────────────────────────┘
```

Données fictives conversations :

| #   | Institution                        | Sujet                                             | Statut      |
| --- | ---------------------------------- | ------------------------------------------------- | ----------- |
| 1   | Ministère de l'Intérieur — Mali    | "Directive harmonisation bases NINA"              | ● Non lu    |
| 2   | BCID-AES — Secrétariat             | "Calendrier déploiement passeport AES"            | Lu          |
| 3   | DNEC — Direction                   | "Budget Q2 maintenance centres CTDEC"             | Lu          |
| 4   | Ministère de la Sécurité — Burkina | "Protocole mTLS : renouvellement certificats"     | ● Non lu    |
| 5   | DGEC — Niger                       | "Demande accès API vérification transfrontalière" | Lu, répondu |

**Zone conversation** (panneau droit, flex-1) :

**Header conversation** :

- Avatar institution + Nom complet + `Badge` classification ("Confidentiel", "Normal", "Urgent")
- Icônes : `Pin` (épingler), `Archive`, `MoreVertical` (actions supplémentaires)

**Messages** (liste chronologique, `ScrollArea`) :

Message exemple :

```
┌──────────────────────────────────────┐
│  De: Ibrahim MAÏGA                   │
│  Ministère de l'Intérieur — Mali     │
│  29 mars 2026 à 14:32               │
│                                      │
│  Madame, Monsieur,                   │
│                                      │
│  Suite à la réunion du Conseil des   │
│  Ministres AES du 15 mars, veuillez │
│  trouver ci-joint la directive       │
│  d'harmonisation des bases NINA…     │
│                                      │
│  📎 directive_harmonisation_v2.pdf   │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🔒 Signature numérique Ed25519│  │
│  │ ✅ Vérifiée · Hash: a7b3c9... │  │
│  │ Signataire: Ibrahim MAÏGA     │  │
│  │ Horodatage: 29/03/2026 14:32  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ✅ Accusé de réception: 29/03 15:01│
└──────────────────────────────────────┘
```

**Zone de composition** (bas du panneau) :

- `Textarea` extensible, placeholder "Composez votre message..."
- Barre d'outils : `Button` pièce jointe (`Paperclip`), sélecteur classification (`Select` :
  Normal/Confidentiel/Secret), `Switch` "Signer numériquement" (activé par défaut)
- `Button` "Envoyer" (bg-primary, icône `Send`)

#### Interactions

| Action                   | Comportement                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Clic conversation        | Charge les messages dans le panneau droit                                                         |
| ● Non lu → clic          | Marque comme lu, met à jour le compteur sidebar                                                   |
| Envoi message            | Signature Ed25519 côté client → POST API → message apparaît avec badge "✅ Signé"                 |
| Clic "📎 fichier joint"  | Téléchargement chiffré AES-256                                                                    |
| Clic sur badge signature | `Dialog` détails : hash complet, clé publique, horodatage                                         |
| Clic "+ Nouveau"         | `Dialog` : sélection destinataire(s) (`Command` multi-select institutions), sujet, classification |
| Accusé de réception      | Automatique à l'ouverture, horodaté                                                               |

#### Responsive

| Breakpoint   | Adaptation                                                                              |
| ------------ | --------------------------------------------------------------------------------------- |
| **Desktop**  | 3 panneaux : sidebar nav + liste conversations + conversation active                    |
| **Tablette** | 2 panneaux : liste conversations + conversation (sidebar collapse)                      |
| **Mobile**   | 1 panneau à la fois : liste OU conversation (navigation avant/arrière avec `ArrowLeft`) |

---

### GOV-02 — Suivi des directives (Kanban)

**Route** : `/gouvernance/directives`

#### Layout

```
┌───────┬─────────────────────────────────┐
│       │  Header                         │
│       ├─────────────────────────────────┤
│  S    │                                 │
│  I    │  Titre + [+ Nouvelle directive] │
│  D    │  Filtres: [Institution▼]        │
│  E    │          [Priorité▼] [Recherche]│
│  B    │                                 │
│  A    │  KANBAN (scroll horizontal)     │
│  R    │  ┌────────┬────────┬────────┐   │
│       │  │PENDING │IN      │COMPLETED│  │
│       │  │        │PROGRESS│        │   │
│       │  │Card 1  │Card 3  │Card 5  │   │
│       │  │Card 2  │Card 4  │Card 6  │   │
│       │  │        │        │Card 7  │   │
│       │  └────────┴────────┴────────┘   │
│       │  ┌────────┬────────┐            │
│       │  │ESCALATED│CLOSED │            │
│       │  │        │        │            │
│       │  │Card 8  │Card 9  │            │
│       │  └────────┴────────┘            │
│       │                                 │
└───────┴─────────────────────────────────┘
```

#### Composants et données

**Filtres en haut** :

| Filtre      | Composant     | Options                                                                                          |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| Institution | `Select`      | "Toutes", "Min. Intérieur — Mali", "BCID-AES", "DNEC", "DGEC — Niger", "Min. Sécurité — Burkina" |
| Priorité    | `Select`      | "Toutes", "Urgente", "Haute", "Normale", "Basse"                                                 |
| Recherche   | `Input`       | Placeholder "Rechercher une directive..."                                                        |
| Vue         | `Tabs` petits | "Kanban"                                                                                         | "Liste" (DataTable alternative) |

**5 colonnes Kanban** :

| Colonne                | Header couleur    | Badge compteur |
| ---------------------- | ----------------- | -------------- |
| En attente (PENDING)   | `--muted`         | 5              |
| En cours (IN_PROGRESS) | `--accent`        | 8              |
| Terminé (COMPLETED)    | `--success`       | 12             |
| Escaladé (ESCALATED)   | `--danger`        | 2              |
| Clos (CLOSED)          | `--primary-light` | 15             |

**Carte directive** (dans chaque colonne) :

```
┌────────────────────────────────┐
│ Badge: Urgente 🔴               │
│                                │
│ Harmonisation bases NINA       │  ← Titre (H4, 2 lignes max)
│                                │
│ Émetteur: Min. Intérieur       │
│ Exécutant: DNEC — Direction    │
│                                │
│ 📅 Deadline: 15 avril 2026     │
│                                │
│ ┌────────────────────────────┐ │
│ │ Progress: ███████░░░ 70%  │ │
│ └────────────────────────────┘ │
│                                │
│ ⚡ Escalade N+1 dans 3 jours   │  ← si deadline proche, texte warning
│                                │
│ Avatar assignee                │
└────────────────────────────────┘
```

Données fictives directives :

| Titre                             | Émetteur            | Exécutant          | Priorité | Deadline | Statut        | Escalade    |
| --------------------------------- | ------------------- | ------------------ | -------- | -------- | ------------- | ----------- |
| Harmonisation bases NINA          | Min. Intérieur Mali | DNEC Direction     | Urgente  | 15/04/26 | En cours, 70% | N+1 dans 3j |
| Déploiement passeport AES phase 2 | BCID-AES            | CTDEC Bamako       | Haute    | 30/04/26 | En cours, 45% | —           |
| Audit centres Kayes-Sikasso       | ASCE-LC             | CTDEC Régional     | Normale  | 20/05/26 | En attente    | —           |
| Migration certificats mTLS        | BCID-AES            | DSI Mali           | Urgente  | 01/04/26 | Escaladé N+2  | Retard +7j  |
| Rapport SIGAC trimestriel         | OCLEI Mali          | CTDEC Direction    | Normale  | 31/03/26 | Terminé       | —           |
| Formation agents USSD             | DNEC                | CTDEC Tous centres | Basse    | 15/06/26 | En attente    | —           |
| Budget maintenance Q2             | Min. Finances       | DNEC Direction     | Haute    | 10/04/26 | En cours, 20% | Rappel 24h  |

**Règles d'escalade** (visuel dans les cartes) :

- Deadline dans < 24h : bordure orange, icône `Clock` clignotant
- Deadline dépassée : bordure rouge, `Badge` "RETARD +Xj"
- Escalade N+1 (>72h retard) : icône `ArrowUp`, notification au superviseur
- Escalade N+2 (>7j retard) : icône `ArrowUpUp`, `Badge` "ESCALADÉ" rouge

#### Interactions

| Action                      | Comportement                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Drag & drop carte           | Déplacement entre colonnes (change statut) — avec `AlertDialog` si passage en "Terminé"      |
| Clic carte                  | `Sheet` panneau latéral : détails complets, historique, commentaires, pièces jointes         |
| Clic "+ Nouvelle directive" | `Dialog` formulaire : titre, description, exécutant (Select institution), priorité, deadline |
| Passage en "Terminé"        | Obligé de joindre un rapport/commentaire justificatif                                        |
| Passage en "Escaladé"       | Automatique (système) OU manuel par superviseur avec motif                                   |
| Filtre institution          | Filtre les cartes dans toutes les colonnes                                                   |
| Toggle vue "Liste"          | `Table` avec mêmes données en format tabulaire classique                                     |

#### Responsive

| Breakpoint   | Adaptation                                                                             |
| ------------ | -------------------------------------------------------------------------------------- |
| **Desktop**  | 5 colonnes visibles, scroll horizontal si nécessaire                                   |
| **Tablette** | 3 colonnes visibles, scroll horizontal                                                 |
| **Mobile**   | Vue liste forcée (pas de Kanban), cartes empilées groupées par statut dans `Accordion` |

---

## 6. Interface USSD

### USSD-01 — Arborescence *123*NINA#

> L'USSD n'a pas de maquette Figma traditionnelle mais un **flowchart textuel** représentant
> l'arborescence des menus et réponses. Représenter dans Figma comme un diagramme de flux (nodes +
> flèches).

#### Écran de simulation

Pour Figma, créer un frame "smartphone basique" (feature phone) avec écran texte vert sur fond noir.

```
┌──────────────────┐
│ ☎ *123*NINA#      │
│                   │
│ ┌───────────────┐ │
│ │               │ │
│ │ (Texte USSD   │ │
│ │  vert sur     │ │
│ │  fond noir)   │ │
│ │               │ │
│ │               │ │
│ └───────────────┘ │
│                   │
│  [1][2][3]        │
│  [4][5][6]        │
│  [7][8][9]        │
│  [*][0][#]        │
│                   │
│  [Envoyer]        │
└──────────────────┘
```

#### Arborescence complète

```
*123*NINA#
│
├── [Écran 0] Sélection de langue
│   "Choisissez votre langue / Kan kɔrɔ sugandi:
│    1. Français
│    2. Bambara (Bamanankan)
│    3. Sonrhaï (Songhay)
│    4. Peulh (Fulfulde)
│    5. Tamasheq
│    6. Dogon
│    7. Soninké
│    8. Bobo"
│
├── [Écran 1] Menu Principal (après choix langue)
│   "NINA-AES · Menu Principal
│    1. Vérifier mon NINA
│    2. Prendre rendez-vous
│    3. Suivre ma demande
│    4. Signaler un abus
│    5. Aide / Changer langue
│    0. Quitter"
│
├── [1] Vérifier mon NINA
│   ├── [Écran 1.1] "Entrez votre NINA (15 caractères):"
│   │   → Utilisateur saisit: 185012010012344A
│   │
│   ├── [Écran 1.2] Résultat (si trouvé)
│   │   "✅ NINA trouvé
│   │    Nom: COULIBALY
│   │    Prénoms: Aminata Fatoumata
│   │    Né(e): 15/03/1985
│   │    Sexe: F
│   │    Résidence: Bamako, Commune V
│   │
│   │    1. Demander correction
│   │    2. Télécharger fiche (SMS)
│   │    0. Menu principal"
│   │
│   ├── [Écran 1.2b] Résultat (si non trouvé)
│   │   "❌ NINA introuvable.
│   │    Vérifiez et réessayez.
│   │    1. Réessayer
│   │    0. Menu principal"
│   │
│   ├── [1.2 → 1] Demander correction
│   │   ├── [Écran 1.3] "Quel champ corriger?
│   │   │    1. Nom
│   │   │    2. Prénoms
│   │   │    3. Date de naissance
│   │   │    4. Lieu de naissance
│   │   │    5. Résidence
│   │   │    6. Parents
│   │   │    0. Retour"
│   │   │
│   │   ├── [Écran 1.4] "Entrez la valeur correcte:"
│   │   │   → Utilisateur saisit: COULIBALY
│   │   │
│   │   └── [Écran 1.5] Confirmation
│   │       "Correction enregistrée.
│   │        N° demande: CR-2026-0042
│   │        Vous serez notifié par SMS.
│   │        0. Menu principal"
│   │
│   └── [1.2 → 2] Télécharger fiche
│       └── [Écran 1.6]
│           "📱 Un SMS avec le lien de
│            téléchargement sera envoyé
│            au +223 76 45 23 12.
│            0. Menu principal"
│
├── [2] Prendre rendez-vous
│   ├── [Écran 2.1] "Votre région:
│   │    1. Bamako
│   │    2. Kayes
│   │    3. Koulikoro
│   │    4. Sikasso
│   │    5. Ségou
│   │    6. Mopti
│   │    7. Plus de régions..."
│   │
│   ├── [Écran 2.2] "Choisir le centre:
│   │    1. CTDEC Commune I
│   │    2. CTDEC Commune II
│   │    3. CTDEC Commune III
│   │    4. CTDEC Commune IV
│   │    5. CTDEC Commune V
│   │    6. CTDEC Commune VI"
│   │
│   ├── [Écran 2.3] "Créneaux disponibles:
│   │    1. Lun 31/03 — 08:00
│   │    2. Lun 31/03 — 09:30
│   │    3. Mar 01/04 — 08:00
│   │    4. Mar 01/04 — 10:00
│   │    5. Mer 02/04 — 08:00
│   │    0. Retour"
│   │
│   └── [Écran 2.4] Confirmation
│       "✅ RDV confirmé!
│        Centre: CTDEC Commune V
│        Date: Mar 01/04 à 08:00
│        File n°: 7
│        Rappel SMS 24h avant.
│        0. Menu principal"
│
├── [3] Suivre ma demande
│   ├── [Écran 3.1] "Entrez votre n° de demande
│   │    (ex: CR-2026-0042):"
│   │
│   └── [Écran 3.2] Résultat
│       "📋 Demande CR-2026-0042
│        Statut: En revue par agent
│        Étape: 3/5
│        Dernière MAJ: 30/03/2026
│        Agent: Mamadou T.
│        0. Menu principal"
│
├── [4] Signaler un abus
│   ├── [Écran 4.1] "⚠️ Ce signalement est
│   │    anonyme. Aucune info
│   │    personnelle n'est stockée.
│   │
│   │    Type d'abus:
│   │    1. Demande de paiement
│   │    2. Favoritisme
│   │    3. Falsification
│   │    4. Refus de service
│   │    5. Autre
│   │    0. Retour"
│   │
│   ├── [Écran 4.2] "Décrivez brièvement
│   │    les faits (max 160 car.):"
│   │    → "Agent a demandé 5000 FCFA
│   │       pour traiter mon dossier
│   │       en priorité au CTDEC CIV"
│   │
│   └── [Écran 4.3] Token
│       "✅ Signalement enregistré.
│        Token de suivi:
│        SIG-a7b3c9d2
│        IMPORTANT: Notez ce token.
│        Pour suivre: *123*NINA#
│        puis option 3.
│        0. Menu principal"
│
├── [5] Aide / Changer langue
│   ├── [Écran 5.1]
│   │   "1. Changer de langue
│   │    2. Aide: Qu'est-ce que NINA?
│   │    3. Aide: Comment corriger?
│   │    4. Contacter le CTDEC
│   │    5. Numéro vert: 80 00 11 22
│   │    0. Menu principal"
│   │
│   ├── [5 → 1] Retour à l'écran 0 (langues)
│   │
│   ├── [5 → 2]
│   │   "Le NINA est votre Numéro
│   │    d'Identification Nationale.
│   │    Format: 14 chiffres + 1 lettre.
│   │    Il figure sur votre fiche
│   │    descriptive individuelle
│   │    délivrée par le CTDEC.
│   │    0. Retour"
│   │
│   ├── [5 → 3]
│   │   "Pour corriger une erreur:
│   │    1. Composez *123*NINA#
│   │    2. Choisissez option 1
│   │    3. Entrez votre NINA
│   │    4. Sélectionnez 'Correction'
│   │    5. Suivez les instructions
│   │    Gratuit pour les +60 ans.
│   │    0. Retour"
│   │
│   └── [5 → 4]
│       "📞 Contactez le CTDEC:
│        Tél: +223 20 22 74 15
│        Adresse: Rue Baba Diarra,
│        BP 215, Bamako
│        Horaires: Lun-Ven 7h30-16h
│        Numéro vert: 80 00 11 22
│        0. Retour"
│
└── [0] Quitter
    └── "Merci d'avoir utilisé
         NINA-AES. Au revoir! / I ni cé!"
```

#### Notes d'implémentation USSD

- **Session Redis** : TTL 5 minutes, stocke `{sessionId, language, currentScreen, ninaNumber}`
- **Webhook** : POST depuis Africa's Talking → `services/ussd-service/`
- **Encodage** : GSM 7-bit, max 182 caractères par écran
- **Temps de réponse** : < 2 secondes par écran
- **Bambara** (exemple écran 1) :
  ```
  NINA-AES · Fɛɛrɛ kunafoniw
  1. N ka NINA lajɛ
  2. Waati ta
  3. N ka ɲininkali ladoni
  4. Jugu ko jira
  5. Dɛmɛ / Kan cogo yɛlɛma
  0. Ka bɔ
  ```

#### Représentation Figma

Dans Figma, créer :

1. **Frame "feature phone"** (180×320px) avec écran texte monospace vert (#00FF41) sur fond noir
2. **Flowchart** (1920×1080px minimum) avec :
   - Nodes rectangulaires arrondis pour chaque écran (fond #1B3A5C, texte blanc)
   - Flèches avec label numéro (1-5) entre les nodes
   - Nodes de décision (losanges) pour les conditions (NINA trouvé / non trouvé)
   - Légende des couleurs : bleu = navigation, vert = succès, rouge = erreur
3. **8 variantes linguistiques** du menu principal (même structure, textes traduits)

---

## 7. Design tokens & variables Figma

### Variables Figma à créer

Créer une collection "NINA-AES Tokens" dans Figma avec les groupes :

#### Couleurs (Color variables)

```
Colors/
├── Primary/
│   ├── Default    → #1B3A5C
│   ├── Light      → #274D73
│   ├── Dark       → #122841
│   └── Foreground → #FFFFFF
├── Accent/
│   ├── Default    → #2E75B6
│   ├── Light      → #4A91D0
│   └── Foreground → #FFFFFF
├── Success/
│   ├── Default    → #1B7A3D
│   ├── Light      → #E8F5ED
│   └── Foreground → #FFFFFF
├── Warning/
│   ├── Default    → #E6A817
│   ├── Light      → #FFF8E1
│   └── Foreground → #1B3A5C
├── Danger/
│   ├── Default    → #CC0000
│   ├── Light      → #FFEAEA
│   └── Foreground → #FFFFFF
├── Neutral/
│   ├── Background → #F8FAFC
│   ├── Card       → #FFFFFF
│   ├── Border     → #E2E8F0
│   ├── Muted      → #64748B
│   └── Text       → #0F172A
└── AES/
    ├── Mali       → #14B53A
    ├── Burkina    → #EF3340
    └── Niger      → #FF7F00
```

#### Espacements (Number variables)

```
Spacing/
├── xs     → 4
├── sm     → 8
├── md     → 16
├── lg     → 24
├── xl     → 32
├── 2xl    → 48
└── 3xl    → 64
```

#### Border radius

```
Radius/
├── sm     → 4
├── md     → 6
├── lg     → 8
├── xl     → 12
└── full   → 9999
```

### Styles de texte Figma

| Nom du style      | Police         | Taille | Poids          | Line-height |
| ----------------- | -------------- | ------ | -------------- | ----------- |
| Display/Large     | Geist Sans     | 48px   | Bold (700)     | 56px        |
| Display/Medium    | Geist Sans     | 36px   | Bold (700)     | 44px        |
| Heading/H1        | Geist Sans     | 30px   | Bold (700)     | 36px        |
| Heading/H2        | Geist Sans     | 24px   | SemiBold (600) | 32px        |
| Heading/H3        | Geist Sans     | 20px   | SemiBold (600) | 28px        |
| Body/Default      | Inter          | 16px   | Regular (400)  | 24px        |
| Body/Small        | Inter          | 14px   | Regular (400)  | 20px        |
| Caption           | Inter          | 12px   | Regular (400)  | 16px        |
| Code/NINA Large   | JetBrains Mono | 24px   | SemiBold (600) | 32px        |
| Code/NINA Default | JetBrains Mono | 18px   | Medium (500)   | 24px        |
| Code/Default      | JetBrains Mono | 14px   | Regular (400)  | 20px        |

### Composants Figma à créer (component library)

| Composant Figma     | Variants                                                          | Props                                       |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Button              | Default, Outline, Ghost, Destructive, Link × Small, Medium, Large | Label, Icon (left/right), Loading state     |
| Badge               | Default, Success, Warning, Danger, Outline × Small, Default       | Label                                       |
| Card                | Default, Hover, Selected                                          | Has header, Has footer, Has image           |
| Input               | Default, Focused, Error, Disabled                                 | Label, Placeholder, Helper text, Error text |
| Select              | Closed, Open                                                      | Label, Options list, Selected value         |
| NinaSearchBar       | Default, Typing (valid), Typing (invalid), Loading                | NINA value                                  |
| CitizenCard         | Compact, Full                                                     | Photo, Name, NINA, Verification badge       |
| CorrectionTimeline  | 5 étapes × chaque combinaison statut                              | Step statuses array                         |
| LanguageSelector    | Closed, Open                                                      | Selected language                           |
| KpiCard             | Default, Positive trend, Negative trend                           | Icon, Value, Trend %, Label                 |
| IntegrityScoreGauge | Green (≥80), Orange (50-79), Red (<50)                            | Score value                                 |
| AesCountryBadge     | Mali, Burkina, Niger                                              | Country name                                |

---

## Annexe : Récapitulatif des 12 écrans

| ID      | Écran               | Application     | Complexité  |
| ------- | ------------------- | --------------- | ----------- |
| PC-01   | Accueil             | Portail Citoyen | Moyenne     |
| PC-02   | Résultat NINA       | Portail Citoyen | Élevée      |
| PC-03   | Correction          | Portail Citoyen | Élevée      |
| PC-04   | Rendez-vous         | Portail Citoyen | Élevée      |
| PC-05   | Suivi demande       | Portail Citoyen | Moyenne     |
| PC-06   | Signalement         | Portail Citoyen | Moyenne     |
| AD-01   | Dashboard           | Admin           | Élevée      |
| AD-02   | Gestion corrections | Admin           | Très élevée |
| AD-03   | SIGAC               | Admin           | Très élevée |
| GOV-01  | Messagerie          | Gouvernance     | Élevée      |
| GOV-02  | Directives Kanban   | Gouvernance     | Élevée      |
| USSD-01 | Flowchart USSD      | USSD            | Moyenne     |

### Ordre de création recommandé dans Figma

1. **Design tokens** (couleurs, typographie, espacements)
2. **Composants atomiques** (Button, Badge, Input, Card, Select)
3. **Composants composés** (NinaSearchBar, CitizenCard, KpiCard, Timeline)
4. **PC-01** (page d'accueil — établit le ton)
5. **PC-02** (résultat — données réelles affichées)
6. **PC-03** (correction — formulaire complexe + IA)
7. **PC-05** (suivi — timeline réutilisable)
8. **PC-04** (rendez-vous — calendrier)
9. **PC-06** (signalement — formulaire anonyme)
10. **AD-01** (dashboard — KPIs + graphiques)
11. **AD-02** (DataTable — composant le plus complexe)
12. **AD-03** (SIGAC — carte thermique)
13. **GOV-01** (messagerie — layout 3 panneaux)
14. **GOV-02** (Kanban — drag & drop)
15. **USSD-01** (flowchart — dernier car textuel)
