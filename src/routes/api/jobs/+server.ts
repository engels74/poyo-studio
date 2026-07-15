import { readSameOriginJson } from '$lib/server/platform/request-security';
import { getJobRuntime } from '$lib/server/jobs/runtime';
import { jobHttpError } from '$lib/server/jobs/http';
import { safeJobDto } from '$lib/server/jobs/events';
import type { CreateJobRequest } from '$lib/server/jobs/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const input = await readSameOriginJson<CreateJobRequest>(request);
    const runtime = await getJobRuntime();
    const job = runtime.repository.create(input);
    void runtime.coordinator.reconcile(job.id).catch(() => undefined);
    return Response.json({ job: safeJobDto(job) }, { status: 202 });
  } catch (error) {
    return jobHttpError(error);
  }
};
