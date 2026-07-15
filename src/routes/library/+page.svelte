<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import LinkButton from '$lib/components/ui/LinkButton.svelte';
</script>

<svelte:head>
  <title>Library · Poyo Local Studio</title>
  <meta name="description" content="Browse verified local image and video generations." />
</svelte:head>

<div class="route-shell">
  <section aria-labelledby="library-tools-heading">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow-label">Local media</p>
        <h2 id="library-tools-heading" class="mt-1 text-base font-semibold tracking-tight">Generation groups</h2>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          Outputs from one Poyo task stay together with their prompt, model and local verification state.
        </p>
      </div>
      <div class="flex items-center gap-1 rounded-[var(--radius)] bg-muted p-1" aria-label="Library view">
        <button class="focus-ring grid size-8 place-items-center rounded bg-background text-foreground shadow-[var(--shadow-xs)]" type="button" aria-label="Grid view" aria-pressed="true">
          <AppIcon name="grid" size={16} />
        </button>
        <button class="focus-ring grid size-8 place-items-center rounded text-muted-foreground hover:text-foreground" type="button" aria-label="List view" aria-pressed="false">
          <AppIcon name="list" size={16} />
        </button>
      </div>
    </div>

    <div class="mt-5 flex flex-col gap-2 border-y border-border py-3 sm:flex-row">
      <form action="/library" method="GET" class="relative min-w-0 flex-1">
        <label for="library-search" class="sr-only">Search local media</label>
        <AppIcon name="search" size={16} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <input id="library-search" name="q" type="search" class="focus-ring h-9 w-full rounded-[var(--radius)] border border-input bg-background pr-3 pl-9 text-sm" placeholder="Search prompts, filenames, models or tags" />
      </form>
      <button type="button" class="focus-ring inline-flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3 text-sm font-semibold shadow-[var(--shadow-xs)]">
        <AppIcon name="filters" size={16} /> Filters
      </button>
    </div>

    <div class="grid min-h-[24rem] place-items-center py-12 text-center">
      <div class="max-w-lg">
        <div class="mx-auto grid size-12 place-items-center rounded-lg bg-stage text-stage-foreground shadow-[inset_0_0_0_1px_var(--stage-border)]">
          <AppIcon name="library" size={22} />
        </div>
        <h3 class="mt-4 text-base font-semibold">Your local library is empty</h3>
        <p class="mt-2 font-serif text-base leading-7 text-muted-foreground">
          Successful outputs will be downloaded atomically, verified, and grouped here without automatic
          local deletion.
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <LinkButton href="/studio/image" variant="primary">Create media</LinkButton>
          <LinkButton href="/settings" variant="outline">
            <AppIcon name="storage" size={16} /> Storage settings
          </LinkButton>
        </div>
      </div>
    </div>
  </section>
</div>
