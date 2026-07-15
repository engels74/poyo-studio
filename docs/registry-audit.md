# Repeatable model-registry audit

The registry is a reviewed capability baseline, not a runtime claim that Poyo will never
change. Re-run this process whenever Poyo documentation changes or before updating the
registry verification date.

## Safety properties

- `bun run validate:registry` is local and performs no network request.
- `bun run registry:audit:network` contacts only `https://docs.poyo.ai/llms.txt`; it does not
  authenticate, submit a generation, upload media, or spend credits.
- Neither command needs `POYO_API_KEY`. Unset it during documentation audits.
- A successful page-index audit does not prove that fields, enums, defaults, conditional
  rules, pricing, or model availability are unchanged.

## Baseline

The current reviewed baseline is dated 2026-07-15:

| Registry | Version | Pages | Public IDs | Current workflows |
| --- | --- | ---: | ---: | ---: |
| Image | `image-2026-07-15` | 22 | 44 | 50 |
| Video | `video-2026-07-15` | 35 | 53 | 121 |

Video also retains two excluded Kling Avatar variants and eight legacy/unindexed audit
records. Image retains two duplicate/unindexed audit records.

## 1. Start from a clean branch

```bash
git status --short
bun --version        # must be 1.3.14 for the supported toolchain
bun install --frozen-lockfile
unset POYO_API_KEY
```

Stop if the worktree contains unrelated registry edits or if the pinned Bun version is not
available.

## 2. Validate the checked-in registry

```bash
bun run validate:registry
bun test tests/unit/registry
```

The validator proves:

- exact page, public-ID, workflow, exclusion, and audit-record counts;
- unique cross-modality workflow keys;
- source and manifest hash shape;
- a functional minimum-valid payload for every current workflow;
- exact model-ID transformation for each adapter.

The unit tests additionally cover conditional roles, required inputs, enums, dimensions,
durations, output counts, safety defaults, expert overrides, Seedream 5 Pro, exclusions, and
SQLite seeding.

## 3. Compare the live documentation index

```bash
bun run registry:audit:network | tee /tmp/poyo-registry-index-audit.json
```

The command extracts current image/video Markdown page slugs from the official `llms.txt` and
compares them with `IMAGE_PAGE_SLUGS` and `VIDEO_PAGE_SLUGS`.

Classification:

- **Removed page:** fails the command. Do not delete the adapter until a human verifies the
  replacement/deprecation and migration consequence.
- **Added page:** warning. Classify it as current, explicitly excluded, legacy, duplicate, or
  unindexed.
- **Unknown candidate ID:** warning. The index parser is deliberately broad; verify it against
  the model page before adding anything.

The output timestamp is evidence for the index check only. It must not replace the registry's
review date.

## 4. Review paired Markdown and JSON

For every added/changed page, retrieve both official forms where present:

```text
https://docs.poyo.ai/api-manual/{image-series|video-series}/{slug}.md
https://docs.poyo.ai/api-manual/{image-series|video-series}/{slug}.json
```

Record the HTTP status and SHA-256 of each body. Compare JSON for:

- public model IDs and workflow-specific IDs;
- property names and types;
- `required` arrays;
- enums and defaults;
- numeric, string, and array bounds;
- nullable/union behavior;
- request and response examples.

Review Markdown separately for conditions that OpenAPI often cannot express:

- “required for”, “only”, “cannot”, “must”, and mutually exclusive fields;
- input roles and maximum role counts;
- file formats, size, duration, dimension, and aspect-ratio matrices;
- model/variant-specific restrictions;
- billing, retention, progress, and operational warnings.

If Markdown and JSON disagree, do not silently generate code from either. Record the conflict,
choose the behavior that can be submitted truthfully, and add a regression test.

Kling O3 Image is the existing manual-adapter example: its Markdown embeds OpenAPI but the
adjacent JSON is missing. Keep `incomplete-json` provenance until official JSON exists and is
reviewed.

## 5. Update the reviewed registry

Relevant files:

- `src/lib/features/registry/image-registry.ts`
- `src/lib/features/registry/video-registry.ts`
- `src/lib/features/registry/normalize.ts`
- `src/lib/features/registry/normalize-video.ts`
- `src/lib/features/registry/normalize-registry.ts`
- `tests/unit/registry/`

For each current workflow, keep provider, family, public ID, workflow, media roles, fields,
output capabilities, limitations, Markdown/JSON URLs, source hash, and verification time
together. Do not spread model-specific business rules into page components.

Change the registry version and manifest hash only after every changed workflow adapter and
test is reviewed. Removed or uncertain specifications remain explicit audit records rather
than disappearing.

## 6. Mandatory regression checks

Always re-check these deliberate decisions:

1. `enable_safety_checker` is emitted as explicit `false` by default for every compatible
   family, explicit `true` when selected, and omitted everywhere else.
2. Seedream 5.0 Pro rejects simultaneous resolution and aspect ratio and emits exactly one
   `size` value.
3. Kling Avatar IDs remain excluded while avatar/audio-driven generation is out of scope.
4. Legacy/unindexed duplicate OpenAPI records remain absent from selectors.
5. Expert overrides cannot replace `model`, `callback_url`, `api_key`, or `local_path`, and new
   unknown fields remain visibly unverified.
6. Every current workflow produces an exact minimum-valid request whose `model` equals the
   public ID.

## 7. Audit operational documentation separately

Re-check these pages even when the model index is unchanged:

- [Getting Started](https://docs.poyo.ai/.md)
- [API Overview](https://docs.poyo.ai/api-manual/overview.md)
- [Task Status](https://docs.poyo.ai/api-manual/task-management/status.md)
- [Webhooks](https://docs.poyo.ai/api-manual/task-management/webhooks.md)
- [Error Codes](https://docs.poyo.ai/api-manual/error-codes.md)
- [Balance](https://docs.poyo.ai/api-manual/account-management/user-balance.md)
- [URL upload](https://docs.poyo.ai/api-manual/file-series/upload-url.md)
- [Base64 upload](https://docs.poyo.ai/api-manual/file-series/upload-base64.md)
- [Streaming upload](https://docs.poyo.ai/api-manual/file-series/upload-stream.md)
- [Pricing catalogue](https://poyo.ai/pricing)

Pricing is not an API contract and changes independently. Never update a cost estimate from a
single rendered value without versioning the source and date. Continue to treat remote
cancel/delete/cleanup, dynamic discovery, pricing estimation, and idempotent submission as
unsupported until a documented verified endpoint appears.

## 8. Final evidence

```bash
bun run format:check
bun run lint
bun run check
bun test
bun run validate:registry
bun run build
git diff --check
```

An audit report should state:

- index check timestamp and result;
- old/new registry versions and counts;
- added, removed, excluded, legacy, and unresolved records;
- changed fields/enums/defaults/conditions;
- Markdown/JSON discrepancies and manual decisions;
- safety and Seedream regression results;
- pricing audit status;
- whether an authenticated live test ran and its observed credit spend (normally `not run`).

The complete current coverage matrix and known discrepancies live in
[Poyo API and model audit](poyo-api-model-audit.md).
