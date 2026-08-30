#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
STAMP=$(date +%Y%m%d_%H%M%S)
if [[ "${DATABASE_URL:-}" == postgres* ]]; then
  pg_dump "$DATABASE_URL" -Fc -f "backups/repairpilot_${STAMP}.dump"
  echo "Postgres backup: backups/repairpilot_${STAMP}.dump"
else
  cp backend/data/repairpilot.db "backups/repairpilot_${STAMP}.db"
  echo "SQLite backup: backups/repairpilot_${STAMP}.db"
fi
