import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildHealthDto } from '../../../src/lib/server/diagnostics/health';
import { StructuredLogger } from '../../../src/lib/server/diagnostics/jsonl-logger';
import { openDatabase } from '../../../src/lib/server/platform/database';
import { DATABASE_SCHEMA_VERSION } from '../../../src/lib/server/platform/version';
import { createTemporaryDirectory } from '../../helpers/temporary-directory';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('redacted health diagnostics', () => {
  test('reports safe app/schema/network/storage health without secret material', async () => {
    const temporary = await createTemporaryDirectory('poyo-health-');
    cleanups.push(temporary.cleanup);
    const database = await openDatabase(join(temporary.path, 'studio.sqlite'));
    const logger = new StructuredLogger({ directory: join(temporary.path, 'logs') });
    const secret = ['sk', 'test_health_canary_123456'].join('-');

    try {
      await logger.info('health.fixture', { data: { apiKey: secret } });
      const health = await buildHealthDto({
        database,
        logger,
        apiKey: {
          source: 'environment',
          status: 'configured',
          storeKind: 'environment',
          onboardingAvailable: false,
          environmentManaged: true,
          updatedAt: '2026-07-15T12:00:00.000Z'
        },
        now: () => new Date('2026-07-15T12:00:00.000Z')
      });

      expect(health.status).toBe('ok');
      expect(health.database.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
      expect(health.network).toEqual({
        defaultHost: '127.0.0.1',
        loopbackOnlyByDefault: true
      });
      expect(JSON.stringify(health)).not.toContain(secret);
      expect(JSON.stringify(health)).not.toContain(temporary.path);
    } finally {
      database.close();
    }
  });
});
