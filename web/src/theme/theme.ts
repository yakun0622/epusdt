export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedMode = 'light' | 'dark';
const COOKIE = 'theme';
const MAX_AGE = 365 * 24 * 60 * 60;

export function normalizeTheme(value: string | null | undefined): ThemePreference {
  return value === 'dark' || value === 'light' ? value : 'system';
}
export function readThemeCookie(cookieString: string): ThemePreference {
  const found = cookieString.split(';').map(item => item.trim())
    .find(item => item.startsWith(COOKIE + '='));
  if (!found) return 'system';
  try { return normalizeTheme(decodeURIComponent(found.slice(COOKIE.length + 1))); }
  catch { return 'system'; }
}
export function resolveMode(theme: ThemePreference, systemDark: boolean): ResolvedMode {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}
export function applyResolvedMode(root: Pick<HTMLElement, 'dataset' | 'style'>, mode: ResolvedMode): void {
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
}
export function saveThemeCookie(theme: ThemePreference): void {
  document.cookie = COOKIE + '=' + encodeURIComponent(theme)
    + '; Path=/; Max-Age=' + MAX_AGE + '; SameSite=Lax';
}
