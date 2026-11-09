import { describe, expect, it, vi, afterAll } from 'vitest';
import { saveThemeCookie } from './theme';
import { saveLocaleCookie } from '../i18n/locale';

const writes: string[] = [];
vi.stubGlobal('document', {
  set cookie(value: string) { writes.push(value); },
});
afterAll(() => vi.unstubAllGlobals());

describe('persistent appearance preferences', () => {
  it('persists theme for 365 days with original cookie name and scope', () => {
    saveThemeCookie('dark');
    expect(writes.at(-1)).toContain('theme=dark; Path=/; Max-Age=31536000; SameSite=Lax');
  });
  it('persists a supported locale for 40 days independently', () => {
    saveLocaleCookie('ja-JP');
    expect(writes.at(-1)).toContain('PARAGLIDE_LOCALE=ja-JP; Path=/; Max-Age=3456000; SameSite=Lax');
  });
});
