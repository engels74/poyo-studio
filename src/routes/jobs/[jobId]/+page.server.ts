import { error } from '@sveltejs/kit';
import { LibraryRepository } from '$lib/server/library/repository';
import { getPlatformServices } from '$lib/server/platform/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const platform = await getPlatformServices();
  const repository = new LibraryRepository(platform.database);
  const job = await repository.getJobDetail(params.jobId);
  if (!job) error(404, 'Job not found.');
  const imageNavigation =
    job.modality === 'image'
      ? await repository.getImageNavigation(params.jobId, platform.paths.media)
      : null;
  return { job, imageNavigation };
};
