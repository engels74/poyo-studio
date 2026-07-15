import extractorSvelte from '@unocss/extractor-svelte';
import { presetWind4 } from '@unocss/preset-wind4';
import { defineConfig } from 'unocss';

export default defineConfig({
  extractors: [extractorSvelte()],
  presets: [
    presetWind4({
      preflights: {
        reset: true
      }
    })
  ],
  content: {
    pipeline: {
      include: [/\.svelte(?:\.(?:ts|js))?$/, /\.[jt]s$/]
    }
  }
});
