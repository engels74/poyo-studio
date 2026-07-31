import { describe, expect, test } from 'bun:test';
import {
  BALANCE_STALE_AFTER_MS,
  isBalanceSnapshotStale
} from '../../../src/lib/features/account/balance-freshness';

const nowMs = Date.UTC(2025, 0, 1, 0, 0, 0);
const fetchedAtForAge = (ageMs: number): string => new Date(nowMs - ageMs).toISOString();

describe('balance snapshot freshness', () => {
  test('keeps snapshots fresh through the inclusive ten-minute boundary', () => {
    expect(BALANCE_STALE_AFTER_MS).toBe(600_000);
    expect(isBalanceSnapshotStale(fetchedAtForAge(0), nowMs)).toBe(false);
    expect(isBalanceSnapshotStale(fetchedAtForAge(599_999), nowMs)).toBe(false);
    expect(isBalanceSnapshotStale(fetchedAtForAge(600_000), nowMs)).toBe(false);
  });

  test('marks expired, malformed, and future snapshots stale', () => {
    expect(isBalanceSnapshotStale(fetchedAtForAge(600_001), nowMs)).toBe(true);
    expect(isBalanceSnapshotStale('not-a-timestamp', nowMs)).toBe(true);
    expect(isBalanceSnapshotStale(new Date(nowMs + 1).toISOString(), nowMs)).toBe(true);
  });
});
