---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
# External Integrations

**Analysis Date:** 2026-11-06

## APIs & External Services

**Proton Lumo:**
- Primary AI backend for all chat completions and conversation sync
  - Base URL: `https://lumo.proton.me/api` (`PROTON_URLS.LUMO_API` in `src/app/urls.ts`)
  - Chat endpoint: `POST ai/v1/chat/completions` (`LUMO_CHAT_ENDPOINT` in `src/lumo-client/v2-body.ts`)
  - Request/response format mirrors Proton's web client, including OpenAI-style SSE streaming, `reasoning_effort`, and the `lumo` extension object
  - Encryption: U2L AES-GCM request/response encryption via `@lumo/lib/lumo-api-client/core/encryption.js` and `@lumo/crypto/index.js`; request key and ID sent in the `lumo` extension
  - Auth headers: `Authorization: Bearer <token>`, `x-pm-uid`, `x-pm-appversion` (`web-lumo@5.0.0` from `packages/lumo/src/config.ts`)
  - Client: custom `ProtonApi` fetch wrapper in `src/auth/api-factory.ts`
  - Toggle: `server.enableWebSearch`, `cli.enableWebSearch` in `config.defaults.yaml`

**Proton conversation storage (sync):**
- Remote spaces, conversations, messages, assets, settings, and master keys
  - Base path: `https://lumo.proton.me/api/lumo/v1` (`packages/lumo/src/remote/api.ts`)
  - Resources: `/spaces`, `/spaces/{SpaceID}/conversations`, `/conversations/{ConversationID}/messages`, `/spaces/{SpaceID}/assets`, `/masterkeys`, `/settings`
  - Client: `LumoApi` from `packages/lumo/src/remote/api.ts`, instantiated in `src/conversations/init.ts`, `src/conversations/fallback/sync/sync-service.ts`, and `src/conversations/fallback/sync/space-manager.ts`
  - Encryption: user PGP key -> master key -> space key -> data encryption key; implemented in `src/conversations/key-manager.ts`, `src/conversations/fallback/sync/space-manager.ts`, and `src/conversations/fallback/sync/encryption-codec.ts`
  - Requirement: only `browser` auth has the `lumo` scope needed for full API and sync (`IAuthProvider.supportsFullApi()` in `src/auth/types.ts`)
  - Enable: `conversations.enableSync: true` in `config.defaults.yaml`

**Proton account and core APIs:**
- Base URL: `https://account.proton.me/api` (`PROTON_URLS.ACCOUNT_API`)
- `POST /auth/refresh` - Token refresh for `login` and `rclone` methods (`src/auth/token-refresh.ts`)
- `POST /auth/refresh` - Cookie-based token refresh for `browser` method at `https://lumo.proton.me/api/auth/refresh` (`src/auth/providers/browser.ts`)
- `DELETE /core/v4/auth` - Session revocation on logout (`src/auth/logout.ts`)
- `GET /core/v4/users` - User keys, used by `src/auth/fetch-keys.ts` (currently not wired into the main flow)
- `GET /lumo/v1/masterkeys` - Master keys, used by `src/auth/fetch-keys.ts` (currently not wired into the main flow)
- `POST /auth/2fa` handling occurs inside the Go login helper (`src/auth/login/go/main.go`)

**Lumo native tools:**
- Executed server-side by Proton, enabled per request through the `tools` array
  - Internal: `proton_info`
  - External: `web_search`, `weather`, `stock`, `cryptocurrency`
  - Defaults and selection in `src/lumo-client/client.ts` (`DEFAULT_INTERNAL_TOOLS`, `DEFAULT_EXTERNAL_TOOLS`)
  - Toggle: `server.enableWebSearch` and `cli.enableWebSearch`

**OpenAI-compatible clients:**
- Inbound clients connect to `http://<host>:3003/v1` with a Bearer API key
  - Endpoints: `POST /v1/responses`, `POST /v1/chat/completions`, `GET /v1/models`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/status`
  - Health and metrics: `GET /health`, `GET /metrics`
  - Implemented in `src/api/server.ts` and `src/api/routes/`
- Documented clients: Home Assistant (`docs/howto-home-assistant.md`), Open WebUI (`docker-compose.yml`, README), OpenCode (`docs/opencode.md`), OpenClaw (`docs/openclaw.md`)
- OpenAI SDK 7.23.0 verifies compatibility in `tests/e2e/openai-sdk-streaming.test.ts`

**Local command execution:**
- CLI local actions execute shell commands through configured executors in `src/cli/local-actions/code-executor.ts`
  - Config: `cli.localActions.executors` in `config.defaults.yaml`
  - Defaults: `bash -c`, `python -c`, `sh -c`
  - File reads and edits go through `src/cli/local-actions/file-reader.ts`, `src/cli/local-actions/file-creator.ts`, and `src/cli/local-actions/edit-applier.ts`

## Data Storage

**Databases:**
- Local IndexedDB exposed through `indexeddbshim` with a SQLite backend (`better-sqlite3`)
  - Initialization: `src/shims/indexeddb-polyfill.ts`
  - Store: `src/conversations/store.ts` and `src/conversations/init.ts`
  - Location: `conversations.databasePath` (default `sessions/` in `config.defaults.yaml`)
  - Files: `<lowercased database name>.sqlite`, named from the stable Proton user ID
- Fallback in-memory LRU store
  - Implementation: `src/conversations/fallback/store.ts`
  - Selected by `conversations.useFallbackStore: true` (default in `config.defaults.yaml`)

**File Storage:**
- Local filesystem only
  - Encrypted auth vault: `sessions/vault.enc` by default (`auth.vault.path`)
  - CLI file reads and writes are limited to paths the user confirms
  - No S3, GCS, or other object storage integration

**Caching:**
- In-memory conversation cache: `src/conversations/store.ts` (LRU, deduplication, dirty tracking)
- In-memory vault key cache: `src/auth/vault/key-provider.ts` (`cachedKey`)
- In-memory request queue: `src/api/queue.ts` (p-queue, concurrency 1)
- No external cache service

## Authentication & Identity

**Auth Provider:**
- Custom Proton authentication with three interchangeable methods (`auth.method` in `config.defaults.yaml`)
  - `login`: Go helper using `github.com/henrybear327/go-proton-api` for SRP login, 2FA, and key password retrieval (`src/auth/login/`)
  - `browser`: Playwright connects over Chrome DevTools Protocol to an existing Chromium session, reads `ps-*` localStorage sessions, and extracts tokens plus user/master keys (`src/auth/browser/authenticate.ts`)
  - `rclone`: Parses an rclone `protondrive` config section for UID, access token, refresh token, and salted key password (`src/auth/rclone/`)
- Token management: `AuthManager` in `src/auth/manager.ts` handles scheduled refresh (default every 20 hours) and 401 retry through `src/auth/api-factory.ts`
- Inbound API authentication: static Bearer key from `server.apiKey`, checked in `src/api/middleware.ts`
- Browser auth dependency: external Chromium with CDP, default `http://localhost:9222` (`auth.browser.cdpEndpoint`)

**Credential storage:**
- AES-256-GCM vault with `[12-byte nonce][ciphertext][16-byte auth tag]` format (`src/auth/vault/vault.ts`)
- Vault key sources, in order (`src/auth/vault/key-provider.ts`):
  1. OS keychain via `keytar` (`auth.vault.keychain.service` / `account`)
  2. Docker secret or key file at `auth.vault.keyFilePath` (default `/run/secrets/lumo-vault-key`)
- Environment-variable keys are intentionally unsupported

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry, OpenTelemetry, or equivalent integration detected

**Logs:**
- Pino structured logging in `src/app/logger.ts`
- Targets: human-readable `stdout` via `pino-pretty`, or file output via `pino/file` (`log.target`, `log.filePath`)
- CLI defaults to file logging at `lumo-tamer-cli.log` (`cli.log` in `config.defaults.yaml`)
- Console calls are redirected to Pino by `src/shims/console.ts`
- Message content logging is opt-in through `log.messageContent`

**Metrics:**
- Prometheus metrics via `prom-client` at `GET /metrics`, implemented in `src/app/metrics.ts` and `src/api/routes/metrics.ts`
- Default prefix `lumo_`; optional Node.js default metrics
- Metric groups: HTTP requests/duration, messages, conversations, tool calls, errors/warnings, invalid continuations, queue size, sync operations/duration, auth failures, Proton API requests/duration
- Grafana dashboard provided in `grafana-lumo-tamer-dashboard.json` (Prometheus datasource)
- `/metrics` and `/health` bypass API-key auth (`src/api/middleware.ts`)

## CI/CD & Deployment

**Hosting:**
- Self-hosted. No managed platform configuration detected
- Default port `3003`, exposed in `Dockerfile` and `docker-compose.yml`

**Containerization:**
- `Dockerfile`: multi-stage build with `node:22-alpine`, a `golang:1.24-alpine` stage for `proton-auth`, `npm ci`, TypeScript build, production dependency pruning, `npm link`, and an entrypoint dispatching `auth` / `server` / `cli`
- `Dockerfile.browser`: `lscr.io/linuxserver/chromium:latest` plus `socat` to expose CDP on `9222`
- `docker-compose.yml` services:
  - `tamer`: API server, port `3003`, mounts `config.yaml` and `sessions/`, reads secret `lumo-vault-key`
  - `browser`: optional Chromium with CDP (`9222`) and noVNC UI (`3001`)
  - `open-webui`: optional UI from `ghcr.io/open-webui/open-webui:main-slim` on port `8080`, pointed at `http://tamer:3003/v1`

**CI Pipeline:**
- None detected. No `.github/`, GitLab CI, Jenkins, or other pipeline configuration in the repository

## Environment Configuration

**Required env vars:**
- Application code reads only `HOME` / `USERPROFILE` for `~` path expansion (`src/app/paths.ts`)
- `NODE_ENV=production` is set for the `tamer` compose service but is not read by application code
- All functional configuration is file-based in `config.defaults.yaml` and `config.yaml`
- Compose-only variables for the optional Open WebUI service: `OPENAI_API_BASE_URLS`, `ENABLE_OPENAI_API` (not read by lumo-tamer)

**Secrets location:**
- API key: `server.apiKey` in `config.yaml`
- Proton tokens: encrypted `sessions/vault.enc`
- Vault encryption key: OS keychain entry (`lumo-tamer` / `vault-key`) or `/run/secrets/lumo-vault-key` in Docker
- Compose secret `lumo-vault-key` sourced from `./secrets/lumo-vault-key`
- `secrets/`, `sessions/`, and `config.yaml` are Git-ignored

## Webhooks & Callbacks

**Incoming:**
- None. The API is pull-based; no webhook receiver endpoints exist

**Outgoing:**
- None user-configurable. Outbound HTTPS calls are limited to Proton APIs (`lumo.proton.me`, `account.proton.me`) and, for browser auth, the CDP endpoint on the local network

## Network Ports

- `3003` - lumo-tamer OpenAI-compatible API (`server.port`)
- `9222` - Chrome DevTools Protocol for browser auth
- `3001` - noVNC browser UI in the optional browser container
- `8080` - optional Open WebUI container
- `9229` - Node.js inspector in development scripts (`dev:*:debug`)

---

*Integration audit: 2026-11-06*
