# Phase 1: Upstream Request Cancellation - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Proton completion requests made by `LumoClient` get an idle timeout and are aborted when the API client disconnects, so the single request queue slot is never held indefinitely. Covers REL-01 and REL-02. No queue sizing/429 (Phase 2), no decryption-failure handling (Phase 3), no CLI Ctrl-C handling.

Delivered as one small upstream-ready PR, branched from clean upstream `main`, with regression tests.

</domain>

<decisions>
## Implementation Decisions

### Timeout semantics
- **D-01:** The timeout is an **idle timeout**: the request fails if no data arrives from Proton for N seconds. This covers both time-to-first-byte (before the response/first chunk) and stalls mid-stream. The timer resets on every received chunk.
- **D-02:** **No total-duration cap.** Long reasoning / Max-tier answers that keep streaming are never cut off.
- **D-03:** Default idle timeout: **60 seconds**.
- **D-04:** The concurrent **title-generation** completion (`target: 'title'`) uses the same idle timeout.

### Config & scope
- **D-05:** One **shared** config key read by `LumoClient`, so both server and CLI modes are protected. Exact location/name is planner's choice following existing `config.defaults.yaml` structure (there is currently no top-level `lumo:` section; top-level sections are `auth`, `test`, `log`, `conversations`, `commands`, `server`, `cli`). Default lives only in `config.defaults.yaml` (CLAUDE.md rule), schema in `src/app/config.ts`.
- **D-06:** Unit is **seconds** (number), e.g. `idleTimeout: 60`.
- **D-07:** **`0` disables** the timeout. Documented in the `config.defaults.yaml` comment.
- **D-08:** **No per-request override** (no header/body field). Config only.

### Client response & persistence
- **D-09:** Timeout **before streaming has started** (headers not sent): respond **HTTP 504** with OpenAI-style body `{ error: { message, type: "server_error", param: null, code: "upstream_timeout" } }`. Add a helper next to `sendServerError` in `src/api/error-handler.ts`.
- **D-10:** Timeout **mid-stream**: use each endpoint's existing error event with `code: "upstream_timeout"`, then end the stream. Responses API: `ResponseEventEmitter.emitError` (`type: 'error'`), Chat Completions: `ChatCompletionEventEmitter.emitError` error chunk. Extend emitters to accept a code rather than hardcoding `server_error`.
- **D-11:** On timeout or abort, the **partial assistant text is dropped**: `persistAssistantTurn` / `persistTitle` are not called. The user turn already persisted before the call stays as is.
- **D-12:** Observability: log at **`warn`** with the cause (`timeout` vs `client_disconnect`) and increment a **metrics counter** if it fits the existing `MetricsService` (`src/app/metrics.ts`) naturally (e.g. a new counter with a `reason` label, or reuse of an existing one). Use `logger.warn({ ... }, msg)` style per CLAUDE.md.

### Disconnect edge cases
- **D-13:** Client disconnects **while its request is still waiting in the queue**: when its turn comes, **skip it** (no Proton call) so the slot goes immediately to the next request. Do not add queue-removal machinery (queue changes belong to Phase 2).
- **D-14:** Client disconnect **also aborts the concurrent title request**. One abort signal covers main + title completions.
- **D-15:** **Non-streaming** requests are treated the same as streaming: detect disconnect (response `close` before `finish` / `writableEnded`) and abort.
- **D-16:** **CLI Ctrl-C is out of scope.** The CLI only gets the idle timeout via the shared `LumoClient` behavior.

### Claude's Discretion
- How the abort signal is threaded (e.g. an `AbortSignal` option on `chatWithHistory()` combined internally with the idle timer via `AbortSignal.any` or an `AbortController`), and how the idle timer is reset in `processStream()`.
- Error type used to distinguish timeout vs client abort internally (e.g. a small `UpstreamTimeoutError` class).
- Exact metric name/labels, if a counter is added.
- How the mock API simulates a hang (a new scenario, or a test-only mock that never resolves and observes `signal`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & evidence
- `.planning/REQUIREMENTS.md` — REL-01, REL-02
- `.planning/ROADMAP.md` §Phase 1 — success criteria
- `.planning/codebase/CONCERNS.md` §Performance Bottlenecks "No upstream timeout or cancellation", §Missing Critical Features "Request cancellation and timeouts"
- `.planning/PROJECT.md` §Constraints — one PR per concern from clean upstream `main`, no edits under `packages/`

### Project conventions
- `CLAUDE.md` — config defaults only in `config.defaults.yaml`, logging via `src/logger.ts`, testing layout
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md`
- `docs/development.md` — dev/test workflow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/auth/api-factory.ts:48,89`: `protonApi` already destructures `signal` from options and passes it to `fetch`. No caller sets it yet.
- `src/api/error-handler.ts`: `sendInvalidRequest`, `sendServerError` (500, `code: null`). Add a 504 variant here.
- `src/api/routes/responses/events.ts:266` and `src/api/routes/chat-completions/events.ts:77`: existing `emitError(error)` on both SSE emitters (hardcoded `server_error`).
- `src/app/metrics.ts`: `MetricsService` with prom-client counters (`protonApiRequestsTotal` incremented in `api-factory.ts:57`).
- `src/mock/mock-api.ts`: mock Proton API with scenarios; existing `timeout` scenario is a Lumo error frame, NOT a hang, so a hanging scenario/mock is needed for tests.

### Established Patterns
- `LumoClient.runCompletion()` (`src/lumo-client/client.ts:242-292`) calls `protonApi({ url, method, data, output: 'stream' })` then `processStream()` (`:102`) reads with `stream.getReader()`.
- `chatWithHistory()` (`:300`) launches `titlePromise` concurrently (non-fatal, `.catch` → null) then awaits main completion.
- Routes wrap the call in `deps.queue.add(async () => deps.lumoClient.chatWithHistory(...))`: `src/api/routes/responses/request-handlers.ts:245`, `src/api/routes/chat-completions/index.ts:208`. Errors are caught there and sent via `emitter.emitError` (streaming) or `sendServerError` (non-streaming).
- Assistant persistence happens after success via `persistAssistantTurn` / `persistTitle` (shared in `src/api/routes/shared.ts`).
- `RequestQueue` (`src/api/queue.ts`) wraps `p-queue` with concurrency 1, created in `src/api/server.ts:21`.

### Integration Points
- Route handlers: create an `AbortController` per request, hook `res.on('close')` (only if response not finished), check `signal.aborted` at the start of the queued task (D-13), pass signal into `chatWithHistory`.
- `LumoClient`: accept signal, combine with idle timer, pass to `protonApi` for both main and title completions, reset timer per chunk in `processStream`, cancel reader on abort.
- Config: new key in `config.defaults.yaml` + schema in `src/app/config.ts` + getter.
- Tests: `tests/helpers/test-server.ts` + `createMockProtonApi()`; integration tests in `tests/integration/`.

</code_context>

<specifics>
## Specific Ideas

- Error code string: `upstream_timeout`.
- Default 60 s chosen because Lumo can sit in ingesting/queued state before the first token.

</specifics>

<deferred>
## Deferred Ideas

- CLI Ctrl-C aborting the in-flight request (D-16).
- Removing disconnected requests from the queue immediately rather than skipping at dequeue (fits Phase 2: Bounded Request Queue).
- Total-duration cap on completions (rejected for now, D-02).

</deferred>

---

*Phase: 01-upstream-request-cancellation*
*Context gathered: 2026-11-06*
