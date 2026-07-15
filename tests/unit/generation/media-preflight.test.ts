import { describe, expect, test } from 'bun:test';
import {
  LOCAL_IMAGE_MAX_BYTES,
  LOCAL_VIDEO_MAX_BYTES,
  mediaMetadataLabel,
  validateLocalFileSelection
} from '../../../src/lib/features/generation/media-preflight';
import type { InputRole } from '../../../src/lib/features/registry/types';

function role(overrides: Partial<InputRole> = {}): InputRole {
  return {
    role: 'reference-image',
    required: true,
    min: 1,
    max: 2,
    mediaKind: 'image',
    formats: ['jpeg', 'png'],
    ...overrides
  };
}

describe('browser media preflight', () => {
  test('accepts represented format, count and size constraints', () => {
    expect(
      validateLocalFileSelection(role(), 0, [
        { name: 'reference.png', type: 'image/png', size: 1024 }
      ])
    ).toEqual([]);
  });

  test('reports count, MIME, empty and image-size failures before upload', () => {
    const issues = validateLocalFileSelection(role({ max: 1 }), 1, [
      { name: 'wrong.txt', type: 'text/plain', size: 0 },
      { name: 'large.png', type: 'image/png', size: LOCAL_IMAGE_MAX_BYTES + 1 }
    ]);
    expect(issues).toContain(
      'reference-image supports at most 1 input; remove an existing input or select fewer files.'
    );
    expect(issues).toContain('wrong.txt is empty.');
    expect(issues).toContain('wrong.txt has type text/plain; choose jpeg, png.');
    expect(issues).toContain('large.png exceeds the 25 MB image upload limit.');
  });

  test('enforces the documented streaming-video ceiling', () => {
    expect(
      validateLocalFileSelection(
        role({
          role: 'source-video',
          mediaKind: 'video',
          formats: ['mp4'],
          max: 1
        }),
        0,
        [{ name: 'source.mp4', type: 'video/mp4', size: LOCAL_VIDEO_MAX_BYTES + 1 }]
      )
    ).toContain('source.mp4 exceeds the 100 MB video upload limit.');
  });

  test('formats measured image and video metadata without inventing precision', () => {
    expect(mediaMetadataLabel({ width: 1024, height: 768 })).toBe('1024 × 768 px');
    expect(mediaMetadataLabel({ width: 1920, height: 1080, durationSeconds: 5.126 })).toBe(
      '1920 × 1080 px · 5.13 s'
    );
  });
});
