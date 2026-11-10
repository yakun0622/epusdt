import {afterEach,describe,expect,it,vi} from 'vitest';
import {decodeReconciliation,evaluateCashier,nextCashierPollDelay,
  stopCashierPolling,classifyStatusReadError,reconciliationApi,
  type VerifiedCashierSnapshot} from './reconciliation';
import {decodePublicCheckout,decodePublicStatus} from './checkout';
import {ApiError} from '../../api';
afterEach(()=>vi.unstubAllGlobals());
const wire=(status:1|2|3|4=1)=>({
  trade_id:'w52_root',status,amount:100,actual_amount:14.28,token:'USDT',
  currency:'CNY',network:'tron',receive_address:'TRealAddress',
  payment_type:'gmpay',created_at:1793746800000,expiration_time:1793750400000,
  server_time:1793747000000,is_selected:true,can_switch:true,payment_url:'',
});
const relation=(overrides:Record<string,unknown>={})=>({
 trade_id:'w52_root',status:1,root_trade_id:'w52_root',root_status:1,
 related_trade_id:'',related_status:0,provider:'on_chain',provider_status:'',
 paid_confirmed:false,requires_review:false,server_time:1793747000000,
 expiration_time:1793750400000,...overrides,
});
function snap(change:Record<string,unknown>={},s:1|2|3|4=1):VerifiedCashierSnapshot {
  return {checkout:decodePublicCheckout(wire(s),'w52_root'),
    status:decodePublicStatus({trade_id:'w52_root',status:s},'w52_root'),
    reconciliation:decodeReconciliation(relation({...change,status:s}),'w52_root'),
    receivedAt:1};
}
describe('W52 authoritative payment reconciliation',()=>{
 it('does not mark local provider paid state as a confirmed purchase',()=>{
   expect(evaluateCashier(snap({provider:'okpay',provider_status:'paid',requires_review:true}),1793747100000).kind).toBe('review');
   expect(evaluateCashier(snap({provider:'okpay',provider_status:'paid'}),1793747100000).kind).toBe('review');
   expect(evaluateCashier(snap({provider:'on_chain',provider_status:'',paid_confirmed:false},2),1793747100000).kind).toBe('review');
   expect(evaluateCashier(snap({root_status:2,paid_confirmed:true},2),1793747100000).kind).toBe('paid');
 });
 it('blocks stale parent address when an active child is selected',()=>{
   const state=evaluateCashier(snap({related_trade_id:'w52_child',related_status:1}),1793747100000);
   expect(state).toEqual({kind:'selected-child',childTradeId:'w52_child'});
   expect(evaluateCashier(snap({related_trade_id:'w52_child',related_status:2,requires_review:true}),1793747100000).kind).toBe('review');
 });
 it('does not invent server status=3 when the deadline elapsed',()=>{
   expect(evaluateCashier(snap(),1793750400001).kind).toBe('elapsed');
   expect(evaluateCashier(snap({},3),1793747100000).kind).toBe('expired');
 });
 it('never accepts client-side optimism or a mismatched status',()=>{
   const s=snap();s.status.status=2;
   expect(evaluateCashier(s,1793747100000).kind).toBe('unverified');
   expect(()=>decodeReconciliation(relation({paid_confirmed:true}),'w52_root')).toThrow();
   expect(()=>decodeReconciliation(relation({server_time:1793747000}),'w52_root')).toThrow();
   expect(()=>decodeReconciliation(relation({related_trade_id:'../bad',related_status:2}),'w52_root')).toThrow();
 });
 it('distinguishes code 10010 (conflict) from 10013 and missing order',()=>{
   expect(classifyStatusReadError(new ApiError('CONTAINS_SECRET',409,10010))).toBe('conflict');
   expect(classifyStatusReadError(new ApiError('missing',400,10008))).toBe('missing');
   expect(classifyStatusReadError(new ApiError('not wait pay',400,10013))).toBe('offline');
 });
 it('caps recovery polling backoff; only terminal server statuses stop polling',()=>{
   expect([0,1,2,3,9].map(nextCashierPollDelay)).toEqual([5000,10000,20000,40000,60000]);
   expect(stopCashierPolling({kind:'paid'})).toBe(true);
   expect(stopCashierPolling({kind:'expired'})).toBe(true);
   expect(stopCashierPolling({kind:'elapsed'})).toBe(false);
   expect(stopCashierPolling({kind:'review'})).toBe(false);
 });
 it('GET-only reads and no admin authorization or provider mutation',async()=>{
   const ok=(data:unknown)=>new Response(JSON.stringify({status_code:200,message:'OK',data}),{status:200});
   const f=vi.fn<typeof fetch>()
     .mockImplementationOnce(async()=>ok(wire()))
     .mockImplementationOnce(async()=>ok({trade_id:'w52_root',status:1}))
     .mockImplementationOnce(async()=>ok(relation()));
   vi.stubGlobal('fetch',f);
   const data=await reconciliationApi.snapshot('w52_root');
   expect(data.reconciliation.status).toBe(1);
   expect(f.mock.calls.map(([path,opts])=>[path,opts?.method??'GET',opts?.cache])).toEqual([
     ['/pay/checkout-counter-resp/w52_root','GET','no-store'],
     ['/pay/check-status/w52_root','GET','no-store'],
     ['/pay/reconcile-status/w52_root','GET','no-store'],
   ]);
   expect(f.mock.calls.every(([,o])=>!new Headers(o?.headers).has('Authorization'))).toBe(true);
 });
});
