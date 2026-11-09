import { describe, expect, it, vi } from 'vitest';
import { applyResolvedMode, normalizeTheme, readThemeCookie, resolveMode } from './theme';

describe('Theme cookie and system preference', () => {
  it('reads theme cookie without disturbing other cookies', () => {
    expect(readThemeCookie('access_token=abc; theme=dark; PARAGLIDE_LOCALE=zh-CN')).toBe('dark');
    expect(readThemeCookie('theme=light')).toBe('light');
    expect(readThemeCookie('theme=unexpected')).toBe('system');
    expect(readThemeCookie('')).toBe('system');
    expect(normalizeTheme('system')).toBe('system');
  });
  it('resolves OS changes only in system mode', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });
  it('applies data-mode and CSS color-scheme together', () => {
    const root = { dataset: { mode: 'light' }, style: { colorScheme: 'light' } };
    applyResolvedMode(root as unknown as HTMLElement, 'dark');
    expect(root.dataset.mode).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(vi.isMockFunction(resolveMode)).toBe(false);
  });
});
