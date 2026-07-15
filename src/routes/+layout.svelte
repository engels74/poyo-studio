<script lang="ts">
import type { Snippet } from 'svelte';

interface Props {
  children: Snippet;
}

let { children }: Props = $props();
</script>

<div class="min-h-screen bg-stone-50 text-stone-950">
  {@render children()}
</div>
