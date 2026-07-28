export type GalleryOutputEventType =
  | 'download.started'
  | 'download.verified'
  | 'download.failed'
  | 'output.local_file_removed'
  | 'output.local_metadata_removed'
  | 'output.local_both_removed';

export type GalleryJobEventType =
  | 'job.transition'
  | 'job.complete'
  | 'status.observed'
  | 'output_set.malformed'
  | 'poll.failed'
  | 'poll.policy_blocked';

export interface GalleryLiveEvent {
  eventId: number;
  jobId: string;
  eventType: GalleryJobEventType | GalleryOutputEventType;
  outputId?: string;
}

export interface GalleryOutputChronology {
  eventId: number;
  removed: boolean;
  verified: boolean;
}

const outputEvents = new Set<GalleryOutputEventType>([
  'download.started',
  'download.verified',
  'download.failed',
  'output.local_file_removed',
  'output.local_metadata_removed',
  'output.local_both_removed'
]);
const jobEvents = new Set<GalleryJobEventType>([
  'job.transition',
  'job.complete',
  'status.observed',
  'output_set.malformed',
  'poll.failed',
  'poll.policy_blocked'
]);
const removalEvents = new Set<GalleryOutputEventType>([
  'output.local_file_removed',
  'output.local_metadata_removed',
  'output.local_both_removed'
]);

const durableId = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Decodes only the public, Gallery-relevant subset of a Jobs SSE payload. */
export const decodeGalleryLiveEvent = (data: string, eventId: unknown): GalleryLiveEvent | null => {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = durableId(eventId) ?? durableId(record.eventId);
  if (id === null || typeof record.jobId !== 'string' || !record.jobId) return null;
  if (
    !jobEvents.has(record.eventType as GalleryJobEventType) &&
    !outputEvents.has(record.eventType as GalleryOutputEventType)
  )
    return null;
  const eventType = record.eventType as GalleryLiveEvent['eventType'];
  const event: GalleryLiveEvent = { eventId: id, jobId: record.jobId, eventType };
  if (outputEvents.has(event.eventType as GalleryOutputEventType)) {
    const outputId = (record.payload as Record<string, unknown> | null)?.outputId;
    if (typeof outputId !== 'string' || !outputId) return null;
    event.outputId = outputId;
  }
  return event;
};

/** Applies an output event only when it is newer than the durable event already observed. */
export const applyGalleryOutputChronology = (
  chronology: ReadonlyMap<string, GalleryOutputChronology>,
  event: GalleryLiveEvent
): Map<string, GalleryOutputChronology> => {
  if (!event.outputId) return new Map(chronology);
  const current = chronology.get(event.outputId);
  if (current && current.eventId >= event.eventId) return new Map(chronology);
  const type = event.eventType as GalleryOutputEventType;
  const next: GalleryOutputChronology = removalEvents.has(type)
    ? { eventId: event.eventId, removed: true, verified: false }
    : type === 'download.started'
      ? { eventId: event.eventId, removed: false, verified: false }
      : type === 'download.verified'
        ? { eventId: event.eventId, removed: false, verified: true }
        : {
            eventId: event.eventId,
            removed: current?.removed ?? false,
            verified: current?.verified ?? false
          };
  const result = new Map(chronology);
  result.set(event.outputId, next);
  return result;
};

export class GalleryRefreshPausedError extends Error {
  constructor() {
    super('Gallery refresh is paused.');
    this.name = 'GalleryRefreshPausedError';
  }
}

export class GalleryRefreshDisposedError extends Error {
  constructor() {
    super('Gallery refresh coordinator is disposed.');
    this.name = 'GalleryRefreshDisposedError';
  }
}

export interface GalleryRefreshCoordinator {
  request(): Promise<void>;
  pause(): void;
  resume(): void;
  dispose(): void;
  readonly paused: boolean;
  readonly disposed: boolean;
  readonly active: boolean;
}

/** Serializes invalidations without timers: one running batch and at most one trailing batch. */
export const createGalleryRefreshCoordinator = (
  run: () => Promise<void> | void
): GalleryRefreshCoordinator => {
  let paused = false;
  let disposed = false;
  let active = false;
  let current: Array<{ resolve: () => void; reject: (reason: unknown) => void }> = [];
  let trailing: Array<{ resolve: () => void; reject: (reason: unknown) => void }> = [];

  const reject = (waiters: typeof current, reason: Error) =>
    waiters.forEach((waiter) => {
      waiter.reject(reason);
    });
  const start = () => {
    if (active || paused || disposed || !current.length) return;
    active = true;
    Promise.resolve()
      .then(run)
      .then(
        () =>
          current.forEach((waiter) => {
            waiter.resolve();
          }),
        (error) =>
          current.forEach((waiter) => {
            waiter.reject(error);
          })
      )
      .finally(() => {
        active = false;
        current = [];
        if (disposed) {
          reject(trailing, new GalleryRefreshDisposedError());
          trailing = [];
        } else if (paused) {
          reject(trailing, new GalleryRefreshPausedError());
          trailing = [];
        } else if (trailing.length) {
          current = trailing;
          trailing = [];
          start();
        }
      });
  };

  return {
    request() {
      if (disposed) return Promise.reject(new GalleryRefreshDisposedError());
      if (paused) return Promise.reject(new GalleryRefreshPausedError());
      return new Promise<void>((resolve, rejectWaiter) => {
        (active ? trailing : current).push({ resolve, reject: rejectWaiter });
        start();
      });
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      reject(trailing, new GalleryRefreshPausedError());
      trailing = [];
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      paused = true;
      reject(trailing, new GalleryRefreshDisposedError());
      trailing = [];
    },
    get paused() {
      return paused;
    },
    get disposed() {
      return disposed;
    },
    get active() {
      return active;
    }
  };
};
