import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, lstat, mkdir, readdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createSecretStore,
  PermissionFileSecretStore,
  type PermissionFileSecretStoreCheckpoint,
  SecretStoreCorruptError
} from '../../../src/lib/server/settings/secret-store';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

describe('atomic local secret store', () => {
  test('uses one 0700/0600 file store without legacy OS-store probing', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const store = createSecretStore({ paths: { secrets: directory } });

    expect(store.kind).toBe('file');
    await store.set('sk-test_permission_canary_123456');
    expect(await store.get()).toBe('sk-test_permission_canary_123456');
    expect((await lstat(directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(join(directory, 'poyo-api-key'))).mode & 0o777).toBe(0o600);

    const source = await Bun.file(
      join(import.meta.dir, '../../../src/lib/server/settings/secret-store.ts')
    ).text();
    expect(source).not.toContain('Bun.secrets');
    expect(source).not.toContain('OsSecretStore');
    expect(source).not.toContain('process.platform');
  });

  test('observes missing storage without creating or repairing it', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-observe-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const store = new PermissionFileSecretStore(directory);

    expect(await store.get()).toBeNull();
    expect(await pathExists(directory)).toBe(false);

    await mkdir(directory, { mode: 0o700 });
    await chmod(directory, 0o755);
    await expect(store.get()).rejects.toThrow('permissions are not private');
    expect((await lstat(directory)).mode & 0o777).toBe(0o755);
  });

  test('uses host-account controls when POSIX modes and directory sync are unavailable', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-portable-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const target = join(directory, 'poyo-api-key');
    await mkdir(directory, { mode: 0o755 });
    await writeFile(target, 'sk-test_portable_existing_123456', { mode: 0o644 });
    const checkpoints: PermissionFileSecretStoreCheckpoint[] = [];
    const store = new PermissionFileSecretStore(directory, {
      capabilities: {
        posixPermissions: false,
        directorySync: false,
        noFollowOpen: false
      },
      checkpoint: (checkpoint) => {
        checkpoints.push(checkpoint);
      }
    });

    expect(await store.get()).toBe('sk-test_portable_existing_123456');
    await store.set('sk-test_portable_replacement_123456');
    expect(await store.get()).toBe('sk-test_portable_replacement_123456');
    expect(checkpoints).not.toContain('parent-directory-synced');
    expect(checkpoints).not.toContain('directory-synced');
    expect((await lstat(directory)).mode & 0o777).toBe(0o755);
  });

  test('writes and deletes in atomic durable order before reporting success', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-durable-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const checkpoints: PermissionFileSecretStoreCheckpoint[] = [];
    const store = new PermissionFileSecretStore(directory, {
      checkpoint: (checkpoint) => {
        checkpoints.push(checkpoint);
      }
    });

    await store.set('sk-test_durable_permission_file_123456');
    expect(checkpoints).toEqual([
      'directory-created',
      'parent-directory-synced',
      'temporary-opened',
      'temporary-written',
      'temporary-synced',
      'target-renamed',
      'directory-synced'
    ]);
    expect(await store.get()).toBe('sk-test_durable_permission_file_123456');
    expect((await readdir(directory)).sort()).toEqual(['poyo-api-key']);

    expect(await store.delete()).toBe(true);
    expect(checkpoints.slice(-2)).toEqual(['target-deleted', 'delete-directory-synced']);
    expect(await pathExists(join(directory, 'poyo-api-key'))).toBe(false);
  });

  test('surfaces durability-boundary failures and cleans exclusive temporary files', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-fsync-failure-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const target = join(directory, 'poyo-api-key');
    const beforeFileSync = new PermissionFileSecretStore(directory, {
      checkpoint: (checkpoint) => {
        if (checkpoint === 'temporary-written') throw new Error('injected file fsync failure');
      }
    });
    await expect(beforeFileSync.set('sk-test_never_durable_123456')).rejects.toThrow(
      'injected file fsync failure'
    );
    expect(await pathExists(target)).toBe(false);
    expect(await readdir(directory)).toEqual([]);

    const afterRename = new PermissionFileSecretStore(directory, {
      checkpoint: (checkpoint) => {
        if (checkpoint === 'target-renamed') throw new Error('injected directory fsync failure');
      }
    });
    await expect(afterRename.set('sk-test_renamed_not_committed_123456')).rejects.toThrow(
      'injected directory fsync failure'
    );
    expect(await Bun.file(target).text()).toBe('sk-test_renamed_not_committed_123456');

    const beforeDeleteSync = new PermissionFileSecretStore(directory, {
      checkpoint: (checkpoint) => {
        if (checkpoint === 'target-deleted') throw new Error('injected delete fsync failure');
      }
    });
    await expect(beforeDeleteSync.delete()).rejects.toThrow('injected delete fsync failure');
    expect(await pathExists(target)).toBe(false);
  });

  test('refuses symlink and non-regular credential targets without following them', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-targets-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const outside = join(temporary.path, 'outside-key');
    const target = join(directory, 'poyo-api-key');
    await mkdir(directory, { mode: 0o700 });
    await writeFile(outside, 'outside-secret', { mode: 0o600 });
    await symlink(outside, target);

    const store = new PermissionFileSecretStore(directory);
    await expect(store.get()).rejects.toThrow('not a regular file');
    await expect(store.set('sk-test_never_followed_123456')).rejects.toThrow('not a regular file');
    await expect(store.delete()).rejects.toThrow('not a regular file');
    expect(await Bun.file(outside).text()).toBe('outside-secret');

    await unlink(target);
    await mkdir(target, { mode: 0o700 });
    await expect(store.get()).rejects.toThrow('not a regular file');
    await expect(store.set('sk-test_never_replaces_directory_123456')).rejects.toThrow(
      'not a regular file'
    );
    await expect(store.delete()).rejects.toThrow('not a regular file');
  });

  test('refuses empty, oversized, and invalid UTF-8 credential files as corrupt', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-corrupt-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const target = join(directory, 'poyo-api-key');
    await mkdir(directory, { mode: 0o700 });
    const store = new PermissionFileSecretStore(directory);

    for (const contents of [new Uint8Array(), new Uint8Array(4097), new Uint8Array([0xff])]) {
      await writeFile(target, contents, { mode: 0o600 });
      await chmod(target, 0o600);
      await expect(store.get()).rejects.toBeInstanceOf(SecretStoreCorruptError);
    }
  });
});
