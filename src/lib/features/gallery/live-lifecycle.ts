import {
  decodeGalleryLiveEvent,
  type GalleryLiveEvent,
  type GalleryRefreshCoordinator,
  GalleryRefreshDisposedError,
  GalleryRefreshPausedError
} from './live-refresh';

export interface GalleryEventSourceMessage {
  data: string;
  lastEventId: string;
}
export interface GalleryEventSourceConnectionEvent {
  readonly type?: 'open' | 'error';
}
export type GalleryEventSourceEvent = GalleryEventSourceMessage | GalleryEventSourceConnectionEvent;
export interface GalleryEventSource {
  addEventListener(type: string, listener: (event: GalleryEventSourceEvent) => void): void;
  removeEventListener(type: string, listener: (event: GalleryEventSourceEvent) => void): void;
  close(): void;
}
export interface GalleryVisibility {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
export interface GalleryLiveLifecycleOptions {
  createEventSource(lastEventId: string | null): GalleryEventSource;
  visibility: GalleryVisibility;
  coordinator: GalleryRefreshCoordinator;
  abortSequence(): void;
  onEvent?(event: GalleryLiveEvent): boolean;
  onSnapshot?(eventId: number, catchUp: boolean): void;
  onDiagnostic?(message: string): void;
  onConnectionOpen?(): void;
  onConnectionError?(): void;
  onRefreshError?(error: unknown): void;
}
export interface GalleryLiveLifecycle {
  resume(): void;
  hide(): void;
  dispose(): void;
  readonly lastEventId: number;
  readonly generation: number;
  readonly refreshError: unknown | null;
}

const eventId = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
const snapshotId = (event: GalleryEventSourceMessage): number | null => {
  const id = eventId(event.lastEventId);
  if (id !== null) return id;
  try {
    const value = JSON.parse(event.data) as { watermark?: unknown };
    return typeof value.watermark === 'number' &&
      Number.isSafeInteger(value.watermark) &&
      value.watermark >= 0
      ? value.watermark
      : null;
  } catch {
    return null;
  }
};

/** Owns one Jobs EventSource and rejects callbacks from superseded visibility generations. */
export const createGalleryLiveLifecycle = (
  options: GalleryLiveLifecycleOptions
): GalleryLiveLifecycle => {
  let source: GalleryEventSource | null = null;
  let removeSourceListeners: (() => void) | null = null;
  let generation = 0;
  let lastEventId = 0;
  let hasLastEventId = false;
  let awaitingSnapshot = false;
  let disposed = false;
  let hidden = true;
  let refreshError: unknown | null = null;

  const close = () => {
    if (!source) return;
    removeSourceListeners?.();
    removeSourceListeners = null;
    source.close();
    source = null;
  };
  const requestRefresh = () => {
    void options.coordinator.request().then(
      () => {
        refreshError = null;
      },
      (error: unknown) => {
        if (
          error instanceof GalleryRefreshPausedError ||
          error instanceof GalleryRefreshDisposedError
        )
          return;
        refreshError = error;
        options.onRefreshError?.(error);
      }
    );
  };
  const open = () => {
    if (disposed || options.visibility.hidden || source) return;
    const sourceGeneration = generation;
    const candidate = options.createEventSource(hasLastEventId ? String(lastEventId) : null);
    source = candidate;
    awaitingSnapshot = true;
    let reconnecting = true;
    const current = () => !disposed && source === candidate && generation === sourceGeneration;
    const snapshot = (message: GalleryEventSourceEvent) => {
      if (!current()) return;
      if (
        typeof (message as GalleryEventSourceMessage).data !== 'string' ||
        typeof (message as GalleryEventSourceMessage).lastEventId !== 'string'
      ) {
        options.onDiagnostic?.('Ignored malformed Jobs snapshot.');
        return;
      }
      const id = snapshotId(message as GalleryEventSourceMessage);
      if (
        id === null ||
        (hasLastEventId && (id < lastEventId || (id === lastEventId && !awaitingSnapshot)))
      ) {
        options.onDiagnostic?.('Ignored stale or malformed Jobs snapshot.');
        return;
      }
      const catchUp = awaitingSnapshot;
      awaitingSnapshot = false;
      lastEventId = Math.max(lastEventId, id);
      hasLastEventId = true;
      options.onSnapshot?.(id, catchUp);
      requestRefresh();
    };
    const job = (message: GalleryEventSourceEvent) => {
      if (
        !current() ||
        typeof (message as GalleryEventSourceMessage).data !== 'string' ||
        typeof (message as GalleryEventSourceMessage).lastEventId !== 'string'
      )
        return;
      const event = message as GalleryEventSourceMessage;
      const id = eventId(event.lastEventId);
      if (id === null || (hasLastEventId && id <= lastEventId)) return;
      awaitingSnapshot = false;
      lastEventId = id;
      hasLastEventId = true;
      const decoded = decodeGalleryLiveEvent(event.data, id);
      if (!decoded) return;
      if (options.onEvent?.(decoded) !== false) requestRefresh();
    };
    const openConnection = (_event: GalleryEventSourceEvent) => {
      if (!current()) return;
      if (reconnecting) awaitingSnapshot = true;
      reconnecting = false;
      options.onConnectionOpen?.();
    };
    const connectionError = (_event: GalleryEventSourceEvent) => {
      if (!current()) return;
      reconnecting = true;
      options.onDiagnostic?.('Jobs event source connection failed.');
      options.onConnectionError?.();
    };
    candidate.addEventListener('snapshot', snapshot);
    candidate.addEventListener('job', job);
    candidate.addEventListener('open', openConnection);
    candidate.addEventListener('error', connectionError);
    removeSourceListeners = () => {
      candidate.removeEventListener('snapshot', snapshot);
      candidate.removeEventListener('job', job);
      candidate.removeEventListener('open', openConnection);
      candidate.removeEventListener('error', connectionError);
    };
  };
  const hide = () => {
    if (disposed || hidden) return;
    hidden = true;
    generation += 1;
    close();
    awaitingSnapshot = false;
    options.coordinator.pause();
    options.abortSequence();
  };
  const resume = () => {
    if (disposed || options.visibility.hidden || !hidden) return;
    hidden = false;
    options.coordinator.resume();
    open();
  };
  const visibility = () => (options.visibility.hidden ? hide() : resume());
  options.visibility.addEventListener('visibilitychange', visibility);
  if (!options.visibility.hidden) resume();

  return {
    resume,
    hide,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      close();
      awaitingSnapshot = false;
      options.visibility.removeEventListener('visibilitychange', visibility);
      options.coordinator.dispose();
      options.abortSequence();
    },
    get lastEventId() {
      return lastEventId;
    },
    get generation() {
      return generation;
    },
    get refreshError() {
      return refreshError;
    }
  };
};
