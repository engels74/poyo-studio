import { getPlatformServices } from '../platform/runtime';
import { createPoyoClient } from '../poyo/factory';
import { JobCoordinator, JobWorker, type JobPoyoGateway } from './coordinator';
import { OutputDownloader } from './downloader';
import { JobRepository } from './repository';

export interface JobRuntime {
  repository: JobRepository;
  coordinator: JobCoordinator;
  worker: JobWorker;
}
let runtimePromise: Promise<JobRuntime> | undefined;
let stopWorker: (() => void) | undefined;
async function createRuntime(): Promise<JobRuntime> {
  const platform = await getPlatformServices();
  const repository = new JobRepository(platform.database);
  const gateway: JobPoyoGateway = {
    submit: async (request) =>
      (await createPoyoClient({ apiKeyManager: platform.apiKey, logger: platform.logger })).submit(
        request
      ),
    getStatus: async (id) =>
      (
        await createPoyoClient({ apiKeyManager: platform.apiKey, logger: platform.logger })
      ).getStatus(id),
    getBalance: async () =>
      (
        await createPoyoClient({ apiKeyManager: platform.apiKey, logger: platform.logger })
      ).getBalance()
  };
  const downloader = new OutputDownloader({ repository, paths: platform.paths });
  const coordinator = new JobCoordinator({ repository, poyo: gateway, downloader });
  return { repository, coordinator, worker: new JobWorker(coordinator) };
}
export function getJobRuntime(): Promise<JobRuntime> {
  runtimePromise ??= createRuntime().catch((error) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}
export async function startRuntimeJobWorker(): Promise<void> {
  if (stopWorker) return;
  const runtime = await getJobRuntime();
  stopWorker = runtime.worker.start();
}
export function stopRuntimeJobWorker(): void {
  stopWorker?.();
  stopWorker = undefined;
}
