import { resolveClosestRatioForDimensions, supportedRatioTokens } from '../registry/ratio-resolver';
import type { FieldDefinition } from '../registry/types';
import type { StudioEntry, StudioRoleInput } from './contracts';

export type AutomaticFieldKey = 'aspectRatio' | 'resolution';
export type AutomaticFieldState = Record<AutomaticFieldKey, boolean>;

export interface AutomaticFieldChoice {
  available: boolean;
  label: string;
  value?: unknown;
  kind:
    | 'unavailable'
    | 'upstream-auto'
    | 'source'
    | 'source-unavailable'
    | 'registry-default'
    | 'model-default';
  description?: string;
}

function fieldFor(entry: StudioEntry, key: AutomaticFieldKey): FieldDefinition | undefined {
  return entry.fields.find((field) => field.key === key);
}

function firstMeasuredImage(
  entry: StudioEntry,
  roleInputs: Record<string, StudioRoleInput[]>
): StudioRoleInput | undefined {
  for (const role of entry.inputRoles) {
    if (role.mediaKind !== 'image') continue;
    const measured = (roleInputs[role.role] ?? []).find(
      (input) =>
        input.mediaKind === 'image' &&
        input.width !== undefined &&
        input.height !== undefined &&
        Number.isFinite(input.width) &&
        Number.isFinite(input.height) &&
        input.width > 0 &&
        input.height > 0
    );
    if (measured) return measured;
  }
  return undefined;
}

function isImageEdit(entry: StudioEntry): boolean {
  return entry.output.mediaKind === 'image' && entry.workflow !== 'text-to-image';
}

export function automaticFieldChoice(
  entry: StudioEntry,
  key: AutomaticFieldKey,
  roleInputs: Record<string, StudioRoleInput[]>
): AutomaticFieldChoice {
  const field = fieldFor(entry, key);
  if (!field) return { available: false, label: 'Automatic unavailable', kind: 'unavailable' };

  if (field.enum?.includes('auto')) {
    return {
      available: true,
      label: 'Automatic (model decides)',
      value: 'auto',
      kind: 'upstream-auto',
      description: 'The model accepts a genuine automatic value.'
    };
  }

  if (key === 'aspectRatio' && isImageEdit(entry)) {
    const source = firstMeasuredImage(entry, roleInputs);
    if (source) {
      const supported = supportedRatioTokens(field.enum ?? []);
      const resolved = resolveClosestRatioForDimensions(supported, {
        width: source.width ?? 0,
        height: source.height ?? 0
      });
      if (resolved.token) {
        return {
          available: true,
          label: `Automatic (${resolved.token} from ${source.width} × ${source.height})`,
          value: resolved.token,
          kind: 'source',
          description: 'Uses the first measurable image in the model’s documented input-role order.'
        };
      }
    }
    return {
      available: field.default !== undefined || !field.required,
      label: 'Automatic (choose a measured source or ratio)',
      kind: 'source-unavailable',
      description:
        'This model has no genuine auto value, so a source image must be measured before its closest supported ratio can be selected.'
    };
  }

  if (field.default !== undefined) {
    return {
      available: true,
      label: `Automatic (${String(field.default)})`,
      value: field.default,
      kind: 'registry-default',
      description: 'Uses the model default verified in the registry evidence.'
    };
  }

  if (entry.validation.conditionalRules.includes('size-and-resolution-required')) {
    return {
      available: false,
      label: 'Automatic unavailable',
      kind: 'unavailable',
      description: 'This model requires an explicit value alongside its other size field.'
    };
  }

  if (!field.required) {
    return {
      available: true,
      label: 'Automatic (model default)',
      kind: 'model-default',
      description: 'Omits this field and lets the model apply its documented behavior.'
    };
  }

  return {
    available: false,
    label: 'Automatic unavailable',
    kind: 'unavailable',
    description: 'This model requires an explicit value.'
  };
}

export function initialAutomaticFields(
  entry: StudioEntry,
  explicitValues = false
): AutomaticFieldState {
  return {
    aspectRatio: !explicitValues && automaticFieldChoice(entry, 'aspectRatio', {}).available,
    resolution: !explicitValues && automaticFieldChoice(entry, 'resolution', {}).available
  };
}

export function restoreAutomaticFields(
  entry: StudioEntry,
  requested: readonly AutomaticFieldKey[]
): AutomaticFieldState {
  return {
    aspectRatio:
      requested.includes('aspectRatio') &&
      entry.fields.some((field) => field.key === 'aspectRatio'),
    resolution:
      requested.includes('resolution') && entry.fields.some((field) => field.key === 'resolution')
  };
}

export function resolvedGuidedValues(
  entry: StudioEntry,
  guided: Record<string, unknown>,
  roleInputs: Record<string, StudioRoleInput[]>,
  automaticFields: AutomaticFieldState
): Record<string, unknown> {
  const resolved = JSON.parse(JSON.stringify(guided)) as Record<string, unknown>;
  for (const key of ['aspectRatio', 'resolution'] as const) {
    if (!automaticFields[key]) continue;
    delete resolved[key];
    const choice = automaticFieldChoice(entry, key, roleInputs);
    if (choice.value !== undefined)
      resolved[key] = JSON.parse(JSON.stringify(choice.value)) as unknown;
  }
  return resolved;
}

export function automaticSizingIssues(
  entry: StudioEntry,
  roleInputs: Record<string, StudioRoleInput[]>,
  automaticFields: AutomaticFieldState
): string[] {
  const issues: string[] = [];
  for (const key of ['aspectRatio', 'resolution'] as const) {
    if (!automaticFields[key]) continue;
    const choice = automaticFieldChoice(entry, key, roleInputs);
    if (choice.kind === 'source-unavailable') {
      issues.push(
        'Automatic aspect ratio needs a source image whose dimensions this browser can measure. Add a measurable local image or choose an explicit ratio.'
      );
    } else if (!choice.available) {
      issues.push(
        `${key === 'aspectRatio' ? 'Aspect ratio' : 'Resolution'} requires an explicit value.`
      );
    }
  }
  return issues;
}
