import { describe, expect, it } from 'vitest';
import { detectLocale, readLocaleCookie, supportedLocales, toSupportedLocale } from './locale';
import { messages } from './messages';

describe('locale persistence and translations', () => {
  it('prioritizes a valid cookie over browser languages', () => {
    expect(detectLocale('theme=dark; PARAGLIDE_LOCALE=zh-TW', ['ja-JP'])).toBe('zh-TW');
    expect(detectLocale('PARAGLIDE_LOCALE=invalid', ['ko-KR', 'en-US'])).toBe('ko-KR');
    expect(detectLocale('', ['es-ES', 'zh-HK'])).toBe('zh-TW');
    expect(detectLocale('', ['es-ES'])).toBe('en-US');
  });
  it('normalizes language tags and ignores malformed cookies', () => {
    expect(toSupportedLocale('ru')).toBe('ru-RU');
    expect(toSupportedLocale('zh-Hans')).toBe('zh-CN');
    expect(readLocaleCookie('PARAGLIDE_LOCALE=%E0%A4%A')).toBeNull();
  });
  it('provides a non-empty translation for every core key in all six languages', () => {
    const keys = Object.keys(messages['en-US']);
    expect(supportedLocales).toHaveLength(6);
    for (const locale of supportedLocales) {
      expect(Object.keys(messages[locale]).sort()).toEqual([...keys].sort());
      for (const value of Object.values(messages[locale])) expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
