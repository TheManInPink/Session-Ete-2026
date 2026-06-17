# `@nina-aes/ai-service`

> **Port** : 3003 **Stack** : Python 3.14 · FastAPI · Pydantic · scikit-learn · XGBoost **Statut** :
> Scaffold FastAPI (`app/main.py` initialisé, pipeline non-implémenté) **Référence** : doc dédiée à
> venir

---

## 1. Rôle

Module **IA de détection et correction des erreurs de saisie NINA**. Pipeline en 5 étapes :

1. **Ingestion** des données NINA depuis `identity-service` (via api-gateway).
2. **Normalisation** et préparation (unicode, casse, accents).
3. **Analyse** — Jaro-Winkler (similarité chaînes), Soundex (phonétique latine), NER (entités
   nommées), règles métier (format NINA, dates valides, hiérarchie géo).
4. **Scoring** par modèle XGBoost entraîné sur les erreurs historiques RAVEC.
5. **Soumission** des corrections proposées vers `identity-service` (workflow validation agent).

Service stateless — pas de BDD propre. Les corrections sont persistées via `identity-service`.

---

## 2. Endpoints

| Méthode | Chemin                     | Description                                             | Auth   |
| ------- | -------------------------- | ------------------------------------------------------- | ------ |
| `POST`  | `/api/v1/ai/score`         | Score un lot (étape 4 — XGBoost ; modèle chargé)        | AGENT  |
| `GET`   | `/api/v1/ai/model-info`    | Métadonnées du modèle chargé (classes, métriques)       | —      |
| `POST`  | `/api/v1/ai/reload-models` | Rechargement à chaud du modèle                          | ADMIN¹ |
| `POST`  | `/api/v1/ai/analyze`       | Analyse complète (pipeline 5 étapes) — _à venir doc 11_ | AGENT  |
| `GET`   | `/api/v1/ai/health`        | Liveness (+ `model_loaded`)                             | —      |
| `GET`   | `/api/v1/ai/docs`          | OpenAPI / Swagger UI                                    | —      |
| `GET`   | `/api/v1/ai/openapi.json`  | Schema OpenAPI                                          | —      |

> ¹ `reload-models` exige l'en-tête `X-Admin-Token` **si** `AI_ADMIN_TOKEN` est défini (ouvert en
> dev). À compléter par le rôle ADMIN Keycloak (doc 08). Modèle entraîné par
> [`ai-models/training`](../../ai-models/training/README.md).

---

## 3. Variables d'environnement

| Variable                 | Défaut                                 | Rôle                                        |
| ------------------------ | -------------------------------------- | ------------------------------------------- |
| `AI_SERVICE_PORT`        | `3003`                                 | Port d'écoute HTTP                          |
| `AI_XGBOOST_BUNDLE_PATH` | `ai-models/exported/xgboost_v1.joblib` | Bundle modèle chargé au démarrage           |
| `AI_ADMIN_TOKEN`         | _(vide)_                               | Si défini, exige `X-Admin-Token` sur reload |
| `AI_CORS_ORIGINS`        | `["*"]`                                | Origines CORS (jamais `*` + credentials)    |
| `API_GATEWAY_URL`        | `http://localhost:3000`                | Endpoint pour rappel identity-service       |
| `VAULT_ADDR`             | (cf. `.env`)                           | Récupération secrets (clés modèles)         |

---

## 4. Démarrer en local

```powershell
cd services/ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --port 3003 --reload

# Test
curl http://localhost:3003/api/v1/ai/health
# Swagger UI : http://localhost:3003/api/v1/ai/docs
```

---

## 5. Liens

- Point d'entrée : [`services/ai-service/app/main.py`](app/main.py)
- Dépendances pinnées : [`pyproject.toml`](pyproject.toml) + [`requirements.txt`](requirements.txt)
