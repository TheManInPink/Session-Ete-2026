# Contenu des diapositives — Soutenance NINA-AES

> Trame texte des slides pour une présentation de 20 à 30 minutes (~28-30 diapositives). Une section
> `####` = une diapositive : titre, 3-6 puces de contenu, puis une note `[Visuel: ...]`. Public :
> jury mixte (professeur tuteur technique + tuteurs CTDEC institutionnels + jury académique UQAR
> généraliste). Le discours doit fonctionner pour les trois. Démo sur **données mock déterministes**
> : choix assumé (reproductibilité, zéro flakiness). Document vivant v1 : les blocs 🔲 marquent les
> visuels ou chiffres qui dépendent d'un livrable futur.

---

## Section 1 — Ouverture et contexte (≈ 3 min)

#### Slide 1 — Garde

- **NINA-AES Platform** — Système sécurisé de gestion d'identité numérique pour l'Alliance des États
  du Sahel (Mali, Burkina Faso, Niger).
- Projet de fin d'études — Université du Québec à Rimouski (UQAR).
- Étudiant : _[Nom]_ — Tuteur : _[Nom du professeur tuteur]_.
- Date de soutenance : _[JJ août 2026]_.
- Mention : exercice académique, blueprint architectural pour le CTDEC — pas un produit commercial.

[Visuel: page de garde sobre, logo UQAR, titre, carte stylisée des trois pays de l'AES en
filigrane.]

---

#### Slide 2 — Le problème humain : une identité, des exclusions

- Programme **RAVEC** (Recensement Administratif à Vocation d'État Civil) au Mali depuis 2009 : la
  base du NINA, mais entachée d'erreurs de saisie et de doublons.
- **Fiasco électoral 2013** : des millions d'électeurs potentiellement exclus des listes, **~9 000
  cartes non tracées** — une rupture de confiance entre le citoyen et son identité légale.
- Une erreur dans un nom ou une date n'est pas qu'un détail administratif : elle peut priver une
  personne de vote, de scolarisation, de soins, de droits.
- Le numéro NINA est aujourd'hui un **point de friction** plutôt qu'un service rendu au citoyen.

[Visuel: photo d'un guichet d'état civil + chiffre marquant « ~9 000 cartes non tracées » mis en
exergue.]

---

#### Slide 3 — Une faille concrète : le QR du NINA en clair

- Les dispositifs de vérification existants exposent le **numéro NINA en clair** dans le QR code de
  la pièce d'identité.
- Conséquence : quiconque scanne le document lit l'identifiant national directement — usurpation,
  traçage, fuite de données triviaux.
- C'est le symptôme d'un problème plus large : sécurité pensée _après coup_, pas _par conception_.
- **Notre point de départ** : remettre la sécurité et la dignité du citoyen au centre, dès
  l'architecture.

[Visuel: comparaison côte à côte — QR « avant » (NINA lisible en clair) vs QR « après » (jeton
signé, illisible sans clé).]

---

#### Slide 4 — Réponse : 9 objectifs (O1 → O9)

- **O1** Moderniser et sécuriser le NINA — **O2** IA de détection et correction d'erreurs.
- **O3** Portail citoyen (y compris diaspora) — **O4** Interopérabilité AES transfrontalière.
- **O5** Anti-corruption (SIGAC) — **O6** Gouvernance traçable (SGOGT).
- **O7** Accessibilité des publics vulnérables (USSD, bornes, agents) — **O8** Sécurité (mTLS, JWT,
  Merkle, audit).
- **O9** Conformité et souveraineté numérique (RGPD-like, données non délocalisées).

[Visuel: grille 3×3 des 9 objectifs, chaque objectif avec une icône ; pastille couleur selon
l'avancement.]

---

## Section 2 — Architecture et vision système (≈ 5 min)

#### Slide 5 — Vue d'ensemble de l'architecture

- **3 applications Next.js (App Router)** : _citizen_ (portail public), _admin_ (agents CTDEC),
  _governance_ (pilotage institutionnel).
- **15 répertoires de services** backend : 11 services cœur + une API Gateway + 3 services différés
  (biometric, enrollment, USSD).
- **Couture de données** : `@nina-aes/api-client` — une interface unique, deux implémentations
  interchangeables (mock aujourd'hui, API réelle demain).
- **14 packages partagés** (UI, i18n, types, sécurité, observabilité…) pour mutualiser le code entre
  apps et services.
- Monorepo **Turborepo + pnpm** : builds parallèles, cache, frontière nette entre apps, services et
  packages.

[Visuel: diagramme C4 niveau conteneurs — 3 apps en haut, API Gateway, bus d'événements, 11 services
cœur, stack d'infrastructure en bas.]

---

#### Slide 6 — Les 11 services cœur et la stack

- Services cœur : **identity, auth, ai, document, notification, interop, audit, appointment,
  anticorruption, governance, vulnerability** + **api-gateway**.
- Deux services IA en **Python/FastAPI** (ai, anticorruption) ; le reste en **NestJS/TypeScript**.
- Stack d'infrastructure lançable en local (`pnpm run docker:up`) : **PostgreSQL, Redis, RabbitMQ,
  MinIO, Elasticsearch, Keycloak, HashiCorp Vault**.
- Sécurité au bord : authentification à l'API Gateway, propagation d'un contexte utilisateur signé
  (JWS), rate-limiting Redis, Swagger agrégé.
- 100 % logiciel libre, auto-hébergeable — aucune dépendance SaaS étrangère sensible.

[Visuel: schéma de la stack en couches (apps → gateway → services → bus → données/infra), logos des
briques open-source.]

---

#### Slide 7 — Choix assumé : démo MOCK-FIRST

- La démonstration tourne sur des **données mock déterministes** — **aucun backend branché en
  direct**.
- Pourquoi : **reproductibilité totale**, zéro flakiness réseau, parcours identique à chaque
  répétition devant le jury.
- L'architecture « en couture » (`@nina-aes/api-client`) rend le mock et l'API réelle **strictement
  interchangeables** : brancher le backend = changer d'implémentation, pas réécrire l'UI.
- Variables de mode démo par app : `NINA_AUTH_MODE=mock` (défaut côté citizen) et
  `NEXT_PUBLIC_DEMO_MODE=true`.
- C'est une **décision d'ingénierie**, documentée et défendable — pas une lacune masquée.

[Visuel: schéma de la « couture » — interface api-client au centre, deux flèches vers deux boîtes :
« impl. MOCK (démo) » et « impl. API réelle (post-remise) ».]

---

## Section 3 — Focus IA (O2) (≈ 3 min)

#### Slide 8 — IA : détecter l'erreur avant qu'elle n'exclue

- Objectif O2 : repérer automatiquement les anomalies d'un enregistrement NINA (fautes de saisie,
  doublons probables, incohérences).
- Approche : comparaison de chaînes **floue (fuzzy matching)** — distance d'édition + similarité
  phonétique + n-grammes — pour rapprocher des variantes orthographiques d'un même nom.
- Sortie : un **score de confiance** ; sous le seuil, on ne corrige jamais en silence — on **propose
  au citoyen** une correction à valider.
- Service `ai` en **FastAPI** ; pipeline structuré et modèle entraînable opt-in (XGBoost), dataset
  synthétique déterministe pour la démo.
- Principe directeur : l'IA **assiste** la décision humaine, elle ne se substitue jamais à l'agent
  ni au citoyen.

[Visuel: exemple « Fatoumata Diallo » vs « Fatumata Dialo » → score de similarité + bandeau «
doublon possible, correction proposée ».]

🔲 **À COMPLÉTER (S9)** : score IA réel mesuré (précision/rappel sur le dataset synthétique). À
obtenir en exécutant l'évaluation du service `ai` et en figeant les chiffres dans `metrics.md`.

---

## Section 4 — Sécurité et souveraineté (O8, O9) (≈ 4 min)

#### Slide 9 — Sécurité par conception : 4 piliers

- **QR sécurisé en JWT RS256** : le QR ne contient plus le NINA en clair mais un **jeton signé**
  vérifiable sans exposer l'identifiant — correction directe de la faille du slide 3.
- **Journal d'audit immuable** : log _append-only_ **chaîné façon Merkle**, garanti par un _trigger_
  PostgreSQL — toute altération rétroactive devient détectable.
- **Interopérabilité AES sans fuite** : **mTLS + signatures JWS Ed25519**, et surtout **aucune
  donnée personnelle transmise** entre pays — seulement un booléen et un score.
- **Secrets et identités** : **HashiCorp Vault**, mots de passe **Argon2id**, **MFA**, **RBAC à 6
  rôles**.

[Visuel: 4 cartes (QR JWT / Audit Merkle / Interop mTLS+Ed25519 / Vault) avec une icône cadenas par
carte.]

---

#### Slide 10 — Audit immuable : la confiance par la preuve

- Chaque action sensible (consultation, correction, validation) est journalisée de façon
  **inviolable**.
- Le **chaînage Merkle** lie chaque entrée à la précédente : modifier un enregistrement passé casse
  la chaîne et se voit.
- Le caractère _append-only_ est imposé **au niveau base de données** (trigger PostgreSQL), pas
  seulement applicatif — donc non contournable par l'application.
- Réponse directe à la leçon de 2013 : on ne peut plus « perdre la trace » de 9 000 documents sans
  que cela laisse une preuve.

[Visuel: schéma d'une chaîne de blocs d'audit (hash N-1 → entrée N → hash N), avec un bloc altéré en
rouge qui rompt la chaîne.]

---

#### Slide 11 — Souveraineté numérique : zéro dépendance étrangère sensible

- Toute la stack est **open-source et auto-hébergeable** : aucune donnée d'état civil ne transite
  par un cloud étranger.
- Les services IA tournent **localement**, pas sur une API tierce ; les secrets restent dans Vault
  sous contrôle du CTDEC.
- L'interopérabilité AES est **décentralisée** : chaque pays garde ses données, n'échange qu'un
  verdict signé (booléen + score), jamais l'identité.
- Conformité O9 : la souveraineté n'est pas un slogan, c'est une **discipline d'architecture** —
  chaque dépendance est comptée, justifiée, remplaçable.

[Visuel: carte de l'AES avec 3 nœuds nationaux reliés par des liens mTLS ; mention « données =
restent au pays ».]

---

## Section 5 — Inclusion numérique (O7) (≈ 3 min)

#### Slide 12 — Inclusion : ne laisser personne hors du système

- **USSD `*123*NINA#`** : consultation depuis un téléphone basique, **sans smartphone ni internet**
  — pensé pour les zones rurales et les publics non connectés.
- **8 langues prévues** : français, bambara, soninké, peul, tamasheq, haoussa, mooré, djerma —
  l'identité dans la langue du citoyen.
- **Files prioritaires** pour les publics vulnérables et logique **offline-first** : le service
  rendu ne dépend pas d'une connexion permanente.
- Plusieurs canaux d'accès : portail web, agents au guichet, bornes, USSD — l'inclusion est un
  objectif d'architecture, pas une option.

[Visuel: maquette d'un écran USSD texte `*123*NINA#` à côté d'un smartphone affichant le portail
citoyen.]

---

#### Slide 13 — État réel de l'i18n : posture honnête

- **Français : 100 %** — la langue de la démo, soignée de bout en bout.
- **Bambara : langue vitrine** — démontre que l'architecture i18n fonctionne réellement en langue
  locale (accueil PC-01 livré ; extension aux autres écrans post-remise).
- **6 autres langues** : structure i18n en place + **repli automatique vers le français** — le
  squelette est prêt, le contenu se complète ensuite.
- Message au jury : _« FR livré, BM vitrine, 6 autres = architecture prête + fallback FR »_ — on
  montre la mécanique, on assume le reste à faire.

[Visuel: page d'accueil PC-01 en FR puis en BM (`pc-01-accueil-fr.png` / `pc-01-accueil-bm.png`),
avec une étiquette « fallback FR » sur les autres langues.]

✅ **Fait (S8-S9)** : vitrine bambara livrée et capturée sur PC-01 (`pc-01-accueil-bm.png`). La
traduction de la fiche PC-02 reste une amélioration post-remise (voir « Note bambara » de
`captions.md`).

---

## Section 6 — Démonstration (renvoi captures) (≈ 5-6 min)

#### Slide 14 — Démo — Portail citoyen (1/3)

- Parcours public sur l'app _citizen_ (port 4001), entièrement en mock déterministe.
- **PC-01 Accueil** → **Login** → **PC-02 Fiche NINA** du citoyen de démonstration
  `18903102015042V`.
- Sur la fiche : affichage de l'identité, du **QR sécurisé (jeton signé)** et de l'éventuelle
  **anomalie détectée par l'IA**.
- Format NINA expliqué : **14 chiffres + 1 lettre de contrôle**.

[Visuel: captures `screenshots/citizen/` — pc-01-accueil-fr, pc-02-fiche-citoyen-fr.]

✅ Captures HD régénérées en S9 ; **PC-02 enrichi** (avatar, fil d'Ariane, sections
Identité/Localisation) en S2 ; **vitrine bambara** sur PC-01.

---

#### Slide 15 — Démo — Correction et services citoyen (2/3)

- **PC-03 Wizard de correction** : le citoyen soumet une demande guidée à partir de l'anomalie
  signalée par l'IA.
- **PC-04 Rendez-vous** : prise de rendez-vous en agence (créneaux mock déterministes).
- **PC-05 Dashboard / Suivi** : suivi de l'état des demandes ; **PC-06 Signalement** : canal citoyen
  vers le dispositif anti-corruption.
- Chaque action serait, en production, **journalisée dans l'audit Merkle** (montrée côté admin au
  slide suivant).

[Visuel: captures `screenshots/citizen/` — pc-03-correction-fr, pc-04-rendezvous-fr,
pc-05-dashboard-fr, pc-06-signalement-fr.]

✅ Captures HD ; **PC-03** (zone d'upload, S2), **PC-04** (créneaux groupés + modale de confirmation
avec QR, S3) et **PC-05** (timeline animée, S3) livrés.

---

#### Slide 16 — Démo — Console agent et SIGAC (3/3)

- Bascule sur l'app _admin_ (port 4002) : le poste de travail de l'agent CTDEC.
- **AD-01 Dashboard** (vue d'ensemble) → **AD-02 Gestion des corrections** (DataTable de 50+ lignes
  mock, validation des demandes citoyens).
- **AD-03 SIGAC** : tableau anti-corruption — **heatmap géographique + scoring des agents** pour
  détecter les comportements à risque (O5).
- Boucle complète démontrée : _citoyen signale → IA détecte → agent valide → tout est tracé_.

[Visuel: captures `screenshots/admin/` — ad-01-dashboard-fr, ad-02-corrections-fr, ad-03-sigac-fr.]

✅ Captures HD ; liens « Rendez-vous » / « Paramètres » **stubbés en S4** (« module en préparation
») — **zéro lien mort** dans la console.

---

#### Slide 17 — Démo — Gouvernance (SGOGT) et plan B

- App _governance_ (port 4003), bâtie sur le squelette de l'admin — deux modules **réels** pour
  l'objectif O6 :
- **GOV-01 Messagerie officielle signée** : layout 3 colonnes, bulles avec **badge signature Ed25519
  vérifiée** + accusés de réception horodatés ; archivage immuable 10 ans.
- **GOV-02 Directives (Kanban drag-and-drop)** : 5 colonnes, escalade visuelle (retard en rouge, «
  Escalade N+x »).
- Périmètre **assumé** : Performance et Rapports restent des **stubs honnêtes** (« module en
  préparation ») — la sidebar n'a aucun lien mort.
- **Plan B démo** : tout en mock déterministe, aucune dépendance réseau ; captures de secours dans
  `docs/soutenance/screenshots/`. Option « preuve d'intégration » : capture **Swagger de l'API
  Gateway** si le backend est lancé.

[Visuel: captures `screenshots/governance/` — gov-01-messagerie-fr, gov-02-directives-fr.]

✅ **Bâti en S5-S7** : shell (S5) + GOV-01 messagerie (S6) + GOV-02 Kanban (S7), avec revue
adversariale appliquée.

---

## Section 7 — Qualité, métriques et limites (≈ 3 min)

#### Slide 18 — Métriques (renvoi `metrics.md`)

- Périmètre livré : **3 apps** Next.js, **15 répertoires de services**, **14 packages partagés**,
  **27 documents** + ADRs.
- Sécurité opérationnelle dans la conception : QR JWT RS256, audit Merkle, Vault, RBAC 6 rôles,
  interop mTLS + Ed25519.
- Les chiffres détaillés (couverture de tests, latences, score IA, scans sécurité) sont consolidés
  dans `docs/soutenance/metrics.md`.
- Principe de rédaction : **ne jamais inventer un chiffre** — un nombre figuré ici est mesuré, sinon
  il est marqué « à compléter ».

[Visuel: aperçu du tableau de `metrics.md` (catégories Code / Tests / Performance / Sécurité /
Souveraineté).]

🔲 **À COMPLÉTER (S9)** : couverture de tests mesurée, latences p95 (k6), score IA, scans
Trivy/Semgrep — figés dans `metrics.md` à J-3.

---

#### Slide 19 — Limites et périmètre assumé

- **Backend non branché dans la démo** : choix MOCK-FIRST pour la reproductibilité — l'architecture
  en couture le rend branchable sans réécriture.
- **Gouvernance** : shell + 2 modules **réels** (messagerie signée Ed25519, directives en Kanban) ;
  Performance/Rapports assumés en stubs — priorité donnée d'abord à citizen et admin.
- **i18n : FR livré, BM vitrine, 6 langues en repli FR** : la mécanique est prouvée, le contenu se
  complète.
- **Biométrie et services différés** (biometric, enrollment, USSD complet) : hors périmètre de la
  démo, spécifiés pour une équipe institutionnelle future.
- Posture : ces limites sont **documentées et défendues**, pas dissimulées — une faiblesse assumée
  vaut mieux qu'une force fictive.

[Visuel: tableau « Livré / MVP / Spécifié pour la suite » sur trois colonnes.]

---

#### Slide 20 — Travail seul + IA assistée : la part personnelle

- Projet mené **seul**, sous l'encadrement du professeur tuteur ; Claude Code utilisé comme
  assistant, selon les conventions documentées (`AGENTS.md`, `CLAUDE.md`).
- Apport personnel : cahier des charges et objectifs O1-O9, décisions d'architecture (ADRs), choix
  de stack, priorisation, revue de code et tests.
- L'IA est un **accélérateur**, pas un auteur : sans la vision système, elle produit des fragments
  disjoints — la cohérence d'ensemble est la contribution propre.
- Chaque suggestion est validée, testée et committée manuellement — traçabilité assurée par
  l'historique Git.

[Visuel: schéma « Vision système (moi) → orchestration → IA assistante → code/doc → revue → commit
».]

---

## Section 8 — Perspectives et clôture (≈ 2 min)

#### Slide 21 — Roadmap post-remise : brancher, pas réécrire

- **Étape 1** — Substituer l'implémentation API réelle au mock derrière `@nina-aes/api-client`
  (aucune modification de l'UI grâce à la couture).
- **Étape 2** — Rapatrier les derniers mocks encore en dur dans les composants vers la couche
  api-client.
- **Étape 3** — Activer progressivement les services cœur (identity, auth, audit, ai) sur la stack
  Docker / K8s on-premise CTDEC.
- **Étape 4** — Finaliser i18n (8 langues), enrichir gouvernance, intégrer les services différés
  (USSD, enrollment, biométrie).
- Message clé : l'architecture est conçue pour le **branchement**, pas pour la réécriture — la dette
  de transition est minimisée par conception.

[Visuel: frise en 4 jalons « Mock → API réelle → Services on-premise → Extension fonctionnelle ».]

---

#### Slide 22 — Conditions d'un passage en production réelle

- Un **cadre juridique** AES/Mali stabilisé sur l'identité numérique, la biométrie et les élections.
- Une **convention institutionnelle** CTDEC–DNEC–UQAR–AES formalisée.
- Une **équipe dédiée** (plusieurs ETP sur 12 mois) pour porter le blueprint en système exploité.
- Un **audit de sécurité indépendant** (pen-test) et un accès aux **données réelles** (INSTAT) en
  lieu et place des mocks.

[Visuel: checklist « Conditions de mise en production » (juridique / institutionnel / équipe / audit
/ données).]

---

#### Slide 23 — Conclusion

- Le projet répond à un **problème humain réel** — l'exclusion par l'erreur d'identité — par une
  **architecture sécurisée, souveraine et inclusive**.
- Trois apports défendables : la **sécurité par conception** (QR signé, audit Merkle, interop sans
  fuite), l'**inclusion** (USSD, multilingue, offline-first), la **souveraineté** (zéro dépendance
  étrangère sensible).
- Un choix d'ingénierie assumé — **MOCK-FIRST + couture échangeable** — qui rend la démo
  reproductible et le branchement futur sans réécriture.
- Au-delà du code : un **blueprint complet et honnête** sur ce qui est livré, ce qui est MVP, et ce
  qui reste à faire pour le CTDEC.

[Visuel: une slide de synthèse — les 3 mots « Sécurité · Inclusion · Souveraineté » + le NINA de
démo barré/sécurisé.]

---

#### Slide 24 — Merci — Questions

- Merci au jury, au professeur tuteur et aux interlocuteurs du CTDEC.
- _« Je reformule chaque question avant d'y répondre, et je dis franchement quand je ne sais pas. »_
- Renvois utiles : `metrics.md` (chiffres), `demo-script.md` (déroulé), `qa-anticipated.md`
  (questions anticipées), `retrospective.md` (bilan honnête).
- Contact / dépôt : _[lien GitHub ou e-mail]_.

[Visuel: slide « Questions » épurée, coordonnées + QR (sécurisé !) vers le dépôt du projet.]

---

## Annexes de réserve (slides de secours pour la Q&A)

#### Slide A1 — Réserve : détail du flux de correction

- Citoyen consulte sa fiche (PC-02) → IA signale une anomalie avec score de confiance.
- Citoyen lance le wizard (PC-03) → demande de correction soumise.
- Agent (AD-02) examine, valide ou refuse → enregistrement mis à jour.
- Action journalisée dans l'audit Merkle → preuve immuable de bout en bout.

[Visuel: diagramme de séquence citoyen → IA → agent → audit.]

---

#### Slide A2 — Réserve : pourquoi pas une base unique AES centralisée ?

- Centraliser les données d'identité des 3 pays = point unique de défaillance + perte de
  souveraineté nationale.
- Notre choix : **décentralisation** — chaque pays garde sa base, l'interop n'échange qu'un
  **verdict signé** (booléen + score), jamais l'identité.
- mTLS + JWS Ed25519 garantissent l'authenticité des échanges sans exposer les personnes.
- Conforme à la logique AES : coopération sans abandon de souveraineté.

[Visuel: deux scénarios opposés — « base centrale unique » (barré) vs « 3 nœuds souverains fédérés »
(validé).]

---

#### Slide A3 — Réserve : le rôle exact de l'IA (cadrage attendu du jury)

- L'IA **ne décide pas** d'une correction : elle **signale** une anomalie probable avec un score.
- Sous le seuil de confiance : proposition au citoyen, jamais de modification silencieuse.
- Aucune donnée personnelle envoyée à un service tiers : l'IA tourne **localement**.
- Modèle entraînable opt-in (XGBoost) sur dataset synthétique déterministe — la démo n'expose pas de
  données réelles.

[Visuel: encadré « Ce que l'IA fait / ne fait pas » en deux colonnes.]

🔲 **À COMPLÉTER (S9)** : seuil de confiance retenu + métriques d'évaluation réelles, à figer depuis
le service `ai`.
