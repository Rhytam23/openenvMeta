#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo "Starting OpenEnv Smart Parking Server on 0.0.0.0:${PORT:-7860}..."
exec python -m server.app