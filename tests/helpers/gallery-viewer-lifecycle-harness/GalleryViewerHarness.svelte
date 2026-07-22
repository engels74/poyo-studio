<script lang="ts">
import GalleryViewer from '../../../src/lib/components/gallery/GalleryViewer.svelte';
import type { LibraryGroupDto } from '../../../src/lib/features/library/contracts';

const videoOutputId = 'gallery-playback-output';
const galleryGroups: LibraryGroupDto[] = [
  {
    jobId: 'gallery-playback-job',
    entryKey: 'gallery-playback',
    displayName: 'Lifecycle playback fixture',
    provider: 'Harness',
    modality: 'video',
    workflow: 'Lifecycle proof',
    publicModelId: 'gallery-viewer-lifecycle',
    promptExcerpt: 'A deterministic GalleryViewer lifecycle fixture.',
    createdAt: '2026-07-21T00:00:00.000Z',
    completedAt: '2026-07-21T00:00:00.000Z',
    outputCount: 1,
    verifiedOutputCount: 1,
    totalBytes: 0,
    favorite: false,
    pinned: false,
    aspectRatio: null,
    warning: null,
    tags: [],
    representative: {
      outputId: videoOutputId,
      mediaKind: 'video',
      contentType: 'video/mp4',
      fileName: 'gallery-playback.mp4',
      pixelWidth: null,
      pixelHeight: null,
      downloadState: 'verified',
      mediaUrl: '/gallery-playback.mp4'
    }
  },
  {
    jobId: 'gallery-followup-job',
    entryKey: 'gallery-followup',
    displayName: 'Lifecycle follow-up fixture',
    provider: 'Harness',
    modality: 'image',
    workflow: 'Lifecycle proof',
    publicModelId: 'gallery-viewer-lifecycle',
    promptExcerpt: 'A second item for selection-change lifecycle coverage.',
    createdAt: '2026-07-21T00:01:00.000Z',
    completedAt: '2026-07-21T00:01:00.000Z',
    outputCount: 1,
    verifiedOutputCount: 1,
    totalBytes: 0,
    favorite: false,
    pinned: false,
    aspectRatio: null,
    warning: null,
    tags: [],
    representative: {
      outputId: 'gallery-followup-output',
      mediaKind: 'image',
      contentType: 'image/png',
      fileName: 'gallery-landscape.png',
      pixelWidth: null,
      pixelHeight: null,
      downloadState: 'verified',
      mediaUrl: '/gallery-landscape.png'
    }
  }
];

let groups = $state<LibraryGroupDto[]>(galleryGroups);
let open = $state(false);
let selectedOutputId = $state<string | null>(videoOutputId);
let triggerElement = $state<HTMLElement | null>(null);
let viewerMounted = $state(true);

function openVideo(event: MouseEvent): void {
  groups = galleryGroups;
  selectedOutputId = videoOutputId;
  triggerElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  open = true;
}

function setParentOpenFalse(): void {
  open = false;
}

function removeSelectedGroup(): void {
  groups = [];
}

function unmountViewer(): void {
  viewerMounted = false;
}
</script>

<main>
  <h1>GalleryViewer lifecycle harness</h1>
  <p>Test-only controls are deliberately outside the dialog.</p>
  <div data-testid="gallery-viewer-parent-controls">
    <button type="button" onclick={openVideo}>Open video</button>
    <button type="button" onclick={setParentOpenFalse}>Set parent open false</button>
    <button type="button" onclick={removeSelectedGroup}>Remove selected group</button>
    <button type="button" onclick={unmountViewer}>Unmount viewer</button>
  </div>
</main>

{#if viewerMounted}
  <GalleryViewer bind:open bind:selectedOutputId bind:triggerElement {groups} />
{/if}
