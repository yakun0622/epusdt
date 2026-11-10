import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../../i18n/i18n-provider';
import {ToastProvider} from '../../components/ui/toast';
import {SettingsPage} from './settings-page';

describe('W42 settings pages',()=>{
  it('renders all five configuration groups and does not print secret values',()=>{
    const html=renderToStaticMarkup(<I18nProvider><ToastProvider>
      <SettingsPage section="system" onNavigate={()=>{}}/>
    </ToastProvider></I18nProvider>);
    for(const label of ['System','Telegram','Payment & Rates','EPAY','OkPay'])
      expect(html).toContain(label);
    expect(html).not.toContain('shop_token=secret');
    expect(html).not.toContain('system.jwt_secret');
  });
});
