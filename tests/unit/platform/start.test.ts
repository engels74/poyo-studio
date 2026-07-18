import { describe, expect, test } from 'bun:test';
import { resolveLoopbackHost, start } from '../../../scripts/start';

describe('production start host policy', () => {
  test('defaults unset or blank hosts and accepts exact trimmed loopback addresses', () => {
    expect(resolveLoopbackHost(undefined)).toBe('127.0.0.1');
    expect(resolveLoopbackHost('')).toBe('127.0.0.1');
    expect(resolveLoopbackHost('   ')).toBe('127.0.0.1');
    expect(resolveLoopbackHost(' 127.0.0.1 ')).toBe('127.0.0.1');
    expect(resolveLoopbackHost('\t::1\n')).toBe('::1');
  });

  test('rejects hostnames, wildcard, mapped, and LAN addresses', () => {
    for (const host of ['localhost', '0.0.0.0', '::', '::ffff:127.0.0.1', '192.168.1.20']) {
      expect(() => resolveLoopbackHost(host), host).toThrow('HOST must be 127.0.0.1 or ::1');
    }
  });

  test('validates and normalizes HOST before importing the built server', async () => {
    const validEnvironment: Record<string, string | undefined> = { HOST: ' ::1 ' };
    let importedHost: string | undefined;
    await start(validEnvironment, async () => {
      importedHost = validEnvironment.HOST;
    });
    expect(importedHost).toBe('::1');

    let imported = false;
    await expect(
      start({ HOST: 'example.test' }, async () => {
        imported = true;
      })
    ).rejects.toThrow('Non-loopback listeners are not supported');
    expect(imported).toBe(false);
  });
});
