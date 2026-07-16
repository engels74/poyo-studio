<script lang="ts">
import type { Snippet } from 'svelte';
import { page } from '$app/state';
import AppShell from '$lib/components/shell/AppShell.svelte';
import { isThemePreference, resolveTheme, themeStorageKey } from '$lib/theme';
import '../app.css';
import type { LayoutData } from './$types';

interface Props {
  children: Snippet;
  data: LayoutData;
}

let { children, data }: Props = $props();

let bare = $derived(page.url.pathname === '/welcome');

// Seed a brand-new browser (no stored preference yet) from the installation's default theme so
// the choice made during onboarding carries across devices without exposing anything sensitive.
$effect(() => {
  if (localStorage.getItem(themeStorageKey)) return;
  const preference = isThemePreference(data.themeDefault) ? data.themeDefault : 'light';
  localStorage.setItem(themeStorageKey, preference);
  const resolved = resolveTheme(
    preference,
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
});
</script>

{#if bare}
  {@render children()}
{:else}
  <AppShell summary={data.shellSummary}>
    {@render children()}
  </AppShell>
{/if}
