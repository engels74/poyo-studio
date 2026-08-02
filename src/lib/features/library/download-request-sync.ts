import { isExactIsoUtcInstant } from './contracts';

const CHANNEL_NAME = 'poyo-download-requests-v1';

export interface DownloadRequestUpdate {
  outputId: string;
  requestedAt: string;
}

interface DownloadRequestMessage extends DownloadRequestUpdate {
  version: 1;
}

interface DownloadRequestChannel {
  postMessage(message: DownloadRequestMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

interface DownloadRequestSyncOptions {
  onupdate: (update: DownloadRequestUpdate) => void;
  createChannel?: (name: string) => DownloadRequestChannel | null;
}

export interface DownloadRequestSync {
  publish(update: DownloadRequestUpdate): void;
  dispose(): void;
}

export interface DownloadRequestReconciler {
  /** Requests one authoritative refresh. Requests raised while one runs collapse into a single rerun. */
  request(): Promise<void>;
  readonly pending: boolean;
}

export function latestDownloadRequestAt(
  ...candidates: Array<string | null | undefined>
): string | null {
  let latest: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    if (!isExactIsoUtcInstant(candidate)) continue;
    const timestamp = Date.parse(candidate);
    if (timestamp > latestTimestamp) {
      latest = candidate;
      latestTimestamp = timestamp;
    }
  }
  return latest;
}

/**
 * Merges an accepted request into recorded marks, keeping the newest valid instant per output.
 * Returns null when the update adds nothing, so callers can skip a needless state write.
 */
export function mergeDownloadRequest(
  requests: ReadonlyMap<string, string>,
  update: DownloadRequestUpdate
): Map<string, string> | null {
  const current = requests.get(update.outputId);
  const latest = latestDownloadRequestAt(current, update.requestedAt);
  if (!latest || latest === current) return null;
  return new Map(requests).set(update.outputId, latest);
}

/**
 * Serializes authoritative refreshes so persisted state, not a transient broadcast, settles the
 * marks. A request raised during a running refresh schedules exactly one more run afterwards.
 */
export function createDownloadRequestReconciler(
  refresh: () => Promise<void>
): DownloadRequestReconciler {
  let running: Promise<void> | null = null;
  let rerun = false;

  const drain = async (): Promise<void> => {
    do {
      rerun = false;
      try {
        await refresh();
      } catch {
        // A failed refresh keeps the optimistic mark; the next boundary reconciles again.
      }
    } while (rerun);
    running = null;
  };

  return {
    request() {
      if (running) {
        rerun = true;
        return running;
      }
      running = drain();
      return running;
    },
    get pending() {
      return running !== null;
    }
  };
}

function validUpdate(value: unknown): value is DownloadRequestMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    Object.keys(message).length === 3 &&
    message.version === 1 &&
    typeof message.outputId === 'string' &&
    message.outputId.length > 0 &&
    isExactIsoUtcInstant(message.requestedAt)
  );
}

export function createDownloadRequestSync({
  onupdate,
  createChannel = (name) =>
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)
}: DownloadRequestSyncOptions): DownloadRequestSync {
  let channel: DownloadRequestChannel | null = null;
  try {
    channel = createChannel(CHANNEL_NAME);
  } catch {
    // Cross-tab synchronization is optional; local request state must remain usable.
  }
  const receive = (event: MessageEvent<unknown>) => {
    if (validUpdate(event.data)) {
      onupdate({ outputId: event.data.outputId, requestedAt: event.data.requestedAt });
    }
  };
  channel?.addEventListener('message', receive);

  return {
    publish(update) {
      const message: DownloadRequestMessage = { version: 1, ...update };
      if (!validUpdate(message)) return;
      onupdate(update);
      try {
        channel?.postMessage(message);
      } catch {
        // Cross-tab delivery failure must not undo the accepted local request.
      }
    },
    dispose() {
      channel?.removeEventListener('message', receive);
      channel?.close();
    }
  };
}
