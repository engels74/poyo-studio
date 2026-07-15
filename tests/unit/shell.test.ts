import { describe, expect, test } from 'bun:test';
import {
  getRouteTitle,
  isPathActive,
  isStudioPath,
  mobileNavigation,
  moreNavigation,
  navigationGroups
} from '../../src/lib/navigation';
import { isThemePreference, nextThemePreference, resolveTheme } from '../../src/lib/theme';

const requiredRoutes = [
  '/',
  '/studio/image',
  '/studio/video',
  '/jobs',
  '/library',
  '/models',
  '/presets',
  '/settings',
  '/settings/diagnostics'
] as const;

const routeFiles = requiredRoutes.map((route) =>
  route === '/' ? 'src/routes/+page.svelte' : `src/routes${route}/+page.svelte`
);

describe('studio shell navigation', () => {
  test('exposes every required route without a second creation rail', () => {
    const desktopHrefs = navigationGroups.flatMap((group) => group.items.map((item) => item.href));

    expect(desktopHrefs).toEqual([
      '/',
      '/studio/image',
      '/studio/video',
      '/jobs',
      '/library',
      '/models',
      '/presets'
    ]);
    expect(mobileNavigation.map((item) => item.href)).toEqual([
      '/',
      '/studio/image',
      '/studio/video',
      '/jobs',
      '/library'
    ]);
    expect(moreNavigation.map((item) => item.href)).toEqual(['/models', '/presets', '/settings']);
  });

  test('resolves active routes and route titles deterministically', () => {
    expect(isPathActive('/jobs/abc', '/jobs')).toBe(true);
    expect(isPathActive('/library', '/')).toBe(false);
    expect(isStudioPath('/studio/image')).toBe(true);
    expect(isStudioPath('/models')).toBe(false);
    expect(getRouteTitle('/settings/diagnostics')).toBe('Diagnostics');
    expect(getRouteTitle('/unknown')).toBe('Poyo Local Studio');
  });

  test('creates a distinct Svelte route for every milestone destination', async () => {
    for (const file of routeFiles) {
      expect(await Bun.file(file).exists()).toBe(true);
      const source = await Bun.file(file).text();
      expect(source).toContain('<title>');
      expect(source).not.toContain('<h1');
    }
  });
});

describe('theme and accessibility foundations', () => {
  test('keeps light as the deterministic default and supports dark/system preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
    expect(nextThemePreference('system')).toBe('light');
  });

  test('includes skip links, one route heading and a polite route announcer', async () => {
    const shell = await Bun.file('src/lib/components/shell/AppShell.svelte').text();

    expect(shell).toContain('Skip to workspace');
    expect(shell).toContain('Skip to inspector');
    expect(shell.match(/<h1/g)?.length).toBe(1);
    expect(shell).toContain('aria-live="polite"');
    expect(shell).toContain('aria-label="Primary mobile navigation"');
  });

  test('uses a Bits UI focus-managed sheet and no Tailwind or remote fonts', async () => {
    const sheet = await Bun.file('src/lib/components/ui/Sheet.svelte').text();
    const appCss = await Bun.file('src/app.css').text();
    const manifest = await Bun.file('package.json').text();

    expect(sheet).toContain("from 'bits-ui'");
    expect(sheet).toContain('<Dialog.Title');
    expect(sheet).toContain('<Dialog.Description');
    expect(appCss).not.toContain('@import url');
    expect(appCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(appCss).toContain('@media (prefers-contrast: more)');
    expect(appCss).toContain('@media (max-width: 1023px)');
    expect(manifest.toLowerCase()).not.toContain('tailwind');
  });
});
