import { env } from '$env/dynamic/private';
import { StructuredLogger } from '../diagnostics/jsonl-logger';
import { ManagedSourceRepository } from '../media/managed-sources';
import { seedImageRegistry, seedVideoRegistry } from '../registry/repository';
import { ApiKeyManager } from '../settings/api-key-manager';
import { SecretMetadataRepository } from '../settings/secret-metadata-repository';
import { createPreferredSecretStore } from '../settings/secret-store';
import { SettingsRepository } from '../settings/settings-repository';
import { readStoragePreferences, resolveEffectiveMedia } from '../settings/studio-settings';
import { ensureAppPaths, ensurePrivateDirectory, resolveAppPaths } from './app-paths';
import { openDatabase } from './database';
import { DATABASE_SCHEMA_VERSION } from './version';

export interface PlatformServices {
  environment: Record<string, string | undefined>;
  paths: ReturnType<typeof resolveAppPaths>;
  database: Awaited<ReturnType<typeof openDatabase>>;
  settings: SettingsRepository;
  apiKey: ApiKeyManager;
  logger: StructuredLogger;
}

let servicesPromise: Promise<PlatformServices> | undefined;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function createPlatformServices(): Promise<PlatformServices> {
  const basePaths = resolveAppPaths({ environment: env });
  await ensureAppPaths(basePaths);
  const database = await openDatabase(basePaths.database);
  await new ManagedSourceRepository(database, basePaths).adoptLegacyReferences();
  seedImageRegistry(database);
  seedVideoRegistry(database);
  const logger = new StructuredLogger({
    directory: basePaths.logs,
    separateErrorFile: env.PLS_LOG_SEPARATE_ERRORS !== 'false',
    maxBytes: positiveInteger(env.PLS_LOG_MAX_BYTES, 5 * 1024 * 1024),
    maxAgeMs: positiveInteger(env.PLS_LOG_MAX_AGE_MS, 24 * 60 * 60 * 1000),
    retentionAgeMs: positiveInteger(env.PLS_LOG_RETENTION_AGE_MS, 14 * 24 * 60 * 60 * 1000),
    maxRotatedFiles: positiveInteger(env.PLS_LOG_MAX_FILES, 10)
  });
  const settings = new SettingsRepository(database);
  const storedLoggerSettings = settings.get<{
    logs?: Parameters<typeof logger.updateRotationSettings>[0];
  }>('operations')?.value.logs;
  if (storedLoggerSettings) {
    try {
      logger.updateRotationSettings(storedLoggerSettings);
    } catch {
      // Invalid persisted settings fail closed to validated environment defaults.
    }
  }

  // Phase 2: apply a locally chosen output directory now that the database is open. This only
  // runs at startup (services are memoized), so the running job worker never has its paths
  // swapped underneath it — a change takes effect on the next restart. PLS_MEDIA_DIR wins.
  const effective = resolveEffectiveMedia(
    basePaths,
    readStoragePreferences(settings),
    Boolean(env.PLS_MEDIA_DIR?.trim())
  );
  const paths = {
    ...basePaths,
    media: effective.media,
    mediaReadRoots: effective.mediaReadRoots
  };
  if (paths.media !== basePaths.media) {
    try {
      await ensurePrivateDirectory(paths.media);
    } catch {
      // The chosen directory is currently unavailable (e.g. an unmounted volume). Fall back to
      // the platform default for this session rather than failing to boot; the preference is
      // preserved and will apply again once the location is reachable.
      await logger.warn('platform.output_location_unavailable', {
        data: { requested: effective.media, fallback: basePaths.media }
      });
      paths.media = basePaths.media;
      paths.mediaReadRoots = [
        basePaths.media,
        ...effective.mediaReadRoots.filter((root) => root !== basePaths.media)
      ];
    }
  }

  const secretStore = await createPreferredSecretStore({ paths });
  const apiKey = new ApiKeyManager({
    environment: env,
    secretStore,
    metadataRepository: new SecretMetadataRepository(database)
  });
  await logger.info('platform.started', {
    data: {
      schemaVersion: DATABASE_SCHEMA_VERSION,
      appDataSource: paths.source,
      secretStore: secretStore.kind
    }
  });

  return {
    environment: env,
    paths,
    database,
    settings,
    apiKey,
    logger
  };
}

export async function getPlatformServices(): Promise<PlatformServices> {
  servicesPromise ??= createPlatformServices().catch((error) => {
    servicesPromise = undefined;
    throw error;
  });
  return servicesPromise;
}
