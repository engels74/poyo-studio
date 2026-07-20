import { describe, expect, test } from 'bun:test';
import { normalizeRegistryRequest } from '../../../src/lib/features/registry/normalize-registry';
import {
  canonicalizeVideoSelection,
  LEGACY_WAN_IMAGE_TO_VIDEO_KEY,
  WAN_IMAGE_TO_VIDEO_KEY
} from '../../../src/lib/features/registry/video-selection';

describe('video registry selection compatibility', () => {
  test('canonicalizes only the known legacy WAN key/workflow pair', () => {
    expect(canonicalizeVideoSelection(LEGACY_WAN_IMAGE_TO_VIDEO_KEY, 'frame-to-video')).toEqual({
      entryKey: WAN_IMAGE_TO_VIDEO_KEY,
      workflow: 'image-to-video',
      migrated: true
    });
    expect(canonicalizeVideoSelection(LEGACY_WAN_IMAGE_TO_VIDEO_KEY)).toEqual({
      entryKey: WAN_IMAGE_TO_VIDEO_KEY,
      workflow: 'image-to-video',
      migrated: true
    });
    expect(canonicalizeVideoSelection(WAN_IMAGE_TO_VIDEO_KEY, 'image-to-video')).toEqual({
      entryKey: WAN_IMAGE_TO_VIDEO_KEY,
      workflow: 'image-to-video',
      migrated: false
    });
  });

  test('rejects contradictory pairs and preserves unrelated selections', () => {
    expect(canonicalizeVideoSelection(WAN_IMAGE_TO_VIDEO_KEY, 'frame-to-video')).toBeNull();
    expect(canonicalizeVideoSelection('kling-2.6:frame-to-video', 'image-to-video')).toBeNull();
    expect(canonicalizeVideoSelection('missing-workflow-suffix', 'image-to-video')).toBeNull();
    expect(canonicalizeVideoSelection('kling-2.6:frame-to-video')).toEqual({
      entryKey: 'kling-2.6:frame-to-video',
      migrated: false
    });
  });

  test('normalizes legacy preview ingress through the canonical WAN adapter', () => {
    expect(
      normalizeRegistryRequest(LEGACY_WAN_IMAGE_TO_VIDEO_KEY, {
        imageUrls: ['https://assets.example/start.png'],
        duration: 2,
        resolution: '720p'
      }).request
    ).toEqual({
      model: 'wan2.7-image-to-video',
      input: {
        image_urls: ['https://assets.example/start.png'],
        duration: 2,
        resolution: '720p',
        enable_safety_checker: false,
        multi_shots: false
      }
    });
    expect(() =>
      normalizeRegistryRequest(LEGACY_WAN_IMAGE_TO_VIDEO_KEY, {
        imageUrls: ['https://assets.example/start.png'],
        duration: 2,
        resolution: '720p',
        aspectRatio: '16:9'
      })
    ).toThrow('aspectRatio is not supported');
  });
});
