#!/bin/sh
set -e

echo "Starting OpenEnv Smart Parking Server on 0.0.0.0:${PORT:-7860}..."
python -m server.app
