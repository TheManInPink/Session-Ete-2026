# `ai-models/` — Modèles & données du module IA NINA

> **Bloc concerné** : A (NINA Mali) **Phase** : P4 — Module IA Ce dossier regroupe **(1)** le
> générateur de dataset synthétique, **(2)** les datasets produits, **(3)** les scripts
> d'entraînement et **(4)** les modèles sérialisés consommés par `services/ai-service` (FastAPI,
> port 3003).

```text
ai-models/
├── dataset-generator/      # ⭐ Pipeline de génération (PROMPT 4.2) — package Python
│   ├── config/
│   │   ├── names.yml             # 200 prénoms M + 200 F + 150 patronymes + 50 villages (FICTIFS)
│   │   └── error-patterns.yml    # Catalogue des 8 types d'erreurs + fréquences
│   ├── src/dataset_generator/    # Code du package (layout « src »)
│   ├── samples/                  # Échantillon CSV de 1000 lignes (versionné)
│   └── tests/                    # Tests pytest
├── datasets/               # CSV complets générés (volumineux, souvent .gitignore)
├── scripts/                # generate_synthetic_dataset.py (variante légère) + train_xgboost.py
├── trained/                # Modèles sérialisés (nina_detector_v1.pkl)
└── evaluation/             # Rapports d'évaluation
```

---

## 1. Pourquoi un dataset 100 % synthétique ? (démarche éthique)

Le module IA (objectif **O2** : détection/correction des erreurs de saisie) doit être entraîné sur
des enregistrements d'état civil. **Utiliser de vraies données RAVEC est interdit et inutile** :

- **Souveraineté & vie privée** : les données NINA sont des données personnelles sensibles. Le
  principe directeur n°9 (conformité RGPD-like) et la **Loi malienne n°2022-013** sur la protection
  des données personnelles interdisent leur usage hors finalité et leur sortie du périmètre du
  CTDEC.
- **Aucune fuite possible** : un dataset synthétique ne contient, par construction, **aucune**
  information sur une personne réelle. Il peut être versionné, partagé avec le tuteur, publié en
  annexe du rapport.
- **Contrôle total du signal** : on **étiquette** chaque erreur (type + champ), ce qui serait
  impossible sur des données réelles non annotées. On reproduit les _caractéristiques statistiques_
  des erreurs documentées (fautes de frappe, variantes phonétiques, incohérences géographiques…)
  **sans copier** de cas réel.

> ⚠️ **Garantie** : tous les noms de `names.yml` sont **fictifs et anonymisés** ; les villages sont
> **inventés** (noms plausibles phonétiquement) puis rattachés à une région administrative
> historique. Toute ressemblance avec une personne ou une localité réelle serait fortuite.

---

## 2. Le pipeline de génération (`dataset-generator/`)

```text
config/names.yml ─┐
                  ├─► load_catalog() ─► generate_clean_record() ──┐
config/error-patterns.yml ─┘                                      │
                                       (tirage error_rate)        ▼
                                    inject_error(record, type) ─► DataFrame ─► CSV étiqueté
                                                                     │
                                                                     ▼
                                                  validate.py (invariants + distribution)
```

1. **`generate_clean_record()`** — un citoyen fictif **cohérent** : le sexe, la région (via un
   village du catalogue), la date de naissance et la langue sont mutuellement compatibles, et le
   **NINA est un vrai numéro** (14 chiffres + lettre de contrôle calculée).
2. **`inject_error(record, error_type)`** — applique **une** erreur du catalogue à une copie de
   l'enregistrement, et l'**étiquette** (`error_type`, `error_field`).
3. **`generate_dataset(n, error_rate)`** — produit `n` lignes dont ~`error_rate` portent une erreur,
   la répartition des types suivant `error-patterns.yml`.
4. **`validate.py`** — vérifie les invariants et la distribution du CSV produit.

### Catalogue des erreurs (`error-patterns.yml`)

Fréquences **conditionnelles** à `has_error = True` (somme = 100 %) :

| Type                  | Fréq. | Champ(s) visé(s)       | Description                            |
| --------------------- | :---: | ---------------------- | -------------------------------------- |
| `typo_substitution`   | 35 %  | first_name / last_name | Touche voisine (clavier AZERTY)        |
| `phonetic_spelling`   | 20 %  | first_name / last_name | Mohamed/Mohammed/Mahamadou, ou→u, c↔k… |
| `typo_omission`       | 15 %  | first_name / last_name | Lettre oubliée                         |
| `typo_insertion`      | 10 %  | first_name / last_name | Lettre doublée / insérée               |
| `field_inversion`     |  8 %  | first_name ↔ last_name | Nom et prénom intervertis              |
| `geographic_mismatch` |  7 %  | birth_region           | Région déclarée ≠ code région du NINA  |
| `date_format_error`   |  3 %  | birth_date             | Format MM/JJ au lieu de JJ/MM          |
| `invalid_checksum`    |  2 %  | nina                   | Lettre de contrôle erronée             |

### Schéma du CSV produit

`nina, last_name, first_name, birth_date, sex, region_code, birth_region, cercle, commune, village, father_name, mother_name, language, has_error, error_type, error_field`

**Invariants garantis** (vérifiés par `validate.py`) :

- le NINA est toujours **structurellement valide** ;
- `region_code == int(nina[5])` ;
- le checksum est **valide sauf** si `error_type == "invalid_checksum"`.

---

## 3. Utilisation

```bash
# Depuis ai-models/dataset-generator/ (recommandé : installation éditable)
pip install -e .

# Générer 10 000 lignes (40 % d'erreurs) → datasets/nina_synthetic_v1.csv
python -m dataset_generator.generate --output ../datasets/nina_synthetic_v1.csv -n 10000

# Valider le CSV produit
python -m dataset_generator.validate --csv ../datasets/nina_synthetic_v1.csv

# Synchroniser le référentiel de noms du service IA (après toute édition de names.yml)
#   → écrit data/mali/names.json, lu par services/ai-service/app/services/reference.py
python -m dataset_generator.export_reference

# Lancer les tests
pytest
```

> **Sans installation** : exporter `PYTHONPATH=src` (ou `set PYTHONPATH=src` sous PowerShell) avant
> les commandes `python -m …`.

### Échantillon versionné

`dataset-generator/samples/nina_synthetic_sample_1000.csv` — 1000 lignes, `seed=42`, généré et
validé (408 erronés / 40.8 %, distribution conforme, 0 doublon, 100 % des noms propres au
catalogue).

---

## 4. Compatibilité avec l'entraînement

Les colonnes du CSV sont un **sur-ensemble** de ce qu'attend `scripts/train_xgboost.py` (qui lit
`nina, first_name, last_name, birth_date, sex, birth_region, father_name, mother_name, has_error`
via `app/services/features.py`). Le dataset est donc **directement consommable** par le trainer
existant, tout en ajoutant les étiquettes fines `error_type` / `error_field` (utiles pour une future
classification **multi-classes**).

### ✅ Alignement IA ↔ dataset (drift résolu)

La taxonomie d'erreurs ci-dessus est plus riche que le jeu de features **initial** de
`app/services/features.py` (co-conçu avec l'ancien générateur léger). Mesure avant correctif : **AUC
≈ 0.58** (proche du hasard) — les features `*_is_common` étaient inopérantes (`reference.py` ne
connaissait que ~20 noms vs 350+ au catalogue) alors que **80 % des erreurs visent les noms**.

**Correctif appliqué** (3 actions) :

1. **`reference.py` chargé depuis le catalogue** — `data/mali/names.json` est généré depuis
   `names.yml` (`python -m dataset_generator.export_reference`) puis chargé **en plus** des listes
   embarquées. Les `*_is_common` redeviennent discriminants.
2. **`features.py` étendu** de 14 → **20 features** : `first/last_name_best_sim` (similarité
   RapidFuzz au catalogue → typos/phonétique), `*_phonetic_match` (Soundex africain),
   `name_order_suspect` (`field_inversion`), `date_format_invalid` (`date_format_error`). Le scorer
   passe désormais la date **brute** pour la parité train ↔ inférence.
3. **Ré-entraînement** (`scripts/train_xgboost.py`, source de vérité partagée des features).

**Résultat mesuré** : **AUC ≈ 0.98 · F1 ≈ 0.98** (XGBoost). Importances dominées par
`first_name_best_sim`, `last_name_phonetic_match`, `last_name_best_sim`, `*_is_common` ; le bruit
`birth_year` est retombé à ~0. Les 64 tests du service et les 13 du générateur passent.

> 🔁 **Penser à resynchroniser** : après toute édition de `names.yml`, relancer
> `python -m dataset_generator.export_reference` puis `train_xgboost.py`.

---

## 5. Reproductibilité

Toute la génération est **déterministe** : `generate_dataset(seed=…)` fixe à la fois le
`random.Random` (NINA, choix de noms, erreurs) **et** l'instance Faker (dates de naissance). Même
graine ⇒ dataset identique (test `test_determinism`).
