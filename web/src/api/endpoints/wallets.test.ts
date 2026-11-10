import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WALLET_FILTERS, decodeWalletList, normalizeImportAddresses,
  parseWalletFilters, reconcileBatchResults, walletPageUrl, walletQuery, walletsApi,
} from './wallets';

afterEach(() => vi.unstubAllGlobals());
function ok(data: unknown) {
  return new Response(JSON.stringify({ status_code: 200, message: 'success', data, request_id: '' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}
const wallet = {
  id: 8, network: 'tron', address: 'T-test', remark: '', source: 'import',
  status: 1, order_count: 4, created_at: '', updated_at: '',
};

describe('W33 wallet list and filters', () => {
  it('uses the Go array response and exact network/status/keyword fields', () => {
    expect(parseWalletFilters('?network=TRON&status=2&keyword=%20abc%20')).toEqual({
      network: 'tron', status: 2, keyword: 'abc',
    });
    expect(walletPageUrl(parseWalletFilters('?network=tron&status=2'))).toBe('/addresses?network=tron&status=2');
    expect(walletQuery(DEFAULT_WALLET_FILTERS)).toBe('');
    expect(parseWalletFilters('?status=5').status).toBeUndefined();
    expect(decodeWalletList([wallet])).toHaveLength(1);
    expect(() => decodeWalletList({ list: [wallet], total: 1 })).toThrow('Invalid wallet list');
  });
  it('calls GET /wallets with server-side filters', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok([wallet]));
    vi.stubGlobal('fetch', fetchImpl);
    expect(await walletsApi.list({ network: 'TRON', status: 1, keyword: 'T test' })).toEqual([wallet]);
    expect(fetchImpl.mock.calls[0][0]).toBe('/admin/api/v1/wallets?network=tron&status=1&keyword=T+test');
    expect(fetchImpl.mock.calls[0][1]?.method).toBeUndefined();
  });
});

describe('W34 wallet mutations', () => {
  it('uses exact Go endpoints and bodies for create, edit, toggle, delete', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok(wallet));
    vi.stubGlobal('fetch', fetchImpl);
    await walletsApi.create({ network: 'TRON', address: ' T-test ', remark: ' new ' });
    await walletsApi.editRemark(8, '');
    await walletsApi.changeStatus(8, 2);
    await walletsApi.remove(8);
    const calls = fetchImpl.mock.calls;
    expect(calls.map(c => [c[0], c[1]?.method])).toEqual([
      ['/admin/api/v1/wallets', 'POST'],
      ['/admin/api/v1/wallets/8', 'PATCH'],
      ['/admin/api/v1/wallets/8/status', 'POST'],
      ['/admin/api/v1/wallets/8', 'DELETE'],
    ]);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ network: 'tron', address: 'T-test', remark: 'new' });
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ remark: '' });
    expect(JSON.parse(String(calls[2][1]?.body))).toEqual({ status: 2 });
  });
  it('retains duplicates, whitespace is stripped, and identifies partial success under HTTP 200', async () => {
    expect(normalizeImportAddresses(' T1 \r\n\nT1\n T2\n')).toEqual(['T1', 'T1', 'T2']);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(ok([
      { address: 'T1', ok: true },
      { address: 'T1', ok: false, error_code: 10001, error: 'wallet address already exists' },
      { address: 'T2', ok: false, error_code: 10003, error: 'invalid address' },
    ]));
    vi.stubGlobal('fetch', fetchImpl);
    const result = await walletsApi.batchImport('tron', ['T1', 'T1', 'T2']);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      network: 'tron', addresses: ['T1', 'T1', 'T2'],
    });
    expect(result).toMatchObject({
      successCount: 1, failureCount: 2, allSucceeded: false, failedAddresses: ['T1', 'T2'],
    });
    expect(result.rows[1]).toMatchObject({ error_code: 10001 });
  });
  it('never marks missing/mismatched batch entries as successes', () => {
    const result = reconcileBatchResults(['A', 'B', 'C'], [
      { address: 'A', ok: true }, { address: 'X', ok: true },
    ]);
    expect(result).toMatchObject({
      successCount: 1, failureCount: 2, allSucceeded: false, failedAddresses: ['B', 'C'],
    });
    expect(result.rows[1].ok).toBe(false);
    expect(result.rows[2].ok).toBe(false);
    expect(() => reconcileBatchResults(['A'], { list: [] })).toThrow('Invalid');
  });
});
