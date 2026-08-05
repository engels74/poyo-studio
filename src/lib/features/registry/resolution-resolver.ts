// Deterministic ordering for opaque registry resolution enum tokens ("1K", "720p", "512P").
// Pure, browser-safe: no server imports, no I/O, no randomness.

/**
 * Conventional 16:9 frame height of one horizontal-kilopixel tier, so that the two token
 * families the catalogue uses stay comparable: 2K maps to 1080, 4K maps to 2160.
 */
const KILOPIXEL_TIER_HEIGHT = 540;
const TOKEN_PATTERN = /^(\d+(?:\.\d+)?)\s*([kp])$/i;

/**
 * Rank a resolution token as a comparable frame height.
 * Returns `null` for anything that is not a documented tier token (`"auto"`, `"1024x768"`, …).
 */
export function resolutionTier(token: string): number | null {
  const match = TOKEN_PATTERN.exec(token.trim());
  const amountRaw = match?.[1];
  const unit = match?.[2];
  if (!amountRaw || !unit) return null;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const tier = unit.toLowerCase() === 'k' ? amount * KILOPIXEL_TIER_HEIGHT : amount;
  return Number.isFinite(tier) ? tier : null;
}

/** Filter a registry enum list down to the entries that parse as resolution tiers. */
export function supportedResolutionTokens(supported: readonly string[]): string[] {
  return supported.filter((token) => resolutionTier(token) !== null);
}

/**
 * Pick the largest supported resolution token, keeping the first token on equal tiers so the
 * result stays stable for a given enum order. Returns `null` when nothing parses as a tier.
 */
export function highestResolutionToken(supported: readonly string[]): string | null {
  let best: { token: string; tier: number } | null = null;
  for (const token of supported) {
    const tier = resolutionTier(token);
    if (tier === null) continue;
    if (!best || tier > best.tier) best = { token, tier };
  }
  return best?.token ?? null;
}
