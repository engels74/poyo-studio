export type JobFilterStatus =
  | 'all'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'attention'
  | 'stale';

export type LibraryStatus = 'all' | 'available' | 'attention' | 'remote-only' | 'deleted';

export interface ModelFilterOption {
  publicModelId: string;
  displayName: string;
  provider: string;
  workflow: string;
  modality: 'image' | 'video';
}

export interface SafeMediaSummary {
  outputId: string;
  mediaKind: 'image' | 'video';
  contentType: string | null;
  fileName: string | null;
  downloadState: 'pending' | 'downloading' | 'verified' | 'failed' | 'expired' | 'deleted';
  mediaUrl: string | null;
}

export interface JobListItemDto {
  id: string;
  entryKey: string | null;
  displayName: string;
  provider: string;
  modality: 'image' | 'video';
  workflow: string;
  publicModelId: string;
  localPhase: string;
  remoteStatus: string;
  failureDomain: string;
  attentionCode: string | null;
  progress: number | null;
  estimatedCredits: number | null;
  actualCredits: number | null;
  lastPolledAt: string | null;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  promptExcerpt: string | null;
  outputCount: number;
  verifiedOutputCount: number;
  outputState: string | null;
  representative: SafeMediaSummary | null;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface JobFiltersDto {
  status: JobFilterStatus;
  q: string;
  model: string;
  workflow: string;
  dateFrom: string;
  dateTo: string;
  cursor: string;
}

export interface LibraryFiltersDto {
  q: string;
  mediaKind: '' | 'image' | 'video';
  model: string;
  provider: string;
  workflow: string;
  aspectRatio: string;
  status: LibraryStatus;
  favorite: boolean;
  tag: string;
  dateFrom: string;
  dateTo: string;
  cursor: string;
  view: 'grid' | 'list';
}

export interface JobInputDto {
  role: string;
  inputOrder: number;
  mediaKind: 'image' | 'video';
  sourceKind: 'local' | 'remote' | 'uploaded' | 'unknown';
  sourceLabel: string;
  availability: string;
  managedSourceId: string | null;
  byteSize: number | null;
  checksum: string | null;
  localConsequence: 'retained' | 'missing' | 'deleted' | 'not-managed';
  metadata: Record<string, unknown>;
}

export interface DownloadAttemptDto {
  attempt: number;
  status: 'started' | 'verified' | 'failed' | 'expired';
  bytesReceived: number;
  error: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
}

export interface JobOutputDto extends SafeMediaSummary {
  outputOrder: number;
  remoteAvailable: boolean;
  remoteHost: string | null;
  remoteExpiresAt: string | null;
  byteSize: number | null;
  checksum: string | null;
  signature: string | null;
  aspectRatio: string | null;
  favorite: boolean;
  pinned: boolean;
  localAvailable: boolean;
  verifiedAt: string | null;
  deletedAt: string | null;
  metadata: Record<string, unknown> | null;
  attempts: DownloadAttemptDto[];
}

export interface JobHistoryDto {
  eventId: number;
  eventType: string;
  localPhase: string;
  remoteStatusRaw: string | null;
  remoteStatus: string;
  failureDomain: string;
  progress: number | null;
  payload: Record<string, unknown> | null;
  observedAt: string;
  authority: 'poyo' | 'local';
}

export interface JobDetailDto extends JobListItemDto {
  poyoTaskId: string | null;
  correlationId: string;
  retryOfJobId: string | null;
  submissionState: string | null;
  guidedRequest: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  expertDiff: Array<{ key: string; value: unknown; status?: string }>;
  inputs: JobInputDto[];
  outputs: JobOutputDto[];
  history: JobHistoryDto[];
  tags: string[];
}

export interface LibraryGroupDto {
  jobId: string;
  entryKey: string | null;
  displayName: string;
  provider: string;
  modality: 'image' | 'video';
  workflow: string;
  publicModelId: string;
  promptExcerpt: string | null;
  createdAt: string;
  completedAt: string | null;
  outputCount: number;
  verifiedOutputCount: number;
  totalBytes: number;
  favorite: boolean;
  pinned: boolean;
  aspectRatio: string | null;
  warning: string | null;
  tags: string[];
  representative: SafeMediaSummary | null;
}

export interface StorageStatisticsDto {
  indexedBytes: number;
  verifiedFiles: number;
  missingOrDeletedFiles: number;
  generatedBytes: number;
  managedSourceBytes: number;
  managedSourceFiles: number;
  missingOrDeletedSources: number;
  capacityBytes: number | null;
  freeBytes: number | null;
}

export interface JobFilterOptionsDto {
  models: ModelFilterOption[];
  workflows: string[];
  providers: string[];
  tags: string[];
}

export interface DashboardDto {
  balance: { email: string | null; credits: number; fetchedAt: string } | null;
  active: JobListItemDto[];
  attention: JobListItemDto[];
  recent: LibraryGroupDto[];
  storage: StorageStatisticsDto;
  registry: { imageWorkflows: number; videoWorkflows: number; verifiedAt: string };
  health: { status: 'ok' | 'degraded'; checkedAt: string; apiKeyStatus: string };
}

export type LocalDeleteChoice = 'file' | 'metadata' | 'both';
