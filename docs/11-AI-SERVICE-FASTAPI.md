# 11 — AI Service FastAPI (Python 3.14 + XGBoost + RapidFuzz + spaCy)

> **Projet** : NINA-AES Platform **Document** : 11/26 **Service** : `ai-service` — Pipeline de
> détection d'erreurs NINA en 5 étapes **Port** : `3003` **Stack** : FastAPI 0.135 · uvicorn 0.35 ·
> Pydantic v2 · XGBoost 3.2 · RapidFuzz 3.14 · spaCy 3.8 · SHAP 0.48 · asyncpg 0.30 · Redis 8.6
> **Auteur** : Étudiant UQAR **Date** : Avril 2026 **Prérequis** :
> [03 — Setup Dev](./03-SETUP-ENVIRONNEMENT-DEV.md) ·
> [06 — Schema Prisma](./06-DATABASE-SCHEMA-PRISMA.md) ·
> [07 — Identity](./07-BACKEND-IDENTITY-SERVICE.md) **ADR** :
> [ADR-004 — FastAPI](./adr/ADR-004-fastapi.md) ·
> [ADR-015 — Stack ML/NLP](./adr/ADR-015-ml-stack-detection-erreurs-nina.md) ·
> [ADR-030 — Pipeline d'entraînement + bundle](./adr/ADR-030-ai-training-pipeline-bundle-dataset-generator.md)

> ✅ **Mise à jour PROMPT 4.3 (2026-06-17)** — Le pipeline d'entraînement est **livré** hors de ce
> document, dans [`ai-models/training/`](../ai-models/training/README.md) (XGBoost multi-classes,
> `FeatureBuilder` anti-fuite, bundle joblib auto-suffisant, éval HTML SVG) et son générateur de
> données [`ai-models/dataset-generator/`](../ai-models/dataset-generator/README.md). Le
> `ai-service` **charge le bundle au démarrage** et expose `GET /api/v1/ai/model-info`,
> `POST /api/v1/ai/reload-models` (gardé `X-Admin-Token`) et `POST /api/v1/ai/score`. Les sections
> ci-dessous (pipeline 5 étapes, dataset, `/analyze`) restent la **cible pédagogique complète** ;
> l'implémentation effective et ses décisions sont tracées dans **ADR-030** et le CHANGELOG (patch
> 0terdecies). En cas de divergence, **le code et l'ADR font foi**.

---

## Table des matières

1. [Objectif pédagogique](#1-objectif-pédagogique)
2. [Contexte métier — le problème des 18 % d'erreurs](#2-contexte-métier)
3. [Technologies utilisées (versions avril 2026)](#3-technologies-utilisées)
4. [Architecture du microservice](#4-architecture-du-microservice)
5. [Pipeline en 5 étapes — vue d'ensemble](#5-pipeline-en-5-étapes)
6. [Dataset synthétique — génération](#6-dataset-synthétique)
7. [Feature engineering — 40 features détaillées](#7-feature-engineering)
8. [Entraînement XGBoost + SHAP](#8-entraînement-xgboost--shap)
9. [Structure de dossiers Python](#9-structure-de-dossiers-python)
10. [Implémentation FastAPI — code intégral commenté](#10-implémentation-fastapi)
11. [Soundex africain maison](#11-soundex-africain)
12. [Dockerfile multi-stage Python 3.14](#12-dockerfile-multi-stage)
13. [Tests (pytest + golden-set)](#13-tests-pytest--golden-set)
14. [Observabilité — métriques Prometheus](#14-observabilité-prometheus)
15. [MLOps — retraining mensuel](#15-mlops--retraining-mensuel)
16. [Mini-rapport d'étape (template)](#16-mini-rapport-détape)
17. [Checklist de fin d'étape](#17-checklist-de-fin-détape)
18. [Pour aller plus loin](#18-pour-aller-plus-loin)

---

## 1. Objectif pédagogique

Construire le **cerveau analytique** de la plateforme : un service Python/FastAPI qui prend en
entrée un **enregistrement NINA** et produit en sortie :

- Un **score de confiance 0–100** (plus haut = moins de risque d'erreur)
- Une **liste d'anomalies détectées** avec type, gravité, feature impliquée
- Des **propositions de correction** automatiques quand possible
- Des **valeurs SHAP** expliquant chaque décision

Ce service alimente :

- L'**agent** via le dashboard admin : file de travail priorisée par risque
- Le **correction-service** : auto-approbation si score ≥ 85, rejet automatique si score < 40
- L'**audit-service** : traçabilité de chaque analyse
- L'**anticorruption-service** (Bloc D) : anomalies agrégées par agent

### Ce que tu vas apprendre

| Compétence                                  | Niveau        | Application                                   |
| ------------------------------------------- | ------------- | --------------------------------------------- |
| FastAPI async + Pydantic v2                 | Avancé        | 5 endpoints REST + validation stricte         |
| Pipeline ML reproductible                   | Expert        | 5 étapes modulaires, testables indépendamment |
| Feature engineering                         | Expert        | 40 features (fuzzy, phonétique, cohérence)    |
| XGBoost classification binaire + multiclass | Avancé        | Entraînement, tuning, sérialisation           |
| SHAP explicabilité                          | Avancé        | Values par prédiction, visualisation          |
| spaCy custom pipeline                       | Intermédiaire | Tokenisation + NER + règles personnalisées    |
| RapidFuzz optimisations                     | Intermédiaire | Batch matching, scorers combinés              |
| Soundex multilingue africain                | Expert        | Algorithme maison + tests                     |
| Async Python (asyncio + asyncpg)            | Avancé        | Pool connexions DB + concurrence              |
| Dockerfile Python multi-stage               | Avancé        | Image finale < 400 Mo                         |

### Livrable à la fin de ce document

- **5 endpoints REST** sur `http://localhost:3003/api/v1/ai/*`
- **Pipeline 5 étapes** intégralement implémenté
- **Dataset synthétique** de 10 000 enregistrements générés
- **Modèle XGBoost entraîné** (`nina_detector_v1.pkl`) avec AUC ≥ 0.92
- **Soundex africain** avec golden-set de 200 paires testées
- **Dockerfile** Python 3.14 alpine → image < 400 Mo
- **Tests** ≥ 85 % de couverture + 1 golden-set test fonctionnel
- **Métriques Prometheus** : latence par étape, compteurs par verdict, drift de features
- **Swagger** accessible sur `/docs`

---

## 2. Contexte métier

### 2.1 Sources d'erreurs documentées

Le registre NINA actuel comporte un taux d'erreur estimé entre 12 et 18 % selon les sources (rapport
CTDEC 2024, audit ONU 2025). Les causes principales :

1. **Saisie manuelle sur le terrain** (20 000+ opérateurs semi-formés)
2. **Transcription depuis actes d'état civil manuscrits** (écritures illisibles)
3. **Absence de standardisation orthographique** pour les prénoms africains
4. **Informatisation de registres papier anciens** (OCR approximatif)
5. **Collusion frauduleuse** (fiches dédoublées pour électeurs fictifs, cartes vendues)

### 2.2 Conséquences concrètes

- **Électorales** : listes électorales gonflées artificiellement
- **Administratives** : un citoyen refusé à un guichet parce que sa fiche réelle est marquée «
  décédé » (homonymie)
- **Économiques** : fraudes aux subventions sociales
- **Politiques** : contestation de la légitimité des scrutins

### 2.3 Rôle du `ai-service`

Le service **n'applique aucune correction automatique** seul : il **propose** des corrections à des
agents humains. C'est un **assistant à la décision**, pas un décideur. Ce positionnement est
critique pour l'acceptation politique et légale du système.

Les seules actions automatiques possibles :

- **Score ≥ 85** : proposer une auto-approbation qu'un superviseur peut contre-signer en un clic
- **Score < 40** : mettre le dossier en haut de la file de révision urgente
- **40 ≤ Score < 85** : file de révision standard par priorité décroissante

---

## 3. Technologies utilisées

| Dépendance                  | Version   | Rôle                                           |
| --------------------------- | --------- | ---------------------------------------------- |
| `python`                    | `3.14.0`  | Runtime                                        |
| `fastapi`                   | `0.135.0` | Framework web ASGI                             |
| `uvicorn[standard]`         | `0.35.0`  | Serveur ASGI production                        |
| `pydantic`                  | `2.11.3`  | Validation + sérialisation                     |
| `pydantic-settings`         | `2.9.1`   | Chargement .env typé                           |
| `xgboost`                   | `3.2.0`   | Gradient boosting                              |
| `scikit-learn`              | `1.8.0`   | Preprocessing, metrics, split                  |
| `shap`                      | `0.48.0`  | Explicabilité par prédiction                   |
| `rapidfuzz`                 | `3.14.1`  | Fuzzy matching ultra-rapide                    |
| `jellyfish`                 | `1.1.3`   | Soundex, Metaphone, Jaro-Winkler (compléments) |
| `spacy`                     | `3.8.5`   | NLP industriel                                 |
| `fr-core-news-md`           | `3.8.0`   | Modèle spaCy français                          |
| `pandas`                    | `2.3.2`   | DataFrames + feature engineering               |
| `numpy`                     | `2.3.0`   | Calculs vectoriels                             |
| `joblib`                    | `1.4.2`   | Sérialisation modèles                          |
| `onnxruntime`               | `1.22.0`  | Inférence ONNX (optionnel, export du modèle)   |
| `asyncpg`                   | `0.30.0`  | Pool Postgres async natif                      |
| `redis[hiredis]`            | `6.1.0`   | Cache feature + file travail                   |
| `aio-pika`                  | `9.5.0`   | AMQP async (pour publier vers audit)           |
| `prometheus-client`         | `0.23.0`  | Métriques                                      |
| `structlog`                 | `25.1.0`  | Logs JSON structurés                           |
| `opentelemetry-sdk`         | `1.30.0`  | Traces OTEL                                    |
| `python-jose[cryptography]` | `3.4.0`   | Vérification JWT RS256                         |
| `httpx`                     | `0.28.1`  | Client HTTP async (appels identity-service)    |
| `pytest`                    | `8.3.0`   | Framework tests                                |
| `pytest-asyncio`            | `0.25.0`  | Tests async                                    |
| `pytest-cov`                | `6.0.0`   | Couverture                                     |
| `faker`                     | `30.5.0`  | Dataset synthétique (noms FR + africains)      |
| `hypothesis`                | `6.125.0` | Property-based testing                         |
| `ruff`                      | `0.9.1`   | Linter ultra-rapide                            |
| `mypy`                      | `1.16.0`  | Vérification de types                          |

### Pourquoi Python 3.14 (et pas 3.12 LTS) ?

Python 3.14 (octobre 2025) apporte :

- **PEP 703** (GIL optionnel en `--without-gil`) : utile pour paralléliser le scoring batch sur 11M
  fiches
- **Performance** : +10–15 % sur le code NumPy/Pandas via spécialisations BOLT
- **Subinterpréters** (PEP 734) : isolation propre pour les workers FastAPI
- Toutes les bibliothèques cibles (XGBoost 3.2+, scikit-learn 1.8+) supportent 3.14

---

## 4. Architecture du microservice

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ai-service :3003                                │
│                                                                        │
│  ┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐  │
│  │  HTTP REST API   │    │  Batch worker   │    │  Prometheus      │  │
│  │  /ai/*           │    │  (asyncio task) │    │  /metrics        │  │
│  └────────┬─────────┘    └────────┬────────┘    └──────────────────┘  │
│           │                       │                                    │
│           ▼                       ▼                                    │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                 PIPELINE 5 ÉTAPES                              │   │
│  │                                                                │   │
│  │  ①Ingestion → ②Normalisation → ③Analyse → ④Scoring → ⑤Submit  │   │
│  │                                                                │   │
│  └────────┬───────────────────────────────────────┬───────────────┘   │
│           │                                       │                    │
│           ▼                                       ▼                    │
│  ┌───────────────────┐                  ┌────────────────────┐        │
│  │  ModelRegistry    │                  │  FeatureExtractor   │        │
│  │  - XGBoost .pkl   │                  │  - fuzzy (RapidFuzz)│        │
│  │  - SHAP explainer │                  │  - phonetic (maison)│        │
│  │  - version check  │                  │  - NLP (spaCy)      │        │
│  └───────────────────┘                  │  - coherence rules  │        │
│                                         └──────────┬──────────┘        │
│                                                    │                   │
│                                                    ▼                   │
│                                         ┌─────────────────────┐       │
│                                         │  CacheService       │       │
│                                         │  (Redis features)   │       │
│                                         └─────────────────────┘       │
│                                                                        │
│  ┌───────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │  PostgreSQL pool  │   │  RabbitMQ async  │   │  Vault           │  │
│  │  (read citizens)  │   │  (publish audit) │   │  (JWT pub key)   │  │
│  └───────────────────┘   └──────────────────┘   └──────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Pipeline en 5 étapes

### Étape ① Ingestion

Entrée : un NINA (ou un batch de NINA) ou un payload complet JSON.

Source :

- Option A : appel à `identity-service` via HTTP
- Option B : payload direct dans la requête `/analyze` (utilisé par `correction-service` quand le
  citoyen propose une correction)

Validation stricte via Pydantic v2 : format NINA `^\d{14}[A-Z]$`, dates ISO, etc.

### Étape ② Normalisation

- **Unicode NFC** (canonicalisation)
- **spaCy tokenisation** + lemmatisation sur les champs texte
- **Strip whitespace** + trim consonnes dupliquées
- **Lowercase avec préservation** (on garde l'original pour affichage)
- **Détection placeholder** : « XXX », « Inconnu », « N/A » → marqués `is_placeholder=True`
- **Normalisation dates** : conversion en ISO 8601, détection de dates impossibles

### Étape ③ Analyse (feature engineering)

Extraction des **40 features** (voir section 7) : fuzzy distances entre champs, phonétique
africaine, cohérence date-lieu, statistiques colonne, flags binaires.

### Étape ④ Scoring

- **Modèle XGBoost** chargé au démarrage → inference < 5 ms
- **SHAP** calcule les contributions feature par feature
- **Règles post-scoring** : overrides business (si NINA existe déjà avec mêmes
  `first_name + last_name + birth_date`, force anomaly = duplicate)

Sortie :

```python
{
  "score": 87.3,
  "verdict": "HIGH_CONFIDENCE",  # HIGH >=85, MEDIUM 60-85, LOW <60
  "anomalies": [
    { "type": "fuzzy_duplicate", "severity": "medium", "confidence": 0.72, "details": {...} },
  ],
  "explanations": [
    { "feature": "fuzzy_name_max", "shap_value": -8.2, "description": "..." },
  ],
  "proposed_corrections": [
    { "field": "first_name", "current": "Mamadu", "proposed": "Mamadou", "confidence": 0.91 },
  ],
  "processing_ms": 32.5
}
```

### Étape ⑤ Soumission

- Si score ≥ 85 : propose auto-approbation au `correction-service`
- Si score < 40 : crée une `CorrectionRequest` en file urgente
- Sinon : insertion en file de revue standard
- Publication AMQP sur `audit.events` avec `action=ai.analysis.completed`

---

## 6. Dataset synthétique

### 6.1 Pourquoi synthétique ?

Aucun dataset réel de NINA avec erreurs étiquetées n'existe. Et utiliser des données réelles serait
:

- **Illégal** (RGPD/Loi malienne sur les données personnelles 2022-013)
- **Éthiquement inacceptable** sans consentement explicite des citoyens
- **Techniquement impossible** (personne n'a étiqueté les erreurs)

On génère donc **10 000 enregistrements réalistes** avec des erreurs **contrôlées et étiquetées**.

### 6.2 Schéma du générateur

Fichier : `ai-models/scripts/generate_synthetic_dataset.py`

```python
"""
Génère un dataset synthétique de 10 000 enregistrements NINA.
~50% corrects, ~50% avec une ou plusieurs erreurs contrôlées.
"""
from __future__ import annotations

import random
import string
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
from faker import Faker

fake_fr = Faker('fr_FR')
Faker.seed(42)
random.seed(42)

# Prénoms et noms africains courants (liste étoffée en prod)
PRENOMS_M = ["Mamadou", "Aliou", "Modibo", "Boubacar", "Ousmane", "Adama", "Seydou",
             "Ibrahim", "Moussa", "Sékou", "Alpha", "Bakary", "Drissa", "Issa"]
PRENOMS_F = ["Fatoumata", "Aïssata", "Kadiatou", "Hawa", "Mariama", "Rokia",
             "Djénéba", "Aminata", "Oumou", "Salimata", "Assitan"]
NOMS = ["Traoré", "Diarra", "Keita", "Coulibaly", "Diallo", "Sidibé", "Sangaré",
        "Touré", "Dembélé", "Konaté", "Samaké", "Togola", "Bagayogo", "Maïga"]

REGIONS = ["Bamako", "Kayes", "Koulikoro", "Sikasso", "Ségou", "Mopti",
           "Tombouctou", "Gao", "Kidal", "Taoudénit", "Ménaka"]

SEXES = ["M", "F"]
LANGUAGES = ["fr", "bm", "snk", "ff", "tmq", "hau", "mos", "dje"]

PLACEHOLDERS = ["XXX", "Inconnu", "N/A", "???", "..."]


def generate_nina(birth_date: date, sex: str) -> str:
    """Format : YYYYMMDD + 6 chiffres + 1 lettre contrôle."""
    base = birth_date.strftime('%Y%m%d') + ''.join(random.choices(string.digits, k=6))
    # Lettre contrôle déterministe (simplifiée pour synthétique)
    ctrl = chr(ord('A') + sum(int(c) for c in base) % 26)
    return base + ctrl


def typo(s: str) -> str:
    """Introduit une faute de frappe réaliste."""
    if len(s) < 3:
        return s
    i = random.randint(1, len(s) - 2)
    op = random.choice(['swap', 'delete', 'duplicate', 'replace'])
    if op == 'swap':
        return s[:i] + s[i+1] + s[i] + s[i+2:]
    if op == 'delete':
        return s[:i] + s[i+1:]
    if op == 'duplicate':
        return s[:i+1] + s[i] + s[i+1:]
    # replace
    return s[:i] + random.choice(string.ascii_lowercase) + s[i+1:]


def transliterate(s: str) -> str:
    """Variations de translittération courantes."""
    rules = [('ou', 'u'), ('é', 'e'), ('è', 'e'), ('ç', 's'), ('ï', 'i')]
    for a, b in rules:
        if a in s.lower() and random.random() < 0.4:
            s = s.replace(a, b).replace(a.capitalize(), b.capitalize())
    return s


def gen_row(idx: int) -> dict:
    sex = random.choice(SEXES)
    first = random.choice(PRENOMS_M if sex == 'M' else PRENOMS_F)
    last = random.choice(NOMS)
    birth = fake_fr.date_between(start_date='-90y', end_date='-18y')
    region = random.choice(REGIONS)

    errors: list[str] = []
    original_first, original_last = first, last

    # 50% d'enregistrements avec erreurs
    if random.random() < 0.5:
        kind = random.choice([
            'typo_name', 'translit_name', 'placeholder_parent',
            'impossible_date', 'duplicate_candidate', 'wrong_region',
            'mixed_case_chaos',
        ])
        if kind == 'typo_name':
            if random.random() < 0.5:
                first = typo(first)
            else:
                last = typo(last)
            errors.append('typo_name')
        elif kind == 'translit_name':
            first = transliterate(first)
            errors.append('translit_name')
        elif kind == 'placeholder_parent':
            father = random.choice(PLACEHOLDERS)
            mother = random.choice(PLACEHOLDERS)
            errors.append('placeholder_parent')
        elif kind == 'impossible_date':
            birth = date(1800, 1, 1)  # date trop ancienne
            errors.append('impossible_date')
        elif kind == 'mixed_case_chaos':
            first = ''.join(random.choice([c.lower(), c.upper()]) for c in first)
            errors.append('mixed_case_chaos')

    # Parents (non systématiques)
    father = random.choice(PRENOMS_M) + ' ' + random.choice(NOMS) if 'placeholder_parent' not in errors else random.choice(PLACEHOLDERS)
    mother = random.choice(PRENOMS_F) + ' ' + random.choice(NOMS) if 'placeholder_parent' not in errors else random.choice(PLACEHOLDERS)

    return {
        'nina': generate_nina(birth, sex),
        'first_name': first,
        'last_name': last,
        'original_first': original_first,
        'original_last': original_last,
        'birth_date': birth.isoformat(),
        'sex': sex,
        'birth_region': region,
        'father_name': father,
        'mother_name': mother,
        'language': random.choice(LANGUAGES),
        'has_error': bool(errors),
        'error_types': ','.join(errors),
    }


def main(n: int = 10_000, out: str = 'ai-models/datasets/synthetic_nina_v1.csv'):
    rows = [gen_row(i) for i in range(n)]
    df = pd.DataFrame(rows)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False, encoding='utf-8')
    print(f"✅ Généré {n} enregistrements → {out}")
    print(df['has_error'].value_counts())
    print(df['error_types'].value_counts().head(10))


if __name__ == '__main__':
    main()
```

Exécution :

```bash
cd nina-aes-platform
python ai-models/scripts/generate_synthetic_dataset.py
# → ai-models/datasets/synthetic_nina_v1.csv (10 000 lignes)
```

---

## 7. Feature engineering

### 7.1 Catalogue des 40 features

Fichier : `services/ai-service/src/features/extractor.py`

| #   | Feature                           | Type    | Description                                           |
| --- | --------------------------------- | ------- | ----------------------------------------------------- |
| 1   | `first_name_length`               | int     | Longueur du prénom                                    |
| 2   | `last_name_length`                | int     | Longueur du nom                                       |
| 3   | `first_name_has_digit`            | bool    | Présence de chiffre dans prénom                       |
| 4   | `first_name_has_special`          | bool    | Caractères non-alpha                                  |
| 5   | `first_name_mixed_case`           | bool    | Casse incohérente (ex: « aLiOu »)                     |
| 6   | `first_name_is_placeholder`       | bool    | Placeholder détecté                                   |
| 7   | `first_name_in_common_list`       | bool    | Prénom dans liste référence                           |
| 8   | `last_name_in_common_list`        | bool    | Nom dans liste référence                              |
| 9   | `name_nina_consistency`           | bool    | Cohérence sex NINA ↔ sex déclaré                      |
| 10  | `father_is_placeholder`           | bool    | Père = placeholder                                    |
| 11  | `mother_is_placeholder`           | bool    | Mère = placeholder                                    |
| 12  | `both_parents_placeholder`        | bool    | Les 2 parents absents                                 |
| 13  | `birth_date_year`                 | int     | Année de naissance                                    |
| 14  | `age_years`                       | int     | Âge calculé                                           |
| 15  | `birth_date_impossible`           | bool    | < 1900 ou > today                                     |
| 16  | `birth_date_suspicious`           | bool    | Année avec trop de naissances identiques              |
| 17  | `birth_dow`                       | int     | Jour de la semaine (0-6)                              |
| 18  | `birth_is_first_jan`              | bool    | 1er janvier (souvent valeur par défaut)               |
| 19  | `fuzzy_name_max`                  | float   | Max RapidFuzz ratio avec les 10 plus proches NINA     |
| 20  | `fuzzy_name_count_above_90`       | int     | Nb de NINA existants avec ratio > 90                  |
| 21  | `fuzzy_full_name_max`             | float   | Fuzzy sur prenom+nom concaténés                       |
| 22  | `soundex_africain_match_count`    | int     | Nb de NINA avec même Soundex africain                 |
| 23  | `metaphone_match_count`           | int     | Nb de NINA avec même Metaphone                        |
| 24  | `duplicate_birthdate_parents`     | bool    | Même date + mêmes parents existe déjà                 |
| 25  | `region_code_valid`               | bool    | Région dans liste AES                                 |
| 26  | `commune_exists_in_region`        | bool    | Commune cohérente avec région                         |
| 27  | `language_matches_region`         | bool    | Langue plausible pour la région                       |
| 28  | `spacy_entity_count`              | int     | Nb d'entités PER détectées par spaCy                  |
| 29  | `spacy_lang_detected`             | str→enc | Langue détectée par spaCy (one-hot)                   |
| 30  | `has_diacritics`                  | bool    | Présence d'accents                                    |
| 31  | `diacritic_ratio`                 | float   | % caractères accentués                                |
| 32  | `name_entropy`                    | float   | Entropie de Shannon du prénom+nom                     |
| 33  | `consonant_run_max`               | int     | Plus longue suite de consonnes                        |
| 34  | `vowel_run_max`                   | int     | Plus longue suite de voyelles                         |
| 35  | `nina_checksum_valid`             | bool    | Lettre de contrôle valide                             |
| 36  | `name_is_abbreviated`             | bool    | Moins de 3 lettres par mot                            |
| 37  | `name_in_watchlist`               | bool    | Match watchlist (personnes décédées, anti-corruption) |
| 38  | `submitted_by_agent_anomaly_rate` | float   | Taux d'anomalies historiques de l'agent               |
| 39  | `submitted_by_velocity_1h`        | int     | Nb de soumissions de cet agent dans la dernière heure |
| 40  | `geolocation_distance_km`         | float   | Distance résidence ↔ lieu naissance (km)              |

### 7.2 Implémentation

```python
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

import jellyfish
import numpy as np
import spacy
from rapidfuzz import fuzz, process

from ..phonetic.african_soundex import african_soundex

_PLACEHOLDERS = {"xxx", "x", "inconnu", "n/a", "na", "???", "...", ""}
_COMMON_FIRST = {"mamadou", "aliou", "fatoumata", ...}  # chargé depuis fichier
_COMMON_LAST = {"traoré", "traore", "diarra", "keita", ...}


@dataclass
class CitizenRecord:
    nina: str
    first_name: str
    last_name: str
    birth_date: date
    sex: str
    birth_region: str
    father_name: str | None
    mother_name: str | None
    language: str | None


class FeatureExtractor:
    def __init__(self, nlp: spacy.Language, nina_index: list[dict]):
        self._nlp = nlp
        self._nina_index = nina_index  # sample of existing NINA for fuzzy lookup

    def extract(self, r: CitizenRecord, context: dict[str, Any] | None = None) -> dict[str, Any]:
        ctx = context or {}
        f: dict[str, Any] = {}

        # Basic string features
        f["first_name_length"] = len(r.first_name)
        f["last_name_length"] = len(r.last_name)
        f["first_name_has_digit"] = any(c.isdigit() for c in r.first_name)
        f["first_name_has_special"] = bool(re.search(r"[^A-Za-zÀ-ÿ\s\-']", r.first_name))
        f["first_name_mixed_case"] = self._is_mixed_case(r.first_name)
        f["first_name_is_placeholder"] = r.first_name.strip().lower() in _PLACEHOLDERS
        f["first_name_in_common_list"] = r.first_name.strip().lower() in _COMMON_FIRST
        f["last_name_in_common_list"] = r.last_name.strip().lower() in _COMMON_LAST

        # NINA consistency
        f["name_nina_consistency"] = self._nina_matches_sex(r.nina, r.sex)

        # Parents
        f["father_is_placeholder"] = (r.father_name or "").strip().lower() in _PLACEHOLDERS
        f["mother_is_placeholder"] = (r.mother_name or "").strip().lower() in _PLACEHOLDERS
        f["both_parents_placeholder"] = f["father_is_placeholder"] and f["mother_is_placeholder"]

        # Dates
        f["birth_date_year"] = r.birth_date.year
        today = date.today()
        f["age_years"] = today.year - r.birth_date.year
        f["birth_date_impossible"] = r.birth_date.year < 1900 or r.birth_date > today
        f["birth_date_suspicious"] = False  # TODO calcul par année
        f["birth_dow"] = r.birth_date.weekday()
        f["birth_is_first_jan"] = r.birth_date.month == 1 and r.birth_date.day == 1

        # Fuzzy matching
        full = f"{r.first_name} {r.last_name}"
        matches = process.extract(
            full,
            [f"{c['first_name']} {c['last_name']}" for c in self._nina_index],
            scorer=fuzz.token_sort_ratio,
            limit=10,
        )
        scores = [m[1] for m in matches]
        f["fuzzy_name_max"] = max(scores) if scores else 0
        f["fuzzy_name_count_above_90"] = sum(1 for s in scores if s > 90)
        f["fuzzy_full_name_max"] = f["fuzzy_name_max"]

        # Phonétique
        af_sdx = african_soundex(f"{r.first_name} {r.last_name}")
        f["soundex_africain_match_count"] = sum(
            1 for c in self._nina_index
            if african_soundex(f"{c['first_name']} {c['last_name']}") == af_sdx
        )
        try:
            mph = jellyfish.metaphone(r.last_name)
            f["metaphone_match_count"] = sum(
                1 for c in self._nina_index
                if jellyfish.metaphone(c["last_name"]) == mph
            )
        except Exception:
            f["metaphone_match_count"] = 0

        # Duplicate candidate
        f["duplicate_birthdate_parents"] = self._has_duplicate(r)

        # Region / language coherence
        f["region_code_valid"] = r.birth_region in AES_REGIONS
        f["commune_exists_in_region"] = True  # TODO lookup
        f["language_matches_region"] = self._language_plausible(r.language, r.birth_region)

        # spaCy
        doc = self._nlp(full)
        f["spacy_entity_count"] = len([e for e in doc.ents if e.label_ == "PER"])
        f["spacy_lang_detected"] = getattr(doc._, "language", "fr")

        # Diacritics
        diacritics = sum(1 for c in full if c in "àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ")
        f["has_diacritics"] = diacritics > 0
        f["diacritic_ratio"] = diacritics / max(len(full), 1)

        # Entropy
        f["name_entropy"] = self._shannon_entropy(full.lower())

        # Consonant/vowel runs
        f["consonant_run_max"] = self._max_run(full.lower(), vowels=False)
        f["vowel_run_max"] = self._max_run(full.lower(), vowels=True)

        # Checksum NINA
        f["nina_checksum_valid"] = self._nina_checksum_valid(r.nina)

        # Name abbreviated
        f["name_is_abbreviated"] = any(len(w) < 3 for w in full.split())

        # Watchlist
        f["name_in_watchlist"] = False  # TODO lookup Redis

        # Agent context
        f["submitted_by_agent_anomaly_rate"] = ctx.get("agent_anomaly_rate", 0.0)
        f["submitted_by_velocity_1h"] = ctx.get("agent_velocity_1h", 0)

        # Geolocation
        f["geolocation_distance_km"] = ctx.get("residence_birth_distance_km", 0.0)

        return f

    @staticmethod
    def _is_mixed_case(s: str) -> bool:
        if len(s) < 3:
            return False
        cnt_upper = sum(1 for c in s[1:] if c.isupper())
        cnt_lower = sum(1 for c in s[1:] if c.islower())
        return cnt_upper > 1 and cnt_lower > 1 and cnt_upper / len(s) > 0.3

    @staticmethod
    def _nina_matches_sex(nina: str, sex: str) -> bool:
        # Règle simplifiée (adapter à la vraie logique CTDEC)
        return True

    @staticmethod
    def _shannon_entropy(s: str) -> float:
        if not s:
            return 0.0
        from collections import Counter
        counts = Counter(s)
        probs = [c / len(s) for c in counts.values()]
        return -sum(p * math.log2(p) for p in probs if p > 0)

    @staticmethod
    def _max_run(s: str, *, vowels: bool) -> int:
        vv = set("aeiouyàâäéèêëîïôöùûüÿ")
        best = cur = 0
        for c in s:
            is_v = c in vv
            if is_v == vowels:
                cur += 1
                best = max(best, cur)
            else:
                cur = 0
        return best

    @staticmethod
    def _nina_checksum_valid(nina: str) -> bool:
        if not re.match(r"^\d{14}[A-Z]$", nina):
            return False
        base = nina[:14]
        ctrl = nina[14]
        expected = chr(ord('A') + sum(int(c) for c in base) % 26)
        return expected == ctrl

    def _has_duplicate(self, r: CitizenRecord) -> bool:
        for c in self._nina_index:
            if (c["birth_date"] == r.birth_date.isoformat()
                    and c.get("father_name") == r.father_name
                    and c.get("mother_name") == r.mother_name):
                return True
        return False

    @staticmethod
    def _language_plausible(language: str | None, region: str) -> bool:
        plausibility = {
            "Bamako": {"fr", "bm"}, "Kayes": {"fr", "snk"}, "Sikasso": {"fr", "bm"},
            "Ségou": {"fr", "bm"}, "Mopti": {"fr", "ff", "bm"},
            "Tombouctou": {"fr", "tmq", "ff"}, "Gao": {"fr", "dje", "tmq"},
            "Kidal": {"fr", "tmq"}, "Koulikoro": {"fr", "bm"},
        }
        return (language or "fr") in plausibility.get(region, {"fr"})


AES_REGIONS = {"Bamako", "Kayes", "Koulikoro", "Sikasso", "Ségou", "Mopti",
               "Tombouctou", "Gao", "Kidal", "Taoudénit", "Ménaka"}
```

---

## 8. Entraînement XGBoost + SHAP

### 8.1 Script d'entraînement

Fichier : `ai-models/scripts/train_xgboost.py`

```python
"""Entraîne le modèle XGBoost de détection d'erreurs NINA."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from sklearn.metrics import (classification_report, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, train_test_split


def load_dataset(csv: str = "ai-models/datasets/synthetic_nina_v1.csv") -> pd.DataFrame:
    df = pd.read_csv(csv, parse_dates=["birth_date"])
    df["birth_date"] = df["birth_date"].dt.date
    return df


def build_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Version simplifiée — en prod appelle FeatureExtractor."""
    feats = pd.DataFrame({
        "first_name_length": df["first_name"].str.len(),
        "last_name_length": df["last_name"].str.len(),
        "first_name_is_placeholder": df["first_name"].str.lower().isin(["xxx", "inconnu", "n/a"]).astype(int),
        "father_is_placeholder": df["father_name"].str.lower().isin(["xxx", "inconnu", "n/a"]).astype(int),
        "mother_is_placeholder": df["mother_name"].str.lower().isin(["xxx", "inconnu", "n/a"]).astype(int),
        "birth_year": pd.to_datetime(df["birth_date"]).dt.year,
        "birth_impossible": (pd.to_datetime(df["birth_date"]).dt.year < 1900).astype(int),
        "first_name_mixed_case": df["first_name"].apply(lambda s: sum(1 for c in s if c.isupper()) > 1 and sum(1 for c in s if c.islower()) > 1).astype(int),
        "has_diacritics": df["first_name"].apply(lambda s: any(c in "àâéèêëîïôöùûüç" for c in (s or ""))).astype(int),
    })
    X = feats.values
    y = df["has_error"].astype(int).values
    return X, y


def main():
    df = load_dataset()
    X, y = build_features(df)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric="auc",
        tree_method="hist",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    print("=== Metrics ===")
    print(f"AUC      : {roc_auc_score(y_test, y_prob):.4f}")
    print(f"Precision: {precision_score(y_test, y_pred):.4f}")
    print(f"Recall   : {recall_score(y_test, y_pred):.4f}")
    print(f"F1       : {f1_score(y_test, y_pred):.4f}")
    print(classification_report(y_test, y_pred))
    print(confusion_matrix(y_test, y_pred))

    # SHAP explainer
    explainer = shap.TreeExplainer(model)

    # Sauvegarde atomique
    out_dir = Path("ai-models")
    out_dir.mkdir(exist_ok=True)
    bundle = {
        "model": model,
        "explainer": explainer,
        "feature_names": [
            "first_name_length", "last_name_length", "first_name_is_placeholder",
            "father_is_placeholder", "mother_is_placeholder", "birth_year",
            "birth_impossible", "first_name_mixed_case", "has_diacritics",
        ],
        "version": "v1.0.0",
        "trained_at": date.today().isoformat(),
    }
    joblib.dump(bundle, out_dir / "nina_detector_v1.pkl")
    print(f"✅ Modèle sauvegardé → ai-models/nina_detector_v1.pkl")

    # Cross-val pour métrique plus fiable
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    from sklearn.model_selection import cross_val_score
    scores = cross_val_score(model, X, y, cv=cv, scoring="roc_auc", n_jobs=-1)
    print(f"CV AUC: {scores.mean():.4f} ± {scores.std():.4f}")


if __name__ == "__main__":
    main()
```

### 8.2 Résultats attendus

Sur un dataset synthétique de 10 000 :

```
AUC       : 0.94+
Precision : 0.89
Recall    : 0.87
F1        : 0.88
CV AUC    : 0.93 ± 0.01
```

---

## 9. Structure de dossiers Python

```
services/ai-service/
├── pyproject.toml                    # Poetry ou setuptools
├── Dockerfile
├── .env.example
├── src/
│   └── ai_service/
│       ├── __init__.py
│       ├── main.py                   # FastAPI app factory
│       ├── settings.py               # Pydantic Settings
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes_analyze.py
│       │   ├── routes_batch.py
│       │   ├── routes_health.py
│       │   └── routes_feedback.py
│       ├── pipeline/
│       │   ├── __init__.py
│       │   ├── stage1_ingestion.py
│       │   ├── stage2_normalization.py
│       │   ├── stage3_analysis.py
│       │   ├── stage4_scoring.py
│       │   └── stage5_submission.py
│       ├── features/
│       │   ├── __init__.py
│       │   └── extractor.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── registry.py           # Charge nina_detector_v1.pkl
│       │   └── schemas.py            # Pydantic v2
│       ├── phonetic/
│       │   ├── __init__.py
│       │   └── african_soundex.py
│       ├── adapters/
│       │   ├── __init__.py
│       │   ├── identity_client.py    # httpx vers identity-service
│       │   ├── postgres.py           # asyncpg pool
│       │   ├── redis_cache.py
│       │   └── audit_publisher.py    # aio-pika
│       ├── auth/
│       │   ├── __init__.py
│       │   └── jwt_verify.py
│       └── telemetry/
│           ├── __init__.py
│           ├── metrics.py
│           └── logger.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_extractor.py
│   ├── test_soundex.py
│   ├── test_pipeline_end_to_end.py
│   ├── test_routes_analyze.py
│   └── fixtures/
│       ├── known_errors.json         # golden-set
│       └── phonetic_pairs.json
└── README.md
```

---

## 10. Implémentation FastAPI

### 10.1 `main.py`

```python
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from .api import routes_analyze, routes_batch, routes_feedback, routes_health
from .models.registry import ModelRegistry
from .adapters.postgres import create_pool
from .adapters.redis_cache import create_redis
from .adapters.audit_publisher import AuditPublisher
from .settings import settings
from .telemetry.logger import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    # Startup
    app.state.db = await create_pool(settings.database_url)
    app.state.redis = await create_redis(settings.redis_url)
    app.state.registry = ModelRegistry.load(settings.model_path)
    app.state.audit = AuditPublisher(settings.rabbitmq_url)
    await app.state.audit.connect()
    yield
    # Shutdown
    await app.state.db.close()
    await app.state.redis.aclose()
    await app.state.audit.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="NINA-AES · ai-service",
        description="Détection d'erreurs NINA — pipeline ML 5 étapes",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(routes_health.router, tags=["health"])
    app.include_router(routes_analyze.router, prefix="/api/v1/ai", tags=["analyze"])
    app.include_router(routes_batch.router, prefix="/api/v1/ai", tags=["batch"])
    app.include_router(routes_feedback.router, prefix="/api/v1/ai", tags=["feedback"])
    app.mount("/metrics", make_asgi_app())
    return app


app = create_app()
```

### 10.2 `models/schemas.py` (Pydantic v2)

```python
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, constr, field_validator

NinaStr = constr(pattern=r"^\d{14}[A-Z]$")


class CitizenPayload(BaseModel):
    nina: NinaStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    birth_date: date
    sex: Literal["M", "F", "X"]
    birth_region: str = Field(min_length=1, max_length=80)
    birth_commune: str | None = None
    father_name: str | None = None
    mother_name: str | None = None
    language: Literal["fr", "bm", "snk", "ff", "tmq", "hau", "mos", "dje"] | None = None


class AnalyzeRequest(BaseModel):
    citizen: CitizenPayload | None = None
    nina_only: NinaStr | None = None
    context: dict | None = None

    @field_validator("*", mode="before")
    @classmethod
    def at_least_one(cls, v, info):
        return v


class Anomaly(BaseModel):
    type: str
    severity: Literal["low", "medium", "high", "critical"]
    confidence: float = Field(ge=0, le=1)
    details: dict


class Explanation(BaseModel):
    feature: str
    shap_value: float
    direction: Literal["positive", "negative"]
    description: str | None = None


class ProposedCorrection(BaseModel):
    field: str
    current_value: str
    proposed_value: str
    confidence: float = Field(ge=0, le=1)
    source: Literal["fuzzy_match", "phonetic_match", "placeholder_removal", "rule_based"]


class AnalyzeResponse(BaseModel):
    score: float = Field(ge=0, le=100)
    verdict: Literal["HIGH_CONFIDENCE", "MEDIUM_CONFIDENCE", "LOW_CONFIDENCE"]
    anomalies: list[Anomaly]
    explanations: list[Explanation]
    proposed_corrections: list[ProposedCorrection]
    processing_ms: float
    model_version: str
```

### 10.3 `api/routes_analyze.py`

```python
from __future__ import annotations

import time

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from ..auth.jwt_verify import require_role
from ..models.schemas import AnalyzeRequest, AnalyzeResponse
from ..pipeline.stage1_ingestion import ingest
from ..pipeline.stage2_normalization import normalize
from ..pipeline.stage3_analysis import analyze
from ..pipeline.stage4_scoring import score_record
from ..pipeline.stage5_submission import submit

router = APIRouter()
log = structlog.get_logger()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(
    request: AnalyzeRequest,
    http: Request,
    _claims=Depends(require_role("AGENT", "ADMIN", "SYSTEM")),
) -> AnalyzeResponse:
    t0 = time.perf_counter()
    try:
        record = await ingest(request, http.app.state.db)
        normalized = normalize(record)
        features = analyze(normalized, http.app.state.registry, http.app.state.db)
        result = score_record(features, normalized, http.app.state.registry)
        await submit(result, normalized, http.app.state.audit, http.app.state.db)
    except Exception as e:
        log.exception("analyze.failed", nina=request.citizen.nina if request.citizen else request.nina_only)
        raise HTTPException(500, f"pipeline error: {e}")

    result.processing_ms = (time.perf_counter() - t0) * 1000
    return result
```

### 10.4 `pipeline/stage4_scoring.py`

```python
from __future__ import annotations

import numpy as np

from ..models.registry import ModelRegistry
from ..models.schemas import AnalyzeResponse, Anomaly, Explanation, ProposedCorrection


def score_record(features: dict, record, registry: ModelRegistry) -> AnalyzeResponse:
    X = np.array([[features[name] for name in registry.feature_names]])
    prob_error = float(registry.model.predict_proba(X)[0, 1])
    # score 0-100 : plus haut = moins de risque
    score = round((1.0 - prob_error) * 100, 1)

    # SHAP values
    shap_values = registry.explainer.shap_values(X)[0]
    top = sorted(
        zip(registry.feature_names, shap_values),
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:5]
    explanations = [
        Explanation(
            feature=name,
            shap_value=float(v),
            direction="negative" if v > 0 else "positive",
        )
        for name, v in top
    ]

    anomalies: list[Anomaly] = []
    if features.get("both_parents_placeholder"):
        anomalies.append(Anomaly(
            type="placeholder_parents",
            severity="high",
            confidence=0.95,
            details={"father": record.father_name, "mother": record.mother_name},
        ))
    if features.get("birth_date_impossible"):
        anomalies.append(Anomaly(
            type="impossible_date",
            severity="critical",
            confidence=1.0,
            details={"birth_date": record.birth_date.isoformat()},
        ))
    if features.get("fuzzy_name_count_above_90", 0) > 2:
        anomalies.append(Anomaly(
            type="potential_duplicate",
            severity="medium",
            confidence=0.7,
            details={"similar_count": features["fuzzy_name_count_above_90"]},
        ))

    proposed: list[ProposedCorrection] = []
    # (exemple : si placeholder, proposer vide ou valeur par défaut selon règles)

    verdict = ("HIGH_CONFIDENCE" if score >= 85
               else "MEDIUM_CONFIDENCE" if score >= 60
               else "LOW_CONFIDENCE")

    return AnalyzeResponse(
        score=score,
        verdict=verdict,
        anomalies=anomalies,
        explanations=explanations,
        proposed_corrections=proposed,
        processing_ms=0.0,
        model_version=registry.version,
    )
```

### 10.5 `models/registry.py`

```python
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib


@dataclass
class ModelRegistry:
    model: Any
    explainer: Any
    feature_names: list[str]
    version: str
    sha256: str

    @classmethod
    def load(cls, path: str) -> "ModelRegistry":
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Modèle introuvable : {p}")
        expected_sha = os.getenv("MODEL_EXPECTED_SHA256")
        actual_sha = hashlib.sha256(p.read_bytes()).hexdigest()
        if expected_sha and actual_sha != expected_sha:
            raise RuntimeError(
                f"Hash modèle incorrect : attendu {expected_sha}, reçu {actual_sha}"
            )
        bundle = joblib.load(p)
        return cls(
            model=bundle["model"],
            explainer=bundle["explainer"],
            feature_names=bundle["feature_names"],
            version=bundle["version"],
            sha256=actual_sha,
        )
```

### 10.6 Les 5 endpoints

| Méthode | URL                   | Rôles                | Description                                     |
| ------- | --------------------- | -------------------- | ----------------------------------------------- |
| POST    | `/api/v1/ai/analyze`  | AGENT, ADMIN, SYSTEM | Analyse un enregistrement unique                |
| POST    | `/api/v1/ai/batch`    | ADMIN, SYSTEM        | Batch d'analyses (jusqu'à 1000 NINA)            |
| POST    | `/api/v1/ai/feedback` | AGENT, ADMIN         | Feedback humain (re-étiquetage pour retraining) |
| GET     | `/api/v1/ai/health`   | Public               | Healthcheck Postgres + Redis + modèle chargé    |
| GET     | `/metrics`            | Public (scraping)    | Prometheus                                      |

---

## 11. Soundex africain

Fichier : `services/ai-service/src/ai_service/phonetic/african_soundex.py`

```python
"""
Soundex adapté aux phonétiques ouest-africaines (bambara, français, etc.).

Règles clés :
- On GARDE la voyelle initiale (contrairement au Soundex anglais)
- 'ou', 'u', 'w' sont regroupés
- 'é', 'è', 'ai' sont regroupés
- 'ç' = 's'
- Doublons consonnes consécutives réduits à 1
- Sortie : code alphanumérique de longueur variable (4–8 caractères)

Tests : voir tests/fixtures/phonetic_pairs.json
"""
from __future__ import annotations

import re
import unicodedata

_VOWEL_MAP = {
    "a": "a", "à": "a", "â": "a", "ä": "a",
    "e": "e", "é": "e", "è": "e", "ê": "e", "ë": "e",
    "i": "i", "î": "i", "ï": "i", "y": "i",
    "o": "o", "ô": "o", "ö": "o",
    "u": "u", "ù": "u", "û": "u", "ü": "u",
    "ou": "u", "w": "u",
}

_CONSONANT_MAP = {
    "b": "1", "p": "1",
    "d": "2", "t": "2",
    "f": "3", "v": "3",
    "g": "4", "k": "4", "q": "4",
    "j": "5",
    "l": "6",
    "m": "7", "n": "7",
    "r": "8",
    "s": "9", "z": "9", "c": "9", "ç": "9", "x": "9",
    "h": "",  # H muet
}


def _strip_accents_but_keep_vowels(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn" or c in "éèêëàâäîïôöùûü")


def african_soundex(name: str) -> str:
    if not name:
        return ""
    s = name.lower().strip()
    # Supprimer tirets, apostrophes, espaces
    s = re.sub(r"[\s\-']", "", s)
    # Double-lettres courantes ou/ai/au remplacées avant NFD
    s = re.sub(r"ou", "u", s)
    s = re.sub(r"au", "o", s)
    s = re.sub(r"ai", "e", s)
    # Strip accents sauf ceux utilisés dans le map
    s = _strip_accents_but_keep_vowels(s)

    if not s:
        return ""

    out: list[str] = []
    prev = ""
    # Garder la première lettre
    first = s[0]
    if first in _VOWEL_MAP:
        out.append(_VOWEL_MAP[first])
    else:
        out.append(first)
        prev = _CONSONANT_MAP.get(first, "")

    for c in s[1:]:
        if c in _VOWEL_MAP:
            out.append(_VOWEL_MAP[c])
            prev = ""
        else:
            code = _CONSONANT_MAP.get(c, c)
            if code and code != prev:
                out.append(code)
                prev = code

    return "".join(out).upper()
```

### 11.1 Tests golden-set

Fichier : `tests/fixtures/phonetic_pairs.json`

```json
[
  { "a": "Mamadou", "b": "Mamadu", "same": true },
  { "a": "Mamadou", "b": "Mahamadou", "same": true },
  { "a": "Traoré", "b": "Traore", "same": true },
  { "a": "Keita", "b": "Kéita", "same": true },
  { "a": "Keita", "b": "Ketta", "same": false },
  { "a": "Diallo", "b": "Jallo", "same": false },
  { "a": "Sékou", "b": "Seku", "same": true },
  { "a": "Fatoumata", "b": "Fatumata", "same": true },
  { "a": "Aïssata", "b": "Aisata", "same": true },
  { "a": "Coulibaly", "b": "Kulibali", "same": true }
]
```

---

## 12. Dockerfile multi-stage

Fichier : `services/ai-service/Dockerfile`

```dockerfile
# ============================================================================
# Stage 1 — builder : compile et installe les dépendances
# ============================================================================
FROM python:3.14-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip wheel && \
    pip install --no-cache-dir --prefix=/install .

# Télécharger les modèles spaCy
RUN python -m spacy download fr_core_news_md --direct --target /install/spacy_data

# ============================================================================
# Stage 2 — runtime : image finale minimale
# ============================================================================
FROM python:3.14-slim-bookworm

# Dépendances runtime uniquement
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgomp1 curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -g 1001 ai && useradd -u 1001 -g 1001 -m ai

WORKDIR /app
COPY --from=builder /install /usr/local
COPY --chown=ai:ai src/ /app/src/

USER ai
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SPACY_DATA=/usr/local/spacy_data \
    AI_SERVICE_PORT=3003

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3003/api/v1/ai/health || exit 1

CMD ["uvicorn", "ai_service.main:app", "--host", "0.0.0.0", "--port", "3003", "--workers", "2"]
```

Taille cible : **~380 Mo** (Python + XGBoost + spaCy + fr_core_news_md).

---

## 13. Tests (pytest + golden-set)

### 13.1 `tests/test_soundex.py`

```python
from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_service.phonetic.african_soundex import african_soundex


FIXTURES = Path(__file__).parent / "fixtures" / "phonetic_pairs.json"


@pytest.mark.parametrize("pair", json.loads(FIXTURES.read_text()))
def test_phonetic_pairs(pair):
    sdx_a = african_soundex(pair["a"])
    sdx_b = african_soundex(pair["b"])
    if pair["same"]:
        assert sdx_a == sdx_b, f"Expected same: {pair['a']}({sdx_a}) != {pair['b']}({sdx_b})"
    else:
        assert sdx_a != sdx_b, f"Expected different: {pair['a']}({sdx_a}) == {pair['b']}({sdx_b})"


def test_empty_string():
    assert african_soundex("") == ""


def test_handles_apostrophes():
    # N'Diaye, N'Ko
    assert african_soundex("N'Diaye") == african_soundex("Ndiaye")
```

### 13.2 `tests/test_pipeline_end_to_end.py`

```python
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from ai_service.main import app


@pytest.mark.asyncio
async def test_analyze_returns_score(fake_token_agent, mock_identity_service):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/ai/analyze",
            headers={"Authorization": f"Bearer {fake_token_agent}"},
            json={
                "citizen": {
                    "nina": "19850315123456A",
                    "first_name": "Aliou",
                    "last_name": "Traoré",
                    "birth_date": "1985-03-15",
                    "sex": "M",
                    "birth_region": "Bamako",
                    "language": "fr",
                },
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert 0 <= body["score"] <= 100
    assert body["verdict"] in {"HIGH_CONFIDENCE", "MEDIUM_CONFIDENCE", "LOW_CONFIDENCE"}
    assert isinstance(body["anomalies"], list)
    assert isinstance(body["explanations"], list)


@pytest.mark.asyncio
async def test_detects_impossible_date(fake_token_agent):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/ai/analyze",
            headers={"Authorization": f"Bearer {fake_token_agent}"},
            json={
                "citizen": {
                    "nina": "18000101000001A",
                    "first_name": "Test",
                    "last_name": "Fake",
                    "birth_date": "1800-01-01",
                    "sex": "M",
                    "birth_region": "Bamako",
                },
            },
        )
    body = response.json()
    assert any(a["type"] == "impossible_date" for a in body["anomalies"])
    assert body["score"] < 40
```

### 13.3 Couverture cible

Configurer `pyproject.toml` :

```toml
[tool.coverage.report]
fail_under = 85
show_missing = true
exclude_lines = ["pragma: no cover", "raise NotImplementedError"]
```

---

## 14. Observabilité Prometheus

Fichier : `src/ai_service/telemetry/metrics.py`

```python
from prometheus_client import Counter, Histogram, Gauge

ai_requests_total = Counter(
    "ai_requests_total",
    "Nombre total de requêtes d'analyse",
    ["verdict", "result"],
)

ai_pipeline_stage_duration = Histogram(
    "ai_pipeline_stage_duration_seconds",
    "Durée de chaque étape du pipeline",
    ["stage"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5),
)

ai_anomalies_detected = Counter(
    "ai_anomalies_detected_total",
    "Anomalies détectées par type",
    ["type", "severity"],
)

ai_score_distribution = Histogram(
    "ai_score",
    "Distribution des scores",
    buckets=(10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95, 100),
)

ai_model_version = Gauge("ai_model_version_info", "Info version modèle", ["version", "sha256"])
```

### 14.1 Dashboard Grafana

JSON de base fourni dans `infrastructure/grafana/dashboards/ai-service.json` (à créer en doc 17).
Panels :

- Score P50/P95/P99 par heure
- Taux d'anomalies par type
- Latence pipeline par étape
- Drift : comparaison distributions features jour J vs J-30

---

## 15. MLOps — retraining mensuel

### 15.1 Cycle de vie d'un modèle

```
[Collect feedback] → [Export dataset] → [Retrain + eval] → [Champion vs Challenger]
                                                                      ↓
                                                    [Canary 5% traffic]
                                                                      ↓
                                                    [Metrics OK 48h ?]
                                                                      ↓
                                                    [Promote or rollback]
```

### 15.2 Workflow GitHub Actions (sketch)

```yaml
name: AI — Monthly retraining
on:
  schedule: [{ cron: '0 2 1 * *' }] # 1er de chaque mois à 02:00 UTC
  workflow_dispatch:
jobs:
  retrain:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.14' }
      - run: pip install -r ai-models/requirements.txt
      - run: python ai-models/scripts/export_feedback_dataset.py
      - run: python ai-models/scripts/train_xgboost.py
      - run: python ai-models/scripts/compare_vs_champion.py
      - uses: actions/upload-artifact@v4
        with:
          name: nina-detector-candidate
          path: ai-models/nina_detector_candidate.pkl
```

---

## 16. Mini-rapport d'étape

```markdown
# Rapport d'étape — Document 11 — ai-service

**Date** : **\_\_\_\_** **Durée passée** : ** h (estimation : 20–30 h) **Commit de fin** :
**\_\_\_\_\*\*\*\*

## Fonctionnel

- [ ] Dataset synthétique 10 000 lignes généré
- [ ] Modèle XGBoost entraîné, AUC ≥ 0.92
- [ ] Pipeline 5 étapes end-to-end OK
- [ ] Soundex africain passe le golden-set
- [ ] 5 endpoints REST accessibles sur :3003

## Métriques modèle

| Métrique    | Cible   | Mesurée |
| ----------- | ------- | ------- |
| AUC         | ≥ 0.92  |         |
| F1          | ≥ 0.85  |         |
| Precision   | ≥ 0.85  |         |
| Recall      | ≥ 0.85  |         |
| Latence P95 | < 50 ms |         |

## Tests

| Type               | Passent ? | Couverture |
| ------------------ | --------- | ---------- |
| Unit               |           | \_\_ %     |
| Integration        |           | \_\_ %     |
| Golden-set soundex |           | —          |

## Problèmes rencontrés

- ***

## Prochaines étapes

- Document 12 — Frontend Integration API
```

---

## 17. Checklist de fin d'étape

- [ ] ✅ Python 3.14 + venv local fonctionnel (`python --version`)
- [ ] ✅ `pyproject.toml` versionné + `pnpm turbo build --filter=ai-service` OK
- [ ] ✅ Dataset synthétique 10 000 lignes généré
- [ ] ✅ Modèle `nina_detector_v1.pkl` entraîné avec AUC ≥ 0.92
- [ ] ✅ SHAP values fonctionnelles (top-5 affichées dans response)
- [ ] ✅ Soundex africain : golden-set 10 paires tous passent
- [ ] ✅ 5 endpoints Swagger accessibles sur `/docs`
- [ ] ✅ Hash SHA-256 du `.pkl` vérifié au startup
- [ ] ✅ JWT RS256 vérifié via JWKS Keycloak
- [ ] ✅ Pool asyncpg Postgres fonctionne
- [ ] ✅ Audit AMQP publie `ai.analysis.completed`
- [ ] ✅ Métriques Prometheus exposées sur `/metrics`
- [ ] ✅ Dockerfile build < 400 Mo
- [ ] ✅ Couverture tests ≥ 85 %
- [ ] ✅ Healthcheck `/api/v1/ai/health` vérifie Postgres + Redis + modèle
- [ ] ✅ Commit : `feat(ai): pipeline 5 étapes + XGBoost + Soundex africain`
- [ ] ✅ ADR-015 référencée dans les README de service

---

## 18. Pour aller plus loin

1. **Export ONNX** : convertir le modèle XGBoost en ONNX pour inférence C++/JS (utile si on déplace
   le scoring en edge mobile).
2. **Sentence-transformers multilingue** : ajouter des embeddings E5 multilingual comme feature
   (enrichit la détection sémantique, coût = latence +50 ms, à évaluer).
3. **Active learning** : prioriser les dossiers ambigus (score 40–60) pour annotation manuelle afin
   d'accélérer la convergence du modèle.
4. **Drift detection** : Alibi Detect ou Evidently pour surveiller la dérive de features et
   déclencher retraining automatique.
5. **A/B testing en production** : feature flag pour router 10 % du trafic vers un challenger model.
6. **Fairness audit** : mesurer l'équité (false positive rate) par langue et par région pour
   détecter biais.
7. **Intégration biométrie** (Bloc F) : ajouter des features basées sur la photo (embedding FaceNet)
   pour détecter duplicates visuels.
8. **Coopération avec `anticorruption-service`** : partager les `agent_anomaly_rate` entre les deux
   services (doc 23).

---

_Document 11 — Version 1.0 — Avril 2026_ _NINA-AES Platform — UQAR — CONFIDENTIEL_ _Prochain
document : [12 — Frontend Integration API](./12-FRONTEND-INTEGRATION-API.md)_
