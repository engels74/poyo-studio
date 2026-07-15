import { describe, expect, test } from 'bun:test';
import {
  createJobRequest,
  initialGuidedValues,
  mediaAccept,
  parseExpertOverrides,
  presetValues,
  sizeModes,
  valuesWithRoleInputs,
  visibleFields
} from '../../../src/lib/features/generation/studio-controller';
import { IMAGE_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/image-registry';
import { normalizeRegistryRequest } from '../../../src/lib/features/registry/normalize-registry';
import { VIDEO_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/video-registry';

function imageEntry(key: string) {
  const entry = IMAGE_REGISTRY_ENTRIES.find((item) => item.key === key);
  if (!entry) throw new Error(`Missing image entry ${key}`);
  return entry;
}

function videoEntry(key: string) {
  const entry = VIDEO_REGISTRY_ENTRIES.find((item) => item.key === key);
  if (!entry) throw new Error(`Missing video entry ${key}`);
  return entry;
}

describe('registry-driven studio controller', () => {
  test('STUDIO-01 defaults compatible safety checkers off and never adds them elsewhere', () => {
    const seedream = imageEntry('seedream-5.0-pro:text-to-image');
    expect(initialGuidedValues(seedream).enableSafetyChecker).toBe(false);
    const flux = imageEntry('flux-schnell:text-to-image');
    expect(initialGuidedValues(flux)).not.toHaveProperty('enableSafetyChecker');
  });

  test('STUDIO-02 keeps Seedream 5 Pro size concepts separate and shows one mode at a time', () => {
    const seedream = imageEntry('seedream-5.0-pro:text-to-image');
    expect(sizeModes(seedream)).toEqual(['resolution', 'aspect-ratio']);
    expect(visibleFields(seedream, 'common', 'resolution').map((field) => field.key)).toContain(
      'resolution'
    );
    expect(visibleFields(seedream, 'common', 'resolution').map((field) => field.key)).not.toContain(
      'aspectRatio'
    );
    expect(visibleFields(seedream, 'common', 'aspect-ratio').map((field) => field.key)).toContain(
      'aspectRatio'
    );
    const flux = imageEntry('flux-2-pro:text-to-image');
    expect(sizeModes(flux)).toEqual([]);
    expect(visibleFields(flux, 'common', 'resolution').map((field) => field.key)).toEqual(
      expect.arrayContaining(['aspectRatio', 'resolution'])
    );
  });

  test('STUDIO-03 assigns scalar and list media roles to their registry request keys', () => {
    const frame = videoEntry('kling-2.6:frame-to-video');
    const values = valuesWithRoleInputs(
      frame,
      { prompt: 'animate this scene' },
      {
        'start-frame': [
          {
            id: 'start',
            role: 'start-frame',
            source: 'remote',
            url: 'https://assets.test/start.png',
            name: 'start.png',
            mediaKind: 'image'
          }
        ],
        'end-frame': [
          {
            id: 'end',
            role: 'end-frame',
            source: 'remote',
            url: 'https://assets.test/end.png',
            name: 'end.png',
            mediaKind: 'image'
          }
        ]
      }
    );
    expect(values).toMatchObject({
      imageUrls: ['https://assets.test/start.png'],
      endImageUrl: 'https://assets.test/end.png'
    });
  });

  test('STUDIO-04 serializes preset URLs and expert overrides without media bodies', () => {
    const values = presetValues(
      'image',
      { prompt: 'quiet editorial portrait', enableSafetyChecker: false },
      parseExpertOverrides('{"future_parameter":3}'),
      {
        reference: [
          {
            id: 'reference',
            role: 'reference',
            source: 'remote',
            url: 'https://assets.test/reference.png',
            name: 'reference.png',
            mediaKind: 'image'
          }
        ]
      }
    );
    expect(values.expertOverrides).toEqual([{ key: 'future_parameter', value: 3 }]);
    expect(values.inputRoles[0]?.urls).toEqual(['https://assets.test/reference.png']);
    expect(JSON.stringify(values)).not.toContain('Blob');
  });

  test('STUDIO-05 creates the exact validated job request and correct upload accept list', () => {
    const entry = imageEntry('seedream-5.0-pro:text-to-image');
    const guided = { prompt: 'quiet editorial portrait', resolution: '2K' };
    const preview = normalizeRegistryRequest(entry.key, guided);
    expect(createJobRequest(entry, guided, preview)).toMatchObject({
      workflow: 'text-to-image',
      publicModelId: 'seedream-5.0-pro',
      normalizedPayload: preview.request,
      prompt: guided.prompt
    });
    const role = imageEntry('flux-2-pro-edit:image-edit').inputRoles[0];
    if (!role) throw new Error('Missing reference role.');
    expect(mediaAccept(role)).toBe('image/jpeg,image/png,image/gif,image/webp');
  });

  test('STUDIO-06 persists browser-probed media metadata with the submitted input record', () => {
    const entry = imageEntry('flux-dev:image-edit');
    const roleInputs = {
      reference: [
        {
          id: 'reference',
          role: 'reference',
          source: 'uploaded' as const,
          url: 'https://assets.test/reference.png',
          name: 'reference.png',
          mediaKind: 'image' as const,
          localSourceId: 'source-1',
          sizeBytes: 42,
          width: 1024,
          height: 768,
          metadataProbe: 'measured' as const
        }
      ]
    };
    const guided = valuesWithRoleInputs(
      entry,
      { ...initialGuidedValues(entry), prompt: 'Reframe the source' },
      roleInputs
    );
    const preview = normalizeRegistryRequest(entry.key, guided);

    expect(createJobRequest(entry, guided, preview, roleInputs).inputs[0]).toMatchObject({
      localSourceId: 'source-1',
      metadata: {
        name: 'reference.png',
        sizeBytes: 42,
        width: 1024,
        height: 768,
        metadataProbe: 'measured'
      }
    });
  });
});
