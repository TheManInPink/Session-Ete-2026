# MODEL CARDS — Modèles SIGAC (Bloc D anti-corruption)

> **Service** : `anticorruption-service` (port 3009, FastAPI Python). **Document de référence** :
> [`docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md`](../23-BLOC-D-SIGAC-ANTICORRUPTION.md) (§4.2 Isolation
> Forest, §4.3 LSTM, §4.4 BERT/AfroXLMR, §6 bis.2 Model Cards, §6 bis.3 contestation RGPD). **ADR
> liés** : ADR-023 (stack ML SIGAC + lanceurs d'alerte), ADR-034 (sécurité Vault/mTLS/OWASP),
> ADR-014 (audit hash-chain SHA-256 — base d'immutabilité des scores). **Public** : inspecteurs
> OCLEI, procureurs, comité d'éthique IA, DPO (RGPD), auditeurs. **Classification** : NINA-AES
> Platform — UQAR — CONFIDENTIEL.

---

## 0. Pourquoi des Model Cards (et pas juste « le modèle marche ») ?

Un système d'identité numérique d'État qui surveille ses propres agents est un **outil de pouvoir**.
S'il est opaque, biaisé ou décisionnel-automatique, il devient un instrument de répression —
l'inverse exact de sa mission anti-corruption. Une **Model Card** (au sens de Mitchell et al., 2019)
répond **avant** toute mise en production à quatre questions non négociables :

1. **À quoi sert ce modèle — et à quoi il NE doit JAMAIS servir ?** (usage prévu vs usage interdit)
2. **Sur quoi a-t-il appris ?** (données, ici **synthétiques** — donc limites intrinsèques)
3. **Est-il équitable ?** (biais & fairness, axe **non négociable** : la **langue nationale** et la
   **région** du citoyen/agent ne doivent pas dégrader la prise en charge)
4. **Qui décide vraiment ?** (human-in-the-loop **obligatoire** + droit de **contestation RGPD**)

> 🟠 **MARQUEUR D'HONNÊTETÉ GLOBAL** — État d'avancement à la date de ce document (juin 2026). Seul
> **Isolation Forest v1** est **réellement entraîné et exporté**
> ([`ai-models/exported/isolation_forest_v1.metadata.json`](../../ai-models/exported/isolation_forest_v1.metadata.json)),
> sur des **comportements synthétiques** (« heuristiques académiques, non validées terrain »).
> **LSTM** et **BERT/AfroXLMR** sont ⏳ **conçus, Phase 2** (non entraînés, non déployés). Aucun de
> ces modèles n'a vu de données réelles RAVEC/CTDEC. Ne PAS présenter SIGAC comme « opérationnel »
> ni « validé » : ce document décrit la **conception cible** et l'**état réel** côte à côte.

### Légende des marqueurs

| Marqueur              | Signification                                                       |
| --------------------- | ------------------------------------------------------------------- |
| ✅ **Implémenté**     | Code écrit, modèle entraîné/exporté, vérifiable dans le repo        |
| ⏳ **Conçu, Phase 2** | Spécifié dans doc 23 / ce document, **pas** encore codé ni entraîné |
| 🚫 **Usage interdit** | Emploi explicitement proscrit (garde-fou éthique/juridique)         |
| 🟠 **Honnêteté**      | Écart entre l'idéal documenté et la réalité du repo                 |

---

## 1. Principes transverses (s'appliquent aux 3 modèles)

### 1.1 Le ML cible l'enquête, il ne la remplace pas

Aucun modèle SIGAC ne « détecte la corruption ». Chaque modèle **flagge une anomalie** ou **classe
un texte**. Un flag est un **motif d'enquête humaine OCLEI** (Office Central de Lutte contre
l'Enrichissement Illicite), **jamais** une preuve ni une décision administrative (cf. doc 23 §1,
leçon 1).

### 1.2 Human-in-the-loop OBLIGATOIRE — aucune décision automatique punitive

| Étape                           | Acteur                                 | Automatisé ?                       |
| ------------------------------- | -------------------------------------- | ---------------------------------- |
| Calcul du score / flag          | Modèle ML                              | ✅ oui (suggestion)                |
| Décision d'enquêter             | Inspecteur OCLEI **humain**            | ❌ non — revue humaine obligatoire |
| Sanction / mesure disciplinaire | Autorité hiérarchique + contradictoire | ❌ non — hors périmètre ML         |

> 🚫 **Usage interdit transverse** : déclencher automatiquement une **suspension, mutation, retrait
> d'habilitation, sanction salariale ou poursuite** sur la seule sortie d'un modèle. Tout effet
> punitif exige une **intervention humaine** documentée (RGPD-like art. 22, cf. §5).

### 1.3 Données d'entraînement = SYNTHÉTIQUES (et ce que ça implique)

Tous les corpus d'entraînement SIGAC sont **générés algorithmiquement** (templates métier,
heuristiques comportementales). **Aucune donnée réelle** de citoyen ou d'agent NINA n'alimente
l'entraînement (pas de leak RAVEC/CTDEC). Conséquences à assumer :

- La **séparabilité** des données synthétiques est **artificiellement élevée** : les métriques
  (precision/recall) sont **optimistes** et **ne préjugent PAS** des performances terrain.
- Le modèle apprend les **a priori du concepteur** (ce qu'on a _imaginé_ être suspect), pas la
  vérité terrain. Risque de **biais d'automation** : croire la machine parce qu'elle « score haut ».
- Toute mise en production réelle **exige** une phase de calibration supervisée sur données réelles
  (avec accord éthique/DPO) **avant** de donner le moindre poids opérationnel aux scores.

### 1.4 Équité par LANGUE nationale et par RÉGION — axe non négociable

Le Mali/AES est plurilingue (français, **bambara**, **peul/fulfulde**, **songhaï**, **tamasheq**) et
vaste (régions Nord enclavées vs Sud urbanisé). Deux biais sont **inacceptables** pour un service
anti-corruption d'État :

- **Biais de langue** : moins bien classer un signalement en bambara qu'en français = **moins bien
  protéger** les locuteurs bambara. Mesuré par F1 par langue avec **seuils d'écart tolérés** (§3).
- **Biais régional** : flagger plus d'agents d'une région (faux positifs géographiques) = suspicion
  structurelle injuste. Mesuré par **taux de faux positifs par région** (§2).

### 1.5 Immutabilité & traçabilité (ADR-014)

Les scores (`integrity_scores`) et les contestations sont **ancrés dans la chaîne d'audit hash-chain
SHA-256** (ADR-014) — append-only, scellement horaire Ed25519 in-process (signature, **pas**
chiffrement). Un agent corrompu ne peut donc pas **effacer** un flag le concernant, ni en
**fabriquer** un contre un collègue sans laisser de trace.

### 1.6 Gouvernance de mise à jour (commune aux 3 modèles)

| Aspect                    | Règle                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Versionnage**           | Chaque modèle est versionné (`isolation-forest-vN`) et tracké via **MLflow Registry** ; la version est stockée dans `IntegrityScore.modelVersion` (cf. doc 23 §4.1)                  |
| **Re-entraînement**       | Périodicité cible : **trimestrielle** ⏳, ou déclenché par dérive (drift) détectée                                                                                                   |
| **Porte d'équité (gate)** | 🚫 **Blocage de mise en prod** si un écart de F1 par langue dépasse le seuil toléré, OU si le taux de faux positifs d'une région dévie significativement (cf. §3.4, doc 23 §6 bis.2) |
| **Revue éthique**         | Toute nouvelle version passe en revue **comité d'éthique IA + DPO** avant activation                                                                                                 |
| **Reproductibilité**      | `random_state=42` figé ; métadonnées (features, versions libs, hash dataset) exportées en JSON aux côtés du bundle                                                                   |
| **Rollback**              | La version précédente reste dans MLflow ; rollback possible sans ré-entraînement                                                                                                     |
| **Journalisation**        | Activation/désactivation/rollback de modèle = événement ancré ADR-014                                                                                                                |

---

## 2. Model Card — Isolation Forest (anomalie comportementale des agents)

> **Statut** : ✅ **Implémenté** (entraîné + exporté). Source de vérité :
> [`ai-models/exported/isolation_forest_v1.metadata.json`](../../ai-models/exported/isolation_forest_v1.metadata.json).
> Code de référence (illustratif) : doc 23 §4.2.

### 2.1 Identité du modèle

| Champ                       | Valeur (modèle exporté `isolation_forest_v1`)                   |
| --------------------------- | --------------------------------------------------------------- |
| Nom                         | `isolation_forest_v1`                                           |
| Type                        | `sklearn.ensemble.IsolationForest`                              |
| Tâche                       | Détection d'anomalies comportementales d'agents (SIGAC, Bloc D) |
| Créé le                     | 2026-06-17                                                      |
| Échantillons d'entraînement | **800 agents synthétiques**                                     |
| `n_estimators`              | 200                                                             |
| `contamination`             | **0.05** (5 %)                                                  |
| Versions                    | Python 3.14.0 · scikit-learn 1.8.0 · numpy 2.3.5                |
| Bundle                      | `model` + `scaler` + `feature_names`                            |

> 🟠 **Honnêteté — écart doc 23 vs modèle réel** : la doc 23 §4.2 illustre `contamination=0.02` et
> **8 features** ; le modèle réellement exporté utilise **`contamination=0.05`** et **10 features**
> (ci-dessous). Le code de la doc est **pédagogique**, le JSON exporté fait **foi**. Cet écart doit
> être réconcilié lors de la rédaction d'ADR-023.

### 2.2 Features (10, modèle exporté)

| Feature                       | Signification                        | Risque de biais                                               |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| `corrections_per_day`         | Volume de corrections/jour           | Normaliser par charge légitime du guichet                     |
| `avg_validation_seconds`      | Temps moyen de validation            | Un agent rapide ≠ agent corrompu                              |
| `night_activity_ratio`        | % d'activité hors heures ouvrées     | Postes décalés / zones à faible connectivité                  |
| `weekend_activity_ratio`      | % d'activité le week-end             | Idem                                                          |
| `self_approval_ratio`         | % d'actions auto-validées            | Indicateur fort, mais dépend du workflow local                |
| `rejection_rate`              | Taux de rejets                       | Trop de rejets _et_ trop peu = suspect                        |
| `unique_communes_touched`     | Nombre de communes distinctes        | ⚠️ **à normaliser par le rôle** (agent mobile multi-communes) |
| `high_value_correction_ratio` | % de corrections « à fort enjeu »    | —                                                             |
| `repeat_citizen_ratio`        | % de citoyens traités plusieurs fois | Petites communes = répétition normale                         |
| `after_hours_logins`          | Connexions hors plage                | Zones enclavées, contraintes réseau                           |

> ⚖️ **Garde-fou équité (doc 23 §6 bis.2)** : les features **ne doivent contenir aucun proxy
> ethnique/régional discriminant**. `unique_communes_touched` (l'équivalent du
> `cross_region_actions` de la doc) doit être **normalisé par le rôle légitime** : un agent
> itinérant multi-communes ne doit **pas** être pénalisé structurellement.

### 2.3 Métriques

| Métrique                    | Valeur (`eval_vs_synthetic_truth`) | Lecture honnête                                                       |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| Anomalies détectées         | 40                                 | Sur 800 agents (≈ 5 %, cohérent avec `contamination=0.05`)            |
| **Precision**               | **1.00**                           | ⚠️ Parfait **uniquement** car la « vérité » est elle-même synthétique |
| **Recall**                  | **1.00**                           | ⚠️ Idem                                                               |
| FAR (False Acceptance Rate) | ⏳ non mesuré terrain              | À mesurer **par région** avant prod (cf. §2.5)                        |

> 🟠 **precision = recall = 1.0 n'est PAS un résultat de qualité** : c'est le symptôme d'un dataset
> synthétique parfaitement séparable, où le modèle « retrouve » exactement les anomalies qu'on a
> **injectées**. Sur données réelles, ces chiffres **chuteront**. Interpréter le score comme un
> **rang relatif** (« cet agent est plus atypique que 95 % des autres »), **jamais** comme une
> probabilité de culpabilité.

### 2.4 Usage prévu vs usage interdit

| ✅ Usage prévu                                                         | 🚫 Usage INTERDIT                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Produire le facteur `factorAnomaly` (0-100) du score d'intégrité hebdo | Décider seul d'une sanction, suspension ou poursuite |
| Hiérarchiser la file d'enquête OCLEI (qui examiner d'abord)            | Servir de « preuve » dans un dossier disciplinaire   |
| Détecter une dérive comportementale à investiguer humainement          | Profiler les agents par origine, région ou langue    |
| Alimenter le dashboard `apps/governance` (INSPECTOR/PROSECUTOR)        | Être exposé publiquement ou au grand public          |

### 2.5 Biais & fairness (par région)

- **FAR par région à publier** : doc 23 §6 bis.2 exige de **documenter le taux de faux positifs par
  région** pour détecter un biais géographique (ex. sur-flagger systématiquement les agents du
  Nord). ⏳ Non encore mesuré (données synthétiques non régionalisées dans `v1`).
- **Normalisation par rôle** : `unique_communes_touched` / `after_hours_logins` doivent être
  pondérés par le profil légitime de l'agent, sinon les postes itinérants/zones enclavées sont
  pénalisés.
- **Pas de proxy sensible** : aucune feature directement ou indirectement corrélée à l'ethnie, la
  langue, l'appartenance régionale.

### 2.6 Limites

- `contamination=0.05` est un **a priori**, pas une vérité terrain (doc 23 §6 bis.2). Trop élevé →
  trop de faux positifs (cf. piège doc 23 §6 : « Isolation Forest flagge trop d'agents »).
- Un agent **inactif** une semaine n'a pas de features → marquer `INSUFFICIENT_DATA`, **pas** score
  0 (doc 23 §6).
- Modèle **non temporel** : il voit un instantané, pas une séquence (c'est le rôle du LSTM, §3).
- Entraîné sur **800 agents synthétiques** : volume faible, distribution artificielle.

### 2.7 Human-in-the-loop & contestation

Un score élevé déclenche `notify_inspector(...)` (doc 23 §4.2), **pas** une action automatique.
L'agent flaggé dispose du **droit de contestation RGPD** (§5) :
`POST /sigac/integrity-scores/{id}/dispute`, gel du flag pendant la revue, trace ADR-014.

---

## 3. Model Card — BERT / AfroXLMR (classification des signalements)

> **Statut** : ⏳ **Conçu, Phase 2** (non entraîné, non déployé). Modèle de base cible :
> `Davlan/afro-xlmr-base` (bambara/peul/haoussa) ou `bert-base-multilingual-cased`. Code de
> référence : doc 23 §4.4. Cette carte décrit la **conception cible** + les **portes d'équité**.

### 3.1 Identité du modèle

| Champ          | Valeur cible                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Modèle de base | `Davlan/afro-xlmr-base` (fine-tuné localement, GPU CTDEC, **pas de cloud GPU US**)                                                       |
| Tâche          | Classer un signalement en **6 classes** : `CORRUPTION_FINANCIAL`, `ABUSE_OF_POWER`, `IDENTITY_FRAUD`, `DATA_LEAK`, `HARASSMENT`, `OTHER` |
| Entrée         | Texte USSD (≤ 160 caractères)                                                                                                            |
| Sortie         | (classe, probabilité) — **la classe fine reste chiffrée** dans le payload (anti-corrélation)                                             |
| Hub            | Hugging Face **mirror local self-hosted** (souveraineté)                                                                                 |

### 3.2 Où s'exécute la classification (rappel crypto — CANON)

> 🔒 **La classification BERT s'exécute sur la BORNE / dans l'enclave locale**, **pas** sur le
> serveur de stockage (doc 23 §4.5). On en dérive immédiatement des **buckets grossiers**
> (`classificationBucket`, `severityBucket`) stockés en clair pour l'anti-corrélation ; la **classe
> fine** part **chiffrée** dans le ciphertext (sealed box X25519 / RSA-OAEP, **jamais Ed25519** =
> signature seule). Le serveur ne voit donc jamais ni le texte ni la classe fine.

### 3.3 Données d'entraînement (synthétiques, multilingues)

- **~5 000 signalements synthétiques** pré-annotés (templates métier), **aucune** vraie donnée NINA
  (doc 23 §4.4).
- **Cible de parité linguistique** du corpus :

  | Langue                 | Part minimale du corpus |
  | ---------------------- | ----------------------- |
  | Bambara (translittéré) | ≥ 15 %                  |
  | Peul / Fulfulde        | ≥ 15 %                  |
  | Songhaï                | ≥ 10 %                  |
  | Tamasheq               | ≥ 10 %                  |
  | Français               | le reste                |

  > Sous-représenter une langue nationale dans le corpus = **moins bien protéger** ses locuteurs.

### 3.4 Métriques d'équité PAR LANGUE (porte de gouvernance)

> Tableau **normatif** (doc 23 §6 bis.2). Ces cibles **doivent être mesurées et publiées** ; un
> dépassement d'écart **bloque** la mise en production.

| Langue                 | F1 macro cible | Écart toléré vs français | Statut       |
| ---------------------- | -------------- | ------------------------ | ------------ |
| Français               | référence      | —                        | ⏳ à mesurer |
| Bambara (translittéré) | ≥ 0.80         | ≤ 0.08 absolu            | ⏳ à mesurer |
| Peul / Fulfulde        | ≥ 0.78         | ≤ 0.10 absolu            | ⏳ à mesurer |
| Songhaï                | ≥ 0.75         | ≤ 0.12 absolu            | ⏳ à mesurer |
| Tamasheq               | ≥ 0.72         | ≤ 0.15 absolu            | ⏳ à mesurer |

> 🚫 **Règle de gouvernance (gate d'équité)** : si l'écart de F1 d'une **langue** dépasse son seuil
> toléré, le modèle est **REFUSÉ en production** jusqu'à rééquilibrage du corpus (doc 23 §6 bis.2 +
> §6 « BERT mauvaise classif sur bambara » → ajouter 1k exemples bambara + ré-entraîner). C'est une
> **condition d'arrêt**, pas une recommandation.

### 3.5 Usage prévu vs usage interdit

| ✅ Usage prévu                                            | 🚫 Usage INTERDIT                                     |
| --------------------------------------------------------- | ----------------------------------------------------- |
| **Trier** la file procureur (ordre de traitement)         | Déclencher une sanction automatique                   |
| Dériver des **buckets grossiers** pour l'anti-corrélation | **Enterrer / rejeter** un signalement classé `OTHER`  |
| Aider le procureur à prioriser après déchiffrement        | Servir de qualification juridique de l'infraction     |
| —                                                         | Réidentifier le signaleur via la classe fine en clair |

### 3.6 Biais connus & limites (doc 23 §6 bis.2)

- **Bambara écrit non standardisé** (orthographe/translittération variables) → risque de
  **sous-classification**. Mitigation : augmentation de données + normalisation orthographique.
- **Signaux courts** (USSD ≤ 160 chars) → peu de contexte → tendance à **sur-classer en `OTHER`**.
  Garde-fou : la classe `OTHER` **n'enterre JAMAIS** un signalement — **tout** signalement entre en
  file procureur, quelle que soit la classe.
- **Corpus synthétique** → métriques optimistes ; performance réelle inférieure attendue.
- **Langues non couvertes** par AfroXLMR : dégradation possible hors des 5 langues cibles.

### 3.7 Human-in-the-loop

La sortie BERT **ne déclenche aucune sanction** : elle **trie** seulement la file. Le **procureur
humain** lit (après déchiffrement local), qualifie et décide. Aucune classe ne ferme un dossier
automatiquement.

---

## 4. Model Card — LSTM (analyse temporelle de l'activité)

> **Statut** : ⏳ **Conçu, Phase 2** (non entraîné, non déployé). Code de référence : doc 23 §4.3
> (`ActivityLSTM`, PyTorch 2.5).

### 4.1 Identité du modèle

| Champ                | Valeur cible                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| Type                 | LSTM 2 couches (PyTorch), `hidden_size=64`, `dropout=0.2`                         |
| Entrée               | Séquence des **30 derniers jours** d'activité par agent (8 features/jour)         |
| Sortie               | Probabilité (0-1) que la **prochaine journée** soit anormale                      |
| Label d'entraînement | « jour ayant donné lieu à un **signalement fondé** » (sur 12 mois d'`audit_logs`) |

### 4.2 Usage prévu vs usage interdit

| ✅ Usage prévu                                                    | 🚫 Usage INTERDIT                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| Repérer des **pics/séquences anormales** d'activité à investiguer | Prédire la « culpabilité future » d'un agent           |
| Compléter Isolation Forest par la dimension **temporelle**        | Justifier une mesure préventive automatique            |
| Alimenter un facteur d'enquête (suggestion)                       | Score présenté comme une « probabilité de corruption » |

### 4.3 Métriques

| Métrique | Valeur                              | Lecture                                             |
| -------- | ----------------------------------- | --------------------------------------------------- |
| AUC      | ⏳ non mesuré (modèle non entraîné) | À interpréter avec **prudence** (label rare/bruité) |
| FAR      | ⏳ non mesuré                       | À publier par région avant tout usage               |

### 4.4 Biais & limites (doc 23 §6 bis.2)

- **Label rare et bruité** : « jour à signalement fondé » est rare → **risque de sur-apprentissage**
  élevé. L'AUC sera **fragile** et trompeuse sur faible volume.
- **Séries courtes** : < 30 jours de données → non-convergence (doc 23 §6 → padding + masking, ou
  attendre 60+ jours).
- **Pas de décision automatique** : un pic n'est pas une faute ; c'est un **motif d'examen**.
- **Biais régional possible** si les zones à faible connectivité génèrent des séries irrégulières
  (interruptions réseau interprétées comme « anomalies »). À surveiller par région.

### 4.5 Human-in-the-loop

Comme les autres : la probabilité LSTM est une **suggestion de priorisation** pour l'OCLEI, jamais
un verdict. Contestation RGPD applicable (§5).

---

## 5. Droit de CONTESTATION RGPD (décision automatisée — art. 22)

> **Base légale** : régime **RGPD-like** national (PAS de loi 2024-XX non adoptée — CANON
> souveraineté). Un score d'intégrité ou un flag d'anomalie est une **décision fondée sur un
> traitement automatisé** : l'agent concerné a droit à l'**information**, l'**explication**,
> l'**intervention humaine** et la **contestation** (doc 23 §6 bis.3).

| Droit                    | Mise en œuvre SIGAC                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Information**          | Information de chaque agent à l'embauche + rappel annuel : existence du scoring, ses 5 facteurs, ses finalités                                                              |
| **Explication**          | Un agent flaggé reçoit la **décomposition par facteur** (`factorAnomaly`, `factorAudit`, `factorReports`, `factorFeedback`, `factorTraining`) — pas une note opaque         |
| **Intervention humaine** | Aucun flag ne déclenche de sanction **sans** revue par un inspecteur OCLEI **humain**                                                                                       |
| **Contestation**         | `POST /sigac/integrity-scores/{id}/dispute` — réservé à l'agent **titulaire** du score (auth stricte), **gel du flag** pendant la revue, trace **audit hash-chain ADR-014** |

> 🔐 **Garde-fou d'accès** (doc 23 §6 bis.3) : un agent ne peut contester **que son propre** score
> (vérif `score.user_id == current_agent.id`, sinon `HTTP 403`). La contestation **n'efface pas** le
> score : elle **suspend l'effet** (gel) et **conserve la trace** ; un humain OCLEI tranche.

---

## 6. Synthèse — tableau de bord d'état

| Modèle               | Statut              | Données                           | Métriques publiées                   | Équité mesurée            | Human-in-loop  | Contestation    |
| -------------------- | ------------------- | --------------------------------- | ------------------------------------ | ------------------------- | -------------- | --------------- |
| **Isolation Forest** | ✅ entraîné/exporté | 800 agents synthétiques           | P=1.0 R=1.0 (synthétique, optimiste) | ⏳ FAR/région à mesurer   | ✅ obligatoire | ✅ RGPD art. 22 |
| **BERT / AfroXLMR**  | ⏳ Phase 2          | ~5 000 signalements synthétiques  | ⏳ à mesurer (F1/langue)             | ⏳ porte d'équité définie | ✅ obligatoire | ✅ RGPD art. 22 |
| **LSTM**             | ⏳ Phase 2          | 12 mois `audit_logs` (label rare) | ⏳ AUC à mesurer                     | ⏳ à surveiller/région    | ✅ obligatoire | ✅ RGPD art. 22 |

> 🟠 **Conclusion d'honnêteté** : à ce jour, **un seul** modèle est entraîné, sur des données
> **synthétiques** aux métriques **optimistes** ; deux sont **conçus mais non implémentés**. Les
> **portes d'équité** (F1/langue, FAR/région) sont **définies** mais **pas encore mesurées**. SIGAC
> ne doit donc PAS être présenté comme « opérationnel », « validé » ni « équitable » : il est en
> **conception** avec des garde-fous documentés (human-in-the-loop, contestation RGPD, gates
> d'équité, immutabilité ADR-014) à **vérifier** avant tout déploiement réel.

---

## 7. Références

- [`docs/23-BLOC-D-SIGAC-ANTICORRUPTION.md`](../23-BLOC-D-SIGAC-ANTICORRUPTION.md) — spécification
  SIGAC complète (modèles, whistleblower, OWASP, équité).
- [`ai-models/exported/isolation_forest_v1.metadata.json`](../../ai-models/exported/isolation_forest_v1.metadata.json)
  — métadonnées du modèle réellement exporté (source de vérité Isolation Forest).
- `docs/adr/ADR-023-sigac-ml-stack-lanceurs-alerte.md` — décision d'architecture stack ML SIGAC (à
  finaliser).
- `docs/adr/ADR-034-security-hardening-vault-mtls-owasp.md` — sécurité (sealed box X25519 /
  RSA-OAEP, AppRole, OWASP).
- ADR-014 — audit hash-chain SHA-256 (immutabilité des scores et contestations).
- `docs/sigac/WHISTLEBLOWER-PROTOCOL.md` — protocole lanceur d'alerte + cérémonie Shamir 3-of-5
  (document frère).
- `docs/sigac/SCORING-RUNBOOK.md` — interprétation des scores + procédure de contestation (document
  frère).
- Mitchell et al. (2019), _Model Cards for Model Reporting_ — cadre méthodologique des Model Cards.
- ISO/IEC 24745 — protection des données biométriques (rappel CANON : cancelable biometrics, hors
  périmètre de ces 3 modèles comportementaux/NLP).

---

_Document SIGAC — MODEL-CARDS — Version 1.0 — Juin 2026._ _Référence normative : doc 23 (v1.1).
Marqueurs d'honnêteté à jour de l'état réel du repo._ _NINA-AES Platform — UQAR — CONFIDENTIEL._
