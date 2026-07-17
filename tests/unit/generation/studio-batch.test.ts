import { beforeEach, describe, expect, test } from 'bun:test';
import type { StudioJobDto } from '../../../src/lib/features/generation/contracts';
import {
  applyBatchJob,
  batchItemCompatibilityIssues,
  beginPaidBatchRetry,
  createBatchItem,
  duplicateBatchItem,
  readStudioBatch,
  restoreBatchItemForRegistry,
  restoreBatchRoleInputs,
  writeStudioBatch,
  type StudioBatch
} from '../../../src/lib/features/generation/studio-batch';
import { IMAGE_REGISTRY } from '../../../src/lib/features/registry/image-registry';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

const request = {
  actionId: '019b0000-0000-7000-8000-000000000001',
  entryKey: 'seedream-5.0-pro:text-to-image',
  values: { prompt: 'One', aspectRatio: '16:9', resolution: '2K' },
  expertOverrides: [],
  inputs: []
};
const sourceId = '019b0000-0000-7000-8000-000000000099';

function job(overrides: Partial<StudioJobDto> = {}): StudioJobDto {
  return {
    id: 'job-1',
    workflow: 'text-to-image',
    publicModelId: 'seedream-5.0-pro',
    localPhase: 'monitoring',
    remoteStatus: 'running',
    failureDomain: 'none',
    attentionCode: null,
    poyoTaskId: 'task-1',
    progress: 25,
    estimatedCredits: null,
    actualCredits: null,
    lastPolledAt: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    completedAt: null,
    ...overrides
  };
}

describe('studio batch persistence and state', () => {
  test('BATCH-01 creates and round-trips a secrets-free batch item', () => {
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: 'Seedream 5 Pro',
        sizeMode: 'aspect-ratio',
        automaticFields: [],
        request
      },
      {
        itemId: 'item-1',
        actionId: request.actionId,
        now: '2026-07-17T00:00:00.000Z'
      }
    );
    const batch: StudioBatch = { version: 1, modality: 'image', items: [item] };
    writeStudioBatch('image', batch);
    expect(readStudioBatch('image')).toEqual(batch);
    expect(JSON.stringify(batch)).not.toContain('POYO_API_KEY');
    expect(JSON.stringify(batch)).not.toContain('/Users/');
  });

  test('BATCH-02 duplicates a draft with new stable IDs and no shared mutable values', () => {
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: 'Seedream 5 Pro',
        sizeMode: 'aspect-ratio',
        automaticFields: ['aspectRatio'],
        request
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    const copy = duplicateBatchItem(item, {
      itemId: 'item-2',
      actionId: '019b0000-0000-7000-8000-000000000002',
      now: '2026-07-17T01:00:00.000Z'
    });
    expect(copy.id).toBe('item-2');
    expect(copy.request.actionId).toBe('019b0000-0000-7000-8000-000000000002');
    expect(copy.state).toBe('draft');
    copy.request.values.prompt = 'Two';
    expect(item.request.values.prompt).toBe('One');
  });

  test('BATCH-03 maps durable job truth without losing an item after partial failure', () => {
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: 'Seedream 5 Pro',
        sizeMode: 'aspect-ratio',
        automaticFields: [],
        request
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    expect(applyBatchJob(item, job()).state).toBe('running');
    expect(
      applyBatchJob(item, job({ localPhase: 'complete', remoteStatus: 'finished', progress: 100 }))
        .state
    ).toBe('complete');
    expect(
      applyBatchJob(item, job({ localPhase: 'complete', remoteStatus: 'failed', progress: 100 }))
        .state
    ).toBe('failed');

    const complete = applyBatchJob(
      item,
      job({
        localPhase: 'complete',
        remoteStatus: 'finished',
        progress: 100,
        updatedAt: '2026-07-17T00:02:00.000Z'
      })
    );
    expect(
      applyBatchJob(
        complete,
        job({
          localPhase: 'monitoring',
          remoteStatus: 'running',
          updatedAt: '2026-07-17T00:01:00.000Z'
        })
      )
    ).toEqual(complete);
  });

  test('BATCH-04 restores uploaded reference metadata without a browser File or local path', () => {
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: 'Flux Dev',
        sizeMode: 'aspect-ratio',
        automaticFields: ['aspectRatio'],
        request: {
          ...request,
          inputs: [
            {
              role: 'reference',
              source: 'uploaded',
              mediaKind: 'image',
              url: 'https://uploads.test/source.png',
              localSourceId: sourceId,
              metadata: {
                name: '/Users/alice/private/source.png',
                expiresAt: '2026-07-18T00:00:00.000Z',
                width: 900,
                height: 1601
              }
            }
          ]
        }
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    const batch: StudioBatch = { version: 1, modality: 'image', items: [item] };
    expect(writeStudioBatch('image', batch)).toBe(true);
    const stored = readStudioBatch('image');
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain('/Users/alice');
    expect(JSON.stringify(stored)).not.toContain('uploads.test');
    expect(JSON.stringify(stored)).not.toContain('expiresAt');
    expect(stored?.items[0]?.request.inputs[0]?.url).toBe(
      `https://retained-source.invalid/${sourceId}`
    );
    expect(restoreBatchRoleInputs(stored?.items[0] ?? item).reference?.[0]).toMatchObject({
      localSourceId: sourceId,
      width: 900,
      height: 1601,
      name: 'Uploaded reference'
    });
  });

  test('BATCH-05 rejects malformed, oversized, and over-capacity storage', () => {
    localStorage.setItem('poyo-studio-batch:image', '{bad');
    expect(readStudioBatch('image')).toBeNull();
    localStorage.setItem('poyo-studio-batch:image', 'x'.repeat(500_001));
    expect(readStudioBatch('image')).toBeNull();
    localStorage.setItem(
      'poyo-studio-batch:image',
      JSON.stringify({
        version: 1,
        modality: 'image',
        items: Array.from({ length: 21 }, () => ({}))
      })
    );
    expect(readStudioBatch('image')).toBeNull();

    const item = createBatchItem(
      {
        modality: 'image',
        displayName: 'Seedream 5 Pro',
        sizeMode: 'aspect-ratio',
        automaticFields: [],
        request
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    for (const malformed of [
      { ...item, request: { ...item.request, inputs: [{}] } },
      { ...item, request: { ...item.request, expertOverrides: [{}] } },
      { ...item, job: { id: 'truncated' } },
      { ...item, outputs: [{ outputId: 'truncated' }] }
    ]) {
      localStorage.setItem(
        'poyo-studio-batch:image',
        JSON.stringify({ version: 1, modality: 'image', items: [malformed] })
      );
      expect(readStudioBatch('image')).toBeNull();
    }
  });

  test('BATCH-06 begins a paid retry with a durable new action and no stale job or output', () => {
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: 'Seedream 5 Pro',
        sizeMode: 'aspect-ratio',
        automaticFields: [],
        request
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    const failed = {
      ...applyBatchJob(item, job({ remoteStatus: 'failed' })),
      outputs: [
        {
          outputId: 'output-1',
          mediaKind: 'image' as const,
          mediaUrl: null,
          aspectRatio: null,
          pixelWidth: null,
          pixelHeight: null,
          fileName: null,
          downloadState: 'failed',
          localAvailable: false
        }
      ]
    };
    const nextAction = '019b0000-0000-7000-8000-000000000002';
    const retry = beginPaidBatchRetry(failed, nextAction, '2026-07-17T01:00:00.000Z');
    expect(retry).toMatchObject({
      state: 'submitting',
      job: null,
      outputs: [],
      request: { actionId: nextAction }
    });
  });

  test('BATCH-07 detects same-key registry drift before a saved draft can submit', () => {
    const entry = IMAGE_REGISTRY.entries.find(
      (candidate) => candidate.key === 'seedream-5.0-pro:text-to-image'
    );
    if (!entry) throw new Error('Missing Seedream registry fixture.');
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: entry.displayName,
        sizeMode: 'aspect-ratio',
        automaticFields: ['aspectRatio'],
        request
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    expect(batchItemCompatibilityIssues(item, entry)).toEqual([]);
    const withoutAspectRatio = {
      ...entry,
      fields: entry.fields.filter((field) => field.key !== 'aspectRatio')
    };
    expect(batchItemCompatibilityIssues(item, withoutAspectRatio)).toEqual(
      expect.arrayContaining([
        'Automatic aspectRatio is no longer supported.',
        'The saved aspectRatio option is no longer supported.'
      ])
    );
    expect(
      batchItemCompatibilityIssues(item, {
        ...entry,
        fields: [
          ...entry.fields,
          {
            key: 'newRequiredField',
            apiKey: 'new_required_field',
            kind: 'text',
            level: 'common',
            required: true
          }
        ]
      })
    ).toContain('The newRequiredField option is now required.');
  });

  test('BATCH-DIM keeps custom dimensions compatible only while the capability exists', () => {
    const entry = IMAGE_REGISTRY.entries.find(
      (candidate) => candidate.key === 'flux-schnell:text-to-image'
    );
    if (!entry) throw new Error('Missing Flux Schnell registry fixture.');
    expect(entry.fields).toContainEqual(
      expect.objectContaining({ key: 'dimensions', kind: 'dimensions' })
    );
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: entry.displayName,
        sizeMode: 'custom',
        automaticFields: [],
        request: {
          ...request,
          entryKey: entry.key,
          values: { prompt: 'custom', width: 1024, height: 1024 }
        }
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );

    expect(batchItemCompatibilityIssues(item, entry)).toEqual([]);
    expect(restoreBatchItemForRegistry(item, entry)).toMatchObject({
      state: 'draft',
      error: null,
      request: { values: { width: 1024, height: 1024 } }
    });

    const withoutDimensions = {
      ...entry,
      fields: entry.fields.filter((field) => field.kind !== 'dimensions')
    };
    expect(batchItemCompatibilityIssues(item, withoutDimensions)).toEqual(
      expect.arrayContaining([
        'The saved width option is no longer supported.',
        'The saved height option is no longer supported.'
      ])
    );
  });

  test('BATCH-08 preserves allowed Expert overrides and paid ambiguity across registry drift', () => {
    const entry = IMAGE_REGISTRY.entries.find(
      (candidate) => candidate.key === 'seedream-5.0-pro:text-to-image'
    );
    if (!entry) throw new Error('Missing Seedream registry fixture.');
    const item = createBatchItem(
      {
        modality: 'image',
        displayName: entry.displayName,
        sizeMode: 'aspect-ratio',
        automaticFields: ['aspectRatio'],
        request: {
          ...request,
          expertOverrides: [{ key: 'future_parameter', value: 'kept' }]
        }
      },
      { itemId: 'item-1', actionId: request.actionId, now: '2026-07-17T00:00:00.000Z' }
    );
    expect(batchItemCompatibilityIssues(item, entry)).toEqual([]);
    expect(
      batchItemCompatibilityIssues(
        {
          ...item,
          request: { ...item.request, expertOverrides: [{ key: 'api_key', value: 'blocked' }] }
        },
        entry
      )
    ).toContain('The saved Expert api_key override is no longer supported.');

    expect(restoreBatchItemForRegistry({ ...item, state: 'submitting' }, undefined)).toMatchObject({
      state: 'unknown',
      request: { actionId: request.actionId }
    });
    expect(
      restoreBatchItemForRegistry(
        { ...item, state: 'unknown', error: 'Reconcile this paid action.' },
        { ...entry, fields: [] }
      )
    ).toMatchObject({ state: 'unknown', error: 'Reconcile this paid action.' });
  });
});
