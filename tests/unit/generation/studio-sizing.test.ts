import { describe, expect, test } from 'bun:test';
import type { StudioRoleInput } from '../../../src/lib/features/generation/contracts';
import {
  automaticFieldChoice,
  automaticSizingIssues,
  initialAutomaticFields,
  resolvedGuidedValues,
  restoreAutomaticFields
} from '../../../src/lib/features/generation/studio-sizing';
import { IMAGE_REGISTRY_ENTRIES } from '../../../src/lib/features/registry/image-registry';

function entry(key: string) {
  const result = IMAGE_REGISTRY_ENTRIES.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Missing image entry ${key}`);
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
        { prompt: 'Keep the subject', aspectRatio: '1:1', resolution: '2K' },
        portraitReference(),
        fields
      )
    ).toMatchObject({ prompt: 'Keep the subject', aspectRatio: '9:16', resolution: '2K' });
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
      value: '2K',
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
});
