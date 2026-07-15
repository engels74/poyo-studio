import type { StudioLoadData } from '../../features/generation/contracts';
import type { PresetRecord, PresetValues } from '../../features/presets/types';
import {
  IMAGE_REGISTRY_ENTRIES,
  IMAGE_REGISTRY_VERSION
} from '../../features/registry/image-registry';
import {
  VIDEO_REGISTRY_ENTRIES,
  VIDEO_REGISTRY_VERSION
} from '../../features/registry/video-registry';
import { latestBalance } from '../account/balance';
import { studioReuseEntry } from '../library/repository';
import { getPlatformServices } from '../platform/runtime';
import { PresetRepository } from '../presets/repository';
import { ModelPreferenceRepository } from '../registry/preferences-repository';

export async function loadStudioData(
  modality: 'image' | 'video',
  options: {
    presetId?: string | null;
    fromJobId?: string | null;
    sourceOutputId?: string | null;
  } = {}
): Promise<StudioLoadData> {
  const platform = await getPlatformServices();
  const entries =
    modality === 'image'
      ? [...IMAGE_REGISTRY_ENTRIES]
      : VIDEO_REGISTRY_ENTRIES.filter((entry) => entry.status === 'current');
  let preset = options.presetId
    ? new PresetRepository(platform.database).get(options.presetId)
    : null;
  if (!preset && options.fromJobId) {
    const job = platform.database
      .query<
        {
          id: string;
          entry_key: string | null;
          workflow: string;
          guided_request_json: string;
          expert_diff_json: string | null;
          created_at: string;
        },
        [string]
      >(
        'SELECT id,entry_key,workflow,guided_request_json,expert_diff_json,created_at FROM jobs WHERE id=?'
      )
      .get(options.fromJobId);
    const entry = job?.entry_key
      ? entries.find((candidate) => candidate.key === job.entry_key)
      : null;
    if (job && entry) {
      const inputRoles = platform.database
        .query<{ role: string; source_url: string | null; upload_url: string | null }, [string]>(
          'SELECT role,source_url,upload_url FROM job_inputs WHERE job_id=? ORDER BY role,input_order'
        )
        .all(job.id)
        .reduce<PresetValues['inputRoles']>((result, input) => {
          const url = input.source_url ?? input.upload_url;
          if (!url) return result;
          const existing = result.find((item) => item.role === input.role);
          if (existing) existing.urls.push(url);
          else
            result.push({
              role: input.role,
              source: input.source_url ? 'remote' : 'uploaded',
              urls: [url]
            });
          return result;
        }, []);
      const expertOverrides = (
        job.expert_diff_json
          ? (JSON.parse(job.expert_diff_json) as Array<{ key: string; value: unknown }>)
          : []
      ).map(({ key, value }) => ({ key, value }));
      preset = transientPreset(entry.key, job.workflow, `Copy of ${entry.displayName}`, {
        version: 1,
        modality,
        guided: JSON.parse(job.guided_request_json),
        expertOverrides,
        inputRoles
      });
    }
  }
  if (!preset && options.sourceOutputId) {
    const output = platform.database
      .query<{ remote_url: string | null; media_kind: 'image' | 'video' }, [string]>(
        'SELECT remote_url,media_kind FROM job_outputs WHERE id=?'
      )
      .get(options.sourceOutputId);
    const entry = output ? studioReuseEntry(modality, output.media_kind) : undefined;
    const role = entry?.inputRoles.find((candidate) => candidate.mediaKind === output?.media_kind);
    if (entry && role && output?.remote_url)
      preset = transientPreset(entry.key, entry.workflow, `Remix in ${entry.displayName}`, {
        version: 1,
        modality,
        guided: {},
        expertOverrides: [],
        inputRoles: [{ role: role.role, source: 'remote', urls: [output.remote_url] }]
      });
  }
  return {
    modality,
    entries,
    preferences: new ModelPreferenceRepository(platform.database).list(),
    balance: latestBalance(platform.database),
    apiKey: await platform.apiKey.status(),
    preset: preset?.values.modality === modality ? preset : null
  };
}

function transientPreset(
  entryKey: string,
  workflow: string,
  name: string,
  values: PresetValues
): PresetRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `transient-${crypto.randomUUID()}`,
    registryVersion: values.modality === 'image' ? IMAGE_REGISTRY_VERSION : VIDEO_REGISTRY_VERSION,
    entryKey,
    workflow,
    name,
    description: 'Temporary studio draft created from local history.',
    valuesVersion: 1,
    values,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
