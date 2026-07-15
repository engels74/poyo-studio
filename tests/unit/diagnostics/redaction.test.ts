import { describe, expect, test } from 'bun:test';
import { redact } from '../../../src/lib/server/diagnostics/redaction';

describe('diagnostic redaction', () => {
  test('SEC-01 recursively removes credentials, bearer values, base64, and query secrets', () => {
    const secret = 'sk-test_redaction_canary_123456789';
    const bearer = 'Bearer token-redaction-canary';
    const base64 = 'A'.repeat(160);
    const redacted = redact({
      correlationId: 'correlation-safe-123',
      apiKey: secret,
      nested: {
        authorization: bearer,
        image: base64,
        url: `https://example.test/output?token=${secret}&safe=yes`,
        message: `request used ${secret} and ${bearer}`
      }
    });
    const serialized = JSON.stringify(redacted);

    expect(serialized).toContain('correlation-safe-123');
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain('[REDACTED_BASE64]');
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('token-redaction-canary');
    expect(serialized).not.toContain(base64);
  });
});
