import { describe, expect, test } from 'bun:test';
import { safeJobDto } from '../../../src/lib/server/jobs/events';
import { createJobFixture, createTestJob } from '../../helpers/job-fixture';

describe('job HTTP boundaries', () => {
  test('SEC-04 every job mutation applies same-origin bounded JSON checks', async () => {
    const routes = [
      'src/routes/api/jobs/+server.ts',
      'src/routes/api/jobs/[jobId]/refresh/+server.ts',
      'src/routes/api/jobs/[jobId]/outputs/[outputId]/retry/+server.ts'
    ];
    for (const route of routes) {
      expect(await Bun.file(route).text()).toContain('readSameOriginJson');
    }
  });

  test('SEC-04 safe live DTOs omit guided and normalized request payloads', async () => {
    const fixture = await createJobFixture();
    try {
      const dto = safeJobDto(createTestJob(fixture.repository, 'safe-dto'));
      expect(dto).not.toHaveProperty('guidedRequest');
      expect(dto).not.toHaveProperty('normalizedPayload');
      expect(JSON.stringify(dto)).not.toContain('calm coast');
    } finally {
      await fixture.cleanup();
    }
  });
});
