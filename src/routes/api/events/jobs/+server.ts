import { createJobEventStream } from '$lib/server/jobs/events';
import { getJobRuntime } from '$lib/server/jobs/runtime';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ request }) => {
  const runtime = await getJobRuntime();
  return new Response(
    createJobEventStream(runtime.repository, request.headers.get('last-event-id'), request.signal),
    {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
        connection: 'keep-alive'
      }
    }
  );
};
