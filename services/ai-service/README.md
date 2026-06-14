# `@nina-aes/ai-service`

> **Port** : 3003 **Stack** : Python 3.13/3.14 · FastAPI · Pydantic v2 · RapidFuzz · jellyfish ·
> scikit-learn · XGBoost · spaCy · Tesseract **Statut** : ✅ **Implémenté** — 7 endpoints
> `/api/v1/ai` + sonde `/health`, pipeline 5 étapes (scorer heuristique par défaut, bascule XGBoost
> si un modèle entraîné est présent), **dégradation gracieuse** si spaCy/xgboost/tesseract sont
> absents. **Référence** : [doc 11](../../docs/11-AI-SERVICE-FASTAPI.md) · ADR-004 (FastAPI) ·
> ADR-015 (stack ML) · ADR-029 (auth au bord)

---

## 1. Rôle

Module **IA de détection et correction des erreurs de saisie NINA**. Pipeline en 5 étapes :

1. **Ingestion** — payload validé (Pydantic v2).
2. **Normalisation** — Unicode NFC, casse, placeholders, parsing tolérant des dates.
3. **Analyse** — règles métier (format/lettre de contrôle NINA, dates, cohérence sexe/année/géo),
   fuzzy matching (RapidFuzz), phonétique (jellyfish + Soundex africain maison), inversion de
   champs.
4. **Scoring** — heuristique pondérée transparente **ou** modèle XGBoost si présent.
5. **Soumission** — verdict (HIGH ≥ 85 / MEDIUM 60-84 / LOW < 60) + métriques. Service **stateless**
   : il **propose**, l'humain **décide** (les corrections sont persistées par identity-service).

La lettre de contrôle NINA est calculée **à l'identique** de `packages/utils/src/nina.ts` (somme
pondérée mod 23, alphabet sans I/O) — testé en non-régression (`tests/test_nina_rules.py`).

---

## 2. Endpoints

Tous les endpoints métier sont sous le préfixe public `/api/v1/ai` (proxifié par l'api-gateway).
L'authentification est **terminée au bord** par l'api-gateway (ADR-029) : ce service lit le contexte
signé `X-User-Context` (HS256), il ne re-vérifie pas le JWT lui-même.

| Méthode | Chemin                                         | Description                                               | Auth              |
| ------- | ---------------------------------------------- | --------------------------------------------------------- | ----------------- |
| `POST`  | `/api/v1/ai/detect-errors`                     | Analyse complète d'un enregistrement NINA (pipeline)      | au bord (gateway) |
| `POST`  | `/api/v1/ai/compare-names`                     | Comparaison de deux noms (fuzzy + phonétique)             | au bord (gateway) |
| `POST`  | `/api/v1/ai/detect-duplicates`                 | Doublons potentiels d'un citoyen                          | au bord (gateway) |
| `POST`  | `/api/v1/ai/anomaly-score`                     | Score comportemental d'un agent (Isolation Forest, SIGAC) | au bord (gateway) |
| `POST`  | `/api/v1/ai/ocr-extract`                       | OCR d'un acte de naissance scanné (multipart)             | au bord (gateway) |
| `POST`  | `/api/v1/ai/ner`                               | Reconnaissance d'entités nommées (spaCy ou fallback)      | au bord (gateway) |
| `GET`   | `/health`                                      | Liveness + modèles chargés + backends (sonde Docker/K3s)  | —                 |
| `GET`   | `/api/v1/ai/health`                            | Alias de `/health` (joignable via le gateway)             | —                 |
| `GET`   | `/api/v1/ai/docs` · `/redoc` · `/openapi.json` | Swagger / ReDoc / schéma OpenAPI                          | —                 |
| `GET`   | `/api/docs-json`                               | Alias OpenAPI pour l'agrégateur Swagger du gateway        | —                 |
| `GET`   | `/metrics`                                     | Métriques Prometheus (si observabilité disponible)        | —                 |

> Note : `detect-errors` et `detect-duplicates` enveloppent le citoyen dans un objet `citizen`
> (`{ "citizen": { … }, "context"?: { … } }`) pour permettre un contexte optionnel.

---

## 3. Variables d'environnement

Chargées par `pydantic-settings` avec le préfixe **`AI_`** (cf. `app/config.py`).

| Variable                  | Défaut                                   | Rôle                                                                        |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| `AI_PORT`                 | `3003`                                   | Port d'écoute HTTP                                                          |
| `AI_ENV`                  | `development`                            | `production` active le fail-closed + CORS strict                            |
| `AI_API_GATEWAY_URL`      | `http://localhost:3000`                  | URL de l'api-gateway                                                        |
| `AI_IDENTITY_SERVICE_URL` | `http://localhost:3001`                  | URL d'identity-service                                                      |
| `AI_USE_MODEL`            | `false`                                  | **Opt-in** du scoring XGBoost ; `false` = heuristique explicable (défaut)   |
| `AI_XGBOOST_MODEL_PATH`   | `ai-models/trained/nina_detector_v1.pkl` | Modèle XGBoost chargé si `AI_USE_MODEL=true`                                |
| `AI_SPACY_MODEL`          | `fr_core_news_md`                        | Modèle spaCy (optionnel → fallback regex)                                   |
| `AI_OCR_LANGUAGES`        | `fra+eng`                                | Langues Tesseract                                                           |
| `AI_GATEWAY_JWS_SECRET`   | (vide)                                   | Secret HS256 pour vérifier `X-User-Context` (**obligatoire en production**) |
| `AI_USER_CONTEXT_HEADER`  | `x-user-context`                         | Nom de l'en-tête de contexte                                                |

> Les secrets sensibles (clés, credentials BDD) transitent par **HashiCorp Vault** (`app/vault.py`),
> pas par des variables d'environnement en clair.

---

## 4. Démarrer en local

```powershell
cd services/ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt          # cœur ML/NLP
pip install -e ".[ocr,train,dev]"        # extras optionnels (OCR, entraînement, tests)
python -m spacy download fr_core_news_md # modèle NER (optionnel)

pnpm dev:ai
python -m uvicorn app.main:app --port 3003 --reload --app-dir services/ai-service

# Sonde de santé (chemin de la probe Docker)
curl http://localhost:3003/health
# Swagger UI : http://localhost:3003/api/v1/ai/docs
```

```powershell
# Tests
pytest tests/ -v --cov=app

# (Optionnel) Générer le dataset synthétique + entraîner le modèle XGBoost
python ../../ai-models/scripts/generate_synthetic_dataset.py --n 10000
python ../../ai-models/scripts/train_xgboost.py
```

---

## 5. Dégradation gracieuse

Le service démarre et sert ses endpoints **même sans** les dépendances ML lourdes :

| Dépendance absente         | Comportement                                                          |
| -------------------------- | --------------------------------------------------------------------- |
| modèle XGBoost             | scoring **heuristique** transparent (`heuristic-v1`)                  |
| spaCy / `fr_core_news_md`  | NER **regex de secours** (`regex_fallback`)                           |
| RapidFuzz / jellyfish      | implémentations **Python pures** (Jaro-Winkler, Levenshtein, Soundex) |
| Tesseract / Pillow         | `/ocr-extract` renvoie **503** (les autres endpoints fonctionnent)    |
| OpenTelemetry / Prometheus | observabilité désactivée silencieusement (`/metrics` absent)          |

---

## 6. Liens

- Point d'entrée : [`app/main.py`](app/main.py)
- Pipeline : [`app/services/`](app/services/) (normalizer, detector, scorer, comparator, …)
- Schémas : [`app/schemas/`](app/schemas/) · Routeurs : [`app/routers/`](app/routers/)
- Documentation canonique : [`docs/11-AI-SERVICE-FASTAPI.md`](../../docs/11-AI-SERVICE-FASTAPI.md)
- Dépendances : [`pyproject.toml`](pyproject.toml) + [`requirements.txt`](requirements.txt)
