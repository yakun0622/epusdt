import {ApiError,paymentClient} from '../../api';
import {parseUnixMilliseconds,type UnixMilliseconds} from '../types/payment';
import {checkoutApi,validTradeId,verifyCheckout,type CheckoutStatusView,
  type CheckoutVerification,type CheckoutView} from './checkout';

export type ProviderState='none'|'creating'|'pending'|'paid'|'failed'|'expired'|'missing'|'unknown';
export interface CashierReconciliation {
  tradeId:string;
  status:1|2|3|4;
  rootTradeId:string;
  rootStatus:1|2|3|4;
  relatedTradeId:string|null;
  relatedStatus:1|2|3|4|null;
  provider:'on_chain'|'okpay';
  providerStatus:ProviderState;
  paidConfirmed:boolean;
  requiresReview:boolean;
  serverTime:UnixMilliseconds;
  expirationTime:UnixMilliseconds;
}
export interface VerifiedCashierSnapshot {
  checkout:CheckoutView;
  status:CheckoutStatusView;
  reconciliation:CashierReconciliation;
  receivedAt:number;
}
export type CashierState = CheckoutVerification |
 {kind:'review'} | {kind:'elapsed'} | {kind:'selected-child';childTradeId:string};

const statuses=new Set([1,2,3,4]);
const providerStates=new Set<ProviderState>([
  'none','creating','pending','paid','failed','expired','missing','unknown']);
function status(value:unknown):1|2|3|4 {
  if(!statuses.has(value as number))throw new TypeError('Invalid server payment status');
  return value as 1|2|3|4;
}
export function decodeReconciliation(raw:unknown,expected:string):CashierReconciliation {
  if(!validTradeId(expected)||!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new TypeError('Invalid reconciliation response');
  const v=raw as Record<string,unknown>;
  if(v.trade_id!==expected||typeof v.root_trade_id!=='string'||
    !validTradeId(v.root_trade_id))throw new TypeError('Invalid linked root');
  const related=v.related_trade_id===''?null:v.related_trade_id;
  if(related!==null&&(typeof related!=='string'||!validTradeId(related)||
    related===expected))throw new TypeError('Invalid related order');
  const providerStatus = v.provider_status==='' && v.provider==='on_chain'
    ? 'none' : v.provider_status;
  if(typeof v.paid_confirmed!=='boolean'||typeof v.requires_review!=='boolean'||
    (v.provider!=='on_chain'&&v.provider!=='okpay')||
    typeof providerStatus!=='string'||
    !providerStates.has(providerStatus as ProviderState))
    throw new TypeError('Invalid reconciliation flags');
  const relatedStatus=related===null?null:status(v.related_status);
  const serverTime=parseUnixMilliseconds(v.server_time as number);
  const expirationTime=parseUnixMilliseconds(v.expiration_time as number);
  if(v.paid_confirmed&&v.status!==2)throw new TypeError('Untrusted paid flag');
  if(v.paid_confirmed&&v.root_status!==2)throw new TypeError('Unconfirmed root order');
  if(v.paid_confirmed&&v.requires_review) {
    // Never claim paid while the source ledger explicitly contradicts itself.
    return {tradeId:expected,status:status(v.status),rootTradeId:v.root_trade_id,
      rootStatus:status(v.root_status),relatedTradeId:related,relatedStatus,
      provider:v.provider,providerStatus:providerStatus as ProviderState,
      paidConfirmed:false,requiresReview:true,serverTime,expirationTime};
  }
  return {tradeId:expected,status:status(v.status),rootTradeId:v.root_trade_id,
    rootStatus:status(v.root_status),relatedTradeId:related,relatedStatus,
    provider:v.provider,providerStatus:providerStatus as ProviderState,
    paidConfirmed:v.paid_confirmed,requiresReview:v.requires_review,
    serverTime,expirationTime};
}
export function evaluateCashier(
  snapshot:VerifiedCashierSnapshot|null,serverNow:number|null,
):CashierState {
  if(!snapshot||serverNow===null||!Number.isFinite(serverNow))
    return {kind:'unverified'};
  const {checkout,status:latest,reconciliation:r}=snapshot;
  if(checkout.tradeId!==latest.tradeId||checkout.tradeId!==r.tradeId||
    latest.status!==r.status || checkout.expirationTime!==r.expirationTime)
    return {kind:'unverified'};
  if(r.requiresReview)return {kind:'review'};
  if(r.status===2)return r.paidConfirmed?{kind:'paid'}:{kind:'review'};
  if(r.rootStatus===2 && r.status!==2)return {kind:'review'};
  if(r.status===3)return {kind:'expired'};
  // A passed deadline does not itself transition the SQL order to status=3.
  if(serverNow>=r.expirationTime)return {kind:'elapsed'};
  if(r.status===4)return {kind:'choose'};
  if(r.rootTradeId===r.tradeId && r.relatedTradeId && r.relatedStatus===1)
    return {kind:'selected-child',childTradeId:r.relatedTradeId};
  // Callback ledger state is not a live provider API query. "paid" alone
  // never overrides SQL order status; creating/failed/missing needs review.
  if(r.provider==='okpay'){
    if(r.providerStatus==='paid' || !['pending'].includes(r.providerStatus))
      return {kind:'review'};
    // Even an OkPay row with network=tron must never expose the OKPAY
    // marker or any blockchain-looking address as a transfer destination.
    return checkout.hasHostedPaymentLink
      ? {kind:'payment',payment:'hosted',address:null}
      : {kind:'awaiting-details'};
  }
  return verifyCheckout(checkout,latest,serverNow);
}
/** Code 10010 means status conflict and requires a READ; never expiry. */
export function classifyStatusReadError(error:unknown):'conflict'|'missing'|'offline' {
  if(error instanceof ApiError) {
    if(error.businessCode===10010)return 'conflict';
    if(error.businessCode===10008)return 'missing';
  }
  return 'offline';
}
export function nextCashierPollDelay(failures:number):number {
  if(!Number.isFinite(failures)||failures<0)return 15000;
  return Math.min(60000,15000*Math.pow(2,Math.min(Math.floor(failures),2)));
}
export function stopCashierPolling(state:CashierState):boolean {
  return state.kind==='paid'||state.kind==='expired';
}
export const reconciliationApi={
  read:async(tradeId:string,signal?:AbortSignal):Promise<CashierReconciliation>=>{
    if(!validTradeId(tradeId))throw new TypeError('Invalid trade ID');
    return decodeReconciliation(await paymentClient.json<unknown>(
      '/pay/reconcile-status/'+encodeURIComponent(tradeId),
      {signal,cache:'no-store'}),tradeId);
  },
  snapshot:async(tradeId:string,signal?:AbortSignal):Promise<VerifiedCashierSnapshot>=>{
    const [checkout,status,reconciliation]=await Promise.all([
      checkoutApi.details(tradeId,signal),
      checkoutApi.status(tradeId,signal),
      reconciliationApi.read(tradeId,signal),
    ]);
    if(reconciliation.tradeId!==checkout.tradeId ||
      reconciliation.status!==status.status ||
      reconciliation.expirationTime!==checkout.expirationTime) {
      throw new ApiError('Checkout changed during verification',409,10010);
    }
    return {checkout,status,reconciliation,receivedAt:performance.now()};
  },
};
