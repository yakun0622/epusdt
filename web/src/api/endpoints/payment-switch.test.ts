import {afterEach,describe,expect,it,vi} from 'vitest';
import {decodePublicCheckout,decodePublicStatus} from './checkout';
import {decodePublicPaymentOptions} from './payment-options';
import {allowPaymentSelection,unchangedBeforeSwitch,decodeSwitchResult,
  paymentSwitchApi,classifySwitchFailure,SwitchPaymentError} from './payment-switch';
import {ApiError} from '../../api';
afterEach(()=>vi.unstubAllGlobals());
const wire=(status:1|2|3|4=1)=>({
  trade_id:'parent_A',amount:100,actual_amount:status===4?0:14.25,
  token:status===4?'':'USDT',currency:'CNY',
  receive_address:status===4?'':'TAddress',network:status===4?'':'tron',
  status,payment_type:'gmpay',created_at:1793746800000,
  server_time:1793747000000,expiration_time:1793750400000,
  is_selected:status!==4,payment_url:'',redirect_url:'',
});
const opts=decodePublicPaymentOptions({
  supported_assets:[{network:'tron',display_name:'TRON',tokens:['USDT']},
    {network:'ton',display_name:'TON',tokens:['USDT']}],
  okpay:{enabled:true,allow_tokens:['USDT']},
});
const snapshot=(status:1|2|3|4=1)=>({
  checkout:decodePublicCheckout(wire(status),'parent_A'),
  status:decodePublicStatus({trade_id:'parent_A',status},'parent_A'),
});
const envelope=(data:unknown)=>new Response(JSON.stringify({
  status_code:200,data,message:'OK',request_id:'',
}),{status:200});
describe('W51 one-shot network switching and server-authoritative reconciliation',()=>{
  it('distinguishes already selected, new child order, and status=4 in-place completion',()=>{
    const parent=snapshot();
    expect(allowPaymentSelection(parent,opts,'tron','usdt',parent.checkout.serverTime)).toBe('same');
    expect(allowPaymentSelection(parent,opts,'ton','USDT',parent.checkout.serverTime)).toBe('switch');
    const placeholder=snapshot(4);
    expect(allowPaymentSelection(placeholder,opts,'ton','USDT',placeholder.checkout.serverTime)).toBe('switch');
    expect(()=>allowPaymentSelection(parent,opts,'ton','USDT',parent.checkout.expirationTime)).toThrow(SwitchPaymentError);
    expect(()=>allowPaymentSelection(snapshot(2),opts,'ton','USDT',parent.checkout.serverTime)).toThrow();
    expect(()=>allowPaymentSelection(snapshot(3),opts,'ton','USDT',parent.checkout.serverTime)).toThrow();
    expect(()=>allowPaymentSelection(parent,opts,'ton','TRX',parent.checkout.serverTime)).toThrow();
    const race={checkout:parent.checkout,status:decodePublicStatus({trade_id:'parent_A',status:2},'parent_A')};
    expect(()=>allowPaymentSelection(race,opts,'ton','USDT',parent.checkout.serverTime)).toThrow();
  });
  it('blocks switching away from a provider parent that has network=tron but address=OKPAY',()=>{
    const parent=snapshot();
    const hosted=decodePublicCheckout({...wire(),receive_address:'OKPAY',
      network:'tron',payment_url:'https://provider/?token=SECRET'},'parent_A');
    expect(()=>allowPaymentSelection({checkout:hosted,status:parent.status},
      opts,'tron','USDT',hosted.serverTime)).toMatchObject({problem:'provider'});
  });
  it('requires same initial and preflight snapshots; no POST after another tab changes order',()=>{
    expect(unchangedBeforeSwitch(snapshot(),snapshot())).toBe(true);
    expect(unchangedBeforeSwitch(snapshot(),snapshot(4))).toBe(false);
    const modified=snapshot();
    modified.checkout={...modified.checkout,token:'TRX'};
    expect(unchangedBeforeSwitch(snapshot(),modified)).toBe(false);
  });
  it('validates a concrete returned child versus a status=4 in-place parent',()=>{
    const parent=snapshot().checkout;
    const sub={...wire(),trade_id:'sub_B',network:'ton',receive_address:'TONAddress',
      token:'USDT',is_selected:true};
    expect(decodeSwitchResult(sub,parent,'ton','USDT')).toEqual({
      tradeId:'sub_B',method:'onchain',hasHostedPaymentLink:false,changedTradeId:true,
    });
    expect(()=>decodeSwitchResult(sub,snapshot(4).checkout,'ton','USDT')).toThrow();
    expect(()=>decodeSwitchResult({...sub,token:'TRX'},parent,'ton','USDT')).toThrow();
    expect(()=>decodeSwitchResult({...sub,status:2},parent,'ton','USDT')).toThrow();
    expect(()=>decodeSwitchResult({...sub,receive_address:''},parent,'ton','USDT')).toThrow();
  });
  it('requires hosted payment link but never retains its tokenized URL',()=>{
    const hosted={...wire(4),status:1,token:'USDT',network:'tron',
      receive_address:'OKPAY',actual_amount:14.25,
      payment_url:'https://pay.provider.invalid/?access_token=SECRET'};
    const result=decodeSwitchResult(hosted,snapshot(4).checkout,'okpay','USDT');
    expect(result).toEqual({tradeId:'parent_A',method:'okpay',hasHostedPaymentLink:true,changedTradeId:false});
    expect(JSON.stringify(result)).not.toMatch(/SECRET|provider.invalid/);
    expect(()=>decodeSwitchResult({...hosted,payment_url:''},snapshot(4).checkout,'okpay','USDT')).toThrow();
  });
  it('categorizes business error codes without revealing raw response messages',()=>{
    expect(classifySwitchFailure(new ApiError('SECRET',400,10011))).toBe('limit');
    expect(classifySwitchFailure(new ApiError('SECRET',400,10012))).toBe('suborder');
    expect(classifySwitchFailure(new ApiError('SECRET',400,10013))).toBe('expired');
    expect(classifySwitchFailure(new ApiError('SECRET',400,10010))).toBe('stale');
    expect(classifySwitchFailure(new ApiError('SECRET',400,10042))).toBe('provider');
    expect(classifySwitchFailure(new ApiError('SECRET',0))).toBe('unknown');
  });
  it('sends one explicit POST with correct Go contract; response contains no tokenized URLs',async()=>{
    const reply={...wire(4),status:1,network:'ton',token:'USDT',
      receive_address:'TONAddress',actual_amount:14.25,is_selected:false,
      payment_url:'',redirect_url:'https://merchant/?secret=HIDDEN'};
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>envelope(reply));
    vi.stubGlobal('fetch',fetcher);
    const result=await paymentSwitchApi.switchOnce(snapshot(4).checkout,'ton','usdt');
    expect(result.tradeId).toBe('parent_A');
    expect(JSON.stringify(result)).not.toContain('HIDDEN');
    expect(fetcher.mock.calls[0][0]).toBe('/pay/switch-network');
    expect(fetcher.mock.calls[0][1]?.method).toBe('POST');
    expect(fetcher.mock.calls[0][1]?.cache).toBe('no-store');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      trade_id:'parent_A',token:'USDT',network:'ton',
    });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });
  it('never retries uncertain provider mutations or leaks server response text',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>
      new Response(JSON.stringify({status_code:400,message:'private token=HIDDEN',
        request_id:'',data:null}),{status:400}));
    vi.stubGlobal('fetch',fetcher);
    await expect(paymentSwitchApi.switchOnce(snapshot().checkout,'okpay','USDT'))
      .rejects.toMatchObject({problem:'unknown'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
