# 26 — Rapport final et soutenance (plan, démo, métriques, questions anticipées)

> **Bloc concerné** : Clôture du projet (post-Blocs A → F). **Prérequis** : Bloc A complet (MVP
> démontrable) ; ADRs 001-034 livrées (34 ADRs) ; observabilité doc 17 fonctionnelle pour montrer
> des métriques live ; tests doc 18 verts pour la couverture. **Durée estimée** : 12 à 16 heures
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
│   └── 5.4 Audit sécurité : bilan OWASP réel (honnête) ; Trivy + Semgrep = conçus, Phase 2
│
├── 6. Sécurité et souveraineté (8 pages)
│   ├── 6.1 Vault PKI (acquis) ; mTLS strict (conçu, Phase 2) ; signature QR = RS256 Transit
│   │        (Vault Transit ne supporte PAS Ed25519, ADR-026/034) ; scellement audit = Ed25519
│   │        in-process @noble/ed25519 (doc 09)
│   ├── 6.2 Audit hash-chain SHA-256 (ADR-007 ; ADR-014 ancrage tiers) — PAS un arbre de Merkle
│   ├── 6.3 Redaction PII des logs (conçu doc 17, implémentation Phase 2)
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
    ├── A. Liste complète des 34 ADRs (ADR-001 à ADR-034, 1 ligne chacune)
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
|  6:00 | Approuver la correction          | audit + identity      | Hash-chain SHA-256    |
|  7:00 | Generation FDI PDF + QR code     | document-service      | Signature QR RS256    |
|  8:30 | Scan QR sur mobile Expo          | mobile app            | Vérification offline  |
|  9:30 | USSD simulator `*123*NINA#`      | ussd-service          | Inclusion numérique   |
| 11:00 | Grafana dashboard `:3000`        | observabilité         | SLO en temps réel     |
| 12:00 | Récap visuel : tout est tracé    | (parole)              | Audit complet         |

> ⚠️ **Données de démo = FICTIVES.** Le NINA, les noms et les scores IA affichés proviennent d'un
> jeu de données de démonstration local (`seed`). Aucune donnée réelle de citoyen malien n'est
> manipulée. À annoncer au jury en ouverture de démo. Rappel canon : « Audit complet » =
> **hash-chain SHA-256** (ADR-007), opposable seulement après ancrage tiers (Phase 2) ; signature QR
> = **RS256** (Vault Transit).

### Section 3 — Architecture et décisions (8 min)

- Slide 5 : architecture C4 niveau 2 (conteneurs) — 11 microservices
- Slide 6 : stack technique justifiée — versions effectives mai 2026
- Slide 7 : ADRs phares (4-5 ADRs critiques mis en lumière)
- Slide 8 : modèle de données Prisma (extrait visuel)
- Slide 9 : sécurité — **distinguer l'acquis du conçu**. Acquis et démontrable : Vault PKI
  opérationnel + audit hash-chain SHA-256 (ADR-007, PAS un arbre de Merkle ; ancrage tiers
  OCLEI/Vérificateur Général = Phase 2). Conçu et spécifié mais **implémentation Phase 2** : mTLS
  strict intra-cluster (ADR-034 / doc 15), redaction PII des logs (doc 17), scans Trivy CI (doc 16),
  packaging Helm (doc 20). ⚠️ Ne PAS présenter ces 4 derniers comme une « défense en profondeur »
  déjà en place — ce serait incohérent avec le tableau de métriques §5 (colonnes « Spécifié » vs «
  Implémenté »).
- Slide 10 : souveraineté numérique — analyse couches par couches

### Section 4 — Phase transversale et qualité (4 min)

- Slide 11 : CI/CD GitHub Actions — 5 workflows
- Slide 12 : observabilité LGTM (Grafana screenshot)
- Slide 13 : pyramide de tests — 53 tests Jest + 11 E2E livrés ; **couverture non encore mesurée**
  (cible 80 %, ⏳ Phase 2 — ne pas annoncer « 80 % atteint »)
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

**Fichier existant** : `docs/soutenance/demo-script.md` (le bloc ci-dessous est le gabarit de
référence ; le script livré doit garder l'avertissement « données FICTIVES »).

```markdown
# Démonstration live NINA-AES — script T-12 minutes

## T-30 min — Préparation

- [ ] Démarrer `make dev` sur poste de démo
- [ ] Ouvrir 4 onglets navigateur (citizen, admin, grafana, USSD simulator)
- [ ] Ouvrir Expo dev server + smartphone en hotspot
- [ ] Tester un parcours complet une fois (warmup)
- [ ] Backup vidéo en local si réseau tombe

> ⚠️ **AVERTISSEMENT DONNÉES** : toutes les données affichées pendant la démo (NINA, noms, dates,
> scores IA) sont **FICTIVES** — jeu de données de démonstration (`seed` local). Aucune donnée
> réelle de citoyen malien n'est utilisée. À énoncer explicitement au jury avant la première
> recherche.

## T+0:00 — Introduction

> « Je vais maintenant vous montrer le MVP NINA-AES en direct. Tout tourne sur ce portable — 11
> microservices Docker, 3 frontends Next.js, 1 mobile Expo, 1 simulateur USSD. Aucune connexion à un
> cloud externe. **Toutes les données que vous allez voir sont fictives, issues d'un jeu de
> démonstration local.** »

## T+0:30 — Citizen app — recherche NINA

- Aller sur `http://localhost:4001`
- Cliquer « Vérifier mon NINA »
- Saisir `1 89 03 1 02 015 042 V` _(NINA FICTIF de démo)_
  > « Voici Fatoumata Diallo, citoyenne **FICTIVE** de notre jeu de démonstration (aucun citoyen
  > réel). Le système détecte qu'il y a une erreur dans son enregistrement... »

## T+1:30 — IA détecte erreur

- Le résultat affiche un warning IA : « confiance 67 % — possible doublon avec Fatumata Dialo
  (différence orthographique) » _(exemple FICTIF)_
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

**Fichier existant** : `docs/soutenance/metrics.md` — ⚠️ **drift connu à corriger avant soutenance**
: le fichier livré n'intègre PAS encore le tableau « Spécifié vs Implémenté » ci-dessous et emploie
encore le terme **« Merkle »** (lignes ~211 et ~229 : « Journal d'audit immuable chaîné Merkle ») là
où le canon impose **hash-chain SHA-256, PAS un arbre de Merkle** (ADR-007). Tant que `metrics.md`
et `slides-content.md` n'ont pas été réalignés, ne pas affirmer que l'incohérence « défense en
profondeur » est levée : elle ne l'est que dans le présent document. Aligner les trois fichiers (ce
doc 26 + `metrics.md` + `slides-content.md`) avant de figer le snapshot J-3.

> ⚠️ **Lecture honnête (cf. règle soutenance)** : pour la sécurité, on distingue explicitement deux
> colonnes — **« Spécifié »** (conçu, documenté dans un doc/ADR) et **« Implémenté »** (réellement
> présent dans le code et démontrable). Un contrôle peut être à 100 % spécifié et à 0 % implémenté :
> il doit alors être présenté au jury comme « conçu, Phase 2 » et **jamais** comme une protection
> acquise. Cette distinction ne lèvera l'incohérence du discours « défense en profondeur » que
> lorsque `metrics.md` et la slide 9 (`slides-content.md`) auront été réalignés sur le tableau
> ci-dessous (voir drift connu).

### 5.1 Métriques générales

| Catégorie          | Métrique                        | Valeur                             |         Cible |     Statut |
| ------------------ | ------------------------------- | ---------------------------------- | ------------: | ---------: |
| **Code**           | Lignes de code (Bloc A)         | ~28 000                            |           n/a |   tracking |
|                    | Lignes de doc                   | ~17 000 (40+ fichiers)             |           n/a |   ✅ riche |
|                    | Nombre d'ADRs                   | 34 (ADR-001 à ADR-034)             |           20+ |         ✅ |
|                    | Nombre de microservices Bloc A  | 6 (sur 11 prévus V1)               |           4-6 |         ✅ |
|                    | Nombre de frontends Next.js     | 2 livrés (citizen+admin), 3ᵉ prévu |             3 |         ⚠️ |
| **Tests**          | Tests Jest unitaires            | 53 livrés (44 utils + 9 config)    |     800 cible | ⏳ partial |
|                    | Tests Playwright E2E            | 11                                 |      30 cible |         ⏳ |
|                    | Couverture globale              | non mesurée encore                 |          80 % |         ⏳ |
| **Performance**    | Latence p95 `/api/nina` (local) | ~180 ms                            |      < 500 ms |         ✅ |
|                    | Throughput k6 enrollment-peak   | non testé V1                       | 5 000 req/min |         ⏳ |
| **Données Mali**   | Régions livrées                 | 20/20                              |            20 |   ✅ 100 % |
|                    | Cercles livrés                  | 142/159                            |           159 |    ✅ 89 % |
|                    | Polygones ADM2                  | 50 (geoBoundaries)                 |           159 |    ⚠️ 31 % |
| **Infrastructure** | Docker Compose dev              | ✅ opérationnel                    |            ✅ |         ✅ |
| **Souveraineté**   | Dépendances SaaS US             | 0 (sauf GitHub Actions exec)       |             0 |         ✅ |
|                    | Stack 100 % open-source         | ✅                                 |            ✅ |         ✅ |
|                    | ADRs souveraineté explicites    | 7/34 ADRs                          |           ≥ 5 |         ✅ |

### 5.2 Sécurité — « Spécifié » vs « Implémenté » (2 colonnes, lecture honnête)

> La colonne **Spécifié** = un doc/ADR décrit complètement le contrôle. La colonne **Implémenté** =
> le contrôle est présent dans le code et **démontrable en soutenance**. Ne présenter comme acquis
> que les lignes où **Implémenté = ✅**.

| Contrôle de sécurité                          | Référence        | Spécifié | Implémenté | À dire au jury                                                    |
| --------------------------------------------- | ---------------- | :------: | :--------: | ----------------------------------------------------------------- |
| Vault PKI + secrets (AppRole/lease)           | ADR-026/034      |    ✅    |     ✅     | Acquis — démontrable (docker-compose dev)                         |
| Audit **hash-chain SHA-256** (PAS Merkle)     | ADR-007          |    ✅    |     ✅     | Acquis — chaînage en place (audit-service)                        |
| Ancrage racine audit chez un tiers (OCLEI/VG) | ADR-014          |    ✅    |     ❌     | Conçu, Phase 2 — sinon « intégrité auto-déclarée »                |
| Signature QR = **RS256** (Transit)            | ADR-026/034      |    ✅    |     ✅     | Acquis — Transit ne supporte PAS Ed25519                          |
| Scellement audit Ed25519 in-process (@noble)  | doc 09           |    ✅    |     ⚠️     | Partiel — bibliothèque en place, intégration à finaliser          |
| **mTLS strict** intra-cluster                 | ADR-034 / doc 15 |    ✅    |     ❌     | **Conçu, Phase 2** — NON acquis (ne pas survendre)                |
| **Redaction PII** des logs                    | doc 17           |    ✅    |     ❌     | **Conçu, Phase 2** — logger non encore filtré                     |
| **Scans Trivy** en CI (0 CRITICAL)            | doc 16           |    ✅    |     ❌     | **Conçu, Phase 2** — workflow non activé                          |
| Scan SAST Semgrep en CI                       | doc 16           |    ✅    |     ❌     | Conçu, Phase 2                                                    |
| **Packaging Helm** (K3s)                      | doc 20           |    ✅    |     ❌     | **Conçu, Phase 2** — chart non livré (manifests bruts uniquement) |
| Rotation clés / JWKS                          | ADR-034          |    ✅    |     ❌     | Conçu, Phase 2                                                    |

> 💡 **À mettre en valeur** : la doc est très en avance sur le code (40 fichiers .md, 34 ADRs, 8
> diagrammes UML). C'est intentionnel — les spécifications complètes permettent l'implémentation
> future par une équipe institutionnelle. Mais cet écart doit être **assumé** : sur le plan
> sécurité, l'acquis réel se limite à Vault PKI, à l'audit hash-chain SHA-256 et à la signature QR
> RS256 ; mTLS, redaction PII, Trivy et Helm sont des **spécifications Phase 2**, pas une défense en
> profondeur en production.

### 5.3 Encart — Modèle de menace global (synthèse THREAT-MODEL.md)

> Source : `docs/security/THREAT-MODEL.md` + `docs/security/SECURITY-RUNBOOK.md`. Présenté ici en
> synthèse pour la soutenance ; ne pas réécrire le threat model complet.

- **Surface d'attaque V1** : 3 frontends (citizen/admin/governance), API Gateway, 6 microservices
  Bloc A, PostgreSQL/PostGIS, Vault, RabbitMQ, canal USSD. Périmètre souverain (pas de SaaS US sur
  le cœur).
- **Actifs critiques** : NINA + PII citoyens, biométrie (cancelable / fuzzy extractor ISO 24745),
  journal d'audit, clés de signature (Vault Transit + Ed25519 in-process), identités lanceurs
  d'alerte (SIGAC, doc 23).
- **Menaces priorisées (STRIDE simplifié)** :
  - _Spoofing / accès non autorisé_ → Keycloak (ADR-013) + AppRole Vault ; mTLS strict **Phase 2**.
  - _Tampering journal d'audit_ → hash-chain SHA-256 ; **mais** intégrité réellement opposable
    seulement après ancrage tiers (Phase 2) — aujourd'hui « auto-déclarée ».
  - _Information disclosure (logs)_ → redaction PII **Phase 2** : risque résiduel de PII en clair
    dans les logs en l'état actuel.
  - _IDOR / accès objet direct_ (identity-service) → contrôle d'autorisation par ressource à durcir
    (cf. Q-S4 §6).
  - _Replay_ sur vérification QR / interop → anti-replay (nonce + horodatage) à compléter (Q-S3).
- **Contrôles transverses prévus** : OWASP ASVS comme référentiel, scans Trivy/Semgrep en CI (Phase
  2), rotation clés/JWKS (Phase 2).

### 5.4 Encart — Bilan OWASP réel (honnête)

> ⚠️ Ne pas annoncer « OWASP Top 10 couvert ». Bilan factuel de l'état du dépôt :

| Risque OWASP (Top 10 2021)         | État réel V1                                                            |
| ---------------------------------- | ----------------------------------------------------------------------- |
| A01 Broken Access Control          | ⚠️ Partiel — risque IDOR identity-service identifié (correctif Phase 2) |
| A02 Cryptographic Failures         | ✅/⚠️ — Vault + RS256/SHA-256 OK ; Ed25519 audit à finaliser            |
| A03 Injection                      | ✅ — Prisma (requêtes paramétrées), validation DTO class-validator      |
| A05 Security Misconfiguration      | ⚠️ — mTLS/headers durcis = Phase 2                                      |
| A07 Identification & Auth Failures | ✅/⚠️ — Keycloak OK ; rotation JWKS Phase 2                             |
| A08 Software & Data Integrity      | ⚠️ — audit hash-chain OK localement ; ancrage tiers Phase 2             |
| A09 Security Logging & Monitoring  | ⚠️ — observabilité LGTM OK ; **redaction PII Phase 2**                  |
| A10 SSRF                           | ✅ — pas d'appels sortants non maîtrisés sur le cœur souverain          |

> Audit indépendant (pen-test ANSSI ou équivalent) = **prérequis Phase 2 non encore réalisé**.

### 5.5 Encart — Plan de divulgation responsable (responsible disclosure)

> À présenter comme une **discipline de maturité**, pas comme un aveu de faiblesse.

- **Canal** : adresse de contact sécurité dédiée + clé de chiffrement publiée (age/sealed box) pour
  signalement confidentiel ; **aucun** SaaS US (cf. souveraineté).
- **Périmètre** : failles affectant PII citoyens, biométrie, journal d'audit, anonymat lanceurs
  d'alerte.
- **Engagement** : accusé de réception ≤ 72 h, correctif ou mesure de contournement priorisé, crédit
  au rapporteur (sauf demande contraire).
- **Honnêteté** : les limites déjà **connues** (mTLS/Trivy/PII Phase 2, IDOR identity-service,
  anti-replay interop, matching biométrique flou) sont publiées proactivement dans
  `docs/security/THREAT-MODEL.md` — elles ne relèvent donc pas de la divulgation externe mais de la
  roadmap assumée.

---

## 6. Top 30 questions anticipées + réponses préparées

**Fichier existant** : `docs/soutenance/qa-anticipated.md` (déjà livré — le présent §6 en est la
synthèse de référence ; tenir les deux alignés).

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

> R : (a) Cahier des charges et objectifs O1-O9 ; (b) 34 ADRs avec justifications techniques propres
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

### Catégorie E — Failles de sécurité connues (questions « pièges » du jury)

> 🎯 Ces questions ciblent des faiblesses **réelles et identifiées**. Stratégie de réponse
> invariante : (1) reconnaître la limite sans la minimiser, (2) expliquer la cause technique, (3)
> annoncer le correctif prévu et sa phase. **Jamais** présenter ces points comme résolus.

**Q-S1 : Le chiffrement de l'identité des lanceurs d'alerte reposait-il sur Ed25519 ? Ed25519 ne
chiffre pas.**

> R : Limite identifiée et **corrigée dans la conception**. Ed25519 est un schéma de **signature**,
> pas de chiffrement — l'utiliser pour protéger la confidentialité de l'identité d'un lanceur
> d'alerte aurait été une erreur cryptographique. Le canon corrigé (ADR-026/034) sépare clairement :
> chiffrement asymétrique = **age / libsodium sealed box** (X25519 + XSalsa20-Poly1305) ou RSA-OAEP
> (Transit rsa-4096) ; Ed25519 reste réservé à la **signature** (scellement audit in-process via
> `@noble/ed25519`, doc 09). Côté implémentation, le module SIGAC (doc 23) est conçu, l'intégration
> du sealed box est **Phase 2**. Honnêteté : aujourd'hui le contrôle est spécifié correctement, pas
> encore déployé en production.

**Q-S2 : Votre matching biométrique « flou » (fuzzy) ne risque-t-il pas faux positifs / faux
négatifs sur des millions de citoyens ?**

> R : Oui, c'est une limite intrinsèque de tout système biométrique, et nous l'assumons. Le choix
> d'un **fuzzy extractor / template annulable (cancelable biometrics, ISO 24745)** protège la vie
> privée (pas de gabarit brut stocké) mais introduit un compromis FAR/FRR (taux de faux acceptés /
> faux rejetés). Limite identifiée : sans dataset réel INSTAT et sans campagne de calibration des
> seuils, les taux annoncés ne sont **pas** mesurés en conditions réelles. Correctif prévu : (a)
> calibration sur données réelles INSTAT (demande formelle rédigée), (b) parcours de repli humain
> (agent CTDEC) en cas de score ambigu, (c) la biométrie reste **hors scope V1** (doc 25,
> vision-only) — donc présentée comme conçue, Phase 2, jamais comme acquise.

**Q-S3 : Comment empêchez-vous le rejeu (replay) d'un QR code FDI vérifié, surtout en
interopérabilité avec un autre service AES ?**

> R : Limite identifiée. La signature du QR (RS256 via Vault Transit) garantit l'**authenticité** et
> l'**intégrité** du contenu, mais une signature valide peut être **rejouée** si rien ne lie la
> vérification à un contexte unique. Le contrôle anti-replay (nonce à usage unique + horodatage +
> fenêtre de validité courte, idéalement vérification en ligne contre l'état révocation) est
> **spécifié mais pas complètement implémenté**, et le cas interop (un vérificateur d'un autre État
> AES) ajoute la difficulté d'un référentiel de nonce partagé. Correctif prévu Phase 2 : (a)
> horodatage + nonce signés dans le QR, (b) endpoint de vérification en ligne avec liste de
> révocation, (c) protocole d'interop AES standardisé. À dire honnêtement : en l'état, le QR est
> vérifiable hors-ligne mais **pas** protégé contre un rejeu sophistiqué.

**Q-S4 : Un citoyen peut-il accéder au dossier NINA d'un autre en changeant l'identifiant dans l'URL
(IDOR) sur identity-service ?**

> R : Risque identifié — **Broken Access Control / IDOR** (OWASP A01). En V1, l'authentification
> (Keycloak, ADR-013) est en place mais le contrôle d'**autorisation par ressource** (vérifier que
> le NINA demandé appartient bien à l'appelant, ou qu'il dispose d'un rôle agent légitime) doit être
> **systématisé** sur tous les endpoints d'identity-service. Limite assumée : tant que ce garde-fou
> n'est pas appliqué partout, un IDOR est théoriquement possible. Correctif prévu Phase 2 : (a)
> guard d'autorisation centralisé (ownership + RBAC) en amont de chaque accès objet, (b) tests
> d'autorisation négatifs en CI, (c) audit systématique des accès dans le journal hash-chain. C'est
> précisément le type de faille couverte par notre **plan de divulgation responsable** (§5.5).

---

## 7. Rétrospective honnête

**Fichier existant** : `docs/soutenance/retrospective.md`

### Ce qui a marché ✅

1. **Documentation comme code** : 34 ADRs + CHANGELOG vivant + MAINTENANCE.md. Toujours la doc avant
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

- **Publication open-source** : publier le rapport + 34 ADRs sur GitHub public avec licence Creative
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
