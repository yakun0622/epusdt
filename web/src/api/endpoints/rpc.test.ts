import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeRpcNodes, publicEndpoint, rpcApi, validateRpcCreate, validateRpcUpdate } from './rpc';
afterEach(() => vi.unstubAllGlobals());
const row = {
  id: 4, network: 'ethereum', url: 'https://u:pw@node.example:8443/secret-token?api_key=query-secret',
  api_key: 'raw-api-secret', type: 'http', weight: 2, enabled: true,
  purpose: 'manual_verify', status: 'ok', last_latency_ms: 120, last_checked_at: '',
};
const ok = (data: unknown) => new Response(JSON.stringify({
  status_code: 200, message: 'success', data, request_id: '',
}), { status: 200 });
describe('W41 RPC credentials and status contracts', () => {
  it('redacts returned RPC key and tokenized URL before React state', () => {
    const rows = decodeRpcNodes([row]);
    expect(rows[0].endpoint).toBe('https://node.example:8443');
    expect(JSON.stringify(rows)).not.toContain('raw-api-secret');
    expect(JSON.stringify(rows)).not.toContain('query-secret');
    expect(JSON.stringify(rows)).not.toContain('secret-token');
    expect(JSON.stringify(rows)).not.toContain('u:pw');
    expect('api_key' in rows[0]).toBe(false);
    expect('url' in rows[0]).toBe(false);
    expect(publicEndpoint('not-valid')).toBe('[hidden endpoint]');
    expect(() => decodeRpcNodes([{ ...row, enabled: 2 }])).toThrow();
    expect(() => decodeRpcNodes([{ ...row, status: 2 }])).toThrow();
  });
  it('uses the Go RPC endpoints and boolean PATCH status', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => ok([row]));
    vi.stubGlobal('fetch', fetchImpl);
    await rpcApi.list('ethereum');
    await rpcApi.create({ network: 'ethereum', url: 'https://node.example/rpc?token=s3',
      type: 'http', weight: 1, api_key: 'do-not-log', enabled: true, purpose: 'general' });
    await rpcApi.update(4, 'http', { weight: 3, api_key: '', purpose: 'manual_verify' });
    await rpcApi.changeEnabled(4, false);
    await rpcApi.healthCheck(4).catch(() => { /* fake response is an array here */ });
    await rpcApi.remove(4);
    expect(fetchImpl.mock.calls.map(([path, opts]) => [path, opts?.method ?? 'GET'])).toEqual([
      ['/admin/api/v1/rpc-nodes?redact=1&network=ethereum', 'GET'],
      ['/admin/api/v1/rpc-nodes', 'POST'],
      ['/admin/api/v1/rpc-nodes/4', 'PATCH'],
      ['/admin/api/v1/rpc-nodes/4', 'PATCH'],
      ['/admin/api/v1/rpc-nodes/4/health-check', 'POST'],
      ['/admin/api/v1/rpc-nodes/4', 'DELETE'],
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[3][1]?.body))).toEqual({ enabled: false });
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
