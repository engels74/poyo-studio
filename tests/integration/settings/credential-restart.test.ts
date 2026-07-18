import { afterEach, describe, expect, test } from 'bun:test';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { openDatabase } from '../../../src/lib/server/platform/database';
import { ApiKeyManager } from '../../../src/lib/server/settings/api-key-manager';
import { SecretMetadataRepository } from '../../../src/lib/server/settings/secret-metadata-repository';
import { PermissionFileSecretStore } from '../../../src/lib/server/settings/secret-store';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('credential restart persistence', () => {
  test('resolves a local file credential after closing and reopening SQLite', async () => {
    const temporary = await createTemporaryDirectory('poyo-credential-restart-');
    cleanups.push(temporary.cleanup);
    const databasePath = join(temporary.path, 'studio.sqlite');
    const secretsPath = join(temporary.path, 'secrets');
    const key = 'sk-test_restart_process_boundary_123456';

    const firstDatabase = await openDatabase(databasePath);
    const firstManager = new ApiKeyManager({
      environment: {},
      secretStore: new PermissionFileSecretStore(secretsPath),
      metadataRepository: new SecretMetadataRepository(firstDatabase)
    });
    await firstManager.setLocal(key);
    firstDatabase.query('PRAGMA wal_checkpoint(TRUNCATE)').run();
    firstDatabase.close();

    const restartedDatabase = await openDatabase(databasePath);
    const restartedManager = new ApiKeyManager({
      environment: {},
      secretStore: new PermissionFileSecretStore(secretsPath),
      metadataRepository: new SecretMetadataRepository(restartedDatabase)
    });
    expect(await restartedManager.resolve()).toMatchObject({
      key,
      status: {
        source: 'local',
        status: 'configured',
        storeKind: 'file',
        environmentManaged: false
      }
    });
    expect((await lstat(secretsPath)).mode & 0o077).toBe(0);
    expect((await lstat(join(secretsPath, 'poyo-api-key'))).mode & 0o077).toBe(0);
    restartedDatabase.close();
  });

  test('uses an environment override after restart without replacing the local credential', async () => {
    const temporary = await createTemporaryDirectory('poyo-credential-override-restart-');
    cleanups.push(temporary.cleanup);
    const databasePath = join(temporary.path, 'studio.sqlite');
    const secretsPath = join(temporary.path, 'secrets');
    const localKey = 'sk-test_restart_local_canary_123456';
    const environmentKey = 'sk-test_restart_environment_canary_123456';

    const firstDatabase = await openDatabase(databasePath);
    const store = new PermissionFileSecretStore(secretsPath);
    await new ApiKeyManager({
      environment: {},
      secretStore: store,
      metadataRepository: new SecretMetadataRepository(firstDatabase)
    }).setLocal(localKey);
    firstDatabase.close();

    const overriddenDatabase = await openDatabase(databasePath);
    const overriddenManager = new ApiKeyManager({
      environment: { POYO_API_KEY: environmentKey },
      secretStore: new PermissionFileSecretStore(secretsPath),
      metadataRepository: new SecretMetadataRepository(overriddenDatabase)
    });
    expect(await overriddenManager.resolve()).toMatchObject({
      key: environmentKey,
      status: {
        source: 'environment',
        storeKind: 'environment',
        environmentManaged: true
      }
    });
    expect(await store.get()).toBe(localKey);
    overriddenDatabase.close();

    const recoveredDatabase = await openDatabase(databasePath);
    const recoveredManager = new ApiKeyManager({
      environment: {},
      secretStore: new PermissionFileSecretStore(secretsPath),
      metadataRepository: new SecretMetadataRepository(recoveredDatabase)
    });
    expect(await recoveredManager.resolve()).toMatchObject({
      key: localKey,
      status: { source: 'local', storeKind: 'file' }
    });
    recoveredDatabase.close();
  });
});
