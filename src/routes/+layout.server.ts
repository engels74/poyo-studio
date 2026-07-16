import { redirect } from '@sveltejs/kit';
import { latestBalance } from '$lib/server/account/balance';
import { getPlatformServices } from '$lib/server/platform/runtime';
import { loadOnboardingState } from '$lib/server/settings/onboarding-gate';
import type { OperationsSettings } from '$lib/server/settings/operations-settings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url }) => {
  const platform = await getPlatformServices();
  const onboarding = await loadOnboardingState(platform);
  // Send first-run installs into onboarding, but never trap an existing install or loop the
  // /welcome route itself. API routes do not run layout loads, so they are unaffected.
  if (!onboarding.completed && url.pathname !== '/welcome') {
    redirect(307, '/welcome');
  }
  const activeJobs =
    platform.database
      .query<{ count: number }, []>(
        "SELECT COUNT(*) count FROM jobs WHERE local_phase IN ('queued','validating','uploading','submission_prepared','submitting','monitoring','downloading')"
      )
      .get()?.count ?? 0;
  const themeDefault =
    platform.settings.get<OperationsSettings>('operations')?.value.theme?.defaultMode ?? 'light';
  return {
    shellSummary: { activeJobs, balance: latestBalance(platform.database) },
    onboarding,
    themeDefault
  };
};
