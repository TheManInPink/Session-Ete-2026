# ============================================================================
# NINA-AES Platform — Makefile
# ============================================================================
# Raccourcis pour les commandes courantes
# Usage : make <cible>
# Exemples : make install, make dev, make dev-citizen, make lint, make db-migrate, etc.
# ═══════════════════════════════════════════════════

.PHONY: help install dev dev-citizen dev-admin dev-governance dev-service build lint format test clean docker-up docker-down db-migrate db-seed db-studio ai-dev

DOCKER_COMPOSE = docker compose -f infrastructure/docker/docker-compose.dev.yml --env-file infrastructure/docker/.env.docker

# Cible par défaut : affiche l'aide
help: ## Affiche cette aide
	@echo "═══════════════════════════════════════════════"
	@echo " NINA-AES Platform — Commandes disponibles"
	@echo "═══════════════════════════════════════════════"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Installation ──
install: ## Installe toutes les dépendances (pnpm + Python)
	pnpm install
	cd services/ai-service && pip install -r requirements.txt
	cd services/anticorruption-service && pip install -r requirements.txt

# ── Développement ──
dev: ## Lance tous les services en mode développement (frontend + backend)
	pnpm run dev

dev-citizen: ## Lance uniquement le portail citoyen (port 4000)
	pnpm run dev:citizen

dev-admin: ## Lance uniquement le dashboard admin (port 4001)
	pnpm run dev:admin

dev-identity: ## Lance uniquement identity-service (port 3001)
	pnpm run dev:identity

dev-ai: ## Lance le service IA FastAPI (port 3003)
	cd services/ai-service && uvicorn app.main:app --reload --port 3003

dev-services: ## Lancer tous les microservices backend
	pnpm run dev:services

dev-gateway: ## Start only API gateway
	pnpm run dev:gateway

# ── Build ──
build: ## Build tous les packages et applications
	pnpm run build

build-docker: ## Build les images Docker
	docker build -f services/identity-service/Dockerfile -t nina-aes/identity-service:latest .
	docker build -f services/ai-service/Dockerfile -t nina-aes/ai-service:latest services/ai-service/

# ── Tests ──
test: ## Lance tous les tests (Jest + Pytest)
	pnpm run test
	cd services/ai-service && pytest tests/ -v
	cd services/anticorruption-service && pytest

test-cov: ## Lancer les tests avec couverture de code
	pnpm run test:cov

lint: ## Vérifie le code (ESLint + Ruff)
	pnpm run lint
	cd services/ai-service && ruff check .
	cd services/anticorruption-service && ruff check .

lint-fix: ## Corriger automatiquement les erreurs ESLint
	pnpm run lint:fix

format: ## Formate le code (Prettier + Ruff)
	pnpm run format
	cd services/ai-service && ruff format .
	cd services/anticorruption-service && ruff format .

format-check: ## Vérifier le formatage sans modifier
	pnpm run format:
	
check-types: ## Vérifier les types TypeScript
	pnpm run check-types

# ── Docker ──
docker-up: ## Démarre l'infrastructure Docker (PostgreSQL, Redis, RabbitMQ, etc.)
	docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

docker-down: ## Arrête l'infrastructure Docker
	docker compose -f infrastructure/docker/docker-compose.dev.yml down

docker-logs: ## Affiche les logs Docker en temps réel
	docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f

docker-ps: ## Liste les conteneurs en cours d'exécution
	docker compose -f infrastructure/docker/docker-compose.dev.yml ps

docker-down-v: ## Arrêter ET supprimer les volumes (PERTE DE DONNÉES)
	docker compose -f infrastructure/docker/docker-compose.dev.yml down -v

# ── Base de données ──
db-generate: ## Génère le client Prisma
	cd packages/database && pnpm run db:generate

db-migrate: ## Exécute les migrations Prisma
	cd packages/database && pnpm run db:migrate

db-seed: ## Peuple la base avec les données initiales (géographie Mali)
	cd packages/database && pnpm run db:seed

db-studio: ## Ouvre Prisma Studio (interface visuelle BDD)
	cd packages/database && pnpm run db:studio

db-reset: ## Remet la base à zéro (⚠️ supprime toutes les données)
	cd packages/database && pnpm exec prisma migrate reset

# ── Nettoyage ──
clean: ## Supprime node_modules, dist, .next, .turbo
	pnpm run clean
	rm -rf node_modules/.cache
	rm -rf .turbo

# ── Initialisation complète ──
init: install docker-up db-migrate db-seed ## Setup complet : install + docker + migrations + seeds
	@echo "✅ NINA-AES Platform initialisée avec succès"
