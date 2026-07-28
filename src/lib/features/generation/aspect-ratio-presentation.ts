export interface AspectRatioPreview {
  width: number;
  height: number;
  value: number;
}

const DECIMAL = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const TOKEN = new RegExp(`^(${DECIMAL})\\s*[:x×*]\\s*(${DECIMAL})(?:\\s+(.+))?$`, 'i');
const ADDITIONAL_DELIMITER = /(?:[:×*]|x)\s*(?:\d|\.)/i;

/**
 * Converts a registry aspect-ratio token into display-only geometry.
 * The source token remains the value submitted to the provider.
 */
export function parseAspectRatioPresentation(token: string): AspectRatioPreview | null {
  const match = TOKEN.exec(token);
  if (!match || (match[3] && ADDITIONAL_DELIMITER.test(match[3]))) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  const value = width / height;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(value) ||
    width <= 0 ||
    height <= 0 ||
    value <= 0
  )
    return null;

  return { width, height, value };
}
