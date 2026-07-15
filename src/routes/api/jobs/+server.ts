import { readSameOriginJson } from '$lib/server/platform/request-security';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { getJobRuntime } from '$lib/server/jobs/runtime';
import { jobHttpError } from '$lib/server/jobs/http';
import { safeJobDto } from '$lib/server/jobs/events';
import type { CreateJobRequest } from '$lib/server/jobs/types';
import { resolveLocalSourceReference } from '$lib/server/media/source-intake';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const input = await readSameOriginJson<CreateJobRequest>(request);
    const platform = await getPlatformServices();
    const inputs = await Promise.all(
      (input.inputs ?? []).map(async ({ localReference: _ignored, ...source }) => ({
        ...source,
        ...(source.source === 'uploaded' && source.localSourceId
          ? {
              localReference: await resolveLocalSourceReference(
                platform.paths,
                source.localSourceId
              )
            }
          : {})
      }))
    );
    const runtime = await getJobRuntime();
    const job = runtime.repository.create({ ...input, inputs });
    void runtime.coordinator.reconcile(job.id).catch(() => undefined);
    return Response.json({ job: safeJobDto(job) }, { status: 202 });
  } catch (error) {
    return jobHttpError(error);
  }
};
