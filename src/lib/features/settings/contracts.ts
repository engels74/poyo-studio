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

export interface SettingsDto {
  apiKey: ApiKeySettingsDto;
  storage: StorageSettingsDto;
}
