import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../../i18n/i18n-provider';
import {supportedLocales} from '../../i18n/locale';
import {checkoutMessages,checkoutLabel} from './i18n';
import {CheckoutPage} from './checkout-page';

describe('W50 public checkout page isolation',()=>{
  it('renders a read-only loading state without invented order details',()=>{
    const html=renderToStaticMarkup(<I18nProvider>
      <CheckoutPage tradeId="real_trade_123"/>
    </I18nProvider>);
    expect(html).toContain('Secure checkout');
    expect(html).toContain('real_trade_123');
    expect(html).toContain('Loading payment details');
    expect(html).not.toContain('TRealWalletAddress');
    expect(html).not.toContain('/pay/switch-network');
    expect(html).not.toContain('submit-tx-hash');
    expect(html).not.toContain('window.location');
  });
  it('covers all six localized safety labels',()=>{
    const expected=Object.keys(checkoutMessages['en-US']).sort();
    for(const locale of supportedLocales){
      expect(Object.keys(checkoutMessages[locale]).sort()).toEqual(expected);
      for(const key of expected){
        expect(checkoutMessages[locale][key as keyof typeof checkoutMessages['en-US']].length).toBeGreaterThan(0);
      }
    }
    expect(checkoutLabel('zh-CN','failed')).toContain('无法核验');
    expect(checkoutLabel('en-US','noWrites')).toContain('never marks orders paid');
  });
});
