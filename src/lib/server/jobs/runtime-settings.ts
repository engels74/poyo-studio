import {
  DEFAULT_OPERATIONS_SETTINGS,
  normalizeOperationsSettings,
  type OperationsSettings
} from '../settings/operations-settings';

export function runtimeJobTimings(environment: Record<string, string | undefined>): {
  pollDelayMs?: number;
  workerIntervalMs?: number;
} {
  const configured =
    environment.PLS_TEST_JOB_POLL_MS !== undefined ||
    environment.PLS_TEST_JOB_WORKER_MS !== undefined;
  if (!configured) return {};
  if (environment.PLS_TEST_MODE !== '1') {
    throw new Error('Test job timings are available only when PLS_TEST_MODE=1.');
  }
  const parse = (value: string | undefined, name: string): number | undefined => {
    if (value === undefined) return undefined;
    const milliseconds = Number(value);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 25 || milliseconds > 10_000) {
      throw new Error(`${name} must be an integer between 25 and 10000 milliseconds.`);
    }
    return milliseconds;
  };
  const pollDelayMs = parse(environment.PLS_TEST_JOB_POLL_MS, 'PLS_TEST_JOB_POLL_MS');
  const workerIntervalMs = parse(environment.PLS_TEST_JOB_WORKER_MS, 'PLS_TEST_JOB_WORKER_MS');
  return {
    ...(pollDelayMs === undefined ? {} : { pollDelayMs }),
    ...(workerIntervalMs === undefined ? {} : { workerIntervalMs })
  };
}

export function runtimeOperationsSettings(value: unknown): OperationsSettings {
  if (value === undefined) return DEFAULT_OPERATIONS_SETTINGS;
  try {
    return normalizeOperationsSettings(value);
  } catch {
    return DEFAULT_OPERATIONS_SETTINGS;
  }
}
