# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Runtime and commands

- Use Bun 1.3.14. The runtime and dependency baseline is pinned and asserted by
  `tests/unit/foundation.test.ts`; do not substitute Node, npm, pnpm, Yarn, Vitest, or Jest.
- Install: `bun install --frozen-lockfile`
- Develop: `bun run dev`
- Required local verification: `bun run format:check`, `bun run lint`, `bun run check`,
  `bun run test`, and `bun run build`.
- Run one test file: `bun test tests/unit/generation/studio-sizing.test.ts`
- Run one test case: `bun test tests/unit/generation/studio-sizing.test.ts -t 'SIZE-01'`
- Browser suites: `bun run test:e2e` and `bun run test:security`. These scripts build first and
  run browser files sequentially; do not invoke a `.browser.ts` file against a stale build.
- Production: run `bun run build` then `bun run start`. Do not run `build/index.js` directly:
  `scripts/start.ts` rejects non-loopback `HOST` values before importing the server.

## Boundaries that tests enforce

- All Svelte components use runes and callback event properties. Do not add `export let` or
  `on:event`; use `$props()` and `onclick`/equivalent instead.
- Browser-owned code (`*.svelte`, `src/hooks.client.ts`, and `src/lib/features/**`) must not
  runtime-import `$lib/server/**`. Move server work behind a server load/action/API route; type-only
  imports are allowed.
- Construct Poyo clients only through `src/lib/server/poyo/factory.ts`, and keep raw Poyo fetch
  behavior in `src/lib/server/poyo/transport.ts`. Every factory caller must pass
  `publicIpv4Guard: platform.publicIpv4`.
- Shipped `src/**` must remain platform-neutral and must not expose host paths, native
  file-manager actions, OS credential backends, or host subprocess APIs. Put test-only host
  integration under `tests/**`; optional media-tool orchestration already lives in scripts/tests.
- `PLS_APP_DATA_DIR` is the only application-data root override. Do not add alternate storage-root
  discovery or return server paths to browser data, logs, or diagnostics.
- Do not edit `migrations/0001-initial.ts` or
  `tests/fixtures/database/pre-collapse-schema-signature.json`; their version-1 checksum/signature
  is immutable. A schema change requires a new numbered migration, registration in
  `migrations/index.ts`, a `DATABASE_SCHEMA_VERSION` bump, and coordinated migration/preflight test
  updates while retaining the historical fixture.
- Shipped source must never import from `tests/**`. Reusable production behavior belongs in
  `src/**`; harnesses and lifecycle proof code remain under `tests/helpers/**`.

## Scoped workflows and references

- `.claude/skills/registry-change/SKILL.md` — registry evidence and fixture update procedure. Read
  before changing model entries, adapters, registry versions, or evidence JSON.
- `.augment/rules/poyo-studio-tech-stack.md` — Svelte 5 runes, SvelteKit 2, Bun, UnoCSS Wind4, and
  Bits/shadcn-style authoring reference. Read before unfamiliar UI/framework work. Its scaffold
  examples are not repository commands or dependency declarations; actual config and static
  architecture tests are authoritative.
- `tests/fixtures/pricing/README.md` — reviewed pricing corpus semantics. Read before changing
  pricing fixtures, normalization, or estimates.
