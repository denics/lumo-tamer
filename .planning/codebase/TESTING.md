---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
# Testing Patterns

**Analysis Date:** 2026-11-06

## Test Framework

**Runner:**
- Vitest 4.1.x (`devDependencies` in `package.json`), config `vitest.config.ts`
- `test.include: ['tests/**/*.test.ts']`, `setupFiles: ['tests/setup.ts']`, `testTimeout: 15000`
- Aliases are declared separately from `tsconfig.json` because Vitest does not read TS `paths` (`vitest.config.ts:6-26`). New `@lumo/*`, `@proton/*`, or shim aliases must be added in both files.
- Environment: Node (no jsdom). Browser-ish globals come from shims and `fake-indexeddb`.

**Assertion Library:**
- Vitest's built-in `expect` (Jest-compatible matchers: `toBe`, `toEqual`, `toHaveLength`, `toMatch`, `toContain`, `toMatchObject`, `rejects.toMatchObject`)

**Run Commands:**
```bash
npm test                   # all tests (unit + integration + e2e), single run
npm run test:unit          # vitest run tests/unit/
npm run test:integration   # vitest run tests/integration/
npm run test:watch         # vitest (watch mode)
npx vitest run tests/unit/queue.test.ts   # single file
npx vitest run --coverage  # coverage (provider configured, no thresholds)
```

## Test File Organization

**Location:**
- Separate tree, never co-located with source. No `__tests__` directories.
- `tests/unit/` - pure functions and classes, no HTTP
- `tests/integration/` - HTTP endpoints against an in-process Express server
- `tests/e2e/` - OpenAI SDK compatibility and CLI smoke test
- `tests/helpers/` - shared harness (`test-server.ts`); no other fixtures are shared
- `tests/setup.ts` - global setup, runs before every test file

**Naming:**
- `<subject>.test.ts`, subject in kebab-case matching the module under test: `streaming-tool-detector.test.ts`, `json-brace-tracker.test.ts`, `primary-conversation-store.test.ts`
- Roughly 437 `it(...)` cases across 35 test files; unit-heavy, integration covers the two API surfaces.

**Structure:**

```
tests/
├── unit/            # one file per module, describe('<exportedSymbol>')
├── integration/     # one file per endpoint area
├── e2e/             # openai-sdk-streaming.test.ts, cli-smoke.test.ts
├── helpers/
│   └── test-server.ts
└── setup.ts
```

## Global Setup (`tests/setup.ts`)

- Imports `src/shims/uint8array-base64-polyfill.js` first (ES2024 `Uint8Array.fromBase64` is only native on Node 25+).
- Calls `initConfig('server')`, which loads `config.defaults.yaml`. **No `config.yaml` is read**, so tests never depend on local developer config.
- Calls `initLogger({ level: 'fatal', target: 'stdout', filePath: '', messageContent: false }, { consoleShim: false })` so output stays quiet but `logger.*` calls do not throw.
- Tests that need CLI-only config re-initialize explicitly in `beforeAll`: `initConfig('cli')` in `tests/unit/file-reader.test.ts:14` (safe because Vitest isolates test files per worker).

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest';
import { hashMessage } from '../../src/conversations/deduplication.js';

describe('hashMessage', () => {
  it('should produce different hashes for different roles', () => {
    const hash1 = hashMessage('user', 'Hello');
    const hash2 = hashMessage('assistant', 'Hello');
    expect(hash1).not.toBe(hash2);
  });
});
```
(`tests/unit/deduplication.test.ts`)

- `describe` is named after the function or class under test; nested `describe` blocks group behaviours (`describe('/v1/responses')` -> `describe('non-streaming (success)')` in `tests/integration/responses-api.test.ts`).
- `it` names are behavioural sentences in third person, starting with a verb: `returns ...`, `handles ...`, `rejects ...`, `preserves ...`, `skips ...`. The `should ...` form appears in older unit suites (`deduplication.test.ts`).
- Integration suites split success and error paths into nested describes.

**Patterns:**
- **Setup/teardown:** `beforeAll` starts the server once per describe block and `afterAll` closes it (`tests/integration/health-models.test.ts`). `beforeEach` is used for per-test isolation of singletons (`resetConversationStore()` in `tests/unit/application-mock-mode.test.ts:17`) and fresh IndexedDB users (`tests/unit/primary-conversation-store.test.ts:17-27`).
- **Assertion pattern:** assert status first, then parse body once into `const body = await res.json()`, then assert shape/values - see `tests/integration/health-models.test.ts`.
- **Failure isolation:** `afterEach(() => { Object.assign(getReasoningConfig(), originalReasoningConfig); vi.restoreAllMocks(); })` (`tests/integration/responses-api.test.ts:44-47`) - config objects are mutated in place, so tests snapshot and restore them.

## Mocking

**Framework:** Vitest (`vi.fn`, `vi.spyOn`, `vi.stubGlobal`, `vi.restoreAllMocks`).

**Primary strategy: hand-written fakes, not module mocks.** `src/mock/mock-api.ts` exposes `createMockProtonApi(scenario)` which returns a `ProtonApi`-shaped function streaming fake SSE. Tests inject it directly, bypassing `Application`, auth, and `config.yaml`:

```typescript
const mockApi = createMockProtonApi('success');
const lumoClient = new LumoClient(mockApi, { enableEncryption: false });
```
(`tests/helpers/test-server.ts:63-64`)

Scenarios available (`MockConfig['scenario']` in `src/app/config.ts`): `success`, `error`, `timeout`, `rejected`, `toolCall`, `misroutedToolCall`, `weeklyLimit`, `cycle`.

**Inline fake transport for unit tests** - a fake API built from a handler function, no module mocking (`tests/unit/lumo-client.test.ts:23-28`):

```typescript
function makeClient(handler: (opts: ProtonApiOptions) => object[]) {
    const api = vi.fn(async (opts: ProtonApiOptions) => sseStream(handler(opts)));
    const client = new LumoClient(api as never, { enableEncryption: false });
    return { client, api };
}
```

**Spying on a real client** to force a deterministic stream (`tests/integration/responses-api.test.ts:25-39`):

```typescript
vi.spyOn(ts.deps.lumoClient, 'chatWithHistory').mockImplementation(
  async (_turns, onChunk, options = {}) => {
    onChunk?.(RESPONSE_TEXT);
    return { message: { content: RESPONSE_TEXT } };
  },
);
```

**Module mocking is the exception** - exactly one test uses `vi.mock`, and it uses `importOriginal` to keep the rest of the module intact (`tests/unit/application-mock-mode.test.ts:5-14`).

**Global stubbing** for network and process boundaries:
- `vi.stubGlobal('fetch', vi.fn(async () => ...))` for token refresh (`tests/unit/api-factory.test.ts`)
- `process.stdout.write`, `process.argv`, and `process.exit` are saved, replaced, and restored manually in `tests/e2e/cli-smoke.test.ts:24-52`

**What to Mock:**
- The Proton transport boundary (`ProtonApi` function, `fetch`) - anything that would hit `lumo.proton.me`
- Time-consuming collaborators on a real object via `vi.spyOn` when you need the rest of the real implementation
- `process.*` I/O in CLI tests

**What NOT to Mock:**
- Express, routers, `RequestQueue`, `LumoClient`, `ConversationStore` - integration tests build the real stack around the fake transport
- `src/app/config.ts` (one exception above); instead rely on `tests/setup.ts` + `initConfig(mode)`
- `src/logger.ts` - it is configured to be silent rather than mocked

## Fixtures and Factories

**Test Data:**
Factories are local functions inside the test file, returning typed objects:

```typescript
function createStoredMessage(role: string, content: string, index: number, semanticId?: string): Message {
  return {
    id: `msg-${index}`,
    conversationId: 'conv-1',
    createdAt: Date.now(),
    role: role as Message['role'],
    status: 'completed',
    content,
    semanticId: semanticId ?? hashMessage(role, content).slice(0, 16),
  };
}
```
(`tests/unit/deduplication.test.ts:14-28`)

Dependency fakes are cast through `any`/`as never` at the boundary and expose captured state for assertions:

```typescript
function createMockDeps(): EndpointDependencies & { persistedMessages: PersistedMessage[] } {
  const persistedMessages: PersistedMessage[] = [];
  return {
    persistedMessages,
    queue: {} as any,
    lumoClient: {} as any,
    conversationStore: {
      appendAssistantResponse: vi.fn((_id, messageData) => { persistedMessages.push(messageData); }),
    } as any,
  };
}
```
(`tests/unit/shared.test.ts:101-118`)

**Location:**
- No `fixtures/` directory. Reusable harness only: `tests/helpers/test-server.ts` (`createTestServer`, `parseSSEEvents`) and `src/mock/` (`createMockProtonApi`, `initializeMockStore`).
- Filesystem fixtures are created in `mkdtempSync(join(tmpdir(), '<name>-'))` and removed in `afterAll` (`tests/unit/file-reader.test.ts:29-40`, `tests/unit/config-file.test.ts`).
- Real `config.defaults.yaml` values are asserted directly, e.g. `expect(ids).toEqual(['lumo', 'lumo-lite', 'lumo-max'])` - changing defaults breaks integration tests by design.

## Integration Harness (`tests/helpers/test-server.ts`)

- Builds an Express app with the real routers: `createHealthRouter`, `createModelsRouter`, `createChatCompletionsRouter`, `createResponsesRouter`.
- Injects `EndpointDependencies` with `RequestQueue(1)`, `LumoClient(mockApi, { enableEncryption: false })`, `FallbackStore`, `syncInitialized: false`.
- No auth middleware is installed - tests target route logic.
- Listens on port `0` and returns `baseUrl`; `close()` shuts the server down and clears the metrics singleton.
- `parseSSEEvents(text)` splits on `\n\n`, reads `event:`/`data:` lines, and JSON-parses payloads (non-JSON values such as `[DONE]` are returned as strings). Use it for any streaming assertion.
- `options.metrics: true` wires `MetricsService` with `prefix: 'test_'` and the metrics router.

Unit-level store tests use `initializeMockStore({ userId, spaceId })` from `src/mock/mock-store.ts` for the primary Redux + IndexedDB store via `fake-indexeddb`, and `new FallbackStore()` for the in-memory store. Both are exercised in parallel suites (`tests/unit/primary-conversation-store.test.ts`, `tests/unit/conversation-store.test.ts`).

## Coverage

**Requirements:** None enforced. `vitest.config.ts` sets `coverage.include: ['src/**/*.ts']` and produces reports with `@vitest/coverage-v8`; there are no thresholds and no CI gate (no `.github/` workflows exist).

**View Coverage:**
```bash
npx vitest run --coverage
```

Note: `dist/`, `packages/` (vendored upstream), `src/tamer.ts` bootstrapping, and the Go helper are effectively untested.

## Test Types

**Unit Tests** (`tests/unit/`, ~24 files):
- Pure functions: converters (`message-converter.test.ts`), parsers (`tool-parser.test.ts`, `v2-stream.test.ts`, `json-brace-tracker.test.ts`), helpers (`prefix-helpers.test.ts`, `template.test.ts`, `model-tier.test.ts`), deduplication.
- Classes with injected fakes: `LumoClient`, `RequestQueue`, `MetricsService`, `ConversationStore`, `FallbackStore`, `CodeBlockDetector`, `NativeToolCallProcessor`, `StreamingToolDetector`, `JsonBraceTracker`.
- Tests reach into real implementations with `vi.spyOn` rather than reimplementing them.

**Integration Tests** (`tests/integration/`, 6 files):
- Real HTTP via global `fetch` against a real Express server on a random port.
- Files: `chat-completions-api.test.ts`, `responses-api.test.ts`, `model-tier-api.test.ts`, `health-models.test.ts`, `metrics.test.ts`, `error-handler.test.ts`.
- Streaming is asserted through `parseSSEEvents` and event-type sequences; some suites also parse raw `text` for wire formatting.
- `metrics.test.ts` currently builds its own Express app and `TestServer` interface rather than using `tests/helpers/test-server.ts` (duplication; prefer the helper when touching it).

**E2E Tests** (`tests/e2e/`, 2 files):
- `openai-sdk-streaming.test.ts` instantiates the official `openai` SDK against `createTestServer()` and asserts the Responses API event sequence (`EXPECTED_SEQUENCE`), delta concatenation, and error-free parsing.
- `cli-smoke.test.ts` constructs `CLIClient` with a hand-built `AppContext`, mocks `process.argv`/`stdout`/`exit`, and asserts mock-scenario output appears.
- No Go-binary, browser-auth, or Playwright tests are run by the suite.

## Common Patterns

**Async Testing:**
```typescript
it('processes one request at a time', async () => {
  const queue = new RequestQueue(1);
  const p1 = queue.add(async () => { /* ... */ });
  const [r1, r2] = await Promise.all([p1, p2]);
  expect(order).toEqual([1, 2, 3]);
});
```
(`tests/unit/queue.test.ts:12-35`)

Real timers are used with short sleeps (`await new Promise(r => setTimeout(r, 50))`); fake timers are **not** used anywhere. Tests that need ordering gates prefer an externally-resolved promise over sleeping where possible.

**Error Testing:**
```typescript
await expect(
  apiFactory.createProtonApi(),
).rejects.toMatchObject({ message: expect.stringContaining('...') });
```
(`tests/unit/api-factory.test.ts:17`)

HTTP error tests assert status and the OpenAI error envelope:
```typescript
const res = await postResponses(ts, { input: 'Hello', model: 'nope' });
expect(res.status).toBe(400);
const body = await res.json();
expect(body.error.code).toBe('model_not_found');
```
(`tests/integration/model-tier-api.test.ts`)

**Streaming Testing:** build the fake SSE body, call the endpoint with `stream: true`, read `await res.text()`, then `parseSSEEvents(text)` and assert on the `event`/`data` pairs (`tests/integration/responses-api.test.ts`, `tests/e2e/openai-sdk-streaming.test.ts`).

**CLI I/O Testing:** capture writes with a replacement `process.stdout.write`, restore originals in `afterAll`, and never let the code under test call the real `process.exit` (`tests/e2e/cli-smoke.test.ts:24-52`).

## Gaps and Caveats When Adding Tests

- Tests are **not type-checked**: `tsconfig.json` includes only `src/**/*` and `packages/**/*`, so `npm run build` (`tsc`) never compiles `tests/`. Errors surface only at Vitest transform time, and type-only imports can reference non-existent modules - `tests/e2e/cli-smoke.test.ts:12` imports `type { AppContext }` from `../../src/app/types.js`, a file that does not exist (`src/app/index.ts` implements the contract inline).
- No lint step and no CI, so test style (2- vs 4-space indentation) and dead helpers are not enforced. `tests/unit` is mostly 4-space; `tests/integration` is mostly 2-space - match the file.
- Untested areas worth coverage before refactoring: `src/auth/browser/authenticate.ts` (large, CDP-driven, only indirectly exercised), `src/conversations/fallback/sync/*` (encryption/sync paths), `src/api/tools/streaming-processor.ts` integration with real streams, `src/auth/vault/vault.ts` keytar paths, and `src/tamer.ts` command routing.
- Because `tests/setup.ts` loads `config.defaults.yaml`, any change to defaults can break integration assertions that hardcode model IDs or limits - run `npm test` after config changes.

---

*Testing analysis: 2026-11-06*
