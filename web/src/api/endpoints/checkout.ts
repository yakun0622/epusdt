import { paymentClient } from '../../api';
import { decodeCheckoutCounter, decodeCreateTransaction } from '../types/payment';
import type {
  CheckoutCounter, CheckoutStatus, PublicPaymentConfig,
  SwitchNetworkRequest, ManualPaymentRequest, ManualPaymentResponse,
  CreateTransactionRequest, CreateTransactionResponse,
} from '../types/payment';

const idSegment = (tradeId: string) => encodeURIComponent(tradeId);

export const checkoutApi = {
  get: async (tradeId: string): Promise<CheckoutCounter> =>
    decodeCheckoutCounter(await paymentClient.json<CheckoutCounter>('/pay/checkout-counter-resp/' + idSegment(tradeId))),
  checkStatus: (tradeId: string) =>
    paymentClient.json<CheckoutStatus>('/pay/check-status/' + idSegment(tradeId)),
  config: () => paymentClient.json<PublicPaymentConfig>('/payments/gmpay/v1/config'),
  switchNetwork: async (body: SwitchNetworkRequest): Promise<CheckoutCounter> =>
    decodeCheckoutCounter(await paymentClient.postJson<CheckoutCounter>('/pay/switch-network', body)),
  submitTxHash: (tradeId: string, body: ManualPaymentRequest) =>
    paymentClient.postJson<ManualPaymentResponse>('/pay/submit-tx-hash/' + idSegment(tradeId), body),
  create: async (body: CreateTransactionRequest): Promise<CreateTransactionResponse> =>
    decodeCreateTransaction(await paymentClient.postJson<CreateTransactionResponse>('/payments/gmpay/v1/order/create-transaction', body)),
};
