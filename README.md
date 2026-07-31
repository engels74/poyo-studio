<p align="center">
  <img src="static/poyo-local-studio-logo.svg" alt="Poyo Local Studio logo" width="192" height="192">
</p>

<h1 align="center">Poyo Local Studio</h1>

<p align="center">
  <strong>A local-first image and video studio for Poyo.ai</strong>
</p>

<p align="center">
  <a href="https://github.com/engels74/poyo-suite/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="AGPL-3.0 license"></a>
  <img src="https://img.shields.io/badge/Bun-1.3.14-000000?logo=bun&logoColor=white" alt="Bun 1.3.14">
  <img src="https://img.shields.io/badge/SvelteKit-2.69-FF3E00?logo=svelte&logoColor=white" alt="SvelteKit 2.69">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/UnoCSS-presetWind4-333333?logo=unocss&logoColor=white" alt="UnoCSS presetWind4">
</p>

Poyo Local Studio is a Bun-backed SvelteKit application for creating, monitoring, and
organising Poyo image and video generations on one machine. It combines registry-driven
model forms, persisted asynchronous jobs, immediate verified downloads, a grouped media
library, presets, balance visibility, cleanup controls, and redacted diagnostics in one
responsive light/dark interface.

The project is independent and is not an official Poyo.ai client.

## Quick start

### Requirements

- [Bun 1.3.14](https://bun.sh/) — pinned in `.bun-version` and `package.json`.
- A Poyo API key for connectivity or generation. No paid request is needed to install, build,
  or run the automated test suite.

ExifTool, ImageMagick, FFmpeg, and ffprobe are optional local privacy enhancements. Image cleanup is
available with [ExifTool 13.55+](https://exiftool.org/) and
[ImageMagick 7.1+](https://imagemagick.org/); video cleanup uses ExifTool plus
[FFmpeg and ffprobe 8.1+](https://ffmpeg.org/). Without a complete supported toolchain, local uploads
still use the validated managed-source path but continue without metadata cleanup. The application
invokes available tools directly with bounded argument-array subprocesses and no shell integration.
After installing or updating a tool, restart Studio so its server process receives the updated
`PATH`, then reload the page.

### Development

Clone the repository, install with `bun install --frozen-lockfile`, and create a private `.env`
from `.env.example` if environment configuration is needed. Never commit `.env`. Start the local
development server with `bun run dev`.

Open <http://127.0.0.1:5173>.

### Production build

```bash
bun run build
bun run start
```

The supported production command validates the bind address before importing the built server.
It binds to <http://127.0.0.1:3000> by default; `PORT` may be changed. `HOST` may be
`127.0.0.1` or `::1` only. Wildcard, LAN, and hostname binds fail closed so the backend remains a
private loopback service.

## Privacy

Poyo Local Studio stores application data locally and includes no telemetry or analytics. Your API
key remains server-side; media is sent to Poyo only for operations you initiate or to finish an
existing job. Optional metadata cleanup is available for local uploads when the supported tools are
installed. Deleting local data does not delete content held by Poyo.

## License

Poyo Local Studio is licensed under the [GNU Affero General Public License v3.0](LICENSE).
