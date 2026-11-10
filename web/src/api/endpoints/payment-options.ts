import { paymentClient } from '../../api';

export interface PaymentOption {
  network: string;
  token: string;
  label: string;
  method: 'onchain' | 'okpay';
}
export interface PublicPaymentOptions {
  options: PaymentOption[];
  okpayEnabled: boolean;
}
const networkCode = /^[a-z][a-z0-9_-]{0,39}$/;
const tokenCode = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;
function object(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid public payment config');
  return value as Record<string,unknown>;
}
export function normalizePaymentChoice(network: string, token: string) {
  const normalizedNetwork = network.trim().toLowerCase();
  const normalizedToken = token.trim().toUpperCase();
  if (!networkCode.test(normalizedNetwork) || !tokenCode.test(normalizedToken))
    throw new TypeError('Invalid payment network or token');
  return { network: normalizedNetwork, token: normalizedToken };
}
export function decodePublicPaymentOptions(raw: unknown): PublicPaymentOptions {
  const value = object(raw);
  if (!Array.isArray(value.supported_assets) || value.supported_assets.length > 100)
    throw new TypeError('Invalid public supported_assets');
  const okpay = object(value.okpay);
  if (typeof okpay.enabled !== 'boolean' || !Array.isArray(okpay.allow_tokens) ||
      okpay.allow_tokens.length > 100)
    throw new TypeError('Invalid public OkPay capability');
  const options: PaymentOption[] = [];
  const seen = new Set<string>();
  const insert = (network:string, token:string, label:string, method:PaymentOption['method']) => {
    const choice = normalizePaymentChoice(network,token);
    if (choice.network === 'okpay' && method !== 'okpay')
      throw new TypeError('Reserved provider network in on-chain assets');
    const key = choice.network + ':' + choice.token;
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ ...choice, label, method });
  };
  for (const entry of value.supported_assets) {
    const asset = object(entry);
    if (typeof asset.network !== 'string' || typeof asset.display_name !== 'string' ||
        !Array.isArray(asset.tokens) || asset.tokens.length > 100)
      throw new TypeError('Invalid on-chain payment asset');
    const displayName = asset.display_name.trim() || asset.network;
    for (const token of asset.tokens) {
      if (typeof token !== 'string') throw new TypeError('Invalid token');
      insert(asset.network,token,displayName,'onchain');
    }
  }
  if (okpay.enabled) {
    for (const token of okpay.allow_tokens) {
      if (typeof token !== 'string') throw new TypeError('Invalid provider token');
      insert('okpay',token,'OkPay','okpay');
    }
  }
  return { options, okpayEnabled:okpay.enabled };
}
export function isSupportedPaymentOption(
  options: PublicPaymentOptions, network: string, token: string,
): boolean {
  try {
    const value = normalizePaymentChoice(network,token);
    return options.options.some(row => row.network===value.network && row.token===value.token);
  } catch { return false; }
}
export const paymentOptionsApi = {
  list: async (signal?: AbortSignal): Promise<PublicPaymentOptions> =>
    decodePublicPaymentOptions(await paymentClient.json<unknown>(
      '/payments/gmpay/v1/config', { signal, cache:'no-store' })),
};
