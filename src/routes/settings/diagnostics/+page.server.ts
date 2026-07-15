import { getCleanupRuntime } from '$lib/server/cleanup/runtime';
import { buildOperationsDiagnostics } from '$lib/server/diagnostics/operations';
import { getPlatformServices } from '$lib/server/platform/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [platform, cleanup] = await Promise.all([getPlatformServices(), getCleanupRuntime()]);
  return { diagnostics: await buildOperationsDiagnostics(platform, cleanup) };
};
