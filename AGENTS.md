# AGENTS.md

This file provides guidance to AI coding agents when working with code in this
repository.

Poyo Local Studio: a local-first SvelteKit 2 / Svelte 5 (runes) app on Bun, backed by
`bun:sqlite`, that drives the Poyo.ai image and video APIs. Loopback-only by design.

## Commands

Bun is the only supported runner (`bun@1.4.0`, pinned in `.bun-version` and `engines`).

| Task | Command |
| --- | --- |
| Install | `bun install --frozen-lockfile` |
| Dev server | `bun run dev` → <http://127.0.0.1:5173> |
| Production | `bun run build` then `bun run start` → <http://127.0.0.1:3000> |
| Typecheck | `bun run check` (`svelte-kit sync` + `svelte-check`) |
| Lint / format | `bun run lint` · `bun run format` · `bun run format:check` |
| Default suite | `bun run test` |
| One file | `bun test tests/unit/registry/video-registry.test.ts` |
| One case | `bun test <file> -t "substring of the test name"` |
| Browser e2e | `bun run test:e2e` (rebuilds first, needs Playwright chromium) |
| Security suite | `bun run test:security` |
| Registry evidence | `bun run validate:registry` |

`bun run test` is not `bun test`. The script names explicit directories; bare `bun test` also
picks up `tests/media-tools/media-sanitizer.host.test.ts`, which has no skip guard and fails
unless ExifTool, ImageMagick, FFmpeg and ffprobe are on `PATH`. Run that file through
`bun run test:media-tools`, which probes readiness and skips.

`*.browser.ts` and `*.live.ts` are invisible to Bun's default test discovery on purpose. They
run only via `scripts/test-browser.ts` (`test:e2e`, `test:security`) and `bun run test:live`.
The live suite spends real credits and needs `POYO_LIVE_TESTS=1` plus `POYO_API_KEY`.

There is no CI. `prek.toml` is the only automated gate: on commit it runs format-check, lint,
svelte-check, `bun test`, registry validation and a full production build, and it blocks
direct commits to `main`.

## Layout and boundaries

- `src/lib/features/**` — browser-safe pure logic and shared contracts. Must never import
  `$lib/server`; use `import type` if you need a server-side type.
- `src/lib/server/**` — server-only. `src/lib/server/platform/runtime.ts` is the single service
  locator (`getPlatformServices()`) for database, settings, API key, logger, pricing and
  media-tool readiness. Construct those services there, not in a route.
- `src/routes/**` — every load is a `+page.server.ts`; there are no `+page.ts` or `+layout.ts`
  files. JSON endpoints live in `src/routes/api/**/+server.ts`.
- `src/lib/components/ui/` — hand-written primitives over the CSS variables in `src/app.css`,
  with `bits-ui` used only where a headless primitive is needed. No component generator.

## Invariants enforced by tests

`tests/security/static-architecture.test.ts` greps the shipped source and fails on each of the
following. Read it before adding anything unusual under `src/`.

- No `export let` or `on:click` in `.svelte` — runes and callback props only (`runes: true`).
- No `Bun.spawn` / `spawnSync` / `which` / `secrets`, no `process.platform`, no `node:os` in
  `src/`. Subprocesses use `execFile` from `node:child_process` with an argument array; see
  `src/lib/server/media/media-sanitizer.ts`.
- No host-OS vocabulary anywhere in `src/`, comments and UI copy included — the literal words
  `macOS`, `Windows`, `Linux`, `Keychain`, `credential-backend`, `storage-root`,
  `output-location`, `open-folder`, `open-native`. Describe the behaviour without naming a
  platform.
- No `tests/` paths referenced from `src/`.
- `PoyoClient` and `PoyoTransport` may only be constructed in `src/lib/server/poyo/factory.ts`
  and `transport.ts`. Everything else calls
  `createPoyoClient({ ..., publicIpv4Guard: platform.publicIpv4 })` — the guard argument is
  asserted, not optional.
- Banned dependencies: `tailwindcss`, `@sveltejs/adapter-node`, `express`, `ts-node`, `jest`,
  `vitest`. Package scripts may not invoke `npm`, `pnpm`, `yarn` or `node`.

Mutating API routes read their body through `readSameOriginJson`
(`src/lib/server/platform/request-security.ts`), which enforces Origin, `Sec-Fetch-Site`,
content type and size. The one exception is `src/routes/api/sources/+server.ts`, whose
multipart intake repeats the same checks in `src/lib/server/media/source-intake.ts`.

Non-idempotent HTTP methods acquire a writer permit from `maintenanceGate` in
`src/hooks.server.ts`; long-running work started from a request must be wrapped in
`maintenanceGate.trackDetached(...)` so maintenance can drain it.

## Database migrations

Applied migrations are pinned by a `name` + `sql` SHA-256 checksum, and the full schema is
compared against a canonical signature on every open. Editing a shipped migration file breaks
every existing database with `Migration N no longer matches its recorded checksum`.

To change the schema, do all three or startup throws: add `migrations/NNNN-name.ts`, append it
to `migrations/index.ts`, and bump `DATABASE_SCHEMA_VERSION` in
`src/lib/server/platform/version.ts`. `migrations/0001-initial.ts` is additionally frozen
against `tests/fixtures/database/pre-collapse-schema-signature.json`; check it with
`bun scripts/check-pre-collapse-schema-signature.ts`.

## Model registry and pricing

`src/lib/features/registry/{image,video}-registry.ts` is hand-authored, but everything under
`src/lib/features/registry/evidence/` is generated — regenerate with
`bun run registry:evidence:refresh` (network) instead of editing the JSON.
`bun run registry:audit:network` diffs the live pages against the stored manifest.

`scripts/validate-registry.ts` hard-codes the expected inventory (image page slugs / public IDs
/ entries; video slugs / IDs / current / excluded / audit records). Adding or removing a model
means updating those literals in the same change, plus the pricing fixtures under
`tests/fixtures/pricing/`. `git show 1dce043` is a complete worked example.

`tests/fixtures/pricing/README.md` documents the frozen pricing corpus and its exact row
counts; read it before touching anything in that directory.

## TypeScript

`exactOptionalPropertyTypes` is on, so an optional property must be omitted rather than set to
`undefined`. Build option objects with conditional spreads the way
`src/lib/server/poyo/factory.ts` does: `...(options.fetch ? { fetch: options.fetch } : {})`.

## Reference rules

- `.agents/rules/poyo-studio-tech-stack.md` — 1694-line Bun / Svelte 5 runes / SvelteKit 2 /
  UnoCSS Wind4 reference. Read the relevant section before writing new components, load
  functions or `+server.ts` boilerplate. Caveat: its shadcn-svelte, `unocss-preset-shadcn`,
  `presetIcons` and Superforms sections describe a stack this repo does not use —
  `uno.config.ts` loads `presetWind4` only, and none of those packages are dependencies.
