import {describe,expect,it} from 'vitest';
import {supportedLocales} from '../../i18n/locale';
import {operationMessages,opsLabel,fieldNames} from './i18n';
import {settingFields} from '../../api/endpoints/settings';
describe('W42 W43 localization',()=>{
  it('covers every operation text key in six locales',()=>{
    const keys=Object.keys(operationMessages['en-US']).sort();
    for(const lang of supportedLocales){
      expect(Object.keys(operationMessages[lang]).sort()).toEqual(keys);
      expect(Object.values(operationMessages[lang]).every(Boolean)).toBe(true);
    }
    expect(opsLabel('zh-CN','partial')).toContain('HTTP 200');
  });
  it('provides a user-facing label for each supported editable field',()=>{
    for(const f of settingFields)expect(fieldNames[f.key]).toBeDefined();
  });
});
