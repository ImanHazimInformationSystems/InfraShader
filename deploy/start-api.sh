#!/usr/bin/env bash
set -euo pipefail

# Render Free has no pre-deploy command. Run migrations on startup, before accepting
# traffic. One instance/worker is intentional for the free pilot's 512 MB budget.
cd "$(dirname "$0")/../apps/api"
uv run --no-sync alembic upgrade head
exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
