# Feuille de route de complétion post-remise (ROADMAP-COMPLETION)

Ce document n'est pas un calendrier. C'est un **contrat technique** : il définit les _conditions_
d'une application complète, montre que l'architecture a été pensée pour être **reprise et finie
après la remise du 22 août 2026**, et fournit le chemin exact pour y parvenir. La date de remise
clôt un jalon académique (la démo MOCK-FIRST, reproductible et démontrable), pas le projet logiciel.

Posture assumée devant le jury mixte (professeur tuteur technique, tuteurs CTDEC, jury académique
UQAR) : _« Ce qui reste à faire n'est pas une réécriture, c'est le branchement d'adaptateurs
derrière une interface déjà en place. La roadmap ci-dessous le démontre point par point. »_

---

## Definition of Complete

Une application **100 % complète** satisfait _tous_ les critères mesurables suivants. La colonne «
État actuel » est volontairement honnête : elle distingue ce qui est livré, ce qui est partiel, et
ce qui est planifié mais pas commencé. Aucun chiffre n'est inventé ; les pourcentages reprennent
l'état réel constaté du frontend et du backend.

| #   | Critère mesurable                      | Cible « complet »                                                                     | État actuel                                                                                                                  |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1  | Écrans citizen (PC-01 → PC-06 + Login) | 7/7 écrans à 100 %                                                                    | Login 100 %, PC-01 100 % (FR+BM), PC-05 90 %, PC-04 85 %, PC-02 70 %, PC-03 70 %, PC-06 75 %                                 |
| C2  | Écrans admin (AD-01 → AD-03 + Login)   | 4/4 écrans à 100 %, liens morts stubés                                                | AD-02 100 %, AD-01 95 %, AD-03 95 %, Login 100 % ; liens « Rendez-vous »/« Paramètres » **stubbés (S4) — zéro lien mort**    |
| C3  | Écrans governance (GOV-01 + GOV-02)    | 2/2 écrans à 100 % + backend governance branché                                       | **Bâti (S5-S7)** : shell + GOV-01 messagerie (Ed25519) + GOV-02 Kanban, en mock ; backend governance non encore branché      |
| C4  | Composants métier dans `@nina-aes/ui`  | 18/18 composants livrés et consommés par les 3 apps                                   | 4/18 livrés ; le reste réimplémenté localement dans les apps                                                                 |
| C5  | Couture de données : mocks rapatriés   | 0 mock en dur dans les composants ; tout passe par `@nina-aes/api-client`             | Des mocks encore EN DUR dans les composants (ex. `generateMockSlots`)                                                        |
| C6  | API réelle branchée                    | Les 3 apps fonctionnent sur l'adaptateur API réel via flag d'environnement            | 0 app branchée ; démo 100 % mock déterministe (choix assumé)                                                                 |
| C7  | i18n                                   | 8/8 langues complètes (FR, BM, SNK, FF, TMQ, HAU, MOS, DJE)                           | FR 100 %, BM ~11 % (vitrine), 6 autres = stubs (<1 %) + fallback FR                                                          |
| C8  | Couverture de tests                    | > 80 % lignes/branches sur le code applicatif                                         | 🔲 À COMPLÉTER (S?) : mesure réelle non encore prise — instrumenter `vitest --coverage` / `pytest --cov`, publier le rapport |
| C9  | Services cœur bootables                | Les 11 services cœur + gateway démarrent et répondent à `/health`                     | ~20 % réellement exécutable ; stack infra lançable (`pnpm run docker:up`)                                                    |
| C10 | Preuve d'intégration                   | Au moins 1 capture Swagger gateway (`localhost:3000/api/docs`)                        | 🔲 À COMPLÉTER (S9 max) : capture optionnelle, à ne pas faire avant S9                                                       |
| C11 | Mobile (Expo)                          | App Expo citoyenne planifiée, sur la même couture `api-client`                        | Non commencé — planifié (Bloc mobile)                                                                                        |
| C12 | Borne / kiosque (Electron)             | Build kiosque Electron planifié (Bloc E)                                              | Non commencé — planifié (Bloc E)                                                                                             |
| C13 | Biométrie (Bloc F)                     | Capture/vérification biométrique planifiée, service dédié                             | Non commencé — planifié (Bloc F), service `biometric` différé                                                                |
| C14 | Inclusion USSD                         | `*123*NINA#` en 8 langues, files prioritaires vulnérables, offline-first              | Service `ussd` différé ; parcours conçu, non exécutable                                                                      |
| C15 | Garde-fous repo                        | `pnpm run verify:repo` vert + Husky + doc-sync (`docs:sync:check`) à chaque incrément | Chaîne en place ; à maintenir verte sur chaque lot                                                                           |

> Lecture du tableau : tout ce qui est en « partiel » est _fini en avançant un curseur connu_ ; tout
> ce qui est « planifié » a déjà sa place dans l'architecture (service ou package cible identifié).
> C'est la différence entre _inachevé_ et _non conçu_ : ici tout est conçu.

---

## Principe directeur : architecture en couture échangeable

Le projet repose sur une **couture** (seam) unique : le package `@nina-aes/api-client`. C'est
l'**interface de données** que consomment les écrans. Derrière cette interface, il existe — par
conception — **deux implémentations interchangeables** :

1. **Adaptateur MOCK** — données déterministes, zéro backend, zéro flakiness. C'est lui qui fait
   tourner la démo de soutenance. Reproductible à 100 %.
2. **Adaptateur API réel** — appels HTTP vers `api-gateway` (port 3000) puis vers les services cœur.

La bascule entre les deux se fait par **flag d'environnement** (mode démo : `NINA_AUTH_MODE=mock`,
`NEXT_PUBLIC_DEMO_MODE=true`). Aucune ligne de composant ne doit changer pour passer du mock à l'API
réelle : c'est tout l'intérêt de la couture.

**Constat honnête (et c'est le point de départ du travail post-remise) :** aujourd'hui, des mocks
sont encore **EN DUR dans les composants** (par exemple `generateMockSlots` pour les créneaux de
rendez-vous). Tant que ces mocks vivent dans les composants, « brancher l'API » signifierait éditer
chaque écran — fragile et coûteux.

**Première action obligatoire, donc :** _rapatrier les mocks en dur derrière la couture_
`@nina-aes/api-client`. Une fois ce rapatriement fait, l'adaptateur MOCK et l'adaptateur API réel
exposent strictement la même interface, et :

> **Finir le projet après la remise = écrire/brancher un adaptateur, pas réécrire les écrans.**

C'est la garantie structurelle que ce document apporte. La complétude n'est plus un saut, c'est une
suite d'incréments derrière une frontière stable.

---

## Backlog post-remise par lot priorisé

Quatre lots ordonnés par priorité. L'effort est **indicatif** (ordre de grandeur pour un étudiant
seul), volontairement non daté : il sert à séquencer, pas à promettre une date.

| Lot                                                      | Contenu                                                                                                                                                                                                                                                                                                                                                                                  | Pré-requis                                                                                                                    | Effort indicatif                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **P0 — Brancher la couture, écran par écran**            | (a) Rapatrier tous les mocks en dur derrière `@nina-aes/api-client` (commencer par `generateMockSlots` / PC-04). (b) Définir l'interface stable de chaque ressource (NINA, corrections, rendez-vous, signalements, dashboard). (c) Implémenter l'adaptateur API réel ressource par ressource, derrière flag. (d) Finir les écrans partiels (PC-02/03/04, AD liens morts) sur la couture. | Couture `api-client` posée ; flags d'env ; écrans cibles identifiés (déjà fait)                                               | Élevé — c'est le cœur du travail, mais purement additif (pas de réécriture)   |
| **P1 — Compléter les services backend**                  | Rendre bootables et fonctionnels les services cœur **dans cet ordre** : `identity` (3001) → `auth` (3002) → `document` (3004) → `audit` (3007), puis les autres (`notification`, `appointment`, `interop`, `governance`, `ai`, `anticorruption`, `vulnerability`). Brancher l'`api-gateway` (3000). Cibler `/health` vert sur chacun.                                                    | P0 amorcé (au moins l'interface api-client figée) ; stack infra `docker:up` (Postgres/Redis/RabbitMQ/MinIO/ES/Keycloak/Vault) | Élevé — étalé par service ; chaque service livrable indépendamment            |
| **P2 — i18n 8 langues complètes**                        | Finir BM (vitrine → complète), puis SNK, FF, TMQ, HAU, MOS, DJE. Architecture i18n et fallback FR déjà en place : il s'agit de remplir les catalogues, pas de re-tooler.                                                                                                                                                                                                                 | Écrans stabilisés (P0) pour figer les chaînes ; relecture linguistique externe recommandée                                    | Moyen — surtout de la traduction/relecture, pas du code                       |
| **P3 — Blocs E (kiosque) + F (biométrie) + mobile Expo** | (E) Build kiosque **Electron** (mode borne, plein écran, navigation restreinte). (F) Service `biometric` + capture/vérification biométrique. Mobile **Expo** citoyen sur la même couture `api-client`. Activer/finir USSD `*123*NINA#` (service `ussd` différé).                                                                                                                         | P0 + P1 (couture + au moins identity/auth/document branchés) ; matériel/SDK biométrie pour F                                  | Élevé — nouveaux artefacts ; réutilisent la couture et les services existants |

Règle de priorisation : **on ne descend pas d'un lot tant que le précédent ne tient pas derrière les
tests.** P0 débloque tout le reste, car il fige l'interface ; P1 donne de la substance ; P2 et P3
sont des extensions à frontière stable.

---

## Comment reprendre le travail à tout moment

Le projet est conçu pour être **repris à froid**, par l'étudiant plus tard ou par un assistant IA,
sans remonter tout le contexte à la main.

1. **Pointer l'assistant sur ce fichier.** Relancer Claude Code dans le dépôt et lui donner
   `docs/soutenance/ROADMAP-COMPLETION.md` comme point d'entrée : il y trouve la _Definition of
   Complete_, le lot prioritaire en cours, et le principe de couture. Le « prochain pas » est
   toujours le premier item non coché du lot P0/P1/P2/P3.
2. **Respecter les garde-fous du dépôt, sans exception :**
   - `pnpm run verify:repo` (chaîne complète) doit rester **vert** ;
   - les hooks **Husky** (pre-commit `lint-staged`, `max-warnings=0` ; commitlint `scope-enum`)
     bloquent volontairement un incrément non propre — ne pas les contourner ;
   - `MAINTENANCE.md` impose la **synchronisation documentaire** : tout changement de script, chemin
     ou processus met à jour la doc _dans le même incrément_ (`pnpm run docs:sync:check`).
3. **Chaque incrément derrière les tests.** Un écran branché, un service bootable, un catalogue de
   langue rempli = une unité livrable, testée, committée avec le bon scope. Pas de gros « big bang
   ».
4. **Suivre l'ordre.** L'ordre P0 → P1 → P2 → P3, et l'ordre interne de P1
   (`identity → auth → document → audit → …`), n'est pas arbitraire : il maximise ce qui devient
   démontrable le plus tôt, en minimisant les dépendances.

Commandes de validation de référence (depuis `CLAUDE.md`) :

```bash
pnpm run verify:repo        # chaîne complète — préféré
pnpm run validate:data
pnpm run validate:schemas
pnpm run docs:sync:check
```

---

## Ce que cette roadmap garantit (et ce qu'elle ne garantit pas)

**Elle garantit :**

- des **critères de complétude mesurables** (C1 → C15 ci-dessus), donc un objectif non ambigu ;
- une **architecture en couture** déjà en place : finir = brancher un adaptateur, pas réécrire ;
- un **chemin reprenable à froid** : un seul fichier d'entrée, un ordre de lots, des garde-fous
  (verify:repo, Husky, doc-sync) qui empêchent la régression silencieuse ;
- une **honnêteté d'état** : ce qui est partiel vs planifié est explicite, rien n'est maquillé.

**Elle ne garantit pas :**

- un **calendrier**. Le débit de réalisation dépend du temps réellement disponible de l'étudiant
  (seul, hors échéance académique). Aucune date de fin n'est promise, et c'est volontaire :
  promettre une date serait malhonnête envers le jury comme envers le projet ;
- que les chiffres encore non mesurés (couverture de tests C8, perfs, score IA) atteindront la cible
  _sans le travail correspondant_ — ils sont marqués 🔲 À COMPLÉTER et devront être _mesurés_, pas
  estimés ;
- l'absence de surprises côté backend : passer de ~20 % bootable à des services complets reste un
  travail substantiel, simplement **borné et ordonné** par ce document.

En une phrase pour le jury : _cette feuille de route ne promet pas « ce sera fini le tel jour » ;
elle prouve que « c'est finissable, dans cet ordre, sans rien réécrire » — et c'est précisément ce
qu'un projet d'ingénierie bien conçu doit pouvoir démontrer._
