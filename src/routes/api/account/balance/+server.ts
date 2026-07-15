import { latestBalance, refreshBalance } from '$lib/server/account/balance';
import { jobHttpError } from '$lib/server/jobs/http';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { readSameOriginJson } from '$lib/server/platform/request-security';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const platform = await getPlatformServices();
  return Response.json({
    balance: latestBalance(platform.database),
    apiKey: await platform.apiKey.status()
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    await readSameOriginJson<Record<string, never>>(request, { maxBytes: 1024 });
    const platform = await getPlatformServices();
    return Response.json({ balance: await refreshBalance(platform) });
  } catch (error) {
    return jobHttpError(error);
  }
};
