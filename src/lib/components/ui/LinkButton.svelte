<script lang="ts">
import type { Snippet } from 'svelte';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';

interface Props {
  children: Snippet;
  href: string;
  variant?: Variant;
  class?: string;
}

let { children, href, variant = 'secondary', class: className = '' }: Props = $props();

const variants: Record<Variant, string> = {
  primary: 'border-primary bg-primary text-primary-foreground hover:brightness-95',
  secondary:
    'border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
  outline: 'border-border bg-background text-foreground hover:bg-muted',
  ghost: 'border-transparent bg-transparent text-foreground shadow-none hover:bg-muted'
};

let classes = $derived(
  `focus-ring inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] border px-3.5 text-sm font-semibold no-underline shadow-[var(--shadow-xs)] transition-colors ${variants[variant]} ${className}`
);
</script>

<a {href} class={classes}>
  {@render children()}
</a>
