# Repository Conventions

## Active Project Layout

- `mail-backend/`: active Fastify API, providers, Prisma schema and backend tests
- `frontend/`: active React application and frontend tests
- `docs/`: maintained product, state and test documentation
- `start.ps1`, `launch-stop.ps1`, `stop.ps1`: Windows local lifecycle
- `docker-compose.yml`: active container topology

`backend/` and root `ChatGPT_team.py` are legacy code. Do not implement MailOps changes there unless the task explicitly targets them.

## Branch Strategy

- `main`: only versions that have passed production deployment
- `dev/<version>`: the single development branch for a numbered version
- `release/<version>`: the immutable candidate line promoted from the matching dev branch
- `v<version>`: archive tag created only after production succeeds

Versions use a monotonically increasing three-digit sequence such as `001` and `002`. The authoritative branch, image and deployment gates are documented in `docs/version-management.md`.
GitHub uses `main` as the default branch. The former `develop` branch is historical and must not be used as the base for new versions.

## Delivery Flow

1. Calculate the next unused version and create `docs/releases/<version>.md`.
2. Create `dev/<version>` from the latest production `main`; version `001` is the one-time migration from the former `develop` branch.
3. Implement and run checks proportional to the change; run `npm run validate` for shared or cross-module behavior.
4. Update the relevant authority document listed in `docs/README.md`.
5. Commit only when requested, using Conventional Commits.
6. Fast-forward the completed dev branch to `release/<version>` and build the two candidate images.
7. Pin the workflow-produced digests, complete local and server validation, and update the version record.
8. Only after production succeeds, fast-forward the release branch to `main` and create `v<version>`.

Do not rebuild an image from a Git tag or deploy a mutable image tag. Production uses the exact backend and frontend digests recorded for the release.

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
