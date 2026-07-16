export const themeStorageKey = 'poyo-studio-theme';

export const themePreferences = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof themePreferences)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  const index = themePreferences.indexOf(preference);
  return themePreferences[(index + 1) % themePreferences.length] ?? 'light';
}

// Matches the opening <html> tag regardless of the attributes it already carries. `\b` keeps it
// from matching `<htmlfoo>`, and `[^>]*` stops at the first `>`. The document's `<!doctype html>`
// is not matched because it lacks the `<html` sequence.
const htmlTagPattern = /<html\b([^>]*)>/i;

// Injects the pre-hydration `data-theme-default` attribute onto the document's <html> tag. Kept as
// a pure helper so it stays resilient to app.html markup changes (a new attribute, a different
// lang) instead of depending on an exact literal that would silently no-op — reintroducing the
// first-paint theme flash — the moment the template drifts. Idempotent: re-injection is skipped if
// the attribute is already present.
export function injectThemeDefault(html: string, mode: ThemePreference): string {
  const match = htmlTagPattern.exec(html);
  if (!match) return html;
  const attrs = match[1] ?? '';
  if (attrs.includes('data-theme-default')) return html;
  // Function replacer closes over the captured attributes so a literal `$` in them is never treated
  // as a replacement pattern.
  return html.replace(htmlTagPattern, () => `<html${attrs} data-theme-default="${mode}">`);
}
