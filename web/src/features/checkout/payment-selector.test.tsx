import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../../i18n/i18n-provider';
import {decodePublicCheckout,decodePublicStatus} from '../../api/endpoints/checkout';
import {switchMessageKey} from './payment-selector';
import {PaymentSelector} from './payment-selector';

const row={
  trade_id:'w51_parent',amount:10,actual_amount:0,token:'',currency:'CNY',
  receive_address:'',network:'',status:4,payment_type:'gmpay',
  created_at:1793746800000,server_time:1793747000000,
  expiration_time:1793750400000,is_selected:false,can_switch:true,payment_url:'',
};
const snapshot={
  checkout:decodePublicCheckout(row,'w51_parent'),
  status:decodePublicStatus({trade_id:'w51_parent',status:4},'w51_parent'),
};
describe('W51 payment selector user-visible safeguards',()=>{
  it('renders explanatory limit and confirmation header without an invented address',()=>{
    const html=renderToStaticMarkup(<I18nProvider>
      <PaymentSelector initial={snapshot} serverNow={snapshot.checkout.serverTime}
        disabled={false} busy={false}
        onBegin={()=>{}} onResolved={()=>{}} onFailure={()=>{}}/>
    </I18nProvider>);
    expect(html).toContain('Select payment target');
    expect(html).toContain('MaxSubOrders=1');
    expect(html).toContain('Loading');
    expect(html).not.toContain('OKPAY');
    expect(html).not.toContain('TRealAddress');
    expect(html).not.toContain('access_token=');
  });
  it('uses distinct safe messages for unknown result, max children and provider errors',()=>{
    expect(switchMessageKey('unknown')).toBe('selectUnknown');
    expect(switchMessageKey('provider')).toBe('selectProviderError');
    expect(switchMessageKey('limit')).toBe('selectLimit');
    expect(switchMessageKey('suborder')).toBe('selectChild');
  });
});
