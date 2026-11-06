# Requirements: lumo-tamer (stability fork)

**Defined:** 2026-11-06
**Core Value:** A long-running lumo-tamer server answers every API request correctly (right context, complete output, clean errors) and never wedges, so OpenAI-compatible clients can rely on it.

**Priority order (user decision):** REL first, then API, then CORR, then MAINT. Each requirement ships as its own small, upstream-ready PR with a regression test.

## v1 Requirements

### Reliability (REL)

- [ ] **REL-01**: Every Proton completion request has a configurable timeout; on timeout it fails with a clear error and frees its queue slot
- [ ] **REL-02**: When a client disconnects mid-stream, the upstream Proton request is aborted and its queue slot is freed
- [ ] **REL-03**: Request queue concurrency and max size are configurable; a full queue returns HTTP 429 instead of growing unbounded
- [ ] **REL-04**: A chunk that fails to decrypt mid-stream ends the response with an explicit error instead of a truncated 200
- [ ] **REL-05**: Server starts listening without blocking on remote space discovery, and the `store.dispatch` monkey-patch is restored once discovery completes early
- [ ] **REL-06**: Traffic-driven in-memory maps (`completedCallIds`, `semanticIdMap`, sync/space ID maps) stay bounded over a long-running process

### API Robustness (API)

- [ ] **API-01**: Malformed request bodies (invalid `tool_calls[].function.arguments` JSON, missing `function`, wrong types) return an OpenAI-style 400 with a useful message
- [ ] **API-02**: Route-level exceptions in `/v1/responses` and `/v1/chat/completions` are logged with message and stack via `logger.error({error}, ...)`

### Correctness (CORR)

- [ ] **CORR-01**: `POST /v1/auth/logout` succeeds with default config (sync disabled, fallback store) and with the primary store, and revokes the Proton session
- [ ] **CORR-02**: A `/v1/responses` request with `previous_response_id` or `conversation` sending only the new input reaches Lumo with the prior turns of that conversation
- [ ] **CORR-03**: With `enableSync: false`, the primary store makes no remote push/pull calls to Proton
- [ ] **CORR-04**: Message dedup with edited, inserted, or reordered client history neither re-appends already stored messages nor silently ignores changes

### Maintainability (MAINT)

- [ ] **MAINT-01**: Test files are typechecked (`npm run typecheck`) and existing test type errors are fixed
- [ ] **MAINT-02**: Docs/comments contradicting actual behavior in touched areas are corrected (`useFallbackStore` default, `prompt_tokensEstimated`, stale `BUG` comment in streaming tool detector, `previous_response_id` docs)

## v2 Requirements

Deferred to a future milestone.

- **CLI-01**: `/save` and `/load` work with the primary store
- **CLI-02**: CLI does not leak `close` listeners over long sessions (upstream issue #64)
- **PERF-01**: Title generation is opt-in or debounced so it does not double Proton calls
- **PERF-02**: Retry with backoff on Proton 429/5xx responses

## Out of Scope

| Feature | Reason |
|---------|--------|
| Security hardening (log redaction, `/health` auth, bind address, API key compare, CLI sandbox, Docker) | Not a priority for current use |
| rclone auth fixes | Not used |
| Adopting open upstream PRs (#79, #84, #91, #68, #65, #86, #94, #95) | Unmerged upstream for a reason; fix independently |
| Removing a conversation store stack | Too large for small PRs; fix bugs in place |
| New features (images, server tools, multi-account, rate limiting, releases) | Stability first |
| Dependency major upgrades | Stashed; handled separately by maintainer |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (filled by roadmap) | | |

---
*Requirements defined: 2026-11-06*
*Last updated: 2026-11-06 after initial definition*
