import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiKeysApi, decodeApiKeyList, parseApiKeyForm } from './api-keys';

afterEach(() => vi.unstubAllGlobals());
const raw = { id: 8, pid: '1008', name: 'merchant',
  status: 1, ip_whitelist: '', notify_url: '', call_count: 5, last_used_at: '',
  secret_key: 'never-show-in-list' };
const envelope = (data: unknown) => new Response(JSON.stringify({
  status_code: 200, message: 'OK', data, request_id: '',
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('W35 API key contract', () => {
  it('enforces the actual unpaginated list contract, without leaking extra secret fields', () => {
    const list = decodeApiKeyList([raw]);
    expect(list).toHaveLength(1);
    expect(list[0].pid).toBe('1008');
    expect('secret_key' in list[0]).toBe(false);
    expect(JSON.stringify(list)).not.toContain('never-show-in-list');
    expect(() => decodeApiKeyList({ list: [raw] })).toThrow('array');
    expect(() => decodeApiKeyList([{ ...raw, id: -1 }])).toThrow('Invalid');
  });
  it('validates names, allows clearing fields, and rejects URL credentials / javascript schemes', () => {
    expect(parseApiKeyForm({ name: ' Merchant ', ip_whitelist: ' ', notify_url: '' }))
      .toEqual({ name: 'Merchant', ip_whitelist: '', notify_url: '' });
    expect(() => parseApiKeyForm({ name: '', ip_whitelist: '', notify_url: '' })).toThrow();
    expect(() => parseApiKeyForm({ name: 'x', ip_whitelist: '', notify_url: 'javascript:alert(1)' })).toThrow();
    expect(() => parseApiKeyForm({ name: 'x', ip_whitelist: '', notify_url: 'https://u:p@example.com/' })).toThrow();
  });
  it('calls the precise create/edit/status/stats/delete endpoints and methods', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      envelope({ id: 9, pid: '1009', name: 'New', secret_key: 'sensitive' }));
    vi.stubGlobal('fetch', fetchImpl);
    const form = { name: 'New', ip_whitelist: '', notify_url: '' };
    expect((await apiKeysApi.create(form)).pid).toBe('1009');
    await apiKeysApi.update(9, form);
    await apiKeysApi.changeStatus(9, 2);
    await apiKeysApi.stats(9);
    await apiKeysApi.remove(9);
    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options?.method ?? 'GET'])).toEqual([
      ['/admin/api/v1/api-keys', 'POST'],
      ['/admin/api/v1/api-keys/9', 'PATCH'],
      ['/admin/api/v1/api-keys/9/status', 'POST'],
      ['/admin/api/v1/api-keys/9/stats', 'GET'],
      ['/admin/api/v1/api-keys/9', 'DELETE'],
    ]);
    expect(fetchImpl.mock.calls[0][1]?.cache).toBe('no-store');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual(form);
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toEqual({ status: 2 });
  });
  it('requires explicit secret GET or rotation and requests no-store for both', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => envelope({ secret_key: 'sensitive' }));
    vi.stubGlobal('fetch', fetchImpl);
    expect(await apiKeysApi.viewSecret(9)).toBe('sensitive');
    expect(await apiKeysApi.rotateSecret(9)).toBe('sensitive');
    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options?.method ?? 'GET', options?.cache])).toEqual([
      ['/admin/api/v1/api-keys/9/secret', 'GET', 'no-store'],
      ['/admin/api/v1/api-keys/9/rotate-secret', 'POST', 'no-store'],
    ]);
    for (const [, opts] of fetchImpl.mock.calls) {
      const headers = new Headers(opts?.headers);
      expect(headers.get('Cache-Control')).toBe('no-store');
    }
  });
  it('rejects malformed secret responses without writing storage', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => envelope({}));
    vi.stubGlobal('fetch', fetchImpl);
    await expect(apiKeysApi.viewSecret(9)).rejects.toThrow('Missing API key secret');
    expect(() => apiKeysApi.remove(0)).toThrow('Invalid API key ID');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
