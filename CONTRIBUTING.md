# Repository Conventions

## Active Project Layout

- `mail-backend/`: active Fastify API, providers, Prisma schema and backend tests
- `frontend/`: active React application and frontend tests
- `docs/`: maintained product, state and test documentation
- `start.ps1`, `launch-stop.ps1`, `stop.ps1`: Windows local lifecycle
- `docker-compose.yml`: active container topology

`backend/` and root `ChatGPT_team.py` are legacy code. Do not implement MailOps changes there unless the task explicitly targets them.

## Branch Strategy

- `main`: release-ready branch
- `develop`: integration branch for daily development
- `feature/*`: feature work branched from and merged into `develop`

Use `feature/<area>-<short-description>`, for example `feature/mailbox-import`.

## Delivery Flow

1. Inspect `git status --short` and preserve existing user changes.
2. Branch from `develop` when a branch is requested.
3. Implement and run checks proportional to the change; run `npm run validate` for shared or cross-module behavior.
4. Update the relevant authority document listed in `docs/README.md`.
5. Commit only when requested, using Conventional Commits.
6. Open a pull request into `develop`; merge `develop` into `main` for a release.

## Commit Messages

Use:

```text
<type>(<optional-scope>): <short summary>
```

Common types are `feat`, `fix`, `docs`, `refactor`, `test` and `chore`.

Examples:

- `feat(mail-backend): add mailbox import validation`
- `fix(frontend): preserve account label filters`
- `docs: refresh local deployment guide`

Before committing, verify that the staged diff contains only the requested work and no `.env`, SQLite database, token, password, generated output or runtime log.
