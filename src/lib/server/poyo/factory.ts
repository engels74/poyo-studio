import type { ApiKeyManager } from '../settings/api-key-manager';
import type { StructuredLogger } from '../diagnostics/jsonl-logger';
import { systemClock } from './backoff';
import { PoyoClient } from './client';
import { PoyoError } from './errors';
import { createPoyoMetadataLogger } from './logging';
import { PoyoTransport, type PoyoTransportOptions } from './transport';
import type { Clock } from './types';

export interface PoyoClientFactoryOptions
  extends Omit<PoyoTransportOptions, 'apiKey' | 'clock' | 'logger'> {
  apiKeyManager: Pick<ApiKeyManager, 'resolve'>;
  logger?: StructuredLogger;
  clock?: Clock;
}

export async function createPoyoClient(options: PoyoClientFactoryOptions): Promise<PoyoClient> {
  const resolved = await options.apiKeyManager.resolve();
  if (!resolved.key) {
    throw new PoyoError({
      category: 'authentication',
      technicalCode: 'api_key_missing',
      message: 'Configure a Poyo API key before connecting.',
      retryable: false,
      operation: 'configuration'
    });
  }
  const clock = options.clock ?? systemClock;
  const transport = new PoyoTransport({
    apiKey: resolved.key,
    clock,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.sleeper ? { sleeper: options.sleeper } : {}),
    ...(options.random ? { random: options.random } : {}),
    ...(options.retryPolicy ? { retryPolicy: options.retryPolicy } : {}),
    ...(options.defaultTimeoutMs === undefined
      ? {}
      : { defaultTimeoutMs: options.defaultTimeoutMs }),
    ...(options.maxResponseBytes === undefined
      ? {}
      : { maxResponseBytes: options.maxResponseBytes }),
    ...(options.logger ? { logger: createPoyoMetadataLogger(options.logger) } : {})
  });
  return new PoyoClient(transport, clock);
}

export async function createRuntimePoyoClient(): Promise<PoyoClient> {
  const { getPlatformServices } = await import('../platform/runtime');
  const platform = await getPlatformServices();
  return createPoyoClient({ apiKeyManager: platform.apiKey, logger: platform.logger });
}
