<svelte:head>
  <title>Dashboard · Poyo Local Studio</title>
  <meta
    name="description"
    content="A local creative-media studio for Poyo image and video workflows."
  />
</svelte:head>

<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';
import Badge from '$lib/components/ui/Badge.svelte';
import LinkButton from '$lib/components/ui/LinkButton.svelte';
</script>

<div class="route-shell">
  <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="eyebrow-label">Local overview</p>
      <p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Account, durable work and verified local media will stay visible here as services come online.
      </p>
    </div>
    <div class="flex gap-2">
      <LinkButton href="/studio/image" variant="primary">
        <AppIcon name="image" size={16} />
        New image
      </LinkButton>
      <LinkButton href="/studio/video" variant="outline">
        <AppIcon name="video" size={16} />
        New video
      </LinkButton>
    </div>
  </div>

  <section aria-labelledby="system-overview-heading" class="border-y border-border py-3">
    <h2 id="system-overview-heading" class="sr-only">System overview</h2>
    <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <dt class="text-xs text-muted-foreground">Poyo balance</dt>
        <dd class="mt-1 flex items-center gap-2 text-sm font-semibold">
          <AppIcon name="wallet" size={15} /> Not connected
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Active and queued</dt>
        <dd class="mt-1 text-sm font-semibold">0 jobs</dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Local storage</dt>
        <dd class="mt-1 text-sm font-semibold">Not measured</dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Model registry</dt>
        <dd class="mt-1"><Badge tone="neutral">Not loaded</Badge></dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">Poyo connectivity</dt>
        <dd class="mt-1"><Badge tone="neutral">Not checked</Badge></dd>
      </div>
    </dl>
  </section>

  <div class="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
    <section aria-labelledby="work-heading">
      <div class="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <p class="eyebrow-label">Now</p>
          <h2 id="work-heading" class="mt-1 text-base font-semibold tracking-tight">Work in progress</h2>
        </div>
        <a class="focus-ring rounded text-xs font-semibold text-primary underline-offset-4 hover:underline" href="/jobs">View all jobs</a>
      </div>

      <div class="py-10 sm:py-14">
        <div class="max-w-xl">
          <div class="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <AppIcon name="activity" size={20} />
          </div>
          <h3 class="mt-4 text-base font-semibold">No generations have been submitted</h3>
          <p class="mt-2 font-serif text-base leading-7 text-muted-foreground">
            Your generations will appear here after they are submitted. Jobs and files stay tracked
            locally across browser refreshes.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <LinkButton href="/studio/image" variant="outline">Create an image</LinkButton>
            <LinkButton href="/studio/video" variant="ghost">Create a video</LinkButton>
          </div>
        </div>
      </div>
    </section>

    <aside aria-labelledby="attention-heading" class="border-t border-border pt-5 xl:border-t-0 xl:border-l xl:pl-6">
      <p class="eyebrow-label">Review</p>
      <h2 id="attention-heading" class="mt-1 text-base font-semibold tracking-tight">Needs attention</h2>
      <div class="mt-4 flex items-start gap-3 text-sm">
        <AppIcon name="success" size={17} class="mt-0.5 text-success" />
        <div>
          <p class="font-semibold">Nothing needs attention</p>
          <p class="mt-1 leading-5 text-muted-foreground">Failures and interrupted local work will appear here.</p>
        </div>
      </div>
    </aside>
  </div>

  <section aria-labelledby="recent-heading" class="border-t border-border pt-5">
    <div class="flex items-center justify-between gap-4">
      <div>
        <p class="eyebrow-label">Library</p>
        <h2 id="recent-heading" class="mt-1 text-base font-semibold tracking-tight">Recent generations</h2>
      </div>
      <a class="focus-ring rounded text-xs font-semibold text-primary underline-offset-4 hover:underline" href="/library">Open library</a>
    </div>
    <div class="mt-4 grid min-h-32 place-items-center rounded-lg bg-muted px-5 py-8 text-center">
      <p class="max-w-md text-sm leading-6 text-muted-foreground">
        Verified local images and videos will appear here as grouped generations, never as unrelated output files.
      </p>
    </div>
  </section>
</div>
