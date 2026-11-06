---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
# Coding Conventions

**Analysis Date:** 2026-11-06

Scope: `src/` and `tests/`. `packages/lumo/` and `packages/proton/` are synced upstream Proton WebClients code and are never edited (`docs/upstream.md`, `scripts/upstream/sync.sh`).

## Naming Patterns

**Files:**
- kebab-case `.ts` for every application module: `streaming-tool-detector.ts`, `message-converter.ts`, `key-manager.ts`, `request-handlers.ts`
- Numeric protocol version prefix for protocol layers: `src/lumo-client/v2-body.ts`, `src/lumo-client/v2-stream.ts`
- Barrels are `index.ts` (re-export only): `src/api/tools/index.ts`, `src/lumo-client/index.ts`, `src/conversations/index.ts`, `src/auth/index.ts`
- `src/app/index.ts` is the exception: it exports `class Application`, not re-exports
- Route folders mirror the endpoint path: `src/api/routes/responses/`, `src/api/routes/chat-completions/`; single-endpoint routers stay flat (`src/api/routes/health.ts`, `models.ts`, `metrics.ts`, `auth.ts`)
- Tests: `<subject>.test.ts` under `tests/unit/`, `tests/integration/`, `tests/e2e/`

**Functions:**
- camelCase, verb-first: `buildRequestContext`, `persistAssistantTurn`, `mapToolCallsForPersistence`, `applyToolPrefix`
- Router factories: `create<Thing>Router(deps)` - `src/api/routes/responses/index.ts:52` (`createResponsesRouter`), `src/api/routes/chat-completions/index.ts`
- Config accessors: `get<Domain>Config()` - `src/app/config.ts:246-320` (`getServerConfig`, `getCustomToolsConfig`, `getLocalActionsConfig`)
- Singleton accessors/reset: `getMetrics()` / `setMetrics()`, `getConversationStore()` / `setConversationStore()` / `resetConversationStore()`
- Predicates: `is*` / `has*` (`isModelAllowed`, `isValidReasoningEffort`, `isBinaryFile`, `isCommand`); converters: `convert*`; builders: `build*`; parsers: `parse*`

**Variables and constants:**
- camelCase for locals and parameters; module constants `UPPER_SNAKE_CASE` at file top: `SESSION_ID` (`src/app/id-generator.ts:13`), `PROJECT_ROOT` (`src/app/paths.ts:15`), `CHARS_PER_TOKEN` (`src/api/routes/shared.ts:15`), `MAX_CALLS` (`src/mock/mock-api.ts`)
- Booleans read as assertions: `hasCustomTools`, `syncInitialized`, `enableEncryption`, `useFallbackStore`

**Types:**
- `PascalCase`, no `I`/`T` prefix: `EndpointDependencies`, `OpenAIChatMessage`, `ConversationState`
- OpenAI wire shapes are prefixed `OpenAI*` and centralized in `src/api/types.ts`
- Options/config bags are `<Thing>Options` / `<Thing>Config` / `<Thing>Result` (`ProtonApiOptions`, `TestServerOptions`, `StoreResult`)
- Discriminated unions on a `type` literal for wire events: `ResponseStreamEvent` in `src/api/types.ts:247-266`

## Code Style

**Formatting:**
- No formatter or linter is configured - no ESLint, Prettier, Biome, or editorconfig file exists. Style is maintained by convention and review.
- Indentation is **mixed** and file-local. Verified counts: `src/conversations/` and `src/mock/` are almost entirely 4-space; `src/auth/` and `src/lumo-client/` are predominantly 4-space; `src/api/` is mostly 2-space; `src/cli/` is split roughly evenly. Match the surrounding file rather than reformatting.
- Quotes: single quotes. Semicolons: always. Trailing commas: yes in multiline literals/params.
- Line width is soft-capped near 100-120 chars; long function signatures are wrapped one-param-per-line.
- Blank line between logical blocks; no blank line at the start of a block.

**TypeScript:**
- `strict: true`, `target`/`module` `ES2022`, ESM only (`"type": "module"`) - `tsconfig.json`
- Relative imports **must** end in `.js` (`import { logger } from '../app/logger.js'`); this applies to tests too.
- `import type` (or inline `type` specifier) for type-only imports: `import { Router, Request, Response } from 'express'` vs `import type { ConversationId } from '../../../conversations/index.js'`
- `any` is tolerated only at OpenAI wire boundaries (`src/api/types.ts`) and in test doubles; production code uses `unknown` plus narrowing (`isPayloadTooLarge(err: unknown)` in `src/api/error-handler.ts:48`).
- Discriminated-union exhaustiveness and explicit return types on exported functions are expected (`function resolveProjectPath(path: string): string` in `src/app/paths.ts:22`).

## Import Organization

**Order (observed convention):**
1. Node builtins, often with `node:`-less specifiers: `import { randomUUID } from 'crypto'`
2. Third-party packages: `express`, `pino`, `zod`, `yaml`, `p-queue`
3. Internal relative imports, closest-first then upward (`./request-handlers.js`, then `../../types.js`)
4. Configured path aliases for upstream code: `@lumo/*`, `@proton/*`
5. `import type` group, frequently last and separated by a blank line (`src/api/routes/responses/index.ts:14`)

**Path Aliases:**
- `@lumo/*` -> `packages/lumo/src/*`, `@proton/*` -> `packages/proton/src/*` (`tsconfig.json` `paths`)
- Dependency shims are aliased in `tsconfig.json`: `lodash/isNil`, `lodash/isEqual`, `lodash/isObject`, `json-stable-stringify`, `toposort` -> `src/shims/*`
- `vitest.config.ts` duplicates these aliases for tests (plus a bare `app` -> `src/app` alias and `@proton/*` deep-file overrides). Adding a new alias requires editing **both** files.

## Error Handling

**Patterns:**
- Bitmap of failure modes is small - there are **no custom error classes** in `src/`. Code throws plain `new Error('message')` with an actionable message, e.g. `src/app/config.ts:239` (`'Config not initialized. Call initConfig() first.'`), `src/auth/session-keys.ts:42`.
- `catch` always binds a named error and is narrowed: `error instanceof Error ? error.message : String(error)` (`src/auth/manager.ts:101`, `src/cli/local-actions/file-reader.ts:108`). Bare `catch {` is used when the error is intentionally discarded (`src/mock/mock-api.ts` JSON parse guard).
- Errors that are recoverable are logged and swallowed with a degrading fallback (decrypt failure drops the chunk: `src/lumo-client/client.ts:131`; title generation failure: `src/lumo-client/client.ts:350`).
- Unrecoverable startup errors use `fatalExit()` (`src/app/config-file.ts:21`) because the logger is not yet available; the entry point installs `unhandledRejection`/`uncaughtException` handlers that log `fatal` and flush before exiting (`src/tamer.ts:32-38`).
- HTTP layer never throws raw errors at clients. Use `sendInvalidRequest(res, message, param, code)` and `sendServerError(res)` from `src/api/error-handler.ts` to emit the OpenAI error envelope `{ error: { message, type, param, code } }`. Express body-parser failures (413, malformed JSON) are translated by `setupApiErrorHandler()` and anything else is passed to `next(err)`.
- Every router handler wraps its body in `try { ... } catch (error) { logger.error({ error }, '...'); return sendServerError(res); }` - see `src/api/routes/responses/index.ts` and `src/cli/client.ts:250-260` (401/403/404 mapped to user-facing hints).

## Logging

**Framework:** `pino`, wrapped by `src/app/logger.ts`.

- Always `import { logger } from '../app/logger.js'` (Proxy over a lazily initialized singleton; throws if `initLogger()` was not called).
- Structured API: **object first, message second** - `logger.error({ error }, 'Failed to execute /save command')` (`src/app/commands.ts:223`), `logger.info({ method: this.authProvider.method }, 'Refreshing tokens...')`.
- Error key is **`error`**, not `err`. `createLogger()` registers `pino.stdSerializers.err` for the `error` key explicitly (`src/app/logger.ts:41-45`). A few older call sites still pass `{ err }` (`src/api/error-handler.ts:66,78`) and therefore lose message/stack serialization - always use `{ error }` in new code.
- Never `console.log`. The only permitted `console.error` is in pre-logger config failures (`src/app/config-file.ts:20`); a console shim routes remaining console calls through pino (`src/shims/console.ts`).
- CLI user-facing output goes through `print(text, newline = true)` from `src/app/terminal.ts` (writes to `process.stdout`), not through the logger. `print` is also used for help/status/auth output (`src/auth/status.ts`).
- Message-content logging is gated by `log.messageContent` config; previews are truncated (`src/lumo-client/client.ts:322`).

## Comments

**When to Comment:**
- File-level JSDoc block on every non-trivial module stating purpose and key architecture (`src/conversations/store.ts:1-15`, `src/api/queue.ts` has no block for trivial classes).
- Exported functions get a short JSDoc when the contract is not obvious from the name (`persistAssistantTurn`, `mapToolCallsForPersistence` in `src/api/routes/shared.ts`).
- Comment the *why*, especially workarounds: `// WORKAROUND for clients that don't provide conversation (e.g., Home Assistant).` (`src/api/routes/responses/index.ts:88`), `// NOTE: Module-level state has been moved to ConversationStore`.
- Section separators are used to structure long files:
  - Box style: `// ============================================` + title (`src/app/config.ts:28`, `src/api/error-handler.ts`)
  - Thin rule style: `// ── Request context ────────────────────────────────────────────────` (`src/api/routes/shared.ts:39`, `src/api/tools/prefix.ts:8`)
- Step markers inside long handlers: `// ===== STEP 1: Determine conversation ID =====` (`src/api/routes/responses/index.ts:60`).
- Inline justifications for non-obvious code: `// slice(2) removes "~/" — join normalizes separators` (`src/app/paths.ts:26`).

**JSDoc/TSDoc:**
- Used, but not exhaustively typed: descriptions plus occasional `@param` (`tests/helpers/test-server.ts`). No `@returns` boilerplate.
- Interface fields commonly carry `/** ... */` one-liners rather than a block comment above the interface (`src/api/types.ts:36`, `src/lumo-client/types.ts`).

## Function Design

**Size:** Prefer small, exported pure functions in `src/api/tools/`, `src/conversations/deduplication.ts`, `src/api/message-converter.ts`. Route handlers may be long but are decomposed into `events.ts` emitters, `request-handlers.ts`, and `shared.ts` helpers.

**Parameters:**
- Max 3 positional params before switching to an options object: `chatWithHistory(turns, onChunk, options)` (`src/lumo-client/client.ts`), `createTestServer(scenario, options)`.
- Dependency injection via a single typed bag: `EndpointDependencies` (`src/api/types.ts:6-13`) is passed to every router factory; classes take collaborators in the constructor (`new LumoClient(api, { enableEncryption: false })`, `new RequestQueue(1)`).
- Defaults belong in `config.defaults.yaml`, never in function signatures or `config.ts`. `src/app/config.ts` contains zod schemas for **validation only** ("Schemas (validation only, no defaults)", line ~29) and getters that read the merged config.

**Return Values:**
- Return early on guard conditions (`if (!prefix || !tools) return tools;` in `src/api/tools/prefix.ts:17`) to keep the happy path unindented.
- Async functions return typed promises; `void` returns are explicit (`persistTitle(...): void`).
- Prefer returning `undefined` over `null` in internal APIs; `null` is reserved for OpenAI wire compat.

## Module Design

**Exports:** Named exports everywhere; default exports only for the shim modules required by upstream import styles (`src/shims/lodash-isNil.ts`, `src/app/logger.ts` default).

**Barrel Files:** Public module surfaces are re-exported from `index.ts` with grouped comments (`src/conversations/index.ts:10-40`). New subsystem entry points should add their export to the barrel rather than being imported by deep path from outside the subsystem.

**Classes:** Used for stateful services - `LumoClient`, `ConversationStore`, `FallbackStore`, `AuthManager`, `MetricsService`, `RequestEventEmitter`/`ResponseEventEmitter`, `CodeBlockDetector`, `RequestQueue`. Private state is `private` fields, frequently with definite-assignment (`private lumoClient!: LumoClient` in `src/app/index.ts:20`).

**Global/singleton state:** logger, config, metrics, and the conversation store are module-level singletons initialized at startup (`initLogger`, `initConfig`, `setMetrics`, `setConversationStore`). Never read them at module top-level in code that can be imported by tests before `tests/setup.ts` runs; use the getters.

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

---

*Convention analysis: 2026-11-06*
