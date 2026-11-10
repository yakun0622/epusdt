import { ApiError, paymentClient } from '../../api';
import { checkoutApi, decodePublicCheckout, validTradeId,
  type CheckoutStatusView, type CheckoutView } from './checkout';
import { isSupportedPaymentOption, normalizePaymentChoice, type PublicPaymentOptions } from './payment-options';

export type SwitchProblem = 'stale'|'limit'|'suborder'|'expired'|'unsupported'|'provider'|'unknown';
export class SwitchPaymentError extends Error {
  constructor(public readonly problem:SwitchProblem) {
    super('Payment selection could not be confirmed');
    this.name = 'SwitchPaymentError';
  }
}
export interface VerifiedBeforeSwitch {
  checkout: CheckoutView;
  status: CheckoutStatusView;
}
export interface SwitchResult {
  tradeId:string;
  method:'onchain'|'okpay';
  hasHostedPaymentLink:boolean;
  changedTradeId:boolean;
}
export function classifySwitchFailure(error: unknown): SwitchProblem {
  if (!(error instanceof ApiError)) return 'unknown';
  switch (error.businessCode) {
    case 10010: return 'stale';
    case 10011: return 'limit';
    case 10012: return 'suborder';
    case 10013: return 'expired';
    case 10014:
    case 10016: return 'unsupported';
    case 10017:
    case 10018:
    case 10019:
    case 10042: return 'provider';
    default: return 'unknown';
  }
}
/** The server must approve each transition. A previous status=1/4 is NOT
 * an authorization to switch after a concurrent payment or another tab. */
export function allowPaymentSelection(
  snapshot: VerifiedBeforeSwitch,
  options: PublicPaymentOptions,
  network: string, token: string, serverNow: number,
): 'same'|'switch' {
  const choice = normalizePaymentChoice(network,token);
  const { checkout, status } = snapshot;
  if (!validTradeId(checkout.tradeId) || checkout.tradeId !== status.tradeId ||
      !Number.isFinite(serverNow) || serverNow >= checkout.expirationTime ||
      (status.status !== 1 && status.status !== 4))
    throw new SwitchPaymentError('expired');
  if (status.status !== checkout.statusAtCreation)
    throw new SwitchPaymentError('stale');
  if (!checkout.canSwitch) throw new SwitchPaymentError('suborder');
  if (!isSupportedPaymentOption(options,choice.network,choice.token))
    throw new SwitchPaymentError('unsupported');
  // Provider orders store network=tron internally and do not represent
  // a usable on-chain address. Avoid the Go same-network short circuit,
  // which would incorrectly reuse the provider parent for a chain request.
  if (checkout.hasHostedPaymentLink ||
      checkout.receiveAddress.trim().toUpperCase()==='OKPAY')
    throw new SwitchPaymentError('provider');
  // Already selected on an on-chain parent: avoid needless POST. A provider's
  // actual network can be tron, so do not confuse it with on-chain selection.
  if (status.status === 1 && checkout.isSelected &&
      checkout.token.toUpperCase() === choice.token &&
      checkout.network.toLowerCase() === choice.network &&
      !checkout.hasHostedPaymentLink && choice.network !== 'okpay')
    return 'same';
  return 'switch';
}
export function unchangedBeforeSwitch(
  initial: VerifiedBeforeSwitch, fresh: VerifiedBeforeSwitch,
): boolean {
  const a=initial.checkout,b=fresh.checkout;
  return a.tradeId===b.tradeId && a.createdAt===b.createdAt &&
    a.statusAtCreation===b.statusAtCreation &&
    initial.status.status===fresh.status.status &&
    a.token===b.token && a.network===b.network &&
    a.currency===b.currency && a.actualAmount===b.actualAmount &&
    a.receiveAddress===b.receiveAddress && a.isSelected===b.isSelected &&
    a.canSwitch===b.canSwitch;
}
/** Whitelist and validate a switch response. Never keep provider payment_url. */
export function decodeSwitchResult(
  raw:unknown, parent:CheckoutView, network:string, token:string,
):SwitchResult {
  if (!raw || typeof raw!=='object' || Array.isArray(raw))
    throw new SwitchPaymentError('unknown');
  const row=raw as Record<string,unknown>;
  if (typeof row.trade_id!=='string' || !validTradeId(row.trade_id))
    throw new SwitchPaymentError('unknown');
  let checkout:CheckoutView;
  try { checkout=decodePublicCheckout(row,row.trade_id); }
  catch { throw new SwitchPaymentError('unknown'); }
  const choice=normalizePaymentChoice(network,token);
  if (checkout.statusAtCreation!==1 || checkout.token.toUpperCase()!==choice.token ||
      (parent.statusAtCreation===4 && checkout.tradeId!==parent.tradeId))
    throw new SwitchPaymentError('unknown');
  if (choice.network==='okpay') {
    // OkPay returns actual chain network='tron'; the presence of a hosted link
    // is the only safe indication that the external provider order exists.
    if (!checkout.hasHostedPaymentLink) throw new SwitchPaymentError('unknown');
  } else if (checkout.network.toLowerCase()!==choice.network ||
      !checkout.receiveAddress.trim() || checkout.actualAmount<=0 ||
      checkout.hasHostedPaymentLink) {
    throw new SwitchPaymentError('unknown');
  }
  return {tradeId:checkout.tradeId,
    method:choice.network==='okpay'?'okpay':'onchain',
    hasHostedPaymentLink:checkout.hasHostedPaymentLink,
    changedTradeId:checkout.tradeId!==parent.tradeId};
}
export const paymentSwitchApi = {
  /** Read-only fresh preflight; never sends a POST on its own. */
  preflight: async(tradeId:string):Promise<VerifiedBeforeSwitch> => {
    const [checkout,status]=await Promise.all([
      checkoutApi.details(tradeId),checkoutApi.status(tradeId),
    ]);
    return {checkout,status};
  },
  /** A single explicit operation; callers must not automatically retry on
   * transport errors: the server may have committed a child/provider order. */
  switchOnce: async(parent:CheckoutView,network:string,token:string):Promise<SwitchResult> => {
    const choice=normalizePaymentChoice(network,token);
    try {
      const raw=await paymentClient.json<unknown>('/pay/switch-network',{
        method:'POST',cache:'no-store',
        headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
        body:JSON.stringify({
          trade_id:parent.tradeId,token:choice.token,network:choice.network,
        }),
      });
      return decodeSwitchResult(raw,parent,choice.network,choice.token);
    } catch (error) {
      // Never surface raw backend errors or tokenized payment URLs.
      if (error instanceof SwitchPaymentError) throw error;
      throw new SwitchPaymentError(classifySwitchFailure(error));
    }
  },
};
