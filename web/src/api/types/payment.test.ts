import { describe, expect, it } from 'vitest';
import {
  parseUnixMilliseconds, parseUnixSeconds, unixSecondsToMilliseconds,
  decodeCheckoutCounter, decodeCreateTransaction,
} from './payment';

describe('Go payment timestamps differ per endpoint', () => {
  it('accepts checkout times in milliseconds only', () => {
    const stamp = parseUnixMilliseconds(1793750400000);
    expect(stamp).toBe(1793750400000);
    expect(() => parseUnixMilliseconds(1793750400)).toThrow(RangeError);
  });
  it('accepts create transaction expiration in seconds only', () => {
    const stamp = parseUnixSeconds(1793750400);
    expect(unixSecondsToMilliseconds(stamp)).toBe(1793750400000);
    expect(() => parseUnixSeconds(1793750400000)).toThrow(RangeError);
  });
  it('does not mix checkout and create DTOs', () => {
    expect(() => decodeCheckoutCounter({
      trade_id: 't', amount: 1, actual_amount: 1, token: 'USDT',
      currency: 'CNY', receive_address: 'test', network: 'tron', status: 1,
      payment_type: 'gmpay', expiration_time: 1793750400,
      redirect_url: '', payment_url: '', created_at: 1793750000,
      server_time: 1793750000, is_selected: true,
    })).toThrow(RangeError);
    expect(decodeCreateTransaction({
      trade_id: 't', order_id: 'o', amount: 1, currency: 'CNY',
      actual_amount: 1, receive_address: 'test', token: 'USDT', status: 1,
      expiration_time: 1793750400, payment_url: '',
    }).expiration_time).toBe(1793750400);
  });
});
