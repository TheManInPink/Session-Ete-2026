# `@nina-aes/ai-service`

> **Port** : 3003 **Stack** : Python 3.13 (runtime Docker/CI — spaCy) · FastAPI · Pydantic ·
> scikit-learn · XGBoost **Statut** : étape 4 « Scoring » opérationnelle — chargement du bundle +
> `/score` + `/reload-models` ; pipeline 5 étapes complet à venir (doc 11) **Référence** :
> [doc 11](../../docs/11-AI-SERVICE-FASTAPI.md) ·
> [ADR-030](../../docs/adr/ADR-030-ai-training-pipeline-bundle-dataset-generator.md)

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

> ¹ `reload-models` — escalade RBAC (`app/auth.py`) : si `AI_JWKS_URL` est défini, un Bearer
> **RS256** portant le rôle `admin` est exigé (Keycloak, doc 08) ; sinon repli sur `X-Admin-Token`
> (`AI_ADMIN_TOKEN`) ; sinon ouvert en dev. Le bundle est vérifié (**SHA-256**) avant chargement.
> Modèle entraîné par [`ai-models/training`](../../ai-models/training/README.md).

---

## 3. Variables d'environnement

| Variable                   | Défaut                                 | Rôle                                                                          |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `AI_SERVICE_PORT`          | `3003`                                 | Port d'écoute HTTP                                                            |
| `AI_XGBOOST_BUNDLE_PATH`   | `ai-models/exported/xgboost_v1.joblib` | Bundle modèle chargé au démarrage                                             |
| `AI_REQUIRE_SIGNED_BUNDLE` | `true`                                 | Fail-closed : refuse un bundle sans sidecar `.sha256` (mettre `false` en dev) |
| `AI_JWKS_URL`              | _(vide)_                               | Si défini, RBAC Bearer RS256/JWKS sur endpoints sensibles                     |
| `AI_JWT_AUDIENCE`          | _(vide)_                               | Audience JWT attendue (vide = non vérifiée)                                   |
| `AI_ADMIN_TOKEN`           | _(vide)_                               | Repli (sans JWKS) : exige `X-Admin-Token` sur reload                          |
| `AI_CORS_ORIGINS`          | `["*"]`                                | Origines CORS (jamais `*` + credentials)                                      |
| `API_GATEWAY_URL`          | `http://localhost:3000`                | Endpoint pour rappel identity-service                                         |
| `VAULT_ADDR`               | (cf. `.env`)                           | Récupération secrets (clés modèles)                                           |

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
