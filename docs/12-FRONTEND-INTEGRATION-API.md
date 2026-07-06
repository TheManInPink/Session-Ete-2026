# 12 — Frontend Integration API (Next.js 16 + React 19 + shadcn/ui + Design System AES)

> ⚠️ **Mise à jour mai 2026** — voir [`CHANGELOG.md`](./CHANGELOG.md) pour l'état effectif. Avant
> toute modification de ce document :
>
> - Lire [`CHANGELOG.md`](./CHANGELOG.md) (versions réelles, écarts résolus)
> - Lire [`../MAINTENANCE.md`](../MAINTENANCE.md) §3 (mapping « quand modifier quoi »)
> - Le design system canonique est
>   [`design-system/design-system.md`](./design-system/design-system.md)
>   - [`design-system/tokens.json`](./design-system/tokens.json) (Style Dictionary)
> - Les wireframes des 12 écrans sont dans [`design-system/screens.md`](./design-system/screens.md)
> - Les prompts Figma Make sont dans
>   [`design-system/figma-prompts.md`](./design-system/figma-prompts.md)
>
> Toute évolution structurelle (nouvelle app, nouveau client API, nouveau parcours) doit être
> propagée dans `MAINTENANCE.md` §3.

> **Projet** : NINA-AES Platform **Document** : 12/26 **Apps** : `apps/citizen` (port 4001) ·
> `apps/admin` (port 4002) · `apps/governance` (port 4003) **Stack** : Next.js 16.2.6 · React 19.2 ·
> TanStack Query 5.90 · Zustand 5.1 · Tailwind CSS 4.2 · shadcn/ui (canary-2026) · Zod 4.3 · React
> Hook Form 8.0 · next-intl 5.2 · TypeScript 6.0 **Auteur** : Étudiant UQAR **Date** : Avril 2026
> **Prérequis** : [07 — Identity Service](./07-BACKEND-IDENTITY-SERVICE.md) ·
> [08 — Auth Service](./08-BACKEND-AUTH-SERVICE.md) ·
> [10 — Document Service](./10-BACKEND-DOCUMENT-SERVICE.md) ·
> [11 — AI Service](./11-AI-SERVICE-FASTAPI.md) **ADR connexes** :
> [ADR-002 — Microservices](./adr/ADR-002-microservices.md) ·
> [ADR-013 — Keycloak IdP](./adr/ADR-013-keycloak-identity-provider.md)

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Pourquoi 3 apps Next.js 16 distinctes ?](#2-pourquoi-3-apps-nextjs-16-distinctes)
3. [Technologies utilisées (versions avril 2026)](#3-technologies-utilisées)
4. [Architecture frontend globale](#4-architecture-frontend-globale)
5. [Design System AES — identité visuelle souveraine](#5-design-system-aes)
6. [Structure des 3 apps + packages partagés](#6-structure-des-3-apps)
7. [Client HTTP typé `@nina-aes/api-client`](#7-client-http-typé)
8. [Gestion JWT — login, refresh silencieux, logout propre](#8-gestion-jwt)
9. [Intercepteurs — retry, correlation-id, erreurs normalisées](#9-intercepteurs)
   - 9bis.
     [Sécurité frontend — verifyIdToken, requireRole, secrets Vault, headers, rate-limiting, CSRF](#9bis-sécurité-frontend--vérification-de-jeton-rôles-secrets-vault-headers-rate-limiting-csrf)
10. [State management — TanStack Query + Zustand](#10-state-management)
11. [App `citizen` — pages critiques](#11-app-citizen)
12. [App `admin` — validation des corrections IA + recherche](#12-app-admin)
13. [App `governance` — dashboards exécutifs](#13-app-governance)
14. [Internationalisation 8 langues avec `next-intl`](#14-internationalisation)
15. [Accessibilité WCAG 2.2 AA](#15-accessibilité)
16. [Tests (Vitest + Playwright + visual regression)](#16-tests)
17. [Mini-rapport d'étape + checklist](#17-mini-rapport-détape--checklist)
18. [Pour aller plus loin](#18-pour-aller-plus-loin)

---

## 1. Objectif pédagogique

Connecter les **trois applications Next.js 16** (citoyen, admin, gouvernance) aux **sept APIs
backend** déjà construites (identity, auth, audit, document, correction, appointment, ai), avec une
architecture typée, sécurisée, internationalisée et accessible.

À la fin de ce document, un citoyen peut se connecter, rechercher son NINA, consulter sa fiche,
demander une correction et télécharger son PDF signé. Un agent peut valider les suggestions IA. Un
décideur gouvernemental peut consulter les KPI consolidés.

### Ce que tu vas apprendre

| Compétence                                | Niveau | Application au projet                                 |
| ----------------------------------------- | ------ | ----------------------------------------------------- |
| Next.js 16 App Router + Server Actions    | Avancé | RSC par défaut, server actions pour mutations         |
| TanStack Query 5.90 (+ prefetch SSR)      | Avancé | Cache côté client, invalidation granulaire            |
| shadcn/ui composant-by-composant          | Avancé | Copie de code, theming CSS-variables, pas de runtime  |
| Tailwind CSS 4 (Oxide engine)             | Avancé | Classe utilitaires, design tokens AES, dark mode      |
| Client HTTP typé (fetch + Zod parse)      | Expert | Type safety bout en bout backend→frontend             |
| Refresh token silencieux                  | Expert | Détection 401, refresh transparent, queue de requêtes |
| next-intl 5 multi-langues                 | Avancé | 8 langues nationales, routage `/fr/`, fallback        |
| A11y (ARIA, focus trap, lecteurs d'écran) | Avancé | WCAG 2.2 AA, composants Radix sous shadcn             |
| Tests E2E Playwright                      | Avancé | Parcours citoyen complet + admin IA                   |

### Livrable à la fin de ce document

- **3 apps Next.js 16** démarrées sur les ports 4001/4002/4003
- **Package partagé `@nina-aes/api-client`** avec client typé pour les 7 APIs
- **Package partagé `@nina-aes/ui`** avec design system AES (40+ composants shadcn)
- **Package partagé `@nina-aes/i18n`** avec 8 langues (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE)
- **Parcours citoyen complet** : login Keycloak → recherche NINA → correction → PDF download
- **Dashboard admin** : liste des corrections IA, validation / rejet, recherche citoyens
- **Dashboard gouvernance** : KPI agrégés (nombre d'enrôlements/jour, taux d'erreur IA, SLA)
- **Tests Vitest** ≥ 80 % sur hooks et utilitaires
- **Tests Playwright E2E** couvrant 3 parcours critiques (1 par app)
- **Bundle size** : First Load JS < 180 KB par app (Lighthouse score ≥ 90)

---

## 2. Pourquoi 3 apps Next.js 16 distinctes ?

### 2.1 Personas et séparation des préoccupations

Le cahier des charges distingue **trois familles d'utilisateurs** aux besoins radicalement
différents :

| App          | Persona                                  | Device cible           | Bande passante | Niveau technique | Volumétrie   |
| ------------ | ---------------------------------------- | ---------------------- | -------------- | ---------------- | ------------ |
| `citizen`    | Citoyen malien, diaspora AES             | Mobile 3G prioritaire  | 100–500 kbps   | Bas              | ~500k users  |
| `admin`      | Agent CTDEC, superviseur, inspecteur     | Desktop/laptop 4G/WiFi | 5–50 Mbps      | Intermédiaire    | ~2 000 users |
| `governance` | Directeur, ministre, gouverneur régional | Desktop 4G/Fibre       | 10–100 Mbps    | Haut             | ~150 users   |

Construire une **seule SPA** qui couvre ces 3 cas (rôles dynamiques, menus conditionnels) mène
systématiquement à :

- **Un bundle obèse** (chargement lent sur 3G citoyenne),
- **Des vulnérabilités** (code admin livré au navigateur d'un citoyen hostile),
- **Des régressions croisées** (un bug dashboard casse le login citoyen),
- **Un cycle CI/CD figé** (on ne peut pas déployer l'admin sans redéployer le citoyen).

### 2.2 Décision — 3 apps physiquement séparées

Chaque app est un **projet Next.js 16 autonome** dans le monorepo Turborepo. Elles **partagent** :

- **Le design system** (`@nina-aes/ui`) — tokens CSS, composants React,
- **Le client API** (`@nina-aes/api-client`) — fetch wrappers typés,
- **Les types métier** (`@nina-aes/shared-types`) — Citizen, Correction, Document, etc.,
- **Les fichiers i18n** (`@nina-aes/i18n`) — 8 langues,
- **La config Tailwind/ESLint/TSConfig** (via `@nina-aes/tailwind-config`,
  `@nina-aes/eslint-config`, `@nina-aes/typescript-config`).

Mais elles **ne partagent ni bundle ni session ni domaine** :

- `citizen.nina-aes.ml` → app citoyenne,
- `admin.nina-aes.ml` → app agents/superviseurs,
- `exec.nina-aes.ml` → app gouvernance.

Chaque app utilise son propre **client Keycloak** (`nina-citizen`, `nina-admin`, `nina-governance`)
avec ses propres scopes et rôles minimaux (principe du moindre privilège, cf. ADR-013).

### 2.3 Pourquoi Next.js 16 plutôt que Remix / SvelteKit / Nuxt 4 ?

| Framework         | Avantages                                                          | Inconvénients (pour NINA-AES)                                   |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Next.js 16** ✅ | App Router stable, RSC natifs, SSR streaming, Turbopack prod ready | Verbosité sur server actions — acceptable                       |
| Remix (v3)        | Excellent sur la séparation loader/action                          | Ecosystème Admin/UI plus mince que shadcn/Tailwind v4           |
| SvelteKit 3       | Bundle minuscule (~30 KB)                                          | Écosystème TS plus pauvre, TanStack Query pas officiel          |
| Nuxt 4            | Vue écosystème, auto-imports                                       | Vue ≠ stack dominante équipe solo qui maîtrise React            |
| Astro 5           | MPA hybride, islands                                               | Inadapté aux apps très interactives (dashboard IA, formulaires) |

Next.js 16 apporte en avril 2026 :

- **Turbopack production** (stable depuis 15.5, activé par défaut 16.0),
- **Partial Prerendering (PPR) stable** : les cartes dashboard admin sont static, les données
  dynamiques streamées,
- **React 19.2** avec `use()`, `useOptimistic`, `useActionState`,
- **Server Components + Server Actions** natifs → moins de code client que Remix ou SvelteKit pour
  une forme équivalente.

---

## 3. Technologies utilisées

### 3.1 Dépendances core (partagées entre les 3 apps)

| Package                          | Version   | Rôle                                    |
| -------------------------------- | --------- | --------------------------------------- |
| `next`                           | `16.2.6`  | Framework React avec App Router         |
| `react`                          | `19.2.0`  | Lib UI, hooks `use()`, `useActionState` |
| `react-dom`                      | `19.2.0`  | Rendu DOM                               |
| `typescript`                     | `6.0.2`   | Typage strict `"strict": true`          |
| `tailwindcss`                    | `4.2.1`   | CSS utility + Oxide engine (Rust)       |
| `@tailwindcss/postcss`           | `4.2.1`   | Plugin PostCSS v4                       |
| `lightningcss`                   | `1.30.0`  | Minification CSS native                 |
| `@tanstack/react-query`          | `5.90.1`  | Cache client + mutations                |
| `@tanstack/react-query-devtools` | `5.90.1`  | Devtools dev-only                       |
| `zustand`                        | `5.1.0`   | State management global léger           |
| `zod`                            | `4.3.0`   | Validation runtime + inférence types    |
| `react-hook-form`                | `8.0.2`   | Formulaires contrôlés                   |
| `@hookform/resolvers`            | `4.1.0`   | Résolveur Zod pour RHF                  |
| `next-intl`                      | `5.2.0`   | i18n routing + messages + pluralization |
| `lucide-react`                   | `0.460.0` | Icônes                                  |
| `class-variance-authority`       | `0.9.0`   | Variants CSS pour composants shadcn     |
| `clsx`                           | `2.1.2`   | Concaténation conditionnelle de classes |
| `tailwind-merge`                 | `2.6.0`   | Merge sans conflits Tailwind            |
| `sonner`                         | `1.7.0`   | Toasts (remplace react-hot-toast)       |
| `date-fns`                       | `4.1.0`   | Formatage dates + locales FR/BM/etc.    |
| `@radix-ui/react-dialog`         | `1.1.5`   | Primitive dialog (sous shadcn)          |
| `@radix-ui/react-dropdown-menu`  | `2.1.5`   | Primitive menu                          |
| `@radix-ui/react-toast`          | `1.2.5`   | Primitive toast                         |
| `@radix-ui/react-select`         | `2.2.0`   | Primitive select accessible             |

### 3.2 Dépendances spécifiques par app

| App          | Dépendances supplémentaires                                                    |
| ------------ | ------------------------------------------------------------------------------ |
| `citizen`    | `react-qr-code` (affichage QR fiche), `next-pwa` (offline basique)             |
| `admin`      | `@tanstack/react-table` (tableaux avancés), `recharts` 3.0 (graphiques IA)     |
| `governance` | `recharts` 3.0, `@visx/visx` (dashboards exécutifs), `pdf-lib-client` (export) |

### 3.3 Dépendances dev (mutualisées via `@nina-aes/eslint-config` et similaires)

| Package                     | Version  | Rôle                    |
| --------------------------- | -------- | ----------------------- |
| `vitest`                    | `2.2.0`  | Tests unitaires rapides |
| `@testing-library/react`    | `16.2.0` | Tests composants React  |
| `@testing-library/jest-dom` | `6.6.0`  | Matchers DOM            |
| `@playwright/test`          | `1.52.0` | Tests E2E               |
| `msw`                       | `2.7.0`  | Mock API côté tests     |
| `@axe-core/playwright`      | `4.10.0` | Audit a11y automatisé   |
| `lighthouse-ci`             | `0.15.0` | Perf budget en CI       |

### 3.4 Pourquoi TanStack Query + Zustand plutôt que Redux Toolkit ?

- **Redux Toolkit + RTK Query** impose un store global obligatoire, plus de boilerplate (slices,
  thunks) et ne maîtrise pas la cache HTTP finement (pas de stale-while-revalidate natif).
- **TanStack Query** est le **standard 2026** pour la data fetching : cache par clé, retry,
  invalidation granulaire, devtools, SSR prefetch, optimistic updates natifs.
- **Zustand** couvre les rares besoins d'état global non-serveur (langue UI, thème, toast queue). 5
  KB gzip, zéro boilerplate, hooks natifs.

Règle pragmatique : **data serveur → TanStack Query**, **UI state local → `useState`**, **UI state
global → Zustand**.

---

## 4. Architecture frontend globale

### 4.1 Vue d'ensemble (diagramme composants)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        Navigateurs / Devices                                    │
│   Citoyen (mobile 3G)   Agent (desktop)   Décideur (desktop)                   │
└────────┬─────────────────────┬─────────────────────┬──────────────────────────┘
         │                     │                     │
         │ HTTPS + CSP         │ HTTPS + CSP         │ HTTPS + CSP
         │                     │                     │
┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
│  apps/citizen   │   │  apps/admin     │   │ apps/governance │
│  port 4001      │   │  port 4002      │   │  port 4003      │
│  Next.js 16     │   │  Next.js 16     │   │  Next.js 16     │
│  (RSC+PPR)      │   │  (RSC+PPR)      │   │  (RSC+PPR)      │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         │    ┌────────────────┴─────────────────────┘
         │    │           @nina-aes/api-client  (typé via Zod)
         │    │           @nina-aes/ui          (shadcn theming)
         │    │           @nina-aes/i18n        (8 langues)
         │    │           @nina-aes/shared-types
         ▼    ▼
┌──────────────────────────────────────────────────────────────┐
│                  API Gateway (Traefik v3)                     │
│     tls mutuel interne, routing par subdomain                 │
└──────┬───────┬─────────┬────────┬────────┬────────┬──────────┘
       │       │         │        │        │        │
       ▼       ▼         ▼        ▼        ▼        ▼
  identity   auth    document  correct  appoint    ai     (11 microservices)
  :3001     :3002    :3004     :3005    :3006     :3003
       │       │         │        │        │        │
       └───────┴────┬────┴────────┴────────┴────────┘
                    │
                    ▼
              Keycloak 26 (port 8080)
              JWKS public  /realms/nina-aes/.well-known/jwks.json
```

### 4.2 Principes architecturaux

1. **Server Components par défaut** — chaque page est un RSC (React Server Component) sauf si
   explicitement marquée `"use client"`. Avantage : moins de JS livré au navigateur, meilleure perf
   sur mobile 3G.
2. **Server Actions pour les mutations simples** — l'envoi d'un formulaire de correction passe par
   une Server Action qui appelle l'API backend via `@nina-aes/api-client` **côté serveur**. Évite
   d'exposer l'`access_token` au navigateur.
3. **Client Components pour les interactions** — seuls les formulaires complexes, le QR scanner
   (caméra), les tableaux TanStack, et les graphiques Recharts sont côté client.
4. **Partial Prerendering (PPR)** — pages gouvernance : la coque est statique (rendue au build), les
   cartes KPI streamées dynamiquement. Première peinture en <200 ms même sur 3G.
5. **Session côté serveur** — le JWT est stocké en cookie httpOnly + Secure + SameSite=Lax,
   **jamais** en `localStorage`. Refresh token en cookie httpOnly avec path `/api/auth/refresh`
   uniquement.
6. **CSP stricte** —
   `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; connect-src 'self' https://api.nina-aes.ml wss://api.nina-aes.ml`.
   Aucun `unsafe-inline`.

### 4.3 Flux type — Affichage fiche citoyen (RSC + streaming)

```
┌──────────────┐  1. GET /fr/nina/1234567890123A
│   Citoyen    │───────────────────────────────────────────────────┐
└──────────────┘                                                   │
                                                                   ▼
                         ┌──────────────────────────────────────────┐
                         │  apps/citizen (Next.js 16 server)        │
                         │  app/[locale]/nina/[nina]/page.tsx       │
                         │  ┌─────────────────────────────────────┐ │
                         │  │ async function Page({ params })     │ │
                         │  │   const token = cookies().get('ta') │ │
                         │  │   const citizen = await api         │ │
                         │  │     .identity.getByNina(nina, tk)   │ │
                         │  │   return <CitizenCard … />          │ │
                         │  └─────────────────────────────────────┘ │
                         └──────────────────┬───────────────────────┘
                                            │ fetch serveur-à-serveur
                                            │ Authorization: Bearer …
                                            ▼
                         ┌──────────────────────────────────────────┐
                         │  identity-service (NestJS, port 3001)    │
                         └──────────────────┬───────────────────────┘
                                            │ Prisma
                                            ▼
                                       PostgreSQL 18
```

Aucun JS client n'est nécessaire pour afficher la fiche. Seuls le bouton "Demander une correction"
et le bouton "Télécharger le PDF" sont hydratés (client components).

---

## 5. Design System AES — identité visuelle souveraine

### 5.1 Philosophie

Le système visuel doit :

- **Refléter la souveraineté AES** sans tomber dans le symbolisme nationaliste agressif,
- **Fonctionner sur mobile bas de gamme** (écrans 320 px, 60 Hz, luminosité faible en plein soleil),
- **Être accessible WCAG 2.2 AA** (contraste ≥ 4.5:1 texte, ≥ 3:1 composants),
- **Supporter le RTL partiel** (tamasheq en tifinagh s'écrit horizontalement, pas de RTL, mais
  prévoir pour l'arabe futur éventuel diaspora).

### 5.2 Palette — drapeaux AES + neutres

Les 3 pays de l'AES (Mali, Burkina Faso, Niger) partagent les couleurs **vert / jaune / rouge** dans
différentes configurations. On extrait une palette commune sans prendre parti.

```css
/* packages/ui/src/styles/tokens.css */
@layer base {
  :root {
    /* AES principal (vert sahélien) */
    --aes-primary-50: oklch(0.97 0.02 145);
    --aes-primary-100: oklch(0.93 0.05 145);
    --aes-primary-200: oklch(0.85 0.1 145);
    --aes-primary-300: oklch(0.75 0.15 145);
    --aes-primary-400: oklch(0.65 0.17 145);
    --aes-primary-500: oklch(0.55 0.18 145); /* couleur signature */
    --aes-primary-600: oklch(0.48 0.18 145);
    --aes-primary-700: oklch(0.4 0.16 145);
    --aes-primary-800: oklch(0.32 0.13 145);
    --aes-primary-900: oklch(0.22 0.09 145);
    --aes-primary-950: oklch(0.14 0.06 145);

    /* AES accent (or/jaune) */
    --aes-accent-500: oklch(0.82 0.17 85); /* lumineux mais non blanchissant */

    /* AES critique (rouge signalement) */
    --aes-danger-500: oklch(0.55 0.22 25);

    /* Neutres */
    --aes-neutral-0: oklch(1 0 0);
    --aes-neutral-50: oklch(0.98 0 0);
    --aes-neutral-100: oklch(0.96 0 0);
    --aes-neutral-200: oklch(0.92 0 0);
    --aes-neutral-300: oklch(0.85 0 0);
    --aes-neutral-400: oklch(0.7 0 0);
    --aes-neutral-500: oklch(0.55 0 0);
    --aes-neutral-600: oklch(0.42 0 0);
    --aes-neutral-700: oklch(0.3 0 0);
    --aes-neutral-800: oklch(0.2 0 0);
    --aes-neutral-900: oklch(0.12 0 0);
    --aes-neutral-950: oklch(0.07 0 0);

    /* Sémantique */
    --color-background: var(--aes-neutral-50);
    --color-foreground: var(--aes-neutral-900);
    --color-muted: var(--aes-neutral-100);
    --color-muted-foreground: var(--aes-neutral-600);
    --color-border: var(--aes-neutral-200);
    --color-ring: var(--aes-primary-500);
    --color-primary: var(--aes-primary-600);
    --color-primary-foreground: var(--aes-neutral-0);
    --color-accent: var(--aes-accent-500);
    --color-destructive: var(--aes-danger-500);
    --color-destructive-foreground: var(--aes-neutral-0);
  }

  .dark {
    --color-background: var(--aes-neutral-950);
    --color-foreground: var(--aes-neutral-50);
    --color-muted: var(--aes-neutral-900);
    --color-muted-foreground: var(--aes-neutral-400);
    --color-border: var(--aes-neutral-800);
    --color-ring: var(--aes-primary-400);
    --color-primary: var(--aes-primary-400);
    --color-primary-foreground: var(--aes-neutral-950);
    --color-accent: var(--aes-accent-500);
    --color-destructive: var(--aes-danger-500);
  }
}
```

### 5.3 Typographie

| Usage             | Police         | Poids | Taille             | Interligne |
| ----------------- | -------------- | ----- | ------------------ | ---------- |
| Titre principal   | Inter var 4.0  | 700   | `text-3xl` (30px)  | `1.2`      |
| Sous-titre        | Inter var 4.0  | 600   | `text-xl` (20px)   | `1.3`      |
| Corps             | Inter var 4.0  | 400   | `text-base` (16px) | `1.6`      |
| Mono (NINA, hash) | JetBrains Mono | 400   | `text-sm` (14px)   | `1.5`      |

`Inter` est choisi pour :

- **Support Unicode exhaustif** (bambara et soninké en écriture latine étendue, diacritiques
  fulfulde),
- **Variable font** (1 seul fichier pour tous les poids, ~150 KB vs 600 KB pour 7 poids statiques),
- **Licence OFL** (SIL Open Font License, utilisable commercialement sans attribution en UI).

`JetBrains Mono` pour les séquences NINA (15 caractères), hashes SHA-256, JWTs : la largeur fixe
évite les sauts visuels lors de la saisie.

### 5.4 Grille et espacement

- **Base 4 px** : toute taille est un multiple de 4 (Tailwind natif).
- **Conteneur principal** : `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8`
- **Breakpoints** : `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`, `2xl:1536px`.
- **Mobile-first** : 95 % du styling est écrit pour mobile, les `md:` / `lg:` enrichissent.

### 5.5 Composants shadcn/ui à copier

Le choix shadcn/ui (vs Material UI, Ant Design, Chakra) repose sur :

- **Pas de dépendance runtime** — on copie le code dans `packages/ui/src/components/`, on peut
  l'adapter librement,
- **Accessible par construction** (Radix Primitives dessous),
- **Thémable via CSS variables** — pas de ThemeProvider JS,
- **Open source MIT**.

Liste des composants à copier en priorité (via `pnpm dlx shadcn@canary add <component>` puis
déplacer dans `packages/ui`) :

| Composant       | Utilisation                                     |
| --------------- | ----------------------------------------------- |
| `button`        | CTA partout                                     |
| `input`         | Formulaires NINA, recherche                     |
| `label`         | Accessibilité labels                            |
| `form`          | Intégration RHF + Zod                           |
| `dialog`        | Confirmation corrections, QR scanner modal      |
| `dropdown-menu` | Menu user, sélecteur langue                     |
| `select`        | Région / cercle / commune                       |
| `toast`         | Retour d'actions (via `sonner` intégré)         |
| `table`         | Tableau corrections admin (TanStack Table)      |
| `badge`         | Statut correction (pending, approved, rejected) |
| `card`          | Fiche citoyen, KPI governance                   |
| `tabs`          | Dashboard IA (métriques / SHAP / historique)    |
| `sheet`         | Panneau latéral admin mobile                    |
| `skeleton`      | États de chargement                             |
| `separator`     | Division visuelle                               |
| `tooltip`       | Explication SHAP feature, info NINA             |
| `popover`       | Calendrier (rendez-vous)                        |
| `calendar`      | `react-day-picker` + thème AES                  |
| `alert`         | Notices d'erreur / info                         |
| `alert-dialog`  | Confirmation destructive (rejet correction)     |
| `progress`      | Upload PDF / génération IA                      |
| `pagination`    | Liste corrections, audits                       |
| `command`       | Palette recherche (Ctrl+K)                      |

### 5.6 Exemple — composant `AesLogo`

Petit composant symbolique partagé entre les 3 apps, affichant un **drapeau stylisé tricolore**
neutre :

```tsx
// packages/ui/src/components/brand/aes-logo.tsx
import { cn } from '@nina-aes/ui/lib/utils';

interface AesLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function AesLogo({ size = 'md', showText = true, className }: AesLogoProps) {
  const dims = { sm: 24, md: 32, lg: 48 }[size];
  return (
    <span className={cn('inline-flex items-center gap-2', className)} aria-label="NINA-AES">
      <svg
        width={dims}
        height={dims}
        viewBox="0 0 48 48"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        {/* Carré vert sahélien (souveraineté) */}
        <rect x="0" y="0" width="48" height="48" rx="8" fill="oklch(0.48 0.18 145)" />
        {/* N stylisé en or (identité numérique) */}
        <path
          d="M12 36 L12 12 L20 12 L28 28 L28 12 L36 12 L36 36 L28 36 L20 20 L20 36 Z"
          fill="oklch(0.82 0.17 85)"
        />
      </svg>
      {showText && (
        <span className="text-base font-bold tracking-tight">
          NINA<span className="text-primary">-AES</span>
        </span>
      )}
    </span>
  );
}
```

### 5.7 Règles d'accessibilité intégrées au design

- **Contraste** : validé par un script `scripts/check-contrast.ts` (exécuté en CI) qui parcourt
  `tokens.css` et calcule le contraste OKLCH de chaque paire fg/bg sémantique.
- **Focus ring visible** :
  `:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }` partout. Jamais de
  `outline: none` sans alternative visuelle.
- **Taille minimale cible tactile** : 44 × 44 px (iOS HIG) pour les boutons citoyens.
- **Mouvement réduit** : `@media (prefers-reduced-motion: reduce) { … }` désactive les animations
  non essentielles.

---

## 6. Structure des 3 apps + packages partagés

### 6.1 Arborescence monorepo (vue focalisée frontend)

```
nina-aes-platform/
├── apps/
│   ├── citizen/                              # Next.js 16 — port 4001
│   │   ├── app/
│   │   │   ├── [locale]/
│   │   │   │   ├── (public)/
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── page.tsx              # Landing publique
│   │   │   │   │   └── login/page.tsx        # Redirige Keycloak
│   │   │   │   ├── (authenticated)/
│   │   │   │   │   ├── layout.tsx            # Navbar citoyen + i18n
│   │   │   │   │   ├── dashboard/page.tsx
│   │   │   │   │   ├── nina/
│   │   │   │   │   │   ├── page.tsx          # Formulaire recherche NINA
│   │   │   │   │   │   └── [nina]/
│   │   │   │   │   │       ├── page.tsx      # Fiche citoyen
│   │   │   │   │   │       ├── correction/page.tsx
│   │   │   │   │   │       └── pdf/page.tsx  # Aperçu + download FDI
│   │   │   │   │   ├── appointments/page.tsx
│   │   │   │   │   └── settings/page.tsx
│   │   │   │   └── layout.tsx                # Root locale
│   │   │   ├── api/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── callback/route.ts     # Keycloak OIDC callback
│   │   │   │   │   ├── refresh/route.ts      # Refresh silencieux
│   │   │   │   │   └── logout/route.ts
│   │   │   │   └── health/route.ts
│   │   │   ├── globals.css
│   │   │   ├── error.tsx
│   │   │   ├── not-found.tsx
│   │   │   └── layout.tsx                    # Root
│   │   ├── components/                        # Composants spécifiques citoyen
│   │   │   ├── nina-search-form.tsx
│   │   │   ├── citizen-card.tsx
│   │   │   ├── correction-form.tsx
│   │   │   ├── qr-viewer.tsx
│   │   │   └── language-switcher.tsx
│   │   ├── hooks/
│   │   │   ├── use-citizen.ts
│   │   │   ├── use-correction.ts
│   │   │   └── use-fdi.ts
│   │   ├── lib/
│   │   │   ├── api.ts                         # Ré-export client typé
│   │   │   ├── auth.ts                        # Helpers session serveur
│   │   │   └── intl.ts
│   │   ├── middleware.ts                      # Auth guard + i18n routing
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── playwright.config.ts
│   │
│   ├── admin/                                 # Next.js 16 — port 4002
│   │   ├── app/
│   │   │   └── [locale]/
│   │   │       ├── (authenticated)/
│   │   │       │   ├── layout.tsx             # Sidebar admin
│   │   │       │   ├── dashboard/page.tsx     # Vue agent
│   │   │       │   ├── corrections/
│   │   │       │   │   ├── page.tsx           # Liste paginée
│   │   │       │   │   └── [id]/page.tsx      # Détail + validation
│   │   │       │   ├── citizens/
│   │   │       │   │   ├── page.tsx           # Recherche
│   │   │       │   │   └── [nina]/page.tsx
│   │   │       │   ├── ai/
│   │   │       │   │   ├── page.tsx           # Métriques IA
│   │   │       │   │   └── analyze/page.tsx   # Lancer analyse ad-hoc
│   │   │       │   ├── appointments/page.tsx
│   │   │       │   └── audit/page.tsx         # Recherche journal
│   │   │       └── layout.tsx
│   │   └── …
│   │
│   └── governance/                            # Next.js 16 — port 4003
│       ├── app/
│       │   └── [locale]/
│       │       ├── (authenticated)/
│       │       │   ├── layout.tsx             # Sidebar exécutive
│       │       │   ├── dashboard/page.tsx     # KPI consolidés
│       │       │   ├── regions/page.tsx
│       │       │   ├── reports/page.tsx
│       │       │   ├── directives/
│       │       │   │   ├── page.tsx
│       │       │   │   └── new/page.tsx
│       │       │   └── anticorruption/page.tsx # Bloc D (placeholder P0)
│       │       └── layout.tsx
│       └── …
│
├── packages/
│   ├── api-client/                            # @nina-aes/api-client
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── http-client.ts             # fetch wrapper typé
│   │   │   │   ├── errors.ts                  # ApiError, ApiValidationError
│   │   │   │   ├── interceptors.ts
│   │   │   │   ├── correlation-id.ts
│   │   │   │   └── retry.ts
│   │   │   ├── identity/
│   │   │   │   ├── identity.client.ts
│   │   │   │   └── identity.schema.ts
│   │   │   ├── auth/
│   │   │   ├── document/
│   │   │   ├── correction/
│   │   │   ├── appointment/
│   │   │   ├── ai/
│   │   │   ├── audit/
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── ui/                                    # @nina-aes/ui
│   │   ├── src/
│   │   │   ├── components/                    # Composants shadcn copiés + custom
│   │   │   │   ├── ui/                        # Primitives shadcn
│   │   │   │   ├── brand/                     # AesLogo, AesHeader, AesFooter
│   │   │   │   ├── data/                      # DataTable, KpiCard
│   │   │   │   ├── feedback/                  # Empty, ErrorState
│   │   │   │   └── forms/                     # NinaInput, DatePickerFr
│   │   │   ├── styles/
│   │   │   │   ├── tokens.css                 # Variables OKLCH
│   │   │   │   └── globals.css                # @import 'tailwindcss';
│   │   │   ├── lib/
│   │   │   │   └── utils.ts                   # cn(), formatDate(), formatNina()
│   │   │   └── index.ts
│   │   ├── tailwind-preset.ts
│   │   └── package.json
│   │
│   ├── i18n/                                  # @nina-aes/i18n
│   │   ├── messages/
│   │   │   ├── fr.json                        # Français
│   │   │   ├── bm.json                        # Bambara
│   │   │   ├── snk.json                       # Soninké
│   │   │   ├── ff.json                        # Fulfulde
│   │   │   ├── tmq.json                       # Tamasheq
│   │   │   ├── hau.json                       # Hausa
│   │   │   ├── mos.json                       # Mooré
│   │   │   └── dje.json                       # Djerma
│   │   ├── src/
│   │   │   ├── config.ts                      # locales, defaultLocale
│   │   │   ├── request.ts                     # next-intl request config
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── shared-types/                          # @nina-aes/shared-types
│   │   └── src/
│   │       ├── citizen.ts
│   │       ├── correction.ts
│   │       ├── document.ts
│   │       ├── appointment.ts
│   │       ├── role.ts
│   │       └── index.ts
│   │
│   └── tailwind-config/                       # @nina-aes/tailwind-config
│       ├── preset.ts
│       └── package.json
```

### 6.2 Configuration Tailwind v4 partagée

```ts
// packages/tailwind-config/preset.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-primary-foreground)',
        },
        accent: 'var(--color-accent)',
        border: 'var(--color-border)',
        ring: 'var(--color-ring)',
        destructive: {
          DEFAULT: 'var(--color-destructive)',
          foreground: 'var(--color-destructive-foreground)',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'monospace'],
      },
      screens: {
        xs: '380px',
      },
    },
  },
} satisfies Partial<Config>;
```

Chaque app importe :

```ts
// apps/citizen/tailwind.config.ts
import preset from '@nina-aes/tailwind-config/preset';
import type { Config } from 'tailwindcss';

export default {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
} satisfies Config;
```

---

## 7. Client HTTP typé `@nina-aes/api-client`

> **État d'implémentation — tranche 1 (PROMPT 5.1), le code fait foi.** Cette section reste utile
> comme intention pédagogique, mais l'implémentation réelle a précisé l'architecture. Voir
> **[ADR-031](./adr/ADR-031-frontend-data-layer-mock-live-bff.md)** et le CHANGELOG (§
> 0quaterdecies).
>
> - Les **hooks React Query** sont exportés par le **sous-chemin `@nina-aes/api-client/react`**
>   (`ApiClientProvider`, `useCitizenByNina`, `useSubmitCorrection`, `useAvailableSlots`,
>   `useSubmitAlert`, …), pas redéfinis par app. `react`/`@tanstack/react-query` = peerDeps
>   optionnelles.
> - **Bascule mock↔live** : `resolveApiMode()` + `createMockApiClient()` (fixtures validées Zod) ;
>   **kill-switch prod** `assertApiModeSafe()` (interdit `mock` et les URLs `localhost` en
>   production).
> - **Sécurité tokens** : les appels authentifiés navigateur passent par le **BFF**
>   `apps/citizen/app/api/v1/[...path]` qui injecte le Bearer **côté serveur** depuis le cookie
>   httpOnly (jamais en JS). Le **signalement anonyme SIGAC** utilise un transport séparé vers le
>   gateway public avec `credentials:'omit'` (aucun cookie).
> - La factory (§ 7.4) expose pour l'instant **4 sous-clients** réels (identity, correction,
>   appointment, sigac) ; les autres seront ajoutés au fil des tranches.

### 7.1 Pourquoi un package séparé et pas Axios directement ?

- **Type safety bout en bout** : chaque endpoint retourne un type Zod-inféré, pas un `any`.
- **Parsing runtime** : `z.parse()` vérifie que l'API renvoie bien ce que le contrat OpenAPI promet.
  Si le backend dérive, le frontend tombe proprement avec un `ApiValidationError` loggé.
- **Réutilisable entre les 3 apps** + serveur (RSC) + tests (msw).
- **Pas de dépendance Axios** : `fetch` natif, 0 KB bundle supplémentaire.
- **Retry + correlation-id** en un seul endroit, pas dupliqué par app.

### 7.2 Cœur du client HTTP

```ts
// packages/api-client/src/core/http-client.ts
import { ApiError, ApiNetworkError, ApiValidationError } from './errors';
import { generateCorrelationId } from './correlation-id';
import { retryWithBackoff } from './retry';
import type { ZodType } from 'zod';

export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null> | string | null;
  onUnauthorized?: () => Promise<string | null>; // retourne un nouveau token ou null
  defaultTimeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
}

export interface RequestOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  headers?: Record<string, string>;
  schema?: ZodType<unknown>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  idempotencyKey?: string;
}

export class HttpClient {
  constructor(private readonly opts: HttpClientOptions) {}

  async request<TResult>(options: RequestOptions): Promise<TResult> {
    const timeout = this.opts.defaultTimeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const correlationId = generateCorrelationId();
    const url = this.buildUrl(options.path, options.query);

    const performRequest = async (): Promise<Response> => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Correlation-Id': correlationId,
        'User-Agent': this.opts.userAgent ?? 'nina-aes-client/1.0',
        ...options.headers,
      };

      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (options.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
      }
      if (!options.skipAuth && this.opts.getAccessToken) {
        const token = await this.opts.getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      return fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal ?? controller.signal,
        cache: 'no-store',
      });
    };

    try {
      let response = await retryWithBackoff(performRequest, {
        maxRetries: this.opts.maxRetries ?? 2,
        retryOn: (res) => res.status >= 500 && res.status < 600,
      });

      // 401 : tentative de refresh puis rejoue une seule fois
      if (response.status === 401 && !options.skipAuth && this.opts.onUnauthorized) {
        const newToken = await this.opts.onUnauthorized();
        if (newToken) {
          response = await performRequest();
        }
      }

      return await this.parseResponse<TResult>(response, options, correlationId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiNetworkError('Request timeout', { correlationId, timeoutMs: timeout });
      }
      if (err instanceof ApiError || err instanceof ApiValidationError) throw err;
      throw new ApiNetworkError((err as Error).message, { correlationId });
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path, this.opts.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.append(k, String(v));
      }
    }
    return url.toString();
  }

  private async parseResponse<TResult>(
    response: Response,
    options: RequestOptions,
    correlationId: string,
  ): Promise<TResult> {
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const raw = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        statusText: response.statusText,
        payload: raw,
        correlationId,
      });
    }

    if (!options.schema) return raw as TResult;

    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiValidationError({
        correlationId,
        issues: parsed.error.issues,
        endpoint: options.path,
      });
    }
    return parsed.data as TResult;
  }
}
```

### 7.3 Exemple — client Identity typé

```ts
// packages/api-client/src/identity/identity.schema.ts
import { z } from 'zod';

export const NinaSchema = z.string().regex(/^\d{14}[A-Z]$/, 'Format NINA invalide');

export const CitizenSchema = z.object({
  id: z.string().uuid(),
  nina: NinaSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: z.string().date(), // Zod 4 format date ISO
  birthPlace: z.string().min(1).max(200),
  sex: z.enum(['M', 'F', 'X']),
  fatherName: z.string().max(200).nullable(),
  motherName: z.string().max(200).nullable(),
  residence: z.object({
    region: z.string(),
    cercle: z.string(),
    commune: z.string(),
  }),
  photoUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
});

export const CitizenSearchResultSchema = z.object({
  items: z.array(CitizenSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type Citizen = z.infer<typeof CitizenSchema>;
export type CitizenSearchResult = z.infer<typeof CitizenSearchResultSchema>;
```

```ts
// packages/api-client/src/identity/identity.client.ts
import type { HttpClient } from '../core/http-client';
import {
  CitizenSchema,
  CitizenSearchResultSchema,
  type Citizen,
  type CitizenSearchResult,
} from './identity.schema';

export class IdentityClient {
  constructor(private readonly http: HttpClient) {}

  async getByNina(nina: string): Promise<Citizen> {
    return this.http.request<Citizen>({
      method: 'GET',
      path: `/api/v1/citizens/${encodeURIComponent(nina)}`,
      schema: CitizenSchema,
    });
  }

  async search(params: {
    q?: string;
    region?: string;
    page?: number;
    pageSize?: number;
  }): Promise<CitizenSearchResult> {
    return this.http.request<CitizenSearchResult>({
      method: 'GET',
      // Route réelle : `@Get()` sur /citizens (le gateway forwarde le chemin
      // INCHANGÉ ; `/citizens/search` heurtait `@Get(':nina')`). Cf. 0quattuorvicies.
      path: '/api/v1/citizens',
      query: params,
      schema: CitizenSearchResultSchema,
    });
  }
}
```

### 7.4 Factory principale

> ⚠️ **Réconciliation honnêteté (audit mai 2026).** Le bloc ci-dessous est l'**intention cible**
> (les 7 microservices câblés). L'implémentation **réelle de la tranche 1** (PROMPT 5.1, cf. bandeau
> du § 7 et [ADR-031](./adr/ADR-031-frontend-data-layer-mock-live-bff.md)) n'expose que **4
> sous-clients** vraiment branchés : `identity`, `correction`, `appointment` et `sigac` (signalement
> anonyme). Les sous-clients `document`, `ai`, `audit` et `governance` sont **conçus mais pas encore
> implémentés (Phase 2)** : ne pas les présenter comme acquis en soutenance. Pour éviter un client «
> fantôme » qui exporterait des méthodes inexistantes, la factory réelle ne construit que ce qui
> existe — les autres sont ajoutés tranche par tranche. Le bloc suivant montre donc la cible **et**
> distingue explicitement le réel du différé.

```ts
// packages/api-client/src/index.ts
import { HttpClient, type HttpClientOptions } from './core/http-client';
// --- Sous-clients RÉELS (tranche 1) -----------------------------------------
import { IdentityClient } from './identity/identity.client';
import { CorrectionClient } from './correction/correction.client';
import { AppointmentClient } from './appointment/appointment.client';
import { SigacClient } from './sigac/sigac.client'; // signalement anonyme (transport séparé)
// --- Sous-clients DIFFÉRÉS (Phase 2 — NE PAS importer tant que non livrés) ---
// import { AuthClient } from './auth/auth.client';
// import { DocumentClient } from './document/document.client';
// import { AiClient } from './ai/ai.client';
// import { AuditClient } from './audit/audit.client';
// import { GovernanceClient } from './governance/governance.client';

/**
 * Surface RÉELLE de l'API client (tranche 1). On ne déclare PAS les sous-clients
 * non implémentés : un champ typé `document: DocumentClient` qui pointe sur du
 * vide serait un « sous-client fantôme » — l'app planterait au runtime sur un
 * appel `api.document.x()` que TypeScript croyait pourtant sûr. On élargira
 * cette interface au fil des tranches (chaque ajout = un sous-client testé).
 */
export interface ApiClient {
  identity: IdentityClient;
  correction: CorrectionClient;
  appointment: AppointmentClient;
  sigac: SigacClient;
  // Phase 2 : auth · document · ai · audit · governance
}

export function createApiClient(opts: HttpClientOptions): ApiClient {
  const http = new HttpClient(opts);
  return {
    identity: new IdentityClient(http),
    correction: new CorrectionClient(http),
    appointment: new AppointmentClient(http),
    sigac: new SigacClient(http),
    // Phase 2 : new DocumentClient(http), new AiClient(http), new AuditClient(http), …
  };
}

export * from './identity/identity.schema';
export * from './correction/correction.schema';
export * from './appointment/appointment.schema';
export * from './sigac/sigac.schema';
// Phase 2 : export * from './document/document.schema'; (+ ai, audit, governance)
export * from './core/errors';
```

> **Note** — les exemples des sections suivantes (§ 11.4 PDF via `api.document.*`, § 12.4 métriques
> via `api.ai.*`) supposent les sous-clients de Phase 2. Tant qu'ils ne sont pas livrés, ces pages
> tournent en **mode mock** (`createMockApiClient()` + fixtures validées Zod), ce qui est cohérent
> avec la bascule mock↔live d'ADR-031. À présenter comme « écran câblé sur mock, backend Phase 2 ».

### 7.5 Utilisation côté serveur (RSC) et côté client

```ts
// apps/citizen/lib/api.ts
import { createApiClient } from '@nina-aes/api-client';
import { cookies } from 'next/headers';

export async function getServerApi() {
  const jar = await cookies();
  const token = jar.get('access_token')?.value ?? null;
  return createApiClient({
    baseUrl: process.env.API_BASE_URL!, // interne, ex: http://traefik:80
    getAccessToken: () => token,
    userAgent: 'nina-citizen-ssr/1.0',
    defaultTimeoutMs: 10_000,
    maxRetries: 1,
  });
}

// Usage dans un Server Component :
// const api = await getServerApi();
// const citizen = await api.identity.getByNina(params.nina);
```

```ts
// apps/citizen/lib/api-client.ts   ("use client")
'use client';
import { createApiClient } from '@nina-aes/api-client';

export const clientApi = createApiClient({
  baseUrl: '/bff', // passe par les route handlers Next.js
  getAccessToken: () => null, // les cookies httpOnly sont forwardés par le BFF
  userAgent: 'nina-citizen-spa/1.0',
  defaultTimeoutMs: 15_000,
  maxRetries: 2,
});
```

Le pattern **BFF (Backend for Frontend)** : les appels client passent par des route handlers Next.js
(`app/api/bff/**`) qui injectent le cookie `access_token` côté serveur. Le token ne transite
**jamais** dans le navigateur — conforme à la norme `cookie-to-header` sécurisée.

---

## 8. Gestion JWT — login, refresh silencieux, logout propre

> 🔒 **Compléments sécurité — voir § 9bis.** Cette section montre le flux nominal. Le **corps réel
> de `verifyIdToken`** (§ 8.2) est fourni au **§ 9bis.1** (allowlist RS256/EdDSA, rejet
> `alg=none`/`HS*`, validation `iss`/`aud`/`nonce`/`exp`). L'app `citizen` est un **client public +
> PKCE** (pas de secret) ; les apps `admin`/`governance` sont **confidentielles** et ajoutent un
> `client_secret` **résolu via Vault** (§ 9bis.3), jamais en `process.env` nu.

### 8.1 Séquence de login (Keycloak Authorization Code + PKCE)

```
1. Citoyen clique "Se connecter" → GET /api/auth/login
2. Route handler génère code_verifier (PKCE), code_challenge, state, nonce,
   stocke { code_verifier, nonce } dans cookie httpOnly + Secure + SameSite=Lax (5 min TTL)
3. Redirect 302 vers Keycloak :
   /realms/nina-aes/protocol/openid-connect/auth
     ?client_id=nina-citizen
     &response_type=code
     &scope=openid profile nina:read nina:correct
     &code_challenge=<…>
     &code_challenge_method=S256
     &state=<…>
     &nonce=<…>
     &redirect_uri=https://citizen.nina-aes.ml/api/auth/callback
4. Utilisateur s'authentifie sur Keycloak (MFA si rôle >= agent)
5. Keycloak redirige vers /api/auth/callback?code=<…>&state=<…>
6. Route handler vérifie state, échange le code contre {access_token, refresh_token, id_token}
   en POST vers Keycloak (+ code_verifier PKCE)
7. Vérifie la signature JWT (JWKS) + nonce + audience
8. Stocke access_token (15 min) et refresh_token (8h) en cookies httpOnly + Secure + SameSite=Lax
9. Redirige vers /fr/dashboard
```

### 8.2 Route handler `/api/auth/callback`

```ts
// apps/citizen/app/api/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { verifyIdToken } from '@/lib/auth/verify-id-token';

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  refresh_expires_in: z.number().int().positive(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=missing_code', req.url));
  }

  const jar = await cookies();
  const stored = jar.get('pkce')?.value;
  if (!stored) return NextResponse.redirect(new URL('/login?error=no_session', req.url));
  const {
    code_verifier,
    nonce,
    state: savedState,
  } = JSON.parse(stored) as {
    code_verifier: string;
    nonce: string;
    state: string;
  };
  if (savedState !== state) {
    return NextResponse.redirect(new URL('/login?error=state_mismatch', req.url));
  }

  const tokenUrl = `${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.KEYCLOAK_CLIENT_ID!,
    code,
    redirect_uri: `${process.env.APP_PUBLIC_URL}/api/auth/callback`,
    code_verifier,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/login?error=token_exchange', req.url));
  }
  const parsed = TokenResponseSchema.parse(await tokenRes.json());

  // Vérifie ID token signature + nonce + aud
  await verifyIdToken(parsed.id_token, { expectedNonce: nonce });

  const res = NextResponse.redirect(new URL('/fr/dashboard', req.url));
  res.cookies.set('access_token', parsed.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: parsed.expires_in,
  });
  res.cookies.set('refresh_token', parsed.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: parsed.refresh_expires_in,
  });
  res.cookies.delete('pkce');
  return res;
}
```

### 8.3 Refresh silencieux

Déclenché :

- **Côté serveur** : dans `middleware.ts`, si `access_token` arrive à expiration < 60 s,
- **Côté client** : sur interception d'un 401 dans le BFF handler → rejoue une fois.

```ts
// apps/citizen/app/api/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const refresh = jar.get('refresh_token')?.value;
  if (!refresh) return NextResponse.json({ ok: false }, { status: 401 });

  const res = await fetch(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      refresh_token: refresh,
    }),
  });
  if (!res.ok) {
    const out = NextResponse.json({ ok: false }, { status: 401 });
    out.cookies.delete('access_token');
    out.cookies.delete('refresh_token');
    return out;
  }
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
  };

  const out = NextResponse.json({ ok: true });
  out.cookies.set('access_token', tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.expires_in,
  });
  out.cookies.set('refresh_token', tokens.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/auth/refresh',
    maxAge: tokens.refresh_expires_in,
  });
  return out;
}
```

### 8.4 Logout propre (front-channel + back-channel)

```ts
// apps/citizen/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const refresh = jar.get('refresh_token')?.value;
  // Back-channel : invalide la session côté Keycloak
  if (refresh) {
    await fetch(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        refresh_token: refresh,
      }),
    }).catch(() => null); // best effort
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete('access_token');
  res.cookies.delete('refresh_token');
  // Front-channel : le client redirigera vers Keycloak /logout pour vider la session SSO
  return res;
}
```

### 8.5 Middleware d'auth et i18n

```ts
// apps/citizen/middleware.ts
import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from '@nina-aes/i18n';

const intl = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

const PUBLIC_PATHS = [
  /^\/([a-z]{2,3})\/$/,
  /^\/([a-z]{2,3})\/login$/,
  /^\/api\/auth\//,
  /^\/api\/health$/,
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));
  const token = req.cookies.get('access_token')?.value;

  if (!isPublic && !token) {
    const url = new URL('/fr/login', req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return intl(req);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|robots.txt|.*\\..*).*)'],
};
```

---

## 9. Intercepteurs — retry, correlation-id, erreurs normalisées

### 9.1 Retry exponentiel

```ts
// packages/api-client/src/core/retry.ts
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  retryOn?: (response: Response) => boolean;
}

export async function retryWithBackoff(
  fn: () => Promise<Response>,
  options: RetryOptions,
): Promise<Response> {
  const base = options.baseDelayMs ?? 250;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      const res = await fn();
      if (attempt < options.maxRetries && options.retryOn?.(res)) {
        await delay(base * 2 ** attempt + Math.random() * 100);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === options.maxRetries) break;
      await delay(base * 2 ** attempt + Math.random() * 100);
    }
  }
  throw lastErr ?? new Error('retry exhausted');
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

### 9.2 Correlation-id

```ts
// packages/api-client/src/core/correlation-id.ts
export function generateCorrelationId(): string {
  // préfixe "c-" + ULID-like horodaté + 6 bytes aléatoires
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  return `c-${ts}-${hex}`;
}
```

Chaque appel inclut `X-Correlation-Id` ; le backend le reprend dans ses logs et ses spans
OpenTelemetry ; en cas d'erreur, le frontend affiche ce correlation-id dans un toast pour que le
support puisse retracer le parcours.

### 9.3 Classes d'erreurs

```ts
// packages/api-client/src/core/errors.ts
export interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly payload: ApiErrorBody | string;
  readonly correlationId: string;
  readonly code?: string;

  constructor(params: {
    status: number;
    statusText: string;
    payload: ApiErrorBody | string;
    correlationId: string;
  }) {
    const asObj =
      typeof params.payload === 'object' && params.payload !== null
        ? (params.payload as ApiErrorBody)
        : null;
    super(asObj?.message ?? params.statusText);
    this.name = 'ApiError';
    this.status = params.status;
    this.statusText = params.statusText;
    this.payload = params.payload;
    this.correlationId = params.correlationId;
    this.code = asObj?.code;
  }

  get isUserError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export class ApiNetworkError extends Error {
  readonly correlationId?: string;
  readonly timeoutMs?: number;
  constructor(message: string, meta: { correlationId?: string; timeoutMs?: number } = {}) {
    super(message);
    this.name = 'ApiNetworkError';
    this.correlationId = meta.correlationId;
    this.timeoutMs = meta.timeoutMs;
  }
}

export class ApiValidationError extends Error {
  readonly endpoint: string;
  readonly issues: Array<{ path: (string | number)[]; message: string; code: string }>;
  readonly correlationId: string;
  constructor(params: {
    endpoint: string;
    issues: ApiValidationError['issues'];
    correlationId: string;
  }) {
    super(
      `Réponse API invalide sur ${params.endpoint} (${params.issues.length} issue${
        params.issues.length > 1 ? 's' : ''
      })`,
    );
    this.name = 'ApiValidationError';
    this.endpoint = params.endpoint;
    this.issues = params.issues;
    this.correlationId = params.correlationId;
  }
}
```

### 9.4 Error boundary global

```tsx
// apps/citizen/app/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@nina-aes/ui/components/ui/button';
import { ApiError, ApiNetworkError, ApiValidationError } from '@nina-aes/api-client';
import { useTranslations } from 'next-intl';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // On log côté client, un Server Action côté serveur enverra à Loki
    if (error instanceof ApiValidationError) {
      console.warn('API schema drift', {
        correlationId: error.correlationId,
        endpoint: error.endpoint,
        issues: error.issues,
      });
    } else {
      console.error(error);
    }
  }, [error]);

  const title =
    error instanceof ApiNetworkError
      ? t('network.title')
      : error instanceof ApiError && error.isUserError
        ? t('user.title')
        : t('server.title');

  const corrId =
    error instanceof ApiError ||
    error instanceof ApiNetworkError ||
    error instanceof ApiValidationError
      ? error.correlationId
      : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted-foreground">{t('genericHelp')}</p>
      {corrId && (
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          ID support : <span className="select-all">{corrId}</span>
        </p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset} variant="default">
          {t('retry')}
        </Button>
      </div>
    </main>
  );
}
```

---

## 9bis. Sécurité frontend — vérification de jeton, rôles, secrets Vault, headers, rate-limiting, CSRF

> 🔒 **Section ajoutée à l'audit sécurité (mai 2026).** Les sections 7–9 décrivaient le « chemin
> heureux ». Cette section comble les **trous de sécurité** repérés : implémentation réelle de
> `verifyIdToken` et `requireRole` (jusqu'ici seulement importés), routage des **secrets clients
> confidentiels** via Vault (jamais `process.env` nu), **durcissement des en-têtes** (HSTS,
> X-Frame-Options, Referrer-Policy), **rate-limiting** sur `/api/auth/*` et le BFF, et **protection
> CSRF double-submit**. Le canon sécurité de la plateforme est porté par
> [ADR-034](./adr/ADR-034-security-hardening-vault-mtls-owasp.md) (mTLS, PKI, rotation JWKS, OWASP,
> scans CI) et [`docs/security/THREAT-MODEL.md`](./security/THREAT-MODEL.md) ; ce qui suit en est la
> déclinaison côté Next.js.

### 9bis.1 `verifyIdToken` — vérification JWKS + aud + nonce + exp + allowlist d'algorithmes

Le § 8.2 appelait `verifyIdToken(parsed.id_token, { expectedNonce: nonce })` sans en montrer le
corps — un point critique : une vérification d'ID token bâclée ouvre la porte à l'**algorithm
confusion** (`alg=none`, ou passage RS256→HS256 où la clé publique sert de secret HMAC). La règle
OWASP/JWT-BCP (RFC 8725) est : **allowlist explicite d'algorithmes asymétriques**, **rejet de `none`
et de toute la famille `HS*`**, et **validation `iss`/`aud`/`exp`/`nonce`**.

```ts
// apps/citizen/lib/auth/verify-id-token.ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getKeycloakClient } from '@/lib/auth/keycloak-config'; // secrets via Vault (cf. 9bis.3)

/**
 * Allowlist STRICTE des algorithmes acceptés (RFC 8725 §3.1).
 * - RS256 : signature des access/id tokens Keycloak par défaut.
 * - EdDSA : si le realm est configuré en Ed25519 (signature seulement — cf. canon sécurité).
 * On N'inclut JAMAIS :
 *   - 'none'  → token non signé, contournement trivial.
 *   - 'HS*'   → HMAC symétrique : avec une JWKS publique, un attaquant signerait
 *               ses propres tokens en utilisant la clé publique comme secret partagé
 *               (algorithm confusion). jose rejette de toute façon un HS* contre une
 *               clé asymétrique, mais on verrouille en amont par défense en profondeur.
 */
const ALLOWED_ALGS = ['RS256', 'EdDSA'] as const;

// createRemoteJWKSet met en cache les clés et gère la rotation/cooldown automatiquement.
// L'URL JWKS provient de la config (issuer Keycloak), pas d'une chaîne en dur.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(jwksUri: string) {
  jwks ??= createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: 30_000, // anti-DoS sur le endpoint JWKS
    cacheMaxAge: 600_000, // 10 min
  });
  return jwks;
}

export interface VerifiedIdToken extends JWTPayload {
  sub: string;
  nonce?: string;
  preferred_username?: string;
  realm_access?: { roles: string[] };
}

export async function verifyIdToken(
  idToken: string,
  opts: { expectedNonce: string },
): Promise<VerifiedIdToken> {
  const kc = await getKeycloakClient(); // { issuer, jwksUri, audience } — secrets résolus via Vault

  const { payload, protectedHeader } = await jwtVerify(idToken, getJwks(kc.jwksUri), {
    issuer: kc.issuer, // claim `iss` doit matcher exactement le realm attendu
    audience: kc.audience, // claim `aud` doit contenir le client_id de CETTE app
    algorithms: [...ALLOWED_ALGS], // ← rejette alg=none / HS* (algorithm confusion)
    clockTolerance: 5, // 5 s de tolérance d'horloge ; `exp`/`nbf` vérifiés par jose
    maxTokenAge: '15m', // borne supérieure d'âge (cohérent avec access_token 15 min)
  });

  // Défense en profondeur : re-vérifier l'algorithme du header (jose l'a déjà fait,
  // mais on échoue bruyamment si une régression de config laissait passer autre chose).
  if (!ALLOWED_ALGS.includes(protectedHeader.alg as (typeof ALLOWED_ALGS)[number])) {
    throw new Error(`Algorithme JWT non autorisé : ${protectedHeader.alg}`);
  }

  // Liaison nonce : empêche le rejeu d'un id_token capturé sur une autre session OIDC.
  if (payload.nonce !== opts.expectedNonce) {
    throw new Error('Nonce OIDC invalide — possible rejeu / CSRF de login');
  }

  return payload as VerifiedIdToken;
}
```

> **Honnêteté soutenance.** `jose` (Auth0/Panva, MIT, audité) est la bibliothèque de référence Node
> pour cette vérification. Si le code réel de la tranche 1 délègue encore la vérif à Keycloak via le
> userinfo endpoint, présenter `verifyIdToken` comme « conçu, à brancher Phase 2 » plutôt que comme
> acquis — mais le **rejet `alg=none`/`HS*`** est non négociable dès qu'on vérifie localement.
>
> ⚙️ **Dette code réel (à brancher, ne pas basculer en « Implémenté »).** Le code actuel
> (`packages/auth/src/session.ts` L50, `packages/auth/src/handlers/callback.ts` L69) appelle
> `jwtVerify(token, jwks, { issuer, audience })` **sans** l'option `algorithms`. L'allowlist
> explicite `['RS256', 'EdDSA']` décrite ici n'est donc **pas encore branchée** au runtime.
> Correctif code réel attendu : passer `algorithms: ['RS256', 'EdDSA']` à `jwtVerify` dans
> `@nina-aes/auth`. NB : `jose` bloque déjà `HS*` contre une clé asymétrique et ne supporte pas
> `alg=none`, mais l'allowlist reste la **défense en profondeur** exigée par RFC 8725. Tant que ce
> n'est pas fait, les lignes `verifyIdToken` / `requireRole` / allowlist d'algorithmes restent
> labellisées **« Conçu/Phase 2 »**.

### 9bis.2 `requireRole` — garde de rôle côté serveur (RSC / layout)

Le § 12.1 appelait `await requireRole([...])` sans en montrer le corps. Cette garde doit s'exécuter
**côté serveur uniquement** (un check côté client est cosmétique : l'utilisateur contrôle son
navigateur). Elle lit le cookie httpOnly, vérifie l'access token avec la **même allowlist
d'algorithmes**, extrait les rôles realm Keycloak, et **redirige** (pas de page blanche) si l'accès
est refusé.

```ts
// apps/admin/lib/auth/require-role.ts
import 'server-only'; // garantit que ce module ne fuite jamais côté client
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { getKeycloakClient } from '@/lib/auth/keycloak-config';

export type AppRole = 'agent' | 'supervisor' | 'auditor' | 'admin';

const ALLOWED_ALGS = ['RS256', 'EdDSA'] as const; // identique à verifyIdToken (RFC 8725)

/**
 * Vérifie que l'utilisateur courant possède AU MOINS UN des rôles requis.
 * - Rejette les tokens non vérifiables / expirés / mal signés.
 * - Applique le principe du moindre privilège (ADR-013) : un agent n'accède pas
 *   aux écrans admin, un auditeur ne valide pas les corrections, etc.
 * @returns la liste des rôles de l'utilisateur (utile pour un affichage conditionnel fin).
 */
export async function requireRole(required: AppRole[]): Promise<AppRole[]> {
  const jar = await cookies();
  const token = jar.get('access_token')?.value;
  if (!token) redirect('/fr/login?error=no_session');

  const kc = await getKeycloakClient();
  let roles: string[] = [];
  try {
    const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(kc.jwksUri)), {
      issuer: kc.issuer,
      audience: kc.audience,
      algorithms: [...ALLOWED_ALGS], // ← rejette alg=none / HS*
      clockTolerance: 5,
    });
    roles = (payload as { realm_access?: { roles?: string[] } }).realm_access?.roles ?? [];
  } catch {
    // Token absent/altéré/expiré → on renvoie au login plutôt que d'exposer l'écran.
    redirect('/fr/login?error=invalid_token');
  }

  const granted = required.filter((r) => roles.includes(r));
  if (granted.length === 0) {
    // Authentifié mais pas autorisé → 403 dédié (ne pas réveler la structure des routes).
    redirect('/fr/forbidden');
  }
  return granted;
}
```

> Le marqueur `import 'server-only'` (Next.js) fait **échouer le build** si ce module est importé
> par erreur dans un Client Component — barrière anti-fuite de la logique d'autorisation.

### 9bis.3 Secrets clients confidentiels — Vault, jamais `process.env` nu

Les apps `admin` et `governance` utilisent des **clients Keycloak confidentiels** (avec
`client_secret`) parce que leurs utilisateurs sont privilégiés (MFA, rôles sensibles). L'app
`citizen` reste un **client public + PKCE** (pas de secret). Aujourd'hui le code lit
`process.env.KEYCLOAK_CLIENT_ID!` (§ 8.2/8.3/8.4) — acceptable pour un identifiant **public**, mais
**un `client_secret` ne doit jamais** être posé en variable d'environnement nue (fuite via `/proc`,
dumps, logs, images Docker, `next build` qui inline). Il transite par **Vault** (AppRole / K8s
ServiceAccount + lease court — cf. canon sécurité), récupéré **côté serveur uniquement**.

```ts
// apps/admin/lib/auth/keycloak-config.ts
import 'server-only';
import { readVaultSecret } from '@nina-aes/vault-client'; // wrapper interne (AppRole + lease)

export interface KeycloakClientConfig {
  issuer: string; // ex: https://idp.nina-aes.ml/realms/nina-aes — NON secret
  jwksUri: string; // dérivé de l'issuer — NON secret
  audience: string; // client_id de l'app (aud attendu) — NON secret
  clientId: string; // identifiant public du client confidentiel
  clientSecret: string; // ⚠️ SECRET — vient EXCLUSIVEMENT de Vault
}

let cached: KeycloakClientConfig | null = null;

export async function getKeycloakClient(): Promise<KeycloakClientConfig> {
  if (cached) return cached;

  // Données NON sensibles : variables d'env classiques (injectées au déploiement).
  const issuer = process.env.KEYCLOAK_ISSUER!;
  const clientId = process.env.KEYCLOAK_CLIENT_ID!; // public
  const audience = clientId;

  // SECRET : lu dans Vault au runtime, jamais build-time, jamais loggé.
  // Chemin KV v2 : secret/data/nina/<app>/keycloak  → champ `client_secret`.
  // Le token Vault provient d'AppRole/K8s SA avec un lease court — pas de
  // VAULT_TOKEN long-lived (cf. canon souveraineté/secrets).
  const { client_secret } = await readVaultSecret('nina/admin/keycloak');

  cached = {
    issuer,
    jwksUri: `${issuer}/protocol/openid-connect/certs`,
    audience,
    clientId,
    clientSecret: client_secret,
  };
  return cached;
}
```

L'échange de code (§ 8.2) et le refresh (§ 8.3) des apps confidentielles ajoutent alors le secret
**côté serveur** au corps `x-www-form-urlencoded` :

```ts
// extrait — apps/admin/app/api/auth/callback/route.ts (différence vs citizen public)
const kc = await getKeycloakClient(); // secret résolu via Vault
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: kc.clientId,
  client_secret: kc.clientSecret, // ← jamais exposé au navigateur ni à process.env nu
  code,
  redirect_uri: `${process.env.APP_PUBLIC_URL}/api/auth/callback`,
  code_verifier, // PKCE conservé même en client confidentiel (défense en profondeur)
});
```

> ⏳ **Phase 2 (correctif code réel).** Le wrapper `@nina-aes/vault-client` existe déjà côté
> services backend ; son intégration aux route handlers Next.js des apps `admin`/`governance` est à
> brancher. Tant que ce n'est pas fait, ces apps doivent rester en **client public + PKCE** plutôt
> que de poser un `client_secret` en clair dans `process.env`.

### 9bis.4 Durcissement des en-têtes HTTP (`next.config.ts` + `proxy.ts`)

Les en-têtes de sécurité se répartissent en **deux catégories** :

- **En-têtes statiques** (HSTS, `X-Frame-Options DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`, …) → posés dans `next.config.ts`
  (`headers()`), identiques pour toutes les réponses.
- **CSP stricte à nonce** → posée **par requête** dans `proxy.ts` (le middleware Next 16), voir
  l'encadré ci-dessous.

> ⚠️ **Piège corrigé (attrapé par les tests e2e).** Une CSP `script-src 'self'` **statique** (posée
> dans `next.config.ts headers()`, **sans nonce**) **casse l'hydratation** de Next.js App Router :
> Next émet des `<script>` **INLINE** (flux RSC `self.__next_f`, bootstrap `self.__next_r`) qu'une
> telle CSP bloque → aucune hydratation, la page reste une coque serveur figée (skeletons, zéro
> appel API). Symptôme observé : `Invariant: Expected a request ID to be defined via self.__next_r`.
> Une CSP statique **ne peut pas** porter de nonce (valeur par requête) ; il faut donc la générer
> dans le middleware. En Next 16, `middleware.ts` est renommé `proxy.ts` — c'est le seul point
> d'interception par requête.

```ts
// apps/citizen/next.config.ts — en-têtes STATIQUES uniquement (la CSP est dans proxy.ts)
import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  // HSTS : force HTTPS 2 ans, sous-domaines inclus, éligible preload list.
  // À n'activer qu'en prod (casserait le dev http://localhost).
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
  { key: 'X-Frame-Options', value: 'DENY' }, // pas de mise en iframe de l'app
  { key: 'X-Content-Type-Options', value: 'nosniff' }, // pas de MIME sniffing
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Réduit la surface : on ne demande aucune API puissante côté citoyen (camera=(self) pour le QR).
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // retire l'en-tête X-Powered-By (fingerprinting)
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
```

```ts
// apps/citizen/proxy.ts — CSP stricte À NONCE, générée par requête.
import { NextRequest, NextResponse } from 'next/server';

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_DEV = !IS_PROD;

/** Nonce cryptographique (16 octets, base64) — Web Crypto (runtime Edge/proxy). */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildCsp(nonce: string): string {
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'", // fait confiance aux scripts chargés par le bootstrap nonce-é
    "'wasm-unsafe-eval'", // libsodium WASM (PC-06)
    ...(IS_DEV ? ["'unsafe-eval'"] : []), // HMR/React Refresh en dev — JAMAIS en prod
  ].join(' ');
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'", // Tailwind injecte des styles ; aucun script inline
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://api.nina-aes.ml wss://api.nina-aes.ml",
    "frame-ancestors 'none'", // anti-clickjacking (double X-Frame-Options)
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(IS_PROD ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

// Propage un override d'en-tête de REQUÊTE vers le moteur de rendu (même canal que
// `NextResponse.next({ request })`) : Next lit la CSP à nonce et l'applique à SES <script>.
function setRequestHeaderOverride(res: NextResponse, name: string, value: string): void {
  const key = name.toLowerCase();
  const cur = res.headers.get('x-middleware-override-headers');
  const names = cur
    ? cur
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
    : [];
  if (!names.includes(key)) names.push(key);
  res.headers.set('x-middleware-override-headers', names.join(','));
  res.headers.set(`x-middleware-request-${key}`, value);
}

export default function proxy(req: NextRequest): NextResponse {
  // … (garde d'auth : redirection /login si non-connecté — pas de nonce sur un redirect) …
  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  const response = intlMiddleware(req) as NextResponse; // next-intl (routing i18n)
  setRequestHeaderOverride(response, 'content-security-policy', csp); // → moteur de rendu
  setRequestHeaderOverride(response, 'x-nonce', nonce);
  response.headers.set('content-security-policy', csp); // → navigateur (application)
  return response;
}
```

> **Remarque caméra.** L'app `citizen` a besoin de `camera=(self)` pour le scanner QR (§ 5.5). Les
> apps `admin`/`governance` mettent `camera=()` (désactivé). La page d'aperçu PDF (§ 11.4) n'est pas
> mise en iframe par un tiers : `frame-ancestors 'none'` la protège du clickjacking.
>
> **`'strict-dynamic'` + nonce** : `'self'` est ignoré pour les scripts au profit du nonce ; le
> bootstrap nonce-é propage sa confiance aux chunks qu'il charge (`/_next/static/*`).
> `'unsafe-eval'` est ajouté **en dev uniquement** (HMR/React Refresh de Turbopack). Contrepartie
> assumée : un nonce par requête rend la coque HTML dynamique (légère érosion du PPR
> `cacheComponents`).

### 9bis.5 Rate-limiting `/api/auth/*` + BFF

Les route handlers d'auth (login, callback, refresh) et le BFF sont des cibles de **brute-force /
credential-stuffing / abus de refresh**. On applique un rate-limit par IP (et par session pour le
refresh) dans `middleware.ts`. En dev/solo, un **token-bucket en mémoire** suffit ; en prod
multi-réplicas, le compteur doit être **partagé via Redis** (sinon chaque réplica compte
séparément).

```ts
// apps/citizen/lib/security/rate-limit.ts
// Implémentation pédagogique en mémoire (mono-process). En prod multi-réplicas :
// remplacer par un store Redis (INCR + EXPIRE) — sinon la limite est contournable.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true; // autorisé
  }
  if (b.count >= limit) return false; // bloqué
  b.count += 1;
  return true;
}
```

```ts
// extrait — apps/citizen/middleware.ts (ajout au middleware du § 8.5)
import { rateLimit } from '@/lib/security/rate-limit';

function clientIp(req: NextRequest): string {
  // ⚠️ Le segment GAUCHE de X-Forwarded-For est fourni par le CLIENT = spoofable.
  // Un attaquant qui envoie `X-Forwarded-For: <aléatoire>` à chaque requête obtient
  // un bucket neuf et contourne la limite de 10/min/IP. On lit donc le hop DE DROITE,
  // injecté par le proxy de confiance (Traefik), ou `x-real-ip` posé par Traefik.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim());
    return hops[hops.length - 1] || 'unknown'; // dernier proxy de confiance
  }
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

// Dans middleware(req), AVANT le routage :
const { pathname } = req.nextUrl;
if (pathname.startsWith('/api/auth/') || pathname.startsWith('/bff/')) {
  const ip = clientIp(req);
  // 10 tentatives d'auth / minute / IP ; le BFF est plus permissif (60/min).
  const isAuth = pathname.startsWith('/api/auth/');
  const ok = rateLimit(`${isAuth ? 'auth' : 'bff'}:${ip}`, isAuth ? 10 : 60, 60_000);
  if (!ok) {
    return new NextResponse(JSON.stringify({ error: 'rate_limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60' },
    });
  }
}
```

> ⏳ **Phase 2.** Le store Redis partagé et l'alignement avec le rate-limiting du gateway Traefik
> (double couche) sont à câbler. Présenter le bucket en mémoire comme « limiteur de premier niveau,
> renforcé Phase 2 par Redis + Traefik ».
>
> ⏳ **Phase 2 (anti-spoof XFF).** Lire le « dernier hop » suppose **exactement un** proxy de
> confiance devant l'app. Si la topologie ajoute des proxys (CDN, LB amont), valider le **nombre de
> proxys de confiance** (compteur N → prendre l'avant-dernier(s) hop(s)) pour éviter qu'un attaquant
> ne réinjecte un hop falsifié à droite. À défaut, s'appuyer sur l'IP source TCP exposée par Traefik
> (`x-real-ip`) plutôt que sur un X-Forwarded-For libre.

### 9bis.6 Protection CSRF — double-submit cookie sur le BFF et les Server Actions

Les cookies de session sont `httpOnly + Secure + SameSite=Lax`. `SameSite=Lax` neutralise déjà la
majorité des CSRF (les requêtes cross-site `POST` n'emportent pas le cookie), mais **ce n'est pas
suffisant** pour les mutations sensibles (navigateurs anciens, certaines navigations top-level). On
ajoute le pattern **double-submit cookie** : un token CSRF non-httpOnly est posé en cookie ET
renvoyé par le client dans un en-tête `X-CSRF-Token` ; le serveur exige l'égalité.

```ts
// apps/citizen/lib/security/csrf.ts
import 'server-only';
import { cookies } from 'next/headers';

const CSRF_COOKIE = 'csrf_token';

/** Pose un token CSRF aléatoire (lisible en JS) à associer à la session. */
export async function issueCsrfToken(): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const jar = await cookies();
  jar.set(CSRF_COOKIE, token, {
    httpOnly: false, // DOIT être lisible par le JS client pour le renvoyer en header
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

/**
 * Vérifie le double-submit : le header X-CSRF-Token doit égaler le cookie csrf_token.
 * Comparaison à temps constant pour éviter les attaques par timing.
 */
export async function assertCsrf(headerToken: string | null): Promise<void> {
  const jar = await cookies();
  const cookieToken = jar.get(CSRF_COOKIE)?.value ?? '';
  if (!headerToken || !cookieToken || !timingSafeEqual(headerToken, cookieToken)) {
    throw new Error('CSRF token invalide');
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

```ts
// extrait — handler BFF mutant : apps/citizen/app/api/v1/[...path]/route.ts
import { assertCsrf } from '@/lib/security/csrf';

export async function POST(req: NextRequest) {
  // Toute mutation passant par le BFF exige un token CSRF valide.
  await assertCsrf(req.headers.get('x-csrf-token'));
  // … forward vers le gateway avec le Bearer injecté depuis le cookie httpOnly …
}
```

> Le **signalement anonyme SIGAC** (transport séparé, `credentials:'omit'`, aucun cookie) n'est par
> construction **pas** vulnérable au CSRF : sans cookie de session, il n'y a rien à détourner. On ne
> lui applique donc pas le double-submit (mais bien le rate-limiting).

### 9bis.7 Modèle de menaces STRIDE + mapping OWASP Top 10 (frontend)

Threat model focalisé sur la **surface frontend** (les 3 apps + BFF + route handlers). Le modèle
plateforme complet est dans [`docs/security/THREAT-MODEL.md`](./security/THREAT-MODEL.md) ;
ci-dessous la tranche Next.js.

| STRIDE                     | Menace concrète (frontend NINA-AES)                   | OWASP Top 10 2021     | Contre-mesure (section)                                               | État          |
| -------------------------- | ----------------------------------------------------- | --------------------- | --------------------------------------------------------------------- | ------------- |
| **S**poofing               | Vol de session / rejeu d'`id_token` capté             | A07 (Auth Failures)   | nonce OIDC + `verifyIdToken` (9bis.1), cookies `httpOnly+Secure`      | Conçu/partiel |
| **S**poofing               | Algorithm confusion (`alg=none`, RS256→HS256)         | A02 (Crypto Failures) | Allowlist RS256/EdDSA, rejet `none`/`HS*` (9bis.1)                    | Conçu         |
| **T**ampering              | CSRF sur mutation (correction, directive)             | A01 (Broken Access)   | Double-submit CSRF (9bis.6) + `SameSite=Lax`                          | Conçu         |
| **T**ampering              | Réponse backend altérée / drift de contrat            | A08 (Integrity)       | Parsing Zod `safeParse` (§ 7.2) → `ApiValidationError`                | Implémenté    |
| **R**epudiation            | Action sans trace (qui a validé cette correction ?)   | A09 (Logging)         | `X-Correlation-Id` (§ 9.2) propagé au backend → audit hash-chain      | Implémenté    |
| **I**nformation disclosure | `access_token` exposé au JS navigateur                | A02 / A05             | Cookies `httpOnly` + BFF injecte le Bearer côté serveur (§ 7.5)       | Implémenté    |
| **I**nformation disclosure | Fuite de l'URL pré-signée PDF / referrer              | A01                   | `referrerPolicy="no-referrer"` + sandbox PDF (§ 11.4)                 | Implémenté    |
| **I**nformation disclosure | `client_secret` admin/governance en clair             | A05 (Misconfig)       | Secret via Vault, jamais `process.env` nu (9bis.3)                    | Conçu/Phase 2 |
| **D**enial of Service      | Brute-force login / abus refresh / flood BFF          | A07 / A04             | Rate-limiting `/api/auth/*` + BFF (9bis.5), cooldown JWKS             | Conçu/partiel |
| **D**enial of Service      | XSS via injection de script                           | A03 (Injection)       | CSP `script-src 'self'` sans `unsafe-inline` (§ 4.2, 9bis.4)          | Implémenté    |
| **E**levation of privilege | Citoyen accède aux écrans admin                       | A01 (Broken Access)   | `requireRole` côté serveur (9bis.2) + 3 apps/clients Keycloak séparés | Conçu         |
| **E**levation of privilege | Clickjacking (UI redress sur action sensible)         | A05 (Misconfig)       | `X-Frame-Options: DENY` + `frame-ancestors 'none'` (9bis.4)           | Implémenté    |
| **T**ampering              | Composant frontend importé avec faille (supply chain) | A06 (Vuln. Comp.)     | Scans CI (`pnpm audit`, Trivy) + lockfile gelé (ADR-034)              | Implémenté    |

**Lecture honnêteté soutenance.** Les lignes « Implémenté » sont vérifiables dans le code de la
tranche 1 (Zod parsing, cookies httpOnly/BFF, CSP, correlation-id). Les lignes « Conçu » / « Conçu,
Phase 2 » (verifyIdToken local, requireRole, Vault client secret, rate-limit Redis) sont
**spécifiées dans ce document mais pas encore toutes branchées** — à présenter comme architecture
cible, jamais comme acquis.

---

## 10. State management — TanStack Query + Zustand

### 10.1 QueryClient partagé

```tsx
// packages/ui/src/providers/query-provider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@nina-aes/api-client';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30 s
            gcTime: 5 * 60_000, // 5 min
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.isUserError) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

### 10.2 Hook typé — `useCitizen`

```ts
// apps/citizen/hooks/use-citizen.ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api-client';
import type { Citizen } from '@nina-aes/api-client';

export function useCitizen(nina: string | null) {
  return useQuery<Citizen>({
    queryKey: ['citizen', nina],
    queryFn: () => clientApi.identity.getByNina(nina!),
    enabled: !!nina,
    staleTime: 60_000,
  });
}
```

### 10.3 Mutation — `useSubmitCorrection`

```ts
// apps/citizen/hooks/use-correction.ts
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api-client';
import type { CorrectionRequestDto } from '@nina-aes/api-client';
import { toast } from 'sonner';

export function useSubmitCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CorrectionRequestDto) => clientApi.correction.submit(dto),
    onSuccess: (created) => {
      toast.success('Demande envoyée');
      qc.invalidateQueries({ queryKey: ['citizen', created.nina] });
      qc.invalidateQueries({ queryKey: ['corrections', 'mine'] });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}
```

### 10.4 Zustand — store UI léger

```ts
// apps/citizen/lib/store/ui-store.ts
'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  locale: 'fr' | 'bm' | 'snk' | 'ff' | 'tmq' | 'hau' | 'mos' | 'dje';
  highContrast: boolean;
  reducedMotion: boolean;
  setLocale: (l: UiState['locale']) => void;
  toggleHighContrast: () => void;
  setReducedMotion: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      locale: 'fr',
      highContrast: false,
      reducedMotion: false,
      setLocale: (locale) => set({ locale }),
      toggleHighContrast: () => set((s) => ({ highContrast: !s.highContrast })),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    { name: 'nina-ui-state' },
  ),
);
```

### 10.5 Prefetch SSR avec `HydrationBoundary`

```tsx
// apps/citizen/app/[locale]/(authenticated)/nina/[nina]/page.tsx
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getServerApi } from '@/lib/api';
import { CitizenView } from '@/components/citizen-view';

export default async function CitizenPage({ params }: { params: Promise<{ nina: string }> }) {
  const { nina } = await params;
  const api = await getServerApi();
  const qc = new QueryClient();
  await qc.prefetchQuery({
    queryKey: ['citizen', nina],
    queryFn: () => api.identity.getByNina(nina),
  });
  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <CitizenView nina={nina} />
    </HydrationBoundary>
  );
}
```

---

## 11. App `citizen` — pages critiques

### 11.1 Page recherche NINA

```tsx
// apps/citizen/app/[locale]/(authenticated)/nina/page.tsx
import { NinaSearchForm } from '@/components/nina-search-form';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('citizen.search');
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-3xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('help')}</p>
      <div className="mt-6">
        <NinaSearchForm />
      </div>
    </main>
  );
}
```

```tsx
// apps/citizen/components/nina-search-form.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@nina-aes/ui/components/ui/button';
import { Input } from '@nina-aes/ui/components/ui/input';
import { Label } from '@nina-aes/ui/components/ui/label';
import { useTranslations } from 'next-intl';

const Schema = z.object({
  nina: z
    .string()
    .trim()
    .regex(/^\d{14}[A-Z]$/, 'Format NINA invalide (14 chiffres + 1 lettre)'),
});
type Values = z.infer<typeof Schema>;

export function NinaSearchForm() {
  const router = useRouter();
  const t = useTranslations('citizen.search');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(Schema) });

  const onSubmit = handleSubmit((values) => {
    router.push(`./nina/${values.nina}`);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="nina">{t('ninaLabel')}</Label>
        <Input
          id="nina"
          autoComplete="off"
          inputMode="text"
          spellCheck={false}
          className="font-mono tracking-wider"
          aria-invalid={!!errors.nina}
          aria-describedby={errors.nina ? 'nina-error' : undefined}
          {...register('nina')}
        />
        {errors.nina && (
          <p id="nina-error" role="alert" className="mt-1 text-sm text-destructive">
            {errors.nina.message}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t('submit')}
      </Button>
    </form>
  );
}
```

### 11.2 Page fiche citoyen + CTA PDF

```tsx
// apps/citizen/components/citizen-view.tsx
'use client';
import { useCitizen } from '@/hooks/use-citizen';
import { Card } from '@nina-aes/ui/components/ui/card';
import { Button } from '@nina-aes/ui/components/ui/button';
import { Badge } from '@nina-aes/ui/components/ui/badge';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';

export function CitizenView({ nina }: { nina: string }) {
  const { data: citizen, isLoading, error } = useCitizen(nina);
  const t = useTranslations('citizen.view');
  const f = useFormatter();

  if (isLoading) return <FicheSkeleton />;
  if (error || !citizen) return <p role="alert">{t('notFound')}</p>;

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {citizen.firstName} {citizen.lastName}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{citizen.nina}</p>
        </div>
        <Badge variant={citizen.photoUrl ? 'default' : 'secondary'}>
          {citizen.photoUrl ? t('photoOk') : t('noPhoto')}
        </Badge>
      </header>

      <Card className="mt-6 p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('birthDate')}>
            {f.dateTime(new Date(citizen.birthDate), {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Field>
          <Field label={t('sex')}>{citizen.sex}</Field>
          <Field label={t('birthPlace')}>{citizen.birthPlace}</Field>
          <Field label={t('residence')}>
            {citizen.residence.commune} / {citizen.residence.cercle} / {citizen.residence.region}
          </Field>
          <Field label={t('father')}>{citizen.fatherName ?? '—'}</Field>
          <Field label={t('mother')}>{citizen.motherName ?? '—'}</Field>
        </dl>
      </Card>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href={`./${nina}/pdf`}>{t('downloadPdf')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`./${nina}/correction`}>{t('requestCorrection')}</Link>
        </Button>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

function FicheSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 py-10">
      <div className="h-8 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-4 w-1/3 rounded bg-muted" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
```

### 11.3 Formulaire de correction (server action + optimistic UI)

```tsx
// apps/citizen/app/[locale]/(authenticated)/nina/[nina]/correction/page.tsx
import { CorrectionForm } from '@/components/correction-form';
import { getServerApi } from '@/lib/api';
import { getTranslations } from 'next-intl/server';

export default async function Page({ params }: { params: Promise<{ nina: string }> }) {
  const { nina } = await params;
  const api = await getServerApi();
  const citizen = await api.identity.getByNina(nina);
  const t = await getTranslations('citizen.correction');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('help')}</p>
      <CorrectionForm citizen={citizen} className="mt-6" />
    </main>
  );
}
```

```tsx
// apps/citizen/components/correction-form.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Citizen } from '@nina-aes/api-client';
import { Input } from '@nina-aes/ui/components/ui/input';
import { Button } from '@nina-aes/ui/components/ui/button';
import { Label } from '@nina-aes/ui/components/ui/label';
import { useSubmitCorrection } from '@/hooks/use-correction';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

const Schema = z
  .object({
    field: z.enum(['firstName', 'lastName', 'birthDate', 'birthPlace', 'fatherName', 'motherName']),
    proposedValue: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(10).max(500),
    evidenceUrl: z.string().url().optional(),
  })
  .strict();

type Values = z.infer<typeof Schema>;

export function CorrectionForm({ citizen, className }: { citizen: Citizen; className?: string }) {
  const router = useRouter();
  const mutation = useSubmitCorrection();
  const t = useTranslations('citizen.correction');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(Schema) });

  const field = watch('field');
  const currentValue = field ? String((citizen as Record<string, unknown>)[field] ?? '—') : '—';

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(
      {
        nina: citizen.nina,
        field: values.field,
        currentValue,
        proposedValue: values.proposedValue,
        reason: values.reason,
        evidenceUrl: values.evidenceUrl,
      },
      { onSuccess: (res) => router.push(`./../../corrections/${res.id}`) },
    ),
  );

  return (
    <form onSubmit={onSubmit} className={className} noValidate>
      <div className="grid gap-6">
        <div>
          <Label htmlFor="field">{t('fieldLabel')}</Label>
          <select
            id="field"
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            {...register('field')}
          >
            <option value="">—</option>
            <option value="firstName">{t('fields.firstName')}</option>
            <option value="lastName">{t('fields.lastName')}</option>
            <option value="birthDate">{t('fields.birthDate')}</option>
            <option value="birthPlace">{t('fields.birthPlace')}</option>
            <option value="fatherName">{t('fields.fatherName')}</option>
            <option value="motherName">{t('fields.motherName')}</option>
          </select>
          {errors.field && <Error>{errors.field.message}</Error>}
        </div>

        <div>
          <Label>{t('currentValue')}</Label>
          <p className="mt-1 rounded bg-muted px-3 py-2 font-mono text-sm">{currentValue}</p>
        </div>

        <div>
          <Label htmlFor="proposedValue">{t('proposedValue')}</Label>
          <Input id="proposedValue" {...register('proposedValue')} />
          {errors.proposedValue && <Error>{errors.proposedValue.message}</Error>}
        </div>

        <div>
          <Label htmlFor="reason">{t('reason')}</Label>
          <textarea
            id="reason"
            rows={4}
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
            {...register('reason')}
          />
          {errors.reason && <Error>{errors.reason.message}</Error>}
        </div>

        <Button type="submit" disabled={isSubmitting || mutation.isPending}>
          {mutation.isPending ? t('sending') : t('submit')}
        </Button>
      </div>
    </form>
  );
}

function Error({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 text-sm text-destructive">
      {children}
    </p>
  );
}
```

### 11.4 Téléchargement PDF + aperçu

```tsx
// apps/citizen/app/[locale]/(authenticated)/nina/[nina]/pdf/page.tsx
import { getServerApi } from '@/lib/api';
import { Button } from '@nina-aes/ui/components/ui/button';
import { getTranslations } from 'next-intl/server';

export default async function Page({ params }: { params: Promise<{ nina: string }> }) {
  const { nina } = await params;
  const api = await getServerApi();
  const { url, expiresAt, sha256 } = await api.document.getFdiDownloadUrl(nina);
  const t = await getTranslations('citizen.pdf');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('help')}</p>
      <div className="mt-6 overflow-hidden rounded-lg border">
        {/*
         * SÉCURITÉ — sandbox de l'iframe PDF (durci, audit mai 2026).
         *
         * RÈGLE ABSOLUE : ne JAMAIS combiner `allow-scripts` ET `allow-same-origin`.
         * Réunis, ces deux flags permettent au document embarqué de réécrire son
         * propre attribut `sandbox` (il s'exécute dans l'origine du parent), ce qui
         * annule complètement le bac à sable — c'est documenté par le HTML living
         * standard et signalé par OWASP comme un anti-pattern clickjacking/XSS.
         *
         * Un aperçu de FDI (PDF statique signé, servi via URL pré-signée) n'a besoin
         * d'AUCUN script. On retire donc `allow-scripts`. Le viewer PDF natif du
         * navigateur fonctionne sans JS embarqué ; `allow-same-origin` reste utile
         * seulement si l'URL pointe vers notre propre origine (ex. proxy BFF) pour
         * que le viewer accède au flux — on le conserve SEUL, jamais avec scripts.
         *
         * Si le PDF est servi depuis une origine tierce (S3/MinIO pré-signé), on peut
         * même retirer `allow-same-origin` (sandbox vide = isolation maximale).
         */}
        <iframe
          title="Fiche descriptive individuelle"
          src={url}
          className="h-[900px] w-full"
          // sandbox SANS allow-scripts (cf. note ci-dessus) ; referrerPolicy
          // empêche la fuite de l'URL pré-signée vers une éventuelle origine tierce.
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <a href={url} download={`FDI-${nina}.pdf`}>
            {t('download')}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          {t('expiresAt', { date: new Date(expiresAt).toLocaleString() })}
          <br />
          SHA-256 : <span className="font-mono">{sha256.slice(0, 16)}…</span>
        </p>
      </div>
    </main>
  );
}
```

---

## 12. App `admin` — validation des corrections IA + recherche

### 12.1 Layout avec sidebar et rôles requis

```tsx
// apps/admin/app/[locale]/(authenticated)/layout.tsx
import { ReactNode } from 'react';
import { AdminSidebar } from '@/components/admin-sidebar';
import { requireRole } from '@/lib/auth/require-role';
import { QueryProvider } from '@nina-aes/ui/providers/query-provider';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(['agent', 'supervisor', 'auditor', 'admin']);
  return (
    <QueryProvider>
      <div className="grid min-h-screen grid-cols-[240px_1fr]">
        <AdminSidebar />
        <main className="bg-background p-6">{children}</main>
      </div>
    </QueryProvider>
  );
}
```

### 12.2 Liste des corrections IA (TanStack Table)

```tsx
// apps/admin/app/[locale]/(authenticated)/corrections/page.tsx
import { CorrectionsTable } from '@/components/corrections/corrections-table';
import { getServerApi } from '@/lib/api';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getTranslations } from 'next-intl/server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status = 'pending_ai', page = '1' } = await searchParams;
  const api = await getServerApi();
  const qc = new QueryClient();
  const query = { status, page: Number(page), pageSize: 25 };
  await qc.prefetchQuery({
    queryKey: ['corrections', query],
    queryFn: () => api.correction.list(query),
  });
  const t = await getTranslations('admin.corrections');
  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </header>
      <HydrationBoundary state={dehydrate(qc)}>
        <CorrectionsTable initialQuery={query} />
      </HydrationBoundary>
    </>
  );
}
```

```tsx
// apps/admin/components/corrections/corrections-table.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { clientApi } from '@/lib/api-client';
import type { CorrectionRequest } from '@nina-aes/api-client';
import { Badge } from '@nina-aes/ui/components/ui/badge';
import { Button } from '@nina-aes/ui/components/ui/button';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';

const columnHelper = createColumnHelper<CorrectionRequest>();

export function CorrectionsTable({
  initialQuery,
}: {
  initialQuery: { status: string; page: number; pageSize: number };
}) {
  const t = useTranslations('admin.corrections');
  const f = useFormatter();
  const { data } = useQuery({
    queryKey: ['corrections', initialQuery],
    queryFn: () => clientApi.correction.list(initialQuery),
  });

  const columns = [
    columnHelper.accessor('nina', {
      header: 'NINA',
      cell: (c) => <span className="font-mono text-sm">{c.getValue()}</span>,
    }),
    columnHelper.accessor('field', { header: t('field') }),
    columnHelper.accessor('aiScore', {
      header: t('score'),
      cell: (c) => {
        const score = c.getValue();
        const variant =
          score == null
            ? 'secondary'
            : score >= 80
              ? 'default'
              : score >= 40
                ? 'secondary'
                : 'destructive';
        return (
          <Badge variant={variant}>{score == null ? '—' : `${Math.round(score)} / 100`}</Badge>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: t('status'),
      cell: (c) => <Badge>{c.getValue()}</Badge>,
    }),
    columnHelper.accessor('createdAt', {
      header: t('createdAt'),
      cell: (c) => f.relativeTime(new Date(c.getValue())),
    }),
    columnHelper.display({
      id: 'actions',
      cell: (c) => (
        <Button asChild variant="ghost" size="sm">
          <Link href={`./corrections/${c.row.original.id}`}>{t('open')}</Link>
        </Button>
      ),
    }),
  ];

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mt-6 overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="px-4 py-2 font-medium">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="border-t">
              {r.getVisibleCells().map((c) => (
                <td key={c.id} className="px-4 py-2">
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 12.3 Détail d'une correction — valider ou rejeter avec SHAP

```tsx
// apps/admin/app/[locale]/(authenticated)/corrections/[id]/page.tsx
import { getServerApi } from '@/lib/api';
import { CorrectionDecisionPanel } from '@/components/corrections/correction-decision-panel';
import { getTranslations } from 'next-intl/server';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getServerApi();
  const [correction, aiExplanation] = await Promise.all([
    api.correction.getById(id),
    api.ai.getExplanationFor(id).catch(() => null),
  ]);
  const t = await getTranslations('admin.corrections');
  return (
    <>
      <h1 className="text-2xl font-bold">
        {t('detailTitle')} <span className="font-mono text-base">{correction.nina}</span>
      </h1>
      <CorrectionDecisionPanel correction={correction} aiExplanation={aiExplanation} />
    </>
  );
}
```

```tsx
// apps/admin/components/corrections/correction-decision-panel.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '@/lib/api-client';
import type { CorrectionRequest, AiExplanation } from '@nina-aes/api-client';
import { Button } from '@nina-aes/ui/components/ui/button';
import { Card } from '@nina-aes/ui/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@nina-aes/ui/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@nina-aes/ui/components/ui/tabs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function CorrectionDecisionPanel({
  correction,
  aiExplanation,
}: {
  correction: CorrectionRequest;
  aiExplanation: AiExplanation | null;
}) {
  const t = useTranslations('admin.corrections');
  const router = useRouter();
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');

  const approve = useMutation({
    mutationFn: () => clientApi.correction.approve(correction.id),
    onSuccess: () => {
      toast.success(t('approved'));
      qc.invalidateQueries({ queryKey: ['corrections'] });
      router.refresh();
    },
  });

  const reject = useMutation({
    mutationFn: () => clientApi.correction.reject(correction.id, { reason: rejectReason }),
    onSuccess: () => {
      toast.success(t('rejected'));
      qc.invalidateQueries({ queryKey: ['corrections'] });
      router.push('../');
    },
  });

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-lg font-semibold">{t('valuesTitle')}</h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('field')}</dt>
          <dd className="font-mono">{correction.field}</dd>
          <dt className="text-muted-foreground">{t('currentValue')}</dt>
          <dd>{correction.currentValue}</dd>
          <dt className="text-muted-foreground">{t('proposedValue')}</dt>
          <dd className="font-semibold">{correction.proposedValue}</dd>
          <dt className="text-muted-foreground">{t('reason')}</dt>
          <dd>{correction.reason}</dd>
        </dl>
      </Card>

      <Card className="p-6">
        <Tabs defaultValue="ai">
          <TabsList>
            <TabsTrigger value="ai">{t('tabs.ai')}</TabsTrigger>
            <TabsTrigger value="audit">{t('tabs.audit')}</TabsTrigger>
          </TabsList>
          <TabsContent value="ai" className="mt-4">
            {aiExplanation ? (
              <AiExplanationBlock explanation={aiExplanation} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('noAi')}</p>
            )}
          </TabsContent>
          <TabsContent value="audit">{/* Timeline audit_logs pour cette correction */}</TabsContent>
        </Tabs>
      </Card>

      <div className="col-span-full flex flex-wrap gap-3">
        <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
          {t('approve')}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">{t('reject')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('rejectConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('rejectConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <textarea
              className="mt-4 w-full rounded border px-3 py-2 text-sm"
              rows={3}
              placeholder={t('rejectReasonPlaceholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => reject.mutate()}
                disabled={rejectReason.trim().length < 10}
              >
                {t('confirmReject')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function AiExplanationBlock({ explanation }: { explanation: AiExplanation }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Score IA</p>
        <p className="text-3xl font-bold">{Math.round(explanation.score)} / 100</p>
      </div>
      <div>
        <p className="text-sm font-medium">Top 5 caractéristiques contributives (SHAP)</p>
        <ul className="mt-2 space-y-1">
          {explanation.topFeatures.slice(0, 5).map((f) => (
            <li key={f.name} className="flex items-center justify-between text-sm">
              <span className="font-mono">{f.name}</span>
              <span className={f.impact >= 0 ? 'text-destructive' : 'text-primary'}>
                {f.impact >= 0 ? '+' : ''}
                {f.impact.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

### 12.4 Dashboard IA — métriques temps réel

```tsx
// apps/admin/app/[locale]/(authenticated)/ai/page.tsx
import { AiMetricsBoard } from '@/components/ai/ai-metrics-board';
import { getServerApi } from '@/lib/api';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const api = await getServerApi();
  const metrics = await api.ai.getMetrics24h();
  const t = await getTranslations('admin.ai');
  return (
    <>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <AiMetricsBoard initial={metrics} />
    </>
  );
}
```

```tsx
// apps/admin/components/ai/ai-metrics-board.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api-client';
import type { AiMetrics24h } from '@nina-aes/api-client';
import { Card } from '@nina-aes/ui/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';

export function AiMetricsBoard({ initial }: { initial: AiMetrics24h }) {
  const t = useTranslations('admin.ai');
  const { data } = useQuery({
    queryKey: ['ai-metrics-24h'],
    queryFn: () => clientApi.ai.getMetrics24h(),
    initialData: initial,
    refetchInterval: 30_000,
  });

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
      <Kpi label={t('analyzed24h')} value={data.totalAnalyzed} />
      <Kpi label={t('anomalies24h')} value={data.totalAnomalies} accent />
      <Kpi label={t('avgLatencyMs')} value={`${data.avgLatencyMs} ms`} />
      <Kpi label={t('avgScore')} value={data.avgScore.toFixed(1)} />
      <Card className="col-span-full p-4">
        <p className="font-medium">{t('hourlyDistribution')}</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byHour}>
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="oklch(0.48 0.18 145)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-destructive' : ''}`}>{value}</p>
    </Card>
  );
}
```

---

## 13. App `governance` — dashboards exécutifs

### 13.1 Dashboard consolidé (KPI + cartographie)

```tsx
// apps/governance/app/[locale]/(authenticated)/dashboard/page.tsx
import { getServerApi } from '@/lib/api';
import { ExecutiveKpiGrid } from '@/components/executive-kpi-grid';
import { RegionHeatmap } from '@/components/region-heatmap';
import { WeeklyTrend } from '@/components/weekly-trend';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const api = await getServerApi();
  const [kpis, byRegion, weekly] = await Promise.all([
    api.governance.getGlobalKpis(),
    api.governance.getByRegion(),
    api.governance.getWeeklyTrend(),
  ]);
  const t = await getTranslations('governance.dashboard');
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ExecutiveKpiGrid kpis={kpis} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RegionHeatmap data={byRegion} />
        <WeeklyTrend data={weekly} />
      </div>
    </div>
  );
}
```

### 13.2 Publication d'une directive signée

Une directive est un acte officiel signé en **Ed25519 (JWS)** côté backend governance. La clé privée
Ed25519 est **stockée** dans Vault (KV v2), mais la **signature est calculée in-process** via
`@noble/ed25519` — **Vault Transit ne supporte pas Ed25519** (cf. ADR-026, ADR-034 ; Ed25519 =
signature seulement, jamais chiffrement). Le frontend ne manipule jamais la clé : il récupère la
directive, la prévisualise en PDF et l'envoie au backend pour signature. _(cf. doc 09 §12 —
scellement Ed25519 in-process, et ADR-026.)_

```tsx
// apps/governance/components/directives/new-directive-form.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { clientApi } from '@/lib/api-client';
import { toast } from 'sonner';
import { Button } from '@nina-aes/ui/components/ui/button';
import { Input } from '@nina-aes/ui/components/ui/input';
import { Label } from '@nina-aes/ui/components/ui/label';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

const Schema = z.object({
  title: z.string().trim().min(5).max(200),
  reference: z
    .string()
    .trim()
    .regex(/^\d{4}\/[A-Z]{2,5}\/\d{1,4}$/, 'Référence invalide'),
  body: z.string().trim().min(50),
  scope: z.enum(['national', 'regional', 'local']),
  regionCode: z.string().optional(),
});
type Values = z.infer<typeof Schema>;

export function NewDirectiveForm() {
  const t = useTranslations('governance.directives');
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(Schema) });
  const scope = watch('scope');

  const create = useMutation({
    mutationFn: (v: Values) => clientApi.governance.createDirective(v),
    onSuccess: (d) => {
      toast.success(t('created'));
      router.push(`./${d.id}/sign`);
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-6" noValidate>
      <FormField label={t('title')} error={errors.title?.message}>
        <Input {...register('title')} />
      </FormField>
      <FormField label={t('reference')} error={errors.reference?.message}>
        <Input {...register('reference')} />
      </FormField>
      <FormField label={t('scope')} error={errors.scope?.message}>
        <select {...register('scope')} className="block w-full rounded border px-3 py-2">
          <option value="">—</option>
          <option value="national">{t('scopes.national')}</option>
          <option value="regional">{t('scopes.regional')}</option>
          <option value="local">{t('scopes.local')}</option>
        </select>
      </FormField>
      {(scope === 'regional' || scope === 'local') && (
        <FormField label={t('regionCode')} error={errors.regionCode?.message}>
          <Input {...register('regionCode')} />
        </FormField>
      )}
      <FormField label={t('body')} error={errors.body?.message}>
        <textarea
          {...register('body')}
          rows={8}
          className="block w-full rounded border px-3 py-2"
        />
      </FormField>
      <Button type="submit" disabled={isSubmitting || create.isPending}>
        {t('continueSign')}
      </Button>
    </form>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
```

---

## 14. Internationalisation 8 langues avec `next-intl`

### 14.1 Configuration `next-intl`

```ts
// packages/i18n/src/config.ts
export const locales = ['fr', 'bm', 'snk', 'ff', 'tmq', 'hau', 'mos', 'dje'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';

export const localeLabels: Record<Locale, string> = {
  fr: 'Français',
  bm: 'Bamanankan',
  snk: 'Sooninkanxanne',
  ff: 'Fulfulde',
  tmq: 'Tamasheq',
  hau: 'Hausa',
  mos: 'Mooré',
  dje: 'Zarma',
};
```

```ts
// packages/i18n/src/request.ts
import { getRequestConfig } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = (await requestLocale) as Locale | undefined;
  const locale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>;
  return {
    locale,
    messages,
    timeZone: 'Africa/Bamako',
    formats: {
      dateTime: {
        short: { day: 'numeric', month: 'short', year: 'numeric' },
        full: {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      },
      number: {
        percent: { style: 'percent', maximumFractionDigits: 1 },
      },
    },
  };
});
```

### 14.2 Fichier de messages (exemple FR + BM)

```json
// packages/i18n/messages/fr.json (extrait)
{
  "common": {
    "yes": "Oui",
    "no": "Non",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "loading": "Chargement…",
    "signIn": "Se connecter",
    "signOut": "Se déconnecter",
    "language": "Langue"
  },
  "citizen": {
    "search": {
      "title": "Rechercher mon NINA",
      "help": "Saisissez votre numéro d'identité (15 caractères : 14 chiffres + 1 lettre)",
      "ninaLabel": "Numéro NINA",
      "submit": "Rechercher"
    },
    "view": {
      "photoOk": "Photo disponible",
      "noPhoto": "Sans photo",
      "birthDate": "Date de naissance",
      "sex": "Sexe",
      "birthPlace": "Lieu de naissance",
      "residence": "Résidence",
      "father": "Père",
      "mother": "Mère",
      "downloadPdf": "Télécharger ma fiche PDF",
      "requestCorrection": "Demander une correction",
      "notFound": "Identité introuvable"
    },
    "correction": {
      "title": "Demander une correction",
      "help": "Votre demande sera étudiée par un agent du CTDEC.",
      "fieldLabel": "Champ à corriger",
      "currentValue": "Valeur actuelle",
      "proposedValue": "Nouvelle valeur proposée",
      "reason": "Motif (min. 10 caractères)",
      "submit": "Envoyer la demande",
      "sending": "Envoi…",
      "fields": {
        "firstName": "Prénom",
        "lastName": "Nom",
        "birthDate": "Date de naissance",
        "birthPlace": "Lieu de naissance",
        "fatherName": "Nom du père",
        "motherName": "Nom de la mère"
      }
    }
  },
  "errors": {
    "genericHelp": "Veuillez réessayer. Si le problème persiste, contactez le support.",
    "retry": "Réessayer",
    "network": { "title": "Problème de connexion" },
    "user": { "title": "Requête invalide" },
    "server": { "title": "Erreur serveur" }
  }
}
```

```json
// packages/i18n/messages/bm.json (extrait bambara)
{
  "common": {
    "yes": "Ɔwɔ",
    "no": "Ayi",
    "cancel": "A dabila",
    "save": "A mara",
    "loading": "A bɛ yɛlɛn…",
    "signIn": "Don",
    "signOut": "Bɔ",
    "language": "Kan"
  },
  "citizen": {
    "search": {
      "title": "Ka n ka NINA ɲini",
      "help": "NINA nimɔrɔ sɛbɛn (walawala 14 ni siginidɛn 1)",
      "ninaLabel": "NINA nimɔrɔ",
      "submit": "Ɲini"
    }
  }
}
```

### 14.3 Sélecteur de langue

```tsx
// apps/citizen/components/language-switcher.tsx
'use client';
import { useRouter, usePathname } from 'next/navigation';
import { locales, localeLabels, type Locale } from '@nina-aes/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nina-aes/ui/components/ui/dropdown-menu';
import { Button } from '@nina-aes/ui/components/ui/button';
import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useUiStore } from '@/lib/store/ui-store';

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale() as Locale;
  const setLocale = useUiStore((s) => s.setLocale);
  const t = useTranslations('common');

  const switchTo = (locale: Locale) => {
    setLocale(locale);
    const parts = pathname.split('/');
    parts[1] = locale;
    router.push(parts.join('/'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('language')}>
          <Globe className="mr-2 h-4 w-4" />
          {localeLabels[current]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchTo(l)}
            className={l === current ? 'font-semibold' : ''}
          >
            {localeLabels[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 14.4 Règles d'i18n dans le code

1. **Jamais** de chaîne hardcodée dans un composant visible — tout passe par `useTranslations` ou
   `getTranslations`.
2. **Dates / nombres** : toujours via `useFormatter()` ou `Intl.DateTimeFormat` pour respecter la
   locale (`dje` utilise des séparateurs différents de `fr`).
3. **Pluralisation** via syntax ICU : `{count, plural, one {1 citoyen} other {# citoyens}}`.
4. **Tri alphabétique** via `Intl.Collator` pour ranger les listes par locale.
5. **Traductions manquantes** : next-intl loggue `intl.error` en dev ; en prod, fallback `fr` via
   `onError`.

---

## 15. Accessibilité WCAG 2.2 AA

### 15.1 Règles appliquées systématiquement

| Règle                            | Application dans NINA-AES                                       |
| -------------------------------- | --------------------------------------------------------------- |
| **1.4.3 Contraste**              | Tokens OKLCH vérifiés par script CI (tous ≥ 4.5:1)              |
| **1.4.10 Reflow**                | Tous les écrans responsives jusqu'à 320 px de large             |
| **1.4.11 Contraste non-textuel** | Bordures des inputs ≥ 3:1                                       |
| **2.1.1 Clavier**                | Tous les composants Radix/shadcn sont navigables au clavier     |
| **2.4.3 Ordre focus**            | Ordre DOM = ordre logique — pas de `tabindex > 0`               |
| **2.4.7 Focus visible**          | `:focus-visible` sur tous les éléments interactifs              |
| **2.5.5 Taille cible tactile**   | `min-h-[44px]` sur les boutons citoyen mobile                   |
| **3.3.1 Messages d'erreur**      | Message associé au champ via `aria-describedby`                 |
| **3.3.2 Étiquettes**             | Tout input a un `<Label>` associé                               |
| **4.1.2 Nom, rôle, valeur**      | Composants Radix exposent les ARIA attributs natifs             |
| **4.1.3 Status messages**        | Toasts avec `role="status"` (via sonner) + `aria-live="polite"` |

### 15.2 Tests axe-core en CI

```ts
// apps/citizen/e2e/a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibilité citoyen', () => {
  test("page recherche NINA n'a pas de violations", async ({ page }) => {
    await page.goto('/fr/nina');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('page fiche a la hiérarchie de titres correcte', async ({ page }) => {
    await page.goto('/fr/nina/12345678901234A');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });
});
```

### 15.3 Tests lecteur d'écran

Un test manuel avec NVDA (Windows) + VoiceOver (macOS) + TalkBack (Android) est exécuté **avant
chaque release majeure** sur les 3 parcours critiques :

1. Login + recherche NINA + consultation fiche,
2. Validation d'une correction par un agent,
3. Lecture d'un dashboard KPI governance.

Une check-list documentée dans `docs/18-TESTING-STRATEGY.md` guide l'exécution.

---

## 16. Tests (Vitest + Playwright + visual regression)

### 16.1 Vitest — tests unitaires hooks et utilitaires

```ts
// apps/citizen/hooks/use-citizen.test.tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCitizen } from "./use-citizen";
import { clientApi } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  clientApi: {
    identity: { getByNina: vi.fn() },
  },
}));

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useCitizen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ne fait pas d'appel si nina est null", () => {
    renderHook(() => useCitizen(null), { wrapper: wrapper() });
    expect(clientApi.identity.getByNina).not.toHaveBeenCalled();
  });

  it("retourne les données du citoyen", async () => {
    vi.mocked(clientApi.identity.getByNina).mockResolvedValue({
      id: "abc",
      nina: "12345678901234A",
      firstName: "Fatoumata",
      lastName: "Diallo",
      birthDate: "1998-04-12",
      birthPlace: "Bamako",
      sex: "F",
      fatherName: null,
      motherName: null,
      residence: { region: "District", cercle: "Bamako", commune: "Commune IV" },
      photoUrl: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-04-01T00:00:00Z",
      version: 3,
    });
    const { result } = renderHook(() => useCitizen("12345678901234A"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.firstName).toBe("Fatoumata");
  });
});
```

### 16.2 Tests HTTP client

```ts
// packages/api-client/src/core/http-client.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient } from './http-client';
import { ApiError, ApiValidationError } from './errors';
import { z } from 'zod';

const Schema = z.object({ ok: z.literal(true), value: z.number() });

describe('HttpClient', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('parse la réponse contre un schéma Zod', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpClient({ baseUrl: 'http://api' });
    const out = await client.request({ path: '/x', schema: Schema });
    expect(out).toEqual({ ok: true, value: 42 });
  });

  it('lève ApiValidationError si réponse invalide', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, value: 'not a number' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpClient({ baseUrl: 'http://api' });
    await expect(client.request({ path: '/x', schema: Schema })).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });

  it('lève ApiError sur 400', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'INVALID', message: 'bad' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpClient({ baseUrl: 'http://api' });
    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID',
    });
  });

  it('retry sur 502 puis renvoie la réponse sur 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 })).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, value: 7 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpClient({ baseUrl: 'http://api', maxRetries: 1 });
    const out = await client.request({ path: '/x', schema: Schema });
    expect(out.value).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

### 16.3 Playwright — parcours E2E citoyen

```ts
// apps/citizen/e2e/happy-path.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Parcours citoyen complet', () => {
  test.beforeEach(async ({ page, context }) => {
    // Auth mockée : cookie injecté via helper
    await context.addCookies([
      {
        name: 'access_token',
        value: process.env.E2E_TEST_TOKEN!,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/fr/dashboard');
  });

  test('un citoyen retrouve sa fiche et demande une correction', async ({ page }) => {
    await page.getByRole('link', { name: /rechercher/i }).click();
    await expect(page).toHaveURL(/\/fr\/nina$/);
    await page.getByLabel('Numéro NINA').fill('12345678901234A');
    await page.getByRole('button', { name: 'Rechercher' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Fatoumata');
    await expect(page.getByText('12345678901234A')).toBeVisible();

    await page.getByRole('link', { name: /correction/i }).click();
    await page.getByLabel('Champ à corriger').selectOption('birthPlace');
    await page.getByLabel('Nouvelle valeur proposée').fill('Sikasso');
    await page.getByLabel(/Motif/i).fill('Erreur sur la commune depuis la numérisation');
    await page.getByRole('button', { name: /Envoyer/i }).click();

    await expect(page.getByText(/Demande envoyée/i)).toBeVisible();
  });
});
```

### 16.4 Visual regression sur shadcn theming

```ts
// apps/citizen/e2e/visual.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual regression', () => {
  test('landing page match snapshot', async ({ page }) => {
    await page.goto('/fr/');
    await expect(page).toHaveScreenshot('landing-fr.png', { maxDiffPixelRatio: 0.005 });
  });

  test('fiche citoyen match snapshot (données mockées)', async ({ page }) => {
    await page.route('**/api/v1/citizens/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'abc',
          nina: '12345678901234A',
          firstName: 'Fatoumata',
          lastName: 'Diallo',
          birthDate: '1998-04-12',
          birthPlace: 'Bamako',
          sex: 'F',
          fatherName: null,
          motherName: null,
          residence: { region: 'District', cercle: 'Bamako', commune: 'Commune IV' },
          photoUrl: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          version: 1,
        }),
      });
    });
    await page.goto('/fr/nina/12345678901234A');
    await expect(page).toHaveScreenshot('fiche-citoyen.png', { maxDiffPixelRatio: 0.005 });
  });
});
```

### 16.5 Perf budget Lighthouse CI

```js
// apps/citizen/.lighthouserc.js
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm start',
      url: ['http://localhost:4001/fr/', 'http://localhost:4001/fr/login'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'total-byte-weight': ['error', { maxNumericValue: 500 * 1024 }],
        'unused-javascript': ['warn', { maxNumericValue: 50 * 1024 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
};
```

---

## 17. Mini-rapport d'étape + checklist

### 17.1 Template de mini-rapport

```markdown
# Mini-rapport — Document 12 (Frontend Integration API)

**Auteur** : \_ \_ \_ _ **Date** : _ \_ \_ _ **Durée réelle** : _ \_ h **Durée estimée** : 16 – 24 h

## Livrables produits

- `apps/citizen` port 4001 : démarre, login Keycloak OK, 6 pages principales opérationnelles
- `apps/admin` port 4002 : démarre, validation corrections OK, dashboard IA affiche 24h
- `apps/governance` port 4003 : démarre, KPI consolidés, directive signable
- `packages/api-client` : 7 clients typés (identity, auth, document, correction, appointment, ai,
  audit) avec parsing Zod
- `packages/ui` : 24 composants shadcn copiés + 5 composants métiers (AesLogo, NinaInput, KpiCard,
  CitizenCard, QrViewer)
- `packages/i18n` : 8 locales peuplées (fr complet, autres = squelette à traduire)

## Métriques obtenues

| App        | First Load JS | Lighthouse perf | Lighthouse a11y | Tests unit | Tests E2E |
| ---------- | ------------- | --------------- | --------------- | ---------- | --------- |
| citizen    | \_ \_ KB      | \_ \_           | \_ \_           | \_ \_ %    | \_ \_ /3  |
| admin      | \_ \_ KB      | \_ \_           | \_ \_           | \_ \_ %    | \_ \_ /3  |
| governance | \_ \_ KB      | \_ \_           | \_ \_           | \_ \_ %    | \_ \_ /3  |

## Problèmes rencontrés

---

## Prochaine étape

- Document 13 — Mobile App Expo (React Native + QR scan)
```

### 17.2 Checklist de fin d'étape

- [ ] ✅ Les 3 apps démarrent simultanément
      (`pnpm turbo dev --filter=citizen --filter=admin --filter=governance`)
- [ ] ✅ Login Keycloak OIDC + PKCE opérationnel avec cookies httpOnly + Secure
- [ ] ✅ Refresh silencieux testé (attendre 14 min, faire une requête, refresh auto)
- [ ] ✅ Logout propre (session Keycloak terminée + cookies supprimés)
- [ ] ✅ CSP active et sans `unsafe-inline` (headers visibles dans DevTools)
- [ ] ✅ En-têtes durcis présents : HSTS (prod), `X-Frame-Options: DENY` + `frame-ancestors 'none'`,
      `Referrer-Policy`, `X-Content-Type-Options: nosniff` (§ 9bis.4)
- [ ] ✅ `verifyIdToken` rejette `alg=none` / `HS*` et valide `iss`/`aud`/`nonce`/`exp` (§ 9bis.1)
- [ ] ✅ `requireRole` côté serveur (`server-only`) garde les écrans admin/governance (§ 9bis.2)
- [ ] ✅ `client_secret` admin/governance résolu via Vault, jamais en `process.env` nu (§ 9bis.3)
- [ ] ✅ Rate-limiting actif sur `/api/auth/*` et le BFF (429 + Retry-After) (§ 9bis.5)
- [ ] ✅ Protection CSRF double-submit sur les mutations BFF / Server Actions (§ 9bis.6)
- [ ] ✅ iframe d'aperçu PDF : sandbox SANS combinaison `allow-scripts`+`allow-same-origin` (§ 11.4)
- [ ] ✅ Threat model STRIDE + mapping OWASP renseigné, lignes « Conçu/Phase 2 » assumées (§ 9bis.7)
- [ ] ✅ `@nina-aes/api-client` : 7 clients avec parsing Zod, coverage ≥ 85 %
- [ ] ✅ Parcours citoyen : recherche NINA → fiche → correction → PDF téléchargé
- [ ] ✅ Parcours admin : liste corrections → détail avec SHAP → approve/reject
- [ ] ✅ Parcours governance : dashboard KPI + publication directive
- [ ] ✅ 8 langues sélectionnables (FR complet + 7 squelettes)
- [ ] ✅ Tests Playwright E2E : 1 parcours par app (3 au total) verts
- [ ] ✅ Tests axe-core : 0 violation WCAG 2.2 AA sur les 6 pages citoyen publiques
- [ ] ✅ Lighthouse CI ≥ 90 perf et ≥ 95 a11y sur `/fr/` et `/fr/login`
- [ ] ✅ Bundle First Load JS < 180 KB par app
- [ ] ✅ `pnpm turbo lint` et `pnpm turbo typecheck` verts
- [ ] ✅ Commit : `feat(frontend): 3 apps Next.js 16 + api-client typé + design system AES`

---

## 18. Pour aller plus loin

1. **Streaming RSC avancé** : utiliser `<Suspense>` pour streamer les KPI governance indépendamment,
   afin que la coque apparaisse < 200 ms même avec une API lente.
2. **Server Actions transactionnelles** : refactorer la soumission de correction pour utiliser
   `useActionState` de React 19 — supprime la dépendance à `useMutation` pour ce cas simple.
3. **Offline partiel** via `next-pwa` : cacher la dernière fiche consultée par le citoyen en
   IndexedDB, servir depuis le cache si hors ligne.
4. **Optimistic UI** sur la validation de correction : l'agent voit immédiatement l'item disparaître
   de la liste, rollback si le backend rejette.
5. **Typed env** via `@t3-oss/env-nextjs` : valider à runtime les variables d'env au démarrage du
   serveur, plantage propre en cas de config manquante.
6. **Design tokens versionnés** : publier `@nina-aes/ui@1.x` en registry privé pour que l'app mobile
   Expo (doc 13) puisse réutiliser les tokens OKLCH.
7. **Storybook 9** (optionnel) : galerie des composants pour accélérer le design feedback.
8. **Feature flags** via Unleash : router 5 % des citoyens sur une nouvelle variante du formulaire
   de correction, mesurer le taux de soumission.
9. **Réponse speech-to-text** pour l'USSD en accessibilité renforcée (Bloc E — borne kiosque).
10. **SVG drapeaux des pays AES** dynamique selon la résidence du citoyen dans la fiche — sans parti
    pris politique, juste informatif.

---

_Document 12 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_ _Prochain
document : [13 — Mobile App Expo](./13-MOBILE-APP-EXPO.md)_
