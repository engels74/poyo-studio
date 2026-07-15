import { loadStudioData } from '$lib/server/generation/studio-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) =>
  loadStudioData('video', url.searchParams.get('preset'));
