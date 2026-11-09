import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const reply = (data: unknown, status = 200) => new Response(
  JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } },
);

describe('Go envelope API client', () => {
  it('unwraps success and attaches Bearer only to admin requests', async () => {
    const adminFetch = vi.fn<typeof fetch>().mockResolvedValue(reply({
      status_code: 200, message: 'success', data: [1, 2], request_id: 'r1',
    }));
    const admin = createApiClient({ basePath: '/admin/api/v1', getToken: () => 'secret', fetchImpl: adminFetch });
    expect(await admin.json<number[]>('/orders')).toEqual([1, 2]);
    const [, init] = adminFetch.mock.calls[0];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');

    const publicFetch = vi.fn<typeof fetch>().mockResolvedValue(reply({
      status_code: 200, message: 'success', data: {}, request_id: 'r2',
    }));
    const payments = createApiClient({ basePath: '', fetchImpl: publicFetch });
    await payments.json('/payments/gmpay/v1/config');
    expect(new Headers(publicFetch.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });

  it('preserves HTTP and business errors separately', async () => {
    const failed = vi.fn<typeof fetch>().mockResolvedValue(reply({
      status_code: 10010, message: 'order status already changed', data: null, request_id: 'req7',
    }, 400));
    const api = createApiClient({ basePath: '/pay', fetchImpl: failed });
    await expect(api.json('/check-status/t1')).rejects.toMatchObject({
      status: 400, businessCode: 10010, requestId: 'req7',
    } satisfies Partial<ApiError>);
  });

  it('clears admin auth on 401, not on a public business 400', async () => {
    const clear = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(reply({
      status_code: 10027, message: 'unauthorized', data: null, request_id: '',
    }, 401));
    const api = createApiClient({ basePath: '/admin/api/v1', onUnauthorized: clear, fetchImpl });
    await expect(api.json('/orders')).rejects.toBeInstanceOf(ApiError);
    expect(clear).toHaveBeenCalledOnce();
  });

  it('downloads CSV as Blob rather than JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('trade_id,amount\na,1\n', {
      status: 200, headers: { 'content-type': 'text/csv' },
    }));
    const api = createApiClient({ basePath: '/admin/api/v1', fetchImpl });
    const csv = await api.download('/orders/export');
    expect(await csv.text()).toContain('trade_id,amount');
  });

  it('rejects a successful HTML fallback when expecting CSV', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>SPA</html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    }));
    const client = createApiClient({ basePath: '/admin/api/v1', fetchImpl });
    await expect(client.download('/orders/export')).rejects.toMatchObject({
      status: 200, name: 'ApiError',
    });
  });

  it('blocks absolute/protocol-relative paths', async () => {
    const api = createApiClient({ basePath: '' });
    await expect(api.json('https://example.test')).rejects.toThrow(TypeError);
    await expect(api.json('//example.test')).rejects.toThrow(TypeError);
  });
});
