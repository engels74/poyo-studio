import { describe, expect, test } from 'bun:test';
import { parseAspectRatioPresentation } from '../../../src/lib/features/generation/aspect-ratio-presentation';
import { IMAGE_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/image-registry';
import { VIDEO_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/video-registry';

function aspectRatioTokens(): string[] {
  return [
    ...new Set(
      [...IMAGE_REGISTRY_ENTRIES, ...VIDEO_REGISTRY_ENTRIES].flatMap((entry) =>
        entry.fields
          .filter((field) => field.key === 'aspectRatio')
          .flatMap((field) => field.enum ?? [])
      )
    )
  ];
}

describe('aspect-ratio presentation', () => {
  test('parses complete positive decimal tokens and an optional spaced suffix', () => {
    expect(parseAspectRatioPresentation('16:9')).toMatchObject({
      width: 16,
      height: 9,
      value: 16 / 9
    });
    expect(parseAspectRatioPresentation('1.5 x .75 landscape')).toMatchObject({
      width: 1.5,
      height: 0.75,
      value: 2
    });
    expect(parseAspectRatioPresentation('2×3')).toMatchObject({ value: 2 / 3 });
    expect(parseAspectRatioPresentation('4*5')).toMatchObject({ value: 0.8 });
  });

  test('rejects automatic, nonpositive, nonfinite, multiple, and partial tokens', () => {
    for (const token of [
      'auto',
      '0:1',
      '1:0',
      '1:-1',
      'Infinity:1',
      '1:1:1',
      '1:1 2:3',
      'ratio 16:9',
      '16:9landscape',
      '16:9x',
      '16:9 extra:2'
    ])
      expect(parseAspectRatioPresentation(token)).toBeNull();
  });

  test('covers every explicit image and video registry token without changing it', () => {
    const tokens = aspectRatioTokens();
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      const presentation = parseAspectRatioPresentation(token);
      if (token === 'auto') expect(presentation).toBeNull();
      else expect(presentation).not.toBeNull();
    }
  });
});
