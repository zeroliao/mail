# Git Workflow

## Protected Branches

- `main`: production-ready code only
- `develop`: active integration branch

## Working Branches

Create all implementation branches from `develop`:

```text
feature/<area>-<short-description>
```

Examples:

- `feature/account-invite`
- `feature/email-provider-sync`
- `feature/audit-log-export`

## Merge Rules

1. Rebase or merge the latest `develop` before opening a pull request
2. Merge `feature/*` into `develop`
3. Merge `develop` into `main` only for tested release candidates

## Commit Messages

Follow Conventional Commits:

```text
<type>(<optional-scope>): <short summary>
```

Suggested examples:

- `feat(frontend): add account list page scaffold`
- `feat(backend): add health check endpoint`
- `fix: correct branch setup script`
- `docs: add repository workflow guide`
