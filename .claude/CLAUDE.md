<!-- GSD:project-start source:PROJECT.md -->

## Project

**lumo-tamer (stability fork)**

lumo-tamer exposes an OpenAI-compatible API (`/v1/responses`, `/v1/chat/completions`) on top of Proton's Lumo assistant, plus an interactive CLI. This fork (`denics/lumo-tamer`) focuses on making the **server mode** stable enough for daily use, and contributes each fix back to upstream (`ZeroTricks/lumo-tamer`) as a small, self-contained PR.

**Core Value:** A long-running lumo-tamer server answers every API request correctly (right context, complete output, clean errors) and never wedges, so OpenAI-compatible clients can rely on it.

### Constraints

- **Delivery**: One concern per branch/PR, branched from clean upstream `main`, small diff, regression test included — so each can be submitted upstream independently.
- **Upstream code**: No edits in `packages/lumo` or `packages/proton`.
- **Conventions**: Follow `CLAUDE.md`: defaults only in `config.defaults.yaml`, logging via `src/logger.ts` (`logger.error({error}, msg)`), no `console.log`, docs concise, no "—" in docs.
- **Compatibility**: Keep default config behavior unchanged unless the change is the fix itself.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript (ES2022 target/module, `strict: true`) - All application code in `src/`, tests in `tests/`, and synced upstream code in `packages/`
- Go 1.24 - Proton SRP login helper at `src/auth/login/go/main.go`, built to `dist/proton-auth`
- YAML - Configuration in `config.defaults.yaml`, `config.yaml`, and `docker-compose.yml`
- Bash - Upstream sync tooling in `scripts/upstream/sync.sh`, `scripts/upstream/create-patch.sh`
- Dockerfile - Multi-stage container builds in `Dockerfile` and `Dockerfile.browser`
- JSON - Grafana dashboard `grafana-lumo-tamer-dashboard.json`, `package.json`, `tsconfig.json`

## Runtime

- Node.js, ESM (`"type": "module"` in `package.json`)
- Docker production image uses `node:22-alpine` (`Dockerfile`)
- README documents Node.js 18+ (`README.md`); local development environment observed Node.js 26.13.0
- No `engines` field declared in `package.json`
- npm 11.x (observed 11.20.0)
- Lockfile: `package-lock.json` present
- Workspaces: `packages/*` (`packages/lumo` as `lumo-node`, `packages/proton` as `proton-node`)
- Binary entry: `tamer` -> `dist/src/tamer.js` (`package.json`)

## Frameworks

- Express 5.2.1 - HTTP API server in `src/api/server.ts`
- Zod 4.6.5 - Runtime configuration validation in `src/app/config.ts`
- Pino 10.3.1 - Structured logging in `src/app/logger.ts` (with `pino-pretty` 13.1.3)
- p-queue 9.3.3 - Serial request queue (concurrency 1) in `src/api/queue.ts`
- Handlebars 4.7.9 - Instruction template interpolation in `src/app/template.ts`
- Redux Toolkit 2.12.0 + redux-saga 1.5.1 - Upstream conversation state store in `src/conversations/init.ts` and `packages/lumo/src/redux/`
- Playwright 1.63.0 - Chromium CDP client for browser token extraction in `src/auth/browser/authenticate.ts`
- prom-client 15.1.3 - Prometheus metrics in `src/app/metrics.ts`
- OpenAI SDK 7.23.0 - Used by E2E compatibility tests in `tests/e2e/openai-sdk-streaming.test.ts`
- Vitest 4.1.11 - Test runner configured in `vitest.config.ts`
- `@vitest/coverage-v8` 4.1.11 - Coverage provider
- `fake-indexeddb` 6.2.5 - In-memory IndexedDB for tests
- Test layout: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Global setup: `tests/setup.ts`; integration helpers: `tests/helpers/test-server.ts`
- TypeScript 7.0.2 - Compilation via `npx tsc` (`npm run build`)
- `tsc-alias` 1.9.5 - Rewrites `@lumo/*` and `@proton/*` path aliases in build output
- `tsx` 4.23.15 - Dev runner with watch mode (`npm run dev:server`, `npm run dev:cli`)
- Go toolchain 1.24 - Builds the login helper (`npm run build:login`)
- Vitest 4.1.11 - Test runs (`npm test`, `npm run test:unit`, `npm run test:integration`)

## Key Dependencies

- `@msgpack/msgpack` 3.1.3 - MessagePack serialization of encrypted conversation payloads in `packages/lumo/src/serialization.ts`
- `openpgp` 6.3.2 - PGP key generation and master-key encryption in `src/auth/key-generator.ts` and `packages/proton/src/crypto/lib/proxy/proxy.ts`
- `indexeddbshim` 19.0.7 - SQLite-backed IndexedDB polyfill for the upstream Lumo store, initialized in `src/shims/indexeddb-polyfill.ts`
- `better-sqlite3` 13.0.3 - Native SQLite backend used by `indexeddbshim`; requires native build tooling
- `keytar` 7.9.0 - OS keychain access for the vault key in `src/auth/vault/key-provider.ts`; native optional dependency, lazily loaded
- `yaml` 2.9.1 - YAML parsing and comment-preserving config edits in `src/app/config-file.ts` and `src/auth/update-config.ts`
- `bytes` 3.1.2 - Parses size strings such as `360kb` in `src/app/config.ts` and `src/cli/local-actions/file-reader.ts`
- `arg` 5.0.2 - CLI argument parsing in `src/tamer.ts`
- `uuid` 14.0.2 - ID generation utilities (declared dependency)
- `lodash` 4.18.1 - Config deep merge and upstream utilities (`src/app/config.ts`)
- `json-stable-stringify` 1.3.0 - Stable JSON for AEAD associated data in `src/conversations/fallback/sync/encryption-codec.ts`
- `toposort` 2.0.2 - ESM-wrapped dependency used by upstream Redux code through `src/shims/toposort.ts`
- `dotenv` 18.0.4 - Declared, but no `src/` imports detected; configuration comes from YAML files
- `packages/lumo/` (`@lumo/*`) - Synced from Proton WebClients `applications/lumo/src/app/`; contains Lumo API client, crypto, IndexedDB, Redux slices/sagas, mocks, remote API
- `packages/proton/` (`@proton/*`) - Synced from Proton WebClients `packages/`; crypto primitives and shared helpers
- Sync tooling: `scripts/upstream/sync.sh`, tracked commit in `scripts/upstream/last-sync-commit`
- Local patches: `packages/lumo/patches/` (`keys.patch`, `selectors.patch`)

## Configuration

- Primary configuration is `config.defaults.yaml` (single source of truth for defaults) plus optional user overrides in `config.yaml`
- Validation and typed accessors live in `src/app/config.ts`; file I/O and fatal config errors in `src/app/config-file.ts`
- Config sections: `auth`, `test.mock`, `log`, `conversations`, `commands`, `server`, `cli`
- Precedence: `config.defaults.yaml` -> `config.yaml` -> mode-specific shared keys (`log`, `conversations`, `commands`)
- Arrays replace defaults wholesale instead of being merged by index (`mergeConfigLayers` in `src/app/config.ts`)
- Runtime path resolution is based on project root, not `process.cwd()`, in `src/app/paths.ts`
- No application-level environment variable configuration detected; only `HOME`/`USERPROFILE` for `~` expansion in `src/app/paths.ts`
- `.env` is excluded from Docker builds (`.dockerignore`); no `.env` file or `dotenv` import observed
- `tsconfig.json` - ES2022, strict mode, declarations and source maps, path aliases for `@lumo/*`, `@proton/*`, lodash shims, and `toposort`
- `vitest.config.ts` - Mirrors TypeScript aliases for tests, 15s timeout, setup file, coverage on `src/**/*.ts`
- `package.json` scripts - `build`, `build:login`, `build:all`, `clean`, `dev:*`, `server`, `cli`, `test*`, `sync-upstream`
- `Dockerfile` - Three stages: Alpine base, Go builder (`golang:1.24-alpine`), TypeScript builder; copies `config.defaults.yaml` and the Go binary into the final image
- Build output: `dist/` (Git-ignored, excluded from Docker context)

## Platform Requirements

- Node.js 18+ and npm
- Go 1.24+ only when building or using the `login` auth method
- Native build tooling for `keytar` and `better-sqlite3` (Python, make, g++, cairo/pango/jpeg/gif/librsvg dev packages per `Dockerfile`)
- Docker optional, but recommended for running the server
- Chrome/Chromium with remote debugging (CDP) only for `browser` auth
- Self-hosted Docker container, default port `3003`
- Alpine `node:22` runtime with a statically linked Go helper (`CGO_ENABLED=0`)
- Requires persistent volumes for `config.yaml` and `sessions/` (vault and SQLite databases)
- Vault key from OS keychain or Docker secret file; no plain environment-variable key support
- Tested on Linux according to `README.md`

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- kebab-case `.ts` for every application module: `streaming-tool-detector.ts`, `message-converter.ts`, `key-manager.ts`, `request-handlers.ts`
- Numeric protocol version prefix for protocol layers: `src/lumo-client/v2-body.ts`, `src/lumo-client/v2-stream.ts`
- Barrels are `index.ts` (re-export only): `src/api/tools/index.ts`, `src/lumo-client/index.ts`, `src/conversations/index.ts`, `src/auth/index.ts`
- `src/app/index.ts` is the exception: it exports `class Application`, not re-exports
- Route folders mirror the endpoint path: `src/api/routes/responses/`, `src/api/routes/chat-completions/`; single-endpoint routers stay flat (`src/api/routes/health.ts`, `models.ts`, `metrics.ts`, `auth.ts`)
- Tests: `<subject>.test.ts` under `tests/unit/`, `tests/integration/`, `tests/e2e/`
- camelCase, verb-first: `buildRequestContext`, `persistAssistantTurn`, `mapToolCallsForPersistence`, `applyToolPrefix`
- Router factories: `create<Thing>Router(deps)` - `src/api/routes/responses/index.ts:52` (`createResponsesRouter`), `src/api/routes/chat-completions/index.ts`
- Config accessors: `get<Domain>Config()` - `src/app/config.ts:246-320` (`getServerConfig`, `getCustomToolsConfig`, `getLocalActionsConfig`)
- Singleton accessors/reset: `getMetrics()` / `setMetrics()`, `getConversationStore()` / `setConversationStore()` / `resetConversationStore()`
- Predicates: `is*` / `has*` (`isModelAllowed`, `isValidReasoningEffort`, `isBinaryFile`, `isCommand`); converters: `convert*`; builders: `build*`; parsers: `parse*`
- camelCase for locals and parameters; module constants `UPPER_SNAKE_CASE` at file top: `SESSION_ID` (`src/app/id-generator.ts:13`), `PROJECT_ROOT` (`src/app/paths.ts:15`), `CHARS_PER_TOKEN` (`src/api/routes/shared.ts:15`), `MAX_CALLS` (`src/mock/mock-api.ts`)
- Booleans read as assertions: `hasCustomTools`, `syncInitialized`, `enableEncryption`, `useFallbackStore`
- `PascalCase`, no `I`/`T` prefix: `EndpointDependencies`, `OpenAIChatMessage`, `ConversationState`
- OpenAI wire shapes are prefixed `OpenAI*` and centralized in `src/api/types.ts`
- Options/config bags are `<Thing>Options` / `<Thing>Config` / `<Thing>Result` (`ProtonApiOptions`, `TestServerOptions`, `StoreResult`)
- Discriminated unions on a `type` literal for wire events: `ResponseStreamEvent` in `src/api/types.ts:247-266`

## Code Style

- No formatter or linter is configured - no ESLint, Prettier, Biome, or editorconfig file exists. Style is maintained by convention and review.
- Indentation is **mixed** and file-local. Verified counts: `src/conversations/` and `src/mock/` are almost entirely 4-space; `src/auth/` and `src/lumo-client/` are predominantly 4-space; `src/api/` is mostly 2-space; `src/cli/` is split roughly evenly. Match the surrounding file rather than reformatting.
- Quotes: single quotes. Semicolons: always. Trailing commas: yes in multiline literals/params.
- Line width is soft-capped near 100-120 chars; long function signatures are wrapped one-param-per-line.
- Blank line between logical blocks; no blank line at the start of a block.
- `strict: true`, `target`/`module` `ES2022`, ESM only (`"type": "module"`) - `tsconfig.json`
- Relative imports **must** end in `.js` (`import { logger } from '../app/logger.js'`); this applies to tests too.
- `import type` (or inline `type` specifier) for type-only imports: `import { Router, Request, Response } from 'express'` vs `import type { ConversationId } from '../../../conversations/index.js'`
- `any` is tolerated only at OpenAI wire boundaries (`src/api/types.ts`) and in test doubles; production code uses `unknown` plus narrowing (`isPayloadTooLarge(err: unknown)` in `src/api/error-handler.ts:48`).
- Discriminated-union exhaustiveness and explicit return types on exported functions are expected (`function resolveProjectPath(path: string): string` in `src/app/paths.ts:22`).

## Import Organization

- `@lumo/*` -> `packages/lumo/src/*`, `@proton/*` -> `packages/proton/src/*` (`tsconfig.json` `paths`)
- Dependency shims are aliased in `tsconfig.json`: `lodash/isNil`, `lodash/isEqual`, `lodash/isObject`, `json-stable-stringify`, `toposort` -> `src/shims/*`
- `vitest.config.ts` duplicates these aliases for tests (plus a bare `app` -> `src/app` alias and `@proton/*` deep-file overrides). Adding a new alias requires editing **both** files.

## Error Handling

- Bitmap of failure modes is small - there are **no custom error classes** in `src/`. Code throws plain `new Error('message')` with an actionable message, e.g. `src/app/config.ts:239` (`'Config not initialized. Call initConfig() first.'`), `src/auth/session-keys.ts:42`.
- `catch` always binds a named error and is narrowed: `error instanceof Error ? error.message : String(error)` (`src/auth/manager.ts:101`, `src/cli/local-actions/file-reader.ts:108`). Bare `catch {` is used when the error is intentionally discarded (`src/mock/mock-api.ts` JSON parse guard).
- Errors that are recoverable are logged and swallowed with a degrading fallback (decrypt failure drops the chunk: `src/lumo-client/client.ts:131`; title generation failure: `src/lumo-client/client.ts:350`).
- Unrecoverable startup errors use `fatalExit()` (`src/app/config-file.ts:21`) because the logger is not yet available; the entry point installs `unhandledRejection`/`uncaughtException` handlers that log `fatal` and flush before exiting (`src/tamer.ts:32-38`).
- HTTP layer never throws raw errors at clients. Use `sendInvalidRequest(res, message, param, code)` and `sendServerError(res)` from `src/api/error-handler.ts` to emit the OpenAI error envelope `{ error: { message, type, param, code } }`. Express body-parser failures (413, malformed JSON) are translated by `setupApiErrorHandler()` and anything else is passed to `next(err)`.
- Every router handler wraps its body in `try { ... } catch (error) { logger.error({ error }, '...'); return sendServerError(res); }` - see `src/api/routes/responses/index.ts` and `src/cli/client.ts:250-260` (401/403/404 mapped to user-facing hints).

## Logging

- Always `import { logger } from '../app/logger.js'` (Proxy over a lazily initialized singleton; throws if `initLogger()` was not called).
- Structured API: **object first, message second** - `logger.error({ error }, 'Failed to execute /save command')` (`src/app/commands.ts:223`), `logger.info({ method: this.authProvider.method }, 'Refreshing tokens...')`.
- Error key is **`error`**, not `err`. `createLogger()` registers `pino.stdSerializers.err` for the `error` key explicitly (`src/app/logger.ts:41-45`). A few older call sites still pass `{ err }` (`src/api/error-handler.ts:66,78`) and therefore lose message/stack serialization - always use `{ error }` in new code.
- Never `console.log`. The only permitted `console.error` is in pre-logger config failures (`src/app/config-file.ts:20`); a console shim routes remaining console calls through pino (`src/shims/console.ts`).
- CLI user-facing output goes through `print(text, newline = true)` from `src/app/terminal.ts` (writes to `process.stdout`), not through the logger. `print` is also used for help/status/auth output (`src/auth/status.ts`).
- Message-content logging is gated by `log.messageContent` config; previews are truncated (`src/lumo-client/client.ts:322`).

## Comments

- File-level JSDoc block on every non-trivial module stating purpose and key architecture (`src/conversations/store.ts:1-15`, `src/api/queue.ts` has no block for trivial classes).
- Exported functions get a short JSDoc when the contract is not obvious from the name (`persistAssistantTurn`, `mapToolCallsForPersistence` in `src/api/routes/shared.ts`).
- Comment the *why*, especially workarounds: `// WORKAROUND for clients that don't provide conversation (e.g., Home Assistant).` (`src/api/routes/responses/index.ts:88`), `// NOTE: Module-level state has been moved to ConversationStore`.
- Section separators are used to structure long files:
- Step markers inside long handlers: `// ===== STEP 1: Determine conversation ID =====` (`src/api/routes/responses/index.ts:60`).
- Inline justifications for non-obvious code: `// slice(2) removes "~/" — join normalizes separators` (`src/app/paths.ts:26`).
- Used, but not exhaustively typed: descriptions plus occasional `@param` (`tests/helpers/test-server.ts`). No `@returns` boilerplate.
- Interface fields commonly carry `/** ... */` one-liners rather than a block comment above the interface (`src/api/types.ts:36`, `src/lumo-client/types.ts`).

## Function Design

- Max 3 positional params before switching to an options object: `chatWithHistory(turns, onChunk, options)` (`src/lumo-client/client.ts`), `createTestServer(scenario, options)`.
- Dependency injection via a single typed bag: `EndpointDependencies` (`src/api/types.ts:6-13`) is passed to every router factory; classes take collaborators in the constructor (`new LumoClient(api, { enableEncryption: false })`, `new RequestQueue(1)`).
- Defaults belong in `config.defaults.yaml`, never in function signatures or `config.ts`. `src/app/config.ts` contains zod schemas for **validation only** ("Schemas (validation only, no defaults)", line ~29) and getters that read the merged config.
- Return early on guard conditions (`if (!prefix || !tools) return tools;` in `src/api/tools/prefix.ts:17`) to keep the happy path unindented.
- Async functions return typed promises; `void` returns are explicit (`persistTitle(...): void`).
- Prefer returning `undefined` over `null` in internal APIs; `null` is reserved for OpenAI wire compat.

## Module Design

## Configuration Conventions

- Adding a setting means: a zod field in `src/app/config.ts` (validation only), a default in `config.defaults.yaml` (single source of truth), a getter in `src/app/config.ts`, and a doc mention in `README.md`/`docs/`.
- Mode-scoped config lives under `server:` / `cli:` in YAML; only `SHARED_KEYS` (`log`, `conversations`, `commands`) may be overridden per mode (`src/app/config.ts:26`).
- Arrays replace wholesale, not element-wise (`mergeConfigLayers` in `src/app/config.ts:11-20`) - an intentional deviation from `lodash/mergeWith`.
- Config getters throw when called in the wrong mode; new getters must follow that guard.

## Anti-Patterns to Avoid

- **Editing `packages/lumo/` or `packages/proton/`.** These are vendored. Change `scripts/upstream/sync.sh` and re-sync, or add a shim in `src/shims/` with a header documenting the source.
- **Importing without the `.js` extension** in `src/` - breaks Node ESM at runtime even though `tsc` accepts it.
- **Putting defaults in code.** Defaults only in `config.defaults.yaml`.
- **`console.log` for diagnostics.** Use `logger`; use `print()` only for intentional CLI stdout.
- **`{ err }` as the log error key.** The serializer is registered for `error`.
- **Reformatting whole files to the other indentation style.** Mixed 2/4-space indentation is load-bearing history; keep diffs minimal and local.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI/server/auth dispatch | argv parsing, config+logger init, mode routing | `src/tamer.ts` |
| Application bootstrap | one-time auth, store, sync, mock setup; context getters | `src/app/index.ts` |
| Config | layered defaults (YAML) + user config + zod validation + getters | `src/app/config.ts`, `src/app/config-file.ts` |
| Logger | pino instance created early; console redirect via shim | `src/app/logger.ts`, `src/shims/console.ts` |
| Metrics | prom-client registry, singleton accessor | `src/app/metrics.ts` |
| API server | Express wiring, middleware order, route registration, dependency bundle | `src/api/server.ts` |
| Responses endpoint | `/v1/responses` (primary, OpenAI Responses API) | `src/api/routes/responses/index.ts`, `request-handlers.ts`, `events.ts` |
| Chat Completions endpoint | `/v1/chat/completions` (OpenAI Chat Completions) | `src/api/routes/chat-completions/index.ts`, `events.ts` |
| Shared route helpers | request context, persistence, usage, IDs, SSE headers | `src/api/routes/shared.ts` |
| Message conversion | OpenAI message shapes → Lumo `Turn`/`MessageForStore` | `src/api/message-converter.ts` |
| Tool handling | custom-tool JSON detection, call IDs, prefixing, native SSE tools | `src/api/tools/*` |
| Instructions | template interpolation + client instruction replace patterns | `src/api/instructions.ts`, `src/app/template.ts` |
| LumoClient | encryption, HTTP call, SSE processing, tool bounce, titles | `src/lumo-client/client.ts`, `v2-stream.ts`, `v2-body.ts` |
| Model tier mapping | OpenAI `model` → `lumo-lite`/`lumo-max`/`auto`; reasoning effort | `src/lumo-client/model-tier.ts` |
| Auth providers | browser (token extraction), login (Go SRP), rclone (config import) | `src/auth/providers/*`, `src/auth/login/*`, `src/auth/rclone/*`, `src/auth/browser/*` |
| AuthManager | scheduled + 401-triggered refresh, health reporting | `src/auth/manager.ts`, `src/auth/api-factory.ts` |
| Vault | encrypted credential storage (keychain/file key) | `src/auth/vault/*` |
| Conversation store | dedup, turn conversion, dirty flagging, Redux dispatch | `src/conversations/store.ts`, `deduplication.ts` |
| Store bootstrap | IndexedDB polyfill + Redux/saga setup | `src/conversations/init.ts`, `src/conversations/index.ts` |
| Sync | space + conversation push/pull (fallback path, deprecated) | `src/conversations/fallback/sync/*`, `src/conversations/key-manager.ts` |
| Mock mode | `ProtonApi` substitute returning SSE streams | `src/mock/mock-api.ts`, `mock-store.ts`, `custom-scenarios.ts` |
| Shims | fetch interception, IndexedDB, lodash/toposort wrappers, polyfills | `src/shims/*` |

## Pattern Overview

- **Composition root:** `Application.create()` (`src/app/index.ts:38`) is the only place wiring auth, store, sync, and `LumoClient`. Nothing else constructs these dependencies.
- **Route factory + dependency bundle:** every router is `createXRouter(deps: EndpointDependencies)` (`src/api/types.ts:6`); server assembles `deps` once (`src/api/server.ts:73`). Enables `tests/helpers/test-server.ts` to bypass auth/config.
- **Protocol isolation through converters/emitters:** OpenAI wire formats stay in `src/api/`, Lumo wire formats stay in `src/lumo-client/`, and conversions are plain functions (`convertOpenAIChatMessages`, `convertOpenAIResponseMessages`, `V2StreamProcessor`, `ResponseEventEmitter`).
- **Upstream-first:** Proton WebClients code is vendored under `packages/lumo` and `packages/proton` and never edited in place; connectivity is achieved with tsconfig aliases, patches, and shims (`docs/upstream.md`, `scripts/upstream/sync.sh`).
- **Global singletons for cross-cutting services:** config, logger, metrics, active conversation store, sync service — set once during bootstrap and imported directly by consumers.
- **Bidirectional mode reuse:** CLI and API both call `LumoClient.chatWithHistory()` with the same store interface, and both execute slash commands via `src/app/commands.ts`.

## Layers

- Purpose: process-level concerns (argv, config load, logger init, fatal handlers, shutdown signals)
- Location: `src/tamer.ts`
- Contains: `arg` parsing, dynamic `import()` per mode, `SIGINT`/`SIGTERM` handlers
- Depends on: `src/app/config.ts`, `src/app/logger.ts`, `src/app/terminal.ts`
- Used by: nothing (top of graph)
- Purpose: protocol translation, streaming, presentation, request validation
- Location: `src/api/`, `src/cli/`
- Contains: Express routers/emitters/middleware; readline loop, code-block detector, local actions
- Depends on: `Application` interface, `LumoClient`, `ConversationStore`, `app/*` config/commands/metrics
- Used by: `src/tamer.ts`
- Purpose: lifecycle orchestration and cross-mode logic (commands, instructions, templates)
- Location: `src/app/`
- Contains: `Application`, config getters, logger, metrics, paths, commands, template interpolation, terminal I/O
- Depends on: auth, conversations, lumo-client, mock, shims
- Used by: API, CLI, entry point
- Purpose: Lumo protocol + persistence semantics
- Location: `src/lumo-client/`, `src/conversations/`, `src/auth/`
- Contains: SSE parsing, encryption, tool detection, dedup, key hierarchy, token refresh
- Depends on: `@lumo/*`, `@proton/*`, `src/shims/`, `src/app/*`
- Used by: front-end and application layers
- Purpose: make browser/Proton code run under Node with our auth
- Location: `packages/lumo/`, `packages/proton/`, `src/shims/`
- Contains: vendored upstream (52 files in `packages/lumo/src`, 8 in `packages/proton/src`), DEP-3 patches (`packages/lumo/patches/series`), polyfills
- Depends on: node builtins, `openpgp`, `indexeddbshim`
- Used by: conversations store/sync, lumo-client

## Data Flow

### Primary Request Path — `/v1/responses` streaming

### Chat Completions Flow

### Native (server-side) Tool Flow

### Title Generation Flow

### CLI Flow

### Conversation Persistence/Sync Flow

- Server statelessness: no per-request globals in routes; conversation state lives in `ConversationStore` keyed by `ConversationId`.
- Cross-request mutable state is limited to singletons (store, metrics, config, logger, `completedCallIds`, `SESSION_ID`).
- Streaming state is local to each handler invocation (`accumulatedText`, `processor`, `emitter`).

## Key Abstractions

- Purpose: single seam between the app and Proton HTTP; swappable for mocks and refresh-wrapped clients
- Examples: `src/lumo-client/types.ts`, `src/auth/api-factory.ts`, `src/mock/mock-api.ts`
- Pattern: higher-order function returning `Promise<object | ReadableStream<Uint8Array>>`
- Purpose: explicit dependency bundle for all routers
- Examples: `src/api/types.ts:6`, assembled in `src/api/server.ts:73`, overridden in `tests/helpers/test-server.ts`
- Pattern: constructor-style DI without a container
- Purpose: mode-agnostic persistence API (`getOrCreate`, `appendMessages`, `appendAssistantResponse`, `toTurns`, `setTitle`, `getDirty`, …)
- Examples: `src/conversations/store.ts`, `src/conversations/fallback/store.ts`
- Pattern: adapter over upstream Redux; identical method surface in both implementations
- Purpose: isolate custom-tool JSON from assistant prose while streaming, per endpoint
- Examples: `src/api/tools/streaming-processor.ts`
- Pattern: strategy callbacks (`emitTextDelta`, `emitToolCall`) so Responses/ChatCompletions emit their own event shapes
- Purpose: encapsulate SSE framing per OpenAI dialect
- Examples: `src/api/routes/responses/events.ts`, `src/api/routes/chat-completions/events.ts`
- Pattern: class holding `res`, writes `data:` frames, `[DONE]` terminator
- Purpose: internal canonical message representation (role + content, optional dedup `id`)
- Examples: `src/lumo-client/types.ts`, `src/conversations/types.ts`
- Pattern: converters at both boundaries; persistence stores `semanticId` for dedup
- Purpose: typed, mode-aware config access without passing config objects around
- Examples: `getServerConfig`, `getCliConfig`, `getConversationsConfig`, `getCustomToolsConfig` (`src/app/config.ts:247-302`)
- Pattern: module-level singleton initialized by `initConfig(mode)`

## Entry Points

- Location: `src/tamer.ts`
- Triggers: `npm run cli`, `npm run server`, `node dist/src/tamer.js`
- Responsibilities: parse `server`/`auth` subcommands and `--help`; init config+logger; dispatch; install fatal handlers
- Location: `src/tamer.ts:51-62` → `src/api/server.ts`
- Triggers: `tamer server`
- Responsibilities: `Application.create()`, Express bootstrap, template validation, `listen(server.port)`
- Location: `src/tamer.ts:63-71` → `src/cli/client.ts`
- Triggers: `tamer [query]`
- Responsibilities: interactive/single-query chat, local actions, exit sync
- Location: `src/tamer.ts:48-52` → `src/auth/authenticate.ts`
- Triggers: `tamer auth …`
- Responsibilities: provider-specific login (browser CDP, Go SRP binary, rclone import) and vault write
- `POST /v1/responses` (`src/api/routes/responses/index.ts`)
- `POST /v1/chat/completions` (`src/api/routes/chat-completions/index.ts`)
- `GET /v1/models` (`src/api/routes/models.ts`), `GET /health`, `GET /metrics`
- `POST /v1/auth/logout`, `POST /v1/auth/refresh`, `GET /v1/auth/status` (`src/api/routes/auth.ts`)

## Architectural Constraints

- **Threading:** single Node event loop; no worker threads. Requests are serialized through `RequestQueue` concurrency 1 (`src/api/server.ts:29`) because Lumo conversations are stateful upstream.
- **Upstream code is read-only:** `packages/lumo/**`, `packages/proton/**` and files listed in `scripts/upstream/sync.sh` must not be hand-edited; use patches (`packages/lumo/patches/`) or shims.
- **Global state (module-level singletons):** `src/app/config.ts` (config), `src/app/logger.ts` (`_logger`), `src/app/metrics.ts` (`metricsInstance`), `src/app/id-generator.ts` (`SESSION_ID`), `src/conversations/index.ts` (`activeStore`, `primaryStoreResult`), `src/conversations/fallback/index.ts` (store/sync singletons), `src/api/tools/call-id.ts` (`completedCallIds`), `src/api/instructions.ts` (`templateValidated`), `src/mock/mock-api.ts` (`callCounts`), `src/auth/providers/provider.ts` (`browserProviderFactory`), `src/cli/local-actions/block-handlers.ts` (`blockHandlers` registry).
- **`globalThis.fetch` is monkey-patched** by `installFetchAdapter` (`src/shims/fetch-adapter.ts:132`) so upstream `LumoApi` calls route through the authenticated `ProtonApi`; adapter only intercepts `/api/`-prefixed relative URLs.
- **Logger proxy throws before init:** `logger` is a `Proxy` resolving `getLogger()`; any module-level logging before `initLogger()` fails (`src/app/logger.ts:76`).
- **Layer direction violation:** `src/lumo-client/client.ts:38` imports `../api/tools/native-tool-call-processor.js` — the core depends on the API layer for tool-call normalization instead of owning it.
- **Provider registration via import side effect:** `src/auth/providers/index.ts` imports `./browser.js` solely to register the factory; removing it silently degrades browser auth to the base provider.
- **Deterministic IDs are session-scoped:** `deterministicUUID` mixes `SESSION_ID`, so the same client `conversation` value maps to a different internal ID after restart (`src/app/id-generator.ts`).
- **`docs/development.md` directory map is stale:** it references `src/conversations/encryption/` and `src/conversations/sync/`, which do not exist; actual sync lives in `src/conversations/fallback/sync/` and key handling in `src/conversations/key-manager.ts`.

## Anti-Patterns

### Reaching into presentation layer from the core

### Direct singleton pulls inside deep modules

### Sibling directory reference through `src/`

### Mode-specific state living outside the composition root

### Emitting SSE events inline

## Error Handling

- Request validation → `sendInvalidRequest(res, message, param, code)` (`src/api/error-handler.ts:14`) with `error.type: 'invalid_request_error'`.
- Unexpected failures → `sendServerError(res)` (`src/api/error-handler.ts:31`); Express parser errors normalized by `setupApiErrorHandler()`.
- Streaming failures → `emitter.emitError(error)` then `res.end()` (`src/api/routes/responses/request-handlers.ts:264-274`).
- Lumo SSE `error`/`harmful` frames are thrown from `processStream` (`src/lumo-client/client.ts:224-231`).
- Decryption failure drops the chunk (logged) rather than emitting ciphertext (`src/lumo-client/client.ts:143-151`).
- Title generation failures are non-fatal (`logger.warn` + `null`).
- Startup/config errors before logger init use `fatalExit()` (`src/app/config-file.ts:21`).
- Fatal async errors flush the logger before `process.exit(1)` (`src/tamer.ts:35-41`).
- Errors are logged as `logger.error({ error }, "…")` so the registered `error` serializer captures message/stack (`src/app/logger.ts:48`).

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
