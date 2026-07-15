<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import Badge from '$lib/components/ui/Badge.svelte';
import { settingsNavigation } from '$lib/navigation';

let copied = $state(false);

const report = [
  'Poyo Local Studio 0.1.0',
  'Runtime target: Bun 1.3.14',
  'Listener policy: loopback only',
  'Database schema: not initialized',
  'Model registry: not loaded',
  'Poyo connectivity: not checked',
  'Secrets: redacted'
].join('\n');

async function copyReport(): Promise<void> {
  await navigator.clipboard.writeText(report);
  copied = true;
  window.setTimeout(() => (copied = false), 1800);
}
</script>

<svelte:head>
  <title>Diagnostics · Poyo Local Studio</title>
  <meta name="description" content="Inspect safe redacted local application health." />
</svelte:head>

<div class="route-shell">
  <div class="grid gap-8 lg:grid-cols-[13.75rem_minmax(0,46rem)]">
    <nav aria-label="Settings sections" class="lg:border-r lg:border-border lg:pr-5">
      <p class="eyebrow-label mb-2">Application</p>
      <ul class="m-0 flex list-none gap-1 overflow-x-auto p-0 lg:grid">
        {#each settingsNavigation as item (item.href)}
          <li>
            <a
              href={item.href}
              class="focus-ring flex min-h-9 items-center gap-2 whitespace-nowrap rounded-[var(--radius)] px-2.5 text-sm font-semibold text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
              class:bg-accent={item.href === '/settings/diagnostics'}
              class:text-accent-foreground={item.href === '/settings/diagnostics'}
              aria-current={item.href === '/settings/diagnostics' ? 'page' : undefined}
            >
              <AppIcon name={item.icon} size={16} />
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <section aria-labelledby="diagnostics-heading">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="eyebrow-label">Redacted report</p>
          <h2 id="diagnostics-heading" class="mt-1 text-base font-semibold tracking-tight">Application diagnostics</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            This view never includes API keys, authorization headers, complete payloads or unredacted local paths.
          </p>
        </div>
        <button
          type="button"
          class="focus-ring inline-flex min-h-9 items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3 text-sm font-semibold shadow-[var(--shadow-xs)] hover:bg-muted"
          onclick={copyReport}
        >
          <AppIcon name={copied ? 'success' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>

      <div class="mt-6 divide-y divide-border border-y border-border">
        <div class="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <span class="text-xs font-medium text-muted-foreground">Application</span>
          <span class="font-mono text-sm">Poyo Local Studio 0.1.0</span>
          <Badge tone="success">Loaded</Badge>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <span class="text-xs font-medium text-muted-foreground">Runtime target</span>
          <span class="font-mono text-sm">Bun 1.3.14 · SvelteKit 2</span>
          <Badge tone="neutral">Configured</Badge>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <span class="text-xs font-medium text-muted-foreground">Network exposure</span>
          <span class="font-mono text-sm">127.0.0.1 by default</span>
          <Badge tone="success">Loopback</Badge>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <span class="text-xs font-medium text-muted-foreground">Database schema</span>
          <span class="text-sm">Not initialized in this milestone</span>
          <Badge tone="neutral">Pending</Badge>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <span class="text-xs font-medium text-muted-foreground">Model registry</span>
          <span class="text-sm">No audited registry loaded</span>
          <Badge tone="neutral">Unavailable</Badge>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-center">
          <span class="text-xs font-medium text-muted-foreground">Poyo API</span>
          <span class="text-sm">Connectivity test has not run</span>
          <Badge tone="neutral">Not checked</Badge>
        </div>
      </div>

      <div class="mt-6 flex items-start gap-3 rounded-[var(--radius)] bg-muted px-4 py-3">
        <AppIcon name="shield" size={18} class="mt-0.5 shrink-0 text-muted-foreground" />
        <p class="text-sm leading-6 text-muted-foreground">
          Diagnostic exports are designed to be safe to share, but they should still be reviewed before leaving the local machine.
        </p>
      </div>
    </section>
  </div>
</div>
