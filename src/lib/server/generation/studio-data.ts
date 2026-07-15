import type { StudioLoadData } from '../../features/generation/contracts';
import { IMAGE_REGISTRY_ENTRIES } from '../../features/registry/image-registry';
import { VIDEO_REGISTRY_ENTRIES } from '../../features/registry/video-registry';
import { latestBalance } from '../account/balance';
import { getPlatformServices } from '../platform/runtime';
import { PresetRepository } from '../presets/repository';
import { ModelPreferenceRepository } from '../registry/preferences-repository';

export async function loadStudioData(
  modality: 'image' | 'video',
  presetId?: string | null
): Promise<StudioLoadData> {
  const platform = await getPlatformServices();
  const preset = presetId ? new PresetRepository(platform.database).get(presetId) : null;
  const entries =
    modality === 'image'
      ? [...IMAGE_REGISTRY_ENTRIES]
      : VIDEO_REGISTRY_ENTRIES.filter((entry) => entry.status === 'current');
  return {
    modality,
    entries,
    preferences: new ModelPreferenceRepository(platform.database).list(),
    balance: latestBalance(platform.database),
    apiKey: await platform.apiKey.status(),
    preset: preset?.values.modality === modality ? preset : null
  };
}
