import {afterEach,describe,expect,it,vi} from 'vitest';
import {paymentOptionsApi,decodePublicPaymentOptions,isSupportedPaymentOption,normalizePaymentChoice} from './payment-options';
afterEach(()=>vi.unstubAllGlobals());
const config=()=>({
  supported_assets:[
    {network:'tron',display_name:'TRON',tokens:['USDT','TRX','usdt']},
    {network:'aptos',display_name:'Aptos',tokens:['MOVEUSD']},
  ],
  okpay:{enabled:true,allow_tokens:['USDT','TRX'],shop_id:'SECRET_SHOP',shop_token:'SECRET_TOKEN',
    api_url:'https://secret.invalid/?token=PRIVATE'},
  site:{logo_url:'https://internal.example/?secret=PRIVATE',cashier_name:'test'},epay:{},
});
const envelope=(data:unknown)=>new Response(JSON.stringify({
  status_code:200,message:'OK',data,request_id:'',
}),{status:200});
describe('W51 public payment choices use only real, nonsecret Go supported_assets',()=>{
  it('normalizes supported onchain and OkPay options and drops all config secrets',()=>{
    const options=decodePublicPaymentOptions(config());
    expect(options.options).toEqual([
      {network:'tron',token:'USDT',label:'TRON',method:'onchain'},
      {network:'tron',token:'TRX',label:'TRON',method:'onchain'},
      {network:'aptos',token:'MOVEUSD',label:'Aptos',method:'onchain'},
      {network:'okpay',token:'USDT',label:'OkPay',method:'okpay'},
      {network:'okpay',token:'TRX',label:'OkPay',method:'okpay'},
    ]);
    expect(JSON.stringify(options)).not.toMatch(/SECRET|PRIVATE|shop_id|api_url|site/);
    expect(isSupportedPaymentOption(options,'TRON','usdt')).toBe(true);
    expect(isSupportedPaymentOption(options,'tron','USDC')).toBe(false);
  });
  it('never invents OkPay options when disabled, or fake wallets when no supported assets',()=>{
    const options=decodePublicPaymentOptions({...config(),okpay:{enabled:false,allow_tokens:['USDT']}});
    expect(options.options.some(row=>row.method==='okpay')).toBe(false);
    expect(decodePublicPaymentOptions({...config(),supported_assets:[],okpay:{enabled:false,allow_tokens:[]}}).options).toEqual([]);
  });
  it('rejects malformed networks, provider spoofing and unsupported tokens',()=>{
    expect(()=>normalizePaymentChoice('../pay','USDT')).toThrow();
    expect(()=>normalizePaymentChoice('tron','?token=PRIVATE')).toThrow();
    expect(()=>decodePublicPaymentOptions({...config(),supported_assets:[{
      network:'okpay',display_name:'fake',tokens:['USDT'],
    }]})).toThrow();
    expect(()=>decodePublicPaymentOptions({...config(),supported_assets:'not an array'})).toThrow();
  });
  it('uses public GET only and does not send admin authorization',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>envelope(config()));
    vi.stubGlobal('fetch',fetcher);
    await paymentOptionsApi.list();
    expect(fetcher.mock.calls[0][0]).toBe('/payments/gmpay/v1/config');
    expect(fetcher.mock.calls[0][1]?.cache).toBe('no-store');
    expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });
});
