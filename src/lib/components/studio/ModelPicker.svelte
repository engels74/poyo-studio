<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte';
import { workflowLabel } from '$lib/features/generation/studio-controller';
import type { StudioEntry } from '$lib/features/generation/contracts';

interface Props {
  entries: StudioEntry[];
  selectedKey: string;
  favorites: string[];
  onchange: (entry: StudioEntry) => void;
}

let { entries, selectedKey, favorites, onchange }: Props = $props();
let query = $state('');
let id = $props.id();
let filtered = $derived(
  entries.filter((entry) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [entry.displayName, entry.provider, entry.family, entry.publicModelId]
      .join(' ')
      .toLocaleLowerCase()
      .includes(needle);
  })
);
</script>

<fieldset class="grid gap-2">
  <legend class="text-xs font-semibold">Audited model</legend>
  <label class="sr-only" for={`${id}-search`}>Search audited models</label>
  <input
    id={`${id}-search`}
    type="search"
    class="focus-ring h-9 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm"
    placeholder="Search models or providers"
    bind:value={query}
  />
  <div class="grid max-h-72 gap-1.5 overflow-y-auto pr-1" aria-live="polite">
    {#each filtered as entry (entry.key)}
      <label
        class="focus-within:ring-2 focus-within:ring-ring cursor-pointer rounded-[var(--radius)] border bg-background px-3 py-2.5"
        class:border-primary={entry.key === selectedKey}
        class:border-border={entry.key !== selectedKey}
      >
        <input
          class="sr-only"
          type="radio"
          name={`${id}-model`}
          value={entry.key}
          checked={entry.key === selectedKey}
          onchange={() => onchange(entry)}
        />
        <span class="flex items-start justify-between gap-2">
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold">
              {favorites.includes(entry.key) ? '★ ' : ''}{entry.displayName}
            </span>
            <span class="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">
              {entry.provider} · {entry.family}
            </span>
          </span>
          <Badge tone={entry.status === 'current' ? 'success' : 'neutral'}>{entry.status}</Badge>
        </span>
        <span class="mt-2 flex flex-wrap gap-1 text-[0.6875rem] text-muted-foreground">
          <span>{workflowLabel(entry.workflow)}</span>
          <span aria-hidden="true">·</span>
          <span>{entry.inputRoles.length ? `${entry.inputRoles.length} media role${entry.inputRoles.length === 1 ? '' : 's'}` : 'Prompt only'}</span>
        </span>
      </label>
    {:else}
      <p class="rounded-[var(--radius)] bg-muted px-3 py-4 text-sm text-muted-foreground">
        No audited model matches “{query}”.
      </p>
    {/each}
  </div>
</fieldset>
