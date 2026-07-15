# Repeatable model-registry audit

The checked-in registry is a reviewed capability baseline. It is not a runtime claim that
Poyo's documentation will never change. Re-run this process before changing a registry
adapter, its verification date, or its source evidence.

## Safety properties

- `bun run validate:registry` is offline and reads only committed evidence.
- `bun run registry:audit:network` performs unauthenticated `GET` requests only to official
  Poyo documentation and the public pricing page. It uploads no media, submits no generation,
  and spends zero credits.
- Neither command reads or needs `POYO_API_KEY`; unset it during an audit.
- `bun run registry:evidence:refresh` rewrites review-candidate evidence. Never commit its
  output without inspecting the source, structured, fixture, and manual-decision diffs.

## Reviewed baseline

The 2026-07-15 baseline uses registry versions `image-2026-07-15.2` and
`video-2026-07-15.2`.

| Evidence | Count |
| --- | ---: |
| Indexed image model pages | 22 Markdown + 22 JSON |
| Indexed video model pages | 35 Markdown + 35 JSON |
| Model bodies with HTTP 200 | 114 of 114 |
| Operational, index, pricing, and audit-only bodies | 30 |
| **Official source records** | **144** |
| Reviewed workflow fixtures | 173 (50 image, 121 current video, 2 excluded) |
| Reviewed conditional-invalid vectors | 15 |
| Explicit conflicts/manual decisions | 8 |

Every source record stores its URL, HTTP status, fetch timestamp through the manifest,
byte length, raw-body SHA-256, canonical SHA-256, classification, and—when it is OpenAPI
JSON—a structured snapshot of paths plus property types, required flags, enums, defaults,
formats, and bounds. The source corpus hash is
`4b2e5e25abcace6e553df8021a0069ce14f23af336db7a8ba6ca4e764eba1483`.

Current non-available classifications are deliberate and machine-readable:

- `overview.json`, `error-codes.json`, `task-management/status.json`, and
  `task-management/webhooks.json` return 404; their Markdown forms remain available.
- The generic `openapi.json` is **contradictory** because its permissive input cannot express
  all model-specific restrictions.
- The public pricing page is **unstructured** HTML, not a pricing-estimate API.

## 1. Prepare a clean, unauthenticated audit

```bash
git status --short
bun --version        # supported version: 1.3.14
bun install --frozen-lockfile
unset POYO_API_KEY
```

Do not refresh evidence over unrelated registry edits. No API key is required.

## 2. Validate the committed reviewed evidence offline

```bash
bun run validate:registry
bun test tests/unit/registry
```

The validator proves:

- the source manifest contains exactly 57 paired model Markdown/JSON sources and the complete
  144-source corpus;
- every current model source was fetched successfully and every JSON body has a structured
  extraction;
- registry provenance uses the actual fetched Markdown/JSON body hashes;
- every adapter's fields, roles, defaults, enums, bounds, conditions, output contract,
  limitations, and payload metadata exactly match a committed reviewed fixture;
- every current workflow's minimum and advanced values still normalize to the exact reviewed
  request body and public model ID;
- every current workflow has an invalid vector, all declared conditional rules have a
  targeted invalid vector, and all conflict records reference real source evidence;
- inventory, exclusions, safety defaults, Seedream behavior, and corpus/manifest hashes remain
  stable.

The fixture refresh script derives a review candidate from runtime adapters for convenience.
That does **not** make the result self-authorizing: an adapter and its regenerated fixture must
be reviewed against the paired official structured evidence and Markdown before both change.

## 3. Audit all official sources over the network

```bash
bun run registry:audit:network | tee /tmp/poyo-registry-audit.json
```

The network audit refetches and hashes all 144 sources, compares source availability and HTTP
status, detects added/removed model pages from `llms.txt`, and reports structured OpenAPI path
or property changes. Safe documentation reads retry transient 429/5xx responses and have a
bounded timeout. The command exits non-zero for substantive status, body, page, or schema
drift.

The pricing page uses canonical visible `<main>` text so volatile build metadata does not
create false failures; a visible price/content change still fails. The report always declares
`authenticated: false` and `paidCalls: 0`.

## 4. Review and refresh evidence deliberately

When the network audit reports drift:

1. Read both official forms for every affected model page:
   `https://docs.poyo.ai/api-manual/{image-series|video-series}/{slug}.md` and `.json`.
2. Review JSON fields, types, required arrays, enums, defaults, numeric/string/array bounds,
   unions, examples, and response schemas.
3. Review Markdown for roles, maximum counts, formats, duration/dimension matrices,
   mutually-exclusive fields, billing, retention, and operational warnings.
4. Update `reviewed-conflicts.json` when sources disagree. Do not silently choose one source.
5. Update adapters and regression tests only after deciding what can be submitted truthfully.
6. Generate review candidates:

   ```bash
   bun run registry:evidence:refresh
   git diff -- src/lib/features/registry/evidence
   ```

7. Inspect every source status/hash/structured diff and every fixture schema/request diff.
   Refreshing evidence must never be used to hide unexplained drift.

Kling O3 Image's paired JSON now returns 200 and is included in the structured corpus. Its
`elements` behavior remains a reviewed adapter surface rather than an inferred generic form.

## 5. Mandatory manual decisions

Always re-check these project choices:

1. Compatible models explicitly send `enable_safety_checker: false` by default, send `true`
   only after user opt-in, and omit the field for unsupported models.
2. Seedream 5.0 Pro treats resolution and aspect ratio as separate internal concepts but
   accepts only one current `size` selection.
3. Kling Avatar remains an explicit excluded record while avatar/audio-driven generation is
   outside scope.
4. Legacy and duplicate OpenAPI records stay out of selectors.
5. Expert overrides cannot replace protected/local/security fields and remain visibly
   unverified when not in reviewed schemas.
6. Poyo exposes no verified cancellation, remote deletion, dynamic discovery, pricing
   estimation, or submission-idempotency contract.

## 6. Quality gates and audit report

```bash
bun run format:check
bun run lint
bun run check
bun test
bun run validate:registry
bun run build
git diff --check
```

Record the audit timestamp, old/new versions and corpus hashes, page/status/body/structured
changes, manual decisions, safety/Seedream results, pricing classification, and whether an
authenticated live test ran. A documentation audit normally reports **no authenticated test
and zero credits spent**.

See [Poyo API and model audit](poyo-api-model-audit.md) for the coverage matrix and known
limitations.
