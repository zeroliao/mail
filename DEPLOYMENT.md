# Mail Account Manager Deployment

## Runtime Layout

- `frontend/`: React + Vite application, served by Nginx in Docker
- `mail-backend/`: Fastify + Prisma API
- `docker-compose.yml`: frontend and backend services
- `deploy/docker-compose.yml`: digest-pinned production services
- `mail_data`: named Docker volume containing the SQLite database

The legacy `backend/` directory is not part of the active runtime.

## Local Development

Requirements:

- Node.js 22+
- npm
- A root `.env`; `start.ps1` creates it from `.env.example` when missing

Start both services from the repository root:

```powershell
.\start.ps1 -Mode dev
```

Endpoints:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/v1/health`
- Swagger UI: `http://localhost:3000/docs`

Stop the recorded process trees and any remaining listeners on ports 3000/5173 that can be verified as belonging to this project:

```powershell
.\stop.ps1
```

The PID file includes process start times to avoid terminating a reused PID. Port fallback cleanup inspects command lines and skips listeners that cannot be identified as MailOps. The authenticated UI stop action is available only for local Windows launcher mode and delegates to the same script through `launch-stop.ps1`.

The desktop shortcut `MailOps 邮件控制台.lnk` starts local dev mode and closes its command window after startup succeeds. It is a machine-local convenience, not a repository deployment artifact.

## Docker

Start the application:

```powershell
.\start.ps1 -Mode docker
```

Or use Docker Compose directly:

```bash
docker compose up --build -d
```

The backend uses `file:/data/dev.db`; the `mail_data` volume persists account and cached-message data across container recreation.

Back up the database before upgrades or destructive maintenance:

```bash
docker compose stop backend
docker compose cp backend:/data/dev.db ./mail-backup.db
docker compose start backend
```

The root Compose file is for local development and builds images on the current machine. Production releases use `deploy/docker-compose.yml` and the immutable backend/frontend digests recorded for the version. Do not build Vite or TypeScript images on the production server.

Validate the production Compose input from the repository root:

```bash
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml config
```

The complete numbered release and short-downtime deployment flow is documented in `docs/version-management.md` and `deploy/README.md`.

## Required Configuration

Replace all placeholder values before shared or production deployment:

- `JWT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `API_ADMIN_PASSWORD`
- Provider client IDs and secrets for enabled OAuth integrations
- OAuth redirect URIs registered with Google and Microsoft

The configured redirect URIs must exactly match the public backend URL. Local defaults use port `3000`.

## Validation

Run the complete local gate from the repository root:

```bash
npm run validate
```

This runs backend type checking and tests, frontend lint and tests, then both production builds. CI performs the same component-level checks, builds the Docker images, and starts the backend production image through `deploy/scripts/smoke-backend-image.sh` to verify migration, health and Prisma/OpenSSL runtime compatibility.

## Production Constraints

- Current authentication is a single administrator account configured through environment variables.
- JWTs are stored in browser `localStorage`; deploy only behind HTTPS and a restrictive Content Security Policy.
- SQLite is appropriate for a single-instance internal deployment. Multi-instance or high-concurrency deployment requires a deliberate database migration, including a Prisma provider change and compatible migrations.
- Production keeps one backend/SQLite writer. Back up SQLite before every upgrade; do not use a blue/green dual-backend rollout with the current database model.
- The production Compose limits the frontend to 128 MiB and the backend to 768 MiB. Review host available memory before changing those limits.
- Production images must use `@sha256:` references produced from `release/<version>`; mutable tags are not deployment inputs.
- Migrated SQLite data containing encrypted provider tokens is usable only with the matching `TOKEN_ENCRYPTION_KEY`. Preserve the key across host migration without printing it or writing it into repository files.
- Terminate TLS at Nginx, a load balancer, or an ingress controller.
- Keep `.env`, database files, and backups outside version control.
- The UI shutdown endpoint is intentionally local-only. Use Docker Compose, a service manager, or the deployment platform to stop non-local instances.
