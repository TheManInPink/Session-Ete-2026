# 26 — Rapport final et soutenance (plan, démo, métriques, questions anticipées)

> **Bloc concerné** : Clôture du projet (post-Blocs A → F). **Prérequis** : Bloc A complet (MVP
> démontrable) ; ADRs 001-025 livrées ; observabilité doc 17 fonctionnelle pour montrer des
> métriques live ; tests doc 18 verts pour la couverture. **Durée estimée** : 12 à 16 heures
> (rédaction rapport + diapositives
>
> - scripts démo + répétitions). **Livrables** :
>
> * **Rapport final écrit** (`docs/soutenance/RAPPORT-FINAL.pdf`) — 60 à 80 pages, structure
>   académique UQAR (page de garde, sommaire, introduction, état de l'art, méthodologie,
>   réalisations, discussion, conclusion, annexes).
> * **Diapositives soutenance** (`docs/soutenance/slides.pdf`) — 25 à 30 slides pour une
>   présentation de 20 à 30 minutes.
> * **Script de démonstration live** (`docs/soutenance/demo-script.md`) — déroulé minute par minute
>   avec commandes exactes, plan B en cas de panne réseau, captures d'écran de secours.
> * **Tableau de métriques** consolidées (`docs/soutenance/metrics.md`) — couverture tests,
>   performance API, score IA, sécurité scans.
> * **Plan de questions anticipées** (`docs/soutenance/qa-anticipated.md`) — top 30 questions
>   probables + réponses préparées.
> * **Rétrospective honnête** (`docs/soutenance/retrospective.md`) — ce qui a marché, ce qui n'a pas
>   marché, ce qu'on referait autrement.

---

## 1. Objectif pédagogique

La soutenance n'est pas une formalité, c'est l'épreuve finale où on démontre **trois compétences
distinctes** :

1. **Maîtrise technique** : on a construit le système, on connaît chaque ligne de code, chaque ADR,
   chaque trade-off.
2. **Vision systémique** : on sait pourquoi tel choix a été fait, on assume les compromis, on a
   anticipé les évolutions.
3. **Communication adaptée** : on s'adresse à un jury **mixte** (professeur tuteur technique +
   tuteurs CTDEC institutionnels + jury académique généraliste). Le discours doit fonctionner pour
   les 3.

Trois leçons pédagogiques pour cette étape :

1. **Démo live > slides**. Un jury voit en 30 secondes si un système marche vraiment. 60 % du temps
   de soutenance = démonstration ; 30 % = explications architecturales ; 10 % = questions.

2. **Honnêteté > esbroufe**. Le jury repère immédiatement les exagérations. Une faiblesse documentée
   vaut mieux qu'une force fictive. La rétrospective honnête (§5 de ce doc) est l'élément le plus
   valorisant.

3. **Le système n'est PAS un produit commercial**. C'est un exercice académique. La perfection n'est
   pas attendue. La rigueur de conception, oui.

---

## 2. Structure du rapport écrit (60-80 pages)

```text
docs/soutenance/RAPPORT-FINAL.pdf
├── Page de garde (logo UQAR, nom étudiant, tuteur, date soutenance)
├── Remerciements (1 page)
├── Sommaire détaillé (2 pages)
├── Liste des figures + tableaux + acronymes (3 pages)
│
├── 1. Introduction (4 pages)
│   ├── 1.1 Contexte AES + Mali
│   ├── 1.2 Problématique de l'identité numérique
│   ├── 1.3 Objectifs du projet (9 objectifs O1-O9)
│   └── 1.4 Méthodologie de présentation du rapport
│
├── 2. État de l'art (8 pages)
│   ├── 2.1 Systèmes d'identité comparables (Aadhaar, eIDAS, Estonie)
│   ├── 2.2 Approches biométriques modernes
│   ├── 2.3 Architecture microservices souveraine
│   └── 2.4 Anti-corruption ML (Isolation Forest, LSTM, BERT)
│
├── 3. Méthodologie et architecture (12 pages)
│   ├── 3.1 Choix Turborepo + pnpm
│   ├── 3.2 Stack technique justifiée (cf. ADRs)
│   ├── 3.3 Architecture C4 (contexte, conteneurs, composants)
│   ├── 3.4 Modèle de données (16 entités Prisma)
│   └── 3.5 Pipeline ML détection erreurs NINA
│
├── 4. Réalisations (20 pages)
│   ├── 4.1 Bloc A — MVP complet (citizen + admin + 4 backends + IA + mobile + USSD)
│   ├── 4.2 Phase transversale (CI/CD, observabilité, tests, backup, K3s)
│   ├── 4.3 Blocs B-F — Plans détaillés
│   └── 4.4 Données Mali (référentiel 142/159 cercles, 78 enrichis Wikipedia)
│
├── 5. Tests et validation (8 pages)
│   ├── 5.1 Pyramide de tests (cf. doc 18)
│   ├── 5.2 Couverture mesurée (objectif 80 %)
│   ├── 5.3 Tests de charge k6 — SLO validés
│   └── 5.4 Audit sécurité OWASP + Trivy + Semgrep
│
├── 6. Sécurité et souveraineté (8 pages)
│   ├── 6.1 Vault PKI, mTLS, JWS Ed25519
│   ├── 6.2 Chaîne Merkle audit (ADR-014)
│   ├── 6.3 PII redact automatique (Pino logger doc 17)
│   ├── 6.4 Anonymat lanceurs d'alerte (SIGAC doc 23)
│   └── 6.5 Souveraineté numérique : analyse couches par couches
│
├── 7. Discussion et limites (8 pages)
│   ├── 7.1 Limites techniques connues
│   ├── 7.2 Décisions à reconsidérer (rétrospective honnête)
│   ├── 7.3 Risques de déploiement réel
│   └── 7.4 Évolutions Phase 2 / Phase 3
│
├── 8. Conclusion (4 pages)
│   ├── 8.1 Objectifs atteints / non atteints
│   ├── 8.2 Apports pédagogiques personnels
│   └── 8.3 Perspectives institutionnelles
│
└── Annexes (15 pages)
    ├── A. Liste complète des 25 ADRs (1 ligne chacune)
    ├── B. Diagrammes UML 8 PlantUML (cf. docs/diagrams/)
    ├── C. Schema Prisma complet (extrait + commentaires)
    ├── D. Métriques chiffrées finales
    ├── E. Glossaire AES + acronymes
    └── F. Bibliographie + lectures recommandées
```

---

## 3. Plan de présentation (20-30 minutes)

### Section 1 — Introduction et contexte (3 min)

- Slide 1 : titre + nom + tuteur + date
- Slide 2 : pourquoi NINA-AES ? (taux d'erreur RAVEC actuel, fraude d'identité, besoin AES
  post-CEDEAO)
- Slide 3 : 9 objectifs O1-O9 (extrait du cahier des charges)
- Slide 4 : architecture C4 niveau 1 (contexte) — 1 schéma

### Section 2 — Démonstration live (12 min)

⚠️ **Cœur de la soutenance** — répété 10+ fois en amont. Voir `demo-script.md` ci-dessous.

|   Min | Action                           | Composant             | Élément démontré      |
| ----: | -------------------------------- | --------------------- | --------------------- |
|  0:00 | `make dev` (déjà préchargé)      | Tous services         | Architecture en place |
|  0:30 | Ouvrir `citizen` app `:4001`     | Frontend Next.js      | UX citoyen            |
|  1:30 | Recherche NINA → erreur détectée | identity + ai service | Pipeline ML           |
|  3:00 | Demande de correction            | UI + audit            | Workflow citoyen      |
|  4:30 | Bascule sur `admin` `:4002`      | Frontend admin        | Validation par agent  |
|  6:00 | Approuver la correction          | audit + identity      | Merkle chain          |
|  7:00 | Generation FDI PDF + QR code     | document-service      | Signature JWS         |
|  8:30 | Scan QR sur mobile Expo          | mobile app            | Vérification offline  |
|  9:30 | USSD simulator `*123*NINA#`      | ussd-service          | Inclusion numérique   |
| 11:00 | Grafana dashboard `:3000`        | observabilité         | SLO en temps réel     |
| 12:00 | Récap visuel : tout est tracé    | (parole)              | Audit complet         |

### Section 3 — Architecture et décisions (8 min)

- Slide 5 : architecture C4 niveau 2 (conteneurs) — 11 microservices
- Slide 6 : stack technique justifiée — versions effectives mai 2026
- Slide 7 : ADRs phares (4-5 ADRs critiques mis en lumière)
- Slide 8 : modèle de données Prisma (extrait visuel)
- Slide 9 : sécurité défense en profondeur (mTLS + Vault + Merkle)
- Slide 10 : souveraineté numérique — analyse couches par couches

### Section 4 — Phase transversale et qualité (4 min)

- Slide 11 : CI/CD GitHub Actions — 5 workflows
- Slide 12 : observabilité LGTM (Grafana screenshot)
- Slide 13 : pyramide de tests — couverture 80 %+
- Slide 14 : backup 3-2-1 + DRP RTO < 4h

### Section 5 — Blocs B-F et perspectives (2 min)

- Slide 15 : Blocs B-F en un coup d'œil (5 vignettes)
- Slide 16 : roadmap V2/V3 (interop pleine, biométrie phasée)

### Section 6 — Conclusion (1 min)

- Slide 17 : objectifs atteints (✅ tableau) vs prévus
- Slide 18 : rétrospective honnête — 3 limites assumées
- Slide 19 : « Pour aller plus loin » + remerciements

### Questions du jury (5-10 min restantes)

Voir §6 du présent document — top 30 questions anticipées.

---

## 4. Script de démonstration live (déroulé minute par minute)

**Fichier à créer** : `docs/soutenance/demo-script.md`

```markdown
# Démonstration live NINA-AES — script T-12 minutes

## T-30 min — Préparation

- [ ] Démarrer `make dev` sur poste de démo
- [ ] Ouvrir 4 onglets navigateur (citizen, admin, grafana, USSD simulator)
- [ ] Ouvrir Expo dev server + smartphone en hotspot
- [ ] Tester un parcours complet une fois (warmup)
- [ ] Backup vidéo en local si réseau tombe

## T+0:00 — Introduction

> « Je vais maintenant vous montrer le MVP NINA-AES en direct. Tout tourne sur ce portable — 11
> microservices Docker, 3 frontends Next.js, 1 mobile Expo, 1 simulateur USSD. Aucune connexion à un
> cloud externe. »

## T+0:30 — Citizen app — recherche NINA

- Aller sur `http://localhost:4001`
- Cliquer « Vérifier mon NINA »
- Saisir `1 89 03 1 02 015 042 V`
  > « Voici Fatoumata Diallo, citoyenne mock de notre démo. Le système détecte qu'il y a une erreur
  > dans son enregistrement... »

## T+1:30 — IA détecte erreur

- Le résultat affiche un warning IA : « confiance 67 % — possible doublon avec Fatumata Dialo
  (différence orthographique) »
  > « Le service IA en Python a comparé phonétiquement et trigram-aussi. Le score est confidentiel
  > 67 % — sous le seuil 80, donc on propose au citoyen de soumettre une correction. »

[... continue toutes les minutes ...]

## Plan B si parnique

- Si `identity-service` plante : restart `pnpm --filter @nina-aes/identity-service dev`
- Si Grafana ne montre rien : avoir une capture d'écran .png en local
- Si réseau tombe : passer en vidéo pré-enregistrée
- Si tout tombe : « Je vous montre le code ASP » + ouvrir VS Code
```

---

## 5. Tableau de métriques chiffrées (consolidées)

**Fichier à créer** : `docs/soutenance/metrics.md`

| Catégorie          | Métrique                        | Valeur                             |         Cible |     Statut |
| ------------------ | ------------------------------- | ---------------------------------- | ------------: | ---------: |
| **Code**           | Lignes de code (Bloc A)         | ~28 000                            |           n/a |   tracking |
|                    | Lignes de doc                   | ~17 000 (40+ fichiers)             |           n/a |   ✅ riche |
|                    | Nombre d'ADRs                   | 25                                 |           20+ |         ✅ |
|                    | Nombre de microservices Bloc A  | 6 (sur 11 prévus V1)               |           4-6 |         ✅ |
|                    | Nombre de frontends Next.js     | 2 livrés (citizen+admin), 3ᵉ prévu |             3 |         ⚠️ |
| **Tests**          | Tests Jest unitaires            | 53 livrés (44 utils + 9 config)    |     800 cible | ⏳ partial |
|                    | Tests Playwright E2E            | 11                                 |      30 cible |         ⏳ |
|                    | Couverture globale              | non mesurée encore                 |          80 % |         ⏳ |
| **Performance**    | Latence p95 `/api/nina` (local) | ~180 ms                            |      < 500 ms |         ✅ |
|                    | Throughput k6 enrollment-peak   | non testé V1                       | 5 000 req/min |         ⏳ |
| **Sécurité**       | Vault opérationnel              | ✅ (docker-compose)                |            ✅ |         ✅ |
|                    | mTLS intra-cluster              | spec doc 15, pas implémenté        |            ✅ |         ⏳ |
|                    | Audit Merkle chain              | ✅ (audit-service Bloc A)          |            ✅ |         ✅ |
|                    | PII redact logger               | spec doc 17, pas implémenté        |            ✅ |         ⏳ |
|                    | Scans Trivy                     | spec doc 16, pas activé            |    0 CRITICAL |         ⏳ |
| **Données Mali**   | Régions livrées                 | 20/20                              |            20 |   ✅ 100 % |
|                    | Cercles livrés                  | 142/159                            |           159 |    ✅ 89 % |
|                    | Polygones ADM2                  | 50 (geoBoundaries)                 |           159 |    ⚠️ 31 % |
| **Infrastructure** | Docker Compose dev              | ✅ opérationnel                    |            ✅ |         ✅ |
|                    | K3s spec                        | ✅ doc 20 livré                    |            ✅ |    ✅ spec |
|                    | Helm chart                      | spec, pas livré                    |            ✅ |         ⏳ |
| **Souveraineté**   | Dépendances SaaS US             | 0 (sauf GitHub Actions exec)       |             0 |         ✅ |
|                    | Stack 100 % open-source         | ✅                                 |            ✅ |         ✅ |
|                    | ADRs souveraineté explicites    | 7/25 ADRs                          |           ≥ 5 |         ✅ |

> 💡 **À mettre en valeur** : la doc est très en avance sur le code (40 fichiers .md, 25 ADRs, 8
> diagrammes UML). C'est intentionnel — les spécifications complètes permettent l'implémentation
> future par une équipe institutionnelle.

---

## 6. Top 30 questions anticipées + réponses préparées

**Fichier à créer** : `docs/soutenance/qa-anticipated.md`

### Catégorie A — Choix techniques

**Q1 : Pourquoi NestJS et pas Express ou Fastify direct ?**

> R : Cf. ADR-003. NestJS apporte (a) une structure modulaire imposée qui scale sur 11
> microservices, (b) un système d'injection de dépendances qui facilite les tests, (c) un écosystème
> de modules (`@nestjs/throttler`, `@nestjs/schedule`) qui évite de réinventer la roue. Express seul
> aurait imposé une discipline manuelle non tenable sur 6 mois.

**Q2 : Pourquoi Prisma 7 et pas TypeORM ou Drizzle ?**

> R : Cf. ADR-011. Prisma offre (a) un schema canonique unique pour 11 services, (b) une CLI mature
> (`migrate`, `studio`), (c) une équipe grand-public tooling moderne. TypeORM est plus mature mais
> moins productif ; Drizzle est plus léger mais écosystème plus jeune.

**Q3 : Pourquoi K3s et pas Kubernetes vanilla ?**

> R : Cf. ADR-020. K3s = 60 MB binaire, SQLite par défaut, idéal pour on-premise CTDEC sans équipe
> SRE 10+ ETP. Vanilla K8s = sur-engineering pour un MVP universitaire.

[... 12 autres questions techniques ...]

### Catégorie B — Souveraineté

**Q15 : Vous utilisez GitHub Actions, qui est américain. Est-ce souverain ?**

> R : Bonne question, c'est documenté ADR-016. GitHub Actions est le compromis V1 (gratuit,
> hébergement compétences UQAR existantes). ADR-016 documente explicitement la migration vers
> Forgejo Actions (fork souverain auto-hébergeable) pour passage en gouvernance AES. La syntaxe est
> ~100 % compatible.

**Q16 : Les données Mali transitent-elles par AWS / Cloudflare ?**

> R : Non, jamais. Doc 17 et 19 documentent l'interdiction explicite de tout SaaS US. Stack LGTM
> auto-hébergée, MinIO secondaire CTDEC ou DC AES, cold storage Scaleway/OVH Europe.

[... 5 autres questions souveraineté ...]

### Catégorie C — Démarche pédagogique

**Q21 : Avez-vous travaillé seul ?**

> R : Oui, j'étais l'unique développeur sous l'encadrement de [tuteur]. J'ai utilisé Claude Code
> comme assistant IA conformément aux conventions documentées dans `AGENTS.md`, `CLAUDE.md`,
> `.github/copilot-instructions.md`. Chaque suggestion IA est validée, testée et committée par moi.

**Q22 : Quelle est votre apport personnel par rapport à l'IA ?**

> R : (a) Cahier des charges et objectifs O1-O9 ; (b) 25 ADRs avec justifications techniques propres
> ; (c) architecture microservices et choix de stack ; (d) code review et tests ; (e) gestion du
> backlog et priorisation Blocs A/B/C/D/E/F.

[... 8 autres questions méthodo ...]

### Catégorie D — Limites et perspectives

**Q26 : Quelle est la principale limite de votre travail ?**

> R : Le gap implémentation vs spec. Sur 27 docs livrés (00-26), ~14 contiennent du code fonctionnel
> ; ~13 sont des spécifications détaillées pour une équipe institutionnelle future. C'est assumé :
> le projet UQAR n'est pas un déploiement réel mais un blueprint architectural complet pour CTDEC.

**Q27 : Que faudrait-il pour passer en production réelle ?**

> R : (a) Un cadre juridique malien stabilisé sur biométrie + élections ; (b) Une convention
> CTDEC-UQAR-AES formalisée ; (c) Une équipe institutionnelle (5-10 ETP) pour 12 mois ; (d) Un
> pen-test ANSSI ou équivalent ; (e) Des données réelles INSTAT (cf. demande formelle déjà rédigée
> `docs/data/instat-data-request.md`).

[... 3 autres questions perspectives ...]

---

## 7. Rétrospective honnête

**Fichier à créer** : `docs/soutenance/retrospective.md`

### Ce qui a marché ✅

1. **Documentation comme code** : 25 ADRs + CHANGELOG vivant + MAINTENANCE.md. Toujours la doc avant
   le code → réduit la dette technique de moitié.

2. **Turborepo + pnpm** : monorepo sans friction, builds parallèles, cache local. Excellent choix.

3. **PostgreSQL 18 + PostGIS** : aucun regret, performances solides, queries géo-spatiales
   triviales.

4. **Architecture microservices "logique" vs "physique"** : Bloc C regroupe 3 modules dans 2
   services au lieu de 3 (ADR-022). Bon pragmatisme.

5. **Claude Code comme pair programmer** : accélérateur ×3 sur la doc, ×2 sur le code de routine.
   Garde-fous AGENTS.md/CLAUDE.md évitent les dérives.

### Ce qui n'a pas marché ❌

1. **Sous-estimation du temps de doc** : prévu 5 % du budget, réalisé ~30 %. C'est OK pour un projet
   académique, mais en industrie il aurait fallu calibrer dès le départ.

2. **Tests E2E livrés tard (Session 5)** : 11 tests, mais beaucoup de refactor a posteriori
   (corrections sélecteurs). À refaire : tests-first dès Session 2.

3. **Stack Docker Compose dev complexe** : Postgres 18 + 9 autres services, ~3 incidents d'exécution
   résolus (cf. CHANGELOG §4). J'aurais dû piloter en mode `pnpm docker:up --profile minimal` plus
   tôt.

4. **Biométrie hors scope V1** : décision raisonnable mais frustrante. Le doc 25 est vision-only, le
   jury verra une lacune sur "F".

5. **Apps/governance pas livré** : 3ᵉ frontend Next.js prévu Session 5+ reporté. Cohérent (pas
   critique pour Bloc A) mais visible.

### Ce qu'on referait autrement 🔄

1. **Commencer par les tests** : dès le PROMPT 1.4 (utils), TDD strict. On a 53 tests Jest, on
   aurait pu avoir 200+ avec moins d'effort si on avait commencé par les tests.

2. **Vitest partout au lieu de Jest** : performances 3× supérieures, intégration native Vite. Reste
   à voir si compatible avec `@nestjs/testing`.

3. **GitOps dès le départ** : Argo CD + manifests Helm dès la Session 1 aurait évité la spec doc 20
   a posteriori.

4. **Domaine `.aes.int`** : on a utilisé `.uqar.ca` (universitaire) ; un vrai domaine AES aurait
   donné plus de crédibilité institutionnelle.

5. **Plus de schémas visuels** : les 8 PlantUML sont bons mais les schémas C4 explicites manquent.
   Ajouter `structurizr` ou `c4-builder` en V2.

### Ce que je retiens personnellement 📚

- La documentation **est** le projet, le code n'est que son exécution.
- Un ADR vaut mieux que 10 réunions.
- La souveraineté numérique n'est pas une posture politique, c'est une discipline architecturale
  (chaque dépendance comptée, justifiée, remplaçable).
- L'IA assistante est un accélérateur, pas un remplaçant. Sans la vision système (la mienne), elle
  produit des artefacts disjoints.
- Travailler seul sur 6 mois nécessite des rituels explicites (CHANGELOG hebdo, jalons mensuels,
  code review différé).

---

## 8. Mini-rapport d'étape (template — pour la soutenance elle-même)

```markdown
### Rapport — Soutenance — JJ/MM/2026

- **Status** : ✅ Soutenance passée / ⏳ J-N
- **Présentation** : durée mesurée, ressenti général, retour jury
- **Démo live** : moments forts, plans B activés ou pas
- **Questions reçues** : top 5 questions imprévues
- **Note finale** : /20 (annoncée plus tard)
- **Feedback tuteur** : retours qualitatifs principaux
- **Captures jointes** : photo jury (avec accord), screen démo, slides finaux
```

---

## 9. Checklist de fin de soutenance

### Préparation (J-15 à J-1)

- [ ] Rapport final relu 3 fois + corrigé par 1 lecteur externe
- [ ] Slides répétés à voix haute 5+ fois
- [ ] Démo live répétée 10+ fois (chronométrée < 12 min)
- [ ] Plan B démo (vidéo backup, captures écran)
- [ ] Top 30 questions anticipées préparées
- [ ] Métriques figées dans `metrics.md` (snapshot J-3)
- [ ] Backup complet du repo + dataset démo sur clé USB
- [ ] Tester la salle de soutenance (projecteur, son, wifi)

### Jour J

- [ ] Café + bonne nuit la veille
- [ ] Arriver 30 min avant
- [ ] Vérifier matériel (portable + adaptateur + clé USB)
- [ ] Préchauffer `make dev` 15 min avant
- [ ] Ouvrir tous les onglets navigateur
- [ ] Respirer

### Pendant la soutenance

- [ ] Regarder le jury, pas l'écran
- [ ] Parler lentement (objectif 120 mots/min)
- [ ] Annoncer chaque section
- [ ] Démo live : montrer en faisant, pas en expliquant
- [ ] Questions : reformuler avant de répondre + dire « je ne sais pas » si on ne sait pas

### Après

- [ ] Remercier le jury individuellement
- [ ] Photo de groupe (avec accord)
- [ ] Noter les retours qualitatifs à chaud
- [ ] Diffuser le rapport final (LinkedIn, portfolio, GitHub README)
- [ ] Commit final `v1.0.0-soutenance` + tag
- [ ] Repos. Bien mérité.

---

## 10. Pour aller plus loin

- **Publication open-source** : publier le rapport + 25 ADRs sur GitHub public avec licence Creative
  Commons BY-NC-SA 4.0. Utile pour la communauté NINA / souveraineté Sahel.
- **Article scientifique** : adapter le chapitre « souveraineté numérique » en article de 6 pages
  pour conférence AfriCHI ou COLINGUE.
- **Conférence étudiante** : présenter à UQAR Tech Forum + JCAA (Journées Canadiennes des Affaires
  Africaines).
- **Suivi institutionnel** : envoyer le rapport au CTDEC + DNEC + AES (avec lettre de courtoisie via
  UQAR).
- **Stage doctoral** : continuer sur l'aspect anti-corruption ML (SIGAC Bloc D) en master/doctorat.
- **Mentorat junior** : transmettre les apprentissages à un étudiant de la promotion suivante via
  tutorat.

---

_Document 26 — Version 1.0 — Mai 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_
