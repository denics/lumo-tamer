# lumo-tamer (stability fork)

## What This Is

lumo-tamer exposes an OpenAI-compatible API (`/v1/responses`, `/v1/chat/completions`) on top of Proton's Lumo assistant, plus an interactive CLI. This fork (`denics/lumo-tamer`) focuses on making the **server mode** stable enough for daily use, and contributes each fix back to upstream (`ZeroTricks/lumo-tamer`) as a small, self-contained PR.

## Core Value

A long-running lumo-tamer server answers every API request correctly (right context, complete output, clean errors) and never wedges, so OpenAI-compatible clients can rely on it.

## Requirements

### Validated

- ✓ OpenAI-compatible `/v1/responses` (streaming + non-streaming, reasoning output, usage forwarding) — existing
- ✓ OpenAI-compatible `/v1/chat/completions` with tool calls — existing
- ✓ Custom tool call detection in Lumo output, native tools (web search, weather), bouncing misrouted tools — existing
- ✓ Auth via login (Go SRP) and browser token extraction, with auto-refresh and 401 retry — existing
- ✓ In-memory conversation store with dedup; optional Proton-native sync (primary Redux store + fallback store) — existing
- ✓ Lumo 2.0 model tiers and thinking mode — existing
- ✓ Interactive CLI with local actions — existing
- ✓ Vitest suite (unit, integration, e2e with mock Proton API) — existing

### Active

Stability for server use. Each item ships as its own small upstream-ready fix with a regression test.

- [ ] `POST /v1/auth/logout` works with default config (no sync service) and revokes the session
- [ ] `/v1/responses` with `previous_response_id` / `conversation` sends prior turns to Lumo (or chaining is explicitly unsupported and docs say so)
- [ ] `enableSync: false` guarantees no remote sync calls from the primary store
- [ ] Message dedup handles edited/reordered history without duplicating persisted messages
- [ ] Proton requests have a timeout and are aborted when the client disconnects
- [ ] One stuck or slow request cannot block all other clients indefinitely (bounded queue, configurable concurrency)
- [ ] Decryption failures during streaming surface as an error, not a silently truncated 200
- [ ] Malformed request bodies (bad `tool_calls`, missing `function`) return OpenAI-style 400s, not 500s
- [ ] Route-level exceptions are logged with stack (`logger.error({error}, ...)`)
- [ ] Long-running process memory stays bounded (unbounded maps capped or cleaned)
- [ ] Server startup is not blocked for up to 25s by remote space discovery
- [ ] Stale/contradictory docs and comments touching the fixed areas are corrected
- [ ] Tests are typechecked so regressions in test code are caught

### Out of Scope

- Security hardening (log redaction, `/health` auth, bind address, API key checks, CLI sandboxing, Docker hardening) — not a priority for our use right now
- rclone auth — not used
- Adopting open upstream PRs (#79 remove FallbackStore, #84/#91 tool matching, #68, #65, #86, #94, #95) — unmerged for a reason; fixes are done independently in place
- Removing either conversation store stack — too large for small PRs; fix bugs in place
- CLI-only bugs (`/save`, `/load`, local actions) — server mode first; may revisit
- New features (image input, server tools, multi-account, rate limiting, per-client keys, npm/docker releases)
- Dependency upgrades (Express 5, TS 7, uuid 14, indexeddbshim 19, …) — stashed, handled separately by the maintainer
- Replacing `keytar` / moving `playwright` — dependency churn, not stability

## Context

- Brownfield: codebase mapped in `.planning/codebase/` (see `CONCERNS.md` for evidence and file references for each Active item).
- Upstream at `ZeroTricks/lumo-tamer`; fork `main` == upstream `main` at `0ef587b`.
- `packages/lumo` and `packages/proton` are synced Proton WebClients code: do not edit, use shims/config.
- Test baseline at mapping time: 33 files, 440 tests passing, ~33% statement coverage.
- Default config uses the fallback store (`useFallbackStore: true`) and `enableSync: false`; fixes must work on the default path first.
- Working tree has uncommitted dependency upgrades (`package.json`, `package-lock.json`, `tsconfig.json`, `src/api/message-converter.ts`); stash them before branching fixes.

## Constraints

- **Delivery**: One concern per branch/PR, branched from clean upstream `main`, small diff, regression test included — so each can be submitted upstream independently.
- **Upstream code**: No edits in `packages/lumo` or `packages/proton`.
- **Conventions**: Follow `CLAUDE.md`: defaults only in `config.defaults.yaml`, logging via `src/logger.ts` (`logger.error({error}, msg)`), no `console.log`, docs concise, no "—" in docs.
- **Compatibility**: Keep default config behavior unchanged unless the change is the fix itself.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Focus on server mode stability | That's how we use tamer | — Pending |
| Don't adopt open upstream PRs | Unmerged for reasons; avoid inheriting debated changes | — Pending |
| Small, independent PRs back to upstream | Keep fork close to upstream, easy review | — Pending |
| Stash uncommitted dependency upgrades, branch from clean `main` | Keeps fix PRs minimal and reviewable | — Pending |
| Skip security hardening and rclone for now | Not relevant to current use | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-06 after initialization*
