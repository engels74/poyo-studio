import { latestBalance } from '$lib/server/account/balance';
import { getPlatformServices } from '$lib/server/platform/runtime';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  const platform = await getPlatformServices();
  const activeJobs =
    platform.database
      .query<{ count: number }, []>(
        "SELECT COUNT(*) count FROM jobs WHERE local_phase IN ('queued','validating','uploading','submission_prepared','submitting','monitoring','downloading')"
      )
      .get()?.count ?? 0;
  return { shellSummary: { activeJobs, balance: latestBalance(platform.database) } };
};
