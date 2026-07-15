export async function init(): Promise<void> {
  const { startRuntimeJobWorker } = await import('$lib/server/jobs/runtime');
  await startRuntimeJobWorker();
}
