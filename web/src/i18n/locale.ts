export const supportedLocales = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'ru-RU'] as const;
export type Locale = typeof supportedLocales[number];
export const localeNames: Record<Locale, string> = {
  'en-US': 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文',
  'ja-JP': '日本語', 'ko-KR': '한국어', 'ru-RU': 'Русский',
};
const NAME = 'PARAGLIDE_LOCALE';
const AGE_SECONDS = 40 * 24 * 60 * 60;
export function toSupportedLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  const lower = input.trim().toLowerCase().replace('_', '-');
  if (lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant' || lower.startsWith('zh-hant-')) return 'zh-TW';
  if (lower === 'zh-tw') return 'zh-TW';
  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans') return 'zh-CN';
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja-JP';
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko-KR';
  if (lower === 'ru' || lower.startsWith('ru-')) return 'ru-RU';
  return null;
}
export function readLocaleCookie(cookieString: string): Locale | null {
  const found = cookieString.split(';').map(item => item.trim()).find(item => item.startsWith(NAME + '='));
  if (!found) return null;
  try { return toSupportedLocale(decodeURIComponent(found.slice(NAME.length + 1))); }
  catch { return null; }
}
export function detectLocale(cookieString: string, preferredLanguages: readonly string[] = []): Locale {
  const saved = readLocaleCookie(cookieString);
  if (saved) return saved;
  for (const value of preferredLanguages) {
    const match = toSupportedLocale(value);
    if (match) return match;
  }
  return 'en-US';
}
export function saveLocaleCookie(locale: Locale): void {
  document.cookie = NAME + '=' + encodeURIComponent(locale)
    + '; Path=/; Max-Age=' + AGE_SECONDS + '; SameSite=Lax';
}
