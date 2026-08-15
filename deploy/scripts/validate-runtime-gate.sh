#!/usr/bin/env bash
set -euo pipefail

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is unavailable; start Docker or run this gate in a Docker-capable isolated environment." >&2
  exit 1
fi

docker compose build
bash deploy/scripts/smoke-backend-image.sh mailops-backend:local

echo "Docker build and backend runtime gate passed."
