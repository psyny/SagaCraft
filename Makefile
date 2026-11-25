.PHONY: help up down build logs logs-api ps clean db-reset prod-local-up prod-local-down prod-local-clean
.PHONY: be-install be-tests be-tests-postgres be-migration fe-install fe-build fe-tests gpu-check

# Keep in sync with make.bat (Windows).

help: ## Show this help message
	@echo 'Usage: make [target]'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ============================================================================
# Docker
# ============================================================================

up: ## Start all services (migrations run on API startup)
	docker compose up -d --build --renew-anon-volumes
	@echo ""
	@echo "App: http://localhost:3100   API docs: http://localhost:8100/docs   Sign in: admin / admin123"

down: ## Stop all services (data is kept)
	docker compose down

build: ## Build all services
	docker compose build

logs: ## Follow logs from all services
	docker compose logs -f

logs-api: ## Follow logs from backend-api
	docker compose logs -f backend-api

ps: ## Show running containers
	docker compose ps

clean: ## Stop and remove containers AND volumes (deletes local data)
	docker compose down -v

db-reset: clean ## Same as clean: start again with an empty database

prod-local-up: ## Production-like build on http://localhost:8180
	docker compose down
	docker compose -f docker-compose.prod-local.yml up -d --build

prod-local-down: ## Stop the production-like build
	docker compose -f docker-compose.prod-local.yml down

prod-local-clean: ## Stop the production-like build and delete its data
	docker compose -f docker-compose.prod-local.yml down -v

# ============================================================================
# Backend
# ============================================================================

BE_DIR := backend
BE_VENV := $(BE_DIR)/venv
ifeq ($(OS),Windows_NT)
  BE_BIN := $(BE_VENV)/Scripts
else
  BE_BIN := $(BE_VENV)/bin
endif

be-install: ## Create backend venv and install dependencies (dev included)
	@if [ ! -d "$(BE_VENV)" ]; then python -m venv $(BE_VENV); fi
	$(BE_BIN)/python -m pip install --upgrade pip
	$(BE_BIN)/python -m pip install -e "$(BE_DIR)[dev]"

be-tests: ## Backend tests on SQLite (no Docker). Optional: TARGET=test_stages.py
	cd $(BE_DIR) && ./$(subst $(BE_DIR)/,,$(BE_BIN))/python -m pytest sagacraft/tests/$(TARGET) -v

be-tests-postgres: ## Backend tests against the Docker Postgres test DB
	cd $(BE_DIR) && TEST_DATABASE_URL=postgresql://sagacraft:sagacraft@localhost:5442/sagacraft_test ./$(subst $(BE_DIR)/,,$(BE_BIN))/python -m pytest sagacraft/tests -v

be-migration: ## Autogenerate a migration after model changes. Usage: make be-migration MSG="add x"
	cd $(BE_DIR)/sagacraft && DATABASE_URL=postgresql://sagacraft:sagacraft@localhost:5442/sagacraft ../$(subst $(BE_DIR)/,,$(BE_BIN))/alembic revision --autogenerate -m "$(MSG)"

# ============================================================================
# Frontend
# ============================================================================

fe-install: ## Install frontend dependencies
	cd frontend && npm install

fe-build: ## Typecheck and build the frontend
	cd frontend && npm run build

fe-tests: ## Frontend unit tests
	cd frontend && npx vitest run

gpu-check: ## Build every WebGL shader under each graphics backend (app running)
	cd frontend && node scripts/gpu-check.mjs
