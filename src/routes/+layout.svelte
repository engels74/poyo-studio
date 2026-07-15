<script lang="ts">
import type { Snippet } from 'svelte';
import AppShell from '$lib/components/shell/AppShell.svelte';
import '../app.css';
import type { LayoutData } from './$types';

interface Props {
  children: Snippet;
  data: LayoutData;
}

let { children, data }: Props = $props();
</script>

<AppShell summary={data.shellSummary}>
  {@render children()}
</AppShell>
