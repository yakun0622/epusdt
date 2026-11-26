import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeRpcNodes, publicEndpoint, rpcApi, validateRpcCreate, validateRpcUpdate } from './rpc';
afterEach(() => vi.unstubAllGlobals());
const row = {
  id: 4, network: 'ethereum', url: 'https://u:pw@node.example:8443/secret-token?api_key=query-secret',
  api_key: 'raw-api-secret', protocol: 'http', weight: 2, enabled: true,
  purpose: 'manual_verify', status: 'ok', latency_ms: 120, checked_at_ms: 1700000000000,
};
const scannerResponse = (data: unknown, status = 200) => new Response(
  data === null ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } },
);
describe('W41 RPC credentials and status contracts', () => {
  it('redacts returned RPC key and tokenized URL before React state', () => {
    const rows = decodeRpcNodes([row]);
    expect(rows[0]).toMatchObject({ endpoint: 'https://node.example:8443', type: 'http', last_latency_ms: 120 });
    expect(rows[0].last_checked_at).toBe('2023-11-14T22:13:20.000Z');
    expect(JSON.stringify(rows)).not.toContain('raw-api-secret');
    expect(JSON.stringify(rows)).not.toContain('query-secret');
    expect(JSON.stringify(rows)).not.toContain('secret-token');
    expect(JSON.stringify(rows)).not.toContain('u:pw');
    expect('api_key' in rows[0]).toBe(false);
    expect('url' in rows[0]).toBe(false);
    expect(publicEndpoint('not-valid')).toBe('[hidden endpoint]');
    expect(() => decodeRpcNodes([{ ...row, enabled: 2 }])).toThrow();
    expect(() => decodeRpcNodes([{ ...row, status: 2 }])).toThrow();
    expect(decodeRpcNodes([{ ...row, status: '', purpose: '' }])[0]).toMatchObject({status: 'unknown', purpose: 'general'});
  });
  it('uses the authenticated ChainScanner API and translates credential clearing', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_path, opts) => {
      if (opts?.method === 'DELETE') return scannerResponse(null, 204);
      return scannerResponse(!opts?.method ? [row] : row, opts?.method === 'POST' ? 201 : 200);
    });
    vi.stubGlobal('fetch', fetchImpl);
    await rpcApi.list('ethereum');
    await rpcApi.create({ network: 'ethereum', url: 'https://node.example/rpc?token=s3',
      type: 'http', weight: 1, api_key: 'do-not-log', enabled: true, purpose: 'general' });
    await rpcApi.update(4, 'http', { weight: 3, api_key: '', purpose: 'manual_verify' });
    await rpcApi.update(4, 'http', { clear_api_key: true });
    await rpcApi.changeEnabled(4, false);
    expect(await rpcApi.healthCheck(4)).toEqual({ status: 'ok', last_latency_ms: 120 });
    await rpcApi.remove(4);
    expect(fetchImpl.mock.calls.map(([path, opts]) => [path, opts?.method ?? 'GET'])).toEqual([
      ['/admin/api/v1/chainscanner/admin/nodes?redact=1&network=ethereum', 'GET'],
      ['/admin/api/v1/chainscanner/admin/nodes?redact=1', 'POST'],
      ['/admin/api/v1/chainscanner/admin/nodes/4?redact=1', 'PATCH'],
      ['/admin/api/v1/chainscanner/admin/nodes/4?redact=1', 'PATCH'],
      ['/admin/api/v1/chainscanner/admin/nodes/4?redact=1', 'PATCH'],
      ['/admin/api/v1/chainscanner/admin/nodes/4/test?redact=1', 'POST'],
      ['/admin/api/v1/chainscanner/admin/nodes/4?redact=1', 'DELETE'],
    ]);
    const body = (i: number) => JSON.parse(String(fetchImpl.mock.calls[i][1]?.body));
    expect(body(1)).toMatchObject({ protocol: 'http' });
    expect(body(1)).not.toHaveProperty('type');
    expect(body(2)).not.toHaveProperty('api_key');
    expect(body(3)).toEqual({ api_key: '' });
    expect(body(4)).toEqual({ enabled: false });
  });
  it('requires scheme by type and treats omitted credentials differently from clear', () => {
    expect(() => validateRpcCreate({ network: 'tron', type: 'ws', url: 'https://rpc.example',
      weight: 1, api_key: '', enabled: true, purpose: 'both' })).toThrow('WebSocket');
    expect(() => validateRpcCreate({ network: 'tron', type: 'http', url: 'https://user:pwd@rpc.example',
      weight: 1, api_key: '', enabled: true, purpose: 'both' })).toThrow('Invalid RPC URL');
    expect(validateRpcUpdate({ weight: 1 }, 'http')).toEqual({ weight: 1 });
    expect(validateRpcUpdate({ api_key: '' }, 'http')).toEqual({});
    expect(validateRpcUpdate({ clear_api_key: true }, 'http')).toEqual({ clear_api_key: true });
    expect(() => validateRpcUpdate({ api_key: 'replacement', clear_api_key: true }, 'http')).toThrow();
    expect(() => validateRpcUpdate({ url: 'ws://rpc.example' }, 'http')).toThrow('HTTP RPC');
  });
});
