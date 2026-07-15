import type { Clock, Sleeper } from './types';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  jitterRatio: 0.2
};

export const systemClock: Clock = { now: () => Date.now() };

export const systemSleeper: Sleeper = {
  sleep: async (milliseconds, signal) => {
    if (milliseconds <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, milliseconds);
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }
};

export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - now);
}

export function retryDelay(
  failedAttempt: number,
  policy: RetryPolicy,
  random: () => number,
  retryAfterMs: number | null
): number {
  if (retryAfterMs !== null) return Math.min(policy.maxDelayMs, Math.max(0, retryAfterMs));
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  const jitterRange = exponential * Math.max(0, Math.min(1, policy.jitterRatio));
  const jittered = exponential - jitterRange + random() * jitterRange * 2;
  return Math.max(0, Math.min(policy.maxDelayMs, Math.round(jittered)));
}
