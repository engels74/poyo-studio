import { describe, expect, test } from 'bun:test';
import { safeJobDto } from '../../../src/lib/server/jobs/events';
import { createJobFixture, createTestJob } from '../../helpers/job-fixture';

describe('job HTTP boundaries', () => {
  test('SEC-04 every job mutation applies same-origin bounded JSON checks', async () => {
    const routes = [
      'src/routes/api/jobs/+server.ts',
      'src/routes/api/jobs/[jobId]/refresh/+server.ts',
      'src/routes/api/jobs/[jobId]/outputs/[outputId]/retry/+server.ts',
      'src/routes/api/jobs/[jobId]/rerun/+server.ts',
      'src/routes/api/library/[jobId]/favorite/+server.ts',
      'src/routes/api/library/[jobId]/pin/+server.ts',
      'src/routes/api/library/[jobId]/tags/+server.ts',
      'src/routes/api/library/[jobId]/open-folder/+server.ts',
      'src/routes/api/library/[jobId]/outputs/[outputId]/delete/+server.ts'
    ];
    for (const route of routes) {
      expect(await Bun.file(route).text()).toContain('readSameOriginJson');
    }
  });

  test('SEC-04 private media streaming supports HEAD and never serializes filesystem paths', async () => {
    const route = await Bun.file('src/routes/api/media/[outputId]/+server.ts').text();
    expect(route).toContain('safeLocalMediaPath');
    expect(route).toContain('assertPrivateMediaRequest');
    expect(route).toContain('export const HEAD');
    expect(route).not.toContain('Response.json');
  });

  test('SEC-04 studio mutations apply bounded same-origin request checks', async () => {
    for (const route of [
      'src/routes/api/presets/+server.ts',
      'src/routes/api/presets/[presetId]/+server.ts',
      'src/routes/api/model-preferences/+server.ts',
      'src/routes/api/account/balance/+server.ts'
    ]) {
      expect(await Bun.file(route).text()).toContain('readSameOriginJson');
    }
    expect(await Bun.file('src/routes/api/sources/+server.ts').text()).toContain(
      'intakeLocalSource'
    );
    expect(await Bun.file('src/lib/server/media/source-intake.ts').text()).toContain(
      'assertSameOriginMultipart'
    );
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
