VENV := .venv
BIN := $(VENV)/bin
PROJECT := next-caltrain-app

.PHONY: setup lint test check build server dev deploy

# Python 3.13 (from mise) to match App Engine's python313 runtime.
setup: $(VENV) web/node_modules

$(VENV): requirements.txt requirements-dev.txt
	test -d $(VENV) || mise exec python@3.13 -- python3 -m venv $(VENV)
	$(BIN)/pip install -q -r requirements.txt -r requirements-dev.txt
	touch $(VENV)

web/node_modules: web/package.json web/package-lock.json
	cd web && npm install
	touch web/node_modules

# Fixes what it can.
lint: setup
	$(BIN)/ruff check --fix .
	cd web && npm run -s lint

# Full spec output.
test: setup
	$(BIN)/mamba --format=documentation spec
	cd web && npm test

# Before pushing: lint without fixing, type-check, terse specs.
check: setup
	$(BIN)/ruff check .
	$(BIN)/mamba --format=progress spec
	cd web && npm run -s check

build: web/node_modules
	cd web && npm run -s build

# The whole site on http://localhost:8080/, the way App Engine serves it:
# the built web client plus the API (see main.py).
server: setup build
	$(BIN)/uvicorn main:app --reload --port 8080

# The web client with hot reload on http://localhost:5173/. Its /feed
# requests go to next-caltrain-pwa unless FEED_ORIGIN says otherwise, e.g.
# FEED_ORIGIN=http://localhost:8080 with `make server` running.
dev: web/node_modules
	cd web && npm run dev

deploy: check build
	gcloud app deploy app.yaml --quiet --project=$(PROJECT)
