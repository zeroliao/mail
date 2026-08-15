# Mail Backend Architecture

## Scope

`mail-backend/` is the active MailOps API. It manages mailbox accounts, provider authentication, normalized mail access and the local lifecycle endpoint. The legacy root `backend/` is outside this runtime.

## Stack And Layout

- Node.js 22+, TypeScript, Fastify
- Prisma + SQLite
- JWT for the single administrator API session
- Gmail API, Microsoft Graph and IMAP/SMTP providers
- Swagger at `/docs`

```text
mail-backend/
├─ prisma/                 # schema and migrations
├─ src/
│  ├─ config/             # validated environment
│  ├─ db/                 # Prisma client
│  ├─ lib/                # crypto, errors, validation, provider presentation
│  ├─ modules/
│  │  ├─ auth/            # administrator JWT login
│  │  ├─ accounts/        # CRUD, labels, OAuth and direct imports
│  │  ├─ mail/            # account-scoped list/detail/send
│  │  └─ system/          # health, compatibility mail routes, local shutdown
│  ├─ providers/          # Gmail, Microsoft Graph and IMAP/SMTP behavior
│  ├─ types/              # internal provider and mail contracts
│  ├─ app.ts
│  └─ server.ts
├─ test/
└─ docs/architecture.md
```

Provider-specific token exchange, refresh, folder mapping and mail operations belong in `src/providers/`. Routes validate HTTP input and services own account persistence and cross-provider orchestration.

## Authentication Paths

### Administrator JWT

`POST /api/v1/auth/login` validates `API_ADMIN_USERNAME` and `API_ADMIN_PASSWORD`. Account, mail and shutdown APIs require the resulting bearer token. OAuth callback and health routes are explicit public exceptions.

### Authorization Code OAuth

Gmail and Microsoft authorization-code flows create a short-lived `OAuthState` record for anti-CSRF state and optional frontend redirect metadata. A successful callback skips an already-bound account; otherwise it stores the new account as `ACTIVE` with provider tokens encrypted.

### Microsoft Public Client Refresh Token

`POST /api/v1/accounts/bind-oauth` and `/bind-oauth/batch` accept a per-account `clientId` and `refreshToken`. The service:

1. skips an existing `(MICROSOFT, email)` account before credential validation;
2. otherwise exchanges the refresh token without a client secret, using tenant `consumers` by default;
3. calls Microsoft Graph `/me` to validate the connection and resolve the canonical profile, then checks that profile email again;
4. creates or restores the new account as `ACTIVE`, encrypting the access token, refresh token and per-account client ID;
5. records `metadata.authMethod = "oauth-refresh"`, tenant and public-client marker.

When Microsoft rotates the refresh token, the returned value is stored only for a newly added or restored account. Batch imports run each item independently and return success, skipped and failure counts with per-item results.

### IMAP / SMTP Password

The direct credential route verifies IMAP before persistence. The encrypted password uses the existing `accessToken` column, with `tokenType = "imap-password"`; server configuration is stored in metadata. These accounts bypass OAuth refresh and use the IMAP/SMTP provider paths.

## Account Model And Lifecycle

`Account` stores provider identity, display data, encrypted credentials, scopes, expiry/sync timestamps and JSON metadata. `(provider, email)` is unique. Public account selects never expose encrypted credential fields.

Persistent statuses are:

- `ACTIVE`: usable and returned to the frontend as connected.
- `DISCONNECTED`: visible but requires intervention.
- `ERROR`: visible but requires intervention.
- `ARCHIVED`: soft-deleted with `deletedAt` and excluded from normal lists.

Successful OAuth/import set `ACTIVE`; repeated imports of an active account are skipped, while re-importing a deleted account clears `deletedAt`. Delete sets `ARCHIVED`. Token expiry alone does not change status. The account service lazily refreshes tokens before provider calls and retries a Microsoft mail request once after an authentication 401.

Account labels are normalized into `metadata.labels`: trim, remove empty values, deduplicate, cap at 12 labels, and cap input label length at 24 characters. Account restoration preserves existing labels.

## Mail Model

Provider messages are normalized into `MailMessage` and attachment metadata into `Attachment`. The API supports account-scoped list/detail/send and compatibility routes for a cross-account inbox. Provider folder identifiers are translated inside provider code; callers use stable folder keys.

## Security Boundaries

- `TOKEN_ENCRYPTION_KEY` encrypts provider tokens, per-account Microsoft client IDs and IMAP passwords at rest.
- Never return or log stored secrets, raw tokens or credentials.
- All protected routes retain JWT authentication.
- `POST /api/v1/system/shutdown` additionally checks that the request is local. On Windows it launches the root `launch-stop.ps1`, which detaches `stop.ps1` from the backend process tree.
- `.env`, SQLite files and backups are local sensitive data and stay outside normal code changes.

## Persistence And Deployment

Local development uses the root environment and a SQLite file; Docker overrides `DATABASE_URL` to `file:/data/dev.db` and persists `/data` in the `mail_data` volume. Moving to PostgreSQL requires changing the Prisma datasource and producing tested migrations; changing only the URL is insufficient.

Schema changes require a Prisma migration. Labels intentionally use existing JSON metadata and therefore require no schema migration.

## Validation

Run `npm --prefix mail-backend run typecheck` and `npm --prefix mail-backend test` for backend changes. Shared API, authentication, data-model or user-flow changes require the repository-level `npm run validate`. Real provider flows remain manual acceptance items documented in `../../docs/testing.md`.
