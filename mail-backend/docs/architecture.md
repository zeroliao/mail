# Mail Backend Architecture

## 1. Goals

- Build a backend for managing multiple Gmail and Outlook/Hotmail accounts.
- Expose both REST API and Web-ready OAuth callback endpoints.
- Keep all secrets in environment variables.
- Use TypeScript, JWT, Swagger, and Docker Compose.

## 2. Technical Stack

- Runtime: Node.js 22+
- HTTP framework: Fastify
- ORM/database: Prisma + SQLite by default, PostgreSQL-ready through `DATABASE_URL`
- Auth:
  - Admin/API auth: JWT
  - Mailbox auth: OAuth 2.0 authorization code flow
- Mail providers:
  - Gmail: Google OAuth 2.0 + Gmail API
  - Outlook/Hotmail: Microsoft identity platform OAuth 2.0 + Microsoft Graph API
- Docs: `@fastify/swagger` + `@fastify/swagger-ui`
- Containers: Docker + Docker Compose

## 3. Why This Stack

- Fastify keeps the API small, typed, and fast to bootstrap.
- Prisma gives a stable data model, migrations, and easy switch from SQLite to PostgreSQL.
- SQLite is enough for local/dev bootstrap; PostgreSQL fits production concurrency.
- Provider integrations stay isolated behind provider services, which makes Gmail and Microsoft flows consistent at the route layer.

## 4. Architecture Layout

```text
mail-backend/
├─ docs/
│  └─ architecture.md
├─ prisma/
│  └─ schema.prisma
├─ src/
│  ├─ config/          # env + swagger
│  ├─ db/              # Prisma client
│  ├─ lib/             # crypto, errors, mail parsing helpers
│  ├─ modules/
│  │  ├─ auth/         # JWT login
│  │  ├─ accounts/     # account CRUD + OAuth bootstrap/callback
│  │  └─ mail/         # list/detail/send/sync
│  ├─ providers/       # Gmail and Microsoft Graph adapters
│  ├─ types/           # shared mail/provider contracts
│  ├─ app.ts
│  └─ server.ts
├─ Dockerfile
├─ docker-compose.yml
└─ .env.example
```

## 5. Authentication Strategy

### 5.1 API JWT

- `POST /api/v1/auth/login`
- Admin credentials come from `API_ADMIN_USERNAME` and `API_ADMIN_PASSWORD`
- Successful login returns a signed JWT
- All account and mail APIs require `Authorization: Bearer <token>`
- OAuth callback routes stay public because Google/Microsoft redirect back into them

### 5.2 Gmail OAuth

- Flow: Google OAuth 2.0 authorization code flow for server-side web apps
- Redirect URI configured by `GOOGLE_OAUTH_REDIRECT_URI`
- Recommended scopes in this implementation:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `https://www.googleapis.com/auth/gmail.send`
- `access_type=offline` is required to receive a refresh token
- `state` is stored server-side in DB with short expiration

Reference:
- Google OAuth 2.0 for Web Server Applications
- Gmail API `users.messages.list/get/send`

### 5.3 Microsoft OAuth

- Flow: Microsoft identity platform authorization code flow for confidential server apps
- Redirect URI configured by `MICROSOFT_OAUTH_REDIRECT_URI`
- Tenant defaults to `common`, overridable by `MICROSOFT_TENANT_ID`
- Recommended scopes in this implementation:
  - `offline_access`
  - `openid`
  - `profile`
  - `email`
  - `Mail.Read`
  - `Mail.ReadWrite`
  - `Mail.Send`
  - `User.Read`
- Tokens are later used against Microsoft Graph `v1.0`

Reference:
- Microsoft identity platform authorization code flow
- Microsoft Graph `GET /me/messages`
- Microsoft Graph `POST /me/sendMail`

## 6. Data Model

### Account

- One row per connected mailbox
- Stores provider, email, display name, token expiry, scopes, encrypted access token, encrypted refresh token, and provider metadata

### OAuthState

- Temporary anti-CSRF state storage
- Supports optional web redirect metadata after OAuth callback completion

### MailMessage

- Cached remote messages normalized across providers
- Stores subject, participants, preview, text/html body, folder, flags, timestamps, raw payload, and attachment flag

### Attachment

- Stores attachment metadata
- Can later be extended to real file/object storage through `storageKey`

## 7. Main REST API

- `POST /api/v1/auth/login`
- `GET /api/v1/health`
- `GET /api/v1/accounts`
- `POST /api/v1/accounts`
- `GET /api/v1/accounts/:accountId`
- `PATCH /api/v1/accounts/:accountId`
- `DELETE /api/v1/accounts/:accountId`
- `POST /api/v1/accounts/oauth/google/url`
- `GET /api/v1/accounts/oauth/google/callback`
- `POST /api/v1/accounts/oauth/microsoft/url`
- `GET /api/v1/accounts/oauth/microsoft/callback`
- `GET /api/v1/accounts/:accountId/messages`
- `GET /api/v1/accounts/:accountId/messages/:messageId`
- `POST /api/v1/accounts/:accountId/messages/send`

## 8. Token Handling

- Provider tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY`
- Access token refresh happens lazily before remote Gmail/Graph calls
- When providers rotate refresh tokens, the new value replaces the old stored token

## 9. Deployment Notes

- Dev: SQLite via `file:./prisma/dev.db`
- Prod: set `DATABASE_URL` to PostgreSQL DSN
- Docker Compose ships with PostgreSQL service for production-like local testing

## 10. External Reference Sources

Checked on 2026-06-14:

- Google OAuth 2.0 for Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- Gmail API send/list/get references: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
- Microsoft Graph list messages: https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- Microsoft Graph send mail: https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- Microsoft identity platform auth code flow: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
