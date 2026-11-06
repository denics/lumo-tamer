---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
<!-- refreshed: 2026-11-06 -->
# Architecture

**Analysis Date:** 2026-11-06

## System Overview

lumo-tamer is a Node.js/TypeScript **protocol adapter (proxy)** that exposes Proton Lumo as an OpenAI-compatible HTTP API and an interactive CLI. The same core (auth → Lumo bridge → conversation store) is shared by both front-ends.

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Entry Point: src/tamer.ts (arg parsing, mode dispatch)                │
└───────────────┬───────────────────────────┬───────────────────────────┘
                │ server                    │ default (CLI) / auth
                ▼                           ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────┐
│ API layer                    │  │ CLI layer                            │
│ `src/api/server.ts`          │  │ `src/cli/client.ts`                  │
│ routes: /v1/responses,       │  │ readline loop, code-block detection, │
│ /v1/chat/completions,        │  │ local file/exec actions              │
│ /v1/models, /v1/auth/*,      │  │ `src/cli/local-actions/`             │
│ /health, /metrics            │  │                                      │
│ `src/api/routes/`            │  │                                      │
└───────────────┬──────────────┘  └───────────────┬──────────────────────┘
                │ EndpointDependencies (DI)       │ Application
                └───────────────┬─────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Shared bootstrap: src/app/index.ts (class Application)                │
│ loads config, builds AuthProvider + AuthManager, ConversationStore,   │
│ optional sync, mock mode; exposes AppContext getters                  │
└───────────────┬───────────────────────────────┬───────────────────────┘
                ▼                               ▼
┌───────────────────────────────────┐  ┌─────────────────────────────────┐
│ Lumo bridge                       │  │ Persistence                     │
│ `src/lumo-client/client.ts`       │  │ `src/conversations/store.ts`    │
│ U2L encryption, SSE parsing       │  │ Redux + IndexedDB (primary)     │
│ (`v2-stream.ts`), body building   │  │ `src/conversations/fallback/`   │
│ (`v2-body.ts`), native tool       │  │ in-memory + SyncService (depr.) │
│ detection, tool-call bounce       │  │ `src/auth/key-manager.ts`       │
└───────────────┬───────────────────┘  └───────────────┬─────────────────┘
                │ ProtonApi(fetch-shaped fn)            │ LumoApi / sagas
                ▼                                       ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Proton backend (https://lumo.proton.me/api/ai/v1/chat/completions)    │
│ Auth: `src/auth/` (browser|login|rclone) + vault; `src/auth/manager.ts`│
└───────────────────────────────────────────────────────────────────────┘

       Adapters used by upstream Proton code (do not edit):
       packages/lumo (@lumo/*), packages/proton (@proton/*), src/shims/
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

**Overall:** Layered adapter/proxy with a central composition root (`Application`) and dependency-injected routes.

**Key Characteristics:**
- **Composition root:** `Application.create()` (`src/app/index.ts:38`) is the only place wiring auth, store, sync, and `LumoClient`. Nothing else constructs these dependencies.
- **Route factory + dependency bundle:** every router is `createXRouter(deps: EndpointDependencies)` (`src/api/types.ts:6`); server assembles `deps` once (`src/api/server.ts:73`). Enables `tests/helpers/test-server.ts` to bypass auth/config.
- **Protocol isolation through converters/emitters:** OpenAI wire formats stay in `src/api/`, Lumo wire formats stay in `src/lumo-client/`, and conversions are plain functions (`convertOpenAIChatMessages`, `convertOpenAIResponseMessages`, `V2StreamProcessor`, `ResponseEventEmitter`).
- **Upstream-first:** Proton WebClients code is vendored under `packages/lumo` and `packages/proton` and never edited in place; connectivity is achieved with tsconfig aliases, patches, and shims (`docs/upstream.md`, `scripts/upstream/sync.sh`).
- **Global singletons for cross-cutting services:** config, logger, metrics, active conversation store, sync service — set once during bootstrap and imported directly by consumers.
- **Bidirectional mode reuse:** CLI and API both call `LumoClient.chatWithHistory()` with the same store interface, and both execute slash commands via `src/app/commands.ts`.

## Layers

**Entry/dispatch layer:**
- Purpose: process-level concerns (argv, config load, logger init, fatal handlers, shutdown signals)
- Location: `src/tamer.ts`
- Contains: `arg` parsing, dynamic `import()` per mode, `SIGINT`/`SIGTERM` handlers
- Depends on: `src/app/config.ts`, `src/app/logger.ts`, `src/app/terminal.ts`
- Used by: nothing (top of graph)

**Front-end layer (API + CLI):**
- Purpose: protocol translation, streaming, presentation, request validation
- Location: `src/api/`, `src/cli/`
- Contains: Express routers/emitters/middleware; readline loop, code-block detector, local actions
- Depends on: `Application` interface, `LumoClient`, `ConversationStore`, `app/*` config/commands/metrics
- Used by: `src/tamer.ts`

**Application/service layer:**
- Purpose: lifecycle orchestration and cross-mode logic (commands, instructions, templates)
- Location: `src/app/`
- Contains: `Application`, config getters, logger, metrics, paths, commands, template interpolation, terminal I/O
- Depends on: auth, conversations, lumo-client, mock, shims
- Used by: API, CLI, entry point

**Core domain layer:**
- Purpose: Lumo protocol + persistence semantics
- Location: `src/lumo-client/`, `src/conversations/`, `src/auth/`
- Contains: SSE parsing, encryption, tool detection, dedup, key hierarchy, token refresh
- Depends on: `@lumo/*`, `@proton/*`, `src/shims/`, `src/app/*`
- Used by: front-end and application layers

**Anti-corruption layer:**
- Purpose: make browser/Proton code run under Node with our auth
- Location: `packages/lumo/`, `packages/proton/`, `src/shims/`
- Contains: vendored upstream (52 files in `packages/lumo/src`, 8 in `packages/proton/src`), DEP-3 patches (`packages/lumo/patches/series`), polyfills
- Depends on: node builtins, `openpgp`, `indexeddbshim`
- Used by: conversations store/sync, lumo-client

## Data Flow

### Primary Request Path — `/v1/responses` streaming

1. Transport/auth/metrics middleware (`src/api/server.ts:44-56`, `src/api/middleware.ts`): bearer check against `server.apiKey`, logging, prom-client counters.
2. Router validates and resolves conversation identity (`src/api/routes/responses/index.ts:63-140`): `conversation` field → deterministic session-scoped UUID (`deterministicUUID`, `src/app/id-generator.ts`); `previous_response_id` used as conversation ID; `deriveIdFromUser` maps `user` → deterministic ID; otherwise stateless.
3. Validation: `input` presence + at least one user message, `model` against `server.allowedModels`, `reasoning.effort` enum (`isValidReasoningEffort`, `src/lumo-client/model-tier.ts`).
4. Conversion: `convertOpenAIResponseMessages()` (`src/api/message-converter.ts`) → `Turn[]`; tool items become `assistant`/`user` turns containing JSON envelopes (Lumo reserves real tool roles for SSE tools).
5. Persistence of inbound turns: `deps.conversationStore.appendMessages()` (`src/conversations/store.ts:213`) which validates continuation, dedups by semantic ID, dispatches Redux actions and schedules upstream push.
6. Instructions: `buildInstructions()` (`src/api/instructions.ts`) interpolates the configured template (`config.defaults.yaml` → `server.instructions.template`) with client instructions + tool schema/prefix.
7. Handler (`src/api/routes/responses/request-handlers.ts:151`): resolves tier + reasoning, builds `ResponseEventEmitter`, then either short-circuits on a slash command (`tryExecuteCommand`) or enqueues `lumoClient.chatWithHistory()` on the serial `RequestQueue` (concurrency 1, `src/api/queue.ts`).
8. LumoClient (`src/lumo-client/client.ts:317`): encrypts turns with per-request AES-GCM key + Lumo public key, POSTs to `ai/v1/chat/completions`, parses SSE (`V2StreamProcessor`), decrypts `message`/`reasoning`/tool chunks, drains `onChunk` into the tool processor.
9. Tool processing (`src/api/tools/streaming-processor.ts`): `StreamingToolDetector` splits text from custom-tool JSON; emits `OpenAIToolCall` with `toolname__uuid` call IDs (`src/api/tools/call-id.ts`).
10. Persist outbound: `persistTitle` + `persistAssistantTurn` (`src/api/routes/shared.ts:64-123`) — custom tool calls are deliberately **not** persisted (client echoes them back next turn); native tools are persisted with `toolCall`/`toolResult`.
11. Respond: streaming continues as Responses events (`response.created`, `response.output_text.delta`, `response.output_item.done`, `response.completed`); non-streaming builds a full `OpenAIResponse` (`createCompletedResponse`, `request-handlers.ts:92`).

### Chat Completions Flow

Same skeleton (`src/api/routes/chat-completions/index.ts:47-234`) with differences: last user message must exist, conversation ID comes only from `deriveIdFromUser`, `system` message becomes `instructions`, and output uses `ChatCompletionEventEmitter` / `chat.completion` JSON.

### Native (server-side) Tool Flow

Lumo emits `server_tool_call` / `server_tool_result` SSE messages → `NativeToolCallProcessor` (`src/api/tools/native-tool-call-processor.ts`) accumulates name/arguments/result → returned in `ChatResult.message.toolCall/toolResult` → persisted as one assistant message. If a *custom* tool arrives on the native channel (`misrouted`), `LumoClient.chatWithHistory` performs exactly one **bounce** (`src/lumo-client/client.ts:379-401`): appends an instruction containing the tool call as JSON and re-asks Lumo to emit it as text. Bounce depth is capped by the internal `isBounce` flag.

### Title Generation Flow

When `requestTitle` is true (conversation title is `New Conversation`), `chatWithHistory` launches a **concurrent** second completion with `lumo.target:'title'` (`src/lumo-client/client.ts:334-350`). Failures are logged and non-fatal; result is post-processed with upstream `postProcessTitle` then persisted via `persistTitle`.

### CLI Flow

`CLIClient.run()` (`src/cli/client.ts:44`): single-query mode (argv) or readline loop → append user message → `sendToLumo()` streams chunks through `CodeBlockDetector` → `blockHandlers` registry (`src/cli/local-actions/block-handlers.ts:19`) matches `read`/`edit`/`create`/`execute` blocks → user confirmation (`confirm.ts`) → results formatted and sent back as a new user turn → loop until no executable blocks. On exit, `/save` triggers a sync if initialized.

### Conversation Persistence/Sync Flow

Primary path: `ConversationStore` (`src/conversations/store.ts`) wraps upstream Redux selectors/slices; every mutation dispatches actions (`addMessage`, `finishMessage`, `pushMessageRequest`, `changeConversationTitle`) and upstream sagas handle IndexedDB persistence and remote sync. Fallback path (deprecated, `src/conversations/fallback/`): in-memory `FallbackStore` + `setOnDirtyCallback` → `AutoSyncService` → `SyncService` → `SpaceManager` + `EncryptionCodec` using `@lumo/remote/api`.

**State Management:**
- Server statelessness: no per-request globals in routes; conversation state lives in `ConversationStore` keyed by `ConversationId`.
- Cross-request mutable state is limited to singletons (store, metrics, config, logger, `completedCallIds`, `SESSION_ID`).
- Streaming state is local to each handler invocation (`accumulatedText`, `processor`, `emitter`).

## Key Abstractions

**`ProtonApi` (fetch-shaped function):**
- Purpose: single seam between the app and Proton HTTP; swappable for mocks and refresh-wrapped clients
- Examples: `src/lumo-client/types.ts`, `src/auth/api-factory.ts`, `src/mock/mock-api.ts`
- Pattern: higher-order function returning `Promise<object | ReadableStream<Uint8Array>>`

**`EndpointDependencies`:**
- Purpose: explicit dependency bundle for all routers
- Examples: `src/api/types.ts:6`, assembled in `src/api/server.ts:73`, overridden in `tests/helpers/test-server.ts`
- Pattern: constructor-style DI without a container

**`ConversationStore` interface (duck-typed across primary/fallback):**
- Purpose: mode-agnostic persistence API (`getOrCreate`, `appendMessages`, `appendAssistantResponse`, `toTurns`, `setTitle`, `getDirty`, …)
- Examples: `src/conversations/store.ts`, `src/conversations/fallback/store.ts`
- Pattern: adapter over upstream Redux; identical method surface in both implementations

**`StreamingToolProcessor`:**
- Purpose: isolate custom-tool JSON from assistant prose while streaming, per endpoint
- Examples: `src/api/tools/streaming-processor.ts`
- Pattern: strategy callbacks (`emitTextDelta`, `emitToolCall`) so Responses/ChatCompletions emit their own event shapes

**Event emitters:**
- Purpose: encapsulate SSE framing per OpenAI dialect
- Examples: `src/api/routes/responses/events.ts`, `src/api/routes/chat-completions/events.ts`
- Pattern: class holding `res`, writes `data:` frames, `[DONE]` terminator

**`Turn` / `MessageForStore`:**
- Purpose: internal canonical message representation (role + content, optional dedup `id`)
- Examples: `src/lumo-client/types.ts`, `src/conversations/types.ts`
- Pattern: converters at both boundaries; persistence stores `semanticId` for dedup

**Config getters:**
- Purpose: typed, mode-aware config access without passing config objects around
- Examples: `getServerConfig`, `getCliConfig`, `getConversationsConfig`, `getCustomToolsConfig` (`src/app/config.ts:247-302`)
- Pattern: module-level singleton initialized by `initConfig(mode)`

## Entry Points

**`tamer` binary (`src/tamer.ts`):**
- Location: `src/tamer.ts`
- Triggers: `npm run cli`, `npm run server`, `node dist/src/tamer.js`
- Responsibilities: parse `server`/`auth` subcommands and `--help`; init config+logger; dispatch; install fatal handlers

**API server mode:**
- Location: `src/tamer.ts:51-62` → `src/api/server.ts`
- Triggers: `tamer server`
- Responsibilities: `Application.create()`, Express bootstrap, template validation, `listen(server.port)`

**CLI mode (default):**
- Location: `src/tamer.ts:63-71` → `src/cli/client.ts`
- Triggers: `tamer [query]`
- Responsibilities: interactive/single-query chat, local actions, exit sync

**Auth mode:**
- Location: `src/tamer.ts:48-52` → `src/auth/authenticate.ts`
- Triggers: `tamer auth …`
- Responsibilities: provider-specific login (browser CDP, Go SRP binary, rclone import) and vault write

**HTTP routes:**
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

**What happens:** `LumoClient`, a core protocol bridge, imports `NativeToolCallProcessor` from `src/api/tools/`.
**Why it's wrong:** inverts the dependency direction (core → front-end), so `src/lumo-client` cannot be reused without the API layer and CLI pulls in API tool code.
**Do this instead:** move `native-tool-call-processor.ts` under `src/lumo-client/` (or a neutral `src/protocol/`) and keep `src/api/tools/` for OpenAI-format adapters, as done for `StreamingToolProcessor`.

### Direct singleton pulls inside deep modules

**What happens:** config, logger, metrics, and the active store are imported as module singletons by nearly every file (51 `../app` imports from `src/`).
**Why it's wrong:** hidden dependencies make units hard to test in isolation and require `tests/setup.ts` global config init; behavior depends on import order.
**Do this instead:** for new code that must be testable, accept config/services as parameters (as `EndpointDependencies` and `Application` already do) and pass them down instead of importing `getXConfig()` inside pure helpers.

### Sibling directory reference through `src/`

**What happens:** `src/api/message-converter.ts:11` imports `'../../src/conversations/types.js'`.
**Why it's wrong:** resolves to `src/conversations/types.js` via a redundant `src/` hop; breaks if the file is moved and confuses rootDir/tsc-alias resolution.
**Do this instead:** use `'../conversations/types.js'`.

### Mode-specific state living outside the composition root

**What happens:** `mock-api.ts` keeps `callCounts` and `native-tool-call-processor` keeps per-instance state while other cross-request state (`completedCallIds`, `templateValidated`) is module-global.
**Why it's wrong:** inconsistent lifetime rules; tests and long-running servers cannot reset the global pieces reliably.
**Do this instead:** keep request-scoped state in the handler/processor instance; expose explicit `reset*()` functions for module singletons (as `resetConversationStore`, `resetSyncService` already do).

### Emitting SSE events inline

**What happens:** handlers manually call long sequences of `emitter.emit…` for ordering-sensitive events.
**Why it's wrong:** easy to emit out-of-order or forget a terminal event, and both dialects duplicate the sequencing.
**Do this instead:** extend the emitter classes (`src/api/routes/*/events.ts`) with higher-level methods (e.g. `emitTextLifecycle`) that own the ordering contract.

## Error Handling

**Strategy:** convert all failures to OpenAI-compatible JSON at the HTTP boundary; keep upstream errors as thrown `Error`s internally; never leak stack traces to clients.

**Patterns:**
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

**Logging:** pino singleton (`src/app/logger.ts`); pretty to stdout or file + `warn`+ to stderr; `installConsoleShim` redirects `console.*`; user-facing CLI output must use `print()` from `src/app/terminal.ts`.

**Validation:** zod schemas in `src/app/config.ts` validate config only (defaults live in `config.defaults.yaml`); HTTP payloads are hand-validated in route handlers; `zod` is not used for OpenAI request bodies.

**Authentication:** vault-backed `AuthProvider` (`src/auth/providers/provider.ts`) + `AuthManager` (`src/auth/manager.ts`) provide a refresh-aware `ProtonApi`; API clients authenticate with a static bearer key (`server.apiKey`), not Proton credentials.

**Observability:** `metrics.ts` counters/histograms for HTTP, messages, tool calls, queue, sync, auth failures, Proton API latency; exposed at `/metrics` without auth (`src/api/middleware.ts:8`).

**Configuration:** layered `config.defaults.yaml` → `config.yaml` → mode override (`server`/`cli`), arrays replaced wholesale (`mergeConfigLayers`, `src/app/config.ts:11`); paths resolved to project root regardless of `cwd` (`src/app/paths.ts`).

---

*Architecture analysis: 2026-11-06*
