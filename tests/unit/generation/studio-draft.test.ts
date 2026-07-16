import { beforeEach, describe, expect, test } from 'bun:test';
import type { PresetValues } from '../../../src/lib/features/presets/types';
import {
  clearStudioDraft,
  readStudioDraft,
  writeStudioDraft,
  type StudioDraft
} from '../../../src/lib/features/generation/studio-draft';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  get length(): number {
    return this.store.size;
  }
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

const values: PresetValues = {
  version: 1,
  modality: 'image',
  guided: { prompt: 'a cat', aspectRatio: '16:9' },
  expertOverrides: [],
  inputRoles: [{ role: 'reference', source: 'remote', urls: ['https://example.com/a.png'] }]
};

const draft: StudioDraft = {
  version: 1,
  entryKey: 'seedream-5-0-pro',
  sizeMode: 'aspect-ratio',
  values
};

describe('studio draft persistence', () => {
  test('round-trips a written draft', () => {
    writeStudioDraft('image', draft);
    expect(readStudioDraft('image')).toEqual(draft);
  });

  test('returns null when nothing is stored', () => {
    expect(readStudioDraft('image')).toBeNull();
  });

  test('isolates image and video drafts', () => {
    writeStudioDraft('image', draft);
    expect(readStudioDraft('video')).toBeNull();
    writeStudioDraft('video', { ...draft, entryKey: 'kling-video' });
    expect(readStudioDraft('image')?.entryKey).toBe('seedream-5-0-pro');
    expect(readStudioDraft('video')?.entryKey).toBe('kling-video');
  });

  test('rejects a wrong version', () => {
    localStorage.setItem('poyo-studio-draft:image', JSON.stringify({ ...draft, version: 2 }));
    expect(readStudioDraft('image')).toBeNull();
  });

  test('rejects a missing entry key', () => {
    localStorage.setItem('poyo-studio-draft:image', JSON.stringify({ version: 1, values }));
    expect(readStudioDraft('image')).toBeNull();
  });

  test('rejects a missing sizeMode', () => {
    localStorage.setItem(
      'poyo-studio-draft:image',
      JSON.stringify({ version: 1, entryKey: 'seedream-5-0-pro', values })
    );
    expect(readStudioDraft('image')).toBeNull();
  });

  test('rejects an invalid sizeMode', () => {
    localStorage.setItem(
      'poyo-studio-draft:image',
      JSON.stringify({ ...draft, sizeMode: 'bogus' })
    );
    expect(readStudioDraft('image')).toBeNull();
  });

  test('rejects malformed JSON', () => {
    localStorage.setItem('poyo-studio-draft:image', '{not json');
    expect(readStudioDraft('image')).toBeNull();
  });

  test('ignores an oversized stored value', () => {
    localStorage.setItem('poyo-studio-draft:image', 'x'.repeat(200_001));
    expect(readStudioDraft('image')).toBeNull();
  });

  test('clears a stored draft', () => {
    writeStudioDraft('image', draft);
    clearStudioDraft('image');
    expect(readStudioDraft('image')).toBeNull();
  });
});
