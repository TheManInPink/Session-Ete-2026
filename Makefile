# ═══════════════════════════════════════════════════
# NINA-AES Platform — Makefile
# Raccourcis pour les commandes courantes
# Usage : make <cible>
# ═══════════════════════════════════════════════════

.PHONY: help install dev build test lint format clean docker-up docker-down db-migrate db-seed db-studio ai-dev

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
dev: ## Lance tous les services en mode développement
	pnpm run dev

dev-citizen: ## Lance uniquement le portail citoyen (port 4000)
	pnpm run dev:citizen

dev-admin: ## Lance uniquement le dashboard admin (port 4001)
	pnpm run dev:admin

dev-identity: ## Lance uniquement identity-service (port 3001)
	pnpm run dev:identity

dev-ai: ## Lance le service IA FastAPI (port 3003)
	cd services/ai-service && uvicorn app.main:app --reload --port 3003

# ── Build ──
build: ## Build tous les packages et applications
	pnpm run build

# ── Tests ──
test: ## Lance tous les tests (Jest + Pytest)
	pnpm run test
	cd services/ai-service && pytest
	cd services/anticorruption-service && pytest

lint: ## Vérifie le code (ESLint + Ruff)
	pnpm run lint
	cd services/ai-service && ruff check .
	cd services/anticorruption-service && ruff check .

format: ## Formate le code (Prettier + Ruff)
	pnpm run format
	cd services/ai-service && ruff format .
	cd services/anticorruption-service && ruff format .

# ── Docker ──
docker-up: ## Démarre l'infrastructure Docker (PostgreSQL, Redis, RabbitMQ, etc.)
	docker compose -f docker-compose.dev.yml up -d

docker-down: ## Arrête l'infrastructure Docker
	docker compose -f docker-compose.dev.yml down

docker-logs: ## Affiche les logs Docker en temps réel
	docker compose -f docker-compose.dev.yml logs -f

docker-ps: ## Liste les conteneurs en cours d'exécution
	docker compose -f docker-compose.dev.yml ps

# ── Base de données ──
db-generate: ## Génère le client Prisma
	pnpm run db:generate

db-migrate: ## Exécute les migrations Prisma
	pnpm run db:migrate

db-seed: ## Peuple la base avec les données initiales (géographie Mali)
	pnpm run db:seed

db-studio: ## Ouvre Prisma Studio (interface visuelle BDD)
	pnpm run db:studio

db-reset: ## Remet la base à zéro (⚠️ supprime toutes les données)
	cd packages/database && pnpm exec prisma migrate reset

# ── Nettoyage ──
clean: ## Supprime node_modules, dist, .next, .turbo
	pnpm run clean

# ── Initialisation complète ──
init: install docker-up db-migrate db-seed ## Setup complet : install + docker + migrations + seeds
	@echo "✅ NINA-AES Platform initialisée avec succès"
