import { describe, expect, it } from 'vitest';
import { supportedLocales } from '../../i18n/locale';
import { networkMessages, networkLabel } from './i18n';

describe('W40/W41 translated module', () => {
  it('covers all shared keys in six supported locales', () => {
    const keys = Object.keys(networkMessages['en-US']).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(networkMessages[locale]).sort()).toEqual(keys);
      expect(Object.values(networkMessages[locale]).every(x => x.trim().length > 0)).toBe(true);
    }
  });
  it('distinguishes RPC health from blockchain readiness and Aptos assets', () => {
    expect(networkLabel('zh-CN','rpcHealthNote')).toContain('TCP');
    expect(networkLabel('zh-CN','aptosHint')).toContain('Aptos');
  });
});
