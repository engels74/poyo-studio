<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import LinkButton from '$lib/components/ui/LinkButton.svelte';

const filters = ['All', 'Queued', 'Running', 'Completed', 'Failed', 'Needs attention', 'Stale'];
</script>

<svelte:head>
  <title>Jobs · Poyo Local Studio</title>
  <meta name="description" content="Inspect durable local jobs and their Poyo task lifecycle." />
</svelte:head>

<div class="route-shell">
  <section aria-labelledby="jobs-summary-heading">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="eyebrow-label">Durable queue</p>
        <h2 id="jobs-summary-heading" class="mt-1 text-base font-semibold tracking-tight">Generation history</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Poyo task state, local downloads and safe recovery actions remain separate so a delayed status
          check never becomes a false generation failure.
        </p>
      </div>
      <button class="focus-ring inline-flex min-h-9 items-center gap-2 rounded-[var(--radius)] border border-border bg-background px-3 text-sm font-semibold shadow-[var(--shadow-xs)]" type="button">
        <AppIcon name="refresh" size={16} />
        Refresh statuses
      </button>
    </div>

    <nav class="mt-5 flex gap-1 overflow-x-auto border-b border-border pb-px" aria-label="Job status filters">
      {#each filters as filter, index (filter)}
        <a
          href={index === 0 ? '/jobs' : `/jobs?status=${filter.toLowerCase().replaceAll(' ', '-')}`}
          class="focus-ring -mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold no-underline"
          class:border-primary={index === 0}
          class:text-foreground={index === 0}
          class:border-transparent={index !== 0}
          class:text-muted-foreground={index !== 0}
          aria-current={index === 0 ? 'page' : undefined}
        >
          {filter}
        </a>
      {/each}
    </nav>

    <div class="py-12 sm:py-16">
      <div class="mx-auto max-w-xl text-center">
        <div class="mx-auto grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground">
          <AppIcon name="jobs" size={21} />
        </div>
        <h3 class="mt-4 text-base font-semibold">No jobs yet</h3>
        <p class="mt-2 font-serif text-base leading-7 text-muted-foreground">
          Submitted work will persist here while the local server uploads, polls and verifies downloads in
          the background.
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <LinkButton href="/studio/image" variant="primary">Open Image Studio</LinkButton>
          <LinkButton href="/studio/video" variant="outline">Open Video Studio</LinkButton>
        </div>
      </div>
    </div>
  </section>
</div>
