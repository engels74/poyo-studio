import { parseJobFilters } from '$lib/features/library/presentation';
import { LibraryRepository } from '$lib/server/library/repository';
import { getPlatformServices } from '$lib/server/platform/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const platform = await getPlatformServices();
  const repository = new LibraryRepository(platform.database);
  const filters = parseJobFilters(url.searchParams);
  return {
    filters,
    page: repository.listJobs(filters),
    filterOptions: repository.filterOptions()
  };
};
