<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import Badge from '$lib/components/ui/Badge.svelte';
import ThemeToggle from '$lib/components/shell/ThemeToggle.svelte';
import { settingsNavigation } from '$lib/navigation';
</script>

<svelte:head>
  <title>Settings · Poyo Local Studio</title>
  <meta name="description" content="Configure local Poyo Studio behavior and privacy." />
</svelte:head>

<div class="route-shell">
  <div class="grid gap-8 lg:grid-cols-[13.75rem_minmax(0,42rem)]">
    <nav aria-label="Settings sections" class="lg:border-r lg:border-border lg:pr-5">
      <p class="eyebrow-label mb-2">Application</p>
      <ul class="m-0 flex list-none gap-1 overflow-x-auto p-0 lg:grid">
        {#each settingsNavigation as item (item.href)}
          <li>
            <a
              href={item.href}
              class="focus-ring flex min-h-9 items-center gap-2 whitespace-nowrap rounded-[var(--radius)] px-2.5 text-sm font-semibold text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
              class:bg-accent={item.href === '/settings'}
              class:text-accent-foreground={item.href === '/settings'}
              aria-current={item.href === '/settings' ? 'page' : undefined}
            >
              <AppIcon name={item.icon} size={16} />
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <section aria-labelledby="settings-overview-heading">
      <p class="eyebrow-label">Local configuration</p>
      <h2 id="settings-overview-heading" class="mt-1 text-base font-semibold tracking-tight">Studio preferences</h2>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">
        Environment configuration has precedence. Secrets, filesystem paths and diagnostics stay on the local server.
      </p>

      <div class="mt-6 divide-y divide-border border-y border-border">
        <section class="grid gap-3 py-5 sm:grid-cols-[1fr_auto]" aria-labelledby="api-settings-heading">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="api-settings-heading" class="section-heading">Poyo API access</h3>
              <Badge tone="neutral">Not configured</Badge>
            </div>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              Environment configuration is preferred and can never be silently overridden by a browser-entered key.
            </p>
          </div>
          <AppIcon name="shield" size={20} class="text-muted-foreground" />
        </section>

        <section class="grid gap-3 py-5 sm:grid-cols-[1fr_auto]" aria-labelledby="storage-settings-heading">
          <div>
            <h3 id="storage-settings-heading" class="section-heading">Media storage</h3>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              Local generations are retained indefinitely by default. Automatic cleanup remains opt-in.
            </p>
          </div>
          <AppIcon name="storage" size={20} class="text-muted-foreground" />
        </section>

        <section class="grid gap-3 py-5 sm:grid-cols-[1fr_auto]" aria-labelledby="appearance-settings-heading">
          <div>
            <h3 id="appearance-settings-heading" class="section-heading">Appearance</h3>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              Light is the initial default. Dark and system preferences are saved only in this browser.
            </p>
          </div>
          <ThemeToggle class="self-start border border-border bg-background shadow-[var(--shadow-xs)]" />
        </section>

        <section class="grid gap-3 py-5 sm:grid-cols-[1fr_auto]" aria-labelledby="remote-cleanup-heading">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="remote-cleanup-heading" class="section-heading">Remote Poyo cleanup</h3>
              <Badge tone="neutral">Unavailable</Badge>
            </div>
            <p class="mt-1 text-sm leading-6 text-muted-foreground">
              No active control is shown until a documented or verified remote deletion endpoint exists.
            </p>
          </div>
          <AppIcon name="pending" size={20} class="text-muted-foreground" />
        </section>
      </div>
    </section>
  </div>
</div>
