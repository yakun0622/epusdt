import { describe, expect, it } from 'vitest';
import { supportedLocales } from '../../i18n/locale';
import { walletImportError, walletLabel, walletMessages } from './i18n';
describe('W33/W34 six-language wallets', () => {
  it('has every key in each language', () => {
    const keys = Object.keys(walletMessages['en-US']).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(walletMessages[locale]).sort()).toEqual(keys);
      expect(Object.values(walletMessages[locale]).every(s => s.trim().length > 0)).toBe(true);
    }
  });
  it('displays backend batch errors by code without turning them into successes', () => {
    expect(walletImportError('zh-CN', 10001, 'ignored')).toBe('地址已存在');
    expect(walletImportError('en-US', 10003, 'Invalid')).toBe('Invalid');
    expect(walletLabel('zh-CN', 'partialWarning')).toContain('HTTP 200');
  });
});
