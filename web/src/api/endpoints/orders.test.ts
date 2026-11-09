import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  DEFAULT_ORDER_FILTERS, readOrderFilters, orderQuery, orderPageUrl,
  asLocalDateTime, fromLocalDateTime, decodeOrderList, ordersApi,
} from './orders';

afterEach(() => vi.unstubAllGlobals());

describe('admin order filter contract', () => {
  it('reads original route pageSize while emitting backend page_size', () => {
    const f = readOrderFilters('?page=3&pageSize=25&status=2&token=usdt&network=TRON&keyword=%20abc%20');
    expect(f).toMatchObject({ page: 3, pageSize: 25, status: 2, token: 'USDT', network: 'tron', keyword: 'abc' });
    const q = new URLSearchParams(orderQuery(f));
    expect(q.get('page')).toBe('3');
    expect(q.get('page_size')).toBe('25');
    expect(q.get('pageSize')).toBeNull();
    expect(orderPageUrl(f)).toContain('pageSize=25');
    expect(orderPageUrl(f)).not.toContain('page_size');
  });
  it('caps the list limit at the Go maximum and rejects invalid filters', () => {
    const f = readOrderFilters('?page=-2&pageSize=10000&status=0&start_at=foo&end_at=-3');
    expect(f.page).toBe(1);
    expect(f.pageSize).toBe(200);
    expect(f.status).toBeUndefined();
    expect(f.startAt).toBeUndefined();
    expect(f.endAt).toBeUndefined();
  });
  it('filters dates in Unix seconds, not milliseconds', () => {
    const s = fromLocalDateTime('2026-11-10T10:15');
    expect(s).toBeDefined();
    expect(s).toBeLessThan(100000000000);
    expect(fromLocalDateTime(asLocalDateTime(s))).toBe(s);
    expect(readOrderFilters('?start_at=1794305700000').startAt).toBeUndefined();
  });
  it('checks paginated responses without confusing arrays', () => {
    expect(decodeOrderList({ list: [], total: 0, page: 1, page_size: 10 }).total).toBe(0);
    expect(() => decodeOrderList([] as never)).toThrow('Invalid orders pagination');
  });
});

describe('orders read-only network API', () => {
  it('fetches filtered list and detail exclusively with GET', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: 200, message: 'success',
        request_id: '', data: { list: [], total: 0, page: 1, page_size: 10 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status_code: 200, message: 'success',
        request_id: '', data: { trade_id: 'trade#1' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const rows = await ordersApi.list({ ...DEFAULT_ORDER_FILTERS, status: 2 });
    const detail = await ordersApi.detail('trade#1');
    expect(rows.list).toHaveLength(0);
    expect(detail.trade_id).toBe('trade#1');
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
      '/admin/api/v1/orders?status=2&page=1&page_size=10',
      '/admin/api/v1/orders/trade%231',
    ]);
    expect(fetchImpl.mock.calls.every(call => !call[1]?.method || call[1].method === 'GET')).toBe(true);
  });
  it('downloads raw CSV with same filters but no pagination', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('trade_id,order_id\na,b\n', { status: 200, headers: { 'content-type': 'text/csv' } }));
    vi.stubGlobal('fetch', fetchImpl);
    const blob = await ordersApi.exportCsv({ ...DEFAULT_ORDER_FILTERS, network: 'TRON', keyword: 'a & b', page: 7 });
    expect(await blob.text()).toContain('trade_id,order_id');
    expect(fetchImpl.mock.calls[0][0]).toBe('/admin/api/v1/orders/export?keyword=a+%26+b&network=tron');
  });
});
