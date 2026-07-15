import { jobHttpError } from '$lib/server/jobs/http';
import { readSameOriginJson } from '$lib/server/platform/request-security';
import { getJobRuntime } from '$lib/server/jobs/runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, params }) => {
  try {
    await readSameOriginJson<Record<string, never>>(request, { maxBytes: 1024 });
    const runtime = await getJobRuntime();
    const output = runtime.repository.output(params.outputId);
    if (!output || output.jobId !== params.jobId) throw new Error('Output not found.');
    void runtime.coordinator.retryDownload(output.id).catch(() => undefined);
    return Response.json({ accepted: true, outputId: output.id }, { status: 202 });
  } catch (error) {
    return jobHttpError(error);
  }
};
