import { afterEach, describe, expect, test } from 'bun:test';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ensureAppPaths,
  resolveAppPaths,
  resolvePathWithin
} from '../../../src/lib/server/platform/app-paths';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('application paths', () => {
  test('uses platform conventions and explicit environment overrides', () => {
    expect(
      resolveAppPaths({ environment: {}, platform: 'darwin', homeDirectory: '/Users/studio' }).root
    ).toBe('/Users/studio/Library/Application Support/Poyo Local Studio');
    expect(
      resolveAppPaths({ environment: {}, platform: 'linux', homeDirectory: '/home/studio' }).root
    ).toBe('/home/studio/.local/share/poyo-local-studio');
    expect(
      resolveAppPaths({
        environment: { LOCALAPPDATA: 'C:\\Users\\studio\\AppData\\Local' },
        platform: 'win32',
        homeDirectory: 'C:\\Users\\studio'
      }).root
    ).toContain('Poyo Local Studio');

    const configured = resolveAppPaths({
      environment: { PLS_APP_DATA_DIR: '/srv/poyo', PLS_LOG_DIR: '/var/log/poyo' },
      platform: 'linux',
      homeDirectory: '/home/studio'
    });
    expect(configured.root).toBe('/srv/poyo');
    expect(configured.logs).toBe('/var/log/poyo');
    expect(configured.source).toBe('environment');
  });

  test('creates private local directories and keeps paths inside configured roots', async () => {
    const temporary = await createTemporaryDirectory('poyo-paths-');
    cleanups.push(temporary.cleanup);
    const paths = resolveAppPaths({
      environment: { PLS_APP_DATA_DIR: join(temporary.path, 'studio') },
      platform: process.platform,
      homeDirectory: temporary.path
    });

    await ensureAppPaths(paths);
    expect(resolvePathWithin(paths.media, 'generation/output.png')).toBe(
      join(paths.media, 'generation', 'output.png')
    );
    expect(() => resolvePathWithin(paths.media, '../escape.png')).toThrow('escapes');
    expect(() => resolvePathWithin(paths.media, '/tmp/escape.png')).toThrow('escapes');
    if (process.platform !== 'win32') {
      expect((await lstat(paths.root)).mode & 0o077).toBe(0);
    }
  });
});
