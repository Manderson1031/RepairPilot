#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: $0 backup.dump"; exit 2; fi
if [[ -z "${DATABASE_URL:-}" ]]; then echo "DATABASE_URL is required"; exit 2; fi
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$1"
echo "Restore complete."
