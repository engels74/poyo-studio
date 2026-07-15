import type { ExpertOverride } from '../registry/types';

export interface PresetInputRoleValue {
  role: string;
  source: 'remote' | 'uploaded';
  urls: string[];
}

export interface PresetValues {
  version: 1;
  modality: 'image' | 'video';
  guided: Record<string, unknown>;
  expertOverrides: ExpertOverride[];
  inputRoles: PresetInputRoleValue[];
}

export interface PresetRecord {
  id: string;
  registryVersion: string;
  entryKey: string;
  workflow: string;
  name: string;
  description: string | null;
  valuesVersion: 1;
  values: PresetValues;
  createdAt: string;
  updatedAt: string;
}

export interface SavePresetRequest {
  id?: string;
  entryKey: string;
  name: string;
  description?: string;
  values: PresetValues;
}
