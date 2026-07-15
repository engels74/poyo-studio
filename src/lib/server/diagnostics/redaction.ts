const sensitiveKey =
  /(?:api.?key|authorization|bearer|cookie|credential|password|secret|signature|token|base64|raw.?payload)/i;
const poyoKey = /\bsk[-_][a-z0-9_-]{8,}\b/gi;
const bearer = /\bbearer\s+[^\s,;]+/gi;
const dataUri = /data:([^;,\s]+);base64,[a-z0-9+/=_-]+/gi;
const sensitiveQuery =
  /([?&](?:api_?key|authorization|password|secret|signature|token)=)[^&#\s]+/gi;
const sensitiveAssignment =
  /\b(api_?key|authorization|password|secret|signature|token)=([^&#\s,;]+)/gi;
const completeBase64 = /^[a-z0-9+/=_-]{128,}$/i;

export type RedactedValue =
  | null
  | boolean
  | number
  | string
  | RedactedValue[]
  | { [key: string]: RedactedValue };

export function redactString(value: string): string {
  if (completeBase64.test(value)) return '[REDACTED_BASE64]';
  return value
    .replace(dataUri, 'data:$1;base64,[REDACTED]')
    .replace(bearer, 'Bearer [REDACTED]')
    .replace(poyoKey, '[REDACTED]')
    .replace(sensitiveQuery, '$1[REDACTED]')
    .replace(sensitiveAssignment, '$1=[REDACTED]');
}

function redactInternal(value: unknown, seen: WeakSet<object>): RedactedValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      message: redactString(value.message),
      name: value.name,
      stack: value.stack ? redactString(value.stack) : null
    };
  }

  if (typeof value !== 'object') return redactString(String(value));
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((entry) => redactInternal(entry, seen));

  const output: Record<string, RedactedValue> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = sensitiveKey.test(key)
      ? '[REDACTED]'
      : redactInternal((value as Record<string, unknown>)[key], seen);
  }
  return output;
}

export function redact(value: unknown): RedactedValue {
  return redactInternal(value, new WeakSet());
}

export function safeErrorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: redactString(error.message) };
  }
  return { name: 'Error', message: redactString(String(error)) };
}
