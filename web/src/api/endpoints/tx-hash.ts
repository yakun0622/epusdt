import {ApiError,paymentClient} from '../../api';
import {evaluateCashier,reconciliationApi,type VerifiedCashierSnapshot} from './reconciliation';

export type HashProblem='invalid'|'changed'|'used'|'not-waiting'|'failed'|'provider'|'unknown';
export class HashVerificationError extends Error {
  constructor(public readonly problem:HashProblem) {
    super('Transaction verification was not confirmed');
    this.name='HashVerificationError';
  }
}
export function validHashInput(value:string):boolean {
  const normalized=value.trim();
  // TON references may contain colons and base64 characters; don't guess
  // network-specific hash syntax on the client. Go's chain verifier decides.
  return normalized.length>0&&normalized.length<=256&&
    /^[A-Za-z0-9:/+=_-]+$/.test(normalized);
}
export function classifyHashFailure(cause:unknown):HashProblem {
  if(cause instanceof HashVerificationError)return cause.problem;
  if(!(cause instanceof ApiError))return 'unknown';
  switch(cause.businessCode){
    case 10007:return 'used';
    case 10008:
    case 10010:return 'changed'; // 10010 is a conflict, NEVER expired.
    case 10013:return 'not-waiting';
    case 10009:return 'invalid';
    case 10038:return 'failed';
    case 10039:return 'provider';
    default:return 'unknown';
  }
}
/** The read-only verifier is available only on the actual pending on-chain
 * payment target. A parent with a child, provider, conflict, or expired
 * payment deadline is ineligible even when it still has SQL status=1. */
export function canVerifyTxHash(s:VerifiedCashierSnapshot|null,serverNow:number|null):boolean {
  if(!s||serverNow===null||!Number.isFinite(serverNow))return false;
  const r=s.reconciliation,c=s.checkout;
  const state=evaluateCashier(s,serverNow);
  if(state.kind!=='payment'||state.payment!=='onchain'||r.provider!=='on_chain'||
    r.requiresReview||r.paidConfirmed||r.status!==1||r.rootStatus!==1||
    c.statusAtCreation!==1||s.status.status!==1||c.hasHostedPaymentLink||
    serverNow>=r.expirationTime)return false;
  if(r.rootTradeId===r.tradeId) {
    return !r.relatedTradeId;
  }
  return r.relatedTradeId===r.rootTradeId && r.relatedStatus===1;
}
export function sameHashTarget(a:VerifiedCashierSnapshot,b:VerifiedCashierSnapshot):boolean {
  const x=a.checkout,y=b.checkout,r=a.reconciliation,s=b.reconciliation;
  return x.tradeId===y.tradeId && x.statusAtCreation===y.statusAtCreation &&
    x.createdAt===y.createdAt && x.expirationTime===y.expirationTime &&
    x.amount===y.amount && x.actualAmount===y.actualAmount &&
    x.token===y.token && x.network===y.network &&
    x.receiveAddress===y.receiveAddress && x.currency===y.currency &&
    x.paymentType===y.paymentType && x.isSelected===y.isSelected &&
    a.status.status===b.status.status && r.rootTradeId===s.rootTradeId &&
    r.rootStatus===s.rootStatus && r.relatedTradeId===s.relatedTradeId &&
    r.relatedStatus===s.relatedStatus && r.provider===s.provider &&
    r.providerStatus===s.providerStatus && r.requiresReview===s.requiresReview &&
    r.paidConfirmed===s.paidConfirmed;
}
export interface HashVerificationEvidence {
  tradeId:string;
  transactionId:string;
  /** Evidence verified against RPC; does not mean the order was settled. */
  verification:'verified';
}
function decodeVerification(raw:unknown,expected:string):HashVerificationEvidence {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw new HashVerificationError('unknown');
  const v=raw as Record<string,unknown>;
  if(v.trade_id!==expected||v.verification!=='verified'||
    typeof v.block_transaction_id!=='string'||!validHashInput(v.block_transaction_id))
    throw new HashVerificationError('unknown');
  // Whitelist only verification evidence, not any claimed "paid" field.
  return {tradeId:expected,verification:'verified',transactionId:v.block_transaction_id};
}
export const txHashApi={
  verifyOnce:async(initial:VerifiedCashierSnapshot,raw:string,serverNow:number):
    Promise<HashVerificationEvidence>=>{
    if(!validHashInput(raw))throw new HashVerificationError('invalid');
    if(!canVerifyTxHash(initial,serverNow))throw new HashVerificationError('changed');
    let fresh:VerifiedCashierSnapshot;
    try {fresh=await reconciliationApi.snapshot(initial.checkout.tradeId);}
    catch(cause){throw new HashVerificationError(classifyHashFailure(cause));}
    if(!sameHashTarget(initial,fresh)||!canVerifyTxHash(fresh,fresh.reconciliation.serverTime))
      throw new HashVerificationError('changed');
    // Exactly one explicit POST after three fresh GETs. No mutation request,
    // retry, admin auth, checkout redirection or optimistic paid state.
    try {
      const rawResult=await paymentClient.json<unknown>(
        '/pay/verify-tx-hash/'+encodeURIComponent(initial.checkout.tradeId),{
          method:'POST',cache:'no-store',
          headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
          body:JSON.stringify({block_transaction_id:raw.trim()}),
        });
      return decodeVerification(rawResult,initial.checkout.tradeId);
    } catch(cause) {
      throw new HashVerificationError(classifyHashFailure(cause));
    }
  },
};
