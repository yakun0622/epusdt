import { paymentClient } from '../../api';
import { parseUnixMilliseconds, type UnixMilliseconds } from '../types/payment';
import type { OrderStatus } from '../types/common';

export interface CheckoutView {
  tradeId:string; amount:number; actualAmount:number; token:string; currency:string;
  receiveAddress:string; network:string; paymentType:'gmpay'|'epay';
  statusAtCreation:OrderStatus; createdAt:UnixMilliseconds; expirationTime:UnixMilliseconds;
  serverTime:UnixMilliseconds; isSelected:boolean; canSwitch:boolean; hasHostedPaymentLink:boolean;
}
export interface CheckoutStatusView { tradeId:string; status:OrderStatus }
export type CheckoutVerification =
  | {kind:'unverified'} | {kind:'choose'} | {kind:'paid'} | {kind:'expired'}
  | {kind:'payment';payment:'onchain'|'hosted';address:string|null}
  | {kind:'awaiting-details'};
function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw new TypeError('Invalid payment response');
  return value as Record<string,unknown>;
}
function field(row:Record<string,unknown>,key:string):string {
  if(typeof row[key]!=='string')throw new TypeError('Invalid string field: '+key);
  return row[key] as string;
}
function amount(row:Record<string,unknown>,key:string):number {
  const value=row[key];
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)
    throw new TypeError('Invalid amount: '+key);
  return value;
}
function status(row:Record<string,unknown>):OrderStatus {
  if(row.status!==1&&row.status!==2&&row.status!==3&&row.status!==4)
    throw new TypeError('Invalid order status');
  return row.status;
}
export function validTradeId(id:string):boolean {return /^[a-zA-Z0-9_-]{1,128}$/.test(id);}
function requireTradeId(id:string) {
  if(!validTradeId(id))throw new TypeError('Invalid trade ID');
}
export function decodePublicCheckout(raw:unknown,expected:string):CheckoutView {
  requireTradeId(expected);
  const row=object(raw),tradeId=field(row,'trade_id');
  if(tradeId!==expected)throw new TypeError('Mismatched checkout trade ID');
  const paymentType=field(row,'payment_type');
  if(paymentType!=='gmpay'&&paymentType!=='epay')
    throw new TypeError('Unsupported payment type');
  if(typeof row.is_selected!=='boolean')throw new TypeError('Invalid selected flag');
  if(row.can_switch!==undefined&&typeof row.can_switch!=='boolean')
    throw new TypeError('Invalid switch capability');
  const createdAt=parseUnixMilliseconds(row.created_at as number);
  const expirationTime=parseUnixMilliseconds(row.expiration_time as number);
  const serverTime=parseUnixMilliseconds(row.server_time as number);
  const currency=field(row,'currency');
  if(expirationTime<createdAt||!currency.trim())throw new TypeError('Invalid checkout time or currency');
  // Explicitly project only safe fields. Never retain token-bearing URLs
  // (payment_url/redirect_url), unknown keys or internal metadata.
  return {tradeId,amount:amount(row,'amount'),actualAmount:amount(row,'actual_amount'),
    currency,token:field(row,'token'),network:field(row,'network'),
    receiveAddress:field(row,'receive_address'),
    paymentType,statusAtCreation:status(row),createdAt,expirationTime,serverTime,
    isSelected:row.is_selected,canSwitch:row.can_switch===true,hasHostedPaymentLink:
      typeof row.payment_url==='string'&&row.payment_url.length>0};
}
export function decodePublicStatus(raw:unknown,expected:string):CheckoutStatusView {
  requireTradeId(expected);
  const row=object(raw);
  if(field(row,'trade_id')!==expected)throw new TypeError('Mismatched status trade ID');
  return {tradeId:expected,status:status(row)};
}
export function verifyCheckout(
  checkout:CheckoutView|null, latest:CheckoutStatusView|null, serverNow:number|null,
):CheckoutVerification {
  if(!checkout||!latest||checkout.tradeId!==latest.tradeId||serverNow===null||!Number.isFinite(serverNow))
    return {kind:'unverified'};
  if(latest.status===2)return {kind:'paid'};
  if(latest.status===3)return {kind:'expired'};
  // A status=4 placeholder may not be transitioned by the server promptly;
  // never encourage a new selection beyond the order expiry timestamp.
  if(serverNow>=checkout.expirationTime)return {kind:'expired'};
  if(latest.status===4)return {kind:'choose'};
  if(checkout.statusAtCreation!==1)return {kind:'awaiting-details'};
  // OkPay stores network=tron and receive_address=OKPAY. The provider
  // hosted link takes precedence over any on-chain looking fields.
  if(checkout.hasHostedPaymentLink)return {kind:'payment',payment:'hosted',address:null};
  if(checkout.receiveAddress.trim().toUpperCase()==='OKPAY')
    return {kind:'awaiting-details'};
  if(checkout.token.trim()&&checkout.network.trim()&&checkout.receiveAddress.trim()&&checkout.actualAmount>0)
    return {kind:'payment',payment:'onchain',address:checkout.receiveAddress};
  return {kind:'awaiting-details'};
}
export const checkoutApi={
  details:async(id:string,signal?:AbortSignal):Promise<CheckoutView>=>{
    requireTradeId(id);
    return decodePublicCheckout(await paymentClient.json<unknown>(
      '/pay/checkout-counter-resp/'+encodeURIComponent(id),{signal,cache:'no-store'}),id);
  },
  status:async(id:string,signal?:AbortSignal):Promise<CheckoutStatusView>=>{
    requireTradeId(id);
    return decodePublicStatus(await paymentClient.json<unknown>(
      '/pay/check-status/'+encodeURIComponent(id),{signal,cache:'no-store'}),id);
  },
};
