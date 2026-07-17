import { ManagedSourceRepository } from '../media/managed-sources';
import type { PlatformServices } from '../platform/runtime';
import { createPoyoClient } from '../poyo/factory';

export function createManagedSourceResolver(platform: PlatformServices) {
  const managedSources = new ManagedSourceRepository(platform.database, platform.paths);
  let clientPromise: ReturnType<typeof createPoyoClient> | null = null;

  return async (localSourceId: string, mediaKind: 'image' | 'video', refreshUpload: boolean) => {
    const source = await managedSources.resolveAvailable(localSourceId, mediaKind);
    if (!refreshUpload) return source;
    clientPromise ??= createPoyoClient({
      apiKeyManager: platform.apiKey,
      logger: platform.logger,
      environment: platform.environment
    });
    const client = await clientPromise;
    const uploaded = await client.upload({
      kind: 'local-file',
      file: Bun.file(source.localPath),
      mimeType: source.mimeType,
      sizeBytes: source.byteSize,
      mediaKind: source.mediaKind,
      fileName: source.originalName
    });
    return { ...source, url: uploaded.fileUrl };
  };
}

export function createManagedSourceUploadRefresher(platform: PlatformServices) {
  const resolve = createManagedSourceResolver(platform);
  return async (localSourceId: string, mediaKind: 'image' | 'video') => {
    const source = await resolve(localSourceId, mediaKind, true);
    if (!('url' in source) || !source.url)
      throw new Error('Managed source upload did not return a usable URL.');
    return { id: source.id, url: source.url };
  };
}
