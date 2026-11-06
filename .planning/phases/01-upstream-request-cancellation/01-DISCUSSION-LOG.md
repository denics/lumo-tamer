# Phase 1: Upstream Request Cancellation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 01-upstream-request-cancellation
**Areas discussed:** Timeout semantics, Config & scope, Client response & persistence, Disconnect edge cases

---

## Timeout semantics

| Question | Options | Selected |
|----------|---------|----------|
| What the timeout measures | Idle + TTFB / Total deadline only / Idle + total cap / You decide | Idle + TTFB |
| Default | 60s / 30s / 120s / Other | 60s |
| Total cap | 10 min / 5 min / 30 min / N/A | N/A |
| Title request | Same timeout / Shorter fixed / You decide | Same timeout |

## Config & scope

| Question | Options | Selected |
|----------|---------|----------|
| Key location | Shared top-level / Server only / Separate | Shared |
| Unit | Seconds / Milliseconds / You decide | Seconds |
| Disable | 0 disables / Always on | 0 disables |
| Per-request override | No / Yes | No |

**Notes:** No top-level `lumo:` section exists; exact key placement left to planner.

## Client response & persistence

| Question | Options | Selected |
|----------|---------|----------|
| Timeout before streaming | 504 upstream_timeout / 502 / 500 | 504 |
| Timeout mid-stream | Existing error event + code / Silent close / You decide | Existing error event |
| Partial text | Drop / Persist incomplete / Persist normal | Drop |
| Observability | warn log + metric / log only / You decide | warn log + metric |

## Disconnect edge cases

| Question | Options | Selected |
|----------|---------|----------|
| Disconnected while queued | Skip at dequeue / Remove immediately / Run anyway | Skip at dequeue |
| Abort title request too | Yes / No | Yes |
| Non-streaming disconnect | Same as streaming / Streaming only | Same |
| CLI Ctrl-C | Out of scope / Wire abort | Out of scope |

## Claude's Discretion

- Signal threading and idle-timer mechanics, internal error type, metric naming, mock hang simulation.

## Deferred Ideas

- CLI Ctrl-C abort; immediate queue removal (Phase 2); total-duration cap.
