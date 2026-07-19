# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is one Bun/SvelteKit package. Run commands from the repository root with Bun 1.3.14, pinned in
`.bun-version` and `package.json`. Normal tests use mock/loopback Poyo responses and need no API key.

## Essential Commands

| Purpose | Command |
| --- | --- |
| Reproducible install | `bun install --frozen-lockfile` |
| Loopback development server | `bun run dev` |
| Production build and supported start | `bun run build` then `bun run start` |
| Format check / write | `bun run format:check` / `bun run format` |
| Biome lint | `bun run lint` |
| SvelteKit sync and type-check | `bun run check` |
| One test file | `bun test tests/unit/jobs/routes.test.ts` |
| One test case | `bun test tests/integration/database/migrations.test.ts -t "DB-02"` |
| Configured non-browser suite | `bun run test` |
| Production browser flows | `bun run test:e2e` |
| Static plus browser security | `bun run test:security` |
| Serialized restart / performance tests | `bun run test:restart` / `bun run test:performance` |
| Registry validation | `bun run validate:registry` |
| Refresh registry evidence | `bun run registry:evidence:refresh` |
| Audit current public registry sources | `bun run registry:audit:network` |
| Production smoke | `bun run build && bun run test:production-smoke` |
| All configured pre-commit gates | `prek run --all-files` |

`test:e2e` and `test:security` build first and run `.browser.ts` files serially through
`scripts/test-browser.ts`. Bun discovers `.test.ts`; `.browser.ts` and `.live.ts` need explicit
commands. `bun run test:live` can spend credits when fully enabled. Registry refresh/audit contacts
public documentation without credentials or Poyo credits.

Running real local-file intake requires ExifTool 13.55+, FFmpeg/ffprobe 8.1+, and ImageMagick
7.1+ on the server `PATH`. The sanitizer rejects the intake if the tools or verification fail.

## Architecture Overview

- `src/routes/**` contains SvelteKit pages, server loads, and HTTP endpoints. Routes parse,
  orchestrate shared services/repositories, and return safe DTOs rather than own domain logic.
- `src/lib/features/**` is browser-safe contracts, registry/normalization, and pure feature logic.
  Static tests forbid server value imports into this layer, Svelte components, or client hooks.
- `src/lib/server/**` owns SQLite, credentials, paths/filesystem boundaries, Poyo transport,
  durable jobs, cleanup, diagnostics, and verified media.
- `getPlatformServices()` in `src/lib/server/platform/runtime.ts` resolves the app-data tree,
  preflights/opens SQLite, seeds registries, recovers source temporaries, and configures settings,
  credentials, and redacted logs as one process-wide singleton.
- `getJobRuntime()` in `src/lib/server/jobs/runtime.ts` is the process-wide job singleton. It owns
  `JobRepository`, `JobCoordinator`, `OutputDownloader`, and the background recovery worker.
- `src/hooks.server.ts` starts job and cleanup workers and wraps mutating requests in the
  maintenance writer gate. Exclusive maintenance drains active writers before operating.

Generation crosses these boundaries:

1. Image/video loads call `loadStudioData()` for registry, preferences, balance, credentials, and
   optional preset/job/output reuse data.
2. `src/lib/components/studio/StudioWorkspace.svelte` uses pure generation modules for drafts,
   sizing, batches, and previews. Local files use `/api/sources`; normalization uses
   `/api/requests/preview`.
3. `/api/sources` performs bounded same-origin multipart intake, fail-closed sanitization, durable
   managed-source registration, and Poyo upload under a neutral filename.
4. `/api/jobs` revalidates the request, persists it before any paid submission, then schedules
   `JobCoordinator.reconcile()` through the maintenance gate.
5. The coordinator uses durable claims/backoff to submit, poll, and verify downloads. Ambiguous
   submissions require explicit review, not automatic resubmission.
6. `/api/events/jobs` replays SQLite-backed job events over SSE. Jobs and Library read the same
   durable records and expose only verified local media.

## Implementation Decisions

| Situation | Preferred approach | Avoid |
| --- | --- | --- |
| Logic/types needed by browser and server | `src/lib/features/**` | Value imports from `$lib/server` |
| Database, settings, credential, logger, or path access | `getPlatformServices()` | Opening another application database or singleton |
| Job repository/coordinator/worker access | `getJobRuntime()` | Constructing job runtimes in routes |
| Mutating JSON endpoint | `readSameOriginJson()` with a bounded `maxBytes` | `request.json()` |
| Local multipart source upload | `intakeLocalSource()` and `ManagedSourceRepository` | Generic JSON parsing or retaining browser paths |
| Production Poyo calls | `createPoyoClient()` | Direct Poyo `fetch`, `new PoyoClient`, or `new PoyoTransport` |
| API errors | `jobHttpError()` or `operationsHttpError()` | Returning raw errors, paths, or persisted payloads |

## Common Change Workflows

### Add or change an API-backed feature

1. Put browser-safe contracts/validation in `src/lib/features/`; put database, filesystem,
   credential, upstream, and verified-media work in `src/lib/server/`.
2. Keep the route orchestration-only. Use the canonical runtime singleton, the guarded JSON or
   multipart reader, safe DTOs, and the matching domain error mapper.
3. Add the closest unit or integration test. Add a `.browser.ts` scenario when navigation,
   hydration, accessibility, production-build behavior, or a complete user flow changes.

### Change the model capability registry

1. Update `src/lib/features/registry/image-registry.ts` or
   `src/lib/features/registry/video-registry.ts`; update matching normalization when request
   fields/payload mapping change, and advance the registry version.
2. Run `bun run registry:evidence:refresh`. It rewrites the official source manifest and the three
   reviewed workflow-fixture files; review every diff.
3. Update `reviewed-conditional-vectors.json` and `reviewed-conflicts.json` manually only when the
   underlying rule or documented conflict changes. Change hard inventory assertions in
   `scripts/validate-registry.ts` only for an intentional, reviewed inventory change.
4. Run `bun run validate:registry`, affected registry tests, and `bun run test`.

## Repository Conventions and Critical Gotchas

- Svelte components use runes (`$props`, `$state`, `$derived`, snippets/`{@render}`) and event
  properties such as `onclick`. `tests/security/static-architecture.test.ts` rejects `export let`,
  `on:` directives, competing runtimes, and private-server imports across browser boundaries.
- Reuse `src/lib/components/ui/**` and UnoCSS theme tokens/shortcuts. `uno.css` is imported once in
  `src/hooks.client.ts`; do not add Tailwind, a Node adapter, or another test/runtime stack.
- `scripts/start.ts` accepts only `127.0.0.1` or `::1`. Use `bun run start`; do not bypass the
  loopback validation by importing `build/index.js` directly.
- `PLS_APP_DATA_DIR` is the only storage-root override. Database, uploads, media, thumbnails, logs,
  secrets, and temporaries stay beneath it; never expose these server paths through browser DTOs.
- `POYO_API_KEY` overrides the one local credential file. Use `ApiKeyManager` and existing
  redaction/safe-error paths; keys do not belong in page data, browser storage, SQLite, or logs.
- Studio drafts/batches persist bounded, validated, serializable metadata. Preserve restrictions in
  `src/lib/features/generation/studio-draft.ts` and
  `src/lib/features/generation/studio-batch.ts` against secrets, local paths, raw filenames, and
  browser `File` objects.
- Preserve local-media custody from `src/lib/server/media/source-intake.ts` through sanitization,
  managed-source registration, and Poyo upload. Unsupported layouts, missing tools, timeouts, or
  verification failures must reject intake instead of falling back to the original file or filename.
- The current database is a fresh-only exact version-1 schema. `preflightDatabase()` rejects former
  development versions 2–4 and schema/checksum drift before opening. Do not edit
  `schema_migrations`, assume a new migration will automatically upgrade existing data, or rewrite
  `tests/fixtures/database/pre-collapse-schema-signature.json`; read both database integration test
  files before designing a schema change.
## Testing and Validation

- `bun run test` covers unit, integration, reliability, static-architecture, and performance tests.
  Integration tests exercise SQLite, durable jobs, credentials, and Poyo transport; restart
  recovery uses a separate Bun process.
- Browser E2E/security tests run a production build in an isolated temporary deployment/data root
  against `tests/helpers/studio-mock-poyo-server.ts`. Reuse the harness rather than weakening the
  loopback-only `PLS_TEST_*` gates.
- Start with a targeted test. Then run format check, lint, type-check, and `bun run test`; add
  registry, browser/security, restart/performance, build, and smoke gates for the changed surface.

## Additional Documentation

- `README.md` — Read before setup, production exposure, credentials/storage, privacy, database
  compatibility, or live/network testing.
- `.augment/rules/poyo-studio-tech-stack.md` — Read before Svelte/UnoCSS work; verify optional
  examples and packages against current code and `package.json`.
- `tests/security/static-architecture.test.ts` — Read before changing dependencies, browser/server
  boundaries, Svelte syntax, or framework configuration.
- `src/lib/server/platform/request-security.ts` — Read before adding a mutating JSON endpoint.
- `src/lib/server/platform/database.ts` and `tests/integration/database/` — Read before schema,
  migration, preflight, or compatibility work.
- `src/lib/server/media/source-intake.ts` and `src/lib/server/media/media-sanitizer.ts` — Read before
  changing local media acceptance, metadata policy, temporary-file custody, or Poyo source uploads.
- `scripts/validate-registry.ts` — Read before changing registry entries, evidence, normalization,
  versions, or inventory counts.
- `tests/helpers/browser-app-harness.ts` — Read before modifying production-browser tests or their
  isolated environment.
- `prek.toml` — Read before changing validation tooling or preparing a commit.
