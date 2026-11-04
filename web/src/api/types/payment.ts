import type { OrderStatus } from './common';

/** Epoch seconds returned by create-transaction; different from cashier timestamps. */
export type UnixSeconds = number & { readonly __unit: 'unix-seconds' };
/** Epoch milliseconds returned by checkout-counter-resp/switch-network. */
export type UnixMilliseconds = number & { readonly __unit: 'unix-milliseconds' };

export function parseUnixSeconds(value: number): UnixSeconds {
  if (!Number.isSafeInteger(value) || value < 1e9 || value >= 1e11)
    throw new RangeError('Expected a Unix timestamp in seconds');
  return value as UnixSeconds;
}
export function parseUnixMilliseconds(value: number): UnixMilliseconds {
  if (!Number.isSafeInteger(value) || value < 1e12 || value >= 1e14)
    throw new RangeError('Expected a Unix timestamp in milliseconds');
  return value as UnixMilliseconds;
}
export function unixSecondsToMilliseconds(value: UnixSeconds): UnixMilliseconds {
  return (value * 1000) as UnixMilliseconds;
}
export interface CheckoutCounter {
  trade_id: string; amount: number; actual_amount: number;
  token: string; currency: string; receive_address: string;
  network: string; status: OrderStatus; payment_type: 'gmpay'|'epay';
  expiration_time: UnixMilliseconds; redirect_url: string;
  payment_url: string; created_at: UnixMilliseconds;
  server_time: UnixMilliseconds; is_selected: boolean;
}
export interface CheckoutStatus { trade_id: string; status: OrderStatus }
export interface SwitchNetworkRequest { trade_id: string; token: string; network: string }
export interface ManualPaymentRequest { block_transaction_id: string }
export interface ManualPaymentResponse {
  trade_id: string; status: 1|2|3; block_transaction_id: string;
}
export interface CreateTransactionRequest {
  order_id: string; currency: string; amount: number;
  notify_url: string; signature: string;
  token?: string; network?: string; redirect_url?: string; name?: string;
  payment_type?: string;
}
export interface CreateTransactionResponse {
  trade_id: string; order_id: string; amount: number; currency: string;
  actual_amount: number; receive_address: string; token: string;
  status: OrderStatus; expiration_time: UnixSeconds; payment_url: string;
}
export interface PublicPaymentConfig {
  supported_assets: Array<{ network: string; display_name: string; tokens: string[] }>;
  site: {
    cashier_name: string; logo_url: string; website_title: string;
    support_link: string; background_color: string; background_image_url: string;
  };
  epay: { default_token: string; default_currency: string; default_network: string };
  okpay: { enabled: boolean; allow_tokens: string[] };
  version: string;
}
export interface AdminPaymentConfig extends Omit<PublicPaymentConfig, 'okpay'> {
  okpay: PublicPaymentConfig['okpay'] & {
    shop_id?: string; shop_token?: string; api_url?: string;
    callback_url?: string; return_url?: string; timeout_seconds?: number;
  };
}
/** Strict boundary parsing: Go struct comments incorrectly call these seconds. */
export function decodeCheckoutCounter(value: CheckoutCounter): CheckoutCounter {
  return {
    ...value,
    created_at: parseUnixMilliseconds(value.created_at),
    server_time: parseUnixMilliseconds(value.server_time),
    expiration_time: parseUnixMilliseconds(value.expiration_time),
  };
}
export function decodeCreateTransaction(value: CreateTransactionResponse): CreateTransactionResponse {
  return { ...value, expiration_time: parseUnixSeconds(value.expiration_time) };
}
