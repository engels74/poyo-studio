import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, lstat, mkdir, readdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveProjectRoot,
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
  test('uses repository data while ignoring unrelated environment locations', () => {
    const projectRoot = '/workspace/poyo-studio';
    for (const environment of [
      {},
      { UNRELATED_DATA_ROOT: '/unrelated/one' },
      { ANOTHER_DATA_ROOT: '/unrelated/two' }
    ]) {
      const paths = resolveAppPaths({ environment, projectRoot });
      expect(paths.root).toBe(join(projectRoot, 'data'));
      expect(paths.source).toBe('project-default');
    }
  });

  test('derives every application-owned resource from the single root override', () => {
    const paths = resolveAppPaths({
      environment: {
        PLS_APP_DATA_DIR: '  /srv/poyo  '
      },
      projectRoot: '/workspace/poyo-studio'
    });

    expect(paths).toEqual({
      root: '/srv/poyo',
      database: '/srv/poyo/state/poyo-studio.sqlite',
      media: '/srv/poyo/media',
      uploads: '/srv/poyo/uploads',
      thumbnails: '/srv/poyo/thumbnails',
      logs: '/srv/poyo/logs',
      secrets: '/srv/poyo/secrets',
      temporary: '/srv/poyo/tmp',
      source: 'environment'
    });
  });

  test('treats blank overrides as unset and rejects null bytes', () => {
    const paths = resolveAppPaths({
      environment: {
        PLS_APP_DATA_DIR: ' '
      },
      projectRoot: '/workspace/poyo-studio'
    });
    expect(paths.root).toBe('/workspace/poyo-studio/data');
    expect(paths.database).toBe('/workspace/poyo-studio/data/state/poyo-studio.sqlite');
    expect(() =>
      resolveAppPaths({
        environment: { PLS_APP_DATA_DIR: '/bad\0root' },
        projectRoot: '/workspace'
      })
    ).toThrow('null byte');
  });

  test.serial('derives repository and production-build roots independently of cwd', async () => {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const repositoryRoot = resolve(moduleDirectory, '../../..');
    expect(deriveProjectRoot()).toBe(repositoryRoot);
    expect(deriveProjectRoot(join(repositoryRoot, 'build', 'server', 'chunks'))).toBe(
      repositoryRoot
    );

    const temporary = await createTemporaryDirectory('poyo-changed-cwd-');
    cleanups.push(temporary.cleanup);
    const originalCwd = process.cwd();
    try {
      process.chdir(temporary.path);
      expect(resolveAppPaths({ environment: {} }).root).toBe(join(repositoryRoot, 'data'));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('fails project-root derivation without falling back to another location', () => {
    expect(() => deriveProjectRoot('/isolated/build/chunks', () => false)).toThrow(
      'Unable to derive'
    );
  });

  test('creates only the selected root and never discovers, copies, or deletes a legacy root', async () => {
    const temporary = await createTemporaryDirectory('poyo-paths-');
    cleanups.push(temporary.cleanup);
    const legacyRoot = join(temporary.path, 'unrelated-root');
    const selectedRoot = join(temporary.path, 'selected-root');
    await mkdir(legacyRoot);
    await writeFile(join(legacyRoot, 'sentinel.txt'), 'legacy');

    const paths = resolveAppPaths({
      environment: {
        UNRELATED_DATA_ROOT: legacyRoot,
        PLS_APP_DATA_DIR: selectedRoot
      }
    });
    await ensureAppPaths(paths);

    expect(await Bun.file(join(legacyRoot, 'sentinel.txt')).text()).toBe('legacy');
    expect(await Bun.file(join(selectedRoot, 'sentinel.txt')).exists()).toBe(false);
    expect(paths.root).toBe(selectedRoot);
  });

  test('fails closed when the selected root is a file or symbolic link', async () => {
    const temporary = await createTemporaryDirectory('poyo-invalid-root-');
    cleanups.push(temporary.cleanup);
    const fileRoot = join(temporary.path, 'file-root');
    await writeFile(fileRoot, 'not a directory');
    await expect(
      ensureAppPaths(resolveAppPaths({ environment: { PLS_APP_DATA_DIR: fileRoot } }))
    ).rejects.toThrow();

    const realRoot = join(temporary.path, 'real-root');
    const linkedRoot = join(temporary.path, 'linked-root');
    await mkdir(realRoot);
    await symlink(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      ensureAppPaths(resolveAppPaths({ environment: { PLS_APP_DATA_DIR: linkedRoot } }))
    ).rejects.toThrow('Expected a directory');
    expect(await readdir(realRoot)).toEqual([]);
  });

  test('creates private directories and keeps resolved paths inside their configured roots', async () => {
    const temporary = await createTemporaryDirectory('poyo-private-paths-');
    cleanups.push(temporary.cleanup);
    const paths = resolveAppPaths({
      environment: { PLS_APP_DATA_DIR: join(temporary.path, 'studio') }
    });

    await ensureAppPaths(paths);
    expect(resolvePathWithin(paths.media, 'generation/output.png')).toBe(
      join(paths.media, 'generation', 'output.png')
    );
    expect(() => resolvePathWithin(paths.media, '../escape.png')).toThrow('escapes');
    expect(() => resolvePathWithin(paths.media, '/tmp/escape.png')).toThrow('escapes');
    expect((await lstat(paths.root)).isDirectory()).toBe(true);
  });

  test('keeps existing environment-managed root permissions while securing owned children', async () => {
    const temporary = await createTemporaryDirectory('poyo-env-root-');
    cleanups.push(temporary.cleanup);
    const root = join(temporary.path, 'environment-owned');
    await mkdir(root);
    await chmod(root, 0o755);
    const modeBefore = (await lstat(root)).mode;

    const paths = resolveAppPaths({
      environment: { PLS_APP_DATA_DIR: root }
    });
    await ensureAppPaths(paths);

    expect((await lstat(root)).mode).toBe(modeBefore);
    expect((await lstat(dirname(paths.database))).mode & 0o777).toBe(0o700);
    expect((await lstat(paths.media)).mode & 0o777).toBe(0o700);
    expect((await lstat(paths.logs)).mode & 0o777).toBe(0o700);
    expect((await lstat(paths.secrets)).mode & 0o777).toBe(0o700);
  });
});
