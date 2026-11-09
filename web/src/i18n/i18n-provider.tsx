import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { detectLocale, localeNames, saveLocaleCookie, supportedLocales, type Locale } from './locale';
import { messages, type MessageKey } from './messages';

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey) => string;
}
const I18nContext = createContext<I18nContextValue | null>(null);
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setCurrent] = useState<Locale>(() => detectLocale(
    typeof document === 'undefined' ? '' : document.cookie,
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])));
  const setLocale = useCallback((next: Locale) => {
    if (!supportedLocales.includes(next)) return;
    saveLocaleCookie(next);
    setCurrent(next);
  }, []);
  const t = useCallback((key: MessageKey): string => messages[locale][key] ?? messages['en-US'][key], [locale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be inside I18nProvider');
  return context;
}
export { localeNames };
