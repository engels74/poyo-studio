import { env } from '$env/dynamic/private';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { loadOnboardingState } from '$lib/server/settings/onboarding-gate';
import { OperationsSettingsService } from '$lib/server/settings/operations-settings';
import { outputLocationDto, readStoragePreferences } from '$lib/server/settings/studio-settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const platform = await getPlatformServices();
  const service = new OperationsSettingsService(
    platform.settings,
    platform.database,
    platform.logger
  );
  const storage = readStoragePreferences(platform.settings);
  return {
    settings: service.dto(platform.paths, await platform.apiKey.status()),
    outputLocation: outputLocationDto(platform.paths, storage, Boolean(env.PLS_MEDIA_DIR?.trim())),
    onboarding: await loadOnboardingState(platform)
  };
};
