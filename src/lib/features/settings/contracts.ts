export interface ApiKeySettingsDto {
  source: 'environment' | 'local' | 'none';
  status: 'configured' | 'missing' | 'unavailable' | 'error';
  storeKind: 'environment' | 'os' | 'file' | 'unavailable';
  onboardingAvailable: boolean;
  environmentManaged: boolean;
  updatedAt: string | null;
}

export interface StorageSettingsDto {
  source: 'environment' | 'platform-default';
  root: string;
  database: string;
  media: string;
  uploads: string;
  thumbnails: string;
  logs: string;
}

export interface OutputLocationDto {
  /** A custom output directory is persisted in local settings. */
  configured: boolean;
  /** PLS_MEDIA_DIR from the environment takes precedence and cannot be overridden here. */
  environmentManaged: boolean;
  /** The directory generated media is written to right now. */
  active: string;
  /** A saved directory that will take effect on the next restart (null when already active). */
  pending: string | null;
  requiresRestart: boolean;
}

export interface OnboardingStepsDto {
  location: boolean;
  // Named "connection" rather than "apiKey" so the persisted settings blob never contains a
  // key matching the secret-key guard in SettingsRepository.
  connection: boolean;
  theme: boolean;
  defaults: boolean;
}

export interface OnboardingStateDto {
  completed: boolean;
  completedAt: string | null;
  dismissedAt: string | null;
  version: number;
  steps: OnboardingStepsDto;
  /** Completion was inferred for an existing install rather than explicitly recorded. */
  inferred: boolean;
}

export interface SettingsDto {
  apiKey: ApiKeySettingsDto;
  storage: StorageSettingsDto;
  polling: { intervalMs: number; staleAfterMs: number };
  downloads: { automatic: boolean };
  logs: {
    separateErrorFile: boolean;
    maxBytes: number;
    maxAgeMs: number;
    retentionAgeMs: number;
    maxRotatedFiles: number;
  };
  theme: { defaultMode: 'light' | 'dark' | 'system' };
  localCleanup: import('../cleanup/contracts').LocalCleanupPolicy;
  remoteCleanup: import('../cleanup/contracts').RemoteCleanupCapabilityDto;
}
