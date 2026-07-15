import { safeJobDto } from '$lib/server/jobs/events';
import { jobHttpError } from '$lib/server/jobs/http';
import { getJobRuntime } from '$lib/server/jobs/runtime';
import type { CreateJobRequest } from '$lib/server/jobs/types';
import { ManagedSourceRepository } from '$lib/server/media/managed-sources';
import { readSameOriginJson } from '$lib/server/platform/request-security';
import { getPlatformServices } from '$lib/server/platform/runtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const input = await readSameOriginJson<CreateJobRequest>(request);
    const platform = await getPlatformServices();
    const managedSources = new ManagedSourceRepository(platform.database, platform.paths);
    const inputs = await Promise.all(
      (input.inputs ?? []).map(async ({ managedSourceId: _ignored, localSourceId, ...source }) => ({
        ...source,
        ...(source.source === 'uploaded' && localSourceId
          ? {
              managedSourceId: (
                await managedSources.resolveAvailable(localSourceId, source.mediaKind)
              ).id
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
