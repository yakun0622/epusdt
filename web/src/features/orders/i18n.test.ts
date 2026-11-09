import { describe, expect, it } from 'vitest';
import { supportedLocales } from '../../i18n/locale';
import { orderLabel, orderMessages, orderStatusLabel } from './i18n';

describe('order module translations', () => {
  it('covers all core keys in all original six languages', () => {
    const keys = Object.keys(orderMessages['en-US']).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(orderMessages[locale]).sort()).toEqual(keys);
      expect(Object.values(orderMessages[locale]).every(value => value.trim().length > 0)).toBe(true);
    }
  });
  it('does not conflate status 4 with expiration', () => {
    expect(orderStatusLabel('en-US', 4)).toBe('Selecting network');
    expect(orderStatusLabel('zh-CN', 3)).toBe('已过期');
    expect(orderLabel('zh-CN', 'export')).toBe('导出 CSV');
  });
});
