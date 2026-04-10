# ADR-004 — FastAPI pour les services IA/ML

## Statut

Accepté — Avril 2026

## Contexte

Les modules IA (ai-service, port 3003) et anti-corruption (anticorruption-service, port 3009)
reposent sur des bibliothèques exclusivement Python : scikit-learn 1.8+, XGBoost 3.2+, spaCy 3.8+,
RapidFuzz 3.14+, Isolation Forest. Ces bibliothèques n'ont pas d'équivalent en TypeScript. Il faut
un framework web Python performant, bien documenté et compatible avec l'asynchrone.

## Décision

FastAPI 0.135+ pour les 2 services Python, exécutés via uvicorn (serveur ASGI).

## Conséquences positives

- Performances proches de Node.js grâce à Starlette/uvicorn (ASGI asynchrone natif)
- Documentation OpenAPI générée automatiquement — interface Swagger UI intégrée à `/docs`
- Validation des requêtes et réponses via Pydantic v2 (équivalent Python de Zod) — typage fort et
  erreurs claires
- Écosystème Python ML intact — `import xgboost`, `import spacy` fonctionnent directement
- Support natif de `async/await` pour les appels concurrents à PostgreSQL et aux autres services
  HTTP

## Conséquences négatives

- Deux runtimes différents à maintenir en parallèle (Node.js + Python) — complexité DevOps
- Les services Python ne bénéficient pas du partage de packages npm du monorepo Turborepo
- Debugging cross-language (TypeScript appelant Python via HTTP) plus complexe
- Nécessite un environnement Python séparé (venv) sur le poste de développement

## Alternatives rejetées

- **Flask** : framework synchrone par défaut, pas de validation intégrée, performances inférieures à
  FastAPI d'un facteur ~3x
- **Django REST Framework** : trop lourd pour des microservices (ORM complet, système d'admin,
  middleware chain complexe). Surcoût injustifié pour 2 services relativement simples
- **Appel Python depuis NestJS via subprocess** : fragile (gestion des erreurs, encoding, timeouts),
  latence élevée (spawn de processus), non maintenable à long terme
- **Port des bibliothèques ML vers TypeScript** : irréaliste — scikit-learn, XGBoost et spaCy n'ont
  pas d'équivalents matures en JavaScript
