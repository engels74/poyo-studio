---
type: "agent_requested"
description: "Bun + Svelte 5 + SvelteKit 2 + UnoCSS + shadcn-svelte coding guidelines"
---

# Coding Guidelines — Bun · Svelte 5 · SvelteKit 2 · UnoCSS · shadcn-svelte

This is a **Runes-only** reference for projects using **Bun (≥ 1.2)**, **Svelte 5**, **SvelteKit 2**, **UnoCSS presetWind4**, and **shadcn-svelte (≥ 1.2)**. It intentionally avoids legacy Svelte patterns and focuses on copy‑pasteable, production-ready setups.

> [!NOTE]
> The SvelteKit examples use modern Svelte 5 template conventions (e.g. `{@render ...}` in layouts) as per SvelteKit’s routing docs.

## Foundation setup

### Project scaffolding and configuration

#### Scaffolding with Bun + SvelteKit CLI

**Goal:** Create a SvelteKit app, install dependencies with Bun, and run the Vite dev server under the Bun runtime.

```bash
# terminal
bunx sv create my-app
cd my-app
bun install

# Run dev under Bun runtime
bun --bun run dev
```

Bun’s SvelteKit guide explicitly recommends running the dev lifecycle scripts with Bun (`bun --bun run dev`, `bun --bun run build`, `bun --bun run start`) to ensure **Bun is the runtime** executing the tooling chain.

> [!TIP]
> If you plan to add shadcn-svelte later, the shadcn-svelte docs show `bun x sv create ...` for scaffolding. Their docs default to Tailwind, but you can **skip Tailwind** and use UnoCSS + shadcn tokens instead.

#### `package.json` scripts

```jsonc
// file: package.json
{
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "dev:bun": "bun --bun run dev",
    "build": "vite build",
    "preview": "vite preview",

    // adapter-bun output (default out = build)
    "start": "bun ./build/index.js",

    "check": "biome check .",
    "format": "biome format --write .",

    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  }
}
```

`svelte-adapter-bun` runs the built server via `bun ./build/index.js` by default.

#### `svelte.config.ts` with `svelte-adapter-bun` + `vitePreprocess`

```ts
// file: svelte.config.ts
import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import type { Config } from '@sveltejs/kit';

const config: Config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build',
      serveAssets: true,
      precompress: true,
      envPrefix: '' // optionally set a prefix for runtime env vars
    })
  }
};

export default config;
```

Adapter options (`out`, `serveAssets`, `precompress`, `envPrefix`) are documented by `svelte-adapter-bun`.

#### `vite.config.ts` with UnoCSS plugin + SvelteKit

```ts
// file: vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import UnoCSS from '@unocss/vite';

export default defineConfig({
  plugins: [
    // Keep sveltekit first; UnoCSS runs globally as a Vite plugin
    sveltekit(),
    UnoCSS()
  ]
});
```

UnoCSS Vite integration is via `@unocss/vite` and, in default `global` mode, requires importing `uno.css` somewhere in your app.

#### UnoCSS stylesheet import (Safari-safe for Svelte 5 runes)

A known issue reports **Safari “Cannot access uninitialized variable”** when importing `uno.css` directly in a root `+layout.svelte` `<script>` in a Svelte 5 (runes) SvelteKit app.
A workaround reported in SvelteKit issues is importing `uno.css` from `hooks.client.ts`.

```ts
// file: src/hooks.client.ts
import 'uno.css';

// Optionally initialise client-only concerns here.
// hooks.client.* runs once on client startup.
export {};
```

> [!WARNING]
> Importing `uno.css` in client hooks may load slightly later than SSR HTML, so watch for first-paint flicker (reported by the UnoCSS issue author).
> If you must load earlier, validate on Safari and consider experiment-based alternatives (e.g. scoped integration), but keep this doc’s default as above.

#### `uno.config.ts` (presetWind4 + shadcn + animations + rem-to-px)

```ts
// file: uno.config.ts
import { defineConfig, presetTypography, presetIcons } from 'unocss';
import { presetWind4 } from '@unocss/preset-wind4';
import { createRemToPxProcessor } from '@unocss/preset-wind4/utils';
import presetAnimations from 'unocss-preset-animations';
import presetShadcn from 'unocss-preset-shadcn';

export default defineConfig({
  presets: [
    presetWind4(),
    presetTypography(),
    presetIcons({
      scale: 1
      // configure collections as needed
    }),
    presetShadcn({
      // Prefer class-based dark mode for SvelteKit SSR
      darkSelector: '.dark',
      // leave `theme: 'on-demand'` unless you need full variable output
      // theme: 'on-demand' is the default in preset-shadcn v1+
    }),
    presetAnimations()
  ],

  // Convert rem -> px when using rune-driven inline style systems or design tokens
  // (Wind4 provides this helper)
  postprocess: createRemToPxProcessor(),

  theme: {
    // Wind4 key is `radius` (not `borderRadius`)
    radius: {
      sm: '0.375rem',
      md: '0.5rem',
      lg: '0.75rem'
    },
    fontFamily: {
      sans: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    }
  },

  shortcuts: [
    // App-wide primitives
    ['page-shell', 'min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]'],
    ['card', 'rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm']
  ],

  rules: [
    // Example custom rule: `hstack-2` => horizontal layout with gap 0.5rem
    [/^hstack-(\d+)$/, ([, n]) => ({ display: 'flex', 'align-items': 'center', gap: `${Number(n) * 0.25}rem` })]
  ],

  // IMPORTANT for shadcn-svelte & variants stored in .ts files:
  // preset-shadcn notes that UnoCSS doesn’t extract from .ts/.js by default, so add them.
  content: {
    pipeline: {
      include: [
        /\.svelte$/,
        /\.svelte\.ts$/,
        /\.svelte\.js$/,
        /\.ts$/,
        /\.js$/
      ]
    }
  }
});
```

Wind4 integrates reset and uses OKLCH/theming layers; you **do not need** a separate reset package when using `presetWind4`.
`unocss-preset-shadcn` v1+ defaults to Wind4 (Wind3 requires a legacy import path).

#### `app.html` minimal shell

```html
<!-- file: src/app.html -->
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>

  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

SvelteKit renders into `%sveltekit.body%` and controls preload via `data-sveltekit-preload-*`. (See routing + framework conventions.)

#### TypeScript strict mode + `$lib` alias

```jsonc
// file: tsconfig.json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,

    "verbatimModuleSyntax": true,
    "importsNotUsedAsValues": "error",
    "resolveJsonModule": true,

    "baseUrl": ".",
    "paths": {
      "$lib": ["src/lib"],
      "$lib/*": ["src/lib/*"]
    },

    // Optional but useful when using Bun APIs in app/server code:
    // "types": ["bun-types"]
    // If you do this, ensure the appropriate Bun types package is installed.
    // (If your editor doesn’t recognise `Bun`, add Bun types.)
  }
}
```

#### Environment variables: `.env` + SvelteKit `$env/*`

`svelte-adapter-bun` notes Bun will auto-read `.env.local`, `.env.development`, and `.env`.

In SvelteKit, import env vars using `$env/static/*` or `$env/dynamic/*` depending on whether you need build-time inlining or runtime access.

```env
# file: .env
DATABASE_URL="file:./data/app.sqlite"
PRIVATE_API_KEY="..."
PUBLIC_APP_NAME="My App"
```

```ts
// file: src/routes/+page.server.ts
import type { PageServerLoad } from './$types';
import { DATABASE_URL, PRIVATE_API_KEY } from '$env/static/private';
import { PUBLIC_APP_NAME } from '$env/static/public';

export const load: PageServerLoad = async () => {
  return {
    appName: PUBLIC_APP_NAME,
    // Use private values only server-side:
    hasDb: Boolean(DATABASE_URL),
    hasKey: Boolean(PRIVATE_API_KEY)
  };
};
```

#### Directory structure conventions

```txt
src/
  lib/
    components/
      ui/                # shadcn-svelte components (copy-paste model)
    state/               # rune-era shared state modules (.svelte.ts)
    server/              # server-only helpers (db, auth, etc.)
    utils/               # cn(), small pure helpers
    attachments/         # @attach helpers
  routes/
    +layout.svelte
    +layout.ts
    +error.svelte
    (app)/
      ...
```

> [!TIP]
> Prefer `$lib/state/` over `$lib/stores/` in Svelte 5 projects to avoid accidental store-era patterns.

---

### Bun ↔ UnoCSS bridge with `bun-plugin-unocss`

#### When you use it

Use **Vite UnoCSS plugin** during SvelteKit dev (HMR + Vite pipeline).
Use **bun-plugin-unocss** when you are **not** using Vite: standalone `Bun.build()` pipelines, or `Bun.serve()` static HTML routes with HTML imports.

#### Install

```bash
# terminal
bun add -d bun-plugin-unocss
```

#### `Bun.build()` usage

```ts
// file: scripts/build-static.ts
import { plugin as unocss } from 'bun-plugin-unocss';

const result = await Bun.build({
  entrypoints: ['src-static/index.html'],
  outdir: 'dist-static',
  plugins: [unocss()]
});

if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
```

The plugin is explicitly documented as a Bun plugin for UnoCSS, intended for `Bun.build()`.

#### `Bun.serve()` static HTML imports

```ts
// file: scripts/serve-static.ts
import { plugin as unocss } from 'bun-plugin-unocss';

Bun.serve({
  port: 4000,
  static: {
    plugins: [unocss()]
  },
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') {
      // HTML import gets transformed by plugin
      return new Response(Bun.file('src-static/index.html'));
    }
    return new Response('Not found', { status: 404 });
  }
});
```

`bun-plugin-unocss` documents support for `Bun.serve()` “HTML static imports” via Bun’s static plugins system.

#### `bunfig.toml` static plugin registration

```toml
# file: bunfig.toml

[serve.static]
plugins = ["bun-plugin-unocss"]
```

This is the plugin’s documented configuration for enabling UnoCSS processing on Bun’s static serving.

#### `bunfig.toml` preload (for global runtime initialisation)

Bun supports `preload` scripts/plugins that execute before running a file.

```toml
# file: bunfig.toml
preload = ["./src/bun.preload.ts"]
```

```ts
// file: src/bun.preload.ts
// Use for runtime initialisation (logging hooks, env checks, polyfills, etc.)
// Bun runs preload scripts before your main entry.
export {};
```

---

## Svelte 5 runes and component authoring

### Runes-only rules

**Never** use legacy reactive declarations or legacy prop/slot APIs. Svelte 5 replaces slots with snippets (slots are deprecated, though still supported), and `{@render ...}` is the forward-looking composition model.

---

### `$state`

**Purpose:** Local reactive state (primitive or deep proxy).

**Signature:** `let x = $state(initial)`; deep proxies for arrays/objects; `raw/snapshot/eager` variants.

#### Do: deep reactivity via direct mutation

```svelte
<!-- file: src/routes/examples/state/+page.svelte -->
<script lang="ts">
  type Todo = { id: string; text: string; done: boolean };

  let todos = $state<Todo[]>([
    { id: crypto.randomUUID(), text: 'Ship runes-only UI', done: false }
  ]);

  function addTodo(text: string) {
    todos.push({ id: crypto.randomUUID(), text, done: false });
  }

  function toggle(id: string) {
    const t = todos.find((x) => x.id === id);
    if (t) t.done = !t.done;
  }
</script>

<div class="hstack-2">
  <button class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
    onclick={() => addTodo('New item')}>
    Add
  </button>
</div>

<ul class="mt-4 grid gap-2">
  {#each todos as t (t.id)}
    <li class="hstack-2">
      <input type="checkbox" checked={t.done} onclick={() => toggle(t.id)} />
      <span class={t.done ? 'line-through opacity-70' : ''}>{t.text}</span>
    </li>
  {/each}
</ul>
```

Deep proxies track reads/writes (including `array.push`) and update granularly.

#### Don’t: destructure reactive values and expect reactivity

```svelte
<!-- file: src/routes/examples/state-bad/+page.svelte -->
<script lang="ts">
  let user = $state({ name: 'PB', role: 'Admin' });

  // Anti-pattern: destructuring breaks reactivity for the local bindings.
  const { name } = user;

  function rename() {
    user.name = 'Renamed';
  }
</script>

<p>name (stale): {name}</p>
<button onclick={rename}>Rename</button>
```

Svelte explicitly notes destructuring a reactive value produces non-reactive references.

#### Edge cases

`$state.raw`: when you want a value not wrapped in a deep proxy (useful for large immutable data).

```ts
// file: src/lib/state/big-data.svelte.ts
export type Row = { id: string; payload: string };

// Large dataset, treated as read-only
export const rows = $state.raw<Row[]>([]);
```

---

### `$derived`

**Purpose:** Derived values; avoid `$effect` for pure computations.

**Signature:** `let x = $derived(expr)` or `let x = $derived.by(() => { ... })`.

> [!NOTE]
> `$derived` values are **writable in Svelte ≥ 5.25** (can be useful for “overrides”).

#### Do: use `$derived` for render-ready values

```svelte
<!-- file: src/routes/examples/derived/+page.svelte -->
<script lang="ts">
  let query = $state('');
  let items = $state(['bun', 'svelte', 'sveltekit', 'unocss', 'shadcn']);

  let filtered = $derived(
    items.filter((x) => x.toLowerCase().includes(query.toLowerCase().trim()))
  );
</script>

<input
  class="px-3 py-2 rounded border border-[hsl(var(--border))]"
  placeholder="Filter..."
  value={query}
  oninput={(e) => (query = (e.currentTarget as HTMLInputElement).value)}
/>

<ul class="mt-4 grid gap-1">
  {#each filtered as x (x)}
    <li class="opacity-90">{x}</li>
  {/each}
</ul>
```

#### Don’t: compute derived values in `$effect` (unnecessary and harder to reason about)

```svelte
<!-- file: src/routes/examples/derived-bad/+page.svelte -->
<script lang="ts">
  let query = $state('');
  let items = $state(['a', 'b', 'c']);
  let filtered = $state<string[]>([]);

  // Anti-pattern: $effect for pure derivation.
  $effect(() => {
    filtered = items.filter((x) => x.includes(query));
  });
</script>
```

Use `$derived` instead; `$effect` is for side effects.

---

### `$effect`

**Purpose:** Side effects, cleanup, lifecycle coordination.

**Variants:** `$effect`, `$effect.pre`, `$effect.root`.

#### Do: side effects with cleanup

```svelte
<!-- file: src/routes/examples/effect/+page.svelte -->
<script lang="ts">
  let open = $state(false);

  $effect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
</script>

<button onclick={() => (open = !open)}>Toggle</button>
{#if open}
  <div class="mt-3 p-4 card">Press Escape to close.</div>
{/if}
```

Cleanup functions are part of `$effect`’s contract.

#### Do: `$effect.pre` for “before paint” reads (rare)

```svelte
<!-- file: src/routes/examples/effect-pre/+page.svelte -->
<script lang="ts">
  let width = $state(0);
  let el = $state<HTMLElement | null>(null);

  $effect.pre(() => {
    if (el) width = el.getBoundingClientRect().width;
  });
</script>

<div bind:this={el} class="card p-4">Width: {width}px</div>
```

`$effect.pre` runs before the component is updated.

#### Don’t: use `$effect` to synchronise state that should be `$derived`

Prefer `$derived` when you can express “value = f(state)” directly.

---

### `$props`

**Purpose:** Runes-era props API (replaces `export let`).

**Typing:** Use `interface Props` and `$props<Props>()`.

#### Do: typed destructuring with defaults + renaming

```svelte
<!-- file: src/lib/components/ExampleCard.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    subtitle?: string;
    class?: string;
  }

  let { title, subtitle = '—', class: className = '' }: Props = $props();
</script>

<section class={`card p-4 ${className}`}>
  <h2 class="text-lg font-semibold">{title}</h2>
  <p class="opacity-70">{subtitle}</p>
</section>
```

#### Do: stable IDs via `$props.id()` (Svelte ≥ 5.20)

```svelte
<!-- file: src/lib/components/LabeledInput.svelte -->
<script lang="ts">
  interface Props {
    label: string;
    value?: string;
  }

  let { label, value = '' }: Props = $props();

  // Added in Svelte 5.20.0
  const id = $props.id();
</script>

<label for={id} class="text-sm opacity-80">{label}</label>
<input id={id} class="px-3 py-2 rounded border border-[hsl(var(--border))]" value={value} />
```

---

### `$bindable`

**Purpose:** Explicit two-way binding contract for component props.

#### Do: create a bindable `value` prop with default

```svelte
<!-- file: src/lib/components/CounterField.svelte -->
<script lang="ts">
  interface Props {
    value?: number;
    min?: number;
    max?: number;
  }

  let { value = $bindable(0), min = 0, max = 99 }: Props = $props();

  function inc() {
    value = Math.min(max, value + 1);
  }

  function dec() {
    value = Math.max(min, value - 1);
  }
</script>

<div class="hstack-2">
  <button onclick={dec} class="px-2 py-1 rounded border">-</button>
  <span class="w-8 text-center">{value}</span>
  <button onclick={inc} class="px-2 py-1 rounded border">+</button>
</div>
```

#### Don’t: “fake” two-way binding by mutating a non-bindable prop

Always use `$bindable` when you intend parent binding.

---

### `$inspect`

**Purpose:** Dev-only inspection of reactive changes.

`$inspect` is a dev-only rune; in production builds it becomes a noop, and it reruns when its argument changes.

```svelte
<!-- file: src/routes/examples/inspect/+page.svelte -->
<script lang="ts">
  let state = $state({ count: 0 });

  $inspect(state);
</script>

<button onclick={() => state.count++}>count: {state.count}</button>
```

> [!WARNING]
> Don’t rely on `$inspect` for production telemetry. It is a noop in production builds.

---

### Attachments: `{@attach ...}` + `svelte/attachments`

**Why attachments:** Attachments are element-level lifecycle hooks that replace many action-based patterns and can return cleanup logic.

#### Do: define and use an attachment

```ts
// file: src/lib/attachments/autofocus.ts
export type Attachment<T extends Element = Element> = (node: T) => void | (() => void);

export const autofocus: Attachment<HTMLInputElement> = (node) => {
  node.focus();
};
```

```svelte
<!-- file: src/routes/examples/attach/+page.svelte -->
<script lang="ts">
  import { autofocus } from '$lib/attachments/autofocus';
</script>

<input class="px-3 py-2 rounded border" placeholder="I autofocus" {@attach autofocus} />
```

#### Use action-to-attachment bridge when integrating libraries

`svelte/attachments` provides a utility to convert an action into an attachment while keeping behaviour, useful when migrating.

```ts
// file: src/lib/attachments/from-action.ts
import { fromAction } from 'svelte/attachments';
import type { Action } from 'svelte/action';

const tooltipAction: Action<HTMLElement, { text: string }> = (node, params) => {
  node.setAttribute('title', params.text);
  return {
    update(next) {
      node.setAttribute('title', next.text);
    },
    destroy() {}
  };
};

export const tooltip = fromAction(tooltipAction);
```

```svelte
<!-- file: src/routes/examples/from-action/+page.svelte -->
<script lang="ts">
  import { tooltip } from '$lib/attachments/from-action';
</script>

<button class="px-3 py-2 rounded border" {@attach tooltip(() => ({ text: 'Hello' }))}>
  Hover me
</button>
```

> [!NOTE]
> `fromAction` expects its second argument (if provided) to be a **function returning the action argument**, not the value itself.

#### Component-level attachment forwarding (advanced)

Svelte discussions note that using `{@attach ...}` on a component creates a prop keyed by a Symbol; spreading props onto an element forwards it, but handling it manually inside the component is tricky.
**Guideline:** Prefer forwarding attachments by spreading `...rest` props onto the element receiving the attachment.

---

### Snippets: `{#snippet ...}` and `{@render ...}` (no slots)

Svelte 5 replaces slots with snippets; slots are deprecated (still work, but avoid in new code).

#### Typed “children” snippet prop pattern

```svelte
<!-- file: src/lib/components/Panel.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children?: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<section class="card p-4">
  <h3 class="font-semibold">{title}</h3>
  <div class="mt-3">
    {@render children?.()}
  </div>
</section>
```

```svelte
<!-- file: src/routes/examples/panel/+page.svelte -->
<script lang="ts">
  import Panel from '$lib/components/Panel.svelte';
</script>

<Panel title="Hello">
  {#snippet children()}
    <p class="opacity-80">This is rendered via a snippet prop.</p>
  {/snippet}
</Panel>
```

Svelte docs show snippet props are typed with `Snippet` from `svelte`.

---

### Rune-era shared state in `.svelte.ts` modules (store replacement)

Svelte docs explicitly cover “Passing state across modules”: you can declare state in `.svelte.ts` files but **cannot export state that is directly reassigned**, because the compiler transforms references only within the file.

#### Canonical pattern: export a proxy object (mutate properties, don’t reassign binding)

```ts
// file: src/lib/state/session.svelte.ts
export type Session = {
  userId: string | null;
  email: string | null;
};

export const session = $state<Session>({
  userId: null,
  email: null
});

export function setSession(next: Session) {
  // mutate fields; do not reassign `session`
  session.userId = next.userId;
  session.email = next.email;
}

export function clearSession() {
  session.userId = null;
  session.email = null;
}
```

```svelte
<!-- file: src/routes/examples/shared-state/+page.svelte -->
<script lang="ts">
  import { session, setSession, clearSession } from '$lib/state/session.svelte';
</script>

<div class="card p-4">
  <div class="hstack-2">
    <button class="px-3 py-2 rounded border" onclick={() => setSession({ userId: 'u1', email: 'pb@example.com' })}>
      Sign in
    </button>
    <button class="px-3 py-2 rounded border" onclick={clearSession}>
      Sign out
    </button>
  </div>

  <pre class="mt-3 text-sm opacity-80">{JSON.stringify(session, null, 2)}</pre>
</div>
```

#### Anti-pattern: exporting a primitive state and reassigning it

```ts
// file: src/lib/state/counter-bad.svelte.ts
let count = $state(0);
export { count };

export function increment() {
  // Anti-pattern for cross-module usage:
  // compiler transforms references only in this file.
  count += 1;
}
```

---

## SvelteKit application architecture

### Routing and file conventions

SvelteKit uses file-based routing with `+page.svelte`, `+layout.svelte`, `+server.ts`, etc.

#### Root layout with snippets

```svelte
<!-- file: src/routes/+layout.svelte -->
<script lang="ts">
  let { children } = $props();
</script>

<div class="page-shell">
  {@render children()}
</div>
```

The SvelteKit routing docs show the default layout uses `{@render children()}`.

### Load functions

Use `+page.ts` (universal) or `+page.server.ts` (server-only). `load` runs server-side for SSR and client-side for navigations (when universal).

#### Universal load with typed output and streaming

```ts
// file: src/routes/products/+page.ts
import type { PageLoad } from './$types';

type Product = { id: string; name: string };

export const load: PageLoad = async ({ fetch }) => {
  const productsPromise: Promise<Product[]> = fetch('/api/products').then((r) => r.json());
  return { productsPromise };
};
```

```svelte
<!-- file: src/routes/products/+page.svelte -->
<script lang="ts">
  interface Data {
    productsPromise: Promise<{ id: string; name: string }[]>;
  }
  let { data }: { data: Data } = $props();
</script>

{#await data.productsPromise}
  <p class="opacity-70">Loading…</p>
{:then products}
  <ul class="grid gap-2">
    {#each products as p (p.id)}
      <li class="card p-3">{p.name}</li>
    {/each}
  </ul>
{:catch e}
  <p class="text-red-600">Error: {String(e)}</p>
{/await}
```

### Form actions + progressive enhancement

SvelteKit supports server actions in `+page.server.ts` and progressive enhancement via `use:enhance`.
Customising `use:enhance` enables pending states and optimistic UI.

```ts
// file: src/routes/profile/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
  default: async ({ request }) => {
    const fd = await request.formData();
    const displayName = String(fd.get('displayName') ?? '').trim();

    if (!displayName) return fail(400, { message: 'Display name required' });

    // Persist...
    return { ok: true, displayName };
  }
};
```

```svelte
<!-- file: src/routes/profile/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let submitting = $state(false);
  let msg = $state<string | null>(null);

  const formEnhance = enhance(() => {
    submitting = true;
    msg = null;

    return async ({ result, update }) => {
      await update(); // apply action result to `form` (if used)

      submitting = false;

      if (result.type === 'success') msg = 'Saved!';
      else msg = 'Failed to save.';
    };
  });
</script>

<form method="POST" use:formEnhance class="grid gap-3 card p-4">
  <label class="grid gap-1">
    <span class="text-sm opacity-80">Display name</span>
    <input name="displayName" class="px-3 py-2 rounded border" />
  </label>

  <button class="px-3 py-2 rounded border" disabled={submitting}>
    {submitting ? 'Saving…' : 'Save'}
  </button>

  {#if msg}
    <p class="text-sm opacity-80">{msg}</p>
  {/if}
</form>
```

### Hooks

Hooks are app-wide functions. There are three optional files: `src/hooks.server.*`, `src/hooks.client.*`, `src/hooks.*`. Hooks run when the app starts, useful for initialising DB clients.

#### `hooks.server.ts` middleware-like pattern with `locals`

```ts
// file: src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // attach per-request data
  event.locals.requestId = crypto.randomUUID();
  return resolve(event);
};

declare global {
  namespace App {
    interface Locals {
      requestId: string;
    }
  }
}
```

### API routes (`+server.ts`)

SvelteKit `+server` files can export HTTP method handlers (`GET`, `POST`, etc.).

```ts
// file: src/routes/api/products/+server.ts
import type { RequestHandler } from './$types';

type Product = { id: string; name: string };

const DATA: Product[] = [
  { id: 'p1', name: 'Bun' },
  { id: 'p2', name: 'Svelte' }
];

export const GET: RequestHandler = async () => {
  return Response.json(DATA);
};
```

### Error handling boundaries

SvelteKit documents that errors thrown inside `handle` or `+server` handlers do not render `+error.svelte`; `+error.svelte` is for page/layout errors.

```svelte
<!-- file: src/routes/+error.svelte -->
<script lang="ts">
  let { error, status } = $props<{ error: unknown; status: number }>();
</script>

<section class="card p-6">
  <h1 class="text-lg font-semibold">Error {status}</h1>
  <pre class="mt-4 text-sm opacity-70">{String(error)}</pre>
</section>
```

### Shallow routing + `pushState`/`replaceState` modal pattern

SvelteKit exposes shallow routing helpers `pushState`, `replaceState`, and state is accessible via `$app/state` `page.state`; `page.state` is shallow-reactive.

```svelte
<!-- file: src/routes/examples/modal/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { pushState, replaceState } from '$app/navigation';

  type ModalState = { modal?: 'details'; id?: string };

  function open(id: string) {
    pushState('', { ...(page.state as ModalState), modal: 'details', id } satisfies ModalState);
  }

  function close() {
    const next: ModalState = { ...(page.state as ModalState) };
    delete next.modal;
    delete next.id;
    replaceState('', next);
  }
</script>

<button class="px-3 py-2 rounded border" onclick={() => open('p1')}>
  Open modal
</button>

{#if (page.state as ModalState).modal === 'details'}
  <div class="mt-4 card p-4">
    <p>Modal for id: {(page.state as ModalState).id}</p>
    <button class="mt-3 px-3 py-2 rounded border" onclick={close}>Close</button>
  </div>
{/if}
```

### Prerendering and entries

SvelteKit page options include `prerender` (`true`/`false`/`'auto'`) and support specifying prerender targets via `kit.prerender.entries` or an `entries()` export from a dynamic route.

```ts
// file: src/routes/blog/[slug]/+page.server.ts
export const prerender = true;

// For dynamic routes, provide entries to prerender (when needed).
export const entries = async () => {
  return [{ slug: 'hello' }, { slug: 'runes' }];
};
```

---

## Styling system with UnoCSS Wind4 + shadcn tokens

### Wind4 differences that affect everyday code

Wind4:
- integrates a reset and should be used without a separate reset package for the reset baseline
- uses OKLCH colours and layered theme variables (`base`/`theme`/`properties`)
- changes theme keys (e.g. `radius` not `borderRadius`)
- is incompatible with `preset-legacy-compat` and recommends Wind3 if you need legacy support

### Utility conventions

Prefer class-based utilities for:
- default layout, spacing, typography, responsive variants
- component variants via `cn()` + variant utilities

UnoCSS configuration supports rules/shortcuts/theme/variants/extractors/preflights/layers/presets.

### Attributify mode

Only enable attributify if you enforce consistent conventions; otherwise stick to class strings (especially when using shadcn-style class composition). (Attributify is an UnoCSS integration option; choose deliberately.)

### Icons preset (`@unocss/preset-icons`)

Icons are typically used as classes. UnoCSS documents `preset-icons` integration via presets.

---

## shadcn-svelte patterns

### Installation and component locations

shadcn-svelte CLI usage in SvelteKit includes:
- `bun x shadcn-svelte@latest init`
- `bun x shadcn-svelte@latest add <component>`
- components live under `$lib/components/ui` and are imported from there.

```bash
# terminal
bun x shadcn-svelte@latest init
bun x shadcn-svelte@latest add button card dialog tabs dropdown-menu sidebar sonner
```

### Anatomy and customisation model

shadcn-svelte is a styled component set you copy into your repo, built on Bits UI primitives; you own the code and can customise it. A community discussion distinguishes Bits UI (headless primitives) from shadcn-svelte (styled, “you own it”).

Bits UI v1 migration notes:
- `asChild` replaced by `child` snippet
- `let:` directives replaced with snippet props
- transition props removed; use snippets and transitions instead

### `cn()` utility

shadcn-svelte’s Svelte 5 migration guide shows `cn()` is implemented with `clsx` + `tailwind-merge`.

```ts
// file: src/lib/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Example: Button wrapper (snippets-friendly, runes-only)

```svelte
<!-- file: src/lib/components/ui/button/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils/cn';

  interface Props {
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    class?: string;
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }

  let {
    variant = 'default',
    size = 'default',
    class: className = '',
    children,
    onclick,
    disabled = false,
    type = 'button'
  }: Props = $props();

  const base = 'inline-flex items-center justify-center rounded-[var(--radius)] text-sm font-medium transition-colors';
  const variants: Record<NonNullable<Props['variant']>, string> = {
    default: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90',
    secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90',
    outline: 'border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]',
    ghost: 'hover:bg-[hsl(var(--accent))]',
    destructive: 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90',
    link: 'underline underline-offset-4 hover:opacity-80'
  };
  const sizes: Record<NonNullable<Props['size']>, string> = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 px-3',
    lg: 'h-11 px-6',
    icon: 'h-10 w-10'
  };
</script>

<button
  class={cn(base, variants[variant], sizes[size], className)}
  disabled={disabled}
  type={type}
  onclick={onclick}
>
  {@render children?.()}
</button>
```

> [!NOTE]
> This wrapper uses **snippets** (`children?: Snippet` + `{@render ...}`) in line with Svelte 5’s slot deprecation and SvelteKit’s snippet-based routing layouts.

---

## State, forms, and data patterns

### State management decision table (runes-era)

| Use case | Preferred pattern | Why |
|---|---|---|
| Component-local UI state | `$state` | Minimal, direct mutation updates UI |
| Derived render values | `$derived` | Declarative computation; avoids effect bugs |
| Side effects / subscriptions | `$effect` | Cleanup + lifecycle support |
| Shared app state | `.svelte.ts` module exporting a proxy object | Compiler constraints for cross-module state |
| Tree-scoped state | `setContext/getContext` + `.svelte.ts` proxy | Limits state surface area |
| URL/shareable state | `page.url.searchParams` | Bookmarkable and shareable |
| Server state | `load` output + `invalidate/depends` | Built-in cache + invalidation |

### Forms and validation

#### Native actions + `use:enhance`

Use SvelteKit actions and `use:enhance` for progressive enhancement. Custom callbacks support pending and optimistic UI.

#### Superforms + Zod (recommended with shadcn forms)

Superforms docs:
- `superForm` returns `{ form, enhance }` for progressive enhancement
- file uploads require `enctype="multipart/form-data"` and recommend `fileProxy/filesProxy`
- v2 is a significant upgrade; Zod remains supported

**Server-side (Zod + `superValidate`)**

```ts
// file: src/routes/signup/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms/server';
import { zod } from 'sveltekit-superforms/adapters';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12)
});

export const load: PageServerLoad = async () => {
  const form = await superValidate(zod(SignupSchema));
  return { form };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(SignupSchema));
    if (!form.valid) return { form };

    // Persist user, etc.
    return { form };
  }
};
```

**Client-side (shadcn-style UI + Superforms enhance)**

```svelte
<!-- file: src/routes/signup/+page.svelte -->
<script lang="ts">
  import { superForm } from 'sveltekit-superforms/client';

  interface Data {
    form: unknown;
  }

  let { data } = $props<{ data: Data }>();

  const { form, enhance } = superForm(data.form);
</script>

<form method="POST" use:enhance class="card p-6 grid gap-4">
  <label class="grid gap-1">
    <span class="text-sm opacity-80">Email</span>
    <input name="email" class="px-3 py-2 rounded border" />
  </label>

  <label class="grid gap-1">
    <span class="text-sm opacity-80">Password</span>
    <input name="password" type="password" class="px-3 py-2 rounded border" />
  </label>

  <button class="px-3 py-2 rounded border" type="submit">Create account</button>

  <!-- `form` is a Superforms store-like proxy; render errors as needed -->
</form>
```

Superforms’ documented enhancement pattern uses `enhance` returned from `superForm`, and Superforms notes its `use:enhance` takes no arguments (events handle customisation).

### File uploads (Bun runtime + Superforms guidance)

Superforms requires `enctype="multipart/form-data"` for uploads and recommends `fileProxy/filesProxy`.

```svelte
<!-- file: src/routes/upload/+page.svelte -->
<script lang="ts">
  import { superForm } from 'sveltekit-superforms/client';
  let { data } = $props<{ data: { form: unknown } }>();
  const { enhance } = superForm(data.form);
</script>

<form method="POST" enctype="multipart/form-data" use:enhance class="card p-6 grid gap-4">
  <input type="file" name="file" />
  <button class="px-3 py-2 rounded border" type="submit">Upload</button>
</form>
```

---

### Data fetching patterns

#### Prefer `load` for initial page data

`load` runs in the right places and supports streaming.

#### Client-side fetch: `$effect` only for client-only after-mount behaviour

```svelte
<!-- file: src/routes/examples/client-fetch/+page.svelte -->
<script lang="ts">
  let data = $state<{ now: string } | null>(null);

  $effect(() => {
    let cancelled = false;

    (async () => {
      const r = await fetch('/api/now');
      const json = (await r.json()) as { now: string };
      if (!cancelled) data = json;
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<pre class="card p-4">{JSON.stringify(data, null, 2)}</pre>
```

---

### WebSockets with `svelte-adapter-bun` + Bun

`svelte-adapter-bun` documents WebSocket support via a `websocket` export in `hooks.server.ts`, and upgrading requests through `event.platform.server.upgrade(...)`.
Bun’s docs confirm `Bun.serve()` supports server-side websockets.

```ts
// file: src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const url = new URL(event.request.url);

  if (
    event.request.headers.get('connection')?.toLowerCase().includes('upgrade') &&
    event.request.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
    url.pathname.startsWith('/ws')
  ) {
    await event.platform.server.upgrade(event.platform.request);
    return new Response(null, { status: 101 });
  }

  return resolve(event);
};

export const websocket: Bun.WebSocketHandler<unknown> = {
  open(ws) {
    ws.send('connected');
  },
  message(ws, message) {
    ws.send(message);
  },
  close() {}
};
```

---

## Quality, performance, deployment, and conventions

### Testing

Svelte is unopinionated; it supports unit/component/e2e tests with frameworks like Vitest and Playwright.

#### Unit + component tests: Vitest + Testing Library

Svelte CLI add-on: `sv add vitest` installs packages and adds scripts/config for client/server-aware testing.
Svelte Testing Library setup recommends adding a Vitest config with the Svelte and `svelteTesting` Vite plugins and optionally a Vitest setup file.

```bash
# terminal
bunx sv add vitest="usages:unit,component"
bun add -d @testing-library/svelte @testing-library/jest-dom
```

```ts
// file: vitest.config.ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts']
  }
});
```

```ts
// file: vitest-setup.ts
import '@testing-library/jest-dom/vitest';
```

```ts
// file: src/lib/components/__tests__/Button.test.ts
import { render, screen } from '@testing-library/svelte';
import Button from '$lib/components/ui/button/Button.svelte';

import { describe, it, expect } from 'vitest';

describe('Button', () => {
  it('renders children', () => {
    render(Button, {
      props: {
        children: (() => 'Click') as unknown
      }
    });

    expect(screen.getByText('Click')).toBeInTheDocument();
  });
});
```

#### Bun’s built-in test runner (optional for non-Vite tests)

Bun includes a Jest-compatible test runner with TS support, snapshot testing, DOM testing, and preload.

```bash
# terminal
bun test
bun test --watch
```

> [!NOTE]
> Running Vitest itself “under bun” can be constrained by API compatibility (there are reports of missing essential APIs for some Vitest integrations).

#### E2E: Playwright

Svelte supports Playwright for E2E testing.

```bash
# terminal
bun add -d @playwright/test
bunx playwright install
```

```ts
// file: playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:4173'
  },
  webServer: {
    command: 'bun run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  }
});
```

---

### Performance and optimisation

#### Bun-native primitives (prefer over Node equivalents)

- `bun:sqlite` is a built-in SQLite driver and is benchmarked as faster than `better-sqlite3` for reads in Bun’s docs.
- `Bun.file` / `Bun.write` are heavily optimised and recommended for file I/O.
- `Bun.password.hash/verify` is Bun’s built-in password hashing utility.
- Bun WebSockets are built into `Bun.serve()` and advertised as high throughput.

```ts
// file: src/lib/server/db.ts
import { Database } from 'bun:sqlite';

export const db = new Database('data/app.sqlite');
db.exec(`
  create table if not exists users (
    id text primary key,
    email text not null,
    password_hash text not null
  );
`);
```

```ts
// file: src/lib/server/auth.ts
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
```

#### Svelte `$state.raw` for large read-only datasets

Use `$state.raw` to avoid deep-proxy overhead on large immutable datasets.

---

### Deployment with `svelte-adapter-bun`

Adapter usage:
- install adapter
- build with Vite
- run with Bun from the `build/` output directory

```bash
# terminal
bun run build
bun ./build/index.js
```

Adapter runtime configuration includes `HOST`, `PORT`, `ORIGIN` and `PROTOCOL_HEADER/HOST_HEADER` for reverse proxies.

---

### Code style and conventions

#### Naming

- Files: `kebab-case` for routes/util modules, `PascalCase` for components
- Components: keep UI components in `$lib/components/ui/*`

#### Formatting and linting with Biome

Biome supports Svelte out of the box since v2.3.0, including formatting the HTML/CSS/JS parts of Svelte files.
Biome is intentionally opinionated with limited options.

```jsonc
// file: biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "organizeImports": {
    "enabled": true
  },
  "files": {
    "ignore": ["build/**", ".svelte-kit/**", "dist/**"]
  }
}
```

---

### Common pitfalls and anti-patterns

Each pitfall below is backed by an API change or a known gotcha from the sources.

| Mistake | ❌ Wrong | ✅ Correct | Why |
|---|---|---|---|
| Importing `uno.css` in root `+layout.svelte` script (Safari/runic crash) | `// file: src/routes/+layout.svelte`<br>`<script lang="ts"> import 'uno.css'; </script>` | `// file: src/hooks.client.ts`<br>`import 'uno.css'; export {};` | Safari “Cannot access uninitialized variable” reported when importing in root layout script with Svelte 5 runes. |
| Forgetting UnoCSS extraction from `.ts` (missing classes in shadcn components) | `// file: uno.config.ts`<br>`content: { pipeline: { include: [/\\.svelte$/] } }` | `// file: uno.config.ts`<br>`content: { pipeline: { include: [/\\.svelte$/, /\\.ts$/, /\\.js$/] } }` | `unocss-preset-shadcn` warns UnoCSS doesn’t extract from `.ts/.js` by default; add them. |
| Expecting `$inspect` to run in production | `// file: any.svelte`<br>`$inspect(state)` | `// file: any.svelte`<br>`$effect(() => { console.log(state) })` | `$inspect` becomes a noop in production builds. |
| Using Wind3 theme keys in Wind4 (`borderRadius` instead of `radius`) | `// file: uno.config.ts`<br>`theme: { borderRadius: { md: '0.5rem' } }` | `// file: uno.config.ts`<br>`theme: { radius: { md: '0.5rem' } }` | Wind4 changes theme keys; `radius` is the correct key. |
| Using `$effect` for pure derivation | `// file: any.svelte`<br>`$effect(() => { derived = f(x) })` | `// file: any.svelte`<br>`let derived = $derived(f(x))` | `$derived` is the canonical derivation mechanism; `$effect` is for side effects. |
| Destructuring `$state` and expecting reactive locals | `const { name } = user;` | `let name = $derived(user.name);` | Svelte docs warn destructuring reactive values yields non-reactive references. |
| Exporting primitive `$state` across modules and reassigning it | `// file: state.svelte.ts`<br>`let count=$state(0); export { count }; count += 1;` | `// file: state.svelte.ts`<br>`export const counter = $state({ count: 0 }); counter.count += 1;` | Compiler transforms only within one file; exporting reassignable primitive state breaks cross-module expectations. |
| Treating Bits UI v1 like v0 (e.g. `asChild` expectation) | Using outdated props/behaviour | Use `child` snippet and snippet props | Bits UI migration: `asChild` replaced with `child` snippet; `let:` replaced with snippet props. |
| Assuming prerender is automatic for dynamic routes without entries | `export const prerender = true` only | Provide `entries()` or `kit.prerender.entries` as needed | Dynamic routes require discoverable entries or configured entries; docs explain `entries` and prerender crawl. |

---

## Quick reference cheat sheet

### Svelte 5 runes

```ts
// $state
let n = $state(0);
let obj = $state({ a: 1 });        // deep proxy
let raw = $state.raw(bigArray);    // avoid proxy

// $derived
let doubled = $derived(n * 2);
let computed = $derived.by(() => {
  // multi-step
  return obj.a + n;
});

// $effect
$effect(() => {
  // side effect
  return () => {/* cleanup */};
});

// $props
interface Props { class?: string }
let { class: className = '' }: Props = $props();

// $bindable
let { value = $bindable('') } = $props<{ value?: string }>();

// $inspect (dev only)
$inspect(obj);
```

### Snippets (no slots)

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props { children?: Snippet }
  let { children }: Props = $props();
</script>

{@render children?.()}
```

Svelte 5 replaces slots with snippets; slots are deprecated.

### UnoCSS essentials

- Vite plugin: `@unocss/vite` + import `uno.css` somewhere (use `hooks.client.ts` for Safari safety)
- Wind4: reset integrated; theme key changes like `radius`
- Add `.ts/.js` to extractor pipeline for shadcn code

### Bun essentials

- Start dev with Bun runtime: `bun --bun run dev`
- Adapter runtime server: `bun ./build/index.js`
- Prefer Bun APIs: `bun:sqlite`, `Bun.file`, `Bun.password`, WebSockets in `Bun.serve()`
