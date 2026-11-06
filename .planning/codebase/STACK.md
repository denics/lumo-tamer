---
last_mapped_commit: 0ef587b7f3d5d5165914602f0cc79bdfe7ee4e30
last_mapped_at: 2026-11-06
---
# Technology Stack

**Analysis Date:** 2026-11-06

## Languages

**Primary:**
- TypeScript (ES2022 target/module, `strict: true`) - All application code in `src/`, tests in `tests/`, and synced upstream code in `packages/`
- Go 1.24 - Proton SRP login helper at `src/auth/login/go/main.go`, built to `dist/proton-auth`

**Secondary:**
- YAML - Configuration in `config.defaults.yaml`, `config.yaml`, and `docker-compose.yml`
- Bash - Upstream sync tooling in `scripts/upstream/sync.sh`, `scripts/upstream/create-patch.sh`
- Dockerfile - Multi-stage container builds in `Dockerfile` and `Dockerfile.browser`
- JSON - Grafana dashboard `grafana-lumo-tamer-dashboard.json`, `package.json`, `tsconfig.json`

## Runtime

**Environment:**
- Node.js, ESM (`"type": "module"` in `package.json`)
- Docker production image uses `node:22-alpine` (`Dockerfile`)
- README documents Node.js 18+ (`README.md`); local development environment observed Node.js 26.13.0
- No `engines` field declared in `package.json`

**Package Manager:**
- npm 11.x (observed 11.20.0)
- Lockfile: `package-lock.json` present
- Workspaces: `packages/*` (`packages/lumo` as `lumo-node`, `packages/proton` as `proton-node`)
- Binary entry: `tamer` -> `dist/src/tamer.js` (`package.json`)

## Frameworks

**Core:**
- Express 5.2.1 - HTTP API server in `src/api/server.ts`
- Zod 4.6.5 - Runtime configuration validation in `src/app/config.ts`
- Pino 10.3.1 - Structured logging in `src/app/logger.ts` (with `pino-pretty` 13.1.3)
- p-queue 9.3.3 - Serial request queue (concurrency 1) in `src/api/queue.ts`
- Handlebars 4.7.9 - Instruction template interpolation in `src/app/template.ts`
- Redux Toolkit 2.12.0 + redux-saga 1.5.1 - Upstream conversation state store in `src/conversations/init.ts` and `packages/lumo/src/redux/`
- Playwright 1.63.0 - Chromium CDP client for browser token extraction in `src/auth/browser/authenticate.ts`
- prom-client 15.1.3 - Prometheus metrics in `src/app/metrics.ts`
- OpenAI SDK 7.23.0 - Used by E2E compatibility tests in `tests/e2e/openai-sdk-streaming.test.ts`

**Testing:**
- Vitest 4.1.11 - Test runner configured in `vitest.config.ts`
- `@vitest/coverage-v8` 4.1.11 - Coverage provider
- `fake-indexeddb` 6.2.5 - In-memory IndexedDB for tests
- Test layout: `tests/unit/`, `tests/integration/`, `tests/e2e/`
- Global setup: `tests/setup.ts`; integration helpers: `tests/helpers/test-server.ts`

**Build/Dev:**
- TypeScript 7.0.2 - Compilation via `npx tsc` (`npm run build`)
- `tsc-alias` 1.9.5 - Rewrites `@lumo/*` and `@proton/*` path aliases in build output
- `tsx` 4.23.15 - Dev runner with watch mode (`npm run dev:server`, `npm run dev:cli`)
- Go toolchain 1.24 - Builds the login helper (`npm run build:login`)
- Vitest 4.1.11 - Test runs (`npm test`, `npm run test:unit`, `npm run test:integration`)

## Key Dependencies

**Critical:**
- `@msgpack/msgpack` 3.1.3 - MessagePack serialization of encrypted conversation payloads in `packages/lumo/src/serialization.ts`
- `openpgp` 6.3.2 - PGP key generation and master-key encryption in `src/auth/key-generator.ts` and `packages/proton/src/crypto/lib/proxy/proxy.ts`
- `indexeddbshim` 19.0.7 - SQLite-backed IndexedDB polyfill for the upstream Lumo store, initialized in `src/shims/indexeddb-polyfill.ts`
- `better-sqlite3` 13.0.3 - Native SQLite backend used by `indexeddbshim`; requires native build tooling
- `keytar` 7.9.0 - OS keychain access for the vault key in `src/auth/vault/key-provider.ts`; native optional dependency, lazily loaded
- `yaml` 2.9.1 - YAML parsing and comment-preserving config edits in `src/app/config-file.ts` and `src/auth/update-config.ts`
- `bytes` 3.1.2 - Parses size strings such as `360kb` in `src/app/config.ts` and `src/cli/local-actions/file-reader.ts`

**Infrastructure:**
- `arg` 5.0.2 - CLI argument parsing in `src/tamer.ts`
- `uuid` 14.0.2 - ID generation utilities (declared dependency)
- `lodash` 4.18.1 - Config deep merge and upstream utilities (`src/app/config.ts`)
- `json-stable-stringify` 1.3.0 - Stable JSON for AEAD associated data in `src/conversations/fallback/sync/encryption-codec.ts`
- `toposort` 2.0.2 - ESM-wrapped dependency used by upstream Redux code through `src/shims/toposort.ts`
- `dotenv` 18.0.4 - Declared, but no `src/` imports detected; configuration comes from YAML files

**Upstream Proton code (do not edit):**
- `packages/lumo/` (`@lumo/*`) - Synced from Proton WebClients `applications/lumo/src/app/`; contains Lumo API client, crypto, IndexedDB, Redux slices/sagas, mocks, remote API
- `packages/proton/` (`@proton/*`) - Synced from Proton WebClients `packages/`; crypto primitives and shared helpers
- Sync tooling: `scripts/upstream/sync.sh`, tracked commit in `scripts/upstream/last-sync-commit`
- Local patches: `packages/lumo/patches/` (`keys.patch`, `selectors.patch`)

## Configuration

**Environment:**
- Primary configuration is `config.defaults.yaml` (single source of truth for defaults) plus optional user overrides in `config.yaml`
- Validation and typed accessors live in `src/app/config.ts`; file I/O and fatal config errors in `src/app/config-file.ts`
- Config sections: `auth`, `test.mock`, `log`, `conversations`, `commands`, `server`, `cli`
- Precedence: `config.defaults.yaml` -> `config.yaml` -> mode-specific shared keys (`log`, `conversations`, `commands`)
- Arrays replace defaults wholesale instead of being merged by index (`mergeConfigLayers` in `src/app/config.ts`)
- Runtime path resolution is based on project root, not `process.cwd()`, in `src/app/paths.ts`
- No application-level environment variable configuration detected; only `HOME`/`USERPROFILE` for `~` expansion in `src/app/paths.ts`
- `.env` is excluded from Docker builds (`.dockerignore`); no `.env` file or `dotenv` import observed

**Build:**
- `tsconfig.json` - ES2022, strict mode, declarations and source maps, path aliases for `@lumo/*`, `@proton/*`, lodash shims, and `toposort`
- `vitest.config.ts` - Mirrors TypeScript aliases for tests, 15s timeout, setup file, coverage on `src/**/*.ts`
- `package.json` scripts - `build`, `build:login`, `build:all`, `clean`, `dev:*`, `server`, `cli`, `test*`, `sync-upstream`
- `Dockerfile` - Three stages: Alpine base, Go builder (`golang:1.24-alpine`), TypeScript builder; copies `config.defaults.yaml` and the Go binary into the final image
- Build output: `dist/` (Git-ignored, excluded from Docker context)

## Platform Requirements

**Development:**
- Node.js 18+ and npm
- Go 1.24+ only when building or using the `login` auth method
- Native build tooling for `keytar` and `better-sqlite3` (Python, make, g++, cairo/pango/jpeg/gif/librsvg dev packages per `Dockerfile`)
- Docker optional, but recommended for running the server
- Chrome/Chromium with remote debugging (CDP) only for `browser` auth

**Production:**
- Self-hosted Docker container, default port `3003`
- Alpine `node:22` runtime with a statically linked Go helper (`CGO_ENABLED=0`)
- Requires persistent volumes for `config.yaml` and `sessions/` (vault and SQLite databases)
- Vault key from OS keychain or Docker secret file; no plain environment-variable key support
- Tested on Linux according to `README.md`

---

*Stack analysis: 2026-11-06*
