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
