import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../../i18n/i18n-provider';
import {ToastProvider} from '../../components/ui/toast';
import {ThemeProvider} from '../../theme/theme-provider';
import {supportedLocales} from '../../i18n/locale';
import {auxiliaryMessages} from './i18n';
import {NotificationsPage} from './notifications-page';
import {DisplayPage,HelpPage,InstallGuide,IntegrationsPage} from './info-pages';
const render=(node:React.ReactNode)=>renderToStaticMarkup(
 <ThemeProvider><I18nProvider><ToastProvider>{node}</ToastProvider></I18nProvider></ThemeProvider>);
describe('W44 auxiliary pages',()=>{
 it('localizes every auxiliary UI key in all six languages',()=>{
  const keys=Object.keys(auxiliaryMessages['en-US']).sort();
  for(const lang of supportedLocales){
   expect(Object.keys(auxiliaryMessages[lang]).sort()).toEqual(keys);
   expect(Object.values(auxiliaryMessages[lang]).every(x=>x.trim())).toBeTruthy();
  }
 });
 it('offers Telegram actions without showing channel credentials or fake email delivery',()=>{
  const html=render(<NotificationsPage/>);
  expect(html).toContain('Only Telegram delivery is implemented');
  expect(html).toContain('Add Telegram channel');
  expect(html).not.toContain('bot_token');
 });
 it('keeps display/integrations/help/install safe and read-only',()=>{
  const go=()=>{};
  const html=[render(<DisplayPage onNavigate={go}/>),
   render(<IntegrationsPage onNavigate={go}/>),
   render(<HelpPage onNavigate={go}/>),
   render(<InstallGuide onNavigate={go}/>),].join('\n');
  expect(html).toContain('Display &amp; brand preview');
  expect(html).toContain('Payment integrations');
  expect(html).toContain('Help &amp; API reference');
  expect(html).toContain('does not have an installation backend');
  expect(html).not.toContain('SECRET_BOT');
  expect(html).not.toContain('/orders/mark-paid');
 });
});
