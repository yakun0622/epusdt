import { adminClient } from '../../api';
import type { Order, OrderList } from '../types/admin';
import type { OrderStatus } from '../types/common';

export interface OrderFilters {
  page: number;
  pageSize: number;
  keyword: string;
  network: string;
  token: string;
  address: string;
  status?: OrderStatus;
  startAt?: number; // Unix seconds, NOT milliseconds.
  endAt?: number;   // Unix seconds, NOT milliseconds.
}

export const DEFAULT_ORDER_FILTERS: Readonly<OrderFilters> = {
  page: 1, pageSize: 10, keyword: '', network: '', token: '', address: '',
};
const statuses = new Set([1, 2, 3, 4]);
const validSeconds = (value: string | null): number | undefined => {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number < 1e11 ? number : undefined;
};
const positiveInt = (value: string | null, fallback: number, maximum: number): number => {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= 1 ? Math.min(num, maximum) : fallback;
};
export function readOrderFilters(search: string): OrderFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const maybeStatus = Number(params.get('status'));
  return {
    page: positiveInt(params.get('page'), 1, 100000),
    pageSize: positiveInt(params.get('pageSize') ?? params.get('page_size'), 10, 200),
    keyword: (params.get('keyword') ?? '').trim(),
    network: (params.get('network') ?? '').trim().toLowerCase(),
    token: (params.get('token') ?? '').trim().toUpperCase(),
    address: (params.get('address') ?? '').trim(),
    status: params.has('status') && statuses.has(maybeStatus) ? maybeStatus as OrderStatus : undefined,
    startAt: validSeconds(params.get('start_at')),
    endAt: validSeconds(params.get('end_at')),
  };
}
export function orderQuery(filters: OrderFilters, includePagination = true): string {
  const params = new URLSearchParams();
  if (filters.keyword.trim()) params.set('keyword', filters.keyword.trim());
  if (filters.network.trim()) params.set('network', filters.network.trim().toLowerCase());
  if (filters.token.trim()) params.set('token', filters.token.trim().toUpperCase());
  if (filters.address.trim()) params.set('address', filters.address.trim());
  if (filters.status !== undefined && statuses.has(filters.status)) params.set('status', String(filters.status));
  if (filters.startAt !== undefined) params.set('start_at', String(filters.startAt));
  if (filters.endAt !== undefined) params.set('end_at', String(filters.endAt));
  if (includePagination) {
    params.set('page', String(filters.page));
    params.set('page_size', String(filters.pageSize));
  }
  const encoded = params.toString();
  return encoded ? '?' + encoded : '';
}
export function orderPageUrl(filters: OrderFilters): string {
  const p = new URLSearchParams(orderQuery(filters));
  p.delete('page_size');
  p.set('pageSize', String(filters.pageSize));
  return '/orders?' + p.toString();
}
export function asLocalDateTime(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
    + 'T' + [pad(date.getHours()), pad(date.getMinutes())].join(':');
}
export function fromLocalDateTime(value: string): number | undefined {
  if (!value) return undefined;
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return undefined;
  const seconds = Math.floor(milliseconds / 1000);
  return seconds > 0 && seconds < 1e11 ? seconds : undefined;
}
export function decodeOrderList(value: OrderList): OrderList {
  if (!value || !Array.isArray(value.list) ||
      !Number.isSafeInteger(value.total) || value.total < 0 ||
      !Number.isInteger(value.page) || value.page < 1 ||
      !Number.isInteger(value.page_size) || value.page_size < 1) {
    throw new Error('Invalid orders pagination response');
  }
  return value;
}
const segment = (value: string) => {
  if (!value.trim()) throw new TypeError('trade_id is required');
  return encodeURIComponent(value);
};
export const ordersApi = {
  list: async (filters: OrderFilters, signal?: AbortSignal): Promise<OrderList> =>
    decodeOrderList(await adminClient.json<OrderList>('/orders' + orderQuery(filters), { signal })),
  detail: (tradeId: string, signal?: AbortSignal): Promise<Order> =>
    adminClient.json<Order>('/orders/' + segment(tradeId), { signal }),
  exportCsv: (filters: OrderFilters): Promise<Blob> =>
    adminClient.download('/orders/export' + orderQuery(filters, false)),
};
