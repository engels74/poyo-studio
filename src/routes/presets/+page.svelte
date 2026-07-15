<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import LinkButton from '$lib/components/ui/LinkButton.svelte';
</script>

<svelte:head>
  <title>Presets · Poyo Local Studio</title>
  <meta name="description" content="Manage reusable Poyo generation configurations." />
</svelte:head>

<div class="route-shell">
  <section aria-labelledby="preset-list-heading">
    <div class="border-b border-border pb-4">
      <p class="eyebrow-label">Reusable setup</p>
      <h2 id="preset-list-heading" class="mt-1 text-base font-semibold tracking-tight">Saved presets</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Presets retain guided settings and input-role expectations, not large source media or credentials.
      </p>
    </div>

    <div class="grid min-h-[28rem] place-items-center py-12 text-center">
      <div class="max-w-lg">
        <div class="mx-auto grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground">
          <AppIcon name="presets" size={21} />
        </div>
        <h3 class="mt-4 text-base font-semibold">No presets saved</h3>
        <p class="mt-2 font-serif text-base leading-7 text-muted-foreground">
          Save a verified model configuration from either studio, then reuse it without rebuilding every
          compatible option.
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <LinkButton href="/studio/image" variant="primary">Open Image Studio</LinkButton>
          <LinkButton href="/studio/video" variant="outline">Open Video Studio</LinkButton>
        </div>
      </div>
    </div>
  </section>
</div>
