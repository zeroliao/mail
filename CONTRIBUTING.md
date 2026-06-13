# Repository Conventions

## Project Layout

This repository uses a simple monorepo layout:

- `backend/`: backend services and shared server-side modules
- `frontend/`: frontend application and client-side modules
- `docs/`: architecture notes, workflows, and team conventions

## Branch Strategy

- `main`: production branch; only release-ready code is merged here
- `develop`: default integration branch for daily development
- `feature/*`: all feature work branches from `develop` and merges back into `develop`

Branch naming format:

```text
feature/<area>-<short-description>
```

Examples:

- `feature/auth-login`
- `feature/mailbox-import`
- `feature/admin-user-search`

## Delivery Flow

1. Branch from `develop`
2. Commit with Conventional Commits
3. Open a pull request into `develop`
4. Merge `develop` into `main` for production releases

## Commit Message Convention

Use Conventional Commits:

```text
<type>(<optional-scope>): <short summary>
```

Common commit types:

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation update
- `refactor`: internal restructuring without behavior change
- `test`: test changes
- `chore`: tooling or repository maintenance

Examples:

- `feat(backend): add mailbox account aggregate`
- `fix(frontend): handle expired session redirect`
- `docs: document release workflow`
