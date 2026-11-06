# Roadmap: lumo-tamer (stability fork)

## Overview

Make lumo-tamer's server mode stable enough for daily use by shipping one small, self-contained fix per phase. Each phase becomes its own upstream PR to `ZeroTricks/lumo-tamer`, branched from clean upstream `main`, with a regression test. The order is a user decision: first stop the server from wedging (REL), then harden the API surface (API), then fix correctness bugs on the default and primary-store paths (CORR), and finally clean up maintainability debt (MAINT).

**Delivery rules (apply to every phase):**
- Branch from clean upstream `main` (stash the uncommitted dependency upgrades first)
- One concern per branch/PR, small diff, regression test included
- No edits under `packages/lumo` or `packages/proton`
- New config keys get their defaults in `config.defaults.yaml` only
- Default config behavior unchanged unless the change is the fix itself

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Upstream Request Cancellation** - Proton completions time out and abort on client disconnect, freeing the queue slot
- [ ] **Phase 2: Bounded Request Queue** - Configurable queue concurrency and max size, 429 when full
- [ ] **Phase 3: Fail Loudly on Decryption Errors** - Undecryptable chunks end the response with an explicit error, not a truncated 200
- [ ] **Phase 4: Non-blocking Startup** - Server listens without waiting on remote space discovery; dispatch patch always restored
- [ ] **Phase 5: Bounded In-Memory Maps** - Traffic-driven maps stay bounded in long-running processes
- [ ] **Phase 6: Request Body Validation** - Malformed request bodies return OpenAI-style 400s instead of 500s
- [ ] **Phase 7: Route Error Logging** - Route-level exceptions are logged with message and stack
<!-- GSD stop point: phases 1-7 run through GSD; phases 8-13 are planned to be done with Lumo (budget) -->
- [ ] **Phase 8: Logout Without Sync** - `POST /v1/auth/logout` works with default config and the primary store
- [ ] **Phase 9: Responses Conversation Replay** - `previous_response_id` / `conversation` requests reach Lumo with prior turns
- [ ] **Phase 10: Honor enableSync for Primary Store** - `enableSync: false` means zero remote push/pull from the primary store
- [ ] **Phase 11: Order-Aware Message Dedup** - Edited, inserted, or reordered history neither duplicates nor silently drops changes
- [ ] **Phase 12: Typechecked Tests** - `npm run typecheck` covers test files and passes
- [ ] **Phase 13: Docs and Comments Accuracy** - Stale docs/comments in touched areas match actual behavior

## Phase Details

### Phase 1: Upstream Request Cancellation
**Goal**: A stalled Proton connection or a disconnected client can no longer hold the request queue slot indefinitely
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: REL-01, REL-02
**Combined because**: Both requirements share the same `AbortSignal` plumbing from the route through `LumoClient.chatWithHistory()` / `runCompletion()` into `protonApi({ signal })` (`src/lumo-client/client.ts`, `src/auth/api-factory.ts` already accepts `signal`). Splitting would produce two PRs touching the same lines.
**Success Criteria** (what must be TRUE):
  1. With a mock Proton API that never responds, a `/v1/chat/completions` or `/v1/responses` request fails after the configured timeout (key in `config.defaults.yaml`) with an OpenAI-style error, and the next queued request then starts
  2. When a streaming client closes the connection mid-response, the upstream Proton fetch receives an abort (observable on the mock's signal) and the next queued request starts without waiting for the abandoned stream to finish
  3. A timeout that fires mid-stream ends the SSE response with an explicit error event instead of leaving the connection hanging
  4. Requests that complete normally within the timeout behave exactly as before (existing test suite passes unchanged)
**Plans**: TBD

### Phase 2: Bounded Request Queue
**Goal**: One slow client cannot cause unbounded waiting or memory growth; the queue size and concurrency are operator-controlled
**Mode:** mvp
**Depends on**: Phase 1 (execution order; slot freeing from Phase 1 makes limits meaningful, but the PR branches from upstream `main`)
**Requirements**: REL-03
**Success Criteria** (what must be TRUE):
  1. Queue concurrency and max queue size are read from config (`config.defaults.yaml` holds defaults; default concurrency stays 1 so default behavior is unchanged)
  2. When the queue is full, a new completion request immediately receives HTTP 429 with an OpenAI-style error body and no Proton call is made
  3. With concurrency set to N > 1, N requests are processed in parallel (verified by an integration test with a slow mock)
**Plans**: TBD

### Phase 3: Fail Loudly on Decryption Errors
**Goal**: Clients never receive a silently truncated answer presented as success when a chunk fails to decrypt
**Mode:** mvp
**Depends on**: Phase 2 (execution order only)
**Requirements**: REL-04
**Success Criteria** (what must be TRUE):
  1. When the mock stream contains a chunk that fails to decrypt, a streaming request ends with an explicit error event (no further content, no normal completion event)
  2. The same failure on a non-streaming request returns an OpenAI-style error status instead of a 200 with partial content
  3. The failure is logged via `logger.error({ error }, ...)` and the queue slot is freed
  4. Streams with no decryption failures produce byte-identical output to before
**Plans**: TBD

### Phase 4: Non-blocking Startup
**Goal**: The server becomes reachable quickly even when remote space discovery is slow or failing
**Mode:** mvp
**Depends on**: Phase 3 (execution order only)
**Requirements**: REL-05
**Success Criteria** (what must be TRUE):
  1. With remote space discovery hanging, the server starts listening and `/health` responds without waiting for the 15s discovery timeout
  2. When remote spaces arrive before the timer fires, `store.dispatch` is restored to the original function immediately (test asserts identity after early completion), and also on timeout and failure paths
  3. Remote space discovery still completes in the background and its result is used once available (no regression for users with sync enabled)
**Plans**: TBD

### Phase 5: Bounded In-Memory Maps
**Goal**: A server running for months does not leak memory through traffic-driven maps
**Mode:** mvp
**Depends on**: Phase 4 (execution order only)
**Requirements**: REL-06
**Success Criteria** (what must be TRUE):
  1. After inserting more call IDs than the cap, `completedCallIds` size stays at or below the cap and recent IDs are still recognized
  2. `ConversationStore.semanticIdMap` entries are removed when their conversation is evicted from the LRU or deleted
  3. Sync/space ID maps (`SyncService.messageIdMap`, `SpaceManager.conversationIdMap`) drop entries when their conversation is deleted or evicted
  4. Any new caps are configured in `config.defaults.yaml`, and unit tests demonstrate bounded size under simulated long-running traffic
**Plans**: TBD

### Phase 6: Request Body Validation
**Goal**: Malformed client requests get actionable OpenAI-style 400 errors instead of generic 500s
**Mode:** mvp
**Depends on**: Phase 5 (execution order only)
**Requirements**: API-01
**Success Criteria** (what must be TRUE):
  1. A `/v1/chat/completions` request with invalid JSON in `tool_calls[].function.arguments` returns HTTP 400 with `type: invalid_request_error` and a message naming the offending field
  2. A request with a tool call missing `function`, or with wrong field types, returns HTTP 400 (not 500) on both `/v1/chat/completions` and `/v1/responses`
  3. Malformed requests are rejected before any side effects (no persistence, no queue entry, no Proton call)
  4. All existing valid-request tests still pass
**Plans**: TBD

### Phase 7: Route Error Logging
**Goal**: The hardest failures (route-level exceptions) are fully observable in logs
**Mode:** mvp
**Depends on**: Phase 6 (execution order only)
**Requirements**: API-02
**Success Criteria** (what must be TRUE):
  1. A forced exception inside the `/v1/responses` handler produces a log entry with the error message and stack under the `error` key
  2. The same holds for `/v1/chat/completions`
  3. The client still receives the existing OpenAI-style 500 response
**Plans**: TBD

### Phase 8: Logout Without Sync
**Goal**: Users can log out and revoke their Proton session via the API under any store/sync configuration
**Mode:** mvp
**Depends on**: Phase 7 (execution order only)
**Requirements**: CORR-01
**Success Criteria** (what must be TRUE):
  1. With default config (`enableSync: false`, fallback store), `POST /v1/auth/logout` returns success and the mock Proton session-revoke call is made
  2. With the primary store and `enableSync: true`, logout also succeeds and revokes the session
  3. With the fallback store and `enableSync: true`, pending auto-sync work is still handled on logout as before
  4. Route tests cover all three configurations
**Plans**: TBD

### Phase 9: Responses Conversation Replay
**Goal**: OpenAI Responses clients that send only the new input with `previous_response_id` or `conversation` get answers with full prior context
**Mode:** mvp
**Depends on**: Phase 8 (execution order only)
**Requirements**: CORR-02
**Success Criteria** (what must be TRUE):
  1. Request 1 followed by request 2 with `previous_response_id` set to request 1's response ID results in a Lumo payload (asserted on the mock) containing request 1's turns plus the new input
  2. A request with `conversation` set to a known conversation and only the new input reaches Lumo with that conversation's prior turns
  3. A client that resends full history along with `previous_response_id` does not get duplicated turns in the Lumo payload
  4. A request with an unknown `previous_response_id` gets a defined, tested behavior (OpenAI-style error or documented fallback), never a silent loss of context
**Plans**: TBD

### Phase 10: Honor enableSync for Primary Store
**Goal**: Users who disable sync get truly local-only storage with the primary store
**Mode:** mvp
**Depends on**: Phase 9 (execution order only)
**Requirements**: CORR-03
**Success Criteria** (what must be TRUE):
  1. With `useFallbackStore: false` and `enableSync: false`, startup plus several appended messages produce zero remote push/pull calls (test asserts no `LumoApi` network calls)
  2. Conversations are still persisted and retrievable locally in that configuration
  3. With `enableSync: true`, primary-store push/pull behavior is unchanged
**Plans**: TBD

### Phase 11: Order-Aware Message Dedup
**Goal**: Clients that edit, insert, or reorder history never accumulate duplicate persisted messages and never have their changes silently ignored
**Mode:** mvp
**Depends on**: Phase 10 (execution order only)
**Requirements**: CORR-04
**Success Criteria** (what must be TRUE):
  1. Stored `[A,B,C]` with incoming `[A,X,B,C]` does not re-append `B` and `C`
  2. Stored `[A,B,C]` with incoming `[B,A,C]` is detected as a divergence and handled per a defined policy (for example reset or branch), not silently returned as "no new messages"
  3. Plain continuation `[A,B,C]` to `[A,B,C,D]` appends only `D`, and repeated identical messages are still handled correctly
  4. The same dedup behavior holds in both the primary store and the fallback store
**Plans**: TBD

### Phase 12: Typechecked Tests
**Goal**: Type regressions in test code are caught before they hide runtime-breaking refactors
**Mode:** mvp
**Depends on**: Phase 11 (execution order only)
**Requirements**: MAINT-01
**Success Criteria** (what must be TRUE):
  1. `npm run typecheck` exists and typechecks both `src/` and `tests/`
  2. `npm run typecheck` exits 0 on the branch (existing test type errors fixed, e.g. `tests/setup.ts`, `tests/e2e/cli-smoke.test.ts`, `tests/helpers/test-server.ts`, `Role` literals)
  3. Introducing a deliberate type error in a test file makes `npm run typecheck` fail
  4. `npm test` still passes
**Plans**: TBD

### Phase 13: Docs and Comments Accuracy
**Goal**: Maintainers and users can trust docs and comments in the areas touched by this milestone
**Mode:** mvp
**Depends on**: Phase 9 (the `previous_response_id` docs describe behavior shipped there); executes after Phase 12
**Requirements**: MAINT-02
**Success Criteria** (what must be TRUE):
  1. `config.defaults.yaml` and `src/conversations/index.ts` comments state the actual `useFallbackStore` default
  2. The `prompt_tokensEstimated` description is removed from `src/api/routes/shared.ts` (or matches what is actually set)
  3. The stale `BUG: last 3 letters are dropped` comment in `src/api/tools/streaming-tool-detector.ts` is replaced by an accurate note on the 10-char holdback
  4. `docs/conversations.md` describes `previous_response_id` / `conversation` behavior as implemented in Phase 9, concisely and without "—"
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → ... → 13

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Upstream Request Cancellation | 0/TBD | Not started | - |
| 2. Bounded Request Queue | 0/TBD | Not started | - |
| 3. Fail Loudly on Decryption Errors | 0/TBD | Not started | - |
| 4. Non-blocking Startup | 0/TBD | Not started | - |
| 5. Bounded In-Memory Maps | 0/TBD | Not started | - |
| 6. Request Body Validation | 0/TBD | Not started | - |
| 7. Route Error Logging | 0/TBD | Not started | - |
| 8. Logout Without Sync | 0/TBD | Not started | - |
| 9. Responses Conversation Replay | 0/TBD | Not started | - |
| 10. Honor enableSync for Primary Store | 0/TBD | Not started | - |
| 11. Order-Aware Message Dedup | 0/TBD | Not started | - |
| 12. Typechecked Tests | 0/TBD | Not started | - |
| 13. Docs and Comments Accuracy | 0/TBD | Not started | - |
