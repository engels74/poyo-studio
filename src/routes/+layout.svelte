<script lang="ts">
import type { Snippet } from 'svelte';
import AppShell from '$lib/components/shell/AppShell.svelte';
import '../app.css';

interface Props {
  children: Snippet;
}

let { children }: Props = $props();
</script>

<AppShell>
  {@render children()}
</AppShell>
