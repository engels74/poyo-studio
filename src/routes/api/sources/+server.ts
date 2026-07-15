import { createPoyoClient } from '$lib/server/poyo/factory';
import { intakeLocalSource, removeLocalSource } from '$lib/server/media/source-intake';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { jobHttpError } from '$lib/server/jobs/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  let localPath: string | undefined;
  try {
    const platform = await getPlatformServices();
    const source = await intakeLocalSource(request, platform.paths);
    localPath = source.localPath;
    const client = await createPoyoClient({
      apiKeyManager: platform.apiKey,
      logger: platform.logger
    });
    const localFile = Bun.file(source.localPath);
    const uploaded = await client.upload({
      kind: 'local-file',
      file: localFile,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      mediaKind: source.mediaKind,
      fileName: source.originalName
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
    if (localPath) await removeLocalSource(localPath);
    return jobHttpError(error);
  }
};
