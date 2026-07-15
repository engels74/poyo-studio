import { getPlatformServices } from '$lib/server/platform/runtime';
import {
  assertPrivateMediaRequest,
  MediaRangeError,
  parseByteRange,
  privateMediaHeaders,
  safeLocalMediaPath
} from '$lib/server/media/files';
import type { RequestHandler } from './$types';

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);

async function serve(request: Request, outputId: string, head: boolean): Promise<Response> {
  let size: number | null = null;
  try {
    assertPrivateMediaRequest(request);
    const platform = await getPlatformServices();
    const output = platform.database
      .query<
        { local_path: string | null; content_type: string | null; download_state: string },
        [string]
      >('SELECT local_path,content_type,download_state FROM job_outputs WHERE id=?')
      .get(outputId);
    if (!output?.local_path || output.download_state !== 'verified')
      return new Response('Local media is unavailable.', { status: 404 });
    const path = await safeLocalMediaPath(platform.paths.media, output.local_path);
    const file = Bun.file(path);
    if (!(await file.exists()) || file.size <= 0)
      return new Response('Local media is unavailable.', { status: 404 });
    size = file.size;
    const type =
      output.content_type && allowedTypes.has(output.content_type)
        ? output.content_type
        : allowedTypes.has(file.type)
          ? file.type
          : 'application/octet-stream';
    const range = parseByteRange(request.headers.get('range'), size);
    const headers = privateMediaHeaders(type, range ? range.end - range.start + 1 : size);
    if (range) {
      headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
      return new Response(head ? null : file.slice(range.start, range.end + 1), {
        status: 206,
        headers
      });
    }
    return new Response(head ? null : file, { headers });
  } catch (error) {
    if (error instanceof MediaRangeError) {
      const headers = new Headers({
        'cross-origin-resource-policy': 'same-origin',
        'x-content-type-options': 'nosniff'
      });
      if (error.status === 416 && size !== null) headers.set('content-range', `bytes */${size}`);
      return new Response(error.message, { status: error.status, headers });
    }
    return new Response('Local media could not be read.', { status: 404 });
  }
}

export const GET: RequestHandler = ({ request, params }) => serve(request, params.outputId, false);
export const HEAD: RequestHandler = ({ request, params }) => serve(request, params.outputId, true);
