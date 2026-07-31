export const BALANCE_STALE_AFTER_MS = 600_000;

export function isExactBalanceTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isBalanceSnapshotStale(fetchedAt: string, nowMs: number): boolean {
  if (!isExactBalanceTimestamp(fetchedAt)) return true;
  const ageMs = nowMs - Date.parse(fetchedAt);
  return !Number.isFinite(ageMs) || ageMs < 0 || ageMs > BALANCE_STALE_AFTER_MS;
}
