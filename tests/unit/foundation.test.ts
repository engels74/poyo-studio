import { describe, expect, test } from 'bun:test';

interface PackageManifest {
  packageManager: string;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

const expectedVersions = {
  '@biomejs/biome': '2.5.4',
  '@sveltejs/kit': '2.69.3',
  '@sveltejs/vite-plugin-svelte': '7.2.0',
  '@unocss/extractor-svelte': '66.7.5',
  '@unocss/preset-wind4': '66.7.5',
  '@unocss/vite': '66.7.5',
  svelte: '5.56.5',
  'svelte-adapter-bun': '1.0.1',
  'svelte-check': '4.7.2',
  typescript: '5.9.3',
  unocss: '66.7.5',
  vite: '8.1.4'
} as const;

describe('Bun SvelteKit foundation', () => {
  test('pins the verified runtime and dependency baseline', async () => {
    const manifest = (await Bun.file('package.json').json()) as PackageManifest;

    expect(Bun.version).toBe('1.3.14');
    expect(manifest.packageManager).toBe('bun@1.3.14');
    expect(manifest.scripts.dev).toBe('bun --bun vite dev --host 127.0.0.1');
    expect(manifest.devDependencies).toMatchObject(expectedVersions);
  });

  test('uses the Bun adapter and UnoCSS before SvelteKit', async () => {
    const svelteConfig = await Bun.file('svelte.config.ts').text();
    const viteConfig = await Bun.file('vite.config.ts').text();
    const clientHook = await Bun.file('src/hooks.client.ts').text();

    expect(svelteConfig).toContain("from 'svelte-adapter-bun'");
    expect(svelteConfig).not.toContain('adapter-node');
    expect(viteConfig.indexOf('UnoCSS()')).toBeGreaterThan(-1);
    expect(viteConfig.indexOf('UnoCSS()')).toBeLessThan(viteConfig.indexOf('sveltekit()'));
    expect(clientHook).toContain("import 'uno.css'");
  });

  test('does not activate Tailwind or Node package managers', async () => {
    const manifest = await Bun.file('package.json').text();

    expect(manifest).not.toContain('tailwind');
    expect(await Bun.file('package-lock.json').exists()).toBe(false);
    expect(await Bun.file('pnpm-lock.yaml').exists()).toBe(false);
    expect(await Bun.file('yarn.lock').exists()).toBe(false);
  });
});
