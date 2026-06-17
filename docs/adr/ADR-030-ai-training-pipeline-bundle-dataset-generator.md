# ADR-030 — Pipeline d'entraînement IA : bundle joblib auto-suffisant, anti-fuite, et générateur de dataset reconstruit

## Statut

Accepté — 2026-06-17

## Contexte

Le `ai-service` (port 3003, Bloc A) détecte les erreurs de saisie NINA. Le scaffold exposait
`/health` mais **aucun modèle entraîné** : ni pipeline reproductible, ni artefact, ni intégration.
PROMPT 4.3 livre `ai-models/training/` (entraînement + évaluation + export) et son intégration dans
`ai-service`.

Deux contraintes de contexte ont pesé sur les décisions :

1. **Découplage entraînement / service** : les variables (features) doivent être produites
   **identiquement** à l'entraînement et à l'inférence, sans dupliquer le code.
2. **Souveraineté + poste étudiant Windows** : zéro dépendance lourde obligatoire, pas de CDN
   externe, exécution locale simple, et un environnement où une saturation disque (ENOSPC) avait
   déjà tronqué des fichiers à 0 octet — dont la **source du générateur de dataset** (seul
   subsistait le bytecode `__pycache__`).

## Décisions

### 1. Bundle joblib **auto-suffisant** (modèle + FeatureBuilder + LabelEncoder)

L'export est un seul `.joblib` contenant le `XGBClassifier`, le `FeatureBuilder` **ajusté** et le
`LabelEncoder`, plus un `metadata.json` lisible (« model card »).

- **Pourquoi** : le service charge le bundle tel quel et reproduit les variables **exactement**
  comme à l'entraînement — aucune logique de features dupliquée entre `training` et `ai-service` (la
  classe de features _voyage avec_ le modèle).
- **Conséquence** : `joblib.load` côté service doit pouvoir importer
  `training.features`/`training.nina`. En prod : `pip install -e ai-models/training` ; en dev :
  `ai-service` ajoute `ai-models/training/src` au `sys.path` en repli.

### 2. `FeatureBuilder` fit/transform — référentiels appris sur **TRAIN seul** (anti-fuite)

Les référentiels (noms canoniques, codes Soundex, table région↔code) sont appris dans
`fit(df_train)` **après** la découpe stratifiée 60/20/20, et `transform` ne lit **jamais** la cible.
Val/test et le chemin d'inférence (sans libellé) sont donc exempts de fuite. `transform` est
**auto-défensif** (crée les colonnes manquantes via une source unique `REQUIRED_TEXT_COLUMNS`) pour
rendre l'inférence mono-ligne robuste sans liste de colonnes dupliquée côté service.

### 3. Cible **multi-classes** (`error_type`) plutôt que binaire

Le modèle prédit le **type** d'erreur (8 classes + `none`). L'AUC binaire « erreur vs propre » est
**dérivée** (`1 − P(none)`), en plus de l'AUC multi OVR pondérée et des precision/recall **par type
d'erreur**.

- **Pourquoi** : le portail agent a besoin du _type_ pour proposer la bonne correction, pas
  seulement d'un drapeau binaire. Une seule passe d'entraînement fournit les deux niveaux de
  métrique.
- **Encodage** : `LabelEncoder.classes_` est forcé à un **ordre canonique** (indices de colonnes
  proba stables, partagés avec le service) ; un garde-fou de round-trip transforme toute régression
  d'encodage en échec **bruyant**.

### 4. MLflow **optionnel** (repli JSON)

Le tracking MLflow est activable mais **non requis** : sans la lib, le pipeline écrit un
`*.run.json`. La CI tourne `--no-mlflow`.

- **Pourquoi** : ne pas imposer un serveur de tracking pour un projet étudiant souverain ; le
  pipeline reste exécutable hors-ligne. Les métriques durables vivent dans `metadata.json`
  (versionnable).

### 5. Évaluation HTML en **SVG sans dépendance**

Le rapport (matrice de confusion, ROC, distribution des scores) est généré en **SVG inline** — ni
matplotlib, ni JS, ni CDN.

- **Pourquoi** : matplotlib n'est pas garanti présent ; surtout, la convention du dépôt (« charts
  SVG sans deps ») et la souveraineté excluent tout asset externe.

### 6. Intégration `ai-service` : chargement **non bloquant** + reload **gardé**

Le modèle est chargé au démarrage (`lifespan`) **sans bloquer** le boot si l'artefact manque (le
service reste « live », `model_loaded=false`). `POST /reload-models` recharge à chaud, **gardé par
`X-Admin-Token`** quand `AI_ADMIN_TOKEN` est défini (complète, sans le remplacer, le RBAC Keycloak —
doc 08). Le `ModelRegistry` est thread-safe (RLock) et valide la **forme** du bundle avant de
l'exposer.

### 7. Générateur de dataset **reconstruit** + référentiel embarqué (régions NINA 1-9)

`ai-models/dataset-generator` est ré-écrit (source perdue par ENOSPC) à partir du schéma et des
distributions du premier dataset. Son référentiel (`catalog.json`, régions **héritées 1-9**) est
**amorcé** depuis ce dataset puis figé comme donnée du paquet. Les `error_type` produits sont
**alignés** sur la taxonomie de `training`.

- **Pourquoi le 1 chiffre région** : le format NINA encode la région sur **un seul chiffre**
  (héritage RAVEC) ; les régions post-2023 (codes ≥ 10) n'y sont pas représentables (limite
  documentée, cf. `features.py::_canon_region`).
- **Porte qualité CI** : `train_xgboost --min-f1 --min-auc` fait échouer le job si la qualité
  s'effondre.

## Conséquences

### Positives

- Une seule source de vérité des variables (le `FeatureBuilder` sérialisé) ⇒ pas de dérive
  entraînement/service.
- Pipeline reproductible (graine unique, `dataset_sha256`, versions dans `metadata.json`) et
  exécutable hors-ligne (MLflow optionnel, SVG sans CDN).
- Anti-fuite vérifié (fit sur train, transform sans cible) ; reload à chaud sûr.
- Données 100 % synthétiques, souveraines ; CI régénère le dataset de bout en bout.

### Négatives / limites

- **Couplage de désérialisation** : `ai-service` doit pouvoir importer le paquet `training` pour
  charger le bundle (mitigé par le repli `sys.path` + doc).
- **Séparabilité synthétique élevée** : les métriques (f1 ≈ 0.87, AUC ≈ 0.99) surestiment la
  performance réelle RAVEC (mise en garde inscrite dans `metadata.json` et les READMEs).
- **Régions ≥ 10 non gérées** par le champ NINA 1-chiffre (limite de format).
- **Générateur = reconstruction**, pas la source d'origine (perdue) ; fidèle au schéma/distributions
  mais non bit-identique.
- **Intégrité du bundle** : vérification **SHA-256** (sidecar `.joblib.sha256` produit à
  l'entraînement, vérifié avant désérialisation ; `AI_REQUIRE_SIGNED_BUNDLE` pour l'exiger). Une
  **signature cryptographique forte** (Vault Transit / cosign) reste à ajouter (doc 15).
- **RBAC service livré** (`app/auth.py`) : Bearer **RS256/JWKS** + contrôle de rôle (`AI_JWKS_URL`),
  repli `X-Admin-Token`, dev ouvert. L'intégration au flux gateway `X-User-Context` (ADR-029) et la
  matrice de rôles complète relèvent de la doc 08.
- **Dockerfile** : la variante autonome `services/ai-service/Dockerfile` est corrigée (3.13-slim,
  `app.main:app`, `training` sur PYTHONPATH, `/health`). Le **provisioning du bundle** en production
  (volume / MinIO) reste à définir (doc 20).

## Alternatives écartées

| Alternative                                                                          | Pourquoi écartée                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Exporter le modèle seul (XGBoost `.json`) + ré-implémenter les features côté service | Duplication de logique ⇒ dérive train/serve garantie                                                          |
| Classifieur **binaire** (erreur / pas erreur)                                        | Ne donne pas le _type_ d'erreur nécessaire à la correction ; l'info multi-classes est gratuite                |
| MLflow **obligatoire**                                                               | Impose un serveur de tracking ; casse l'exécution hors-ligne souveraine                                       |
| matplotlib / Plotly pour les graphiques                                              | Dépendance non garantie / CDN ; SVG inline respecte la convention « sans deps »                               |
| `LabelEncoder` trié alphabétiquement (défaut sklearn)                                | Indices de colonnes proba instables vis-à-vis du service ; l'ordre canonique est requis                       |
| Committer une fixture CSV pour la CI au lieu de restaurer le générateur              | Perd la source de vérité des données ; le générateur est réutilisable et testable                             |
| Charger le modèle en **bloquant** le boot                                            | Une absence d'artefact rendrait le service non-« live » ; le chargement paresseux + reload est plus résilient |

## Références

- Doc 11 — AI Service FastAPI · ADR-004 (FastAPI) · ADR-015 (stack ML/NLP détection erreurs)
- ADR-023 — SIGAC (Isolation Forest) : `train_anomaly.py` amorce le détecteur d'anomalies du Bloc D
- ADR-027 — guards locaux par service · doc 08 (RBAC Keycloak, garde ADMIN cible du reload)
- `ai-models/training/README.md` · `ai-models/dataset-generator/README.md` ·
  `services/ai-service/README.md`
- `packages/utils/src/nina.ts` (algorithme de la lettre de contrôle — parité vérifiée)
- Incident ENOSPC : cf. mémoire « Turbo cache sature le disque » (troncature à 0 octet)
