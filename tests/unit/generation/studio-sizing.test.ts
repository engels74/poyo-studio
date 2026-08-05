import { describe, expect, test } from 'bun:test';
import type { StudioRoleInput } from '../../../src/lib/features/generation/contracts';
import {
  automaticFieldChoice,
  automaticSizingIssues,
  initialAutomaticFields,
  preselectedResolutionToken,
  resolvedGuidedValues,
  restoreAutomaticFields
} from '../../../src/lib/features/generation/studio-sizing';
import { IMAGE_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/image-registry';
import { VIDEO_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/video-registry';

function entry(key: string) {
  const result = IMAGE_REGISTRY_ENTRIES.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Missing image entry ${key}`);
  return result;
}

function videoEntry(key: string) {
  const result = VIDEO_REGISTRY_ENTRIES.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Missing video entry ${key}`);
  return result;
}

function portraitReference(): Record<string, StudioRoleInput[]> {
  return {
    reference: [
      {
        id: 'portrait',
        role: 'reference',
        source: 'uploaded',
        url: 'https://assets.test/portrait.png',
        localSourceId: 'source-portrait',
        name: 'portrait.png',
        mediaKind: 'image',
        width: 900,
        height: 1601,
        metadataProbe: 'measured'
      }
    ]
  };
}

describe('studio automatic sizing', () => {
  test('SIZE-01 resolves an edit source before a square registry default', () => {
    const model = entry('seedream-5.0-pro-edit:image-edit');
    const fields = initialAutomaticFields(model);
    expect(fields.aspectRatio).toBe(true);
    const choice = automaticFieldChoice(model, 'aspectRatio', portraitReference());
    expect(choice).toMatchObject({ available: true, value: '9:16', kind: 'source' });
    expect(choice.label).toContain('9:16');
    expect(
      resolvedGuidedValues(
        model,
        { prompt: 'Keep the subject', aspectRatio: '1:1', resolution: '1K' },
        portraitReference(),
        fields
      )
    ).toMatchObject({ prompt: 'Keep the subject', aspectRatio: '9:16', resolution: '1K' });
  });

  test('SIZE-02 preserves genuine upstream auto ahead of local source resolution', () => {
    const model = entry('flux-2-pro-edit:image-edit');
    const choice = automaticFieldChoice(model, 'aspectRatio', portraitReference());
    expect(choice).toMatchObject({ available: true, value: 'auto', kind: 'upstream-auto' });
    expect(
      resolvedGuidedValues(model, { prompt: 'Keep the subject' }, portraitReference(), {
        aspectRatio: true,
        resolution: false
      }).aspectRatio
    ).toBe('auto');
  });

  test('SIZE-03 uses reviewed text defaults and truthfully omits unknown optional defaults', () => {
    const defaulted = entry('seedream-5.0-pro:text-to-image');
    expect(automaticFieldChoice(defaulted, 'aspectRatio', {})).toMatchObject({
      value: '1:1',
      kind: 'registry-default'
    });
    expect(automaticFieldChoice(defaulted, 'resolution', {})).toMatchObject({
      value: '1K',
      kind: 'registry-default'
    });

    const unknown = entry('wan-2.7-image:text-to-image');
    const choice = automaticFieldChoice(unknown, 'aspectRatio', {});
    expect(choice).toMatchObject({ available: true, kind: 'model-default' });
    expect(choice.value).toBeUndefined();
    expect(choice.label).toContain('model default');
    expect(
      resolvedGuidedValues(
        unknown,
        { prompt: 'A quiet coast', aspectRatio: '16:9' },
        {},
        { aspectRatio: true, resolution: false }
      )
    ).not.toHaveProperty('aspectRatio');
  });

  test('SIZE-03B does not invent a Flux.2 resolution when its conditional rule requires one', () => {
    const model = entry('flux-2-pro:text-to-image');
    expect(automaticFieldChoice(model, 'aspectRatio', {})).toMatchObject({
      available: true,
      value: 'auto',
      kind: 'upstream-auto'
    });
    expect(automaticFieldChoice(model, 'resolution', {})).toMatchObject({
      available: false,
      kind: 'unavailable'
    });
    expect(initialAutomaticFields(model)).toEqual({ aspectRatio: true, resolution: false });
  });

  test('SIZE-04 uses the first measurable image in registry-role and input order', () => {
    const model = entry('seedream-5.0-pro-edit:image-edit');
    const inputs = portraitReference();
    inputs.reference?.unshift({
      id: 'unknown',
      role: 'reference',
      source: 'remote',
      url: 'https://assets.test/unknown.png',
      name: 'unknown.png',
      mediaKind: 'image',
      metadataProbe: 'unavailable'
    });
    inputs.reference?.push({
      id: 'landscape',
      role: 'reference',
      source: 'uploaded',
      url: 'https://assets.test/landscape.png',
      name: 'landscape.png',
      mediaKind: 'image',
      width: 1600,
      height: 900
    });
    expect(automaticFieldChoice(model, 'aspectRatio', inputs).value).toBe('9:16');
  });

  test('SIZE-05 exposes an unresolved edit automatic state when metadata is unavailable', () => {
    const model = entry('seedream-5.0-pro-edit:image-edit');
    const choice = automaticFieldChoice(model, 'aspectRatio', {
      reference: [
        {
          id: 'unknown',
          role: 'reference',
          source: 'remote',
          url: 'https://assets.test/unknown.png',
          name: 'unknown.png',
          mediaKind: 'image',
          metadataProbe: 'unavailable'
        }
      ]
    });
    expect(choice).toMatchObject({ available: true, kind: 'source-unavailable' });
    expect(choice.value).toBeUndefined();
    expect(choice.label).toContain('choose a measured source');
    expect(
      automaticSizingIssues(
        model,
        {
          reference: [
            {
              id: 'unknown',
              role: 'reference',
              source: 'remote',
              url: 'https://assets.test/unknown.png',
              name: 'unknown.png',
              mediaKind: 'image'
            }
          ]
        },
        { aspectRatio: true, resolution: false }
      )
    ).toHaveLength(1);
  });

  test('SIZE-06 drops a restored automatic preference when registry drift removes its field', () => {
    const model = entry('seedream-5.0-pro:text-to-image');
    const withoutAspectRatio = {
      ...model,
      fields: model.fields.filter((field) => field.key !== 'aspectRatio')
    };
    expect(restoreAutomaticFields(withoutAspectRatio, ['aspectRatio', 'resolution'])).toEqual({
      aspectRatio: false,
      resolution: true
    });
  });

  test('SIZE-07 preselects the largest documented resolution tier instead of a lower default', () => {
    const seedream = entry('seedream-5.0-pro-edit:image-edit');
    expect(preselectedResolutionToken(seedream)).toBe('2K');
    expect(initialAutomaticFields(seedream).resolution).toBe(false);
    // The reviewed default stays truthful behind the automatic tile.
    expect(automaticFieldChoice(seedream, 'resolution', {})).toMatchObject({
      value: '1K',
      kind: 'registry-default'
    });

    // Flux.2 requires an explicit resolution, so the preselection also removes a blocked start.
    const flux = entry('flux-2-pro:text-to-image');
    expect(preselectedResolutionToken(flux)).toBe('2K');
    expect(initialAutomaticFields(flux)).toEqual({ aspectRatio: true, resolution: false });

    // Union-size families own a single size field, so a defaulted ratio keeps it.
    const unionSize = entry('seedream-4.5:text-to-image');
    expect(unionSize.validation.conditionalRules).toContain(
      'size-is-one-of-resolution-ratio-or-custom'
    );
    expect(preselectedResolutionToken(unionSize)).toBe('4K');
    expect(
      preselectedResolutionToken({
        ...unionSize,
        fields: unionSize.fields.map((field) =>
          field.key === 'aspectRatio' ? { ...field, default: '1:1' } : field
        )
      })
    ).toBeUndefined();

    // Models without a resolution choice keep their existing automatic behaviour.
    expect(preselectedResolutionToken(entry('flux-dev:text-to-image'))).toBeUndefined();
    expect(preselectedResolutionToken(videoEntry('hailuo-02-pro:text-to-video'))).toBeUndefined();
  });

  test('SIZE-08 keeps reviewed defaults when a documented rule couples resolution to duration', () => {
    const veo = videoEntry('veo3.1-lite-official:text-to-video');
    expect(veo.validation.conditionalRules).toContain('generation-type-model-duration-matrix');
    expect(preselectedResolutionToken(veo)).toBeUndefined();
    expect(initialAutomaticFields(veo).resolution).toBe(true);
  });
});
