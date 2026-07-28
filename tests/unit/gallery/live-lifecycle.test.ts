import { describe, expect, test } from 'bun:test';
import {
  createGalleryLiveLifecycle,
  type GalleryEventSource,
  type GalleryEventSourceEvent,
  type GalleryEventSourceMessage
} from '../../../src/lib/features/gallery/live-lifecycle';
import {
  GalleryRefreshDisposedError,
  GalleryRefreshPausedError,
  type GalleryRefreshCoordinator
} from '../../../src/lib/features/gallery/live-refresh';

class Source implements GalleryEventSource {
  closed = 0;
  listeners = new Map<string, Set<(event: GalleryEventSourceEvent) => void>>();
  addEventListener(type: string, listener: (event: GalleryEventSourceEvent) => void) {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener);
  }
  removeEventListener(type: string, listener: (event: GalleryEventSourceEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {
    this.closed += 1;
  }
  emit(type: 'snapshot' | 'job', data: unknown, lastEventId: string) {
    for (const listener of this.listeners.get(type) ?? [])
      listener({ data: JSON.stringify(data), lastEventId } satisfies GalleryEventSourceMessage);
  }
  emitConnection(type: 'open' | 'error') {
    for (const listener of this.listeners.get(type) ?? []) listener({ type });
  }
}
function requiredSource(sources: Source[], index: number): Source {
  const source = sources[index];
  if (!source) throw new Error(`Expected event source at index ${index}`);
  return source;
}

class Visibility {
  hidden = false;
  listener: (() => void) | null = null;
  addEventListener(_type: 'visibilitychange', listener: () => void) {
    this.listener = listener;
  }
  removeEventListener(_type: 'visibilitychange', listener: () => void) {
    if (this.listener === listener) this.listener = null;
  }
  change(hidden: boolean) {
    this.hidden = hidden;
    this.listener?.();
  }
}
const coordinator = (request: () => Promise<void>): GalleryRefreshCoordinator => ({
  request,
  pause: () => undefined,
  resume: () => undefined,
  dispose: () => undefined,
  paused: false,
  disposed: false,
  active: false
});

describe('Gallery live lifecycle', () => {
  test('catches up exactly once for each accepted initial, reconnect, and gap snapshot', async () => {
    const visibility = new Visibility();
    const sources: Source[] = [];
    let pauses = 0;
    let resumes = 0;
    let aborts = 0;
    let requests = 0;
    const lifecycle = createGalleryLiveLifecycle({
      visibility,
      createEventSource: () => {
        const source = new Source();
        sources.push(source);
        return source;
      },
      coordinator: {
        ...coordinator(async () => {
          requests += 1;
        }),
        pause: () => {
          pauses += 1;
        },
        resume: () => {
          resumes += 1;
        }
      },
      abortSequence: () => {
        aborts += 1;
      }
    });
    const initialSource = requiredSource(sources, 0);
    initialSource.emitConnection('open');
    initialSource.emit('snapshot', { watermark: 4 }, '4');
    await Promise.resolve();
    expect(requests).toBe(1);
    initialSource.emit('snapshot', { watermark: 4 }, '4');
    initialSource.emit('job', { jobId: 'job', eventType: 'balance.cost.recorded' }, '5');
    initialSource.emit('job', { jobId: 'job', eventType: 'status.observed' }, '6');
    await Promise.resolve();
    expect(lifecycle.lastEventId).toBe(6);
    expect(requests).toBe(2);
    initialSource.emitConnection('error');
    initialSource.emitConnection('open');
    initialSource.emit('snapshot', { watermark: 6 }, '6');
    await Promise.resolve();
    expect(requests).toBe(3);
    initialSource.emit('snapshot', { watermark: 8 }, '8');
    await Promise.resolve();
    expect(requests).toBe(4);

    visibility.change(true);
    expect(initialSource.closed).toBe(1);
    expect(pauses).toBe(1);
    expect(aborts).toBe(1);
    initialSource.emit('job', { jobId: 'job', eventType: 'job.complete' }, '9');
    expect(lifecycle.lastEventId).toBe(8);

    visibility.change(false);
    const resumedSource = requiredSource(sources, 1);
    resumedSource.emitConnection('open');
    resumedSource.emit('snapshot', { watermark: 8 }, '8');
    await Promise.resolve();
    expect(requests).toBe(5);
    lifecycle.dispose();
    initialSource.emitConnection('error');
    resumedSource.emit('snapshot', { watermark: 9 }, '9');
    expect(lifecycle.lastEventId).toBe(8);
    expect(resumedSource.closed).toBe(1);
    expect(visibility.listener).toBeNull();
    expect(resumes).toBe(2);
    expect(aborts).toBe(2);
  });

  test('suppresses paused and disposed refresh rejections but exposes unexpected failures', async () => {
    const visibility = new Visibility();
    const sources: Source[] = [];
    const failure = new Error('refresh failed');
    const errors: unknown[] = [];
    let calls = 0;
    const lifecycle = createGalleryLiveLifecycle({
      visibility,
      createEventSource: () => {
        const source = new Source();
        sources.push(source);
        return source;
      },
      coordinator: coordinator(async () => {
        calls += 1;
        if (calls === 1) throw failure;
      }),
      abortSequence: () => undefined,
      onRefreshError: (error) => errors.push(error)
    });
    const source = requiredSource(sources, 0);
    source.emit('snapshot', { watermark: 1 }, '1');
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toEqual([failure]);
    expect(lifecycle.refreshError).toBe(failure);
    source.emit('job', { jobId: 'job', eventType: 'poll.failed' }, '2');
    await Promise.resolve();
    await Promise.resolve();
    expect(lifecycle.refreshError).toBeNull();

    const pausedSource = new Source();
    const pausedLifecycle = createGalleryLiveLifecycle({
      visibility: new Visibility(),
      createEventSource: () => pausedSource,
      coordinator: coordinator(() => Promise.reject(new GalleryRefreshPausedError())),
      abortSequence: () => undefined,
      onRefreshError: (error) => errors.push(error)
    });
    pausedSource.emit('snapshot', { watermark: 1 }, '1');
    await Promise.resolve();
    await Promise.resolve();
    pausedLifecycle.dispose();
    const disposedSource = new Source();
    const disposedLifecycle = createGalleryLiveLifecycle({
      visibility: new Visibility(),
      createEventSource: () => disposedSource,
      coordinator: coordinator(() => Promise.reject(new GalleryRefreshDisposedError())),
      abortSequence: () => undefined,
      onRefreshError: (error) => errors.push(error)
    });
    disposedSource.emit('snapshot', { watermark: 1 }, '1');
    await Promise.resolve();
    await Promise.resolve();
    disposedLifecycle.dispose();
    expect(errors).toEqual([failure]);
  });
});
