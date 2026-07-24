const imageNavigationEventTypes = new Set([
  'download.started',
  'download.verified',
  'output.local_file_removed',
  'output.local_metadata_removed',
  'output.local_both_removed'
]);

export function shouldRefreshJobDetail(
  data: string,
  currentJobId: string,
  modality: 'image' | 'video'
): boolean {
  let event: unknown;
  try {
    event = JSON.parse(data);
  } catch {
    return false;
  }
  if (typeof event !== 'object' || event === null) return false;

  const { jobId, eventType } = event as Record<string, unknown>;
  if (typeof jobId !== 'string' || typeof eventType !== 'string') return false;
  if (jobId === currentJobId) return true;
  return modality === 'image' && imageNavigationEventTypes.has(eventType);
}
