import type { Config } from '@sveltejs/kit';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from 'svelte-adapter-bun';

const config: Config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true
  },
  kit: {
    adapter: adapter({
      out: 'build',
      precompress: true,
      serveAssets: true
    })
  }
};

export default config;
