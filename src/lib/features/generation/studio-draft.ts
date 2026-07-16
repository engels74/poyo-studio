import type { PresetValues } from '../presets/types';
import type { SizeMode } from './studio-controller';

/**
 * A per-studio draft persisted to browser storage so navigating away and back — or reloading —
 * does not discard the user's setup. It reuses the preset serialization (guided values, expert
 * overrides, and input roles as remote/uploaded URLs only), so it never contains secrets, local
 * filesystem paths, or non-serializable browser `File` objects.
 */
export interface StudioDraft {
  version: 1;
  entryKey: string;
  sizeMode: SizeMode;
  values: PresetValues;
}

const MAX_BYTES = 200_000;

const SIZE_MODES: readonly SizeMode[] = ['resolution', 'aspect-ratio', 'custom'];

function storageKey(modality: 'image' | 'video'): string {
  return `poyo-studio-draft:${modality}`;
}

export function readStudioDraft(modality: 'image' | 'video'): StudioDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(modality));
    if (!raw || raw.length > MAX_BYTES) return null;
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    if (
      parsed?.version !== 1 ||
      typeof parsed.entryKey !== 'string' ||
      !parsed.entryKey ||
      !SIZE_MODES.includes(parsed.sizeMode as SizeMode) ||
      !parsed.values ||
      typeof parsed.values !== 'object'
    ) {
      return null;
    }
    return parsed as StudioDraft;
  } catch {
    return null;
  }
}

export function writeStudioDraft(modality: 'image' | 'video', draft: StudioDraft): void {
  try {
    const serialized = JSON.stringify(draft);
    if (serialized.length > MAX_BYTES) return;
    localStorage.setItem(storageKey(modality), serialized);
  } catch {
    // Storage may be unavailable or full; a lost draft is a graceful, non-fatal outcome.
  }
}

export function clearStudioDraft(modality: 'image' | 'video'): void {
  try {
    localStorage.removeItem(storageKey(modality));
  } catch {
    // Ignore storage errors.
  }
}
