# Légendes des captures d'écran — Dossier de soutenance NINA-AES

Ce fichier regroupe les **légendes prêtes à coller** sous chaque capture d'écran du dossier de
soutenance. Chaque légende tient en 1 à 2 phrases et est accompagnée d'un _point à souligner au
jury_ (professeur tuteur technique, tuteurs CTDEC institutionnels, jury académique UQAR
généraliste).

Les captures illustrent une démonstration **MOCK-FIRST** : l'interface tourne sur des **données mock
déterministes**, sans backend branché. Ce choix est **assumé** — il garantit la reproductibilité de
la démo et l'absence d'aléa (_flakiness_) le jour de la soutenance. L'architecture « en couture »
(`@nina-aes/api-client`) permet de substituer l'API réelle aux mocks après la remise sans toucher
aux écrans.

## Convention de nommage

Les fichiers sont rangés sous `docs/soutenance/screenshots/{citizen,admin,governance,infra}/` et
nommés selon le motif :

`<code-écran>-<libellé-court>-<langue>.png`

- `<code-écran>` : identifiant de la maquette (`pc-01`, `ad-02`, `gov-01`, …).
- `<libellé-court>` : mot-clé descriptif (`accueil`, `fiche-citoyen`, `sigac`, …).
- `<langue>` : suffixe `-fr` (français, version de référence) ou `-bm` (bambara, version vitrine).

Exemples : `pc-02-fiche-citoyen-fr.png`, `pc-02-fiche-citoyen-bm.png`, `ad-01-dashboard-fr.png`.

## Statut des captures

- ✅ **S1 (juin 2026) — première passe réalisée et vérifiée visuellement** : les 11 captures
  `citizen` + `admin` (FR, plus PC-01 et PC-02 en vitrine bambara) sont dans
  `docs/soutenance/screenshots/{citizen,admin}/`.
- Le symbole **🔲** marque une capture **non encore disponible** : elle dépend d'une **preuve
  d'intégration optionnelle** (Swagger de l'API Gateway / Grafana, à produire si le backend est
  lancé). La légende reste rédigée à l'avance pour être collée dès la capture obtenue.

### Régénérer les captures (reproductible, mock-first)

Chromium est déjà installé et Playwright démarre lui-même citizen (4001), admin (4002) et governance
(4003) en `NINA_AUTH_MODE=mock`, capture chaque route en **1440 px plein écran, HD ×2**
(`deviceScaleFactor: 2`), puis écrit dans `docs/soutenance/screenshots/` :

```
CAPTURE=1 pnpm exec playwright test e2e/citizen/capture.spec.ts e2e/admin/capture.spec.ts e2e/governance/capture.spec.ts
```

> Observations traitées : PC-02 enrichi (avatar + sections) en **S2 ✅** ; bambara PC-01 complété
> (label/aide « NINA nimɔrɔ »…) et bouton « Ɲini » corrigé en **S8 ✅**.
>
> **S8 — passe accessibilité / responsive** : audit multi-agents (citizen + admin) → correctifs
> citizen (focus de la modale RDV, `aria-label` des créneaux avec date, cibles tactiles agrandies,
> anneau de focus) + sidebar admin en dégradation mobile propre (`hidden lg:flex`). Le **mobile
> admin complet** (drawer + DataTable en cartes) est assumé **hors-scope** (console desktop destinée
> aux agents). Captures mobile ajoutées : `pc-01-accueil-mobile-fr.png`,
> `pc-05-suivi-mobile-fr.png`.
>
> **S9 — captures finales (gel)** : indicateur dev Next.js masqué (`devIndicators: false` dans les 3
> `next.config`) et **toutes les captures régénérées en HD ×2** (~2880 px de large ; mobile 780 px).
> Jeu de **23 captures gelé** et prêt à insérer dans le rapport.

---

## App citizen (portail citoyen — port 4001)

| Fichier capture                          | Écran                         | Légende (1-2 phrases)                                                                                                                                               | Point à souligner au jury                                                                                                                                                               |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `citizen/pc-01-accueil-fr.png`           | PC-01 — Accueil               | Page d'accueil du portail citoyen : recherche d'une fiche NINA et points d'entrée vers les services en ligne (correction, rendez-vous, suivi, signalement).         | Porte d'entrée diaspora (O3) ; design accessible, multilingue par conception.                                                                                                           |
| `citizen/pc-02-fiche-citoyen-fr.png`     | PC-02 — Fiche NINA            | Fiche du NINA de démonstration `18903102015042V` : fil d'Ariane, emplacement photo, sections **Identité** et **Localisation (codes NINA)**, bannière « mode démo ». | Lecture claire et honnête : les données structurelles sont réelles ; profil complet (nom, photo, parents) et **QR JWT RS256** arriveront avec identity-service / document-service (O8). |
| `citizen/pc-03-correction-fr.png`        | PC-03 — Wizard (étape 1/4)    | Assistant pas-à-pas : choix du champ à corriger.                                                                                                                    | Parcours guidé pour usagers peu familiers du numérique (O2).                                                                                                                            |
| `citizen/pc-03-correction-upload-fr.png` | PC-03 — Wizard (étape 3/4)    | Zone de dépôt du justificatif : drag & drop, validation format/taille (PDF/JPG/PNG, 5 Mo).                                                                          | Composant **UploadZone** mock — fichier validé localement mais non envoyé (document-service non connecté).                                                                              |
| `citizen/pc-04-rendez-vous-fr.png`       | PC-04 — Prise de rendez-vous  | Sélection du centre + créneaux **groupés par jour** + motif de la visite.                                                                                           | Files **prioritaires pour publics vulnérables** (O7) ; créneaux servis par la couture de données.                                                                                       |
| `citizen/pc-04-confirmation-fr.png`      | PC-04 — Confirmation (modale) | Modale de confirmation : récapitulatif (centre, date, n° de file, référence, NINA) + **QR de rendez-vous**.                                                         | Le QR affiché est un **aperçu démo** ; le code signé (JWT RS256) sera émis par document-service (O8).                                                                                   |
| `citizen/pc-05-suivi-fr.png`             | PC-05 — Suivi (timeline)      | Chaque correction affiche une **timeline verticale** (soumise → analyse IA → revue → décision → notification), étape courante animée.                               | Transparence du parcours usager ; traçabilité bout-en-bout côté citoyen.                                                                                                                |
| `citizen/pc-06-signalement-fr.png`       | PC-06 — Signalement           | Formulaire de signalement d'une anomalie ou d'un acte de corruption présumé, anonymisable.                                                                          | Canal citoyen alimentant le dispositif **anti-corruption SIGAC** (O5) ; complète la surveillance côté agents.                                                                           |
| `citizen/pc-01-accueil-bm.png`           | PC-01 — Accueil (bambara)     | Version **vitrine bambara** de la page d'accueil, démontrant l'internationalisation au-delà du français.                                                            | Inclusion linguistique (O7) : FR livré à 100 %, **BM en vitrine**, 6 autres langues = architecture i18n prête + fallback FR.                                                            |
| `citizen/pc-02-fiche-citoyen-bm.png`     | PC-02 — Fiche NINA (bambara)  | Version **vitrine bambara** de la fiche NINA, prouvant que les écrans clés sont localisables sans refonte.                                                          | La localisation est gérée par `@nina-aes/i18n` ; ajouter une langue = fournir des traductions, pas réécrire l'UI.                                                                       |

---

## App admin (back-office agents — port 4002)

| Fichier capture                  | Écran                           | Légende (1-2 phrases)                                                                                                     | Point à souligner au jury                                                                                    |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `admin/ad-01-dashboard-fr.png`   | AD-01 — Dashboard agent         | Tableau de bord opérationnel de l'agent CTDEC : indicateurs clés, files de traitement et alertes du jour.                 | Vue de pilotage métier ; cohérente avec le portail citoyen (même socle de design).                           |
| `admin/ad-02-corrections-fr.png` | AD-02 — Gestion des corrections | Table de traitement des demandes de correction (plus de 50 lignes mock) : tri, filtrage et actions de validation/rejet.   | Outillage agent complet ; instruit la boucle de correction côté back-office en miroir de PC-03.              |
| `admin/ad-03-sigac-fr.png`       | AD-03 — SIGAC anti-corruption   | Console **SIGAC** : carte de chaleur des zones à risque et scoring de probité des agents.                                 | Cœur du dispositif **anti-corruption** (O5) ; croise signalements citoyens et indicateurs d'activité agents. |
| `admin/ad-appointments-fr.png`   | AD — Rendez-vous (stub)         | Emplacement du module de gestion des rendez-vous agent — « module en préparation » (se connectera à appointment-service). | Lien de navigation présent et honnête : aucun cul-de-sac dans la console.                                    |
| `admin/ad-settings-fr.png`       | AD — Paramètres                 | Profil agent en lecture seule (nom, matricule, centre) + préférences ; bandeau « édition à venir » (auth-service).        | Console cohérente : **tous les liens de la sidebar mènent à un écran**.                                      |

---

## App governance (gouvernance — port 4003)

| Fichier capture                       | Écran                          | Légende (1-2 phrases)                                                                                                                                                                                      | Point à souligner au jury                                                                                                            |
| ------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `governance/gov-login-fr.png`         | Connexion gouvernance          | Page de connexion du portail (accès réservé aux institutions habilitées de l'AES).                                                                                                                         | Même socle d'auth que citizen/admin (Keycloak OIDC), branche « gouvernementale ».                                                    |
| `governance/gov-01-messagerie-fr.png` | GOV-01 — Messagerie officielle | Messagerie 3 colonnes (conversations · fil signé · détail) : bulles avec **badge signature Ed25519 vérifiée**, accusés de réception horodatés, classification (Routine/Urgent/Critique) et pièces jointes. | Gouvernance traçable (O6) : la signature = **non-répudiation** des ordres officiels ; archivage immuable 10 ans (MinIO Object Lock). |
| `governance/gov-02-directives-fr.png` | GOV-02 — Directives (Kanban)   | Tableau **Kanban drag-and-drop** (5 colonnes Brouillon→Envoyée→En cours→Terminée→Escaladée) : cartes avec émetteur→exécutant, échéance (**rouge si en retard**), priorité et **escalade N+x**.             | Pilotage SGOGT (O6) : chaque directive a un état auditable ; le glisser-déposer simule le changement d'état.                         |
| `governance/gov-performance-fr.png`   | Performance (stub)             | Performance institutionnelle — « module en préparation » (se connectera à governance-service).                                                                                                             | Aucun lien mort : les 4 sections de la sidebar mènent à un écran.                                                                    |
| `governance/gov-rapports-fr.png`      | Rapports (stub)                | Rapports mensuels de gouvernance — « module en préparation ».                                                                                                                                              | Périmètre SGOGT matérialisé dès le shell.                                                                                            |

> **Governance (S5-S7)** : shell bâti par réemploi du squelette admin (sidebar, layout authentifié,
> proxy i18n, auth mock « haut fonctionnaire »), puis **GOV-01 messagerie signée** (S6) et **GOV-02
> directives Kanban** (S7) **livrés**. Restent en stubs honnêtes : Performance et Rapports.

---

## Infra (preuve d'intégration — optionnel)

| Fichier capture                | Écran                   | Légende (1-2 phrases)                                                                                                                                | Point à souligner au jury                                                                                                                                                         |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/swagger-gateway.png` 🔲 | Swagger — API Gateway   | 🔲 Documentation **Swagger agrégée** de l'API Gateway (`localhost:3000/api/docs`), preuve que les services backend exposent réellement des contrats. | Montre que le backend existe et est outillé (O8/O9), sans contredire le choix mock-first de la démo. _À COMPLÉTER (option, S9 max) : démarrer la stack via `pnpm run docker:up`._ |
| `infra/grafana.png` 🔲         | Grafana — Observabilité | 🔲 Tableau de bord **Grafana** illustrant la couche d'observabilité (métriques/logs) de la plateforme.                                               | Maturité d'exploitation ; complète l'argument de sécurité et de conformité. _À COMPLÉTER (option, S9 max) : capture issue de la stack Docker d'observabilité._                    |

> Ces captures d'infrastructure sont **optionnelles** et ne servent qu'à matérialiser une « preuve
> d'intégration ». Elles ne remettent pas en cause la démonstration mock-first, qui reste le mode
> nominal présenté au jury.

---

## Récapitulatif des statuts

| Catégorie  | Captures prêtes (mock)                                           | Captures 🔲 à compléter      |
| ---------- | ---------------------------------------------------------------- | ---------------------------- |
| citizen    | 9 FR + 2 mobile (responsive) + 2 vitrine BM                      | —                            |
| admin      | 5 FR (AD-01/02/03 + stubs Rendez-vous & Paramètres)              | —                            |
| governance | 5 FR (GOV-01 messagerie + GOV-02 Kanban réels + login + 2 stubs) | —                            |
| infra      | —                                                                | Swagger, Grafana (option S9) |
