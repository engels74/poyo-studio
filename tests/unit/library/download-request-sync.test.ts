import { describe, expect, test } from 'bun:test';
import {
  createDownloadRequestSync,
  latestDownloadRequestAt,
  type DownloadRequestUpdate
} from '../../../src/lib/features/library/download-request-sync';

class FakeChannel {
  listeners = new Set<(event: MessageEvent<unknown>) => void>();
  peer: FakeChannel | null = null;
  closed = false;

  postMessage(message: unknown): void {
    this.peer?.dispatch(message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  dispatch(data: unknown): void {
    for (const listener of this.listeners) listener({ data } as MessageEvent<unknown>);
  }
}

function merge(target: Map<string, string>, update: DownloadRequestUpdate): void {
  const current = target.get(update.outputId);
  if (!current || update.requestedAt > current) target.set(update.outputId, update.requestedAt);
}

describe('download request cross-tab sync', () => {
  test('DOWNLOAD-SYNC-01 merges close updates for different outputs in both tabs', () => {
    const firstChannel = new FakeChannel();
    const secondChannel = new FakeChannel();
    firstChannel.peer = secondChannel;
    secondChannel.peer = firstChannel;
    const firstState = new Map<string, string>();
    const secondState = new Map<string, string>();
    const first = createDownloadRequestSync({
      onupdate: (update) => merge(firstState, update),
      createChannel: () => firstChannel
    });
    const second = createDownloadRequestSync({
      onupdate: (update) => merge(secondState, update),
      createChannel: () => secondChannel
    });

    first.publish({ outputId: 'output-a', requestedAt: '2026-08-01T10:00:00.000Z' });
    second.publish({ outputId: 'output-b', requestedAt: '2026-08-01T10:00:00.001Z' });

    expect(Object.fromEntries(firstState)).toEqual({
      'output-a': '2026-08-01T10:00:00.000Z',
      'output-b': '2026-08-01T10:00:00.001Z'
    });
    expect(Object.fromEntries(secondState)).toEqual(Object.fromEntries(firstState));
    first.dispose();
    second.dispose();
    expect(firstChannel.closed).toBe(true);
    expect(secondChannel.closed).toBe(true);
  });

  test('DOWNLOAD-SYNC-02 ignores malformed messages and does not regress a newer mark', () => {
    const channel = new FakeChannel();
    const state = new Map<string, string>();
    const sync = createDownloadRequestSync({
      onupdate: (update) => merge(state, update),
      createChannel: () => channel
    });

    sync.publish({ outputId: 'output-a', requestedAt: '2026-08-01T10:00:01.000Z' });
    channel.dispatch({ version: 1, outputId: 'output-a', requestedAt: '2026-08-01T10:00:00.000Z' });
    channel.dispatch({ version: 1, outputId: 'output-b', requestedAt: 'not-a-date' });

    expect(Object.fromEntries(state)).toEqual({
      'output-a': '2026-08-01T10:00:01.000Z'
    });
    sync.dispose();
  });

  test('DOWNLOAD-SYNC-03 remains usable when cross-tab channels are unavailable', () => {
    const state = new Map<string, string>();
    const sync = createDownloadRequestSync({
      onupdate: (update) => merge(state, update),
      createChannel: () => {
        throw new Error('BroadcastChannel is unavailable');
      }
    });

    sync.publish({ outputId: 'output-a', requestedAt: '2026-08-01T10:00:00.000Z' });

    expect(Object.fromEntries(state)).toEqual({
      'output-a': '2026-08-01T10:00:00.000Z'
    });
    expect(() => sync.dispose()).not.toThrow();
  });

  test('DOWNLOAD-SYNC-04 selects the newest local, synchronized, or persisted request', () => {
    expect(
      latestDownloadRequestAt(
        '2026-08-01T10:00:00Z',
        '2026-08-01T10:00:00.003Z',
        '2026-08-01T10:00:00.002Z'
      )
    ).toBe('2026-08-01T10:00:00.003Z');
    expect(
      latestDownloadRequestAt('2026-08-01T10:00:00Z', '2026-08-01T10:00:00.001Z')
    ).toBe('2026-08-01T10:00:00.001Z');
    expect(latestDownloadRequestAt(undefined, null)).toBeNull();
  });
});
