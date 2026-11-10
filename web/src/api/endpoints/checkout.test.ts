import {afterEach,describe,expect,it,vi} from 'vitest';
import {checkoutApi,decodePublicCheckout,decodePublicStatus,verifyCheckout} from './checkout';
afterEach(()=>vi.unstubAllGlobals());
const wire=(status:1|2|3|4=1)=>({
  trade_id:'trade_123',amount:100,actual_amount:status===4?0:14.25,
  token:status===4?'':'USDT',currency:'CNY',receive_address:status===4?'':'TVerified',
  network:status===4?'':'tron',status,payment_type:'gmpay',
  created_at:1793746800000,server_time:1793747000000,expiration_time:1793750400000,
  is_selected:status!==4,can_switch:true,redirect_url:'https://merchant/?secret=SECRET',
  payment_url:'',private_field:'SECRET',
});
const ok=(data:unknown)=>new Response(JSON.stringify({
  status_code:200,message:'OK',data,request_id:''
}),{status:200});
describe('W50 public checkout API semantics and safety',()=>{
  it('requires separate matching current status before showing a destination',()=>{
    const checkout=decodePublicCheckout(wire(),'trade_123');
    expect(verifyCheckout(checkout,null,checkout.serverTime).kind).toBe('unverified');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:1},checkout.serverTime))
      .toMatchObject({kind:'payment',payment:'onchain',address:'TVerified'});
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:2},checkout.serverTime).kind).toBe('paid');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:3},checkout.serverTime).kind).toBe('expired');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:4},checkout.serverTime).kind).toBe('choose');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:4},checkout.expirationTime).kind).toBe('expired');
    expect(verifyCheckout(checkout,{tradeId:'other',status:1},checkout.serverTime).kind).toBe('unverified');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:1},checkout.expirationTime).kind).toBe('expired');
  });
  it('keeps status 4 placeholders empty even if latest status changed to 1',()=>{
    const checkout=decodePublicCheckout(wire(4),'trade_123');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:4},checkout.serverTime).kind).toBe('choose');
    expect(verifyCheckout(checkout,{tradeId:'trade_123',status:1},checkout.serverTime).kind)
      .toBe('awaiting-details');
  });
  it('rejects wrong timestamps, mismatched trade IDs, invalid status and amounts',()=>{
    expect(()=>decodePublicCheckout({...wire(),expiration_time:1793750400},'trade_123')).toThrow(RangeError);
    expect(()=>decodePublicCheckout({...wire(),server_time:1793747000},'trade_123')).toThrow(RangeError);
    expect(()=>decodePublicCheckout({...wire(),trade_id:'other'},'trade_123')).toThrow();
    expect(()=>decodePublicCheckout({...wire(),status:99},'trade_123')).toThrow();
    expect(()=>decodePublicCheckout({...wire(),actual_amount:-1},'trade_123')).toThrow();
    expect(()=>decodePublicCheckout({...wire(),is_selected:1},'trade_123')).toThrow();
    expect(()=>decodePublicCheckout({...wire(),can_switch:'yes'},'trade_123')).toThrow();
    expect(()=>decodePublicStatus({trade_id:'trade_123',status:10010},'trade_123')).toThrow();
  });
  it('removes all unknown fields, merchant redirects and payment URL secrets',()=>{
    const detail=decodePublicCheckout({...wire(),payment_url:'https://provider/?token=SECRET'},'trade_123');
    expect(detail.hasHostedPaymentLink).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('SECRET');
    expect(JSON.stringify(detail)).not.toContain('payment_url');
    const hosted=decodePublicCheckout({...wire(),network:'',token:'',receive_address:'',payment_url:'https://provider/'},'trade_123');
    expect(verifyCheckout(hosted,{tradeId:'trade_123',status:1},hosted.serverTime))
      .toMatchObject({kind:'payment',payment:'hosted',address:null});
  });
  it('never displays the OKPAY provider marker as an on-chain wallet',()=>{
    const hosted=decodePublicCheckout({...wire(),payment_url:'https://provider/?secret=HIDDEN',
      receive_address:'OKPAY',network:'tron'},'trade_123');
    expect(verifyCheckout(hosted,{tradeId:'trade_123',status:1},hosted.serverTime))
      .toMatchObject({kind:'payment',payment:'hosted',address:null});
    const noUrl=decodePublicCheckout({...wire(),payment_url:'',
      receive_address:'OKPAY',network:'tron'},'trade_123');
    expect(verifyCheckout(noUrl,{tradeId:'trade_123',status:1},noUrl.serverTime).kind)
      .toBe('awaiting-details');
  });
  it('uses only two unauthenticated no-store GET endpoints',async()=>{
    const f=vi.fn<typeof fetch>()
      .mockImplementationOnce(async()=>ok(wire()))
      .mockImplementationOnce(async()=>ok({trade_id:'trade_123',status:1}));
    vi.stubGlobal('fetch',f);
    await checkoutApi.details('trade_123');
    await checkoutApi.status('trade_123');
    expect(f.mock.calls.map(([url,options])=>[url,options?.method??'GET',options?.cache])).toEqual([
      ['/pay/checkout-counter-resp/trade_123','GET','no-store'],
      ['/pay/check-status/trade_123','GET','no-store'],
    ]);
    expect(f.mock.calls.every(([,opts])=>!new Headers(opts?.headers).has('Authorization'))).toBe(true);
    await expect(checkoutApi.details('../hijack')).rejects.toThrow('Invalid trade ID');
  });
});
