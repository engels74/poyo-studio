import { jobHttpError } from '$lib/server/jobs/http';
import { readVerifiedManagedSourceBlob } from '$lib/server/jobs/managed-source-upload';
import { ManagedSourceRepository } from '$lib/server/media/managed-sources';
import { intakeLocalSource, neutralSourceUploadName } from '$lib/server/media/source-intake';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { createPoyoClient } from '$lib/server/poyo/factory';
import { readMediaPrivacySettings } from '$lib/server/settings/media-privacy-settings';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  let sourceId: string | undefined;
  let managedSources: ManagedSourceRepository | undefined;
  try {
    const platform = await getPlatformServices();
    const source = await intakeLocalSource(request, platform.paths, {
      mediaPrivacy: readMediaPrivacySettings(platform.settings)
    });
    sourceId = source.id;
    managedSources = new ManagedSourceRepository(platform.database, platform.paths);
    const registered = await managedSources.register(source);
    const localFile = await readVerifiedManagedSourceBlob(registered);
    const client = await createPoyoClient({
      apiKeyManager: platform.apiKey,
      logger: platform.logger,
      environment: platform.environment
    });
    const uploaded = await client.upload({
      kind: 'local-file',
      file: localFile,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      mediaKind: source.mediaKind,
      fileName: neutralSourceUploadName(source.id, source.mimeType)
    });
    return Response.json(
      {
        source: {
          id: source.id,
          name: source.originalName,
          mediaKind: source.mediaKind,
          mimeType: source.mimeType,
          sizeBytes: source.sizeBytes,
          availability: 'available'
        },
        upload: {
          url: uploaded.fileUrl,
          expiresAt: uploaded.expiresAt,
          fileId: uploaded.fileId
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (sourceId && managedSources) {
      await managedSources.discardUnreferenced(sourceId).catch(() => undefined);
    }
    return jobHttpError(error);
  }
};
