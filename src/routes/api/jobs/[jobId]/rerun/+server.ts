import { JobRequestError } from '$lib/server/jobs/create-request';
import { safeJobDto } from '$lib/server/jobs/events';
import { jobHttpError } from '$lib/server/jobs/http';
import { getJobRuntime } from '$lib/server/jobs/runtime';
import { readSameOriginJson } from '$lib/server/platform/request-security';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const body = await readSameOriginJson<{
      acknowledgeNewPaidJob: boolean;
      actionId: string;
    }>(request, {
      maxBytes: 1024
    });
    if (body.acknowledgeNewPaidJob !== true)
      throw new JobRequestError(
        'paid_action_acknowledgement_required',
        'Explicit acknowledgement is required for a new paid job.'
      );
    const runtime = await getJobRuntime();
    const job = runtime.repository.rerunAsNew(params.jobId, body.actionId);
    void runtime.coordinator.reconcile(job.id).catch(() => undefined);
    return Response.json({ job: safeJobDto(job) }, { status: 202 });
  } catch (error) {
    return jobHttpError(error);
  }
};
