import {afterEach,describe,expect,it,vi} from 'vitest';
import {ApiError} from '../../api';
import {decodePublicCheckout,decodePublicStatus} from './checkout';
import {decodeReconciliation,type VerifiedCashierSnapshot} from './reconciliation';
import {canVerifyTxHash,classifyHashFailure,sameHashTarget,txHashApi,
  validHashInput,HashVerificationError} from './tx-hash';

afterEach(()=>vi.unstubAllGlobals());
const trade='w53_root';
const checkout=()=>({
  trade_id:trade,status:1,amount:100,actual_amount:12.55,token:'USDT',
  currency:'CNY',network:'tron',receive_address:'TServerSelectedAddress',
  payment_type:'gmpay',created_at:1793746800000,expiration_time:1793750400000,
  server_time:1793747000000,is_selected:true,can_switch:true,payment_url:'',
});
const relation=(extra:Record<string,unknown>={})=>({
  trade_id:trade,status:1,root_trade_id:trade,root_status:1,
  related_trade_id:'',related_status:0,provider:'on_chain',provider_status:'',
  paid_confirmed:false,requires_review:false,server_time:1793747000000,
  expiration_time:1793750400000,...extra,
});
function snapshot(overrides:Record<string,unknown>={}):VerifiedCashierSnapshot {
  return {
    checkout:decodePublicCheckout(checkout(),trade),
    status:decodePublicStatus({trade_id:trade,status:1},trade),
    reconciliation:decodeReconciliation(relation(overrides),trade),receivedAt:1,
  };
}
const ok=(data:unknown)=>new Response(JSON.stringify({status_code:200,message:'OK',data}),{status:200});
describe('W53 public hash evidence verification (no settlement)',()=>{
  it('accepts supported hash syntax without inventing chain validation',()=>{
    expect(validHashInput('0x'+'a'.repeat(64))).toBe(true);
    expect(validHashInput('ton:0:abc:123:hash+/=')).toBe(true);
    for(const text of ['','a b','a\n b','../secret', 'a'.repeat(257)]){
      expect(validHashInput(text)).toBe(false);
    }
  });
  it('gates inactive, expired, hosted, paid, conflicted and child-selected parents',()=>{
    const s=snapshot();
    expect(canVerifyTxHash(s,1793747001000)).toBe(true);
    expect(canVerifyTxHash(s,1793750400001)).toBe(false);
    expect(canVerifyTxHash(snapshot({related_trade_id:'w53_child',related_status:1}),1793747001000)).toBe(false);
    expect(canVerifyTxHash(snapshot({provider:'okpay',provider_status:'pending'}),1793747001000)).toBe(false);
    expect(canVerifyTxHash(snapshot({requires_review:true}),1793747001000)).toBe(false);
    expect(canVerifyTxHash(snapshot({root_status:2}),1793747001000)).toBe(false);
  });
  it('maps server errors correctly: 10010 is conflict not expired',()=>{
    expect(classifyHashFailure(new ApiError('',400,10010))).toBe('changed');
    expect(classifyHashFailure(new ApiError('',400,10007))).toBe('used');
    expect(classifyHashFailure(new ApiError('',400,10013))).toBe('not-waiting');
    expect(classifyHashFailure(new ApiError('',400,10038))).toBe('failed');
    expect(classifyHashFailure(new ApiError('',400,10039))).toBe('provider');
    expect(classifyHashFailure(new ApiError('',400,10009))).toBe('invalid');
    expect(classifyHashFailure(new Error('network'))).toBe('unknown');
  });
  it('submits one verify-only POST after three new GETs; no admin auth or settlement',async()=>{
    const fetchMock=vi.fn<typeof fetch>()
      .mockImplementationOnce(async()=>ok(checkout()))
      .mockImplementationOnce(async()=>ok({trade_id:trade,status:1}))
      .mockImplementationOnce(async()=>ok(relation()))
      .mockImplementationOnce(async()=>ok({
        trade_id:trade,verification:'verified',
        block_transaction_id:'0x'+'a'.repeat(64),status:2,paid:true,
      }));
    vi.stubGlobal('fetch',fetchMock);
    const result=await txHashApi.verifyOnce(snapshot(),'0x'+'a'.repeat(64),1793747001000);
    expect(result).toEqual({tradeId:trade,transactionId:'0x'+'a'.repeat(64),verification:'verified'});
    expect(JSON.stringify(result)).not.toContain('paid');
    expect(fetchMock.mock.calls.map(([url,opts])=>[url,opts?.method??'GET'])).toEqual([
      ['/pay/checkout-counter-resp/'+trade,'GET'],
      ['/pay/check-status/'+trade,'GET'],
      ['/pay/reconcile-status/'+trade,'GET'],
      ['/pay/verify-tx-hash/'+trade,'POST'],
    ]);
    expect(fetchMock.mock.calls.every(([,o])=>!new Headers(o?.headers).has('Authorization'))).toBe(true);
    expect(fetchMock.mock.calls[3][1]?.body).toBe(JSON.stringify({block_transaction_id:'0x'+'a'.repeat(64)}));
    expect(fetchMock.mock.calls.some(([url])=>String(url).includes('submit-tx-hash'))).toBe(false);
  });
  it('will not POST if fresh verification finds a changed target',async()=>{
    const changed={...checkout(),actual_amount:999};
    const f=vi.fn<typeof fetch>()
      .mockImplementationOnce(async()=>ok(changed))
      .mockImplementationOnce(async()=>ok({trade_id:trade,status:1}))
      .mockImplementationOnce(async()=>ok(relation()));
    vi.stubGlobal('fetch',f);
    await expect(txHashApi.verifyOnce(snapshot(),'abc',1793747001000))
      .rejects.toMatchObject({problem:'changed'});
    expect(f).toHaveBeenCalledTimes(3);
    const a=snapshot(),b=snapshot();
    b.checkout.receiveAddress='different';
    expect(sameHashTarget(a,b)).toBe(false);
  });
  it('unknown POST outcome is never reported as paid and is not automatically retried',async()=>{
    const f=vi.fn<typeof fetch>()
      .mockImplementationOnce(async()=>ok(checkout()))
      .mockImplementationOnce(async()=>ok({trade_id:trade,status:1}))
      .mockImplementationOnce(async()=>ok(relation()))
      .mockImplementationOnce(async()=>{throw new Error('lost connection after request');});
    vi.stubGlobal('fetch',f);
    await expect(txHashApi.verifyOnce(snapshot(),'abc',1793747001000))
      .rejects.toMatchObject({problem:'unknown'});
    expect(f).toHaveBeenCalledTimes(4);
  });
  it('never trusts a payment status as a hash verification response',async()=>{
    const f=vi.fn<typeof fetch>()
      .mockImplementationOnce(async()=>ok(checkout()))
      .mockImplementationOnce(async()=>ok({trade_id:trade,status:1}))
      .mockImplementationOnce(async()=>ok(relation()))
      .mockImplementationOnce(async()=>ok({trade_id:trade,status:2,paid:true}));
    vi.stubGlobal('fetch',f);
    await expect(txHashApi.verifyOnce(snapshot(),'abc',1793747001000))
      .rejects.toBeInstanceOf(HashVerificationError);
  });
});
