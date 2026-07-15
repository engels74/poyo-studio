import { PoyoError } from '../poyo/errors';
import type {
  PoyoBalanceResult,
  PoyoStatusResult,
  PoyoSubmitRequest,
  PoyoSubmitResult
} from '../poyo/types';
import type { OutputDownloader } from './downloader';
import type { JobRepository } from './repository';
import type { JobRecord } from './types';

export interface JobPoyoGateway {
  submit(request: PoyoSubmitRequest): Promise<PoyoSubmitResult>;
  getStatus(taskId: string): Promise<PoyoStatusResult>;
  getBalance(): Promise<PoyoBalanceResult>;
}
export interface JobRuntimeSettings {
  pollDelayMs: number;
  staleAfterMs: number;
  automaticDownloads: boolean;
}
export interface JobCoordinatorOptions {
  repository: JobRepository;
  poyo: JobPoyoGateway;
  downloader: OutputDownloader;
  workerId?: string;
  submissionLeaseMs?: number;
  workLeaseMs?: number;
  pollDelayMs?: number;
  staleAfterMs?: number;
  automaticDownloads?: boolean;
  runtimeSettings?: () => JobRuntimeSettings;
  now?: () => Date;
}
export class JobCoordinator {
  readonly workerId: string;
  private readonly now;
  private readonly submissionLeaseMs;
  private readonly workLeaseMs;
  private readonly pollDelayMs;
  private readonly staleAfterMs;
  private readonly automaticDownloads;
  constructor(private readonly options: JobCoordinatorOptions) {
    this.workerId = options.workerId ?? crypto.randomUUID();
    this.now = options.now ?? (() => new Date());
    this.submissionLeaseMs = options.submissionLeaseMs ?? 60_000;
    this.workLeaseMs = options.workLeaseMs ?? 60_000;
    this.pollDelayMs = options.pollDelayMs ?? 5_000;
    this.staleAfterMs = options.staleAfterMs ?? 15 * 60_000;
    this.automaticDownloads = options.automaticDownloads ?? true;
  }
  private settings(): JobRuntimeSettings {
    return (
      this.options.runtimeSettings?.() ?? {
        pollDelayMs: this.pollDelayMs,
        staleAfterMs: this.staleAfterMs,
        automaticDownloads: this.automaticDownloads
      }
    );
  }
  private requireJob(jobId: string): JobRecord {
    const job = this.options.repository.get(jobId);
    if (!job) throw new Error('Job not found.');
    return job;
  }
  async refreshBalance(source: string): Promise<void> {
    try {
      const balance = await this.options.poyo.getBalance();
      this.options.repository.recordBalance(balance.email, balance.creditsAmount, source);
    } catch {}
  }
  async submit(jobId: string): Promise<JobRecord> {
    const claim = this.options.repository.claimSubmission(
      jobId,
      this.workerId,
      this.submissionLeaseMs
    );
    if (!claim) return this.requireJob(jobId);
    if (!this.options.repository.markSubmissionTransmitted(jobId, claim.token))
      return this.requireJob(jobId);
    try {
      const result = await this.options.poyo.submit(claim.payload);
      this.options.repository.acknowledgeSubmission(jobId, claim.token, result);
      await this.refreshBalance('after_submission');
      return this.requireJob(jobId);
    } catch (error) {
      if (
        error instanceof PoyoError &&
        !['network', 'provider', 'rate_limit'].includes(error.category)
      )
        this.options.repository.rejectSubmission(jobId, claim.token, error.technicalCode);
      else
        this.options.repository.markSubmissionUnknown(
          jobId,
          claim.token,
          error instanceof PoyoError ? error.technicalCode : 'transport_unknown'
        );
      await this.refreshBalance('submission_error');
      return this.requireJob(jobId);
    }
  }
  async poll(jobId: string, manual = false): Promise<JobRecord> {
    const job = this.options.repository.get(jobId);
    if (!job?.poyoTaskId) return this.requireJob(jobId);
    const claim = this.options.repository.claimWork('poll', jobId, this.workerId, this.workLeaseMs);
    if (!claim) return job;
    try {
      const settings = this.settings();
      const status = await this.options.poyo.getStatus(job.poyoTaskId);
      const updated = this.options.repository.applyStatus(jobId, status, settings.pollDelayMs);
      if (status.status === 'finished') {
        if (settings.automaticDownloads) await this.downloadPending(jobId);
        else await this.refreshBalance('remote_completion');
      }
      if (status.status === 'failed') await this.refreshBalance('remote_failure');
      return updated;
    } catch (error) {
      const age = this.now().getTime() - Date.parse(job.lastPolledAt ?? job.createdAt);
      return this.options.repository.recordPollFailure(
        jobId,
        error instanceof PoyoError ? error.technicalCode : 'poll_error',
        !manual && age > this.settings().staleAfterMs
      );
    } finally {
      this.options.repository.releaseWork(claim);
    }
  }
  async downloadPending(jobId: string): Promise<void> {
    for (const output of this.options.repository
      .outputs(jobId)
      .filter((item) => item.downloadState !== 'verified')) {
      const claim = this.options.repository.claimWork(
        'download',
        output.id,
        this.workerId,
        this.workLeaseMs
      );
      if (!claim) continue;
      try {
        await this.options.downloader.download(output.id);
      } catch {
      } finally {
        this.options.repository.releaseWork(claim);
      }
    }
    this.options.repository.finishIfDownloaded(jobId);
    await this.refreshBalance('after_completion');
  }
  async retryDownload(outputId: string): Promise<void> {
    const output = this.options.repository.output(outputId);
    if (!output) throw new Error('Output not found.');
    const claim = this.options.repository.claimWork(
      'download',
      output.id,
      this.workerId,
      this.workLeaseMs
    );
    if (!claim) return;
    try {
      await this.options.downloader.download(output.id);
      this.options.repository.finishIfDownloaded(output.jobId);
    } finally {
      this.options.repository.releaseWork(claim);
    }
  }
  async reconcile(jobId: string): Promise<JobRecord> {
    const job = this.options.repository.get(jobId);
    if (!job) throw new Error('Job not found.');
    if (job.localPhase === 'submission_prepared' || job.localPhase === 'submitting')
      return this.submit(jobId);
    if (
      job.poyoTaskId &&
      (job.localPhase === 'monitoring' ||
        (job.localPhase === 'requires_attention' && job.attentionCode === 'stale'))
    ) {
      if (!job.nextPollAt || Date.parse(job.nextPollAt) <= this.now().getTime())
        return this.poll(jobId);
    }
    if (job.localPhase === 'downloading') {
      if (this.settings().automaticDownloads) await this.downloadPending(jobId);
      return this.requireJob(jobId);
    }
    return job;
  }
  async recoverOnce(): Promise<void> {
    for (const job of this.options.repository.listActive())
      await this.reconcile(job.id).catch(() => undefined);
  }
}

export class JobWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly coordinator: JobCoordinator,
    private readonly intervalMs = 1000
  ) {}
  async tick(): Promise<void> {
    await this.coordinator.recoverOnce();
  }
  start(): () => void {
    if (!this.timer) {
      void this.tick().catch(() => undefined);
      this.timer = setInterval(() => void this.tick().catch(() => undefined), this.intervalMs);
      this.timer.unref?.();
    }
    return () => this.stop();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
