import { loadStudioData } from '$lib/server/generation/studio-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) =>
  loadStudioData('image', url.searchParams.get('preset'));
