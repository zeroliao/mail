# Mail Account Manager Deployment Scaffold

## 1. What This Adds

This repository did not contain an existing Node.js backend or React frontend. The files added in this scaffold provide a minimal deployment baseline for the roadmap target system:

- `backend/`: Express API with healthcheck, CORS, helmet and rate limiting
- `frontend/`: React + Vite app, served by Nginx
- `docker-compose.yml`: frontend + backend + PostgreSQL
- `.github/workflows/ci.yml`: lint, test and build pipeline
- `.env.example`: required environment variables

## 2. Quick Start

1. Optional but recommended: create a local environment file if you want to override defaults:

   ```bash
   cp .env.example .env
   ```

2. Update at least these values before production use:

   - `POSTGRES_PASSWORD`
   - `JWT_SECRET`
   - `SESSION_SECRET`
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`

3. Start all services:

   ```bash
   docker compose up
   ```

4. Open the app:

   - Frontend: `http://localhost:8080`
   - Backend health API: `http://localhost:8080/api/health`

## 3. Services

- `db`: PostgreSQL 16 with persistent volume `postgres_data`
- `backend`: Node.js 20 Express API on internal port `3000`
- `frontend`: Nginx serving the React build and proxying `/api/*` to `backend`

## 4. Security Baseline

### HTTPS

- Local compose uses plain HTTP for simplicity.
- Production TLS termination should happen at Nginx or an upstream load balancer.
- A sample TLS Nginx server block is included at `frontend/nginx/production-ssl.conf.example`.
- For public deployments, use Let's Encrypt or your cloud provider certificate manager.

### CORS

- Backend CORS is restricted by `CORS_ORIGIN`.
- `TRUST_PROXY=1` assumes exactly one trusted reverse proxy in front of the backend.
- Use explicit origins only, for example:

  ```env
  CORS_ORIGIN=https://mail.example.com,https://admin.example.com
  ```

- Do not use `*` if cookies or bearer tokens are involved.

### Rate Limiting

- Backend applies `express-rate-limit` to `/api`.
- Tune with:

  ```env
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=100
  ```

- For login, OAuth callback and send-mail endpoints, use tighter per-route limits when those endpoints are implemented.

### Secrets

- Never commit `.env`.
- Replace all default placeholder secrets before any shared or production deployment.
- Prefer secret injection from GitHub Actions secrets, Docker secrets or your hosting platform secret manager.

## 5. CI/CD Notes

The GitHub Actions workflow currently does:

- `npm ci` for backend and frontend
- backend/frontend lint
- backend/frontend tests
- frontend build
- `docker compose build`

For CD, the next step is to add:

- container registry push
- deployment job to the target host
- environment-specific secret injection

## 6. Important Scope Note

The original repository contents are a standalone Python automation script, not the roadmap mailbox web app. This scaffold gives the project a runnable infrastructure baseline for the planned Node.js + React system, but the business endpoints, OAuth flows and mailbox features still need to be implemented on top of this base.
