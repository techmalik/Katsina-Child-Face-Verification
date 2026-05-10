#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[startup] Starting face embedding service on port 8001…"
cd "$WORKSPACE_ROOT/artifacts/face-service"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 &
FACE_PID=$!

echo "[startup] Starting API server…"
cd "$WORKSPACE_ROOT"
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
