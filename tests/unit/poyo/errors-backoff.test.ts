import { describe, expect, test } from 'bun:test';
import { parseRetryAfter, retryDelay } from '../../../src/lib/server/poyo/backoff';
import { normalizePoyoError } from '../../../src/lib/server/poyo/errors';

describe('Poyo error taxonomy and retry timing', () => {
  test('PYO-05 normalizes documented business and provider errors', () => {
    const cases = [
      [401, 'authentication'],
      [402, 'insufficient_credits'],
      [408, 'network'],
      [429, 'rate_limit'],
      [400, 'unsupported_configuration'],
      [502, 'provider']
    ] as const;
    for (const [status, category] of cases) {
      expect(
        normalizePoyoError('submit', status, {
          code: status,
          error: { message: 'upstream detail', type: `fixture_${status}` }
        }).category
      ).toBe(category);
    }
    expect(normalizePoyoError('upload_stream', 422, { detail: 'bad file' }).category).toBe(
      'upload'
    );
    expect(normalizePoyoError('status', 404, { detail: 'missing' }).category).toBe('task');
  });

  test('RATE-01 honors Retry-After and otherwise uses bounded deterministic jitter', () => {
    const now = Date.parse('2026-07-15T12:00:00Z');
    expect(parseRetryAfter('2', now)).toBe(2000);
    expect(parseRetryAfter('Wed, 15 Jul 2026 12:00:03 GMT', now)).toBe(3000);
    expect(parseRetryAfter('invalid', now)).toBeNull();
    expect(
      retryDelay(
        2,
        { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0.2 },
        () => 0.5,
        null
      )
    ).toBe(200);
    expect(
      retryDelay(
        1,
        { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500, jitterRatio: 0 },
        () => 0,
        900
      )
    ).toBe(500);
  });
});
