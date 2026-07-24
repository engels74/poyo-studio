<script lang="ts">
import { onMount } from 'svelte';
import { invalidateAll } from '$app/navigation';
import JobDetailView from '$lib/components/library/JobDetailView.svelte';
import { nextMonotonicEventId } from '$lib/features/generation/studio-controller';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
let lastEventId = -1;

function acceptDurableEvent(event: MessageEvent<string>): boolean {
  const next = nextMonotonicEventId(lastEventId, event.lastEventId);
  if (next === null) return false;
  lastEventId = next;
  return true;
}

onMount(() => {
  const events = new EventSource('/api/events/jobs');
  events.addEventListener('snapshot', (event) => {
    acceptDurableEvent(event as MessageEvent<string>);
  });
  events.addEventListener('job', (event) => {
    if (!acceptDurableEvent(event as MessageEvent<string>)) return;
    void invalidateAll();
  });
  return () => events.close();
});
</script>

<svelte:head><title>{data.job.displayName} · Jobs · Poyo Local Studio</title></svelte:head>
{#key data.job.id}
  <JobDetailView job={data.job} imageNavigation={data.imageNavigation} />
{/key}
