import type { PoyoSubmitRequest } from '../poyo/types';

export type LocalPhase =
  | 'queued'
  | 'validating'
  | 'uploading'
  | 'submission_prepared'
  | 'submitting'
  | 'monitoring'
  | 'downloading'
  | 'complete'
  | 'requires_attention';
export type RemoteStatus = 'unknown' | 'not_started' | 'running' | 'finished' | 'failed';
export type FailureDomain =
  | 'none'
  | 'validation'
  | 'upload'
  | 'submission'
  | 'poll'
  | 'remote_generation'
  | 'download'
  | 'cleanup'
  | 'filesystem'
  | 'database'
  | 'live_update'
  | 'registry';
export type WorkType = 'poll' | 'download' | 'cleanup';

export interface CreateJobRequest {
  workflow: string;
  publicModelId: string;
  guidedRequest: Record<string, unknown>;
  normalizedPayload: PoyoSubmitRequest;
  prompt?: string;
  estimatedCredits?: number;
  correlationId?: string;
  requestFingerprint?: string;
  retryOfJobId?: string;
}

export interface JobRecord {
  id: string;
  workflow: string;
  publicModelId: string;
  localPhase: LocalPhase;
  remoteStatusRaw: string | null;
  remoteStatus: RemoteStatus;
  failureDomain: FailureDomain;
  attentionCode: string | null;
  poyoTaskId: string | null;
  progress: number | null;
  guidedRequest: Record<string, unknown>;
  normalizedPayload: PoyoSubmitRequest;
  estimatedCredits: number | null;
  actualCredits: number | null;
  correlationId: string;
  retryOfJobId: string | null;
  nextPollAt: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface SubmissionClaim {
  jobId: string;
  owner: string;
  token: string;
  payload: PoyoSubmitRequest;
}

export interface WorkClaim {
  workType: WorkType;
  workId: string;
  owner: string;
  token: string;
  attempt: number;
  expiresAt: string;
}

export interface JobEvent {
  eventId: number;
  jobId: string;
  eventType: string;
  localPhase: LocalPhase;
  remoteStatusRaw: string | null;
  remoteStatus: RemoteStatus;
  failureDomain: FailureDomain;
  progress: number | null;
  payload: Record<string, unknown> | null;
  observedAt: string;
}

export interface OutputRecord {
  id: string;
  jobId: string;
  outputOrder: number;
  mediaKind: 'image' | 'video';
  remoteUrl: string | null;
  remoteExpiresAt: string | null;
  remoteMetadata: Record<string, unknown> | null;
  localPath: string | null;
  contentType: string | null;
  byteSize: number | null;
  checksum: string | null;
  signature: string | null;
  downloadState: 'pending' | 'downloading' | 'verified' | 'failed' | 'expired' | 'deleted';
}

export interface JobSnapshot {
  watermark: number;
  jobs: JobRecord[];
}
