import { mount } from 'svelte';
import 'uno.css';
import '../../../src/app.css';
import GalleryViewerHarness from './GalleryViewerHarness.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('GalleryViewer lifecycle harness root is missing.');
}

mount(GalleryViewerHarness, { target });
