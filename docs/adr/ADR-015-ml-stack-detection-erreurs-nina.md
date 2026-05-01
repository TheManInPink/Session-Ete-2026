# ADR-015 — Stack ML/NLP pour la détection d'erreurs NINA (XGBoost + RapidFuzz + spaCy + Soundex)

**Statut** : ✅ Accepté **Date** : 2026-04-16 **Décideurs** : Étudiant UQAR (solo) **Contexte
document** : [11 — AI Service FastAPI](../11-AI-SERVICE-FASTAPI.md) **Complète** :
[ADR-004 — FastAPI](./ADR-004-fastapi.md)

---

## Contexte

Le service `ai-service` (port 3003) doit **détecter automatiquement les erreurs dans les
enregistrements NINA** du registre malien actuel (plus de 11 millions de fiches, taux d'erreur
estimé à 12–18 %). Les erreurs documentées sont de plusieurs natures :

| Classe d'erreur                | Exemple                                                    | Fréquence estimée |
| ------------------------------ | ---------------------------------------------------------- | ----------------- |
| Translittération incohérente   | « Mamadou » vs « Mamadu » vs « Mamadou » avec espace       | 35 %              |
| Fautes de frappe simples       | « Traoré » → « Traotre »                                   | 25 %              |
| Doublons quasi-exacts          | Même personne enregistrée 2×, dates légèrement différentes | 15 %              |
| Incohérence date-âge-lieu      | Né en 1990 à Bamako mais résidence = Tombouctou à 6 mois   | 10 %              |
| Champ vide ou placeholder      | « XXX », « Inconnu », « N/A »                              | 8 %               |
| Confusion père/mère ou jumeaux | Deux fiches avec mêmes parents et date à 1 jour près       | 7 %               |

Le pipeline doit produire un **score de confiance 0–100** par enregistrement, signaler les anomalies
détectées, et proposer des corrections. Il doit aussi gérer les **8 langues nationales** (français,
bambara, soninké, fulfulde, tamasheq, haoussa, mooré, djerma) — donc supporter plusieurs systèmes
d'écriture et phonétiques.

Plusieurs approches ont été évaluées.

---

## Partie 1 — Modèle de scoring (supervisé)

### Option A — Règles métier pures (if/else)

- ➕ Interprétable à 100 % — un agent peut tracer chaque décision
- ➕ Aucun besoin de données d'entraînement
- ➖ Explosion combinatoire : les erreurs interagissent (date + lieu + nom)
- ➖ Maintenance exponentielle (600+ règles à gérer manuellement)
- ➖ Pas de généralisation aux nouveaux patterns d'erreur

### Option B — Deep learning (Transformers type CamemBERT / AfroXLMR)

- ➕ Excellent sur la compréhension textuelle multilingue
- ➕ État de l'art sur le NLP africain (AfroXLMR couvre 17 langues africaines)
- ➖ **GPU requis** pour inférence rapide — coût opérationnel majeur en production souveraine
- ➖ Temps d'inférence : 200–500 ms/enregistrement même sur GPU → trop lent pour 11M fiches
- ➖ Explicabilité faible : un inspecteur anticorruption doit pouvoir justifier chaque détection
- ➖ Overkill pour un scoring sur **features numériques + catégorielles** (dates, distances, flags)

### Option C — XGBoost + features engineered (choix) ✅

Un modèle gradient boosting entraîné sur ~40 features extraites manuellement (distance fuzzy entre
noms, cohérence date-lieu, fréquence de caractères, présence de placeholders, etc.).

- ➕ **Performance** : 20–40 ms/enregistrement sur CPU standard — parfait pour 11M fiches en < 1 h
- ➕ **Explicabilité native** : `feature_importances_` + SHAP pour expliquer chaque décision
- ➕ **Robustesse** : gère naturellement les features manquantes
- ➕ **Production-proven** : standard industriel pour la détection d'anomalies tabulaires (Kaggle,
  fraude bancaire)
- ➕ **Dataset synthétique suffisant** : 10 000 enregistrements générés algorithmiquement avec
  erreurs contrôlées (doc 11)
- ➖ Nécessite feature engineering manuel (~2 semaines initial)
- ➖ Moins expressif qu'un Transformer pour les cas "exotiques"

### Option D — LightGBM

- ➕ Légèrement plus rapide qu'XGBoost (+15 % sur certains datasets)
- ➕ Meilleure gestion de features catégorielles natives
- ➖ Documentation et écosystème plus pauvres pour l'explicabilité (pas de SHAP natif mature
  en 2026)
- ➖ Bugs de sérialisation connus avec les modèles multiclass

### Option E — CatBoost

- ➕ Excellent sur features catégorielles (codes région, commune)
- ➖ Bibliothèque plus lourde (~300 Mo)
- ➖ Support Python 3.14 récent et pas encore stable

### Décision Partie 1 — XGBoost 3.2+

Avec SHAP 0.48+ pour explicabilité par prédiction. Voir doc 11 section 5 pour le pipeline
d'entraînement.

---

## Partie 2 — Matching approximatif de chaînes (fuzzy)

### Option F — Levenshtein pur (bibliothèque maison)

- ➕ Transparent
- ➖ Coût O(n×m) — explose sur 11M noms
- ➖ Ne gère pas les translittérations (« Mamadou » / « Mamadu ») sémantiquement

### Option G — Jaro-Winkler via `jellyfish`

- ➕ Meilleur sur les noms courts (prénoms)
- ➕ Gère les permutations de caractères
- ➕ Bibliothèque mature et rapide (C extension)
- ➖ Pas de support natif des tokens/mots multiples

### Option H — RapidFuzz (choix) ✅

Suite complète Levenshtein/Jaro/Damerau-Levenshtein/token_sort_ratio. Implémentation C++ avec SIMD.

- ➕ **10–30× plus rapide** que `fuzzywuzzy` (implémentation C++ avec SIMD)
- ➕ API riche : `ratio`, `partial_ratio`, `token_sort_ratio`, `token_set_ratio`
- ➕ Support natif Python 3.14 + asyncio
- ➕ Typage Python moderne (type hints complets)
- ➕ Licence MIT, maintenance active (maxbachmann)
- ➖ Pas de support direct du phonétique africain (compensé par Jellyfish + règles manuelles)

### Option I — Embeddings sentence-transformers (multilingual-e5)

- ➕ Sémantique cross-lingue puissante
- ➖ Latence 50–100 ms par paire → impraticable à l'échelle
- ➖ GPU recommandé

### Décision Partie 2 — RapidFuzz 3.14+ + Jellyfish 1.1+ en complément phonétique

---

## Partie 3 — NLP et tokenisation multilingue

### Option J — spaCy 3.8+ (choix) ✅

Pipeline NLP industriel avec modèles pré-entraînés français (`fr_core_news_md`) et bambara
communautaire (`bm_core_news_sm` via Masakhane).

- ➕ Tokenisation, lemmatisation, NER (reconnaissance d'entités nommées) en 1 seul appel
- ➕ Support natif Python 3.14
- ➕ Pipeline extensible (custom components)
- ➕ Production-proven (Explosion AI, maintenu depuis 2015)
- ➖ Modèles africains encore jeunes (qualité inégale sur soninké, tamasheq)

### Option K — NLTK

- ➕ Pédagogique
- ➖ Lent, pas conçu pour la production
- ➖ Pas de support natif des langues africaines

### Option L — HuggingFace Transformers pipelines

- ➕ État de l'art
- ➖ Toujours le même problème : GPU requis, latence élevée

### Décision Partie 3 — spaCy 3.8+ avec fallback heuristique pour les 6 langues sans modèle pré-entraîné

---

## Partie 4 — Phonétique africaine

Les noms africains transcrits en français posent un problème spécifique : « Mamadou », « Mamadu », «
Mahamadou » désignent la même personne phonétiquement, mais aucune variante standard Soundex /
Metaphone ne les reconnaît comme équivalentes.

### Option M — Soundex standard (en-US)

- ➖ Conçu pour l'anglais → faux positifs massifs sur les noms africains

### Option N — Metaphone / Double Metaphone

- ➕ Plus sophistiqué que Soundex
- ➖ Toujours occidentalo-centré

### Option O — Soundex adapté français (choix) ✅

Algorithme Soundex ajusté aux phonèmes français-africains (garde les voyelles initiales, traite
`ou/u/w` comme équivalents, `é/è/ai` comme équivalents, etc.). Implémenté en ~150 lignes Python dans
`ai-service/src/phonetic/african_soundex.py`.

- ➕ **Contrôlé** à 100 % par l'équipe — règles ajustables après feedback terrain
- ➕ Documentation pédagogique (chaque règle est commentée)
- ➕ Testable par golden-set de paires (« Mamadou » == « Mamadu », « Keita » != « Ketta »)
- ➖ Requiert maintenance initiale ~1 semaine par un linguiste consultant

### Option P — Afro-NLP packages spécialisés

- ➕ Recherche active (Masakhane NER)
- ➖ Pas encore production-ready en 2026

### Décision Partie 4 — Soundex adapté africain maison + fallback Jellyfish Metaphone pour tests

---

## Partie 5 — Détection d'anomalies non supervisée (optionnelle pour Bloc A, centrale pour Bloc D)

### Option Q — Isolation Forest (scikit-learn)

- ➕ Léger, rapide, explicable
- ➕ Bon sur features tabulaires (volume de transactions par agent, ratio de rejets)
- ➕ Utilisé aussi par `anticorruption-service` (ADR-004 mentionne le contexte)

### Option R — Autoencoders (TensorFlow/PyTorch)

- ➖ GPU, surcomplexité

### Décision Partie 5 — Isolation Forest pour enrichir le scoring XGBoost (feature supplémentaire)

Cette décision sera détaillée dans le doc du Bloc D (anticorruption). Pour le Bloc A, on reste sur
XGBoost supervisé + règles.

---

## Décision consolidée

Le pipeline IA `ai-service` utilise la stack suivante :

| Couche                    | Technologie                        | Version        |
| ------------------------- | ---------------------------------- | -------------- |
| Framework web             | FastAPI + uvicorn                  | 0.135+ / 0.35+ |
| Validation                | Pydantic v2                        | 2.11+          |
| Scoring supervisé         | XGBoost                            | 3.2+           |
| Explicabilité             | SHAP                               | 0.48+          |
| Fuzzy matching            | RapidFuzz                          | 3.14+          |
| Phonétique complémentaire | Jellyfish                          | 1.1+           |
| Phonétique africaine      | Soundex africain (maison)          | —              |
| NLP                       | spaCy + `fr_core_news_md`          | 3.8+           |
| Sérialisation modèle      | joblib + ONNX (export optionnel)   | 1.4+           |
| Évaluation                | scikit-learn (metrics + cross-val) | 1.8+           |

Le pipeline est **5 étapes** :

1. **Ingestion** — lecture d'un enregistrement NINA depuis `identity-service` (ou batch depuis un
   export)
2. **Normalisation** — spaCy tokenisation + Unicode NFC + suppression placeholders
3. **Analyse** — extraction de ~40 features (fuzzy, phonétique, cohérence date/lieu, stats colonne)
4. **Scoring** — prédiction XGBoost + SHAP values
5. **Soumission** — création d'une `CorrectionRequest` si score < seuil, avec anomalies détaillées

---

## Conséquences

### Positives

- **Performance** : ~30 ms/enregistrement sur CPU → 11M fiches auditées en ~3 h sur une VM modeste
- **Explicabilité** : chaque décision accompagnée des 5 principales features contributives (SHAP),
  essentiel pour l'audit anticorruption et la justice
- **Souveraineté** : 100 % CPU → déployable sur un K3s on-prem sans GPU, conforme à l'exigence de
  souveraineté AES
- **Maintenabilité** : feature engineering lisible par un stagiaire, retraining mensuel possible
- **Coût** : $0 en licences (tout open source, licences permissives MIT/BSD/Apache)

### Négatives

- **Dette technique linguistique** : le Soundex africain maison nécessitera des itérations après
  feedback des 8 communautés linguistiques (3–6 mois de tuning post-lancement)
- **Pas d'état de l'art sur les cas rares** : les erreurs exotiques (mélanges de 3 langues dans un
  même nom) seront moins bien détectées qu'avec un LLM
- **Maintenance XGBoost** : nécessite retraining mensuel avec nouvelles corrections validées par
  agents → pipeline MLOps à construire
- **Risque de biais** : le dataset synthétique peut sous-représenter certaines classes d'erreurs
  réelles — nécessite validation croisée avec corrections agents terrain après 3 mois

### Risques résiduels

| Risque                                                       | Probabilité | Mitigation                                                                 |
| ------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------- |
| Dataset synthétique ne reflète pas la réalité                | Moyen       | Validation agents sur 1000 cas réels après MEP, retraining                 |
| Dérive de modèle au fil du temps                             | Moyen       | Monitoring distribution features + ré-entraînement mensuel                 |
| Faux positifs lésant des citoyens innocents                  | Moyen       | Seuils configurables + **aucune action automatique** sans validation agent |
| Biais linguistique (langues minoritaires moins bien servies) | Élevé       | Feature `language` en input + métriques par langue + audits                |
| Modèle corrompu (empoisonnement des corrections)             | Faible      | Signature SHA-256 du `.pkl` + vérification au démarrage service            |

---

## Implémentation

- Pipeline : `services/ai-service/src/pipeline/` (5 stages)
- Modèles entraînés : `ai-models/nina_detector_v1.pkl` + `ai-models/nina_detector_v1.onnx`
- Dataset synthétique : `ai-models/datasets/synthetic_nina_v1.csv` (10 000 lignes, non commité —
  regénérable via `scripts/generate_synthetic_dataset.py`)
- Notebooks d'exploration : `ai-models/notebooks/01_eda.ipynb`, `02_feature_engineering.ipynb`,
  `03_training.ipynb`
- Tests : `services/ai-service/tests/test_pipeline.py` + golden-set
  `tests/fixtures/known_errors.json`
- Metrics cible : AUC ≥ 0.92, F1 ≥ 0.85 sur le test set stratifié

---

## Références

- [ADR-004 — FastAPI](./ADR-004-fastapi.md)
- Chen & Guestrin, _XGBoost: A Scalable Tree Boosting System_, 2016
- Lundberg & Lee, _A Unified Approach to Interpreting Model Predictions_ (SHAP), NIPS 2017
- [RapidFuzz documentation](https://rapidfuzz.github.io/RapidFuzz/)
- [Masakhane NLP](https://www.masakhane.io/) — ressources NLP africaines open-source
- Philip, _Adapting Soundex to West African Names_, ACL Workshop on African NLP, 2023

---

_ADR-015 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR_
