# Tableau de métriques consolidées — NINA-AES Platform

Ce document rassemble en un seul endroit les **métriques du projet**, en séparant strictement deux
catégories :

- les **faits vérifiés** (périmètre du code, comptage des artefacts, écrans livrés) ;
- les **métriques à mesurer** (lignes de code, couverture de tests, performances API, qualité du
  modèle IA, scans de sécurité), pour lesquelles aucune valeur n'est inventée : chaque ligne indique
  la **cible**, la **commande / méthode** pour l'obtenir, et un **statut** daté par semaine de
  travail (Sx).

> Posture de transparence assumée pour le jury : ce qui est mesuré est présenté comme mesuré ; ce
> qui ne l'est pas encore est présenté comme tel, avec le moyen exact de l'obtenir. Aucun chiffre de
> LOC, de couverture, de latence ou de score IA n'est avancé sans mesure.

---

## 1. Périmètre du code (faits vérifiés)

Le périmètre suivant correspond à la structure réelle du monorepo Turborepo/pnpm. Il décrit _ce qui
existe_ (répertoires, applications, packages), indépendamment du _taux de complétion fonctionnelle_,
traité en section 1.3.

### 1.1 Vue d'ensemble du monorepo

| Catégorie                                  | Nombre            | Détail                                            |
| ------------------------------------------ | ----------------- | ------------------------------------------------- |
| Applications frontend (Next.js App Router) | 3                 | citizen, admin, governance                        |
| Répertoires de services backend            | 15                | 11 cœur + 1 api-gateway + 3 différés              |
| Packages partagés                          | 14                | voir §1.4                                         |
| Modèle de démonstration                    | MOCK déterministe | aucun backend branché pour la démo (choix assumé) |

### 1.2 Services backend (15 répertoires)

Le périmètre de service est _structurel_ (répertoires présents). L'exécutabilité réelle est estimée
à environ **20 %** de l'ensemble et n'est pas requise pour la démo, qui tourne en mode MOCK.

| Service        | Port | Stack            | Famille    |
| -------------- | ---- | ---------------- | ---------- |
| api-gateway    | 3000 | NestJS           | Passerelle |
| identity       | 3001 | NestJS           | Cœur       |
| auth           | 3002 | NestJS           | Cœur       |
| ai             | 3003 | FastAPI (Python) | Cœur       |
| document       | 3004 | NestJS           | Cœur       |
| notification   | 3005 | NestJS           | Cœur       |
| interop        | 3006 | NestJS           | Cœur       |
| audit          | 3007 | NestJS           | Cœur       |
| appointment    | 3008 | NestJS           | Cœur       |
| anticorruption | 3009 | FastAPI (Python) | Cœur       |
| governance     | 3010 | NestJS           | Cœur       |
| vulnerability  | 3011 | NestJS           | Cœur       |
| biometric      | —    | —                | Différé    |
| enrollment     | —    | —                | Différé    |
| ussd           | —    | —                | Différé    |

Récapitulatif : **11 services cœur** + **1 passerelle** + **3 services différés** = **15
répertoires**.

### 1.3 Écrans frontend livrés (faits vérifiés)

Le pourcentage indique le **taux de complétion fonctionnelle** de l'écran en mode MOCK, et non un
taux de tests.

| App        | Port | Écran (réf.)                              | Route de démo (mock)                | Complétion |
| ---------- | ---- | ----------------------------------------- | ----------------------------------- | ---------- |
| citizen    | 4001 | PC-01 Accueil (FR + vitrine BM)           | /fr                                 | 100 %      |
| citizen    | 4001 | Login                                     | /fr/login                           | 100 %      |
| citizen    | 4001 | PC-02 Fiche NINA (avatar + sections)      | /fr/nina/18903102015042V            | 70 %       |
| citizen    | 4001 | PC-03 Wizard correction (+ zone upload)   | /fr/nina/18903102015042V/correction | 70 %       |
| citizen    | 4001 | PC-04 Rendez-vous (+ modale + QR)         | /fr/appointments/new                | 85 %       |
| citizen    | 4001 | PC-05 Dashboard / Suivi (timeline animée) | /fr/dashboard                       | 90 %       |
| citizen    | 4001 | PC-06 Signalement                         | /fr/signalement                     | 75 %       |
| admin      | 4002 | AD-01 Dashboard                           | /fr/dashboard                       | 95 %       |
| admin      | 4002 | AD-02 Gestion corrections                 | /fr/corrections                     | 100 %      |
| admin      | 4002 | AD-03 SIGAC                               | /fr/sigac                           | 95 %       |
| admin      | 4002 | Login                                     | /fr/login                           | 100 %      |
| admin      | 4002 | Rendez-vous / Paramètres (stubs honnêtes) | /fr/appointments · /fr/settings     | stub       |
| governance | 4003 | Login                                     | /fr/login                           | 100 %      |
| governance | 4003 | GOV-01 Messagerie signée (3 colonnes)     | /fr/messagerie                      | 80 %       |
| governance | 4003 | GOV-02 Directives (Kanban drag-and-drop)  | /fr/directives                      | 80 %       |
| governance | 4003 | Performance / Rapports (stubs honnêtes)   | /fr/performance · /fr/rapports      | stub       |

> Les `%` indiquent la **maturité front-end en mode mock** (pas la complétude fonctionnelle de bout
> en bout, qui suppose le backend branché).

Récapitulatif : **3 applications pleinement démontrables** — citizen (6 écrans PC + login, FR +
vitrine bambara + responsive mobile), admin (AD-01/02/03 + login, zéro lien mort), governance
(login + GOV-01 messagerie + GOV-02 Kanban + 2 stubs). Données **100 % mock déterministe**.

NINA de démonstration : **18903102015042V** (format : 14 chiffres + 1 lettre de contrôle).

### 1.4 Packages partagés (14)

| Package           | Rôle                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| api-client        | « Couture » de données : interface unique, mock et API réelle comme deux implémentations   |
| ui                | Design system métier : **4/18** composants métier livrés, le reste réimplémenté localement |
| i18n              | Internationalisation (voir §3)                                                             |
| shared-types      | Types partagés front/back                                                                  |
| database          | Accès données (Prisma, ESM)                                                                |
| config            | Configuration                                                                              |
| utils             | Utilitaires                                                                                |
| auth              | Authentification                                                                           |
| auth-guards       | Garde-fous d'autorisation (RBAC)                                                           |
| observability     | Observabilité                                                                              |
| logger            | Journalisation                                                                             |
| vault-client      | Client HashiCorp Vault                                                                     |
| eslint-config     | Config ESLint partagée                                                                     |
| typescript-config | Config TypeScript partagée                                                                 |

> Note de dette technique assumée : des mocks sont encore **en dur** dans certains composants (ex.
> `generateMockSlots`). Le plan (S1-S2) est de les rapatrier derrière la couture
> `@nina-aes/api-client`. De même, `@nina-aes/ui` ne livre que 4/18 composants métier.

---

## 2. Métriques à mesurer (🔲 — aucune valeur inventée)

Pour chaque métrique : la **cible** visée, la **commande ou méthode** exacte pour l'obtenir, et le
**statut** (semaine de travail planifiée). Tant que la mesure n'est pas faite, la valeur reste vide.

### 2.1 Volume de code

| Métrique                      | Cible                            | Comment l'obtenir                                                    | Statut |
| ----------------------------- | -------------------------------- | -------------------------------------------------------------------- | ------ |
| Lignes de code (total)        | — (à constater, pas un objectif) | `git ls-files \| xargs cloc` ou `cloc --vcs=git` à la racine du repo | 🔲 S9  |
| LOC par langage (TS/Python)   | —                                | `cloc --vcs=git --by-file-by-lang`                                   | 🔲 S9  |
| LOC front vs back vs packages | —                                | `cloc apps/ services/ packages/` (chemins séparés)                   | 🔲 S9  |

> Méthode privilégiée : `cloc` sur la liste suivie par git (`git ls-files`) pour exclure
> `node_modules`, `dist`, et artefacts générés. À défaut de `cloc`, fallback
> `git ls-files \| grep -E '\.(ts|tsx|py)$' \| xargs wc -l` (approximatif, inclut lignes vides et
> commentaires).

### 2.2 Couverture de tests

| Métrique                       | Cible                     | Comment l'obtenir                        | Statut |
| ------------------------------ | ------------------------- | ---------------------------------------- | ------ |
| Couverture front/back (TS)     | ≥ 70 % sur le code testé  | `pnpm run test:cov`                      | 🔲 S9  |
| Couverture service IA (Python) | ≥ 70 % sur le pipeline IA | `pnpm run test:ai`                       | 🔲 S9  |
| Tests unitaires verts          | 100 % passants            | `pnpm run verify:repo` (chaîne complète) | 🔲 S9  |

> La couverture sera mesurée, pas estimée. Tant qu'elle n'est pas exécutée et capturée, ce document
> n'avance aucun pourcentage.

### 2.3 Performances API (dépend du backend branché — S9)

Ces métriques **supposent un backend branché** (au moins la passerelle + un service derrière). Elles
ne sont **pas mesurables en mode MOCK** et sont donc conditionnées à l'étape d'intégration
optionnelle de S9.

| Métrique              | Cible | Comment l'obtenir                                   | Statut                 |
| --------------------- | ----- | --------------------------------------------------- | ---------------------- |
| Latence p50           | —     | k6 (`k6 run` scénario de charge sur localhost:3000) | 🔲 S9 (dépend backend) |
| Latence p95           | —     | k6, même scénario, percentile 95                    | 🔲 S9 (dépend backend) |
| Latence p99           | —     | k6, même scénario, percentile 99                    | 🔲 S9 (dépend backend) |
| Débit (req/s) soutenu | —     | k6, paliers de montée en charge                     | 🔲 S9 (dépend backend) |

> Préalable : `pnpm run docker:up` (Postgres/Redis/RabbitMQ/MinIO/ES/Keycloak/Vault), puis
> branchement d'au moins un service. Une **seule** capture « preuve d'intégration » est prévue en
> option (Swagger passerelle `localhost:3000/api/docs`), à faire en S9 au plus tard.

### 2.4 Qualité du modèle IA (dépend de l'entraînement)

| Métrique                  | Cible | Comment l'obtenir                                                       | Statut                      |
| ------------------------- | ----- | ----------------------------------------------------------------------- | --------------------------- |
| AUC (détection d'erreurs) | —     | Entraînement XGBoost sur dataset synthétique NINA + évaluation hold-out | 🔲 S9 (dépend entraînement) |
| F1-score                  | —     | Rapport de classification (`classification_report`) sur jeu de test     | 🔲 S9 (dépend entraînement) |
| Précision / Rappel        | —     | Matrice de confusion sur jeu de test                                    | 🔲 S9 (dépend entraînement) |

> Le générateur de dataset synthétique NINA est en place (cf. PROMPT 4.2) ; le modèle XGBoost est
> **opt-in**. Les scores ne seront renseignés qu'après un entraînement et une évaluation
> reproductibles. Aucun AUC/F1 n'est avancé tant que l'évaluation n'est pas exécutée.

### 2.5 Scans de sécurité

| Métrique                     | Cible                              | Comment l'obtenir                                                  | Statut                 |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| Vulnérabilités images Docker | 0 critique / 0 haute non justifiée | `trivy image <image>` sur les images des services                  | 🔲 S9                  |
| Scan applicatif (DAST)       | 0 alerte haute                     | OWASP ZAP baseline (`zap-baseline.py`) contre la passerelle        | 🔲 S9 (dépend backend) |
| Dépendances vulnérables      | 0 critique                         | `pnpm audit` (front/back) + `pip-audit` (services FastAPI)         | 🔲 S9                  |
| Secrets en clair             | 0                                  | Vérification : secrets via HashiCorp Vault (aucun secret committé) | ✅ par conception      |

---

## 3. Internationalisation (état réel des langues)

| Langue   | Code | État                                                           | Statut   |
| -------- | ---- | -------------------------------------------------------------- | -------- |
| Français | FR   | Livré, complet                                                 | ✅ 100 % |
| Bambara  | BM   | Vitrine — accueil PC-01 livré 100 % (S8), reste en fallback FR | partiel  |
| Soninké  | SNK  | Stub                                                           | 🔲 <1 %  |
| Peul     | FF   | Stub                                                           | 🔲 <1 %  |
| Tamasheq | TMQ  | Stub                                                           | 🔲 <1 %  |
| Haoussa  | HAU  | Stub                                                           | 🔲 <1 %  |
| Mooré    | MOS  | Stub                                                           | 🔲 <1 %  |
| Djerma   | DJE  | Stub                                                           | 🔲 <1 %  |

> Posture honnête : **FR livré**, **BM vitrine**, **6 autres = architecture i18n prête + fallback
> FR**. L'effort n'a jamais visé 8 traductions complètes mais une **architecture multilingue
> démontrée** sur deux langues.

---

## 4. Points forts techniques (faits de conception, valorisables sans mesure)

Ces éléments relèvent de **choix d'architecture vérifiables dans le code**, et non de métriques
chiffrées :

- **QR sécurisé en JWT RS256** — corrige la faille du QR contenant le NINA en clair.
- **Journal d'audit immuable chaîné Merkle** — append-only, garanti par un trigger PostgreSQL.
- **Interopérabilité AES décentralisée** — mTLS + JWS Ed25519, **aucune donnée personnelle
  transmise** (seulement un booléen + un score).
- **Secrets via HashiCorp Vault**, mots de passe **Argon2id**, **MFA**, **RBAC 6 rôles**.
- **Inclusion** — USSD `*123*NINA#` (8 langues prévues), files prioritaires vulnérables, approche
  offline-first.

---

## 5. Économies / impact estimés vs système actuel

Cette section reste **qualitative et prudente**. Aucun chiffre d'économie n'est fabriqué : tout
impact monétaire ou volumétrique est marqué 🔲 tant qu'il n'est pas étayé par une source vérifiable.

### 5.1 Impact qualitatif (étayé par la conception)

| Axe                           | Système actuel (référence)                                | Apport NINA-AES                                                 | Nature de la preuve                |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| Traçabilité électorale        | Fiasco 2013 : millions d'exclus, ~9000 cartes non tracées | Journal d'audit immuable chaîné Merkle (append-only)            | Conception vérifiable dans le code |
| Confidentialité du NINA       | QR contenant le NINA en clair (faille)                    | QR signé JWT RS256, NINA non exposé                             | Conception vérifiable              |
| Souveraineté transfrontalière | Échanges AES sans cadre technique unifié                  | Interop mTLS + JWS Ed25519, aucune donnée personnelle transmise | Conception vérifiable              |
| Accessibilité des vulnérables | Dépendance au guichet physique                            | USSD multilingue, files prioritaires, offline-first             | Conception (USSD différé)          |
| Lutte anti-corruption         | Opacité du traitement des dossiers                        | SIGAC : scoring agents + heatmap (AD-03)                        | Écran livré (mock)                 |

### 5.2 Impacts chiffrés (à étayer — non inventés)

| Indicateur d'impact                                  | Cible / hypothèse | Comment l'étayer                                                                                  | Statut   |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Réduction du délai de traitement d'une correction    | —                 | Comparaison processus actuel CTDEC vs flux applicatif (à documenter avec source institutionnelle) | 🔲 S8-S9 |
| Réduction des déplacements physiques (diaspora)      | —                 | Estimation à partir du volume de demandes traitables en ligne (source à citer)                    | 🔲 S8-S9 |
| Coût évité des cartes non tracées                    | —                 | Référence chiffrée vérifiable sur le coût unitaire (à sourcer)                                    | 🔲 S8-S9 |
| Taux d'erreurs détectées par l'IA vs contrôle manuel | —                 | Dépend de l'évaluation du modèle (§2.4)                                                           | 🔲 S9    |

> Règle appliquée : tant qu'un impact n'a pas de source vérifiable (donnée CTDEC/DNEC, mesure
> interne, ou évaluation du modèle), il est laissé en 🔲. Le jury mixte (tuteur technique, tuteurs
> CTDEC, jury académique UQAR) doit pouvoir distinguer ce qui est démontré de ce qui est projeté.

---

## 6. Synthèse — où en est la mesure

| Famille de métriques        | Mesurée aujourd'hui ?            | Échéance de mesure                                            |
| --------------------------- | -------------------------------- | ------------------------------------------------------------- |
| Périmètre du code (§1)      | ✅ Oui (faits structurels)       | —                                                             |
| Volume de code / LOC (§2.1) | 🔲 Non                           | S9 (cloc)                                                     |
| Couverture de tests (§2.2)  | 🔲 Non                           | S9 (test:cov / test:ai)                                       |
| Performances API (§2.3)     | 🔲 Non                           | S9 (k6, dépend backend)                                       |
| Qualité IA AUC/F1 (§2.4)    | 🔲 Non                           | S9 (dépend entraînement)                                      |
| Scans sécurité (§2.5)       | 🔲 Non (Vault ✅ par conception) | S9 (Trivy / ZAP / audit)                                      |
| i18n (§3)                   | ✅ Oui (état réel)               | FR complet ; BM vitrine PC-01 (S8) ; 6 langues en fallback FR |
| Impacts chiffrés (§5.2)     | 🔲 Non                           | S8-S9 (à sourcer)                                             |

> Document vivant v1 : les blocs 🔲 seront remplacés par des valeurs mesurées au fil des semaines
> S8-S9, avec la commande qui les a produites jointe à chaque chiffre.
