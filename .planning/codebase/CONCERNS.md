---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
# Codebase Concerns

**Analysis Date:** 2026-11-06

Scope: `src/`, `scripts/`, `tests/`, and the `packages/lumo` + `packages/proton` upstream boundary. Synced upstream files under `packages/` are not edited directly; concerns there are about the sync process, patches, and shims.

Current state at time of analysis: `npx tsc --noEmit` passes, `npm test` passes (33 files, 440 tests), overall coverage is 33.22% statements / 27.44% branches. The working tree contains uncommitted major dependency upgrades (`package.json`, `package-lock.json`, `tsconfig.json`, `src/api/message-converter.ts`).

## Tech Debt

**Two parallel conversation stacks (duplicated logic):**
- Issue: Primary `ConversationStore` (`src/conversations/store.ts`) and deprecated `FallbackStore` (`src/conversations/fallback/store.ts`) duplicate append/dedup/toTurns/title logic. Sync is also duplicated: Redux sagas for the primary store and `SyncService` + `AutoSyncService` (`src/conversations/fallback/sync/`) for the fallback store.
- Impact: Fixes land in one stack only. Default config uses the deprecated stack (`useFallbackStore: true` in `config.defaults.yaml:81`), so the primary store is the less exercised path despite being documented as "the way forward" in `docs/conversations.md`.
- Fix approach: Finish migration and delete `FallbackStore` or generate both adapters from one interface with shared tests.

**Stale/contradictory comments and docs:**
- `config.defaults.yaml:78-81` says "When false (default)" but sets `useFallbackStore: true`.
- `src/conversations/index.ts:118` says fallback is used when `useFallbackStore` is false by default.
- `src/api/tools/streaming-tool-detector.ts:138` contains a `BUG: last 3 letters are dropped` comment with commented-out code; the actual behavior is a 10-char holdback (`keepChars = 10`), not a drop.
- `src/api/routes/shared.ts:121-144` documents a `prompt_tokensEstimated` flag that is never set (only `completion_tokensEstimated` exists, and tests assert the prompt flag is absent).
- `docs/conversations.md:162` says `previous_response_id` chains responses, but the server does not reconstruct history (see Known Bugs).
- Impact: Maintainers chase false bugs and rely on documented behavior that does not exist.

**Global singleton state and implicit construction:**
- `getSyncService()` (`src/conversations/fallback/sync/sync-service.ts:434`), `getAutoSyncService()` (`src/conversations/fallback/sync/auto-sync.ts:249`), `getKeyManager()`, `getFallbackStore()`, `getConversationStore()` (`src/conversations/index.ts:207`), and the metrics singleton (`src/app/metrics.ts:160`) are module-level. `getAutoSyncService()` calls `getSyncService()` internally and throws when sync was never initialized.
- Impact: Feature code cannot safely call these getters; lifecycle (logout, tests) must manually reset 6+ singletons. This is the root cause of the logout bugs below.

**Dead or unused production code:**
- `createFingerprint`, `fingerprintMessages`, `detectBranching` in `src/conversations/deduplication.ts` are only used by tests and the barrel export.
- `SyncService.deleteAllSpaces()` / `SpaceManager.deleteAllSpaces()` (`src/conversations/fallback/sync/space-manager.ts:283`) are unreachable but destructive if ever wired.
- `appendAssistantToolCalls()` in both stores is documented as unused.
- `src/auth/fetch-keys.ts` and `src/auth/vault/vault.ts` helpers (`isEncryptedVault`, `decryptVaultToJson`, `getKeySource`, `clearKeyCache`, `deleteVaultKey`) have no production callers.
- Metrics defined but never updated: `errorsTotal`, `warningsTotal`, `requestQueueSize` (`src/app/metrics.ts:28-35`). No `.set()` or `.inc()` exists outside tests.
- Impact: Misleading coverage, larger surface area, and metrics dashboards that silently show zeros.

**Tests are not typechecked:**
- `tsconfig.json` only includes `src/**/*` and `packages/**/*`. Running `tsc` with `tests/**/*` produces errors including a missing module `../../src/app/types.js` (`tests/e2e/cli-smoke.test.ts:12`), `initLogger` called with 2 args but declared with 1 (`tests/setup.ts:18-22`), wrong `Role` string literals across `tests/unit/conversation-store.test.ts`, and wrong helper signatures in `tests/helpers/test-server.ts:96`.
- Impact: Tests compile only because Vitest strips types. Runtime-breaking refactors can pass `npm test` while the test code is type-invalid.

**No lint/format/CI configuration:**
- No `.github/`, no ESLint/Biome/Prettier config, no `typecheck` or `lint` npm script. `package.json` scripts only build and run tests.
- Impact: Type errors, formatting, and test drift are caught only when a developer runs commands manually.

**Logging misuse:**
- `src/api/routes/responses/index.ts:151-152` and `src/api/routes/chat-completions/index.ts:146-147` call `logger.error(error)` with an `Error` object outside the `error`/`err` key. The pino config only registers a serializer for `error` (`src/app/logger.ts:44`), so these catch blocks likely log `{}` and lose the stack.
- Impact: Hardest failures (route-level exceptions) are the least observable.

**Fragile import path:**
- `src/api/message-converter.ts:11` imports `../../src/conversations/types.js`, which resolves to the same file but breaks if the file moves relative to the project root.
- Fix approach: use `../conversations/types.js`.

**Uncommitted dependency major upgrades:**
- `package.json` (uncommitted) bumps Express 4 to 5, TypeScript 5 to 7, uuid 9 to 14, dotenv 16 to 18, indexeddbshim 16 to 19, p-queue 8 to 9, openai 6 to 7, `@types/node` 20 to 26. `tsconfig.json` drops `moduleResolution: node` and `baseUrl`.
- Impact: The repository at HEAD and the working tree are materially different. Reproducing CI/user issues from a commit is ambiguous until this is committed and validated.

## Known Bugs

**`/logout` is broken by default (API and CLI):**
- `POST /v1/auth/logout` calls `getAutoSyncService()` unconditionally (`src/api/routes/auth.ts:40`). The CLI `/logout` command does the same (`src/app/commands.ts:288`). With default config (`enableSync: false`), no `AutoSyncService` and no `SyncService` exist, so `getAutoSyncService()` throws `SyncService not initialized - call with config first` (verified). The error is caught and returned as a 500 / "Logout failed" message, so the session is never revoked.
- Impact: Users cannot log out (nor revoke the Proton session) via API or CLI under default configuration. Same failure when sync is enabled but the primary store is active, because `initializeSync()` returns before creating a `SyncService` (`src/conversations/index.ts:280-288`).
- Fix approach: make auto-sync optional via `getAutoSyncService(..., ...)` lookup that returns null, or guard with a `hasAutoSyncService()` helper. Add route tests for logout with sync disabled and with the primary store.

**`/save` and `/load` fail with the primary store:**
- `handleSaveCommand` and `handleLoadCommand` call `getSyncService()` (`src/app/commands.ts:207`, `:242`), but the primary store path never creates a `SyncService` (sync is handled by sagas, `src/conversations/index.ts:280-288`).
- Impact: With `useFallbackStore: false` plus `enableSync: true`, `/save` returns "Save failed: SyncService not initialized" even though sync is active through sagas. `/load` has the same failure.
- Fix approach: implement these commands against the active store/saga actions, not `SyncService`, or create the `SyncService` object in the primary path.

**`/v1/responses` does not reconstruct conversation history:**
- `previous_response_id` is used directly as a conversation ID (`src/api/routes/responses/index.ts:77-79`), but each response ID is a fresh random UUID (`src/api/routes/shared.ts:158`). The handler passes only the turns from the current request into `chatWithHistory()` (`src/api/routes/responses/request-handlers.ts:260-270`). Nothing calls `conversationStore.toTurns()` on the server; only the CLI does (`src/cli/client.ts:65`).
- Verified behavior: request 1 without a conversation is stateless and not persisted; request 2 with `previous_response_id=resp-1` creates a new conversation keyed by `resp-1` containing only request 2's turns. Lumo sees only that turn.
- Impact: Clients that follow OpenAI semantics and send only the new item with `previous_response_id` (or `conversation`) lose all prior context. Persistence/sync still groups messages, so the stored conversation looks correct while the model never received the history. This contradicts `docs/conversations.md:162`.
- Fix approach: when a conversation ID is resolved, either rebuild turns from the store or explicitly document that clients must resend full history, and stop advertising chaining. Add an integration test that asserts the Lumo request payload contains prior turns.

**`enableSync: false` does not disable sync for the primary store (suspected, high impact):**
- `enableSync` is only checked in `initializeSync()` (`src/conversations/index.ts:263`). `initializeStore()` always creates `new LumoApi(sessionUid)` and starts the root saga (`src/conversations/init.ts:83`, `:104`), and `ConversationStore.appendMessages()` always dispatches `pushMessageRequest` (`src/conversations/store.ts:262`). The upstream sagas push/pull unless `state.ghostChat.isGhostChatMode` is set, and lumo-tamer never sets it (`packages/lumo/src/redux/sagas/conversations.ts:273-280`).
- Impact: With browser auth, `useFallbackStore: false`, and `enableSync: false`, conversations may still be fetched from and pushed to Proton. Users who intend local-only storage can leak conversations to the server, and `login`/`rclone` modes generate a stream of 418 responses from the fetch adapter.
- Fix approach: pass an explicit "remote sync enabled" flag into `initializeStore()` and either skip creating `LumoApi`/root push sagas or set ghost-chat mode when disabled. Add a test that asserts no `lumoApi` calls occur with sync disabled.

**Message deduplication mishandles edited or reordered histories:**
- `findNewMessages()` builds a `Set` of stored semantic IDs and counts positional matches by set membership (`src/conversations/deduplication.ts:79-95`), rather than comparing the stored prefix to the incoming prefix.
- Verified behavior: stored `[A,B,C]` with incoming `[A,X,B,C]` returns `[X,B,C]`, so `B` and `C` are appended again. Incoming `[B,A,C]` returns `[]` even though the history changed. Identical repeated messages remain correct only because the loop is bounded by `stored.length`.
- Impact: Clients that edit, branch, or reorder history accumulate duplicate persisted messages, which sync to Proton and pollute future context. `isValidContinuation()` warns but the code intentionally continues (`src/conversations/store.ts:216-230`).
- Fix approach: switch dedup to longest-common-prefix matching on ordered semantic IDs, and treat divergence as a branch (reset or fork the stored conversation).

**rclone base64 validation is ineffective:**
- `src/auth/rclone/parser.ts:75-80` wraps `Buffer.from(..., 'base64')` in try/catch, but `Buffer.from` does not throw on invalid base64; it silently produces garbage bytes. A corrupted `client_salted_key_pass` becomes an invalid `keyPassword` and only fails much later during PGP key decryption.
- Fix approach: validate canonical base64 and decoded length before accepting, and report a targeted error.

**Vault decryption error detection depends on OpenSSL text:**
- `src/auth/vault/vault.ts:84` detects wrong keys by matching `err.message.includes('Unsupported state')`. Node/OpenSSL versions use different wording ("Unsupported state or unable to authenticate data", "Unsupported state", etc.).
- Impact: Wrong-key or corrupted-vault errors surface as raw crypto errors instead of the intended actionable message.
- Fix approach: treat any `decipher.final()` failure as an authentication failure, or inspect the error code.

## Security Considerations

**Auth tokens are written to debug logs:**
- `src/auth/providers/browser.ts:74-75` logs `setCookieHeaders` from the refresh response, which contain `AUTH-{uid}` (access token) and `REFRESH-{uid}` (refresh token) values. `:105` logs the refresh response JSON on failure.
- `src/auth/browser/authenticate.ts:163` logs up to 200 characters of Proton error bodies, which can include session details.
- `src/auth/token-refresh.ts:57` logs up to 200 characters of the refresh error body.
- `src/conversations/fallback/sync/encryption-codec.ts:72` logs the full decrypted JSON of synced messages at debug level, bypassing `log.messageContent`.
- `src/api/tools/native-tool-call-processor.ts:133,140` logs raw native tool call/result JSON (for example web search results).
- `src/app/commands.ts:59` logs full command text and command responses.
- Impact: A single debug session or shipped debug log can expose the Proton session, mailbox-derived key password material, and conversation contents. Pino is configured without `redact` (`src/app/logger.ts:39-46`).
- Fix approach: add pino `redact` paths for tokens/cookies, never log `Set-Cookie`, move decrypted-content logging behind `log.messageContent`, and add a test that asserts tokens do not appear in captured logs.

**Unauthenticated health and metrics endpoints:**
- `src/api/middleware.ts:10` skips API-key auth for `/health` and `/metrics`. `/health` returns auth `details` (method, uid prefix, expiry, key availability), `warnings`, `lastRefreshFailure.error` (raw Error.message), failure counts, and queue sizes (`src/api/routes/health.ts:6-18`, `src/auth/manager.ts:191-208`). The manager comment explicitly flags that Proton error text may leak token fragments.
- Impact: Network-adjacent attackers can fingerprint the account, learn session state, and read operational metrics without credentials. Combined with the default bind to all interfaces (see below), this is exposed beyond localhost.
- Fix approach: require the API key for `/health` details (or return only `{status:"ok"}`), keep `/metrics` on a separate authenticated listener, and whitelist the fields returned by `getHealth()`.

**Weak server exposure defaults:**
- `src/api/server.ts:79` calls `listen(port)` with no host, binding all interfaces. `config.defaults.yaml:101` ships `apiKey: "your-secret-api-key-here"`, and validation only enforces non-empty (`src/app/config.ts:141`). The key is compared with `!==` rather than a constant-time compare (`src/api/middleware.ts:14-15`), and `replace('Bearer ', '')` accepts the token anywhere in the header value.
- Impact: A user who starts the server without editing `config.yaml` exposes a well-known credential on every interface. No rate limiting or TLS exists.
- Fix approach: bind `127.0.0.1` by default (configurable host), refuse startup when the placeholder key is unchanged, use `crypto.timingSafeEqual`, and document a reverse-proxy requirement.

**CLI local actions are an exfiltration and code-execution surface:**
- `src/cli/local-actions/file-reader.ts` reads any path without confirmation (`requiresConfirmation: false`, `readHandler`), up to `fileReads.maxFileSize`. `src/cli/local-actions/file-creator.ts` and `src/cli/local-actions/edit-applier.ts` write any path from `=== FILE:` headers, with only a yes/no confirmation. `src/cli/local-actions/code-executor.ts` runs model-provided text through configured executors (`bash -c`, `python -c`).
- Impact: Prompt injection in model output or tool results can read `~/.ssh/id_rsa`, `~/.config/rclone/rclone.conf`, environment files, and send them to Proton, or overwrite files and run commands if the user confirms a malicious block. There is no working-directory sandbox, path allowlist, or denylist.
- Current mitigation: writes and execution require confirmation; file reads are automatic by design (`docs/local-actions.md`).
- Fix approach: sandbox reads to the project root by default, show the absolute resolved path in confirmations, deny symlinks/`..` escapes, and require explicit confirmation categories per action.

**Vault key lifecycle gaps:**
- `deleteVaultKey()` exists (`src/auth/vault/key-provider.ts:146`) but logout only deletes the vault file (`src/auth/logout.ts:60-68`). The key remains in the OS keychain, and `cachedKey` stays in memory until process exit.
- The key file fallback does not check permissions; a world-readable `/run/secrets/lumo-vault-key` mount works silently.
- `writeVault` correctly uses `mode: 0o600` for the temporary file and atomic rename (`src/auth/vault/vault.ts:124-131`), but the parent directory is created with default permissions (`mkdirSync(dir, { recursive: true })`).
- Fix approach: delete the keychain entry on logout (or offer `--purge-key`), warn when the key file is group/world-readable, and create the vault directory with `0o700`.

**Browser container is effectively an unauthenticated remote-control surface:**
- `docker-compose.yml` publishes CDP on `9222` and VNC on `3001`, passes `--remote-debugging-allowed-origins=*`, and disables seccomp (`security_opt: seccomp:unconfined`). Anything that reaches the CDP port can read the logged-in Proton session or drive the browser.
- Impact: Exposing the optional browser service to a LAN or the internet compromises the Proton account.
- Fix approach: bind CDP/VNC to localhost, require a CDP token or network policy, and document the risk inline.

**API key copied into container environment:**
- The optional `open-webui` service in `docker-compose.yml` extracts `apiKey` from `config.yaml` into `OPENAI_API_KEYS` via the entrypoint. Docker environment variables are visible through `docker inspect` and container introspection.
- Fix approach: mount the config read-only and let the client read it, or use Docker secrets.

## Performance Bottlenecks

**All requests are serialized through one global queue:**
- `src/api/server.ts:21` creates `new RequestQueue(1)`. Every `/v1/responses` and `/v1/chat/completions` call, including long streaming responses, occupies the only slot (`src/api/routes/*/request-handlers.ts` and `index.ts` call `deps.queue.add(...)`).
- Impact: One slow client or one hung Proton request blocks every other client. Throughput is one conversation completion at a time. The queue is also unbounded (default `p-queue` max size is Infinity), so waiting requests accumulate in memory.
- Improvement path: make concurrency and queue size configurable, or serialize per conversation rather than globally, and enforce a queue limit with 429 responses.

**No upstream timeout or cancellation:**
- `LumoClient.runCompletion()` calls `protonApi({...})` without a `signal` and without an `AbortSignal.timeout` (`src/lumo-client/client.ts:255-275`). `src/auth/api-factory.ts` supports `signal`, but no caller sets one. Client disconnects are not observed in the SSE handlers (`src/api/routes/chat-completions/events.ts`, `src/api/routes/responses/events.ts`).
- Impact: A stalled Proton connection blocks the single queue slot indefinitely; disconnected clients keep burning upstream quota and hold the slot.
- Improvement path: add request timeouts, propagate `req.on('close')` to abort the upstream fetch, and cancel SSE writes after disconnect.

**Slow startup in primary-store mode:**
- `initializeStore()` waits up to 10s for IndexedDB and 15s for remote spaces before the server listens (`src/conversations/init.ts:116`, `:123-166`). `waitForRemoteSpaces()` also monkey-patches `store.dispatch` and leaves the patch installed until the 15s timer fires even when the fetch succeeds early (`src/conversations/init.ts:201-212`).
- Impact: Startup can take 25s, and a network failure delays the server with only a warning. Docker health checks or orchestration may mark the container unhealthy.
- Improvement path: decouple server listen from remote-space discovery, use configurable timeouts, and restore the original dispatch in all completion paths.

**Extra Proton completion per new conversation:**
- Every request for an untitled conversation launches a concurrent title completion (`src/lumo-client/client.ts:319-332`).
- Impact: Doubles Proton request volume and quota use for the first turn of each conversation, and adds a second encrypted stream per request.
- Improvement path: make title generation opt-in or debounce it, and skip it for stateless requests (already partially done via `requestTitle`).

**Unbounded in-memory maps in long-lived processes:**
- `completedCallIds` (`src/api/tools/call-id.ts:39`) grows forever. `ConversationStore.semanticIdMap` (`src/conversations/store.ts:115`), `SyncService.messageIdMap` and `SpaceManager.conversationIdMap` (`src/conversations/fallback/sync/`), and `KeyManager.spaceKeys` (`src/conversations/key-manager.ts:78`) are never evicted or cleared on conversation deletion.
- Impact: Memory grows with traffic and conversation count. For a server intended to run for months, this is a slow leak.
- Improvement path: bound/LRU these maps, clear entries on conversation deletion, and add a metric or admin endpoint for map sizes.

**Sync pushes messages one at a time:**
- `SyncService.syncConversation()` awaits each `postMessage` sequentially (`src/conversations/fallback/sync/sync-service.ts:250-300`). Large conversations take one network round trip per message.
- Improvement path: batch or pipeline pushes (respecting Proton rate limits), and persist the remote ID map so restarts do not resend.

**Per-character stream parsing:**
- `JsonBraceTracker.feedWithRemainder()` appends one character at a time (`src/api/tools/json-brace-tracker.ts:40-85`), and `StreamingToolDetector` keeps a trailing 10-character buffer (`src/api/tools/streaming-tool-detector.ts:128-136`).
- Impact: Large tool arguments or long JSON blocks cause repeated string growth and copying, and the 10-character holdback adds latency at the end of streams.
- Improvement path: index-based scanning over chunks and emit all but a small suffix using slices.

## Fragile Areas

**Upstream sync boundary:**
- `scripts/upstream/sync.sh` is the only mechanism keeping `packages/lumo` and `packages/proton` current. It downloads from the moving `main` branch with no pinning, copies files wholesale, then applies four patches. Patch conflicts leave `<<<<<<<`/`>>>>>>>` markers in source (`scripts/upstream/sync.sh:400-440`).
- `scripts/upstream/sync.sh` uses GNU-only tools: `grep -oP` (`:140`, `:235-236`), `sha256sum` (`:267`, `:361`), and `sed -i` without a backup suffix (`:476-477`). Verified on this macOS workstation: `grep -oP` fails and `sed -i` fails, so `npm run sync-upstream` aborts before syncing.
- The docs update in `sync.sh:476-477` is a no-op: `docs/upstream.md` has no `**Commit:**` or `**Sync Date:**` lines, so only `scripts/upstream/last-sync-commit` records the upstream revision.
- Shims are partial reimplementations. `packages/proton/src/crypto/lib/proxy/proxy.ts` replaces Proton's worker-based `CryptoProxy` with the standard `openpgp` package; semantic drift can silently change encryption/decryption behavior.
- Local patches change upstream IndexedDB transaction semantics (`packages/lumo/patches/indexedDb-db.patch`, 285 lines), which is exactly the code path used for persistence.
- There is no CI job that runs sync or verifies patches still apply. Patches currently reverse-apply cleanly, but that is only checked manually.
- Safe modification: run sync on Linux, diff `packages/` before committing, and add a CI job that applies patches to a clean upstream checkout and runs the test suite.

**IndexedDB shim is a single-process SQLite bridge:**
- `src/shims/indexeddb-polyfill.ts` configures `indexeddbshim` with `databaseBasePath` and truncates escaped database names to 24 characters. The primary store depends on this for all local persistence; it is not safe for two lumo-tamer processes sharing `sessions/`.
- The polyfill throws at import time if `databasePath` does not exist or is not writable (`src/shims/indexeddb-polyfill.ts:27-42`).
- Safe modification: run one process per `sessions/` directory, and treat database files as critical state (back up before changing the polyfill version).

**Conversation migration and ID mapping:**
- Conversation IDs are session-scoped (`SESSION_ID` in `src/app/id-generator.ts`). Restarting changes IDs for `conversation`, `user`, and `previous_response_id` inputs. `semanticIdMap` is in-memory only, so tool-call semantic IDs cannot be recovered after restart (`src/conversations/store.ts:100-115`).
- Impact: After a restart, dedup falls back to content hashes, and clients that reuse conversation identifiers get new conversations; remote sync identity depends on what happened before the restart.
- Safe modification: persist semantic IDs with messages or derive them deterministically, and document restart semantics.

**Streaming decryption drops data silently:**
- On a decryption error, `LumoClient.processStream()` logs and drops the chunk (`src/lumo-client/client.ts:123-137`). A partial key rotation or corrupt chunk produces a truncated answer with a 200 status.
- Safe modification: track dropped chunks and fail the stream (or emit an explicit error event) when any chunk fails to decrypt.

**Streaming tool detection is heuristic:**
- `StreamingToolDetector` treats any code fence as a potential tool call, re-emits invalid fences with normalized formatting, and buffers the last 10 chars (`src/api/tools/streaming-tool-detector.ts`). Multiple raw JSON objects in one chunk can lose text between them because `JsonBraceTracker.feedWithRemainder()` only returns the remainder after the last complete object (`src/api/tools/json-brace-tracker.ts:86-92`).
- Safe modification: add property-based tests for chunk boundaries and interleaved text/JSON, and do not rewrite non-tool fences.

**Global fetch replacement:**
- `installFetchAdapter()` replaces `globalThis.fetch` (`src/shims/fetch-adapter.ts:139-150`) and returns a cleanup. Only the first call path is supported; a second `Application.create()` in the same process would overwrite the adapter and confuse the cleanup.
- Safe modification: install once during bootstrap, fail if already installed, and avoid global mutation in tests.

**Mock mode depends on a dev dependency:**
- `src/mock/mock-store.ts:11` imports `fake-indexeddb/auto`, but `fake-indexeddb` is in `devDependencies`. The Docker build runs `npm prune --production` (`Dockerfile:36`), so mock mode with the primary store cannot start in a production image.
- Safe modification: move `fake-indexeddb` to `dependencies` if mock mode must work in containers, or fail fast with a clear message.

## Scaling Limits

**Single process, single account:**
- One vault (`sessions/vault.enc`) and one auth provider are process-global. There is no multi-user or multi-account isolation.
- Current capacity: one Proton account per server process, one queued request at a time (`src/api/server.ts:21`), 100 conversations in the fallback store (`src/conversations/fallback/store.ts:36`).
- Limit: A second tenant requires a second process, and the shared `sessions/` SQLite database cannot be shared safely.
- Scaling path: introduce per-principal context objects (vault, LumoClient, store) and a per-principal queue; or document the single-account model explicitly.

**Proton backend limits:**
- Project conversation limits are known and documented (`docs/conversations.md:149-151`, README warning): once hit, sync fails with HTTP 422 and deleting conversations does not help. `weeklyLimit` mock scenario models HTTP 429 with Code 2028 (`src/mock/mock-api.ts:154-158`).
- Limit: No retry/backoff or user-facing quota handling beyond propagating the error. A 429 from Proton blocks the queue until timeout (there is no timeout).
- Scaling path: add retry with jitter for 429/5xx, surface quota state from `LumoUsage.remaining_limits`, and fail fast with 429 + Retry-After.

**Fallback store eviction:**
- `FallbackStore` force-evicts dirty conversations when all 100 entries are dirty (`src/conversations/fallback/store.ts:480-496`).
- Limit: Under sustained traffic with sync failing, dirty conversations are silently dropped and their messages are lost.
- Scaling path: spill to disk or block new conversations with a clear error instead of force-evicting.

## Dependencies at Risk

**`keytar` (`package.json`):**
- Risk: Native module, archived upstream, required for vault key storage on desktop. Loaded lazily (`src/auth/vault/key-provider.ts:19-29`), so failures are silent and the app falls back to a key file.
- Impact: Desktop users without a working native build get "no secure storage" errors at first auth; Docker builds may or may not build the native module.
- Migration plan: move to `@napi-rs/keyring` or a platform-specific secret store abstraction with an explicit fallback chain.

**`playwright` in production dependencies:**
- Risk: Only needed for the optional browser auth method (`src/auth/browser/authenticate.ts`), but it is a regular dependency pinned to `^1.41.0`, an old line. Installing it downloads browsers unless skipped, inflating the Docker image and CI install time.
- Impact: Container builds and installs are much larger than necessary; CDP compatibility with current Chrome versions is not guaranteed at 1.41.
- Migration plan: move to `optionalDependencies` or `peerDependencies`, pin a current version, and document `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` for server images.

**`indexeddbshim` major upgrade (16 to 19) in progress:**
- Risk: This package underpins all primary-store persistence and is currently uncommitted at a new major. Behavior changes can affect the patched upstream `DbApi`.
- Impact: Data corruption or transaction failures if the shim's transaction/auto-commit behavior differs from what the patches assume.
- Migration plan: commit the upgrade separately with a migration test that opens an existing `sessions/*.sqlite` database and round-trips conversations.

**Uncommitted Express 5 / TypeScript 7 / uuid 14 upgrades:**
- Risk: Major runtime and toolchain changes with no CI, no lockfile review, and no typecheck of tests.
- Impact: Production behavior differences (Express 5 error/async handling, router path semantics) may be untested. `uuid` 14 and `@types/uuid` 10 are both present, which is redundant.
- Migration plan: split into one dependency per commit, run the full test suite plus a manual server smoke test, and remove `@types/uuid` if uuid ships types.

**Unpinned upstream WebClients:**
- Risk: `scripts/upstream/sync.sh` follows `main`. `APP_VERSION` in `packages/lumo/src/config.ts` is manually pinned to `5.0.0` and only warned about on change. Proton protocol changes (encryption params, SSE shape, IndexedDB schema) can break the proxy between syncs.
- Impact: Silent breakage in U2L encryption or sync after an upstream change.
- Migration plan: record the synced commit in `docs/upstream.md` and a build-time constant, pin to a tagged upstream release where possible, and add a compatibility test against known SSE fixtures.

**`openai` in production dependencies:**
- Risk: Used only by `tests/e2e/openai-sdk-streaming.test.ts`, but installed in production and pruned from Docker only via `npm prune`.
- Impact: Unnecessary production dependency and supply-chain surface.
- Migration plan: move to `devDependencies`.

## Missing Critical Features

**Server-side conversation replay:**
- Problem: The server persists conversations but never reads them back to build the Lumo request (`src/api/routes/responses/request-handlers.ts`, `src/api/routes/chat-completions/index.ts`). Only the CLI replays (`src/cli/client.ts:65`).
- Blocks: True OpenAI Responses chaining, stateful small clients (Home Assistant, voice assistants) that send only the newest utterance, and any "Lumo remembers" behavior promised by sync.

**Request cancellation and timeouts:**
- Problem: No abort signal or timeout on Proton requests; SSE handlers do not observe client disconnect.
- Blocks: Safe operation behind flaky networks, bounded queue latency, and cost control.

**Input validation for API bodies:**
- Problem: `src/api/types.ts` is compile-time only. Routes manually check a few fields. Client-controlled `tool_calls[].function.arguments` is passed to `JSON.parse` without guards (`src/api/message-converter.ts:84`, `:104`, `:224`), and a missing `function` object throws a `TypeError`.
- Blocks: Returning OpenAI-style 400 errors for malformed requests; currently these become generic 500s via the outer catch.
- Fix approach: validate request bodies with zod schemas at the route boundary, or guard every JSON.parse and return `sendInvalidRequest`.

**Rate limiting and per-client identity:**
- Problem: A single shared API key, no per-client keys, no request quotas, no usage attribution.
- Blocks: Safe exposure to multiple users or untrusted clients, cost controls, and abuse investigation.

**Container hardening:**
- Problem: `Dockerfile` runs as root with no `USER` directive and no healthcheck; `Dockerfile.browser` explicitly disables seccomp.
- Blocks: Passing basic container security baselines (non-root, read-only root filesystem, dropped capabilities).

**Multi-account support:**
- Problem: One vault, one auth provider, one store per process (`src/app/index.ts`).
- Blocks: Hosting one instance for multiple Proton accounts.

## Test Coverage Gaps

**Overall coverage (from `npx vitest run --coverage`):**
- Statements 33.22%, branches 27.44%, functions 36.05%, lines 33.74% across `src/` and `packages/`.

**Authentication is effectively untested (about 12% statements):**
- `src/auth/vault/vault.ts` 4.76%, `key-provider.ts` 4.16%, `src/auth/browser/authenticate.ts` 0%, `src/auth/login/*` 0%, `src/auth/rclone/*` 0%, `token-refresh.ts` 0%, `manager.ts` 0%, `logout.ts` 0%, `session-keys.ts` 0%, `providers/provider.ts` 2.22%, `providers/browser.ts` 2.77%.
- Risk: Vault corruption, wrong-key handling, refresh cookie parsing, 401 retry, and logout regressions are invisible to tests. The logout bug above would have been caught by a single test.
- Priority: High.

**Conversation persistence and sync are barely tested:**
- `src/conversations/init.ts` 0%, `key-manager.ts` 2.85%, `fallback/sync/sync-service.ts` 2.08%, `space-manager.ts` 1.65%, `encryption-codec.ts` 3.57%, `auto-sync.ts` 4.16%, `src/conversations/index.ts` 9.58%.
- Risk: ID mapping, encryption AD construction, space lookup, and auto-sync scheduling can break silently and potentially corrupt remote data.
- Priority: High.

**API server and auth routes are untested:**
- `src/api/server.ts` 0%, `src/api/routes/auth.ts` 0%. The test server intentionally omits auth middleware (`tests/helpers/test-server.ts:70-72`), so API-key enforcement, constant-time comparison, and the `/health`/`/metrics` bypass are never exercised.
- Risk: Auth bypass and broken logout endpoints ship undetected.
- Priority: High.

**CLI local actions:**
- `src/cli/local-actions/edit-applier.ts` 2.5%, `file-creator.ts` 6.25%, `confirm.ts` 0%, `block-handlers.ts` 3.03%, `code-executor.ts` 26.31%.
- Risk: Path handling, partial edit application, and skip-all behavior are under-tested on a feature that writes files and runs commands.
- Priority: Medium.

**Commands:**
- `src/app/commands.ts` 9.4% statements / 7.96% lines. `/save`, `/load`, `/title`, `/logout`, and `/refreshtokens` paths are mostly untested.
- Risk: The `/save` and `/logout` failures above are not covered.
- Priority: High.

**Shims and adapters:**
- `src/shims/fetch-adapter.ts` 3.33%, `indexeddb-polyfill.ts` 0%. These are the compatibility boundary with upstream code and the highest-risk place for subtle regressions.
- Priority: Medium.

**Test infrastructure gaps:**
- Tests import the real `config.yaml` via `initConfig()` (`tests/setup.ts:15`), so a developer's local config can change test behavior. There is no env-based config override or temp config isolation.
- Tests call `initConfig()` again in individual files (`tests/unit/file-reader.test.ts:17`, `tests/unit/code-block-detector.test.ts:16`), mutating global config and making order dependence possible.
- E2E tests use only the mock Proton API; no test exercises real SSE fixtures with encryption or an actual `previous_response_id` chain.
- No test asserts that `enableSync: false` prevents remote calls, and no test runs the server with the auth middleware enabled.

---

*Concerns audit: 2026-11-06*
