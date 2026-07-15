import type { SettingsDto } from '../../features/settings/contracts';
import type { AppPaths } from '../platform/app-paths';
import type { ApiKeyStatusDto } from './api-key-manager';

export function buildSettingsDto(paths: AppPaths, apiKey: ApiKeyStatusDto): SettingsDto {
  return {
    apiKey,
    storage: {
      source: paths.source,
      root: paths.root,
      database: paths.database,
      media: paths.media,
      uploads: paths.uploads,
      thumbnails: paths.thumbnails,
      logs: paths.logs
    }
  };
}
