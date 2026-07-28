import { describe, expect, test } from 'bun:test';
import {
  applyGalleryOutputChronology,
  createGalleryRefreshCoordinator,
  decodeGalleryLiveEvent,
  GalleryRefreshDisposedError,
  GalleryRefreshPausedError
} from '../../../src/lib/features/gallery/live-refresh';

const deferred = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  if (!resolve || !reject) throw new Error('Failed to initialize deferred promise.');
  return { promise, resolve, reject };
};

describe('Gallery live refresh', () => {
  test('decodes every Jobs mutation that can affect Gallery and rejects malformed or unrelated events', () => {
    const eventTypes = [
      'job.transition',
      'job.complete',
      'status.observed',
      'output_set.malformed',
      'poll.failed',
      'poll.policy_blocked',
      'download.started',
      'download.verified',
      'download.failed',
      'output.local_file_removed',
      'output.local_metadata_removed',
      'output.local_both_removed'
    ] as const;
    const events = eventTypes.map((eventType, index) =>
      decodeGalleryLiveEvent(
        JSON.stringify({
          jobId: 'job',
          eventType,
          ...(eventType.startsWith('download.') || eventType.startsWith('output.')
            ? { payload: { outputId: 'output' } }
            : {})
        }),
        index + 1
      )
    );
    expect(events.every(Boolean)).toBe(true);
    expect(decodeGalleryLiveEvent('{', 1)).toBeNull();
    expect(decodeGalleryLiveEvent(JSON.stringify({ eventType: 'status.observed' }), 1)).toBeNull();
    expect(
      decodeGalleryLiveEvent(
        JSON.stringify({ jobId: 'job', eventType: 'download.verified', payload: {} }),
        1
      )
    ).toBeNull();
    expect(
      decodeGalleryLiveEvent(
        JSON.stringify({ jobId: 'job', eventType: 'balance.cost.recorded' }),
        1
      )
    ).toBeNull();
  });

  test('keeps the greatest output chronology', () => {
    const removed = decodeGalleryLiveEvent(
      JSON.stringify({
        jobId: 'job',
        eventType: 'output.local_file_removed',
        payload: { outputId: 'output' }
      }),
      5
    );
    const started = decodeGalleryLiveEvent(
      JSON.stringify({
        jobId: 'job',
        eventType: 'download.started',
        payload: { outputId: 'output' }
      }),
      6
    );
    const verified = decodeGalleryLiveEvent(
      JSON.stringify({
        jobId: 'job',
        eventType: 'download.verified',
        payload: { outputId: 'output' }
      }),
      7
    );
    if (!removed || !started || !verified) throw new Error('Expected valid Gallery live events.');
    let chronology = applyGalleryOutputChronology(new Map(), removed);
    chronology = applyGalleryOutputChronology(chronology, started);
    expect(chronology.get('output')).toEqual({ eventId: 6, removed: false, verified: false });
    chronology = applyGalleryOutputChronology(chronology, verified);
    expect(chronology.get('output')).toEqual({ eventId: 7, removed: false, verified: true });
    expect(applyGalleryOutputChronology(chronology, removed).get('output')).toEqual(
      chronology.get('output')
    );
  });

  test('serializes one active run and cancels paused trailing waiters', async () => {
    const first = deferred<void>();
    let calls = 0;
    const coordinator = createGalleryRefreshCoordinator(() => {
      calls += 1;
      return calls === 1 ? first.promise : undefined;
    });
    const active = coordinator.request();
    const trailing = coordinator.request();
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
    coordinator.pause();
    await expect(trailing).rejects.toBeInstanceOf(GalleryRefreshPausedError);
    first.resolve();
    await active;
    expect(calls).toBe(1);
    coordinator.resume();
    await coordinator.request();
    expect(calls).toBe(2);
  });
  test('rejects failed work and remains retryable', async () => {
    let calls = 0;
    const coordinator = createGalleryRefreshCoordinator(() => {
      calls += 1;
      if (calls === 1) throw new Error('refresh failed');
    });
    await expect(coordinator.request()).rejects.toThrow('refresh failed');
    await coordinator.request();
    expect(calls).toBe(2);
    coordinator.dispose();
    await expect(coordinator.request()).rejects.toBeInstanceOf(GalleryRefreshDisposedError);
  });
});
