# ============================================================================
# NINA-AES Platform — Makefile
# ============================================================================
# Raccourcis pour les commandes courantes
# Usage : make <cible>
# Exemples : make install, make dev, make verify, make db-migrate, etc.
#
# Compatible Windows via Git Bash. Pour PowerShell, les commandes équivalentes
# sont documentées dans `docs/03-SETUP-ENVIRONNEMENT-DEV.md`.
# ═══════════════════════════════════════════════════

.PHONY: help install dev dev-citizen dev-admin dev-governance dev-services dev-gateway dev-ai \
        build build-docker build-service \
        lint lint-fix format format-check check-types \
        test test-cov test-watch \
        docker-up docker-down docker-logs docker-ps docker-down-v \
        db-generate db-migrate db-seed db-studio db-reset db-validate \
        seed-locations-generate audit-cercles enrich-cercles enrich-cercles-write \
        vault-init vault-seed vault-rotate vault-unseal vault-status vault-bootstrap \
        certs-generate certs-clean \
        verify validate-data validate-schemas docs-sync \
        clean clean-deep init

# Infrastructure Docker : même fichier `.env` à la racine que les apps.
# Alternative : copier `infrastructure/docker/.env.docker.example` vers
# `.env.docker` et passer `--env-file infrastructure/docker/.env.docker`.
DOCKER_COMPOSE = docker compose --env-file .env -f infrastructure/docker/docker-compose.dev.yml

# Service par défaut pour les cibles paramétrées (ex. `make build-service SERVICE=identity-service`).
SERVICE ?= identity-service

# Conteneur Vault pour les cibles `vault-*`.
VAULT_CONTAINER = nina-vault
VAULT_ADDR = http://localhost:8200

# Dossier de sortie des certificats mTLS dev.
CERTS_DIR = secrets/aes

# Cible par défaut : affiche l'aide.
help: ## Affiche cette aide
	@echo "═══════════════════════════════════════════════"
	@echo " NINA-AES Platform — Commandes disponibles"
	@echo "═══════════════════════════════════════════════"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ── Installation ────────────────────────────────────────────────────────────
install: ## Installe toutes les dépendances (pnpm + Python)
	pnpm install
	cd services/ai-service && pip install -r requirements.txt
	cd services/anticorruption-service && pip install -r requirements.txt

# ── Développement ──────────────────────────────────────────────────────────
dev: ## Lance tous les services en mode développement
	pnpm run dev

dev-citizen: ## Lance uniquement le portail citoyen (port 4001)
	pnpm run dev:citizen

dev-admin: ## Lance uniquement le dashboard admin (port 4002)
	pnpm run dev:admin

dev-governance: ## Lance uniquement le portail gouvernance (port 4003)
	pnpm run dev:governance

dev-identity: ## Lance identity-service (port 3001)
	pnpm run dev:identity

dev-ai: ## Lance ai-service FastAPI (port 3003)
	cd services/ai-service && uvicorn app.main:app --reload --port 3003

dev-sigac: ## Lance anticorruption-service FastAPI (port 3009)
	cd services/anticorruption-service && uvicorn app.main:app --reload --port 3009

dev-services: ## Lance tous les microservices backend en parallèle
	pnpm run dev:services

dev-gateway: ## Lance uniquement l'API Gateway (port 3000)
	pnpm run dev:gateway

# ── Build ──────────────────────────────────────────────────────────────────
build: ## Build tous les packages et applications via Turborepo
	pnpm run build

build-docker: ## Build toutes les images Docker des microservices
	$(MAKE) build-service SERVICE=identity-service
	$(MAKE) build-service SERVICE=auth-service
	$(MAKE) build-service SERVICE=ai-service

build-service: ## Build l'image Docker d'un service (usage: make build-service SERVICE=xxx)
	@echo "🐳 Build de l'image $(SERVICE)..."
	@if echo "$(SERVICE)" | grep -qE "^(ai|anticorruption)-service$$"; then \
		docker build -f infrastructure/docker/Dockerfile.fastapi \
			--build-arg SERVICE=$(SERVICE) \
			-t nina-aes/$(SERVICE):latest . ; \
	else \
		docker build -f infrastructure/docker/Dockerfile.nestjs \
			--build-arg SERVICE=$(SERVICE) \
			-t nina-aes/$(SERVICE):latest . ; \
	fi
	@echo "✅ Image nina-aes/$(SERVICE):latest construite"

# ── Tests ──────────────────────────────────────────────────────────────────
test: ## Lance tous les tests (Jest + Pytest)
	pnpm run test
	cd services/ai-service && pytest tests/ -v
	cd services/anticorruption-service && pytest

test-cov: ## Lance les tests avec couverture de code
	pnpm run test:cov

test-watch: ## Lance les tests en mode watch (Jest)
	pnpm run test -- --watch

# ── Qualité ────────────────────────────────────────────────────────────────
lint: ## Vérifie le code (ESLint + Ruff)
	pnpm run lint
	cd services/ai-service && ruff check .
	cd services/anticorruption-service && ruff check .

lint-fix: ## Corrige automatiquement les erreurs ESLint/Ruff
	pnpm run lint:fix

format: ## Formate le code (Prettier + Ruff)
	pnpm run format
	cd services/ai-service && ruff format .
	cd services/anticorruption-service && ruff format .

format-check: ## Vérifie le formatage sans modifier
	pnpm run format:check

check-types: ## Vérifie les types TypeScript (turbo)
	pnpm run check-types

# ── Vérification du repo (chaîne data + schémas + docs) ────────────────────
verify: ## Lance la chaîne complète de vérification (data + schémas + docs)
	pnpm run verify:repo

validate-data: ## Vérifie les invariants des données Mali
	pnpm run validate:data

validate-schemas: ## Vérifie les JSON Schemas (Ajv)
	pnpm run validate:schemas

docs-sync: ## Vérifie la cohérence des cross-références documentaires
	pnpm run docs:sync:check

# ── Docker ─────────────────────────────────────────────────────────────────
docker-up: ## Démarre l'infrastructure Docker (PostgreSQL, Redis, RabbitMQ, etc.)
	$(DOCKER_COMPOSE) up -d

docker-down: ## Arrête l'infrastructure Docker
	$(DOCKER_COMPOSE) down

docker-logs: ## Affiche les logs Docker en temps réel
	$(DOCKER_COMPOSE) logs -f

docker-ps: ## Liste les conteneurs en cours d'exécution
	$(DOCKER_COMPOSE) ps

docker-down-v: ## Arrête ET supprime les volumes (⚠️ PERTE DE DONNÉES)
	$(DOCKER_COMPOSE) down -v

# ── Base de données ────────────────────────────────────────────────────────
db-generate: ## Génère le client Prisma
	cd packages/database && pnpm run db:generate

db-migrate: ## Applique les migrations Prisma
	cd packages/database && pnpm run db:migrate

db-seed: ## Peuple la base avec les données initiales (référentiel Mali)
	cd packages/database && pnpm run db:seed

db-studio: ## Ouvre Prisma Studio (interface visuelle BDD)
	cd packages/database && pnpm run db:studio

db-reset: ## Remet la base à zéro (⚠️ supprime toutes les données)
	cd packages/database && pnpm exec prisma migrate reset --force

db-validate: ## Valide le schéma Prisma
	cd packages/database && pnpm exec prisma validate

seed-locations-generate: ## Régénère infrastructure/scripts/seed-locations.sql depuis data/mali/*.json
	@echo "🌍 Génération du seed-locations.sql depuis data/mali/*.json..."
	@node scripts/generate-seed-sql.mjs
	@echo "✅ infrastructure/scripts/seed-locations.sql régénéré."

audit-cercles: ## Audit cohérence cercles.json ↔ mali-cercles-polygons.json (geoBoundaries ADM2)
	@node scripts/audit-cercles-coverage.mjs

enrich-cercles: ## Enrichit cercles.json depuis Wikipedia FR + géocode Nominatim (dry-run par défaut)
	@echo "🌐 Enrichissement cercles depuis Wikipedia + Nominatim..."
	@echo "   (dry-run — pour appliquer : make enrich-cercles-write)"
	@python scripts/enrich-cercles.py

enrich-cercles-write: ## Applique l'enrichissement Wikipedia → cercles.json (écrit le fichier)
	@python scripts/enrich-cercles.py --write
	@$(MAKE) seed-locations-generate

# ── Vault (gestion des secrets) ────────────────────────────────────────────
vault-init: ## Initialise Vault + applique policies + auth approle (dev/prod auto)
	@echo "🔐 Initialisation Vault (policies + engines + approles)..."
	@docker exec -e VAULT_ADDR=$(VAULT_ADDR) \
		-e VAULT_DEV_ROOT_TOKEN_ID=$${VAULT_DEV_ROOT_TOKEN_ID:-nina-dev} \
		$(VAULT_CONTAINER) sh /vault/init/vault-init.sh \
		|| (echo "⚠️  Si le script n'est pas monté, exécutez depuis l'hôte :"; \
		    echo "    cd infrastructure/vault && VAULT_ADDR=http://localhost:8200 VAULT_TOKEN=nina-dev bash vault-init.sh"; \
		    exit 1)

vault-seed: ## Pré-remplit les secrets de dev (JWT, DB, Keycloak, Africa's Talking)
	@echo "🌱 Seed des secrets dev..."
	@cd infrastructure/vault && VAULT_ADDR=http://localhost:$${VAULT_PORT:-8200} \
		VAULT_TOKEN=$${VAULT_DEV_ROOT_TOKEN_ID:-nina-dev} bash seed-secrets.sh

vault-rotate: ## Lance manuellement la rotation des secrets (clés Transit + DB + AppRole)
	@echo "🔄 Rotation des secrets Vault..."
	@cd infrastructure/vault && VAULT_ADDR=http://localhost:$${VAULT_PORT:-8200} \
		VAULT_TOKEN=$${VAULT_DEV_ROOT_TOKEN_ID:-nina-dev} bash rotate-secrets.sh

vault-unseal: ## (PROD) Déverrouille Vault (lit secrets/vault-init.txt)
	@if [ ! -f secrets/vault-init.txt ]; then \
		echo "❌ secrets/vault-init.txt introuvable. Lancez 'make vault-init' d'abord."; \
		exit 1; \
	fi
	@echo "🔓 Unseal Vault avec 3 des 5 keys..."
	@grep "Unseal Key" secrets/vault-init.txt | head -3 | awk '{print $$NF}' | \
		xargs -I{} docker exec $(VAULT_CONTAINER) vault operator unseal {}

vault-status: ## Affiche le statut de Vault
	docker exec $(VAULT_CONTAINER) vault status

vault-bootstrap: vault-init vault-seed ## Setup complet : init + policies + seed (dev)
	@echo "✅ Vault bootstrap terminé. Cf. docs/security/vault-usage.md"

# ── Certificats mTLS (interopérabilité AES) ────────────────────────────────
certs-generate: ## Génère les certificats mTLS dev pour les 3 pays AES (Mali/BFA/Niger)
	@mkdir -p $(CERTS_DIR)
	@echo "🔏 Génération de la CA AES dev..."
	openssl req -x509 -newkey rsa:4096 -nodes \
		-keyout $(CERTS_DIR)/ca.key -out $(CERTS_DIR)/ca.pem \
		-days 365 -subj "/CN=AES-DEV-CA/O=Alliance des Etats du Sahel/C=ML" \
		-addext "basicConstraints=CA:TRUE"
	@for COUNTRY in mli bfa ner; do \
		echo "🔏 Génération du cert client $$COUNTRY..." ; \
		openssl req -newkey rsa:2048 -nodes \
			-keyout $(CERTS_DIR)/$$COUNTRY.key -out $(CERTS_DIR)/$$COUNTRY.csr \
			-subj "/CN=AES-$$COUNTRY-GW-01/O=Gouvernement $$COUNTRY/C=ML" ; \
		openssl x509 -req -in $(CERTS_DIR)/$$COUNTRY.csr \
			-CA $(CERTS_DIR)/ca.pem -CAkey $(CERTS_DIR)/ca.key -CAcreateserial \
			-out $(CERTS_DIR)/$$COUNTRY.pem -days 90 ; \
		rm $(CERTS_DIR)/$$COUNTRY.csr ; \
	done
	@echo "✅ Certificats mTLS générés dans $(CERTS_DIR)/"
	@echo "   ⚠️  Pour la PRODUCTION : utiliser Vault PKI engine (cf. doc 15)"

certs-clean: ## Supprime les certificats mTLS dev
	rm -rf $(CERTS_DIR)/*.key $(CERTS_DIR)/*.pem $(CERTS_DIR)/*.srl

# ── Nettoyage ──────────────────────────────────────────────────────────────
clean: ## Supprime node_modules, dist, .next, .turbo
	pnpm run clean
	rm -rf node_modules/.cache .turbo

clean-deep: ## Nettoyage profond : tout supprimer (node_modules, .venv, dist, builds)
	$(MAKE) clean
	rm -rf node_modules .venv
	find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# ── Initialisation complète ────────────────────────────────────────────────
init: install docker-up db-migrate db-seed verify ## Setup complet : install + docker + migrations + seeds + verify
	@echo "═══════════════════════════════════════════════"
	@echo "✅ NINA-AES Platform initialisée avec succès"
	@echo "═══════════════════════════════════════════════"
	@echo "Prochaines étapes :"
	@echo "  • make docker-ps    → vérifier les conteneurs"
	@echo "  • make dev          → démarrer le développement"
	@echo "  • make help         → lister toutes les cibles"
