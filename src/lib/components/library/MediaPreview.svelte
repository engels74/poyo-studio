<script lang="ts">
import AppIcon from '$lib/components/ui/AppIcon.svelte';

interface Props {
  mediaKind: 'image' | 'video';
  src: string | null;
  alt: string;
  class?: string;
  controls?: boolean;
}

let { mediaKind, src, alt, class: className = '', controls = false }: Props = $props();
</script>

<div class={`relative overflow-hidden bg-stage text-stage-foreground ${className}`}>
  {#if src && mediaKind === 'image'}
    <img class="size-full object-cover" {src} {alt} loading="lazy" decoding="async" />
  {:else if src && mediaKind === 'video'}
    <!-- svelte-ignore a11y_media_has_caption -- generated media does not provide a caption track -->
    <video
      class="size-full object-cover"
      {src}
      aria-label={alt}
      preload="metadata"
      {controls}
      playsinline
    ></video>
  {:else}
    <div class="grid size-full min-h-28 place-items-center px-4 text-center text-muted-foreground">
      <div>
        <AppIcon name={mediaKind} size={24} class="mx-auto" />
        <p class="mt-2 text-xs font-semibold">Local preview unavailable</p>
      </div>
    </div>
  {/if}
</div>
