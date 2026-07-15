import { afterEach, describe, expect, test } from 'bun:test';
import { systemClock } from '../../../src/lib/server/poyo/backoff';
import { PoyoClient } from '../../../src/lib/server/poyo/client';
import { PoyoError } from '../../../src/lib/server/poyo/errors';
import { MemoryPoyoMetadataLogger } from '../../../src/lib/server/poyo/logging';
import { PoyoTransport } from '../../../src/lib/server/poyo/transport';
import type { Sleeper } from '../../../src/lib/server/poyo/types';
import { startMockPoyoServer } from '../../helpers/mock-poyo-server';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function uploadResponse(name = 'asset.png') {
  return {
    success: true,
    code: 200,
    msg: 'File uploaded successfully',
    data: {
      file_id: `file-${name}`,
      file_name: name,
      original_name: name,
      file_size: 5,
      mime_type: name.endsWith('.mp4') ? 'video/mp4' : 'image/png',
      upload_path: 'temp/uploads',
      file_url: `https://media.example/${name}`,
      download_url: `https://media.example/${name}`,
      upload_time: '2026-07-15T12:00:00Z',
      expires_at: '2026-07-18T12:00:00Z'
    }
  };
}

function clientFor(
  baseUrl: string,
  options: {
    sleeper?: Sleeper;
    logger?: MemoryPoyoMetadataLogger;
    timeoutMs?: number;
  } = {}
): { client: PoyoClient; secret: string } {
  const secret = ['sk', 'poyo_transport_canary_123456'].join('-');
  const transport = new PoyoTransport({
    apiKey: secret,
    baseUrl,
    clock: systemClock,
    ...(options.sleeper ? { sleeper: options.sleeper } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.timeoutMs === undefined ? {} : { defaultTimeoutMs: options.timeoutMs }),
    random: () => 0.5
  });
  return { client: new PoyoClient(transport, systemClock), secret };
}

describe('Poyo authenticated transport', () => {
  test('PYO-01 sends one exact paid submission and logs metadata without secrets or payloads', async () => {
    const mock = await startMockPoyoServer(() => ({
      body: {
        code: 200,
        data: {
          task_id: 'task-paid-1',
          status: 'not_started',
          created_time: '2026-07-15T12:00:00Z'
        }
      }
    }));
    cleanups.push(mock.stop);
    const logger = new MemoryPoyoMetadataLogger();
    const { client, secret } = clientFor(mock.baseUrl, { logger });

    const result = await client.submit({
      model: 'provider/model:image-to-image',
      input: { prompt: 'A calm coastline', image_url: 'https://assets.example/input.png' }
    });

    expect(result).toMatchObject({ taskId: 'task-paid-1', status: 'not_started' });
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/generate/submit',
      authorizationScheme: 'Bearer',
      bodyKind: 'json',
      json: {
        model: 'provider/model:image-to-image',
        input: { prompt: 'A calm coastline', image_url: 'https://assets.example/input.png' }
      }
    });
    const logged = JSON.stringify(logger.events);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('A calm coastline');
    expect(logged).not.toContain('image_url');
  });

  test('BAL-01 retries an idempotent balance read after Retry-After and stamps freshness', async () => {
    const mock = await startMockPoyoServer([
      () => ({
        status: 429,
        headers: { 'retry-after': '0.25' },
        body: { code: 429, error: { message: 'slow down', type: 'rate_limit' } }
      }),
      () => ({
        body: { code: 200, data: { email: 'studio@example.test', credits_amount: 9765 } }
      })
    ]);
    cleanups.push(mock.stop);
    const delays: number[] = [];
    const { client } = clientFor(mock.baseUrl, {
      sleeper: {
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        }
      }
    });

    const balance = await client.getBalance();
    expect(balance.email).toBe('studio@example.test');
    expect(balance.creditsAmount).toBe(9765);
    expect(Date.parse(balance.fetchedAt)).not.toBeNaN();
    expect(delays).toEqual([250]);
    expect(mock.requests).toHaveLength(2);
  });

  test('PYO-03 parses unwrapped live status without manufacturing progress', async () => {
    const mock = await startMockPoyoServer(() => ({
      body: {
        task_id: 'task-running',
        status: 'running',
        credits_amount: 2,
        files: [],
        created_time: '2026-07-15T12:00:00Z'
      }
    }));
    cleanups.push(mock.stop);
    const { client } = clientFor(mock.baseUrl);

    const status = await client.getStatus('task/running');
    expect(status).toMatchObject({ status: 'running', progress: null, files: [] });
    expect(mock.requests[0]?.path).toBe('/api/generate/status/task%2Frunning');
  });

  test('PYO-04 exercises documented URL, base64, and streaming upload contracts', async () => {
    const mock = await startMockPoyoServer([
      () => ({ body: uploadResponse('remote.png') }),
      () => ({ body: uploadResponse('encoded.png') }),
      () => ({ body: uploadResponse('motion.mp4') })
    ]);
    cleanups.push(mock.stop);
    const { client } = clientFor(mock.baseUrl);

    await client.upload({
      kind: 'remote-url',
      url: 'https://assets.example/remote.png',
      fileName: 'remote.png'
    });
    await client.upload({ kind: 'base64', data: 'AQIDBA==', fileName: 'encoded.png' });
    await client.upload({
      kind: 'local-file',
      file: new Blob(['video'], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      sizeBytes: 5,
      mediaKind: 'video',
      fileName: 'motion.mp4'
    });

    expect(mock.requests.map((request) => request.path)).toEqual([
      '/api/common/upload/url',
      '/api/common/upload/base64',
      '/api/common/upload/stream'
    ]);
    expect(mock.requests[0]?.json).toEqual({
      file_url: 'https://assets.example/remote.png',
      file_name: 'remote.png'
    });
    expect(mock.requests[1]?.json).toEqual({
      base64_data: '[REDACTED_MEDIA:8]',
      file_name: 'encoded.png'
    });
    expect(mock.requests[2]?.multipart).toEqual({
      file: { name: 'motion.mp4', size: 5, type: 'video/mp4' },
      file_name: 'motion.mp4'
    });
  });

  test('PYO-06 never retries paid submissions or uploads after ambiguous provider failures', async () => {
    const mock = await startMockPoyoServer(() => ({
      status: 503,
      body: { code: 503, error: { message: 'unavailable', type: 'service_unavailable' } }
    }));
    cleanups.push(mock.stop);
    const { client } = clientFor(mock.baseUrl);

    await expect(
      client.submit({ model: 'model', input: { prompt: 'test' } })
    ).rejects.toMatchObject({ category: 'provider', retryable: true });
    await expect(
      client.upload({ kind: 'remote-url', url: 'https://assets.example/source.png' })
    ).rejects.toMatchObject({ category: 'provider', retryable: true });
    expect(mock.requests).toHaveLength(2);
    expect(mock.requests.map((request) => request.path)).toEqual([
      '/api/generate/submit',
      '/api/common/upload/url'
    ]);
  });

  test('PYO-06 treats a local status timeout as network uncertainty, not generation failure', async () => {
    const mock = await startMockPoyoServer(async () => {
      await Bun.sleep(50);
      return {
        body: {
          code: 200,
          data: {
            task_id: 'late-task',
            status: 'running',
            credits_amount: 2,
            files: [],
            created_time: '2026-07-15T12:00:00Z'
          }
        }
      };
    });
    cleanups.push(mock.stop);
    const { client } = clientFor(mock.baseUrl, { timeoutMs: 5 });

    try {
      await client.getStatus('late-task', { timeoutMs: 5 });
      throw new Error('Expected timeout');
    } catch (error) {
      expect(error).toBeInstanceOf(PoyoError);
      expect(error).toMatchObject({
        category: 'network',
        technicalCode: 'request_timeout',
        retryable: true
      });
      expect((error as Error).message).toContain('remote generation state is unchanged');
      expect((error as Error).message).not.toContain('failed');
    }
  });
});
