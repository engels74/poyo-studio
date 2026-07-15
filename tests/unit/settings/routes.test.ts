import { describe, expect, test } from 'bun:test';

describe('settings HTTP and page boundaries', () => {
  test('SEC-04 every settings and cleanup mutation uses same-origin bounded JSON', async () => {
    for (const route of [
      'src/routes/api/settings/+server.ts',
      'src/routes/api/settings/api-key/+server.ts',
      'src/routes/api/settings/api-key/connectivity/+server.ts',
      'src/routes/api/cleanup/preview/+server.ts',
      'src/routes/api/cleanup/apply/+server.ts'
    ]) {
      expect(await Bun.file(route).text()).toContain('readSameOriginJson');
    }
  });

  test('settings and diagnostics pages use live contracts instead of milestone placeholders', async () => {
    const settings = await Bun.file('src/routes/settings/+page.svelte').text();
    const diagnostics = await Bun.file('src/routes/settings/diagnostics/+page.svelte').text();
    expect(settings).toContain('Environment configuration is authoritative');
    expect(settings).toContain('Save automatic policy and preview');
    expect(settings).toContain('Run current cleanup now');
    expect(settings).toContain('Remote Poyo cleanup');
    expect(diagnostics).toContain('Copy safe report');
    expect(diagnostics).toContain('Configured paths are deliberately redacted');
    expect(`${settings}\n${diagnostics}`).not.toContain('Not initialized in this milestone');
    expect(`${settings}\n${diagnostics}`).not.toContain('No audited registry loaded');
  });
});
