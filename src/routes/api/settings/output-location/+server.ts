import { env } from '$env/dynamic/private';
import { operationsHttpError } from '$lib/server/operations/http';
import { validateOutputDirectory } from '$lib/server/platform/directory-validation';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { readSameOriginJson } from '$lib/server/platform/request-security';
import {
  outputLocationDto,
  readStoragePreferences,
  saveOutputDirectory
} from '$lib/server/settings/studio-settings';
import type { RequestHandler } from './$types';

function mediaFromEnvironment(): boolean {
  return Boolean(env.PLS_MEDIA_DIR?.trim());
}

async function currentLocation() {
  const platform = await getPlatformServices();
  const storage = readStoragePreferences(platform.settings);
  return {
    platform,
    dto: outputLocationDto(platform.paths, storage, mediaFromEnvironment())
  };
}

export const GET: RequestHandler = async ({ setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const { dto } = await currentLocation();
  return Response.json({ outputLocation: dto });
};

export const POST: RequestHandler = async ({ request }) => {
  // Validate a candidate without persisting it (used for live onboarding feedback).
  try {
    const body = await readSameOriginJson<{ directory?: unknown }>(request, { maxBytes: 8 * 1024 });
    const directory = typeof body.directory === 'string' ? body.directory : '';
    const result = await validateOutputDirectory(directory);
    return Response.json({ result }, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return operationsHttpError(error);
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const body = await readSameOriginJson<{ directory?: unknown }>(request, { maxBytes: 8 * 1024 });
    if (mediaFromEnvironment()) {
      return Response.json(
        {
          error: {
            code: 'environment_managed',
            message: 'PLS_MEDIA_DIR controls the output location.'
          }
        },
        { status: 409 }
      );
    }
    const platform = await getPlatformServices();
    const directory = typeof body.directory === 'string' ? body.directory : '';
    const result = await validateOutputDirectory(directory);
    if (!result.ok) return Response.json({ result }, { status: 422 });
    saveOutputDirectory(platform.settings, result.path, platform.paths.media);
    const storage = readStoragePreferences(platform.settings);
    return Response.json({
      result,
      outputLocation: outputLocationDto(platform.paths, storage, false)
    });
  } catch (error) {
    return operationsHttpError(error);
  }
};

export const DELETE: RequestHandler = async ({ request }) => {
  try {
    await readSameOriginJson<Record<string, never>>(request, { maxBytes: 1024 });
    if (mediaFromEnvironment()) {
      return Response.json(
        {
          error: {
            code: 'environment_managed',
            message: 'PLS_MEDIA_DIR controls the output location.'
          }
        },
        { status: 409 }
      );
    }
    const platform = await getPlatformServices();
    saveOutputDirectory(platform.settings, null, platform.paths.media);
    const storage = readStoragePreferences(platform.settings);
    return Response.json({ outputLocation: outputLocationDto(platform.paths, storage, false) });
  } catch (error) {
    return operationsHttpError(error);
  }
};
