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
  createChannel?: (name: string) => DownloadRequestChannel;
}

export interface DownloadRequestSync {
  publish(update: DownloadRequestUpdate): void;
  dispose(): void;
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
  createChannel = (name) => new BroadcastChannel(name)
}: DownloadRequestSyncOptions): DownloadRequestSync {
  const channel = createChannel(CHANNEL_NAME);
  const receive = (event: MessageEvent<unknown>) => {
    if (validUpdate(event.data)) {
      onupdate({ outputId: event.data.outputId, requestedAt: event.data.requestedAt });
    }
  };
  channel.addEventListener('message', receive);

  return {
    publish(update) {
      const message: DownloadRequestMessage = { version: 1, ...update };
      if (!validUpdate(message)) return;
      onupdate(update);
      channel.postMessage(message);
    },
    dispose() {
      channel.removeEventListener('message', receive);
      channel.close();
    }
  };
}
