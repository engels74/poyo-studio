import { afterEach, describe, expect, test } from 'bun:test';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createPreferredSecretStore,
  type BunSecretsApi
} from '../../../src/lib/server/settings/secret-store';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

const unavailableOsStore: BunSecretsApi = {
  get: () => Promise.reject(new Error('credential service unavailable')),
  set: () => Promise.reject(new Error('credential service unavailable')),
  delete: () => Promise.reject(new Error('credential service unavailable'))
};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('secret store selection', () => {
  test('uses a 0700/0600 file fallback only after the OS store is unavailable', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-');
    cleanups.push(temporary.cleanup);
    const directory = join(temporary.path, 'secrets');
    const store = await createPreferredSecretStore({
      paths: { secrets: directory },
      platform: 'linux',
      bunSecrets: unavailableOsStore
    });

    expect(store.kind).toBe('file');
    await store.set('sk-test_permission_canary_123456');
    expect(await store.get()).toBe('sk-test_permission_canary_123456');
    expect((await lstat(directory)).mode & 0o077).toBe(0);
    expect((await lstat(join(directory, 'poyo-api-key'))).mode & 0o077).toBe(0);
    expect(await store.delete()).toBe(true);
  });

  test('fails closed on Windows when the OS credential store is unavailable', async () => {
    const temporary = await createTemporaryDirectory('poyo-secret-win-');
    cleanups.push(temporary.cleanup);
    const store = await createPreferredSecretStore({
      paths: { secrets: join(temporary.path, 'secrets') },
      platform: 'win32',
      bunSecrets: unavailableOsStore
    });

    expect(store.kind).toBe('unavailable');
    await expect(store.set('sk-test_never_written_123456')).rejects.toThrow('unavailable');
  });
});
