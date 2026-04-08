#!/bin/bash
set -e

# Any pre-run setup can go here

# Start the uvicorn server
echo "Starting OpenEnv Smart Parking Server on 0.0.0.0:7860..."
python -m server.app
