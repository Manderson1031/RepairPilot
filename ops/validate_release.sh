#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Python compile =="
python -m compileall -q backend/app
echo "== Backend tests =="
(cd backend && PYTHONPATH=. pytest -q tests/test_safety.py tests/test_demo_engine.py tests/test_safety_cases.py tests/test_repository.py tests/test_sessions.py)
echo "== Production config =="
(cd backend && python -m app.validate_config)
echo "Release validation passed."
