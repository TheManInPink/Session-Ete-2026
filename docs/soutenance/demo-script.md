# Script de démonstration live — NINA-AES

Ce document est le **scénario de démonstration minute par minute** de la soutenance NINA-AES (remise
: samedi 22 août 2026). Il est conçu pour une exécution **MOCK-FIRST** : la démo s'appuie
exclusivement sur des **données mock déterministes**, sans aucun backend branché. Ce choix est
**assumé et revendiqué** : il garantit la reproductibilité, l'absence de flakiness réseau, et un
temps de réponse constant devant un jury mixte (professeur tuteur, tuteurs CTDEC, jury académique
UQAR).

> **Posture à tenir devant le jury.** « La démonstration tourne sur des données mock déterministes.
> C'est un choix d'ingénierie : l'interface est branchée sur une _couture de données_ unique
> (`@nina-aes/api-client`) dont le mock et l'API réelle sont deux implémentations interchangeables.
> Brancher le backend après la remise ne change pas une ligne d'écran. »

---

## 1. Vue d'ensemble du déroulé

| Phase                              | Durée cible | Ce qu'on montre                                                               |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Préparation (T-10 min)             | 10 min      | `.env.local`, `pnpm install`, lancement des 3 apps                            |
| Parcours CITOYEN                   | ~7 min      | PC-01 → PC-02 → PC-03 → PC-04 → PC-05 → PC-06                                 |
| Parcours ADMIN                     | ~4 min      | Dashboard → Corrections → SIGAC                                               |
| Gouvernance                        | ~2 min      | GOV-01 messagerie signée (Ed25519) + GOV-02 directives (Kanban drag-and-drop) |
| Synthèse / points forts techniques | ~2 min      | QR JWT, audit Merkle, interop AES, inclusion USSD                             |

Total démo (hors préparation) : **~14 minutes**. Garder une marge ; ne jamais courir après une
fonctionnalité non finie — basculer sur le PLAN B (section 7).

**Conditions d'affichage imposées :** fenêtre navigateur **1440 px** de large, **mode clair**,
**langue FR**. Onglet unique, zoom navigateur à 100 %, barre de favoris masquée.

---

## 2. Préparation (T-10 min)

### 2.1 Créer les fichiers d'environnement de démo

Deux fichiers `.env.local` doivent exister **avant** le lancement. Ils forcent le **mode mock
déterministe** et activent les bannières « mode démo ».

`apps/citizen/.env.local` (**déjà présent dans le dépôt** — vérifier seulement son contenu) :

```
API_BASE_URL=http://localhost:3000
KEYCLOAK_ISSUER=http://localhost:8080/realms/nina-aes
KEYCLOAK_CLIENT_ID=nina-citizen
APP_PUBLIC_URL=http://localhost:4001

# --- Mode démo MOCK-FIRST ---
# Côté citizen, le mock est DÉJÀ la valeur par défaut (proxy.ts : NINA_AUTH_MODE ?? 'mock').
NEXT_PUBLIC_DEMO_MODE=true
```

`apps/admin/.env.local` (**déjà présent dans le dépôt**) :

```
API_BASE_URL=http://localhost:3000
KEYCLOAK_ISSUER=http://localhost:8080/realms/nina-aes
KEYCLOAK_CLIENT_ID=nina-admin
APP_PUBLIC_URL=http://localhost:4002

# --- Mode démo MOCK-FIRST ---
NINA_AUTH_MODE=mock
```

> Les deux variables réelles du mode démo : `NINA_AUTH_MODE=mock` (session déterministe sans
> Keycloak ; valeur par défaut côté citizen) et `NEXT_PUBLIC_DEMO_MODE=true` (bannières « mode démo
> »). Pour les captures automatisées, Playwright force lui-même `NINA_AUTH_MODE=mock` (cf.
> `playwright.config.ts`).

### 2.2 Installer les dépendances

Depuis la racine du monorepo :

```
pnpm install
```

> Note Windows : `pnpm install` reste **manuel** (le check implicite `verifyDepsBeforeRun` est
> désactivé pour éviter une race sur les bin shims Windows). Lancer cette commande une fois, à
> froid, **48 h avant** plutôt que le jour J.

### 2.3 Lancer les deux applications

Deux terminaux séparés, depuis la racine :

```
pnpm run dev:citizen
```

```
pnpm run dev:admin
```

```
pnpm run dev:governance
```

- **citizen** → http://localhost:4001
- **admin** → http://localhost:4002
- **governance** → http://localhost:4003

Attendre que les deux serveurs Next.js affichent « Ready » avant d'ouvrir le navigateur. Pré-charger
les deux onglets et faire un premier passage complet à blanc (la première compilation App Router est
lente — ne jamais subir un cold start devant le jury).

### 2.4 Vérification finale avant d'appeler le jury

- [ ] http://localhost:4001/fr s'affiche (PC-01 Accueil).
- [ ] http://localhost:4002/fr/dashboard s'affiche (AD-01).
- [ ] Bannière « mode démo » visible (preuve que `NEXT_PUBLIC_DEMO_MODE=true` est pris en compte).
- [ ] Fenêtre à 1440 px, mode clair, FR.
- [ ] Onglet « captures de secours » (section 7) ouvert en arrière-plan, prêt.

---

## 3. Parcours CITOYEN (~7 min)

App : **citizen** (http://localhost:4001). NINA de démonstration : **18903102015042V** (14
chiffres + 1 lettre de contrôle). Toutes les routes sont préfixées `/fr`.

### Étape C1 — PC-01 Accueil (≈30 s)

- **Route :** `/fr`
- **Ce qu'on montre :** la page d'accueil du portail citoyen diaspora, le bloc de recherche / accès
  NINA, les bannières d'inclusion (multilingue, USSD).
- **Ce qu'on dit :** « Voici le point d'entrée du citoyen : un portail unique accessible depuis la
  diaspora, pensé multilingue et offline-first. »
- **Interaction :** survoler le sélecteur de langue pour montrer la liste des 8 langues (FR livré,
  BM vitrine, les 6 autres avec fallback FR).

### Étape C2 — Login (≈20 s)

- **Route :** `/fr/login`
- **Ce qu'on montre :** l'écran d'authentification.
- **Ce qu'on dit :** « En mode démo, l'authentification renvoie une session citoyen déterministe —
  aucune dépendance Keycloak. En production, c'est OIDC PKCE. »
- **Interaction :** se connecter (le mode mock valide immédiatement). Revenir vers la fiche NINA.

### Étape C3 — PC-02 Fiche NINA (≈1 min 30)

- **Route :** `/fr/nina/18903102015042V`
- **Ce qu'on montre :** la fiche d'identité reconstruite **déterministe** depuis le NINA (couture
  `@nina-aes/api-client`) : fil d'Ariane, emplacement photo (initiales), sections **Identité**,
  **Filiation** et **Localisation (codes NINA décodés)**, bannière « mode démo » assumée en tête.
- **Ce qu'on dit :** « La fiche affiche une identité structurée et lisible. Le même NINA produit
  toujours la même fiche — la démo est rejouable. Le profil complet avec photo et le **QR sécurisé
  (JWT RS256, jamais le NINA en clair)** seront émis par identity-service / document-service : la
  conception est tranchée, le branchement ne touche pas l'écran. »
- **Interaction :** dérouler les sections (Identité → Filiation → Localisation) ; pointer les
  boutons d'action (« Demander une correction », « Prendre un rendez-vous ») et le bouton **PDF
  désactivé** avec son infobulle (honnêteté : document-service non connecté).
- **Note honnête :** PC-02 a été enrichie en S2 — c'est une **fiche finie en lecture seule**. Aucun
  QR n'est affiché à l'écran (annoncé comme à venir) : **ne pas en chercher un**.

### Étape C4 — PC-03 Wizard de correction (≈1 min 30)

- **Route :** `/fr/nina/18903102015042V/correction`
- **Ce qu'on montre :** l'assistant **4 étapes** (stepper visuel) de correction d'une donnée d'état
  civil : (1) choix du champ parmi 9, (2) nouvelle valeur + motif, (3) **dépôt du justificatif en
  glisser-déposer** (validation format/taille PDF·JPG·PNG 5 Mo), (4) récapitulatif avant envoi.
- **Ce qu'on dit :** « La correction est un parcours guidé pour des usagers peu familiers du
  numérique (objectif O2). Le justificatif est validé localement ; en production il partira vers
  document-service. L'analyse d'incohérence par l'IA s'insère côté agent, sur la couture existante.
  »
- **Interaction :** choisir « Nom de famille » → étape 2 (saisir une valeur + un motif ≥ 10
  caractères pour débloquer « Suivant ») → étape 3 (**déposer un fichier** dans la zone d'upload) →
  étape 4 récapitulatif. La soumission **mock** redirige vers le tableau de bord (`?submitted=1`).
- **Note honnête :** le wizard est **complet de bout en bout en mock** (4 étapes + soumission
  simulée). Il n'y a **pas** de score IA dans cet écran — ne pas l'annoncer : l'IA est un chantier
  agent/backend.

### Étape C5 — PC-04 Prise de rendez-vous (≈1 min)

- **Route :** `/fr/appointments/new`
- **Ce qu'on montre :** la sélection d'un centre, d'une date et d'un créneau horaire.
- **Ce qu'on dit :** « Le citoyen peut planifier un passage physique au CTDEC. Les créneaux sont
  générés par la couche mock — en production, c'est le service rendez-vous (port 3008). »
- **Interaction :** choisir un centre, sélectionner un créneau (**groupés par jour**), saisir un
  motif, puis **« Confirmer le rendez-vous »** → une **modale de confirmation** s'ouvre avec le
  récapitulatif (centre, date, n° de file, référence) et un **QR de rendez-vous** (aperçu démo).
- **Note honnête :** PC-04 est fonctionnel en mock (créneaux groupés par jour + modale de
  confirmation avec QR de démo, S3/S8). Les créneaux restent générés en dur dans le composant —
  rapatriement derrière la couture `@nina-aes/api-client` à mentionner si le jury technique creuse.

### Étape C6 — PC-05 Dashboard / Suivi (≈1 min)

- **Route :** `/fr/dashboard`
- **Ce qu'on montre :** le tableau de bord citoyen — suivi des demandes de correction, statuts,
  historique.
- **Ce qu'on dit :** « Le citoyen suit l'état de ses demandes de bout en bout : transparence totale
  du cycle de vie d'une correction. »
- **Interaction :** ouvrir le détail d'une demande en cours pour montrer sa timeline de statuts.
- **Note honnête :** PC-05 est à ~70 % — c'est l'un des écrans les plus solides du parcours citoyen,
  à mettre en avant.

### Étape C7 — PC-06 Signalement avec token (≈1 min)

- **Route :** `/fr/signalement`
- **Ce qu'on montre :** le formulaire de signalement (anti-corruption / anomalie), et la délivrance
  d'un **token de suivi** permettant un suivi anonyme.
- **Ce qu'on dit :** « Un citoyen peut signaler une anomalie ou une sollicitation indue. Il reçoit
  un **token de suivi anonyme** : il garde la main sur son signalement sans s'exposer. C'est le
  maillon citoyen du dispositif anti-corruption SIGAC. »
- **Interaction :** soumettre un signalement mock et **afficher le token généré** ; expliquer qu'il
  servira à consulter l'avancement.
- **Note honnête :** PC-06 est à ~75 % — écran abouti, bonne note de fin pour le parcours citoyen.

---

## 4. Parcours ADMIN (~4 min)

App : **admin** (http://localhost:4002). Routes préfixées `/fr`. En mode démo, `NINA_AUTH_MODE=mock`
ouvre une session « agent CTDEC fictif ».

### Étape A0 — Login agent (≈15 s, optionnel)

- **Route :** `/fr/login`
- **Ce qu'on dit :** « Côté agent, même logique : session mock déterministe d'un agent CTDEC. »
- **Interaction :** se connecter, puis aller au dashboard.

### Étape A1 — AD-01 Dashboard agent (≈1 min)

- **Route :** `/fr/dashboard`
- **Ce qu'on montre :** la vue d'ensemble de l'agent — indicateurs, files de demandes, charges.
- **Ce qu'on dit :** « Voici le poste de travail de l'agent CTDEC : volumétrie des corrections,
  priorités, état du service. »
- **Interaction :** parcourir les cartes d'indicateurs.
- **Note honnête :** AD-01 est un écran vitrine, à montrer avec assurance. Les liens « Rendez-vous »
  et « Paramètres » mènent désormais à des **stubs honnêtes** « module en préparation » (S4) — plus
  aucun lien mort ; on peut les ouvrir brièvement pour prouver la cohérence de navigation.

### Étape A2 — AD-02 Gestion des corrections : approuver une ligne (≈1 min 30)

- **Route :** `/fr/corrections`
- **Ce qu'on montre :** la **DataTable** des demandes de correction (50+ lignes mock), tri/filtre,
  et le détail d'une demande.
- **Ce qu'on dit :** « L'agent traite ici les corrections. Chaque décision est tracée — en
  production, dans un journal d'audit immuable. »
- **Interaction :** ouvrir une ligne, puis **approuver la demande** ; montrer le changement de
  statut dans la table.
- **Note honnête :** AD-02 est à ~100 % — c'est l'écran le plus abouti de toute la plateforme. À
  utiliser comme pièce maîtresse.

### Étape A3 — AD-03 SIGAC : heatmap + scoring agents (≈1 min 15)

- **Route :** `/fr/sigac`
- **Ce qu'on montre :** le tableau de bord anti-corruption SIGAC — **heatmap** des zones à risque et
  **scoring des agents**.
- **Ce qu'on dit :** « SIGAC est le volet anti-corruption (objectif O5) : il croise les signaux
  faibles pour faire ressortir des zones et des comportements atypiques, sans jamais exposer de
  données personnelles. »
- **Interaction :** survoler une cellule de la heatmap pour afficher son détail ; pointer un agent
  dans le tableau de scoring.
- **Note honnête :** AD-03 est à ~95 % — écran fort, conclure le parcours admin dessus.

---

## 5. Gouvernance (~2 min)

App : **governance** (http://localhost:4003, `pnpm run dev:governance`).

Le portail gouvernance (SGOGT, objectif O6) est **bâti et démontrable** : shell institutionnel
(réemploi du squelette admin) + deux modules réels.

### 5.1 — GOV-01 Messagerie officielle signée

- Route : `http://localhost:4003/fr/messagerie`.
- À montrer : **layout 3 colonnes** (conversations · fil · détail) ; sélectionner la conversation «
  Ministère de l'Intérieur — Mali ».
- Point fort : chaque bulle porte un **badge « Signature Ed25519 · ✓ Vérifiée »** (signataire,
  empreinte, horodatage serveur) + **accusé de réception** (« ✓✓ … » ou « Non lu par le destinataire
  »). Pointer l'**archivage immuable 10 ans** (panneau de détail).
- Phrase : « La signature numérique remplace l'appel téléphonique sans trace : non-répudiation des
  ordres officiels. »

### 5.2 — GOV-02 Directives (Kanban)

- Route : `http://localhost:4003/fr/directives`.
- À montrer : **tableau Kanban 5 colonnes** (Brouillon → Envoyée → En cours → Terminée → Escaladée)
  ; **glisser-déposer** une carte d'une colonne à l'autre (interactif).
- Point fort : escalade visuelle — cartes en retard en **rouge (« ⚠ En retard »)**, escalade
  hiérarchique (**« ⤴ Escalade N+2 »**).
- Phrase : « Chaque directive a un état auditable ; l'escalade automatique (J+1/J+3/J+7) est le cœur
  du SGOGT. »

> Posture honnête : les deux autres sections de la sidebar (Performance, Rapports) sont des **stubs
> « module en préparation »** — la sidebar n'a **aucun lien mort**. La signature et l'horodatage
> serveur réels seront produits par `governance-service` (une **bannière « données de démonstration
> »** est visible à l'écran).

---

## 6. Synthèse — points forts techniques (~2 min)

À énoncer en clôture, sans démo supplémentaire (ou en pointant la fiche PC-02 déjà ouverte) :

- **QR sécurisé JWT RS256** — le QR ne contient plus le NINA en clair (faille corrigée).
- **Journal d'audit immuable** — chaînage Merkle append-only, garanti par trigger PostgreSQL.
- **Interopérabilité AES décentralisée** — mTLS + JWS Ed25519 ; aucune donnée personnelle ne
  traverse la frontière, seulement un booléen + un score (objectif O4).
- **Sécurité de fond** — secrets HashiCorp Vault, mots de passe Argon2id, MFA, RBAC 6 rôles
  (objectif O8).
- **Inclusion** — USSD `*123*NINA#` en 8 langues, files prioritaires pour publics vulnérables,
  offline-first (objectif O7).

> **Preuve d'intégration backend (option S9 uniquement).** Si et seulement si une capture Swagger de
> la gateway agrégée (http://localhost:3000/api/docs) a été produite en S9, la projeter 10 s pour
> matérialiser que l'architecture backend existe. Sinon, ne pas en parler — la démo mock-first se
> suffit.

---

## 7. PLAN B — captures de secours et incidents

### 7.1 Captures de secours pré-enregistrées

Dossier : `docs/soutenance/screenshots/{citizen,admin,governance,infra}/`.

Nommage réel des captures gelées (S9 — 23 fichiers ; inventaire complet dans `captions.md`) :

- `docs/soutenance/screenshots/citizen/pc-01-accueil-fr.png`
- `docs/soutenance/screenshots/citizen/pc-02-fiche-citoyen-fr.png`
- `docs/soutenance/screenshots/citizen/pc-03-correction-fr.png` + `pc-03-correction-upload-fr.png`
- `docs/soutenance/screenshots/citizen/pc-04-rendez-vous-fr.png` + `pc-04-confirmation-fr.png`
- `docs/soutenance/screenshots/citizen/pc-05-suivi-fr.png`
- `docs/soutenance/screenshots/citizen/pc-06-signalement-fr.png`
- `docs/soutenance/screenshots/admin/ad-01-dashboard-fr.png`
- `docs/soutenance/screenshots/admin/ad-02-corrections-fr.png`
- `docs/soutenance/screenshots/admin/ad-03-sigac-fr.png`
- `docs/soutenance/screenshots/governance/gov-01-messagerie-fr.png` + `gov-02-directives-fr.png`
- `docs/soutenance/screenshots/infra/swagger-gateway.png` (option, non gelée)

> Variantes : suffixe `-bm` pour la vitrine bambara (`pc-01-accueil-bm.png`), `-mobile` pour le
> responsive (`pc-01-accueil-mobile-fr.png`, `pc-05-suivi-mobile-fr.png`).

> ✅ **Fait (S9) :** les 23 captures réelles ont été produites en 1440 px / HD ×2 / mode clair / FR
> (indicateur dev masqué) et déposées aux chemins ci-dessus — le PLAN B est **opérationnel**.

### 7.2 Que faire si un écran plante

1. **Ne pas s'excuser longuement ni rester bloqué.** Énoncer calmement : « Je bascule sur la capture
   de référence. »
2. Ouvrir la **capture de secours** correspondante (onglet/visionneuse déjà préparé) et continuer le
   récit sur l'image.
3. Si c'est une simple erreur de compilation App Router (cold start), **rafraîchir une fois** ;
   au-delà, basculer sur la capture sans insister.
4. Reprendre le fil à l'étape suivante du script — ne jamais relancer toute la démo en live.

### 7.3 Reset entre deux démos

- Se **déconnecter** des deux apps (citizen et admin) pour repartir d'une session propre.
- Revenir aux routes de départ : `/fr` (citizen) et `/fr/dashboard` (admin).
- Comme les données sont **mock déterministes**, aucun état serveur à purger : un rafraîchissement
  suffit à remettre les tables et scores à leur valeur initiale.
- Refermer les drawers/modals laissés ouverts.

---

## 8. Checklist 48 h avant

- [ ] `git pull` sur la branche de démo ; arbre de travail propre.
- [ ] `pnpm install` exécuté **à froid** et terminé sans erreur (Windows : install manuel).
- [ ] `apps/citizen/.env.local` et `apps/admin/.env.local` présents (mode mock —
      `NINA_AUTH_MODE=mock` par défaut côté citizen, `NEXT_PUBLIC_DEMO_MODE=true`).
- [ ] `apps/admin/.env.local` présent avec les mêmes trois variables de démo.
- [ ] `pnpm run dev:citizen` (4001) et `pnpm run dev:admin` (4002) lancés ; **passage complet à
      blanc** du script citoyen + admin (purge les cold starts).
- [ ] Les **23 captures de secours** à jour dans `docs/soutenance/screenshots/` (cf. 7.1),
      indicateur dev masqué.
- [ ] Wizard PC-03 vérifié : les **4 étapes** s'enchaînent et le **dépôt de justificatif** (glisser-
      déposer) accepte un PDF/JPG/PNG.
- [ ] **Governance** lancée et chaude (`pnpm run dev:governance`, port 4003) : `/fr/messagerie` et
      `/fr/directives` pré-ouvertes.
- [ ] Navigateur réglé : fenêtre 1440 px, zoom 100 %, mode clair, langue FR, favoris masqués.
- [ ] Batterie chargée + chargeur ; **adaptateur HDMI / USB-C** testé sur un écran externe.

## 9. Checklist jour J (T-30 min)

- [ ] Ordinateur sur **secteur** (ne pas dépendre de la batterie) ; chargeur branché.
- [ ] **Adaptateur HDMI** branché et image projetée vérifiée (résolution, mode clair lisible au
      vidéoprojecteur).
- [ ] **Mode avion / Wi-Fi** : la démo est mock-first et ne nécessite **aucun réseau** — couper les
      notifications, mettre en mode « Ne pas déranger ».
- [ ] Les **deux serveurs** dev tournent et affichent « Ready » ; onglets citizen (`/fr`) et admin
      (`/fr/dashboard`) pré-chargés.
- [ ] **Premier passage à blanc** effectué (aucune page en cold start au moment du jury).
- [ ] **Captures de secours** ouvertes dans une visionneuse en arrière-plan (PLAN B armé).
- [ ] Sessions **déconnectées** / réinitialisées (état de départ propre — cf. 7.3).
- [ ] Bannières « mode démo » visibles → preuve du mode mock assumé.
- [ ] Verrouillage de veille **désactivé** (l'écran ne doit pas s'éteindre pendant l'exposé).
- [ ] Téléphone en silencieux ; chronomètre prêt (cible : ~14 min de démo).
