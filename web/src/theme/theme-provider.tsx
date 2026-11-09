import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyResolvedMode, normalizeTheme, readThemeCookie, resolveMode, saveThemeCookie, type ThemePreference, type ResolvedMode } from './theme';

interface ThemeContextValue {
  theme: ThemePreference;
  mode: ResolvedMode;
  setTheme: (next: ThemePreference) => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);
const QUERY = '(prefers-color-scheme: dark)';
const getDark = () => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setPreference] = useState<ThemePreference>(() =>
    typeof document === 'undefined' ? 'system' : readThemeCookie(document.cookie));
  const [systemDark, setSystemDark] = useState(getDark);
  const setTheme = useCallback((next: ThemePreference) => {
    const normalized = normalizeTheme(next);
    saveThemeCookie(normalized);
    setPreference(normalized);
  }, []);
  const mode = resolveMode(theme, systemDark);

  useEffect(() => {
    const media = window.matchMedia?.(QUERY);
    if (!media) return;
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { applyResolvedMode(document.documentElement, mode); }, [mode]);

  return <ThemeContext.Provider value={{ theme, mode, setTheme }}>{children}</ThemeContext.Provider>;
}
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be inside ThemeProvider');
  return value;
}
