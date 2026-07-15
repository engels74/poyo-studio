# Poyo API and model audit

## Audit baseline

- **Verified:** 2026-07-15 18:02:01 UTC
- **Registry versions:** `image-2026-07-15.2`, `video-2026-07-15.2`
- **Official index:** <https://docs.poyo.ai/llms.txt>
- **API origin:** `https://api.poyo.ai`
- **Scope:** Current documented image and video generation, uploads, balance, asynchronous
  tasks, webhooks, pricing, retention, and errors. Chat, speech, music, general audio, 3D, and
  avatars are outside the current product scope.

The baseline was built from every indexed image/video Markdown page and its paired OpenAPI
JSON. All 57 Markdown and all 57 paired JSON model bodies returned HTTP 200. Actual fetched
body hashes and structured JSON paths/properties are committed in a 144-source evidence
manifest. JSON supplies fields, types, required arrays, enums, defaults, and bounds; Markdown
supplies conditional rules and operational caveats that OpenAPI cannot express. A reviewed
adapter resolves disagreements; the generic top-level OpenAPI schema does not drive forms.

## Implemented coverage

| Modality | Documentation pages | Public model IDs | Current workflow variants | Excluded variants | Audit-only records |
| --- | ---: | ---: | ---: | ---: | ---: |
| Image | 22 | 44 | 50 | 0 | 2 duplicate/unindexed specs |
| Video | 35 | 53 | 121 | 2 Kling Avatar variants | 8 legacy/unindexed specs |
| **Persisted registry total** | **57** | **97** | **171** | **2** | **10** |

The SQLite registry therefore contains 183 entries: 171 current workflow adapters, two
explicit exclusions, and ten audit-only records. “Public model ID” counts catalogue IDs, not
workflow variants; a model may expose several workflow-specific adapters.

Current manifest hashes:

- Source corpus: `4b2e5e25abcace6e553df8021a0069ce14f23af336db7a8ba6ca4e764eba1483`
- Image: `54b15e8eb765942b4edf368a0fdae6fa9f3c6fc1a9b1bf9a2b84ab016ad7c7d2`
- Video: `41a2bfed7979e1de6f5830fff71ac97e67a9f2e852a5d52e7c5c0d9a6085e2ad`

## Core API lifecycle

| Purpose | Method and path | Studio behavior |
| --- | --- | --- |
| Submit | `POST /api/generate/submit` | Paid and not safe to retry after ambiguous transmission. A local intent and claim are persisted before sending. |
| Status | `GET /api/generate/status/{task_id}` | Authoritative for state, real progress, output files, actual credits, and remote failure. Safe polling failures remain local uncertainty. |
| Balance | `GET /api/user/balance` | Refreshed around submission and terminal work; every value is shown with freshness. |
| URL upload | `POST /api/common/upload/url` | Public HTTP(S) image URL only; private/local targets are rejected. |
| Base64 upload | `POST /api/common/upload/base64` | Small image inputs only; the studio rejects inputs over 5 MiB and does not use base64 for video. |
| Stream upload | `POST /api/common/upload/stream` | Local images and videos; videos are capped at Poyo's documented 100 MiB limit. |

Documented remote task states are `not_started`, `running`, `finished`, and `failed`. The
studio stores unknown raw values for forward compatibility but does not manufacture progress.
Only a successful status response with `status=failed` marks the Poyo generation failed.

## Image registry: 22 pages / 44 IDs / 50 workflows

| Documentation page | Provider | Public model IDs | Workflow variants | Current workflow types |
| --- | --- | --- | ---: | --- |
| [flux-2](https://docs.poyo.ai/api-manual/image-series/flux-2.md) | Black Forest Labs | `flux-2-pro`, `flux-2-pro-edit`, `flux-2-flex`, `flux-2-flex-edit` | 4 | `text-to-image`, `image-edit` |
| [flux-dev](https://docs.poyo.ai/api-manual/image-series/flux-dev.md) | Black Forest Labs | `flux-dev` | 2 | `text-to-image`, `image-edit` |
| [flux-kontext](https://docs.poyo.ai/api-manual/image-series/flux-kontext.md) | Black Forest Labs | `flux-kontext-pro`, `flux-kontext-pro-edit`, `flux-kontext-max`, `flux-kontext-max-edit` | 4 | `text-to-image`, `image-edit` |
| [flux-schnell](https://docs.poyo.ai/api-manual/image-series/flux-schnell.md) | Black Forest Labs | `flux-schnell` | 1 | `text-to-image` |
| [gpt-4o-image](https://docs.poyo.ai/api-manual/image-series/gpt-4o-image.md) | OpenAI | `gpt-4o-image`, `gpt-4o-image-edit` | 2 | `text-to-image`, `image-edit` |
| [gpt-image-1.5](https://docs.poyo.ai/api-manual/image-series/gpt-image-1.5.md) | OpenAI | `gpt-image-1.5`, `gpt-image-1.5-edit` | 2 | `text-to-image`, `image-edit` |
| [gpt-image-2](https://docs.poyo.ai/api-manual/image-series/gpt-image-2.md) | OpenAI | `gpt-image-2`, `gpt-image-2-edit` | 2 | `text-to-image`, `image-edit` |
| [grok-imagine-image](https://docs.poyo.ai/api-manual/image-series/grok-imagine-image.md) | xAI | `grok-imagine-image` | 2 | `text-to-image`, `image-edit` |
| [grok-imagine-image-quality](https://docs.poyo.ai/api-manual/image-series/grok-imagine-image-quality.md) | xAI | `grok-imagine-image-quality` | 2 | `text-to-image`, `image-edit` |
| [kling-o1](https://docs.poyo.ai/api-manual/image-series/kling-o1.md) | Kuaishou | `kling-o1-image-edit` | 1 | `image-edit` |
| [kling-o3](https://docs.poyo.ai/api-manual/image-series/kling-o3.md) | Kuaishou | `kling-o3-image`, `kling-o3-image-edit` | 2 | `text-to-image`, `image-edit` |
| [nano-banana](https://docs.poyo.ai/api-manual/image-series/nano-banana.md) | Google | `nano-banana`, `nano-banana-edit` | 2 | `text-to-image`, `image-edit` |
| [nano-banana-2](https://docs.poyo.ai/api-manual/image-series/nano-banana-2.md) | Google | `nano-banana-2`, `nano-banana-2-edit`, `nano-banana-pro`, `nano-banana-pro-edit` | 4 | `text-to-image`, `image-edit` |
| [nano-banana-2-lite](https://docs.poyo.ai/api-manual/image-series/nano-banana-2-lite.md) | Google | `nano-banana-2-lite`, `nano-banana-2-lite-edit` | 2 | `text-to-image`, `image-edit` |
| [nano-banana-2-new](https://docs.poyo.ai/api-manual/image-series/nano-banana-2-new.md) | Google | `nano-banana-2-new`, `nano-banana-2-new-edit`, `nano-banana-2-official`, `nano-banana-2-official-edit` | 4 | `text-to-image`, `image-edit` |
| [seedream-4](https://docs.poyo.ai/api-manual/image-series/seedream-4.md) | ByteDance | `seedream-4`, `seedream-4-edit` | 2 | `text-to-image`, `image-edit` |
| [seedream-4-5](https://docs.poyo.ai/api-manual/image-series/seedream-4-5.md) | ByteDance | `seedream-4.5`, `seedream-4.5-edit` | 2 | `text-to-image`, `image-edit` |
| [seedream-5-0-lite](https://docs.poyo.ai/api-manual/image-series/seedream-5-0-lite.md) | ByteDance | `seedream-5.0-lite`, `seedream-5.0-lite-edit` | 2 | `text-to-image`, `image-edit` |
| [seedream-5-0-pro](https://docs.poyo.ai/api-manual/image-series/seedream-5-0-pro.md) | ByteDance | `seedream-5.0-pro`, `seedream-5.0-pro-edit` | 2 | `text-to-image`, `image-edit` |
| [wan-2-7-image](https://docs.poyo.ai/api-manual/image-series/wan-2-7-image.md) | Alibaba | `wan-2.7-image` | 2 | `text-to-image`, `image-edit` |
| [wan-2-7-image-pro](https://docs.poyo.ai/api-manual/image-series/wan-2-7-image-pro.md) | Alibaba | `wan-2.7-image-pro` | 2 | `text-to-image`, `image-edit` |
| [z-image](https://docs.poyo.ai/api-manual/image-series/z-image.md) | Alibaba | `z-image` | 2 | `text-to-image`, `image-edit` |

## Video registry: 35 pages / 53 IDs / 121 current workflows

| Documentation page | Provider | Public model IDs | Current variants | Current workflow types |
| --- | --- | --- | ---: | --- |
| [grok-imagine](https://docs.poyo.ai/api-manual/video-series/grok-imagine.md) | xAI | `grok-imagine` | 2 | `text-to-video`, `image-to-video` |
| [grok-imagine-video-1-5](https://docs.poyo.ai/api-manual/video-series/grok-imagine-video-1-5.md) | xAI | `grok-imagine-video-1.5` | 1 | `image-to-video` |
| [hailuo-02](https://docs.poyo.ai/api-manual/video-series/hailuo-02.md) | MiniMax | `hailuo-02`, `hailuo-02-pro` | 5 | `text-to-video`, `image-to-video`, `frame-to-video` |
| [hailuo-2-3](https://docs.poyo.ai/api-manual/video-series/hailuo-2-3.md) | MiniMax | `hailuo-2.3` | 2 | `text-to-video`, `image-to-video` |
| [happy-horse-1-1](https://docs.poyo.ai/api-manual/video-series/happy-horse-1-1.md) | Alibaba | `happy-horse-1.1` | 3 | `text-to-video`, `image-to-video`, `reference-to-video` |
| [happy-horse](https://docs.poyo.ai/api-manual/video-series/happy-horse.md) | Alibaba | `happy-horse` | 4 | `text-to-video`, `image-to-video`, `reference-to-video`, `video-edit` |
| [kling-1-6](https://docs.poyo.ai/api-manual/video-series/kling-1-6.md) | Kuaishou | `kling-1.6/standard`, `kling-1.6/pro` | 7 | `text-to-video`, `image-to-video`, `reference-to-video`, `frame-to-video` |
| [kling-2-1](https://docs.poyo.ai/api-manual/video-series/kling-2-1.md) | Kuaishou | `kling-2.1/standard`, `kling-2.1/pro` | 3 | `image-to-video`, `frame-to-video` |
| [kling-2-5-turbo-pro](https://docs.poyo.ai/api-manual/video-series/kling-2-5-turbo-pro.md) | Kuaishou | `kling-2.5-turbo-pro` | 3 | `text-to-video`, `image-to-video`, `frame-to-video` |
| [kling-2-6](https://docs.poyo.ai/api-manual/video-series/kling-2-6.md) | Kuaishou | `kling-2.6` | 3 | `text-to-video`, `image-to-video`, `frame-to-video` |
| [kling-2.6-motion-control](https://docs.poyo.ai/api-manual/video-series/kling-2.6-motion-control.md) | Kuaishou | `kling-2.6-motion-control` | 1 | `motion-control` |
| [kling-3-0](https://docs.poyo.ai/api-manual/video-series/kling-3-0.md) | Kuaishou | `kling-3.0/standard`, `kling-3.0/pro` | 8 | `text-to-video`, `frame-to-video`, `reference-to-video`, `multi-shot-video` |
| [kling-3-0-4k](https://docs.poyo.ai/api-manual/video-series/kling-3-0-4k.md) | Kuaishou | `kling-3.0/4K` | 4 | `text-to-video`, `frame-to-video`, `reference-to-video`, `multi-shot-video` |
| [kling-3-0-turbo](https://docs.poyo.ai/api-manual/video-series/kling-3-0-turbo.md) | Kuaishou | `kling-3.0-turbo/standard`, `kling-3.0-turbo/pro` | 6 | `text-to-video`, `image-to-video`, `multi-shot-video` |
| [kling-3-0-motion-control](https://docs.poyo.ai/api-manual/video-series/kling-3-0-motion-control.md) | Kuaishou | `kling-3.0-motion-control` | 1 | `motion-control` |
| [kling-avatar-2-0](https://docs.poyo.ai/api-manual/video-series/kling-avatar-2-0.md) | Kuaishou | `kling-avatar-2.0/standard`, `kling-avatar-2.0/pro` | 0 | Excluded `avatar-video` variants |
| [kling-o3](https://docs.poyo.ai/api-manual/video-series/kling-o3.md) | Kuaishou | `kling-o3/standard`, `kling-o3/pro` | 8 | `text-to-video`, `frame-to-video`, `reference-to-video`, `multi-shot-video` |
| [kling-o3-4k](https://docs.poyo.ai/api-manual/video-series/kling-o3-4k.md) | Kuaishou | `kling-o3/4K` | 4 | `text-to-video`, `frame-to-video`, `reference-to-video`, `multi-shot-video` |
| [omni-flash](https://docs.poyo.ai/api-manual/video-series/omni-flash.md) | Poyo | `omni-flash` | 4 | `text-to-video`, `image-to-video`, `image-fusion-video`, `video-to-video` |
| [runway-gen-4-5](https://docs.poyo.ai/api-manual/video-series/runway-gen-4-5.md) | Runway | `runway-gen-4.5` | 2 | `text-to-video`, `image-to-video` |
| [seedance-1.0-pro](https://docs.poyo.ai/api-manual/video-series/seedance-1.0-pro.md) | ByteDance | `seedance-1.0-pro` | 2 | `text-to-video`, `image-to-video` |
| [seedance-1-5-pro](https://docs.poyo.ai/api-manual/video-series/seedance-1-5-pro.md) | ByteDance | `seedance-1.5-pro` | 3 | `text-to-video`, `image-to-video`, `frame-to-video` |
| [seedance-2](https://docs.poyo.ai/api-manual/video-series/seedance-2.md) | ByteDance | `seedance-2`, `seedance-2-fast` | 6 | `text-to-video`, `frame-to-video`, `reference-to-video` |
| [seedance-2-mini](https://docs.poyo.ai/api-manual/video-series/seedance-2-mini.md) | ByteDance | `seedance-2-mini` | 3 | `text-to-video`, `frame-to-video`, `reference-to-video` |
| [sora-2-official](https://docs.poyo.ai/api-manual/video-series/sora-2-official.md) | OpenAI | `sora-2-official` | 2 | `text-to-video`, `image-to-video` |
| [sora-2-pro-official](https://docs.poyo.ai/api-manual/video-series/sora-2-pro-official.md) | OpenAI | `sora-2-pro-official` | 2 | `text-to-video`, `image-to-video` |
| [veo-3-1](https://docs.poyo.ai/api-manual/video-series/veo-3-1.md) | Google | `veo3.1-lite`, `veo3.1-fast`, `veo3.1-quality` | 8 | `text-to-video`, `image-to-video`, `frame-to-video`, `reference-to-video` |
| [veo-3-1-official](https://docs.poyo.ai/api-manual/video-series/veo-3-1-official.md) | Google | `veo3.1-lite-official`, `veo3.1-fast-official`, `veo3.1-quality-official` | 11 | `text-to-video`, `image-to-video`, `frame-to-video`, `reference-to-video` |
| [wan-2-6](https://docs.poyo.ai/api-manual/video-series/wan-2-6.md) | Alibaba | `wan2.6-text-to-video`, `wan2.6-image-to-video`, `wan2.6-video-to-video` | 3 | `text-to-video`, `image-to-video`, `video-to-video` |
| [wan-2-7-video](https://docs.poyo.ai/api-manual/video-series/wan-2-7-video.md) | Alibaba | `wan2.7-text-to-video`, `wan2.7-image-to-video`, `wan2.7-reference-to-video`, `wan2.7-edit-video` | 4 | `text-to-video`, `frame-to-video`, `reference-to-video`, `video-edit` |
| [wan-animate](https://docs.poyo.ai/api-manual/video-series/wan-animate.md) | Alibaba | `wan-animate-move`, `wan-animate-replace` | 2 | `character-animation`, `character-replacement` |
| [wan2.2-image-to-video-fast](https://docs.poyo.ai/api-manual/video-series/wan2.2-image-to-video-fast.md) | Alibaba | `wan2.2-image-to-video-fast` | 1 | `frame-to-video` |
| [wan2.2-text-to-video-fast](https://docs.poyo.ai/api-manual/video-series/wan2.2-text-to-video-fast.md) | Alibaba | `wan2.2-text-to-video-fast` | 1 | `text-to-video` |
| [wan2.5-image-to-video](https://docs.poyo.ai/api-manual/video-series/wan2.5-image-to-video.md) | Alibaba | `wan2.5-image-to-video` | 1 | `image-to-video` |
| [wan2.5-text-to-video](https://docs.poyo.ai/api-manual/video-series/wan2.5-text-to-video.md) | Alibaba | `wan2.5-text-to-video` | 1 | `text-to-video` |

Kling Avatar 2.0 is indexed under video but requires an audio URL and produces an avatar.
Both public IDs are retained with `excluded-initial-scope` status and are absent from model
selectors and payload adapters.

## Project-specific safety default

Poyo Local Studio deliberately sends `enable_safety_checker: false` by default for every
audited compatible workflow, even where Poyo's documentation declares or demonstrates a
default of `true`. The field is omitted for all other models. Users may opt in per request or
preset.

Audited compatible families:

- Images: Seedream 4.5, Seedream 5.0 Lite, Seedream 5.0 Pro, and Z-Image.
- Videos: Happy Horse 1.1, Happy Horse, and all four Wan 2.7 Video workflow IDs.

Registry tests assert both the explicit `false` default and the explicit `true` opt-in.

## Seedream 5.0 Pro size limitation

The current schema provides one `input.size` union containing either a resolution (`1K`, `2K`)
or an aspect ratio (`1:1`, `4:3`, `3:4`, `16:9`, `9:16`). It does not provide independent
resolution and aspect-ratio fields. The internal model keeps those concepts separate for a
future upstream fix, but validation rejects selecting both and the adapter emits exactly one
truthful `size` value.

## Documentation conflicts and deliberate behavior

| Finding | Studio decision |
| --- | --- |
| Getting Started says generated media is retained for three days; Overview and Task Status say 24 hours. | Download immediately, preserve the remote URL/observed expiration, and treat 24 hours as the safe floor without fabricating expiry metadata. |
| Upload docs describe 72-hour URL/base64 retention, 72-hour streamed images, and 24-hour default-path streamed video. | Store Poyo's returned `expires_at`; do not assume one global upload lifetime. |
| Webhooks are signed and retried, but require public HTTPS and reject private/internal callback targets. | A loopback-only installation uses persisted polling. SSE is only local server-to-browser delivery. |
| Status/balance docs say credits are charged on finish; some Seedream pages describe pre-deduction and refunds. | Treat balance as a timestamped snapshot and refresh around submission and terminal work. Persist actual `credits_amount`. |
| Current webhook Markdown uses an unwrapped task object; older material described `{code,data}`. | Response normalization is forward-compatible, but the app does not expose a public webhook receiver. |
| The paired Task Status JSON URL currently returns 404; historical JSON omitted `audio` while Markdown includes it. | Preserve known and unknown file-type strings; the initial local library indexes image and video outputs. |
| Kling O3 Image's paired JSON is now available, including the structured `elements` surface. | Pin both fetched bodies and retain a reviewed adapter rather than inferring a universal elements form. |
| The generic OpenAPI request permits fields that conflict with specific model pages. | Specific page JSON plus reviewed prose validation wins. |

## Unsupported or unverified Poyo behavior

No current official endpoint or contract was found for:

- dynamic model listing or capability discovery;
- pricing estimation (the public pricing page is not an API contract);
- task cancellation;
- task, task-history, generated-file, or uploaded-source deletion;
- submission idempotency keys or headers;
- guaranteed rate-limit headers, including `Retry-After`;
- guaranteed output-expiration metadata;
- exact progress granularity or update frequency.

Remote cleanup and cancellation remain visibly unavailable. An ambiguous paid submission is
never automatically retried. Pricing is shown as unknown unless a separately audited estimate
is available, while the authoritative status credit amount is persisted.

## Primary official sources

- <https://docs.poyo.ai/llms.txt>
- <https://docs.poyo.ai/.md>
- <https://docs.poyo.ai/api-manual/overview.md>
- <https://docs.poyo.ai/openapi.json>
- <https://docs.poyo.ai/api-manual/error-codes.md>
- <https://docs.poyo.ai/api-manual/task-management/status.md>
- <https://docs.poyo.ai/api-manual/task-management/webhooks.md>
- <https://docs.poyo.ai/api-manual/account-management/user-balance.md>
- <https://docs.poyo.ai/api-manual/file-series/upload-url.md>
- <https://docs.poyo.ai/api-manual/file-series/upload-base64.md>
- <https://docs.poyo.ai/api-manual/file-series/upload-stream.md>
- <https://poyo.ai/pricing>

Every current model-page source is linked from the coverage tables above. Re-run the process
in [Registry audit](registry-audit.md) before changing the verified date or counts.
