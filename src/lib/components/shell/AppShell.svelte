<script lang="ts">
import { afterNavigate } from '$app/navigation';
import { page } from '$app/state';
import { onMount, type Snippet } from 'svelte';
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import Badge from '$lib/components/ui/Badge.svelte';
import Sheet from '$lib/components/ui/Sheet.svelte';
import {
  getRouteTitle,
  isPathActive,
  isStudioPath,
  mobileNavigation,
  moreNavigation,
  navigationGroups
} from '$lib/navigation';
import ThemeToggle from './ThemeToggle.svelte';

interface Props {
  children: Snippet;
}

let { children }: Props = $props();
let sidebarCollapsed = $state(false);
let mobileMoreOpen = $state(false);
let routeAnnouncement = $state('');
let initialNavigation = true;

let pathname = $derived(page.url.pathname);
let routeTitle = $derived(getRouteTitle(pathname));
let studioRoute = $derived(isStudioPath(pathname));

function toggleSidebar(): void {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem('poyo-studio-sidebar-collapsed', String(sidebarCollapsed));
}

function closeMobileMore(): void {
  mobileMoreOpen = false;
}

onMount(() => {
  const stored = localStorage.getItem('poyo-studio-sidebar-collapsed');
  sidebarCollapsed = stored === null ? window.innerWidth < 1536 : stored === 'true';
});

afterNavigate(() => {
  routeAnnouncement = `${getRouteTitle(page.url.pathname)} page loaded`;
  if (initialNavigation) {
    initialNavigation = false;
    return;
  }

  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-route-heading]')?.focus();
  });
});
</script>

<a class="skip-link" href="#workspace">Skip to workspace</a>
{#if studioRoute}
  <a class="skip-link left-[10.5rem]" href="#parameter-inspector">Skip to inspector</a>
{/if}

<div class="app-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
  <aside class="app-sidebar" aria-label="Application sidebar">
    <div class="flex h-[4.25rem] shrink-0 items-center gap-3 px-4">
      <a class="focus-ring flex min-w-0 items-center gap-3 rounded-[var(--radius)] no-underline" href="/">
        <img
          src="/poyo-local-studio-logo.svg"
          alt=""
          class="size-9 shrink-0"
          width="36"
          height="36"
        />
        <span class="sidebar-copy min-w-0">
          <span class="block truncate text-sm font-semibold tracking-tight text-foreground">Poyo Studio</span>
          <span class="block truncate text-[0.6875rem] text-muted-foreground">Local creative workspace</span>
        </span>
      </a>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 pb-3" aria-label="Primary navigation">
      {#each navigationGroups as group (group.label)}
        <div class="mb-4">
          <p class="sidebar-group-label mb-1 px-2 text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul class="m-0 grid list-none gap-0.5 p-0">
            {#each group.items as item (item.href)}
              {@const active = isPathActive(pathname, item.href)}
              <li>
                <a
                  class="sidebar-nav-link focus-ring relative flex min-h-9 items-center gap-3 rounded-[var(--radius)] px-2.5 text-sm font-medium text-muted-foreground no-underline hover:bg-background/70 hover:text-foreground"
                  class:bg-accent={active}
                  class:text-accent-foreground={active}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {#if active}
                    <span class="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true"></span>
                  {/if}
                  <AppIcon name={item.icon} size={18} />
                  <span class="sidebar-copy truncate">{item.label}</span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </nav>

    <div class="border-t border-border px-2 py-2">
      <a
        href="/jobs"
        class="sidebar-utility focus-ring flex min-h-10 items-center gap-3 rounded-[var(--radius)] px-2.5 text-muted-foreground no-underline hover:bg-background/70 hover:text-foreground"
        title={sidebarCollapsed ? 'No active jobs' : undefined}
      >
        <span class="relative">
          <AppIcon name="activity" size={18} />
          <span class="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-muted text-[0.5625rem] font-bold text-muted-foreground">0</span>
        </span>
        <span class="sidebar-value-copy min-w-0">
          <span class="block text-xs font-semibold text-foreground">No active jobs</span>
          <span class="block text-[0.6875rem]">Queue is clear</span>
        </span>
      </a>

      <a
        href="/settings"
        class="sidebar-utility focus-ring mt-0.5 flex min-h-10 items-center gap-3 rounded-[var(--radius)] px-2.5 text-muted-foreground no-underline hover:bg-background/70 hover:text-foreground"
        title={sidebarCollapsed ? 'Balance not connected' : undefined}
      >
        <AppIcon name="wallet" size={18} />
        <span class="sidebar-value-copy min-w-0">
          <span class="block text-xs font-semibold text-foreground">Balance unavailable</span>
          <span class="block text-[0.6875rem]">Connect Poyo to refresh</span>
        </span>
      </a>

      <div class="mt-0.5 flex items-center" class:justify-center={sidebarCollapsed}>
        <ThemeToggle showLabel={!sidebarCollapsed} class={sidebarCollapsed ? 'px-2' : 'flex-1'} />
      </div>
      <button
        type="button"
        class="sidebar-utility focus-ring mt-0.5 flex min-h-9 w-full items-center gap-3 rounded-[var(--radius)] px-2.5 text-sm font-medium text-muted-foreground hover:bg-background/70 hover:text-foreground"
        aria-label={sidebarCollapsed ? 'Expand application sidebar' : 'Collapse application sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onclick={toggleSidebar}
      >
        <AppIcon name={sidebarCollapsed ? 'panel-open' : 'panel-close'} size={18} />
        <span class="sidebar-copy">{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
      </button>
    </div>
  </aside>

  <div class="app-main">
    <header class="context-bar" aria-label="Page context">
      <div class="min-w-0">
        <p class="hidden text-[0.6875rem] font-medium text-muted-foreground sm:block">Poyo Local Studio</p>
        <h1
          class="route-heading truncate text-lg font-semibold tracking-tight sm:text-xl"
          data-route-heading
          tabindex="-1"
        >
          {routeTitle}
        </h1>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Badge tone="neutral" class="hidden sm:inline-flex">
          <AppIcon name="server" size={13} />
          Local session
        </Badge>
        <ThemeToggle showLabel={false} class="lg:hidden" />
      </div>
    </header>

    <main id="workspace" class="route-workspace">
      {@render children()}
    </main>
  </div>

  <nav class="mobile-bottom-nav" aria-label="Primary mobile navigation">
    {#each mobileNavigation as item (item.href)}
      {@const active = isPathActive(pathname, item.href)}
      <a class="mobile-nav-item focus-ring" href={item.href} aria-current={active ? 'page' : undefined}>
        <AppIcon name={item.icon} size={18} />
        <span>{item.label.replace(' Studio', '')}</span>
      </a>
    {/each}

    <Sheet
      bind:open={mobileMoreOpen}
      side="bottom"
      title="More destinations"
      description="Models, presets, settings and local application status."
      triggerClass="mobile-nav-item focus-ring border-0 bg-transparent"
    >
      {#snippet trigger()}
        <AppIcon name="more" size={18} />
        <span>More</span>
      {/snippet}

      <div class="px-4 py-4">
        <nav aria-label="More navigation" class="grid gap-1">
          {#each moreNavigation as item (item.href)}
            <a
              class="focus-ring flex min-h-12 items-center gap-3 rounded-[var(--radius)] px-3 text-sm font-semibold text-foreground no-underline hover:bg-muted"
              href={item.href}
              onclick={closeMobileMore}
            >
              <AppIcon name={item.icon} size={19} />
              <span class="min-w-0 flex-1">
                <span class="block">{item.label}</span>
                <span class="block truncate text-xs font-normal text-muted-foreground">{item.description}</span>
              </span>
              <AppIcon name="chevron-right" size={16} />
            </a>
          {/each}
        </nav>

        <div class="mt-4 border-t border-border pt-4">
          <div class="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            <span class="text-muted-foreground">Active jobs</span>
            <span class="font-semibold">0</span>
          </div>
          <div class="flex items-center justify-between gap-4 px-3 py-2 text-sm">
            <span class="text-muted-foreground">Poyo balance</span>
            <span class="font-semibold">Not connected</span>
          </div>
          <ThemeToggle class="mt-2 w-full justify-start" />
        </div>
      </div>
    </Sheet>
  </nav>

  <div class="sr-only" aria-live="polite" aria-atomic="true">{routeAnnouncement}</div>
</div>
