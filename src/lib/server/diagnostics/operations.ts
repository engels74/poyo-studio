import { REMOTE_CLEANUP_CAPABILITY } from '../../features/cleanup/contracts';
import type { OperationsDiagnosticsDto } from '../../features/diagnostics/contracts';
import type { CleanupRuntime } from '../cleanup/runtime';
import { LibraryRepository } from '../library/repository';
import type { PlatformServices } from '../platform/runtime';
import { OperationsSettingsService } from '../settings/operations-settings';
import { buildHealthDto } from './health';
import { redactString } from './redaction';

export async function buildOperationsDiagnostics(
  platform: PlatformServices,
  cleanup: CleanupRuntime
): Promise<OperationsDiagnosticsDto> {
  const apiKey = await platform.apiKey.status();
  const [health, logging, storage] = await Promise.all([
    buildHealthDto({ database: platform.database, apiKey, logger: platform.logger }),
    platform.logger.diagnostics(),
    new LibraryRepository(platform.database).storageStatistics(platform.paths)
  ]);
  const settings = new OperationsSettingsService(
    platform.settings,
    platform.database,
    platform.logger
  ).get();
  const registry = platform.database
    .query<{ version: string; verified_at: string; status: string }, []>(
      'SELECT version,verified_at,status FROM registry_versions ORDER BY verified_at DESC,version DESC'
    )
    .all();
  const connectivity = platform.apiKey.connectivityStatus();
  const cleanupDiagnostics = cleanup.diagnostics();
  return {
    health,
    connectivity: {
      checkedAt: connectivity.checkedAt,
      status: connectivity.status ? redactString(connectivity.status) : null
    },
    storage,
    cleanup: {
      ...cleanupDiagnostics,
      lastError: cleanupDiagnostics.lastError ? redactString(cleanupDiagnostics.lastError) : null
    },
    remoteCleanup: REMOTE_CLEANUP_CAPABILITY,
    registry: registry.map((entry) => ({
      version: redactString(entry.version),
      verified_at: redactString(entry.verified_at),
      status: redactString(entry.status)
    })),
    settings: {
      polling: settings.polling,
      downloads: settings.downloads,
      theme: settings.theme,
      logs: settings.logs,
      storageSource: platform.paths.source
    },
    logging
  } satisfies OperationsDiagnosticsDto;
}
