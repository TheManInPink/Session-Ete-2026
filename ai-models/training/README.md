# `ai-models/training` — Pipeline d'entraînement des modèles IA

> **Bloc concerné** : A (détecteur d'erreurs NINA) + amorce D (Isolation Forest SIGAC) **Prérequis**
> : un dataset synthétique sous `ai-models/datasets/` (généré par `ai-models/dataset-generator/`),
> Python 3.14+. **Livrables** : `xgboost_v1.joblib` + `metadata.json`, `isolation_forest_v1.joblib`,
> rapport HTML d'évaluation, intégration `ai-service`, workflow CI `train-models.yml`.

Pipeline **reproductible** d'ingénierie de variables, d'entraînement, d'évaluation et d'export des
modèles IA de la NINA-AES Platform. Conçu pour être exécuté par un étudiant seul, sous Windows comme
sous Linux (CI).

---

## 1. Vue d'ensemble

```text
ai-models/
├── datasets/                      # CSV synthétiques (générés — gitignorés)
│   ├── nina_synthetic_v1.csv      #   dataset RICHE (cible du pipeline)
│   └── agents_synthetic_v1.csv    #   comportements d'agents (train_anomaly)
├── training/                      # ← CE PAQUET
│   ├── pyproject.toml · requirements.txt
│   ├── src/training/
│   │   ├── nina.py                # décodage NINA (port de packages/utils/nina.ts)
│   │   ├── data.py                # chargement + découpe stratifiée 60/20/20
│   │   ├── features.py            # FeatureBuilder (fit/transform, 38 variables)
│   │   ├── train_xgboost.py       # détecteur d'erreurs (XGBoost multi-classes)
│   │   ├── train_anomaly.py       # Isolation Forest (SIGAC, Bloc D)
│   │   └── evaluate.py            # rapport HTML (SVG sans dépendance)
│   └── tests/                     # pytest (NINA decode + features)
├── exported/                      # artefacts produits (gitignorés sauf metadata)
│   ├── xgboost_v1.joblib          #   bundle : modèle + FeatureBuilder + LabelEncoder
│   ├── metadata.json              #   « model card » (métriques, versions, classes)
│   └── isolation_forest_v1.joblib
└── evaluation/                    # rapports HTML (gitignorés)
```

Le **bundle** `.joblib` est auto-suffisant : il embarque le modèle, le `FeatureBuilder` ajusté et le
`LabelEncoder`. `ai-service` le charge tel quel et reproduit **exactement** les variables au moment
de l'inférence — aucune logique de features dupliquée entre entraînement et service.

---

## 2. Installation

```powershell
# Depuis la racine du repo
cd ai-models\training

# (recommandé) environnement virtuel dédié
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Installation editable : rend le paquet `training` importable partout
# (indispensable pour `python -m training.xxx` ET pour qu'ai-service puisse
# désérialiser le bundle).
pip install -e .[dev]
```

> 💡 MLflow est **optionnel** : `pip install -e .[mlflow]` pour activer le tracking d'expériences.
> Sans lui, le pipeline écrit un repli `*.run.json`.

---

## 3. Commandes

| Commande                                                        | Rôle                                               |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `python -m training.train_xgboost`                              | Entraîne le détecteur d'erreurs (grille complète). |
| `python -m training.train_xgboost --grid fast --no-mlflow`      | Itération rapide (1 combinaison).                  |
| `python -m training.train_xgboost --min-f1 0.85 --min-auc 0.97` | Avec **porte qualité** (exit≠0 si raté).           |
| `python -m training.train_anomaly`                              | Entraîne l'Isolation Forest SIGAC.                 |
| `python -m training.evaluate`                                   | Génère le rapport HTML d'évaluation.               |
| `pytest tests/ -v`                                              | Tests unitaires (NINA decode + FeatureBuilder).    |

Après `pip install -e .`, les alias console `nina-train-xgboost`, `nina-train-anomaly`,
`nina-evaluate` sont également disponibles.

**Exemple bout-en-bout** :

```powershell
python -m training.train_xgboost           # → exported/xgboost_v1.joblib + metadata.json
python -m training.train_anomaly           # → exported/isolation_forest_v1.joblib
python -m training.evaluate                # → evaluation/report_xgboost_v1.html
```

---

## 4. Le détecteur d'erreurs (XGBoost)

### 4.1 Données et cible

Cible **multi-classes** : le _type_ d'erreur (`error_type` du CSV riche), avec la classe `none` pour
les lignes propres. Sur `nina_synthetic_v1.csv` (10 000 lignes) :

`none · typo_substitution · typo_omission · typo_insertion · phonetic_spelling · field_inversion · geographic_mismatch · date_format_error · invalid_checksum`

> Le parsing CSV passe par **pandas** : le champ `error_field` de `field_inversion` contient une
> valeur multi-champ entre guillemets (`"first_name,last_name"`) qu'un découpage naïf casserait.

### 4.2 Les 38 variables (`FeatureBuilder`)

| Famille             | Variables                                                                                                                                                   | Anti-fuite                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Lexicales**       | longueur, ratio de voyelles, apostrophe, lettres doublées, run de consonnes max, ratio non-alpha, présence de chiffre, nb de tokens (× prénom/nom)          | —                                     |
| **Cohérence**       | `nina_valid_format`, `nina_checksum_ok`, `nina_sex_match`, `nina_year_match`, `nina_month_match`, `nina_region_match`, `birth_date_parseable`, `birth_year` | décodage NINA local                   |
| **Fuzziness**       | `*_ref_known`, `*_ref_jw` (Jaro-Winkler vs référentiel), `*_phonetic_variant` (Soundex)                                                                     | **référentiel appris sur TRAIN seul** |
| **Géographiques**   | `region_code_valid`, `region_name_match`, `cercle/commune/village_present`                                                                                  | table région↔code apprise sur TRAIN   |
| **OCR** (optionnel) | `ocr_available`, `ocr_mean_conf`, `ocr_min_conf`                                                                                                            | actif si colonnes `ocr_*` présentes   |

`FeatureBuilder` suit le contrat `fit`/`transform` scikit-learn. Les référentiels (noms canoniques,
codes Soundex, table région↔code) sont appris **uniquement sur le jeu d'entraînement** : aucune
fuite vers val/test, et l'objet ajusté est sérialisé avec le modèle pour l'inférence.

### 4.3 Entraînement

1. Découpe **stratifiée 60/20/20** reproductible (même graine ⇒ même jeu de test).
2. `GridSearchCV` 5-fold sur `max_depth` × `learning_rate` × `n_estimators`, scoring `f1_weighted`.
3. Métriques : **AUC-ROC** (binaire « erreur vs propre » + multi OVR pondéré), **F1 pondéré**,
   **precision/recall par type d'erreur**.
4. Journalisation MLflow (ou repli JSON), export du bundle + `metadata.json`.

### 4.4 Performances de référence (10 000 lignes, graine 42)

| Métrique (jeu de **test**)         | Valeur                                  |
| ---------------------------------- | --------------------------------------- |
| AUC-ROC binaire (erreur vs propre) | ≈ **0.989**                             |
| AUC-ROC multi (OVR pondéré)        | ≈ 0.962                                 |
| F1 pondéré                         | ≈ 0.859                                 |
| Meilleurs hyperparamètres          | `lr=0.1, max_depth=4, n_estimators=400` |

> ⚠️ **Limite honnête** : le dataset est synthétique et très séparable (les variables de cohérence
> NINA sont quasi-parfaites). En production sur données réelles RAVEC, attendez-vous à des
> performances **inférieures**. Cette mise en garde est inscrite dans `metadata.json`.

---

## 5. L'Isolation Forest (SIGAC — Bloc D)

`train_anomaly.py` génère un dataset comportemental synthétique d'agents d'état civil (volume de
corrections, temps d'instruction, activité nocturne, auto-validation, dispersion géographique…), y
injecte **5 %** de profils anormaux (corruption simulée), entraîne un
`IsolationForest(contamination=0.05)` et exporte `isolation_forest_v1.joblib`. Le dataset est aussi
écrit dans `datasets/` pour inspection.

> Heuristiques **académiques** (hypothèses de modélisation), à recalibrer sur des journaux réels
> avant tout usage opérationnel.

---

## 6. Intégration `ai-service`

Au démarrage, `ai-service` charge le bundle via `app/inference.py::ModelRegistry` et expose :

| Méthode | Chemin                     | Rôle                                                         |
| ------- | -------------------------- | ------------------------------------------------------------ |
| `GET`   | `/api/v1/ai/model-info`    | Métadonnées du modèle chargé (classes, métriques, versions). |
| `POST`  | `/api/v1/ai/reload-models` | **Rechargement à chaud** (🔒 ADMIN en prod).                 |
| `POST`  | `/api/v1/ai/score`         | Score un lot d'enregistrements (étape 4 du pipeline).        |

```powershell
# Démarrer le service puis :
curl http://localhost:3003/api/v1/ai/model-info
curl -X POST http://localhost:3003/api/v1/ai/reload-models

# Exemple de scoring
curl -X POST http://localhost:3003/api/v1/ai/score -H "Content-Type: application/json" -d `
  '{"records":[{"nina":"11706148141251A","first_name":"Boubacar","last_name":"Fall","birth_date":"2017-06-23","sex":"M","region_code":"1","birth_region":"Kayes"}]}'
# → predicted_error_type: invalid_checksum, recommendation: auto_correct
```

> 🔗 **Dépendance de désérialisation** : `joblib.load` doit importer
> `training.features`/`training.nina`. En production, installez le paquet
> (`pip install -e ai-models/training`). En dev, `app/inference.py` ajoute automatiquement
> `ai-models/training/src` au `sys.path` en repli.

Le chemin du bundle est configurable : `AI_XGBOOST_BUNDLE_PATH`, `AI_ISOLATION_FOREST_PATH` (préfixe
`AI_`, cf. `app/config.py`).

---

## 7. CI/CD — `train-models.yml`

Déclenché par tout changement de `ai-models/dataset-generator/**`, `ai-models/training/**` (ou
manuellement). Chaîne :

`génération/localisation dataset → pytest → entraînement (porte qualité --min-f1 0.80 --min-auc 0.95) → Isolation Forest → rapport HTML → publication des artefacts`.

> ⚠️ La CI suppose un dataset disponible : soit produit par `ai-models/dataset-generator` (source de
> vérité), soit présent dans `ai-models/datasets/`. Les CSV étant gitignorés, assurez-vous que le
> générateur est exécutable en CI (ou committez une fixture).

---

## 8. Pièges courants & dépannage

| Symptôme                                                               | Cause probable                          | Solution                                                                |
| ---------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `ModuleNotFoundError: training`                                        | Paquet non installé                     | `pip install -e .` depuis `ai-models/training`.                         |
| `FileNotFoundError: dataset`                                           | CSV absent                              | Générer le dataset ou passer `--dataset <chemin>`.                      |
| `ModuleNotFoundError: training.features` au chargement côté ai-service | Bundle désérialisé sans le paquet       | Installer `ai-models/training` dans l'env du service.                   |
| `UnicodeEncodeError` (console Windows)                                 | cp1252 vs `→`/`✅`                      | Géré par `data.configure_console()` ; à défaut `set PYTHONUTF8=1`.      |
| MLflow non journalisé                                                  | Lib absente                             | Normal — repli `*.run.json`. `pip install -e .[mlflow]` pour l'activer. |
| Porte qualité en échec en CI                                           | Régression du modèle ou dataset modifié | Inspecter `metadata.json` (métriques + `dataset_sha256`).               |

---

## 9. Reproductibilité

- **Graine unique** (`--random-state`, défaut 42) pour la découpe ET les modèles.
- `metadata.json` enregistre : `dataset_sha256`, versions (Python/sklearn/xgboost), hyperparamètres,
  métriques val+test, liste des variables.
- L'évaluation reconstitue le **même** jeu de test à partir de la graine stockée.

---

_NINA-AES Platform — UQAR — Pipeline IA v1.0 — 2026_
