#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-8000}"
RESTART_DELAY=3

restarts=0
_uvicorn_pid=0

_stop() {
  echo "[supervisor] Caught termination signal — stopping"
  if [ "$_uvicorn_pid" -ne 0 ]; then
    kill "$_uvicorn_pid" 2>/dev/null || true
    wait "$_uvicorn_pid" 2>/dev/null || true
  fi
  exit 0
}

trap _stop SIGTERM SIGINT

echo "[supervisor] Starting face embedding service on port ${PORT}"

while true; do
  echo "[supervisor] Launching uvicorn (restart #${restarts})"
  set +e
  python3 -m uvicorn main:app --host 0.0.0.0 --port "${PORT}" &
  _uvicorn_pid=$!
  wait "$_uvicorn_pid"
  exit_code=$?
  set -e
  _uvicorn_pid=0
  restarts=$((restarts + 1))
  echo "[supervisor] uvicorn exited with code ${exit_code}. Restarting in ${RESTART_DELAY}s… (total restarts: ${restarts})"
  sleep "${RESTART_DELAY}"
done
