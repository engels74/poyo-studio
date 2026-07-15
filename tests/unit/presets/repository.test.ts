import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrateDatabase } from '../../../src/lib/server/platform/database';
import { PresetRepository } from '../../../src/lib/server/presets/repository';

function repository(): { database: Database; repository: PresetRepository } {
  const database = new Database(':memory:', { strict: true });
  migrateDatabase(database);
  return {
    database,
    repository: new PresetRepository(database, () => new Date('2026-07-15T12:00:00.000Z'))
  };
}

describe('durable studio presets', () => {
  test('PRESET-01 saves, updates, lists, loads and deletes a versioned preset', () => {
    const fixture = repository();
    try {
      const saved = fixture.repository.save({
        entryKey: 'seedream-5.0-pro:text-to-image',
        name: 'Editorial square',
        description: 'A reusable restrained portrait setup.',
        values: {
          version: 1,
          modality: 'image',
          guided: {
            prompt: 'quiet editorial portrait',
            aspectRatio: '1:1',
            enableSafetyChecker: false
          },
          expertOverrides: [],
          inputRoles: []
        }
      });
      expect(saved.registryVersion).toBeTruthy();
      expect(fixture.repository.list()).toEqual([saved]);
      const updated = fixture.repository.save({
        id: saved.id,
        entryKey: saved.entryKey,
        name: 'Editorial portrait',
        ...(saved.description ? { description: saved.description } : {}),
        values: saved.values
      });
      expect(updated.id).toBe(saved.id);
      expect(updated.name).toBe('Editorial portrait');
      expect(fixture.repository.delete(saved.id)).toBe(true);
      expect(fixture.repository.get(saved.id)).toBeNull();
    } finally {
      fixture.database.close();
    }
  });

  test('PRESET-02 rejects credentials, media bodies and unavailable model workflows', () => {
    const fixture = repository();
    try {
      const values = {
        version: 1 as const,
        modality: 'image' as const,
        guided: {},
        expertOverrides: [],
        inputRoles: []
      };
      expect(() =>
        fixture.repository.save({
          entryKey: 'seedream-5.0-pro:text-to-image',
          name: 'Secret',
          values: { ...values, guided: { apiKey: 'never-store-this' } }
        })
      ).toThrow('credential');
      expect(() =>
        fixture.repository.save({
          entryKey: 'seedream-5.0-pro:text-to-image',
          name: 'Body',
          values: { ...values, guided: { body: new Blob(['media']) } }
        })
      ).toThrow('media bodies');
      expect(() =>
        fixture.repository.save({ entryKey: 'unknown:model', name: 'Unknown', values })
      ).toThrow('unknown');
    } finally {
      fixture.database.close();
    }
  });
});
