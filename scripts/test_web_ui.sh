#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
for dependency in node python3; do command -v "$dependency" >/dev/null || { echo "Missing required dependency: $dependency"; exit 1; }; done
python3 scripts/dependencies.py
for source in site/platform/*.js scripts/*.mjs tests/web/*.mjs; do node --check "$source"; done
for test in source_package site_routes site_preview site_launchers site_delivery nginx_delivery; do python3 "tests/web/$test.py"; done
node tests/web/firebase_provider.mjs
python3 scripts/generate_farm_vocabulary.py --check
python3 tests/integration/run.py
node tests/web/site_models.mjs
python3 tests/web/site_runtime.py --frontend shipped
node tests/web/farm_models.mjs --shipped
python3 tests/web/farm_art.py
python3 tests/web/farm_art.py --case crops
node tests/web/progress_model.mjs
node tests/web/site_games.mjs
node tests/web/site_program_protocol.mjs
node tests/web/site_deployment.mjs "${DYNLEX_TEST_WEB_ROOT:-$ROOT/build/site}"
