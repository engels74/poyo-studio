import { describe, expect, test } from 'bun:test';
import { join, relative, resolve } from 'node:path';
import { resolveAppPaths } from '../../../src/lib/server/platform/app-paths';

const repositoryRoot = resolve(import.meta.dir, '../../..');

describe('project-local app path defaults', () => {
  test('defaults to <repo>/data without nesting the database under data/data', () => {
    const expectedRoot = join(repositoryRoot, 'data');
    const expectedDatabase = join(expectedRoot, 'state', 'poyo-studio.sqlite');

    const paths = resolveAppPaths({ environment: {} });
    expect({ root: paths.root, database: paths.database }).toEqual({
      root: expectedRoot,
      database: expectedDatabase
    });
    expect(relative(expectedRoot, paths.database)).toBe(join('state', 'poyo-studio.sqlite'));
    expect(paths.database).not.toBe(join(expectedRoot, 'data', 'state', 'poyo-studio.sqlite'));
  });

  test('runtime preflights the selected database before opening it', async () => {
    const runtime = await Bun.file('src/lib/server/platform/runtime.ts').text();
    expect(runtime.indexOf('preflightDatabase(paths.database)')).toBeGreaterThan(-1);
    expect(runtime.indexOf('preflightDatabase(paths.database)')).toBeLessThan(
      runtime.indexOf('openDatabase(paths.database)')
    );
  });
});
