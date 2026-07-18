import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openDatabase } from '../../../src/lib/server/platform/database';
import {
  ApiKeyManager,
  type ApiKeyManagerOptions,
  CredentialBackendError,
  EnvironmentKeyActiveError
} from '../../../src/lib/server/settings/api-key-manager';
import { SecretMetadataRepository } from '../../../src/lib/server/settings/secret-metadata-repository';
import type { SecretStore } from '../../../src/lib/server/settings/secret-store';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

class MemorySecretStore implements SecretStore {
  readonly kind = 'file' as const;
  getCalls = 0;
  setCalls = 0;
  deleteCalls = 0;

  constructor(public value: string | null = null) {}

  get(): Promise<string | null> {
    this.getCalls += 1;
    return Promise.resolve(this.value);
  }

  set(secret: string): Promise<void> {
    this.setCalls += 1;
    this.value = secret;
    return Promise.resolve();
  }

  delete(): Promise<boolean> {
    this.deleteCalls += 1;
    const existed = this.value !== null;
    this.value = null;
    return Promise.resolve(existed);
  }
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function manager(
  environment: Record<string, string | undefined>,
  store: SecretStore = new MemorySecretStore(),
  mutationGate?: NonNullable<ApiKeyManagerOptions['mutationGate']>
) {
  const temporary = await createTemporaryDirectory('poyo-key-');
  cleanups.push(temporary.cleanup);
  const path = join(temporary.path, 'studio.sqlite');
  const database = await openDatabase(path);
  return {
    path,
    database,
    store,
    manager: new ApiKeyManager({
      environment,
      secretStore: store,
      metadataRepository: new SecretMetadataRepository(database),
      ...(mutationGate ? { mutationGate } : {}),
      now: () => new Date('2026-07-15T12:00:00.000Z')
    })
  };
}

describe('API key configuration', () => {
  test('SET-01 gives POYO_API_KEY absolute precedence without probing local storage', async () => {
    const environmentSecret = ['sk', 'test_environment_canary_123456'].join('-');
    const store = new MemorySecretStore('sk-test_local_canary_123456');
    const setup = await manager({ POYO_API_KEY: `  ${environmentSecret}  ` }, store);
    try {
      const resolved = await setup.manager.resolve();
      expect(resolved.key).toBe(environmentSecret);
      expect(resolved.status).toMatchObject({
        source: 'environment',
        status: 'configured',
        storeKind: 'environment',
        environmentManaged: true,
        onboardingAvailable: false,
        localMutationAvailable: false
      });
      expect(store.getCalls).toBe(0);
      await expect(setup.manager.setLocal('sk-test_other_canary_123456')).rejects.toBeInstanceOf(
        EnvironmentKeyActiveError
      );
      await expect(setup.manager.removeLocal()).rejects.toBeInstanceOf(EnvironmentKeyActiveError);
      expect(store.setCalls).toBe(0);
      expect(store.deleteCalls).toBe(0);
    } finally {
      setup.database.close();
    }
  });

  test('supports verified local onboarding, connectivity, and verified removal', async () => {
    const setup = await manager({});
    try {
      expect((await setup.manager.resolve()).status.status).toBe('missing');
      expect(await setup.manager.setLocal(' sk-test_local_canary_123456 ')).toMatchObject({
        source: 'local',
        status: 'configured',
        storeKind: 'file',
        onboardingAvailable: true
      });
      expect((await setup.manager.resolve()).key).toBe('sk-test_local_canary_123456');
      await setup.manager.verifyConnectivity(async (resolved) => {
        expect(resolved.key).toBe('sk-test_local_canary_123456');
      });
      expect(setup.manager.connectivityStatus()).toEqual({
        checkedAt: '2026-07-15T12:00:00.000Z',
        status: 'ok'
      });
      expect(await setup.manager.removeLocal()).toMatchObject({
        source: 'none',
        status: 'missing'
      });
      expect(setup.manager.connectivityStatus()).toEqual({ checkedAt: null, status: null });
    } finally {
      setup.database.close();
    }
  });

  test('rejects a store write that cannot be read back unchanged', async () => {
    const store = new MemorySecretStore();
    store.set = async () => {
      store.value = 'different-value';
    };
    const setup = await manager({}, store);
    try {
      await expect(setup.manager.setLocal('sk-test_expected_canary_123456')).rejects.toBeInstanceOf(
        CredentialBackendError
      );
    } finally {
      setup.database.close();
    }
  });

  test('rejects failed and unverifiable credential deletion', async () => {
    for (const deleteBehavior of ['reject', 'retain'] as const) {
      const store = new MemorySecretStore('sk-test_delete_failure_canary_123456');
      store.delete = async () => {
        store.deleteCalls += 1;
        if (deleteBehavior === 'reject') throw new Error('injected delete failure');
        return true;
      };
      const setup = await manager({}, store);
      try {
        await expect(setup.manager.removeLocal()).rejects.toBeInstanceOf(CredentialBackendError);
        expect(store.value).toBe('sk-test_delete_failure_canary_123456');
      } finally {
        setup.database.close();
      }
    }
  });

  test('serializes status and mutation behind an in-flight connectivity probe', async () => {
    const store = new MemorySecretStore();
    const setup = await manager({}, store);
    try {
      const firstKey = 'sk-test_first_connectivity_canary_123456';
      const secondKey = 'sk-test_second_connectivity_canary_123456';
      await setup.manager.setLocal(firstKey);

      let releaseProbe!: () => void;
      const probeRelease = new Promise<void>((resolve) => {
        releaseProbe = resolve;
      });
      let markProbeStarted!: () => void;
      const probeStarted = new Promise<void>((resolve) => {
        markProbeStarted = resolve;
      });
      const verification = setup.manager.verifyConnectivity(async () => {
        markProbeStarted();
        await probeRelease;
      });
      await probeStarted;

      const mutation = setup.manager.setLocal(secondKey);
      const status = setup.manager.status();
      await Bun.sleep(5);
      expect(store.value).toBe(firstKey);
      releaseProbe();
      await Promise.all([verification, mutation, status]);

      expect((await setup.manager.resolve()).key).toBe(secondKey);
      expect(setup.manager.connectivityStatus()).toEqual({ checkedAt: null, status: null });
    } finally {
      setup.database.close();
    }
  });

  test('uses the writer gate for resolve persistence and connectivity metadata', async () => {
    const permits: string[] = [];
    const setup = await manager({}, new MemorySecretStore(), {
      status: () => ({
        admission: 'open',
        activeWriters: 0,
        detachedTasks: 0,
        writerGeneration: 0
      }),
      withWriterPermit: async <T>(operation: string, callback: () => Promise<T>) => {
        permits.push(operation);
        return callback();
      }
    });
    try {
      await setup.manager.resolve();
      await setup.manager.verifyConnectivity(async () => undefined);
      expect(permits).toEqual(['credential.status-persistence', 'credential.connectivity']);
    } finally {
      setup.database.close();
    }
  });

  test('does not persist raw or SHA-family representations of the API key', async () => {
    const sentinel = 'sk-test_database_leak_canary_123456789';
    const setup = await manager({});
    try {
      await setup.manager.setLocal(sentinel);
      await setup.manager.verifyConnectivity(async () => undefined);
      setup.database.query('PRAGMA wal_checkpoint(TRUNCATE)').run();
    } finally {
      setup.database.close();
    }

    const databaseText = new TextDecoder().decode(await Bun.file(setup.path).arrayBuffer());
    expect(databaseText).not.toContain(sentinel);
    for (const algorithm of ['sha1', 'sha224', 'sha256', 'sha384', 'sha512'] as const) {
      expect(databaseText).not.toContain(createHash(algorithm).update(sentinel).digest('hex'));
      expect(databaseText).not.toContain(createHash(algorithm).update(sentinel).digest('base64'));
    }
  });

  test('rejects obsolete credential store metadata instead of normalizing it', async () => {
    const setup = await manager({});
    try {
      await setup.manager.resolve();
      setup.database.query("UPDATE secret_metadata SET store_kind='os' WHERE id=1").run();
      expect(() => new SecretMetadataRepository(setup.database).get()).toThrow(
        'Credential metadata is invalid.'
      );
    } finally {
      setup.database.close();
    }
  });
});
