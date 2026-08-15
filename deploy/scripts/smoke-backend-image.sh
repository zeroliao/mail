#!/usr/bin/env bash
set -euo pipefail

image_ref="${1:-}"
if [[ -z "$image_ref" ]]; then
  echo "usage: $0 <backend-image-ref>" >&2
  exit 2
fi

suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
suffix="$(printf '%s' "$suffix" | tr -cd 'a-zA-Z0-9_.-')"
container_name="mailops-backend-smoke-${suffix}"
volume_name="${container_name}-data"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$volume_name" >/dev/null
docker run --detach \
  --name "$container_name" \
  --volume "${volume_name}:/data" \
  --env NODE_ENV=production \
  --env HOST=0.0.0.0 \
  --env PORT=3000 \
  --env DATABASE_URL=file:/data/smoke.db \
  --env CORS_ORIGIN=http://localhost:5173 \
  --env APP_BASE_URL=http://localhost:3000 \
  --env JWT_SECRET=ci-smoke-jwt-secret-1234567890 \
  --env TOKEN_ENCRYPTION_KEY=ci-smoke-token-encryption-key-123456 \
  --env API_ADMIN_USERNAME=admin \
  --env API_ADMIN_PASSWORD=ci-smoke-admin-password \
  "$image_ref" >/dev/null

ready=false
for _attempt in $(seq 1 45); do
  if docker exec "$container_name" node -e \
    "fetch('http://127.0.0.1:3000/api/v1/health').then(async (response) => { const body = await response.json(); if (!response.ok || body.status !== 'ok' || body.database?.ok !== true) process.exit(1); }).catch(() => process.exit(1));"; then
    ready=true
    break
  fi

  if [[ "$(docker inspect --format '{{.State.Running}}' "$container_name")" != "true" ]]; then
    break
  fi

  sleep 2
done

logs="$(docker logs "$container_name" 2>&1)"
printf '%s\n' "$logs"

if [[ "$ready" != "true" ]]; then
  echo "backend production image did not become healthy" >&2
  exit 1
fi

runtime_error_pattern='PrismaClientInitializationError|failed to detect.*(libssl|openssl)|Error loading shared library|libssl\.so|Query engine library for current platform'
if printf '%s\n' "$logs" | grep -Eiq "$runtime_error_pattern"; then
  echo "backend production image logs contain a Prisma/OpenSSL runtime error" >&2
  exit 1
fi

echo "backend production image smoke test passed: $image_ref"
