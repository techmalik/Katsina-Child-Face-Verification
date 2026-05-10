#!/usr/bin/env bash
# Launches the Python face embedding service on port 8001, waits for it to be
# ready, then exec's into the Node API server so Node owns the process slot and
# the deployment health check works correctly.
set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FACE_PORT="${FACE_SERVICE_PORT:-8001}"

echo "[startup] Starting face embedding service on port ${FACE_PORT}…"
cd "$WORKSPACE_ROOT/artifacts/face-service"
python3 -m uvicorn main:app --host 0.0.0.0 --port "$FACE_PORT" &
FACE_PID=$!

echo "[startup] Waiting for face service to be ready (up to 60 s)…"
READY=0
for i in $(seq 1 60); do
  if kill -0 "$FACE_PID" 2>/dev/null && \
     curl -sf "http://localhost:${FACE_PORT}/health" >/dev/null 2>&1; then
    echo "[startup] Face service ready after ${i}s"
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -eq 0 ]; then
  echo "[startup] WARNING: face service did not become ready in 60 s — continuing anyway"
fi

echo "[startup] Starting API server…"
cd "$WORKSPACE_ROOT"
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
