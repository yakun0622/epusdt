import { describe, expect, it } from 'vitest';
import { supportedLocales } from '../../i18n/locale';
import { apiKeyMessages, keyLabel } from './i18n';

describe('W35 API key locale coverage', () => {
  it('provides matching nonempty translations for every key', () => {
    const keys = Object.keys(apiKeyMessages['en-US']).sort();
    for (const locale of supportedLocales) {
      expect(Object.keys(apiKeyMessages[locale]).sort()).toEqual(keys);
      expect(Object.values(apiKeyMessages[locale]).every(s => s.trim().length > 0)).toBe(true);
    }
  });
  it('has explicit warnings for rotation and deletion', () => {
    expect(keyLabel('zh-CN', 'rotateWarning')).toContain('旧密钥失效');
    expect(keyLabel('zh-CN', 'deleteWarning')).toContain('回调失败');
  });
});
