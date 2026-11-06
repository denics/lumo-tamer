---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
# Codebase Structure

**Analysis Date:** 2026-11-06

## Directory Layout

```text
lumo-tamer/
├── src/                      # Application code (105 .ts files)
│   ├── tamer.ts              # Single entry point: server | cli | auth
│   ├── api/                  # OpenAI-compatible HTTP layer (Express)
│   │   ├── server.ts         # Express app, middleware order, route registration
│   │   ├── routes/           # One subdirectory/file per endpoint
│   │   │   ├── shared.ts
│   │   │   ├── responses/    # /v1/responses: index, request-handlers, events
│   │   │   └── chat-completions/  # /v1/chat/completions: index, events
│   │   ├── tools/            # Custom-tool JSON detection, call IDs, prefixes
│   │   ├── message-converter.ts
│   │   ├── instructions.ts
│   │   ├── middleware.ts
│   │   ├── error-handler.ts
│   │   ├── queue.ts
│   │   └── types.ts
│   ├── app/                  # Shared application layer
│   │   ├── index.ts          # class Application (composition root)
│   │   ├── config.ts / config-file.ts / paths.ts
│   │   ├── logger.ts / terminal.ts / metrics.ts
│   │   ├── commands.ts / template.ts / id-generator.ts / urls.ts
│   ├── cli/                  # Interactive client
│   │   ├── client.ts
│   │   ├── message-converter.ts
│   │   └── local-actions/    # code-block detection + file/edit/exec handlers
│   ├── lumo-client/          # Proton Lumo protocol bridge
│   │   ├── client.ts
│   │   ├── v2-stream.ts / v2-body.ts
│   │   ├── instructions.ts / model-tier.ts / types.ts / index.ts
│   ├── conversations/        # Persistence
│   │   ├── store.ts          # Primary: Redux + IndexedDB
│   │   ├── init.ts           # IDB polyfill + Redux/saga setup
│   │   ├── index.ts          # initialization + singleton accessors
│   │   ├── deduplication.ts / key-manager.ts / types.ts
│   │   └── fallback/         # Deprecated in-memory store + sync
│   │       ├── store.ts / index.ts
│   │       └── sync/         # auto-sync, sync-service, space-manager, codec
│   ├── auth/                 # Authentication for all methods
│   │   ├── authenticate.ts / index.ts / manager.ts / api-factory.ts
│   │   ├── providers/        # AuthProvider base + BrowserAuthProvider
│   │   ├── browser/          # CDP token extraction
│   │   ├── login/            # Go SRP helper wrapper (+ go/ sources)
│   │   ├── rclone/           # rclone config parsing
│   │   └── vault/            # Encrypted token vault
│   ├── mock/                 # Mock ProtonApi, mock store, custom scenarios
│   └── shims/                # Node polyfills and adapters (see below)
├── packages/
│   ├── lumo/                 # @lumo/* - synced upstream. DO NOT EDIT
│   │   ├── src/              # mirrors applications/lumo/src/app/
│   │   └── patches/          # DEP-3 patches applied by sync script
│   └── proton/               # @proton/* - synced upstream. DO NOT EDIT
├── tests/
│   ├── unit/                 # Pure function/class tests
│   ├── integration/          # HTTP route tests via test-server helper
│   ├── e2e/                  # OpenAI SDK compatibility + CLI smoke
│   ├── helpers/test-server.ts
│   └── setup.ts
├── scripts/upstream/         # sync.sh, create-patch.sh, last-sync-commit
├── docs/                     # Feature + integration documentation
├── sessions/                 # Runtime data (gitignored): vault.enc
├── logs/                     # Runtime logs (gitignored)
├── dist/                     # tsc output (gitignored)
├── config.defaults.yaml      # Single source of truth for defaults
├── config.yaml               # Local user override (gitignored)
├── tsconfig.json             # Path aliases (@lumo/*, @proton/*, shims)
├── vitest.config.ts          # Test aliases + include patterns
├── Dockerfile / Dockerfile.browser / docker-compose.yml
└── grafana-lumo-tamer-dashboard.json
```

## Directory Purposes

**`src/` (root files):**
- Purpose: process entry and global bootstrap
- Contains: `tamer.ts` only
- Key files: `src/tamer.ts`

**`src/api/`:**
- Purpose: everything that speaks OpenAI HTTP
- Contains: Express server, routers, SSE emitters, request validation, OpenAI types, message converters, tool-call detection
- Key files: `src/api/server.ts`, `src/api/routes/shared.ts`, `src/api/message-converter.ts`, `src/api/types.ts`

**`src/api/routes/<endpoint>/`:**
- Purpose: one OpenAI endpoint's request→Lumo→response pipeline
- Contains: `index.ts` (router + validation), optional `request-handlers.ts` (streaming/non-streaming orchestration), `events.ts` (SSE frame emitter)
- Key files: `src/api/routes/responses/index.ts`, `src/api/routes/responses/request-handlers.ts`, `src/api/routes/responses/events.ts`, `src/api/routes/chat-completions/index.ts`

**`src/api/tools/`:**
- Purpose: custom-tool protocol support on the OpenAI side
- Contains: brace-tracking JSON detector (`streaming-tool-detector.ts`, `json-brace-tracker.ts`), text/tool splitter (`streaming-processor.ts`), call-ID scheme (`call-id.ts`), tool name prefixing (`prefix.ts`), native SSE tool accumulator (`native-tool-call-processor.ts`)
- Key files: `src/api/tools/index.ts` (barrel), `src/api/tools/streaming-processor.ts`

**`src/app/`:**
- Purpose: shared, mode-agnostic services
- Contains: composition root, config loading/validation/getters, logger, metrics, paths, slash commands, template interpolation, terminal output, URL constants, deterministic IDs
- Key files: `src/app/index.ts`, `src/app/config.ts`, `src/app/logger.ts`, `src/app/commands.ts`

**`src/cli/`:**
- Purpose: terminal UX
- Contains: readline client (`client.ts`), CLI instruction builder (`message-converter.ts`), `local-actions/` (detector, handlers, confirmations, edit application, execution)
- Key files: `src/cli/client.ts`, `src/cli/local-actions/block-handlers.ts`, `src/cli/local-actions/code-block-detector.ts`

**`src/lumo-client/`:**
- Purpose: the only module that knows Lumo 2.0 wire format
- Contains: `LumoClient` (encryption + HTTP + SSE + bounce + titles), SSE parser (`v2-stream.ts`), request body builder (`v2-body.ts`), instruction injection, model tier mapping, types, barrel
- Key files: `src/lumo-client/client.ts`, `src/lumo-client/v2-stream.ts`, `src/lumo-client/types.ts`

**`src/conversations/`:**
- Purpose: conversation semantics independent of transport
- Contains: primary Redux/IndexedDB store, store bootstrap, dedup/continuation logic, key hierarchy (KeyManager), persistence types, deprecated fallback store and sync
- Key files: `src/conversations/store.ts`, `src/conversations/index.ts`, `src/conversations/deduplication.ts`, `src/conversations/key-manager.ts`

**`src/conversations/fallback/sync/`:**
- Purpose: remote sync for the deprecated in-memory store
- Contains: `sync-service.ts` (orchestration), `space-manager.ts`, `encryption-codec.ts`, `auto-sync.ts` (debounced dirty notifications), barrel
- Key files: `src/conversations/fallback/sync/sync-service.ts`, `src/conversations/fallback/sync/auto-sync.ts`

**`src/auth/`:**
- Purpose: turn Proton credentials into a refresh-aware `ProtonApi`
- Contains: `AuthProvider`/`BrowserAuthProvider`, factory (`createAuthProvider`), `AuthManager`, API factory with 401 retry, token refresh, logout/revocation, provider-specific acquisition flows, vault encryption
- Key files: `src/auth/index.ts`, `src/auth/providers/provider.ts`, `src/auth/manager.ts`, `src/auth/api-factory.ts`, `src/auth/vault/vault.ts`

**`src/mock/`:**
- Purpose: run server/CLI/tests without Proton
- Contains: `createMockProtonApi()` wrapping upstream scenario generators, mock Redux/IDB store, custom scenarios
- Key files: `src/mock/mock-api.ts`, `src/mock/mock-store.ts`, `src/mock/custom-scenarios.ts`

**`src/shims/`:**
- Purpose: make browser/upstream code execute in Node
- Contains: `console.ts` (pino redirect), `fetch-adapter.ts` (patch `globalThis.fetch`), `indexeddb-polyfill.ts` (SQLite-backed IDB), `uint8array-base64-polyfill.ts`, lodash submodule wrappers, `toposort.ts`, `json-stable-stringify.ts`
- Key files: `src/shims/fetch-adapter.ts`, `src/shims/indexeddb-polyfill.ts`

**`packages/lumo/`:**
- Purpose: vendored Proton Lumo application code (`@lumo/*`)
- Contains: `src/` mirroring upstream layout (`lib/lumo-api-client/`, `redux/`, `remote/`, `indexedDb/`, `crypto/`, `mocks/`, `services/`, `util/`, `keys.ts`, `types*.ts`, `config.ts`) and `patches/`
- Key files: `packages/lumo/src/lib/lumo-api-client/core/encryption.ts`, `packages/lumo/src/redux/store.ts`, `packages/lumo/src/remote/api.ts`
- Generated: no (synced); Committed: yes — **never edit by hand**

**`packages/proton/`:**
- Purpose: vendored Proton shared crypto/helpers (`@proton/*`)
- Contains: `crypto/` (AES-GCM, hash, proxy shim, index barrel), `shared/lib/apps/helper.ts`, `shared/lib/fetch/headers.ts`, `utils/mergeUint8Arrays.ts`
- Committed: yes — **never edit by hand**

**`tests/`:**
- Purpose: verification
- Contains: `unit/` (pure modules), `integration/` (HTTP routes), `e2e/` (OpenAI SDK + CLI), `helpers/test-server.ts`, `setup.ts`
- Key files: `tests/helpers/test-server.ts`, `tests/setup.ts`

**`scripts/upstream/`:**
- Purpose: maintain the vendored upstream copy
- Contains: `sync.sh` (fetch from GitHub, diff, apply patches, record commit), `create-patch.sh`, `last-sync-commit`
- Key files: `scripts/upstream/sync.sh`

## Key File Locations

**Entry Points:**
- `src/tamer.ts`: process entry, mode dispatch, fatal handlers
- `src/app/index.ts`: `Application.create()` — auth/store/sync/mock wiring
- `src/api/server.ts`: `APIServer` — Express bootstrap and route registration

**Configuration:**
- `config.defaults.yaml`: **single source of truth** for every default; edit here, not in code
- `config.yaml`: local override (gitignored); loaded over defaults with array-replacement merge
- `src/app/config.ts`: zod schemas + per-domain getters (`getServerConfig`, `getCliConfig`, …)
- `src/app/config-file.ts`: YAML load status checks, vault/config writes
- `tsconfig.json`, `vitest.config.ts`: `@lumo/*`, `@proton/*` and shim aliases (must be kept in sync)

**Core Logic:**
- `src/lumo-client/client.ts`: Proton conversation calls, encryption, SSE, native tools, bounce
- `src/lumo-client/v2-stream.ts`: Lumo 2.0 SSE → message union
- `src/conversations/store.ts`: dedup + Redux dispatch adapter (634 lines, largest module)
- `src/api/routes/responses/request-handlers.ts`: unified streaming/non-streaming orchestration
- `src/api/routes/shared.ts`: cross-endpoint request context, persistence, usage, IDs

**Testing:**
- `tests/helpers/test-server.ts`: builds Express app with `createMockProtonApi()` and `FallbackStore`/`ConversationStore`, bypassing `Application`
- `tests/setup.ts`: `initConfig('server')`, silences logger, global aliases
- `tests/integration/*.test.ts`: route-level contract tests
- `tests/e2e/openai-sdk-streaming.test.ts`: real OpenAI SDK against the server

**Documentation:**
- `docs/upstream.md`: upstream file strategy (patches vs shims)
- `docs/development.md`: setup/build/test commands
- `docs/authentication.md`, `docs/conversations.md`, `docs/custom-tools.md`, `docs/local-actions.md`

## Naming Conventions

**Files:**
- kebab-case `.ts` for all modules: `streaming-tool-detector.ts`, `message-converter.ts`, `key-manager.ts`, `request-handlers.ts`
- Versioned protocol parsers use a numeric prefix: `v2-stream.ts`, `v2-body.ts`
- Barrels are `index.ts` (`src/api/tools/index.ts`, `src/lumo-client/index.ts`, `src/conversations/index.ts`, `src/auth/index.ts`, `src/conversations/fallback/sync/index.ts`)
- `src/app/index.ts` is **not** a barrel — it exports `class Application`
- Route folders are named after the endpoint (`responses/`, `chat-completions/`); pre-router flat files remain for simple endpoints (`src/api/routes/health.ts`, `models.ts`, `metrics.ts`, `auth.ts`)
- Upstream vendored files keep their exact upstream names (`keys.ts`, `serialization.ts`) — do not rename
- Tests: `<subject>.test.ts` under `tests/{unit,integration,e2e}/`

**Directories:**
- lowercase, single-word or kebab-case; plural for collections (`routes`, `tools`, `providers`, `shims`, `patches`)
- Feature-first grouping inside `src/api/routes/<endpoint>/`, `src/cli/local-actions/`, `src/auth/<method>/`, `src/conversations/fallback/sync/`
- No `__tests__` co-location; tests always live in `tests/`

**Symbols:**
- Classes `PascalCase` (`Application`, `APIServer`, `LumoClient`, `ConversationStore`)
- Functions/variables `camelCase`; constants `UPPER_SNAKE_CASE` (`SESSION_ID`, `DEFAULT_EXTERNAL_TOOLS`, `PROJECT_ROOT`)
- Type/interface `PascalCase`; OpenAI wire types prefixed `OpenAI*` (`OpenAIResponseRequest`, `OpenAIChatMessage`) in `src/api/types.ts`
- Route factories always `create<Thing>Router(deps)`
- Config getters always `get<Domain>Config()`
- Reset helpers for singletons: `reset<Thing>()`
- Config YAML keys are camelCase (`apiModelName`, `useFallbackStore`, `deriveIdFromUser`)

## Where to Add New Code

**New HTTP endpoint:**
- Create `src/api/routes/<name>/index.ts` exporting `create<Name>Router(deps: EndpointDependencies)`; add `events.ts` if it streams and `request-handlers.ts` if it shares a streaming/non-streaming pipeline
- Register it in `setupRoutes()` in `src/api/server.ts` (before `setupApiErrorHandler()`)
- Reuse `src/api/routes/shared.ts` helpers; add wire types to `src/api/types.ts`
- Integration test: `tests/integration/<name>-api.test.ts` using `tests/helpers/test-server.ts`

**New OpenAI message/field support:**
- Conversion: `src/api/message-converter.ts`
- Request/response shapes: `src/api/types.ts`
- Emitters: the relevant `src/api/routes/*/events.ts`
- Instructions text/placeholders: `config.defaults.yaml` (`server.instructions`, `cli.instructions`)

**New Lumo protocol behavior (SSE fields, encryption, targets):**
- `src/lumo-client/v2-stream.ts` (parse) and `src/lumo-client/v2-body.ts` (build)
- Orchestration in `src/lumo-client/client.ts`
- Types in `src/lumo-client/types.ts`
- If upstream has an equivalent, prefer syncing the file via `scripts/upstream/sync.sh` instead of writing new code

**New custom-tool handling:**
- Detector/parser: `src/api/tools/streaming-tool-detector.ts`, `json-brace-tracker.ts`
- Emission and persistence mapping: `src/api/tools/streaming-processor.ts`, `src/api/routes/shared.ts`
- Prompt/instruction for tools: `config.defaults.yaml` (`instructions.forTools`, `forToolBounce`)

**New auth method:**
- Create `src/auth/<method>/authenticate.ts` for acquisition and wire it into `runAuthCommand()` in `src/auth/authenticate.ts`
- Extend `authMethodSchema` and `auth.methods` in `src/app/config.ts` / `config.defaults.yaml`
- If behavior differs (refresh, persistence capability), subclass `AuthProvider` and register a factory like `src/auth/providers/browser.ts` does
- Persist tokens through `src/auth/vault/*`; never write plaintext credentials

**New configuration knob:**
1. Add the default to `config.defaults.yaml` (only place for defaults)
2. Add/extend the zod schema and a `get<Domain>Config()` getter in `src/app/config.ts`
3. Consume through the getter — never inline a fallback value

**New persistence behavior:**
- Primary store: `src/conversations/store.ts` (+ `deduplication.ts` for identity rules)
- Store bootstrap/Redux wiring: `src/conversations/init.ts`
- Keep the method surface identical in `src/conversations/fallback/store.ts` so `getConversationStore()` consumers keep working

**New CLI local action (block type):**
- Add a `BlockHandler` under `src/cli/local-actions/` and register it in `blockHandlers` (`src/cli/local-actions/block-handlers.ts:19`) — order matters, first match wins
- Add its markdown language tag under `cli.localActions.executors` in `config.defaults.yaml`
- Tests: `tests/unit/code-block-detector.test.ts`, `tests/unit/file-reader.test.ts`

**New Node polyfill / library shim:**
- `src/shims/<name>.ts`; add an alias in `tsconfig.json` **and** `vitest.config.ts`; document the source URL in the file header

**New upstream file:**
- Add the upstream-relative path to the `LUMO_FILES`/`PROTON_FILES` arrays in `scripts/upstream/sync.sh`, run `npm run sync-upstream`; only patch via `packages/lumo/patches/`

**Shared helper used by both API and CLI:**
- Put it in `src/app/` (e.g. `commands.ts`, `template.ts`) rather than duplicating in `src/api/` and `src/cli/`

## Special Directories

**`packages/lumo/` and `packages/proton/`:**
- Purpose: vendored Proton WebClients code resolved through tsconfig aliases
- Generated: partially (synced from GitHub)
- Committed: yes
- Rule: do not edit; changes are overwritten by `npm run sync-upstream`

**`packages/lumo/patches/`:**
- Purpose: DEP-3 patches applied automatically after sync (`keys.patch`, `redux-selectors.patch`, `redux-sagas-index.patch`, `indexedDb-db.patch`)
- Generated: no; Committed: yes
- Add new patches with `scripts/upstream/create-patch.sh` and list them in `patches/series`

**`dist/`:**
- Purpose: compiled JS + `.d.ts` (tsc + `tsc-alias`)
- Generated: yes; Committed: no

**`sessions/`:**
- Purpose: runtime state — `vault.enc` (encrypted auth tokens), IndexedDB/SQLite data
- Generated: yes; Committed: no (only `.gitkeep`)

**`logs/`:**
- Purpose: file logging target (`logs/lumo-tamer.log`, `logs/lumo-tamer-error.log`)
- Generated: yes; Committed: no

**`node_modules/`:**
- Purpose: dependencies including workspace symlinks for `@lumo/*`/`@proton/*`
- Generated: yes; Committed: no

---

*Structure analysis: 2026-11-06*
