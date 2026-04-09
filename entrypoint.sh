#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ -n "${SPACE_ID:-}" ] || [ -n "${HF_SPACE_ID:-}" ] || [ -n "${SPACE_HOST:-}" ] || [ "${RUN_WEB_SERVER:-0}" = "1" ]; then
  echo "Starting OpenEnv Smart Parking Server on 0.0.0.0:${PORT:-7860}..."
  exec python -m server.app
fi

exec sleep infinity