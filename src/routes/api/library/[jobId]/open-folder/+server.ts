import { jobHttpError } from '$lib/server/jobs/http';
import { openContainingFolder } from '$lib/server/media/files';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { readSameOriginJson } from '$lib/server/platform/request-security';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    await readSameOriginJson<Record<string, never>>(request, { maxBytes: 1024 });
    const platform = await getPlatformServices();
    const output = platform.database
      .query<{ local_path: string | null }, [string]>(
        "SELECT local_path FROM job_outputs WHERE job_id=? AND local_path IS NOT NULL AND download_state='verified' ORDER BY output_order LIMIT 1"
      )
      .get(params.jobId);
    if (!output?.local_path) throw new Error('No local output folder is available.');
    await openContainingFolder(platform.paths.media, output.local_path);
    return Response.json({ opened: true });
  } catch (error) {
    return jobHttpError(error);
  }
};
